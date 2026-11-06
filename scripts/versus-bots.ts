/**
 * pnpm versus-bots — the weekly Versus league's bots (docs/44).
 *
 * Writes the bots into supabase/migrations/0092_versus_bot_weeks.sql, between its BEGIN/END GENERATED BOTS lines (0082
 * held them first; its copy stays as it was):
 * - BOT_NAMES names, each with a classic trainer look (the free list every player can wear), so a bot reads like a
 *   player on the board;
 * - the built-in set of teams, BOT_TEAMS_PER_TIER for each of the four tiers, from the engine's buildBotTeam (good
 *   coverage, the tier's battle powers), on fixed seeds: a re-run writes the same rows unless the game data changed.
 *   Every week makes a set of its own (netlify/functions/versus-bots.mts), so this one only serves a week whose set
 *   isn't made yet.
 * tests/versus-league-sql.test.ts checks the file still holds what this writes. After a change to the species, their
 * forms or the gems, the next week's set has them already; run this then 0092 again to bring the built-in set along.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import {
  BOT_TEAMS_PER_TIER,
  botTeamNumber,
  buildBotTeam,
  compileGameData,
  createRng,
  type GameData,
} from '../src/engine'
import { AVATAR_GROUPS } from '../src/lib/avatars'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '0092_versus_bot_weeks.sql')
export const BEGIN = "-- BEGIN GENERATED BOTS (pnpm versus-bots: scripts/versus-bots.ts; don't edit by hand)"
export const END = '-- END GENERATED BOTS'

/**
 * First names from the game's ten languages and a few handles, as players type them (twelve characters at most, like
 * any trainer name). A bot's name is one of these, alone or with a number.
 */
const FIRST = [
  'Lucas',
  'Emma',
  'Noah',
  'Mia',
  'Leo',
  'Chloe',
  'Hugo',
  'Lina',
  'Nathan',
  'Jade',
  'Theo',
  'Louise',
  'Jules',
  'Alice',
  'Mateo',
  'Lucia',
  'Pablo',
  'Sofia',
  'Diego',
  'Martina',
  'Javi',
  'Elena',
  'Lukas',
  'Lena',
  'Finn',
  'Mila',
  'Jonas',
  'Hannah',
  'Paul',
  'Clara',
  'Luca',
  'Giulia',
  'Marco',
  'Chiara',
  'Matteo',
  'Sara',
  'Joao',
  'Beatriz',
  'Tiago',
  'Ines',
  'Gabriel',
  'Ana',
  'Rafael',
  'Julia',
  'Pedro',
  'Larissa',
  'Haruto',
  'Yui',
  'Sota',
  'Hina',
  'Ren',
  'Aoi',
  'Kaito',
  'Sakura',
  'Minjun',
  'Seoyeon',
  'Jiho',
  'Haeun',
  'Wei',
  'Xin',
  'Hao',
  'Mei',
  'Jun',
  'Lin',
  'Max',
  'Sam',
  'Alex',
  'Nico',
  'Eva',
  'Ben',
  'Zoe',
  'Tom',
  'Ella',
  'Jack',
  'Lily',
  'Oscar',
  'Ruby',
  'Adam',
  'Nina',
  'Ethan',
  'Maya',
  'Kenji',
  'Yuki',
  'Sora',
  'Riku',
  'Nora',
  'Axel',
  'Iris',
  'Elio',
  'Lou',
  'Tim',
  'Ava',
  'Kai',
  'Liv',
]
const HANDLES = [
  'PikaFan',
  'DragonTamer',
  'ShinyHunter',
  'Trainer',
  'AceTrainer',
  'DiceMaster',
  'Rocket',
  'Champion',
  'Gengar',
  'Eevee',
  'Lucario',
  'Mewtwo',
  'Snorlax',
  'Garchomp',
  'Charizard',
  'Blaziken',
  'Umbreon',
  'Sylveon',
  'Greninja',
  'Rayquaza',
  'Togepi',
  'Pichu',
  'Mimikyu',
  'Zoroark',
  'Kanto',
  'Johto',
  'Hoenn',
  'Sinnoh',
  'Unova',
  'Kalos',
]
export const BOT_NAMES = 400

/** The bots' names and looks, the same every run. */
export function botIdentities(): { name: string; avatar: string }[] {
  const rng = createRng(0x5eed_b075)
  const looks = AVATAR_GROUPS.flatMap((g) => g.avatars.map((a) => a.id))
  const out: { name: string; avatar: string }[] = []
  const seen = new Set<string>()
  while (out.length < BOT_NAMES) {
    const handle = rng.next() < 0.3
    const base = handle ? rng.pick(HANDLES) : rng.pick(FIRST)
    const style = rng.next()
    // Most names plain, some with a number or the year, a few in capitals or lower case, as players write them.
    let name =
      style < 0.45
        ? base
        : style < 0.75
          ? `${base}${rng.int(1, 99)}`
          : style < 0.85
            ? `${base}${rng.pick(['07', '09', '12', '2000', '2010', '99'])}`
            : style < 0.93
              ? base.toLowerCase()
              : base.toUpperCase()
    name = name.slice(0, 12)
    if (seen.has(name)) continue
    seen.add(name)
    // The two characters are worn most, as they are by players.
    const avatar = rng.next() < 0.35 ? rng.pick(['red', 'green']) : rng.pick(looks)
    out.push({ name, avatar })
  }
  return out
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** The SQL between the BEGIN/END lines. */
export function botsSql(data: GameData): string {
  const names = botIdentities()
    .map((b, i) => `  (${i + 1}, ${q(b.name)}, ${q(b.avatar)})`)
    .join(',\n')
  const teams: string[] = []
  BOT_TEAMS_PER_TIER.forEach((count, tier) => {
    for (let i = 0; i < count; i++) {
      const id = botTeamNumber(tier, i)
      // 0082's seeds: the teams it wrote stay the same, and so do the bots seated with them.
      const { team, powers } = buildBotTeam(data, tier, createRng(0xb07 + id * 7919))
      teams.push(`  (${id}, ${tier}, ${q(JSON.stringify(team))}, ${q(JSON.stringify(powers))})`)
    }
  })
  return [
    BEGIN,
    'insert into versus_league_bots (id, name, avatar) values',
    `${names}`,
    'on conflict (id) do update set name = excluded.name, avatar = excluded.avatar;',
    'insert into versus_league_bot_teams (id, tier, team, powers) values',
    teams.join(',\n'),
    'on conflict (id) do update set tier = excluded.tier, team = excluded.team, powers = excluded.powers;',
    END,
  ].join('\n')
}

/** The migration with its bots block written anew. */
export function withBots(sql: string, data: GameData): string {
  const a = sql.indexOf(BEGIN)
  const b = sql.indexOf(END)
  if (a < 0 || b < a) throw new Error(`${path.basename(MIGRATION)}: the GENERATED BOTS lines are missing`)
  return sql.slice(0, a) + botsSql(data) + sql.slice(b + END.length)
}

async function main() {
  const data = compileGameData(BUNDLE)
  const sql = await readFile(MIGRATION, 'utf8')
  await writeFile(MIGRATION, withBots(sql, data))
  const teams = BOT_TEAMS_PER_TIER.reduce((a, b) => a + b, 0)
  console.log(`Wrote ${BOT_NAMES} bots and ${teams} teams into ${path.relative(ROOT, MIGRATION)}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main()
