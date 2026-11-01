// The weekly Versus league (docs/44): trophies won and lost in matches you play yourself, groups of 20 ranked from
// Monday to Sunday (UTC), rewards at the end of the week, and the bots that fill the empty places. The server keeps the
// standings and checks each result (migration 0082); these are the rules both sides follow, and the bots' teams.
import { isLegendary } from './breeding'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { gmaxFormsOf, megaFormsOf } from './forms'
import { GIFT_CURRENT } from './gifts'
import { gemOf, type VersusPowers } from './powers'
import { effectiveStats } from './progression'
import { createRng, type Rng } from './rng'
import { typeMultiplier } from './typechart'
import {
  POKE_TYPES,
  type GameData,
  type Gift,
  type PokeType,
  type PowerKind,
  type SaveData,
  type VersusLeagueConfig,
} from './types'
import { VERSUS_LEVEL, VERSUS_TEAM_SIZE, versusUnlocked, type VersusMon } from './versus'

export const VERSUS_LEAGUE_DEFAULTS: VersusLeagueConfig = {
  access: 'off',
  trophies: [3, 6, 10],
  safeBelow: 100,
  groupSize: 20,
  groupFill: 16,
  botsPerDay: 5,
  botDays: [3, 4, 5],
  range: 0.15,
  rangeMin: 30,
  minWinSeconds: 5,
  secondsPerMove: 0.2,
  botTiers: [0, 100, 250, 500],
  botTargets: [20, 250],
  goldPerTrophy: 1,
  rewards: [
    { upTo: 1, raidBalls: 5, rareCandies: 10 },
    { upTo: 2, raidBalls: 2, rareCandies: 5 },
    { upTo: 3, raidBalls: 1, rareCandies: 3 },
    { upTo: 5, raidBalls: 0, rareCandies: 3 },
    { upTo: 10, raidBalls: 0, rareCandies: 1 },
  ],
}

export const RAID_BALL = 'raid-ball'
export const RARE_CANDY = 'rare-candy'

/** The admin's row over the defaults: a key the row lacks keeps its default. */
export const leagueConfig = (data: GameData): VersusLeagueConfig => ({
  ...VERSUS_LEAGUE_DEFAULTS,
  ...(data.config.versusLeague ?? {}),
})

/** The admin's switch (docs/15 §20). Off: Versus as it was (every team, two boards, fights on auto). */
export const versusLeagueOn = (data: GameData): boolean => eventOpenTo(data.config.versusLeague?.access, data)

/** The global board's switch (docs/44 §8): every player of every group this week, for the glory. Only with the league. */
export const versusGlobalOn = (data: GameData): boolean =>
  versusLeagueOn(data) && eventOpenTo(data.config.versusLeague?.globalAccess, data)

/** The league is this save's Versus: switched on, in the main game (Extreme mode keeps Versus as it was). */
export const versusLeagueFor = (save: SaveData, data: GameData): boolean =>
  versusLeagueOn(data) && !isExtreme(save)

/** Its rules card is due on the Versus page (and its notice on Home): the league is on, Versus open, not read yet. */
export const versusLeagueRulesDue = (save: SaveData, data: GameData): boolean =>
  versusLeagueFor(save, data) && !save.versusLeagueRulesSeen && versusUnlocked(save, data)

// ---------------------------------------------------------------- trophies

/** How a match ended for the player: won, lost, or left before the end (a leave is the heaviest loss). */
export type LeagueOutcome = 'won' | 'lost' | 'left'

/** Trophies for a win with this many Pokémon left standing (0 for none). */
export const winTrophies = (left: number, cfg: VersusLeagueConfig): number =>
  left >= 1 ? (cfg.trophies[Math.min(left, cfg.trophies.length) - 1] ?? 0) : 0

/**
 * What a match does to the player's trophies: a win gives by their Pokémon left, a loss takes by the opponent's, a
 * leave takes the most. Under `safeBelow` (counted before the match), nothing is taken.
 */
export function trophyChange(
  outcome: LeagueOutcome,
  standing: { left: number; foeLeft: number },
  before: number,
  cfg: VersusLeagueConfig,
): number {
  if (outcome === 'won') return winTrophies(standing.left, cfg)
  if (before < cfg.safeBelow) return 0
  return -(outcome === 'left' ? winTrophies(VERSUS_TEAM_SIZE, cfg) : winTrophies(standing.foeLeft, cfg))
}

