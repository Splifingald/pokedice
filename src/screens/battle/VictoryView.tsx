// Result screens: victory (XP, level-ups, milestones, gold, catch, then evolutions), wipe and stalemate.
import { BottomDock } from '@/components/BottomDock'
import { AutoButton, PILOT_PICK_MS } from '@/components/AutoButton'
import { AnimatePresence, motion } from 'framer-motion'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  getInstance,
  isUnownLetter,
  latestOpenArea,
  portalLock,
  instanceStats,
  progressOf,
  rebattleEncounter,
  rebattleLineup,
  teamOf,
  wipeHeals,
  type AreaFoe,
  type DieType,
  type Milestone,
  type RunEvent,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { feelSound, type FeelSound } from '@/audio/feel'
import { CoinFlight } from '@/components/CoinFlight'
import { EvolutionQueue, type EvolutionShow } from '@/components/Evolution'
import { useCountUp } from '@/components/GoldPill'
import { Chip, NewTag } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { LeadPicker, defaultLead } from '@/components/LeadPicker'
import { ForfeitButton } from '@/components/ForfeitButton'
import { speciesTypes } from '@/components/TypeMatchups'
import { HpBar } from '@/components/HpBar'
import { useXpFill, XpBar } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'
import { DuelResult } from '@/components/AreaVersus'
import { UnownLetterCard } from '@/components/UnownDex'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { ItemSprite } from '@/components/ItemSprite'
import { dexNo, milestoneText, money, typeName } from '@/lib/format'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { usePace } from '@/lib/pace'
import { BadgeIcon } from '@/components/BadgeIcon'
import { Stamp } from './Stamp'
import { Confetti } from '@/components/Confetti'
import { useAutoLevel } from '@/store/autopilot'
import { useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
import { autoStepNow } from '@/store/autopilot'
import { serverNow } from '@/store/serverTime'
import {
  afterStalemate,
  afterWipe,
  continueAfterVictory,
  continueExploring,
  exploreFirstArea,
  resolveCatch,
  trainerHasNext,
} from '@/store/run'
import { leaveRebattle, startRebattle } from '@/store/rebattle'
import { Medal, tierName } from '@/screens/events/RebattlePage'
import { cx, shade, typeColor } from '@/theme/util'
import { WorldMythicalCard } from '@/screens/events/world'
import { TalentAfterWinCard, TalentFoundCard, talentName } from '@/components/Talent'

/** How long NEXT fills before it goes by itself, with Auto on. */
const ADVANCE_MS = 1800

/**
 * A result card over the battle: it rises from the bottom over the panel (on every screen, wild or trainer fight), the
 * stage still in view above it; the content scrolls and the `footer` (the action buttons) stays pinned at the bottom,
 * never below the fold.
 */
/** Inside the battle's panel (the rework): the result shows under the scene, in place of the dice, not over them. */
export const InlineCard = createContext(false)

export function Overlay({ children, footer, label }: { children: ReactNode; footer?: ReactNode; label?: string }) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const inline = useContext(InlineCard)
  if (inline)
    return (
      <section aria-label={label} className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1">{children}</div>
        <BottomDock>{footer}</BottomDock>
      </section>
    )
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-night/45 sm:px-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="pixel-panel flex max-h-[78dvh] w-full min-w-0 max-w-xl flex-col"
        initial={reduced ? false : { y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <div className="pixel-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-4">{children}</div>
        {footer && (
          <div className="shrink-0 bg-parchment p-2 shadow-[inset_0_2px_0_rgb(var(--c-edge))]" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

/** A card's sound once as it rises (docs/38): the victory and the defeat jingles. */
function useFeelOnce(name: FeelSound, when = true) {
  const played = useRef(false)
  useEffect(() => {
    if (!when || played.current) return
    played.current = true
    feelSound(name)
  }, [when, name])
}

/** How often the gold's count-up ticks (docs/38 F5b). */
const COIN_TICK_MS = 50

export function GoldCard({ amount, bonus = 0 }: { amount: number; bonus?: number }) {
  const { t } = useT()
  const { level, calm } = useMotion()
  // From 0 as it appears: it used to start at its total, so the count-up never ran (docs/38 B1).
  const n = useCountUp(amount, 800, 0)
  const counted = n >= amount
  const box = useRef<HTMLDivElement>(null)
  const tick = useRef(0)
  // A coin's tick as it counts and the till at the end, then its coins fly into the top bar's gold (not under calm, nor
  // with animations off; docs/38 F5b).
  useEffect(() => {
    if (n <= 0) return
    if (counted) {
      sfx('gold')
      return
    }
    const now = performance.now()
    if (now - tick.current < COIN_TICK_MS) return
    tick.current = now
    feelSound('coin.tick')
  }, [n, counted])
  const fly = counted && amount > 0 && level !== 'off' && !calm
  // Cash Flow (docs/20): what it added, as a share of the usual pay.
  const pct = bonus > 0 && amount > bonus ? Math.round((bonus / (amount - bonus)) * 100) : 0
  return (
    <div ref={box} className="flex items-center gap-2 text-3xl text-ink">
      <PixelIcon name="coin" size={28} /> +{money(n)}
      {pct > 0 && (
        <span role="img" aria-label={t('ui.live.chip.cash', { pct })} className="inline-flex">
          <Chip tone="green">{t('ui.live.pct', { pct })}</Chip>
        </span>
      )}
      {fly && <CoinFlight from={box} coins={Math.min(8, 3 + String(amount).length)} />}
    </div>
  )
}

/**
 * A catch on the result card: the ball rocking in, the Pokémon, Gotcha! with NEW, and where it went. Trick or Treat's
 * recap uses it too (docs/29), with its own ball, its shininess and its own line for where the ghost went.
 */
export function CatchCard({
  uid,
  dex,
  level,
  joined,
  replacedLevel,
  isNew,
  shiny: shinyIs,
  ball,
  where,
}: {
  uid?: string
  dex: number
  level: number
  joined?: boolean
  replacedLevel?: number
  isNew?: boolean
  /** Known already (else read from the caught Pokémon in the save). */
  shiny?: boolean
  /** In place of the Poké Ball. */
  ball?: ReactNode
  /** In place of the joined / team full / replaces line. */
  where?: string
}) {
  const { t } = useT()
  const name = useGame((s) => s.data.species[dex]?.name) ?? t('ui.common.unknown')
  const saved = useGame((s) => !!uid && !!s.save?.box.find((p) => p.id === uid)?.shiny)
  const shiny = shinyIs ?? saved
  const { level: motionLevel, calm } = useMotion()
  // The ball rocks in held steps (pixel motion steps, docs/15 §8); calm or off, it rests.
  const rock = !calm && motionLevel !== 'off'
  return (
    <div className="flex items-center gap-3 bg-gold-pale p-2 shadow-ring">
      <motion.div
        className="shrink-0"
        initial={rock ? { rotate: -30, y: -20 } : false}
        animate={{ rotate: [0, -15, 15, -8, 0], y: 0 }}
        transition={{ duration: rock ? 0.9 : 0, ease: (p: number) => Math.floor(p * 6) / 6 }}
      >
        {ball ?? <PixelIcon name="ball" size={36} />}
      </motion.div>
      <SpriteImg dex={dex} size={72} shiny={shiny} className="shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-3xl leading-none">
          {t('ui.victory.gotcha')}
          {isNew && <NewTag />}
        </div>
        <div className="text-xl">
          {t('ui.victory.wasCaught', { shiny: shiny ? t('ui.victory.shinyPrefix') : '', name, level })}
        </div>
        <div className="text-lg">
          {where ??
            (replacedLevel != null
              ? t('ui.victory.replacesYours', { level: replacedLevel, name })
              : joined
                ? t('ui.victory.joinedTeam', { name })
                : t('ui.victory.teamFull'))}
        </div>
      </div>
    </div>
  )
}

/**
 * A species' first catch, registered in the Pokédex as in the main games (docs/38 F10a): right under its catch card,
 * with its own jingle.
 */
export function DexRegisteredCard({ dex }: { dex: number }) {
  const { t } = useT()
  const name = useGame((s) => s.data.species[dex]?.name) ?? t('ui.common.unknown')
  return (
    <div className="flex items-center gap-2 bg-sky p-2 shadow-ring">
      <PixelIcon name="navDex" size={28} className="shrink-0" />
      <div className="min-w-0">
        <div className="text-xl leading-tight">{t('ui.victory.dexRegistered')}</div>
        <div className="truncate font-pixel-sm text-[16px] leading-tight text-muted">
          {dexNo(dex)} {name}
        </div>
      </div>
      <MiniSprite dex={dex} size={40} className="-my-2 ml-auto shrink-0" />
    </div>
  )
}

/** A League battle won with another still to fight: the team was healed for it (docs/42). */
export function LeagueHealedCard() {
  const { t } = useT()
  return (
    <div className="flex items-center justify-center gap-2 bg-sky p-2 text-center shadow-ring">
      <PixelIcon name="heal" size={24} className="shrink-0" />
      <span className="text-xl leading-tight">{t('ui.victory.leagueHealed')}</span>
    </div>
  )
}

/** A secret area a catch or a win opened: on the Map now. */
export function SecretAreaCard({ name }: { name: string }) {
  const { t } = useT()
  return (
    <div className="pixel-panel-dark p-2 text-center">
      <div className="text-xl text-gold">{t('ui.victory.secretArea')}</div>
      <div className="text-lg">{t('ui.victory.secretOnMap', { name })}</div>
    </div>
  )
}

/**
 * "Add X to your team?" — the three team members side by side; tapping one swaps it out. Saying nothing is an answer
 * too: CONTINUE (the footer) sends the catch to the Box.
 */
function TeamChoice() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const pending = useGame((s) => s.run.pendingCatchId)
  if (!save || !pending) return null
  const caught = getInstance(save, pending)
  if (!caught) return null
  const name = data.species[caught.dex]?.name
  return (
    <div className="mt-3 flex flex-col gap-2">
      {/* The cycling arrow: a swap, here and on each card. */}
      <div className="flex items-center gap-2 text-2xl">
        <PixelIcon name="reroll" size={20} />
        {t('ui.victory.addToTeam', { name: name ?? '' })}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {teamOf(save).map((p) => {
          const species = data.species[p.dex]
          const stats = instanceStats(p, data)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => resolveCatch(p.id)}
                className="pixel-btn flex w-full flex-col items-center gap-0.5 bg-panel px-1 pb-1.5 pt-1 text-center"
                aria-label={t('ui.victory.swapOutFor', { name: species?.name ?? '', level: p.level, newName: name ?? '' })}
              >
                <MiniSprite dex={p.dex} size={40} className="-my-1" />
                <span className="w-full truncate text-lg leading-none">{species?.name}</span>
                <span className="text-base leading-none text-muted">{t('ui.common.level.short', { n: p.level })}</span>
                <HpBar hp={p.currentHp} max={stats.maxHp} className="w-full" height={6} />
                <span className="inline-flex items-center gap-1 text-base leading-none">
                  <PixelIcon name="reroll" size={14} />
                  {t('ui.victory.swapOut')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The Pokémon a victory touched, in order: XP, level-ups, milestones and a pending evolution, one entry each. */
export interface MonRecap {
  uid: string
  /** The form it fought as (an evolution plays after the recap). */
  dex: number
  xp: number
  /** Where its XP bar stood before this fight (the engine's), to fill from. */
  from: { level: number; xp: number } | null
  shared: boolean
  fromLevel: number | null
  toLevel: number | null
  milestones: Extract<RunEvent, { kind: 'milestone' }>['milestone'][]
  evolvesTo: number | null
}

/** A recap card and its sound as it appears: an effect (`sound`) or a jingle of the game feel's (`feel`). */
type Extra = { key: string; node: ReactNode; sound?: 'catch' | 'gold' | 'heal'; feel?: FeelSound }

function useRecap(events: RunEvent[]): { mons: MonRecap[]; extras: Extra[]; evolutions: EvolutionShow[] } {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  return useMemo(() => {
    const byUid = new Map<string, MonRecap>()
    // The form it fought as: the first level-up / milestone / evolution names it; before that, its current form.
    const named = new Set<string>()
    const mon = (uid: string, dex?: number) => {
      let m = byUid.get(uid)
      if (!m) {
        const now = save ? getInstance(save, uid)?.dex : undefined
        m = {
          uid,
          dex: dex ?? now ?? 0,
          xp: 0,
          from: null,
          shared: false,
          fromLevel: null,
          toLevel: null,
          milestones: [],
          evolvesTo: null,
        }
        byUid.set(uid, m)
      }
      if (dex != null && !named.has(uid)) {
        m.dex = dex
        named.add(uid)
      }
      return m
    }
    const extras: Extra[] = []
    const evolutions: EvolutionShow[] = []
    events.forEach((e, i) => {
      const k = `${e.kind}-${i}`
      switch (e.kind) {
        case 'xp': {
          const m = mon(e.uid)
          m.xp += e.amount
          m.from ??= e.from ?? null
          m.shared ||= !!e.shared
          return
        }
        case 'level_up': {
          const m = mon(e.uid, e.dex)
          m.fromLevel ??= e.level - 1
          m.toLevel = e.level
          return
        }
        case 'milestone': {
          const m = mon(e.uid, e.dex)
          m.milestones.push(e.milestone)
          return
        }
        case 'evolve': {
          const m = mon(e.uid, e.fromDex)
          m.evolvesTo = e.toDex
          evolutions.push({ uid: e.uid, fromDex: e.fromDex, toDex: e.toDex })
          return
        }
        case 'gold':
          // The card counts and sounds its own gold.
          extras.push({ key: k, node: <GoldCard amount={e.amount} bonus={e.bonus} /> })
          return
        case 'caught':
          extras.push({
            key: k,
            sound: 'catch',
            node: (
              <Stamp weight="small">
                <CatchCard
                  uid={e.uid}
                  dex={e.dex}
                  level={e.level}
                  joined={e.joinedTeam}
                  replacedLevel={e.replacedLevel}
                  isNew={e.isNew}
                />
              </Stamp>
            ),
          })
          // Its first catch: registered in the Pokédex, a moment of its own.
          if (e.isNew)
            extras.push({ key: `${k}-dex`, feel: 'dex.registered', node: <DexRegisteredCard dex={e.dex} /> })
          return
        case 'fled':
          extras.push({
            key: k,
            node: (
              <div className="text-center text-xl text-muted">
                {t('ui.victory.fled', { name: data.species[e.dex]?.name ?? t('ui.common.unknown') })}
              </div>
            ),
          })
          return
        case 'boss_defeated':
          extras.push({
            key: k,
            node: (
              <div className="text-center text-xl text-gold">
                {t('ui.victory.bossDefeated', { name: data.species[e.dex]?.name ?? t('ui.common.unknown') })}
              </div>
            ),
          })
          return
        case 'gym_defeated':
          extras.push({
            key: k,
            feel: e.role === 'champion' ? 'champion.fanfare' : 'badge.fanfare',
            // A badge is the biggest moment of a run: it stamps down with the confetti (docs/43 §5.3).
            node: (
              <Stamp weight="big">
                <div className="flex items-center justify-center gap-3 bg-gold p-2 text-center shadow-ring">
                  {e.badge && <BadgeIcon badge={e.badge} earned size={36} />}
                  <div>
                    <div className="text-2xl leading-none">
                      {e.role === 'champion' ? t('ui.victory.champion') : t('ui.victory.trainerDefeated', { name: e.name })}
                    </div>
                    {e.badge && <div className="text-lg">{t('ui.victory.earnedBadge', { badge: e.badge })}</div>}
                  </div>
                </div>
              </Stamp>
            ),
          })
          return
        case 'secret_unlocked': {
          const a = data.areas.find((x) => x.id === e.areaId)
          extras.push({
            key: k,
            sound: 'catch',
            node: (
              <Stamp weight="small">
                <SecretAreaCard name={a?.name ?? t('ui.common.unknown')} />
              </Stamp>
            ),
          })
          return
        }
        case 'unown_letter':
          // An Unown's letter for the Unown Pokédex (docs/41), and its prize when it was the last one.
          if (!isUnownLetter(e.letter)) return
          extras.push({
            key: k,
            ...(!!e.reward && { sound: 'gold' as const }),
            node: (
              <UnownLetterCard letter={e.letter} isNew={e.isNew} found={e.found} total={e.total} reward={e.reward} />
            ),
          })
          return
        case 'world_mythical':
          // A small world's shiny mythical (docs/21): gone home to its region's Box, or waiting for it.
          extras.push({ key: k, sound: 'catch', node: <WorldMythicalCard dex={e.dex} region={e.region} waiting={e.waiting} /> })
          return
        case 'league_healed':
          extras.push({ key: k, sound: 'heal', node: <LeagueHealedCard /> })
          return
        // Hidden talents (docs/51): a family's talent unlocked, and what one did after the win.
        case 'talent':
          extras.push({ key: k, sound: 'catch', node: <TalentFoundCard uid={e.uid} dex={e.dex} talent={e.talent} how={e.how} /> })
          return
        case 'regenerator': {
          const dex = save?.box.find((p) => p.id === e.uid)?.dex ?? 0
          extras.push({
            key: k,
            sound: 'heal',
            node: <TalentAfterWinCard uid={e.uid} dex={dex} line={(name) => t('ui.talent.medic', { name, n: e.amount })} />,
          })
          return
        }
        case 'talent_gold':
          extras.push({
            key: k,
            sound: 'gold',
            node: (
              <TalentAfterWinCard
                uid={e.uid}
                dex={e.dex}
                talent={e.talent}
                line={(name) => t('ui.talent.goldCard', { name, talent: talentName(e.talent), n: e.amount })}
              />
            ),
          })
          return
        // Pickup's find (docs/51) is shown on its own step after the card (FindView), as any find.
        case 'pickup':
          return
        case 'rebattle_cleared':
          extras.push({
            key: k,
            feel: 'badge.fanfare',
            node: (
              <Stamp weight="big">
                <div className="flex items-center justify-center gap-3 bg-gold p-2 text-center shadow-ring">
                  <Medal tier={e.tier} />
                  <div className="text-2xl leading-none">
                    {t('ui.events.rebattle.medalTitle', { tier: tierName(t, data, e.tier) })}
                  </div>
                </div>
              </Stamp>
            ),
          })
          return
        case 'area_cleared': {
          const next = data.areas.find((a) => a.id === e.nextAreaId)
          extras.push({
            key: k,
            feel: 'area.fanfare',
            node: (
              <Stamp weight="big">
                <div className="bg-hp-green p-2 text-center shadow-ring">
                  <div className="text-2xl">{t('ui.victory.areaCleared')}</div>
                  <div className="text-lg">
                    {next ? t('ui.victory.nextOpen', { name: next.name }) : t('ui.victory.allCleared')}
                  </div>
                </div>
              </Stamp>
            ),
          })
          return
        }
        case 'nightmare_round':
          // A round of the nightmare survived (docs/30): the next brings Darkrai's strike, the last the waking.
          extras.push({
            key: k,
            node: (
              <div className="light-scope flex items-center justify-center gap-2 bg-[#080b1f] p-2 text-center text-[#eef0ff] shadow-[inset_0_3px_0_#f3efd6,0_0_0_2px_#24304f]">
                <PixelIcon name="moon" size={22} />
                <span className="text-xl leading-tight">
                  {e.round >= e.total
                    ? t('ui.nightmare.lastRoundWon')
                    : t('ui.nightmare.roundWon', { n: e.round, total: e.total })}
                </span>
              </div>
            ),
          })
          return
        case 'whiteout_wave':
          // A wave of the whiteout cleared (docs/61 §4.3): a bonfire comes next.
          extras.push({
            key: k,
            node: (
              <div className="light-scope flex items-center justify-center gap-2 bg-[#16264a] p-2 text-center text-[#eef6ff] shadow-[inset_0_3px_0_#e6f1fa,0_0_0_2px_#060b18]">
                <PixelIcon name="burn" size={22} />
                <span className="text-xl leading-tight">
                  {t('ui.whiteout.waveWon', { n: e.wave, total: e.waves })}
                </span>
              </div>
            ),
          })
          return
        case 'nightmare_gift': {
          // The item a round left in the bag (docs/30), once for good.
          const item = data.items[e.key]
          extras.push({
            key: k,
            sound: 'gold',
            node: (
              <div className="flex items-center justify-center gap-2 bg-gold-pale p-2 text-center shadow-ring">
                {item && <ItemSprite item={item} size={32} />}
                <span className="text-xl leading-tight">
                  {t('ui.nightmare.gotGift', { item: `${item?.name ?? e.key}${e.qty > 1 ? ` ×${e.qty}` : ''}` })}
                </span>
              </div>
            ),
          })
          return
        }
      }
    })
    return { mons: [...byUid.values()].filter((m) => m.dex), extras, evolutions }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, data])
}

/** A blank die in its type's colour, small enough to sit in a chip (the colour is the type; a number would confuse). */
function DieChip({ type }: { type: DieType }) {
  const bg = typeColor(type)
  return (
    <span
      className="die-mini inline-block shrink-0 align-middle"
      style={{ width: 20, height: 20, background: `linear-gradient(135deg, ${shade(bg, 1.08)} 0%, ${bg} 55%, ${shade(bg, 0.88)} 100%)` }}
      role="img"
      aria-label={t('ui.victory.dieChip', { type: typeName(type) })}
      title={t('ui.victory.dieChip', { type: typeName(type) })}
    />
  )
}

/** What a milestone gives, as icons: a die gained or swapped, a reroll, HP. */
function MilestoneChip({ m, type1 }: { m: Milestone; type1: DieType }) {
  const to = m.dieType ?? type1
  const from = m.effect === 'UPGRADE_DIE' ? 'base' : (m.fromDieType ?? 'base')
  const body =
    m.effect === 'ADD_DIE' ? (
      <>
        <span aria-hidden>+</span>
        <DieChip type={to} />
      </>
    ) : m.effect === 'UPGRADE_DIE' || m.effect === 'REPLACE_DIE' ? (
      <>
        <DieChip type={from} />
        <span aria-hidden>→</span>
        <DieChip type={to} />
      </>
    ) : m.effect === 'ADD_REROLL' ? (
      <>
        <span aria-hidden>+{(m.amount ?? 1) > 1 ? m.amount : ''}</span>
        <PixelIcon name="reroll" size={20} />
      </>
    ) : (
      <>
        <span aria-hidden>+{m.amount ?? 0}</span>
        <PixelIcon name="heart" size={18} />
      </>
    )
  return (
    <span
      className="inline-flex items-center gap-1 bg-gold px-1.5 py-0.5 text-xl leading-none shadow-ring"
      aria-label={milestoneText(m, type1)}
      title={milestoneText(m, type1)}
    >
      {body}
    </span>
  )
}

/**
 * One Pokémon: sprite, name, level and XP on one line (with its XP bar), and one line below for what it earned —
 * a level-up (the sprite pulses, confetti flies), new dice and milestones, an evolution to come.
 */
function MonRow({ m }: { m: MonRecap }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, m.uid) : undefined))
  const reduced = useGame((s) => s.settings.reducedMotion)
  const details = useDetails()
  // The XP bar fills from before the fight and the level-up lands as it rolls over (docs/38 F5c).
  const [rolls, setRolls] = useState(0)
  const fill = useXpFill(inst, m.from, () => setRolls((n) => n + 1))
  const species = data.species[m.dex]
  if (!species) return null
  const leveled = m.toLevel != null
  const level = fill?.level ?? inst?.level ?? m.toLevel ?? 0
  // Still filling toward its level-up: the celebrations wait for the roll (their room kept, so nothing jumps).
  const waiting = !!fill && rolls === 0
  const type1 = species.type1
  const chips: ReactNode[] = []
  if (leveled)
    chips.push(
      <span
        key="lv"
        className="inline-flex items-center gap-1 bg-hp-green px-1.5 py-0.5 text-xl leading-none text-ink shadow-ring"
        aria-label={t('ui.victory.levelUp', { level: m.toLevel ?? 0 })}
      >
        <PixelIcon name="up" size={18} />
        {t('ui.common.level.short', { n: m.toLevel ?? 0 })}
      </span>,
    )
  // The evolution milestone is the scene that follows the recap, not a chip.
  m.milestones.filter((ms) => ms.effect !== 'EVOLVE').forEach((ms, i) => chips.push(<MilestoneChip key={`m${i}`} m={ms} type1={type1} />))
  if (m.evolvesTo != null)
    chips.push(
      <span key="evo" className="bg-ink px-1.5 py-0.5 text-lg leading-none text-panel">
        {t('ui.victory.evolvingInto', { name: data.species[m.evolvesTo]?.name ?? t('ui.common.unknown') })}
      </span>,
    )
  return (
    <div className={cx('p-2 shadow-ring', leveled ? 'bg-gold-pale' : 'bg-paper')}>
      <div className="flex items-center gap-2">
        <motion.span
          className="relative shrink-0"
          initial={false}
          animate={
            leveled && !reduced && !waiting
              ? { scale: [1, 1.4, 1, 1.3, 1], x: [0, -3, 3, -2, 2, 0], rotate: [0, -4, 4, -3, 0] }
              : undefined
          }
          transition={{ duration: 1 }}
        >
          <MiniSprite dex={m.dex} size={40} className="-my-2" />
          {leveled && !waiting && <Confetti key={rolls} />}
        </motion.span>
        <span className="min-w-0 truncate text-xl leading-none">{inst?.nickname || species.name}</span>
        <span className="shrink-0 text-lg leading-none">{t('ui.common.level.short', { n: level })}</span>
        <span className="ml-auto shrink-0 text-lg leading-none">
          {t('ui.victory.xpGain', { amount: m.xp })}
          {m.shared && <span className="text-sm text-muted">{t('ui.victory.multi')}</span>}
        </span>
      </div>
      {inst && <XpBar inst={inst} className="mt-1" shown={fill} numbers={details} />}
      {chips.length > 0 && (
        <div className={cx('mt-1.5 flex flex-wrap gap-1.5', leveled && waiting && 'invisible')}>{chips}</div>
      )}
    </div>
  )
}

/**
 * The team's XP in one strip (docs/42), a column each, side by side: the sprite, its level, the bar filling, the XP won.
 * A level-up turns its column gold, the level green, the sprite hops and the confetti flies as the bar rolls over; a
 * milestone or an evolution to come is a chip under it. Each column comes as the recap reaches it, in its own place,
 * so nothing reflows. With More details, a row each instead (MonRow): names, figures, Multi XP.
 */
export function TeamXpStrip({ mons, shown }: { mons: MonRecap[]; shown: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, mons.length)}, minmax(0, 1fr))` }}>
      {mons.map((m, i) => (i < shown ? <MonColumn key={m.uid} m={m} /> : <div key={m.uid} aria-hidden />))}
    </div>
  )
}

function MonColumn({ m }: { m: MonRecap }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, m.uid) : undefined))
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [rolls, setRolls] = useState(0)
  const fill = useXpFill(inst, m.from, () => setRolls((n) => n + 1))
  const species = data.species[m.dex]
  if (!species) return null
  const leveled = m.toLevel != null
  const level = fill?.level ?? inst?.level ?? m.toLevel ?? 0
  // Still filling toward its level-up: the celebration waits for the roll.
  const waiting = !!fill && rolls === 0
  const up = leveled && !waiting
  const name = inst?.nickname || species.name
  const chips: ReactNode[] = []
  m.milestones
    .filter((ms) => ms.effect !== 'EVOLVE')
    .forEach((ms, i) => chips.push(<MilestoneChip key={`m${i}`} m={ms} type1={species.type1} />))
  if (m.evolvesTo != null)
    chips.push(
      <span key="evo" className="bg-ink px-1 py-0.5 text-sm leading-none text-panel">
        {t('ui.victory.evolvingInto', { name: data.species[m.evolvesTo]?.name ?? t('ui.common.unknown') })}
      </span>,
    )
  return (
    <div
      className={cx('flex min-w-0 flex-col items-center gap-1 p-1.5 shadow-ring', up ? 'bg-gold-pale' : 'bg-paper')}
      role="group"
      aria-label={`${name}: ${t('ui.victory.xpGain', { amount: m.xp })}${leveled ? `, ${t('ui.victory.levelUp', { level: m.toLevel ?? 0 })}` : ''}`}
    >
      <motion.span
        className="relative"
        initial={false}
        animate={up && !reduced ? { y: [0, -10, 0, -5, 0], scale: [1, 1.25, 1, 1.1, 1] } : undefined}
        transition={{ duration: 0.8, ease: (p: number) => Math.round(p * 8) / 8 }}
      >
        <MiniSprite dex={m.dex} size={48} className="-my-1" />
        {up && <Confetti key={rolls} />}
      </motion.span>
      <span className="w-full truncate text-center text-base leading-none">{name}</span>
      <span
        className={cx(
          'inline-flex items-center gap-0.5 px-1 py-0.5 text-lg leading-none',
          up ? 'bg-hp-green text-ink shadow-ring' : 'text-ink',
        )}
      >
        {up && <PixelIcon name="up" size={14} />}
        {t('ui.common.level.short', { n: level })}
      </span>
      {inst && <XpBar inst={inst} className="w-full" shown={fill} numbers={false} />}
      <span className="text-base leading-none text-muted">{t('ui.victory.xpGain', { amount: m.xp })}</span>
      {chips.length > 0 && <div className={cx('flex flex-wrap justify-center gap-1', !up && leveled && 'invisible')}>{chips}</div>}
    </div>
  )
}

/** How long the autopilot leaves a result card up before closing it (docs/36). */
const AUTO_CARD_MS = 1600

/**
 * The rewards after a K.O. Built for phones: the recap scrolls, the action button never does (it sits at the bottom of
 * the card). One row per Pokémon with its celebrations under it; then gold, catches, badges. Evolutions play after
 * CONTINUE, one after another, and only then does the game move on.
 */
export function VictoryView() {
  const { t } = useT()
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const details = useDetails()
  const { mons, extras, evolutions } = useRecap(run.events)
  const pace = usePace()
  // The win's jingle as the card rises (docs/38 F5a), once the fight is over: not between a trainer's Pokémon.
  useFeelOnce('win.jingle', !trainerHasNext())
  const total = mons.length + extras.length
  const [shown, setShown] = useState(reduced ? Number.MAX_SAFE_INTEGER : 1)
  const [lead, setLead] = useState<string | null>(null)
  // The action picked on the recap waits for the evolutions to play.
  const [then, setThen] = useState<(() => void) | null>(null)
  const allShown = shown >= total

  useEffect(() => {
    if (allShown) return
    const t = setTimeout(() => {
      setShown((s) => s + 1)
      const next = shown < mons.length ? mons[shown] : extras[shown - mons.length]
      // A level-up sounds as its XP bar rolls over (useXpFill); a card has its own sound or fanfare.
      if (!next || 'uid' in next) return
      if (next.feel) feelSound(next.feel)
      else if (next.sound) sfx(next.sound)
    }, 650 * pace)
    return () => clearTimeout(t)
  }, [shown, allShown, mons, extras, pace])

  // CONTINUE answers a pending "add to your team?" by sending the catch to the Box, then plays any evolution. After a
  // wild pair (docs/33), the other catch's question comes next: CONTINUE stays here for it.
  const go = (action: () => void) => () => {
    if (useGame.getState().run.pendingCatchId) {
      resolveCatch(null)
      if (useGame.getState().run.pendingCatchId) return
    }
    if (evolutions.length) setThen(() => action)
    else action()
  }

  // Between a trainer's Pokémon, the one that just fought stays selected unless the player picks another.
  const fought = battle ? battle.state.player[battle.state.activeIndex] : undefined
  const stillIn = fought && fought.hp > 0 ? fought.uid : undefined
  const hasNext = trainerHasNext()
  const enc = run.encounter
  const nextMon =
    hasNext && (enc?.kind === 'trainer' || enc?.kind === 'gym') && run.trainer ? enc.team[run.trainer.index + 1] : null
  // This fight cleared the area and opened the story's way forward (the furthest open area of the region's chain, as
  // Home's CONTINUE offers it): GO TO it is the card's one way on, in CONTINUE's place (docs/15 §6).
  const clearedTo = run.events.flatMap((e) => (e.kind === 'area_cleared' && e.nextAreaId ? [e.nextAreaId] : []))[0]
  const latest = useGame((s) => (clearedTo && s.save ? latestOpenArea(s.save, s.data, serverNow()) : null))
  const nextArea = clearedTo && latest?.id === clearedTo ? latest : undefined

  // The autopilot (docs/36): the card shows whole at once, stays a moment to be read, then closes by itself — on to the
  // trainer's next Pokémon, or back on the trail, where the autopilot picks up (evolutions play on their own first).
  // "Add to team?" waits for the player under Auto on explored areas; Idle changes no team, so every catch waiting on
  // it (two after a wild pair) goes to the Box, as CONTINUE sends it.
  const closes = useGame((s) => !!s.save && s.run.phase === 'victory' && autoStepNow()?.do === 'close')
  const closeRef = useRef<() => void>(() => {})
  closeRef.current = () => {
    while (useGame.getState().run.pendingCatchId) resolveCatch(null)
    if (hasNext && nextMon) go(() => continueAfterVictory(lead ?? stillIn ?? defaultLead()))()
    else go(() => continueAfterVictory())()
  }
  useEffect(() => {
    if (closes) setShown(Number.MAX_SAFE_INTEGER)
  }, [closes])
  // Between a trainer's Pokémon the card stays long enough to pick who faces the next one (a player's feedback,
  // 2026-10-29), and a Pokémon tapped holds it for the player's NEXT.
  const picking = hasNext && !!nextMon
  const pickWait = picking && lead == null
  useEffect(() => {
    if (!closes || !allShown || then || (picking && lead != null)) return
    const timer = setTimeout(() => closeRef.current(), picking ? PILOT_PICK_MS : AUTO_CARD_MS)
    return () => clearTimeout(timer)
  }, [closes, allShown, then, picking, lead])

  // Inside a portal run (docs/28) there is no way Home: CONTINUE alone.
  const locked = useGame((s) => !!portalLock(s.save, s.data))

  // After a fight: NEXT waits for the player, unless Auto is on (Settings, or AUTO beside NEXT): then it fills and goes.
  const sendNext = go(() => continueAfterVictory(lead ?? stillIn ?? defaultLead()))
  // The way on to the next area goes straight into its first encounter (the rework: no stop on its page first).
  const onwards = nextArea
    ? go(() => {
        continueAfterVictory()
        exploreFirstArea(nextArea.id)
      })
    : go(() => {
        continueAfterVictory()
        continueExploring()
      })
  // After a fight the card moves on by itself once everything is shown (the user's call, 2026-10-26): NEXT's gauge
  // fills and goes, BACK still in reach. Not when a new Pokémon was caught (its card waits to be looked at, and a full
  // team's choice to be made), nor when the area was cleared (the way on is the next area), nor in a rebattle.
  // A new species, or a small world's mythical gone home (its finale): the card is looked at, so it waits for NEXT.
  const caughtNew = run.events.some((e) => (e.kind === 'caught' && e.isNew) || e.kind === 'world_mythical')
  // A real player's fight over (docs/54): the card waits, its friend request is the player's to send.
  const autoNext = !closes && !run.rebattle && !nextArea && !caughtNew && !run.duel
  // Only while auto-mode or Idle mode plays the area (the user's call, 2026-10-27: otherwise NEXT waits for a tap).
  const autoOn = useAutoLevel() !== 'off'
  const countdown = autoOn && autoNext && allShown && !run.pendingCatchId && !then && !(picking && lead != null)
  // Each piece of the recap scrolls into view as it comes (a level-up, the Pokédex entry…), then a full team's choice
  // or the trainer's next Pokémon: the player never scrolls to follow the card (the user's call, 2026-10-26). The
  // scroll margin keeps it clear of the buttons pinned at the foot.
  const list = useRef<HTMLDivElement>(null)
  const follow = useRef<HTMLDivElement>(null)
  const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth'
  useEffect(() => {
    const last = list.current?.lastElementChild as HTMLElement | null
    if (!last || shown <= 1) return
    last.style.scrollMarginBottom = '160px'
    last.scrollIntoView({ block: 'nearest', behavior })
  }, [shown, behavior])
  const choosing = allShown && (!!run.pendingCatchId || (hasNext && !!nextMon))
  useEffect(() => {
    if (choosing) follow.current?.scrollIntoView({ block: 'nearest', behavior })
  }, [choosing, run.pendingCatchId, behavior])
  const nextRef = useRef<() => void>(() => {})
  nextRef.current = hasNext && nextMon ? sendNext : onwards
  // The trainer's next Pokémon: the same time to pick as under the autopilot, whatever the pace.
  const advance = picking ? PILOT_PICK_MS : ADVANCE_MS * pace
  useEffect(() => {
    if (!countdown) return
    const timer = setTimeout(() => nextRef.current(), advance)
    return () => clearTimeout(timer)
  }, [countdown, advance])
  if (then) return <EvolutionQueue items={evolutions} onDone={then} />
  // NEXT's gauge: its countdown, or the autopilot's wait before the trainer's next Pokémon.
  const filling = countdown || (closes && allShown && !then && pickWait)
  const fill = filling && (
    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[5px] bg-black/20">
      <motion.span
        className="block h-full bg-gold-light"
        initial={{ width: 0 }}
        animate={{ width: '100%' }}
        transition={{ duration: (countdown ? advance : PILOT_PICK_MS) / 1000, ease: 'linear' }}
      />
    </span>
  )
  const footer = hasNext && nextMon ? (
    // The send-out's row (docs/43 §5.3): NEXT sends the one picked; giving up is the flag at its side.
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
      <PixelButton variant="primary" size="lg" className="relative w-full overflow-hidden" onClick={sendNext}>
        {t('ui.victory.next')} ▸{fill}
      </PixelButton>
      <ForfeitButton flag />
    </div>
  ) : run.rebattle ? (
    <RebattleNext go={go} />
  ) : (
    <div className="flex flex-col gap-2">
      {/* BACK: the area's page between encounters (its HOME, the team); NEXT: the next encounter. */}
      <div className={locked ? 'grid' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5'}>
        {!locked && (
          <PixelButton size="lg" className="whitespace-nowrap px-2" onClick={go(() => continueAfterVictory())}>
            ◂ {t('ui.common.back')}
          </PixelButton>
        )}
        <PixelButton
          variant="primary"
          size="lg"
          className="relative overflow-hidden whitespace-nowrap px-2"
          aria-label={nextArea ? t('ui.victory.goToArea', { name: nextArea.name }) : undefined}
          onClick={onwards}
        >
          {nextArea ? (
            <>
              <PixelIcon name="map" size={20} />
              {nextArea.name} ▸
            </>
          ) : (
            <>{t('ui.victory.next')} ▸</>
          )}
          {fill}
        </PixelButton>
      </div>
    </div>
  )

  const title = t(battle?.state.kind === 'boss' ? 'ui.victory.legendaryVictory' : 'ui.victory.victory')
  return (
    <Overlay footer={footer} label={title}>
      {/* The battle's live region says the fight is won (the line under the stage gives way to the card). */}
      <p className="sr-only" role="status">
        {title}
      </p>
      {/* Between a trainer's Pokémon, who's next and the pick come first (the rework: the action on top). */}
      {allShown && !run.pendingCatchId && hasNext && nextMon && (
        <div ref={follow} className="mb-3 flex scroll-mb-[160px] flex-col gap-2">
          <div className="flex items-center gap-2">
            <motion.div className="shrink-0" initial={reduced ? false : { x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
              <TrainerSprite src={enc?.kind === 'trainer' || enc?.kind === 'gym' ? enc.spriteUrl : null} size={72} />
            </motion.div>
            {/* Who's coming, as well as said: the sprite next to the line. */}
            <motion.div
              className="shrink-0"
              initial={reduced ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.25 }}
            >
              <SpriteImg dex={nextMon.dex} size={64} shiny={!!nextMon.shiny} />
            </motion.div>
            <span className="text-2xl leading-none">{t('ui.common.level.short', { n: nextMon.level })}</span>
          </div>
          {/* The one that fought is picked to begin with; a tap picks another, NEXT sends the one picked. On auto it goes
              by itself unless a Pokémon is tapped. */}
          {filling && pickWait && (
            <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{t('ui.idle.pickLead')}</p>
          )}
          <LeadPicker
            value={lead ?? stillIn ?? null}
            onChange={setLead}
            foe={speciesTypes(data, nextMon.dex)}
            go
            fight
          />
        </div>
      )}
      <div ref={list} className="flex flex-col gap-2">
        <AnimatePresence initial={!reduced}>
          {details ? (
            mons.slice(0, shown).map((m) => (
              <motion.div key={m.uid} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                <MonRow m={m} />
              </motion.div>
            ))
          ) : mons.length > 0 ? (
            // The team's XP in one strip (docs/42): a phone sees the rest of the result without scrolling.
            <motion.div key="team" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <TeamXpStrip mons={mons} shown={shown} />
            </motion.div>
          ) : null}
          {extras.slice(0, Math.max(0, shown - mons.length)).map((c) => (
            <motion.div key={c.key} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              {c.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {allShown && run.pendingCatchId && (
        <div ref={follow} className="scroll-mb-[160px]">
          <TeamChoice />
        </div>
      )}
      {allShown && run.duel && (
        <div className="mt-3">
          <DuelResult outcome={run.duel.outcome} foe={run.duel.foe} follow />
        </div>
      )}
    </Overlay>
  )
}

/**
 * After a rebattle trainer: the next one of the gauntlet, or a pause back on the rebattle page. A cleared tier goes back
 * there, to its medal card.
 */
function RebattleNext({ go }: { go: (action: () => void) => () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const cleared = run.events.some((e) => e.kind === 'rebattle_cleared')
  const next = save && run.rebattle && !cleared ? rebattleEncounter(save, data, run.rebattle.regionId) : null
  const leave = go(() => {
    continueAfterVictory()
    leaveRebattle()
  })
  if (!next || next.kind !== 'gym')
    return (
      <PixelButton variant="primary" size="lg" className="w-full" onClick={leave}>
        {t('ui.events.rebattle.backToPage')}
      </PixelButton>
    )
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2.5">
      <PixelButton size="lg" className="whitespace-nowrap px-2" onClick={leave}>
        {t('ui.events.rebattle.later')}
      </PixelButton>
      <PixelButton
        variant="primary"
        size="lg"
        className="min-w-0 px-2"
        onClick={go(() => {
          continueAfterVictory()
          startRebattle()
        })}
      >
        <span className="truncate">{t('ui.events.rebattle.nextFight', { name: next.name })}</span>
      </PixelButton>
    </div>
  )
}

/** A rebattle lost: back to the tier's first trainer, healed; the ₽ won is kept. */
function RebattleWipe() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const rb = useGame((s) => s.run.rebattle)
  const first = save && rb ? rebattleLineup(save, data, rb.regionId, rb.tier)[0] : undefined
  return (
    <Overlay
      label={t('ui.wipe.title')}
      footer={
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton size="lg" className="whitespace-nowrap px-2" onClick={afterWipe}>
            {t('ui.events.rebattle.later')}
          </PixelButton>
          <PixelButton
            variant="primary"
            size="lg"
            className="whitespace-nowrap px-2"
            onClick={() => {
              afterWipe()
              startRebattle()
            }}
          >
            {t('ui.wipe.tryAgain')}
          </PixelButton>
        </div>
      }
    >
      <h2 className="mb-2 text-center text-[32px] font-normal leading-none" aria-live="polite">{t('ui.wipe.title')}</h2>
      <p className="copy text-lg">{t('ui.events.rebattle.lostBody', { name: first?.name ?? '' })}</p>
    </Overlay>
  )
}

export function WipeView() {
  const rebattle = useGame((s) => !!s.run.rebattle)
  // The defeat's jingle as the card rises (docs/38 F11a).
  useFeelOnce('defeat.jingle')
  return rebattle ? <RebattleWipe /> : <AreaWipe />
}

function AreaWipe() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const areaId = useGame((s) => s.run.areaId)
  const area = data.areas.find((a) => a.id === areaId)
  const p = save && areaId ? progressOf(save, areaId) : null
  const done = p?.roundsDone ?? 0
  // A wipe that ended a portal run (docs/28): its portals opened again and its boons are gone.
  const portalLost = useGame((s) => s.run.portalLost)
  // A wipe that woke the player from the nightmare (docs/30): its rounds start again from the first.
  const nightmareLost = useGame((s) => s.run.nightmareLost)
  // A wipe in the whiteout (docs/61 §4.3): back to wave 1.
  const whiteoutLost = useGame((s) => s.run.whiteoutLost)
  return (
    <Overlay
      label={t('ui.wipe.title')}
      footer={
        <AutoButton paused="byDialogs" variant="primary" size="lg" className="w-full" onClick={afterWipe}>
          {t('ui.wipe.tryAgain')}
        </AutoButton>
      }
    >
      <h2 className="mb-2 text-center text-[32px] font-normal leading-none" aria-live="polite">{t('ui.wipe.title')}</h2>
      {/* The rework: what a wipe costs is said only where it differs from the usual (a portal, the nightmare, Extreme). */}
      <p className="copy mb-3 text-lg" hidden={portalLost == null && nightmareLost == null && whiteoutLost == null && !!save && wipeHeals(save, data)}>
        {/* Extreme mode heals nobody after a lost round: the fainted ones rest (docs/22). */}
        {portalLost != null
          ? t('ui.portal.wipeBody', { n: portalLost })
          : nightmareLost != null
          ? t('ui.nightmare.wipeBody', { n: nightmareLost })
          : whiteoutLost != null
          ? t('ui.whiteout.wipeBody', { n: whiteoutLost })
          : save && !wipeHeals(save, data)
          ? t('ui.wipe.bodyExtreme', {
              area: area?.name ?? '',
              h: data.config.extreme.koHours,
              kept: done > 0 ? t('ui.wipe.keptRounds') : '',
            })
          : t('ui.wipe.body', { area: area?.name ?? '', kept: done > 0 ? t('ui.wipe.keptRounds') : '' })}
      </p>
    </Overlay>
  )
}

/**
 * Lost to a real player's team (docs/54): no wipe, the team healed, the round goes on. The defeat's jingle, who won,
 * the friend request, and CONTINUE to the next encounter.
 */
function DuelLostView({ foe }: { foe: AreaFoe }) {
  const { t } = useT()
  useFeelOnce('defeat.jingle')
  return (
    <Overlay
      label={t('ui.areaVersus.lostTitle')}
      footer={
        <AutoButton
          paused="byDialogs"
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => {
            afterStalemate()
            continueExploring()
          }}
        >
          {t('ui.common.continue')}
        </AutoButton>
      }
    >
      <h2 className="mb-3 text-center text-[32px] font-normal leading-none" aria-live="polite">
        {t('ui.areaVersus.lostTitle')}
      </h2>
      <DuelResult outcome="lost" foe={foe} follow />
    </Overlay>
  )
}

export function StalemateView() {
  const { t } = useT()
  const duel = useGame((s) => s.run.duel)
  if (duel) return <DuelLostView foe={duel.foe} />
  return (
    <Overlay
      label={t('ui.stalemate.title')}
      footer={
        <div className="flex flex-col gap-2">
          <AutoButton paused="byDialogs" variant="primary" size="lg" className="w-full" onClick={afterStalemate}>
            {t('ui.common.continue')}
          </AutoButton>
        </div>
      }
    >
      <h2 className="mb-2 text-center text-[32px] font-normal leading-none" aria-live="polite">{t('ui.stalemate.title')}</h2>
    </Overlay>
  )
}