/** The trophies opponents are offered within, around yours. */
export function opponentRange(trophies: number, cfg: VersusLeagueConfig): [number, number] {
  const r = Math.max(cfg.rangeMin, Math.round(trophies * cfg.range))
  return [Math.max(0, trophies - r), trophies + r]
}

/** A win the server refuses as too fast to have been played (the result, not the player, is the suspect). */
export const winTooFast = (seconds: number, moves: number, cfg: VersusLeagueConfig): boolean =>
  seconds < Math.max(cfg.minWinSeconds, moves * cfg.secondsPerMove)

// ---------------------------------------------------------------- the week

const DAY = 86_400_000

/** The league's week holding `ms`: from Monday 00:00 UTC. */
export function weekStartOf(ms: number): number {
  const day = Math.floor(ms / DAY)
  // 1970-01-01 was a Thursday: Monday is 3 days later.
  const sinceMonday = (((day - 4) % 7) + 7) % 7
  return (day - sinceMonday) * DAY
}

/** When that week ends: the next Monday 00:00 UTC. */
export const weekEndOf = (ms: number): number => weekStartOf(ms) + 7 * DAY

/** The week as the server names it: its Monday, "2026-10-26". */
export const weekId = (ms: number): string => new Date(weekStartOf(ms)).toISOString().slice(0, 10)

/**
 * How many groups the week opens with: last week's players, grown or shrunk as last Sunday's daily players compare to
 * the Sunday before, `groupFill` to a group. No league last week: everyone with a Versus team.
 */
export function leagueGroupCount(
  stats: { lastWeekPlayers: number; lastSunday: number; sundayBefore: number; teams: number },
  cfg: VersusLeagueConfig,
): number {
  const trend = stats.lastSunday > 0 && stats.sundayBefore > 0 ? stats.lastSunday / stats.sundayBefore : 1
  const expected = stats.lastWeekPlayers > 0 ? stats.lastWeekPlayers * trend : stats.teams
  return Math.max(1, Math.ceil(expected / Math.max(1, cfg.groupFill)))
}

// ---------------------------------------------------------------- the ranking and the rewards

/** Ranked by trophies; tied players share a rank (1, 2, 2, 4), and so share its reward. */
export function rankLeague<T extends { trophies: number; name: string }>(
  rows: readonly T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.trophies - a.trophies || a.name.localeCompare(b.name))
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || sorted[i - 1]!.trophies !== r.trophies) rank = i + 1
    return { ...r, rank }
  })
}

/** The Raid Balls and Rare Candies a rank wins (none past the last band). */
export function leagueReward(
  rank: number,
  cfg: VersusLeagueConfig,
): { raidBalls: number; rareCandies: number } {
  const band = [...cfg.rewards].sort((a, b) => a.upTo - b.upTo).find((b) => rank >= 1 && rank <= b.upTo)
  return { raidBalls: band?.raidBalls ?? 0, rareCandies: band?.rareCandies ?? 0 }
}

/**
 * The week's gifts for a final rank and trophies: ₽ (a trophy each), and the rank's Raid Balls and Rare Candies, all to
 * the region played when the gift is opened. The server sends the same (versus_league_close_week).
 */
export function leagueGifts(rank: number, trophies: number, cfg: VersusLeagueConfig): Gift[] {
  const gold = Math.min(999_999, Math.max(0, Math.round(trophies * cfg.goldPerTrophy)))
  const { raidBalls, rareCandies } = leagueReward(rank, cfg)
  return [
    ...(gold > 0 ? [{ kind: 'gold' as const, amount: gold, region: GIFT_CURRENT }] : []),
    ...(raidBalls > 0
      ? [{ kind: 'item' as const, key: RAID_BALL, qty: raidBalls, region: GIFT_CURRENT }]
      : []),
    ...(rareCandies > 0
      ? [{ kind: 'item' as const, key: RARE_CANDY, qty: rareCandies, region: GIFT_CURRENT }]
      : []),
  ]
}

// ---------------------------------------------------------------- the bots' teams

/** How strong a bot is: its tier (0 to 3) for these trophies. */
export function botTierOf(trophies: number, cfg: VersusLeagueConfig): number {
  let tier = 0
  cfg.botTiers.forEach((from, i) => {
    if (trophies >= from) tier = i
  })
  return Math.min(3, tier)
}

/**
 * Where a seated bot's trophies are headed by Sunday night, for a roll in [0, 1): between `botTargets`' two ends, the
 * roll squared so most bots sit low and few high, as players do. It never looks at the group's players: a group with a
 * player far ahead gets the same bots as any other (the user's rule, 2026-11-01). The server's
 * `versus_league_bot_target` is the same sum.
 */
export function botTargetOf(roll: number, cfg: VersusLeagueConfig): number {
  const [lo, hi] = cfg.botTargets
  const low = Math.max(0, Math.min(lo, hi))
  const r = Math.min(1, Math.max(0, roll))
  return Math.round(low + (Math.max(lo, hi) - low) * r * r)
}

const typesOf = (data: GameData, dex: number): PokeType[] => {
  const s = data.species[dex]
  return s ? (s.type2 ? [s.type1, s.type2] : [s.type1]) : []
}

/**
 * How strong a species fights at Lv.50, for picking bots: its HP, its dice (a typed die more than a plain one) and its
 * rerolls. A ranking, not a prediction.
 */
export function versusPower(data: GameData, dex: number): number {
  const s = data.species[dex]
  if (!s) return 0
  const st = effectiveStats(s, VERSUS_LEVEL, data)
  const typed = st.dice.filter((d) => d !== 'base').length
  return Math.sqrt(st.maxHp) * (st.dice.length + typed * 0.5) * (1 + st.rerolls * 0.2)
}

/** Species a bot can field: fully evolved, in its own form or a regional one (a Mega or a Gigantamax is a power). */
function fieldable(data: GameData): number[] {
  return Object.values(data.species)
    .filter((s) => (!s.form || s.form.kind === 'regional') && !s.evolutions?.length)
    .map((s) => s.dex)
}

/** Each tier's share of the strength ranking (0 = weakest, 1 = strongest) and whether legendaries come. */
const TIER_POOL: { lo: number; hi: number; legends: boolean; spread: number }[] = [
  { lo: 0.35, hi: 0.75, legends: false, spread: 0.6 },
  { lo: 0.6, hi: 0.93, legends: false, spread: 0.35 },
  { lo: 0.8, hi: 1, legends: false, spread: 0.2 },
  { lo: 0.85, hi: 1, legends: true, spread: 0.1 },
]

/** How many single types a team's types hit super effectively: its coverage, the bots' measure of a good team. */
export function teamCoverage(data: GameData, dexes: readonly number[]): number {
  const attacking = [...new Set(dexes.flatMap((d) => typesOf(data, d)))]
  return POKE_TYPES.filter((def) => attacking.some((a) => typeMultiplier(data.typeChart, a, [def]) > 1))
    .length
}

/**
 * A bot's team for a tier: three Pokémon from the tier's share of the strength ranking, picked one after the other for
 * the coverage they add (the stronger the tier, the more it insists on it), with as many battle powers as the tier
 * (0 to 3, each power needing a Pokémon that can take it). The same `rng` gives the same team.
 */
export function buildBotTeam(
  data: GameData,
  tier: number,
  rng: Rng,
): { team: VersusMon[]; powers: VersusPowers } {
  const t = TIER_POOL[Math.max(0, Math.min(3, tier))]!
  const all = fieldable(data)
    .map((dex) => ({ dex, power: versusPower(data, dex), legend: isLegendary(data, dex) }))
    .sort((a, b) => a.power - b.power)
  const at = (q: number) => Math.min(all.length - 1, Math.max(0, Math.floor(q * all.length)))
  const pool = all.slice(at(t.lo), at(t.hi) + 1).filter((c) => t.legends || !c.legend)
  const wide = all.slice(at(Math.max(0, t.lo - 0.25))).filter((c) => t.legends || !c.legend)

  const kinds: PowerKind[] = (['mega', 'gmax', 'z'] as PowerKind[])
    .map((k) => ({ k, r: rng.next() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.k)
    .slice(0, Math.min(3, Math.max(0, tier)))
  const megaOf = (dex: number) => megaFormsOf(data, dex).find((f) => gemOf(data, f.dex))
  const gmaxOf = (dex: number) => gmaxFormsOf(data, dex)[0]

  const picks: number[] = []
  // A power that needs a Pokémon brings one first: the strongest of those that can take it, near the tier.
  const holder = (can: (dex: number) => unknown) => {
    const options = wide.filter((c) => can(c.dex) && !picks.includes(c.dex))
    if (!options.length) return null
    const top = options.slice(-Math.max(3, Math.ceil(options.length * t.spread)))
    return rng.pick(top).dex
  }
  let mega: number | null = null
  if (kinds.includes('mega')) {
    mega = holder(megaOf)
    if (mega) picks.push(mega)
  }
  if (kinds.includes('gmax') && !picks.some((d) => gmaxOf(d))) {
    const g = holder(gmaxOf)
    if (g) picks.push(g)
  }
  while (picks.length < VERSUS_TEAM_SIZE) {
    const options = pool.filter((c) => !picks.includes(c.dex))
    if (!options.length) break
    if (!picks.length) {
      picks.push(rng.pick(options).dex)
      continue
    }
    // The coverage each one would add, then its strength: the tier takes from the top of that list.
    const ranked = options
      .map((c) => ({
        dex: c.dex,
        gain: teamCoverage(data, [...picks, c.dex]),
        power: c.power,
        r: rng.next(),
      }))
      .sort((a, b) => b.gain - a.gain || b.power - a.power || a.r - b.r)
    const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * t.spread)))
    picks.push(rng.pick(top).dex)
  }
  // The strongest goes last, as an ace.
  const order = [...picks].sort((a, b) => versusPower(data, a) - versusPower(data, b))
  const gem = mega != null ? megaOf(mega) : undefined
  return {
    team: order.map((dex) => ({ dex, level: VERSUS_LEVEL, shiny: rng.next() < 0.04 })),
    powers: {
      gems: gem ? [gemOf(data, gem.dex)!.key] : [],
      gmax: kinds.includes('gmax') && order.some((d) => gmaxOf(d)),
      z: kinds.includes('z'),
    },
  }
}

// ---------------------------------------------------------------- the week's set

/**
 * The teams a set holds for each tier. The last tier (500 trophies and more) has twice the others (the user's ask,
 * 2026-10-30): its few players meet each other's bots all week, so they'd see the same teams most.
 */
export const BOT_TEAMS_PER_TIER: readonly number[] = [40, 40, 40, 80]

/** A team's number within a set, by tier: 1 to 40 for tier 0, 1001… for tier 1, 3001 to 3080 for tier 3. */
export const botTeamNumber = (tier: number, i: number): number => tier * 1000 + i + 1

/**
 * The seed of a week's team, from the week ("2026-10-26") and the team's number: every week draws new teams, and a
 * week always the same ones, whoever makes its set and however often.
 */
export function botTeamSeed(week: string, n: number): number {
  // FNV-1a over the week's text, then the number mixed in.
  let h = 0x811c9dc5
  for (let i = 0; i < week.length; i++) h = Math.imul(h ^ week.charCodeAt(i), 0x01000193)
  return (h ^ Math.imul(n, 0x9e3779b1)) >>> 0
}

export interface BotTeamRow {
  tier: number
  team: VersusMon[]
  powers: VersusPowers
}

/** Draws a team gets before the set takes it even though it holds the same three already. */
const BOT_TEAM_DRAWS = 30

/**
 * A week's bot teams (migration 0092 stores them): `BOT_TEAMS_PER_TIER` a tier, each from `buildBotTeam` on the week's
 * seed for it. The last tier picks from few species (some 30), so it draws the same three again and again: a team the
 * set holds already is drawn anew, so that its 80 teams are 80 different ones.
 */
export function weekBotTeams(data: GameData, week: string): BotTeamRow[] {
  const held = new Set<string>()
  const keyOf = (tier: number, team: VersusMon[]) =>
    `${tier}:${team
      .map((m) => m.dex)
      .sort((a, b) => a - b)
      .join(',')}`
  return BOT_TEAMS_PER_TIER.flatMap((count, tier) =>
    Array.from({ length: count }, (_, i) => {
      const n = botTeamNumber(tier, i)
      let drawn = buildBotTeam(data, tier, createRng(botTeamSeed(week, n)))
      for (let k = 1; k < BOT_TEAM_DRAWS && held.has(keyOf(tier, drawn.team)); k++)
        drawn = buildBotTeam(data, tier, createRng(botTeamSeed(week, n + k * 10_000)))
      held.add(keyOf(tier, drawn.team))
      return { tier, ...drawn }
    }),
  )
}
