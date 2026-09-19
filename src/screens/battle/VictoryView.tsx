// Result screens: victory (XP, level-ups, milestones, gold, catch, then evolutions), wipe and stalemate.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getInstance, progressOf, teamOf, type RunEvent } from '@/engine'
import { sfx } from '@/audio/sfx'
import { EvolutionQueue, type EvolutionShow } from '@/components/Evolution'
import { RoundsCounter } from '@/components/RoundsCounter'
import { useCountUp } from '@/components/GoldPill'
import { PixelIcon } from '@/components/icons'
import { LeadPicker, defaultLead } from '@/components/LeadPicker'
import { MonCard, XpBar } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { milestoneText, money, trainerTitle } from '@/lib/format'
import { usePace } from '@/lib/pace'
import { BadgeIcon } from '@/components/BadgeIcon'
import { useGame } from '@/store/game'
import { afterStalemate, afterWipe, continueAfterVictory, enterArea, resolveCatch, trainerHasNext } from '@/store/run'
import { cx } from '@/theme/util'

/**
 * A result card over the battle. On phones it takes the screen: the content scrolls and the `footer` (the action
 * button) stays pinned at the bottom of the card, so it's never below the fold.
 */
function Overlay({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-ink/70 p-2 sm:items-center sm:p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="pixel-panel flex max-h-full w-full max-w-xl flex-col sm:max-h-[90vh]"
        initial={{ y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
      >
        <div className="pixel-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t-[3px] border-ink bg-parchment p-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function GoldCard({ amount }: { amount: number }) {
  const n = useCountUp(amount, 800)
  return (
    <div className="flex items-center gap-2 text-3xl text-ink">
      <PixelIcon name="coin" size={28} /> +{money(n)}
    </div>
  )
}

function CatchCard({ uid, dex, level, joined, replacedLevel }: { uid: string; dex: number; level: number; joined: boolean; replacedLevel?: number }) {
  const name = useGame((s) => s.data.species[dex]?.name ?? '???')
  const shiny = useGame((s) => !!s.save?.box.find((p) => p.id === uid)?.shiny)
  return (
    <div className="flex items-center gap-3 border-[3px] border-ink bg-gold/40 p-2">
      <motion.div initial={{ rotate: -30, y: -20 }} animate={{ rotate: [0, -15, 15, -8, 0], y: 0 }} transition={{ duration: 0.9 }}>
        <PixelIcon name="ball" size={36} />
      </motion.div>
      <SpriteImg dex={dex} size={72} shiny={shiny} />
      <div>
        <div className="text-3xl leading-none">Gotcha!</div>
        <div className="text-xl">
          {shiny ? 'Shiny ' : ''}{name} (Lv.{level}) was caught!
        </div>
        <div className="text-lg">
          {replacedLevel != null
            ? `It replaces your Lv.${replacedLevel} ${name}.`
            : joined
              ? `${name} joined your team.`
              : 'Your team is full…'}
        </div>
      </div>
    </div>
  )
}

function TeamChoice() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const pending = useGame((s) => s.run.pendingCatchId)
  if (!save || !pending) return null
  const caught = getInstance(save, pending)
  if (!caught) return null
  const name = data.species[caught.dex]?.name
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="text-2xl">Add {name} to your team?</div>
      <div className="copy text-muted">Swap it in for one of your three — the one you replace goes to the Box.</div>
      {teamOf(save).map((p) => (
        <MonCard key={p.id} inst={p}>
          <PixelButton size="sm" onClick={() => resolveCatch(p.id)}>
            Swap out
          </PixelButton>
        </MonCard>
      ))}
      <PixelButton onClick={() => resolveCatch(null)}>Send {name} to the Box</PixelButton>
    </div>
  )
}

/** The Pokémon a victory touched, in order: XP, level-ups, milestones and a pending evolution, one entry each. */
interface MonRecap {
  uid: string
  /** The form it fought as (an evolution plays after the recap). */
  dex: number
  xp: number
  shared: boolean
  fromLevel: number | null
  toLevel: number | null
  milestones: Extract<RunEvent, { kind: 'milestone' }>['milestone'][]
  evolvesTo: number | null
}

type Extra = { key: string; node: ReactNode; sound?: 'levelup' | 'catch' | 'gold' }

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
        m = { uid, dex: dex ?? now ?? 0, xp: 0, shared: false, fromLevel: null, toLevel: null, milestones: [], evolvesTo: null }
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
          extras.push({ key: k, sound: 'gold', node: <GoldCard amount={e.amount} /> })
          return
        case 'caught':
          extras.push({
            key: k,
            sound: 'catch',
            node: <CatchCard uid={e.uid} dex={e.dex} level={e.level} joined={e.joinedTeam} replacedLevel={e.replacedLevel} />,
          })
          return
        case 'fled':
          extras.push({ key: k, node: <div className="text-center text-xl text-muted">{data.species[e.dex]?.name} fled…</div> })
          return
        case 'boss_defeated':
          extras.push({
            key: k,
            node: <div className="text-center text-xl text-gold">The legendary {data.species[e.dex]?.name} was defeated!</div>,
          })
          return
        case 'gym_defeated':
          extras.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="flex items-center justify-center gap-3 border-[3px] border-ink bg-gold p-2 text-center">
                {e.badge && <BadgeIcon badge={e.badge} earned size={36} />}
                <div>
                  <div className="text-2xl leading-none">{e.role === 'champion' ? 'YOU ARE THE CHAMPION!' : `${e.name} defeated!`}</div>
                  {e.badge && <div className="text-lg">You earned the {e.badge}!</div>}
                </div>
              </div>
            ),
          })
          return
        case 'secret_unlocked': {
          const a = data.areas.find((x) => x.id === e.areaId)
          extras.push({
            key: k,
            sound: 'catch',
            node: (
              <div className="pixel-panel-dark p-2 text-center">
                <div className="text-xl text-gold">A secret area has appeared!</div>
                <div className="text-lg">{a?.name ?? '???'} is now on the Map.</div>
              </div>
            ),
          })
          return
        }
        case 'area_cleared': {
          const next = data.areas.find((a) => a.id === e.nextAreaId)
          extras.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="border-[3px] border-ink bg-hp-green p-2 text-center">
                <div className="text-2xl">AREA CLEARED!</div>
                <div className="text-lg">{next ? `${next.name} is now open on the Map.` : 'Every area is cleared!'}</div>
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

const CONFETTI = ['#e8b44a', '#c2452d', '#547acc', '#4aa84a', '#d44873', '#f7f2e0']

/** A little burst of pixel confetti from the middle of its box (skipped with reduced motion). */
function Confetti() {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const bits = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4
        const r = 26 + Math.random() * 22
        return { x: Math.cos(a) * r, y: Math.sin(a) * r - 10, rot: Math.random() * 360, color: CONFETTI[i % CONFETTI.length]! }
      }),
    [],
  )
  if (reduced) return null
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5"
          style={{ background: b.color, boxShadow: '0 0 0 1px #2a2438' }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 26], opacity: [1, 1, 0], rotate: b.rot }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}

/**
 * One Pokémon: sprite, name, level and XP on one line (with its XP bar), and one line below for what it earned —
 * a level-up (the sprite pulses, confetti flies), new dice and milestones, an evolution to come.
 */
function MonRow({ m }: { m: MonRecap }) {
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, m.uid) : undefined))
  const reduced = useGame((s) => s.settings.reducedMotion)
  const species = data.species[m.dex]
  if (!species) return null
  const leveled = m.toLevel != null
  const level = inst?.level ?? m.toLevel ?? 0
  const type1 = species.type1
  const chips: ReactNode[] = []
  if (leveled)
    chips.push(
      <span key="lv" className="border-2 border-ink bg-gold px-1.5 text-lg leading-tight">
        LEVEL UP! {m.fromLevel != null && m.toLevel! - m.fromLevel > 1 ? `Lv.${m.fromLevel}→${m.toLevel}` : `Lv.${m.toLevel}`}
      </span>,
    )
  m.milestones.forEach((ms, i) =>
    chips.push(
      <span key={`m${i}`} className="border-2 border-ink bg-panel px-1.5 text-lg leading-tight">
        {milestoneText(ms, type1)}
      </span>,
    ),
  )
  if (m.evolvesTo != null)
    chips.push(
      <span key="evo" className="border-2 border-ink bg-ink px-1.5 text-lg leading-tight text-panel">
        Evolving into {data.species[m.evolvesTo]?.name ?? '???'}…
      </span>,
    )
  return (
    <div className={cx('border-[3px] border-ink p-2', leveled ? 'bg-gold/25' : 'bg-panel')}>
      <div className="flex items-center gap-2">
        <motion.span
          className="relative shrink-0"
          initial={false}
          animate={leveled && !reduced ? { scale: [1, 1.35, 1, 1.25, 1] } : undefined}
          transition={{ duration: 0.9, delay: 0.15 }}
        >
          <MiniSprite dex={m.dex} size={40} className="-my-2" />
          {leveled && <Confetti />}
        </motion.span>
        <span className="min-w-0 truncate text-xl leading-none">{species.name}</span>
        <span className="shrink-0 text-lg leading-none">Lv.{level}</span>
        <span className="ml-auto shrink-0 text-lg leading-none">
          +{m.xp} XP{m.shared && <span className="text-sm text-muted"> Multi</span>}
        </span>
      </div>
      {inst && <XpBar inst={inst} className="mt-1" />}
      {chips.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{chips}</div>}
    </div>
  )
}

/**
 * The rewards after a K.O. Built for phones: the recap scrolls, the action button never does (it sits at the bottom of
 * the card). One row per Pokémon with its celebrations under it; then gold, catches, badges. Evolutions play after
 * CONTINUE, one after another, and only then does the game move on.
 */
export function VictoryView() {
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const { mons, extras, evolutions } = useRecap(run.events)
  const pace = usePace()
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
      const sound = next && 'uid' in next ? (next.toLevel != null ? 'levelup' : undefined) : next?.sound
      if (sound) sfx(sound)
    }, 650 * pace)
    return () => clearTimeout(t)
  }, [shown, allShown, mons, extras, pace])
  // The first row's level-up sound (it appears without waiting).
  useEffect(() => {
    if (mons[0]?.toLevel != null) sfx('levelup')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (action: () => void) => () => (evolutions.length ? setThen(() => action) : action())

  const enemy = battle?.state.enemy
  const hasNext = trainerHasNext()
  const enc = run.encounter
  const nextMon =
    hasNext && (enc?.kind === 'trainer' || enc?.kind === 'gym') && run.trainer ? enc.team[run.trainer.index + 1] : null
  const trainerLabel = enc?.kind === 'gym' || enc?.kind === 'trainer' ? trainerTitle(enc) : 'The trainer'
  // This fight cleared the area: offer the newly opened one straight away.
  const clearedTo = run.events.flatMap((e) => (e.kind === 'area_cleared' && e.nextAreaId ? [e.nextAreaId] : []))[0]
  const nextArea = clearedTo ? data.areas.find((a) => a.id === clearedTo) : undefined

  if (then) return <EvolutionQueue items={evolutions} onDone={then} />

  const footer = !allShown ? (
    <PixelButton variant="primary" size="lg" className="w-full" onClick={() => setShown(Number.MAX_SAFE_INTEGER)}>
      SKIP ▸▸
    </PixelButton>
  ) : run.pendingCatchId ? null : hasNext && nextMon ? (
    <PixelButton variant="primary" size="lg" className="w-full" onClick={go(() => continueAfterVictory(lead ?? defaultLead()))}>
      NEXT BATTLE
    </PixelButton>
  ) : nextArea ? (
    <div className="flex gap-2">
      <PixelButton
        variant="primary"
        size="lg"
        className="flex-1 whitespace-nowrap"
        onClick={go(() => {
          continueAfterVictory()
          enterArea(nextArea.id)
        })}
      >
        <PixelIcon name="map" size={20} />
        NEW AREA
      </PixelButton>
      <PixelButton size="lg" className="flex-1" onClick={go(() => continueAfterVictory())}>
        STAY
      </PixelButton>
    </div>
  ) : (
    <PixelButton variant="primary" size="lg" className="w-full" onClick={go(() => continueAfterVictory())}>
      CONTINUE
    </PixelButton>
  )

  return (
    <Overlay footer={footer}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl leading-none">{battle?.state.kind === 'boss' ? 'LEGENDARY VICTORY!' : 'VICTORY!'}</div>
        {enemy && (
          <div className="min-w-0 truncate text-lg text-muted">
            {enemy.name} Lv.{enemy.level} defeated
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <AnimatePresence initial={!reduced}>
          {mons.slice(0, shown).map((m) => (
            <motion.div key={m.uid} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <MonRow m={m} />
            </motion.div>
          ))}
          {extras.slice(0, Math.max(0, shown - mons.length)).map((c) => (
            <motion.div key={c.key} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              {c.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {allShown && run.pendingCatchId && <TeamChoice />}
      {allShown && !run.pendingCatchId && hasNext && nextMon && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <motion.div className="shrink-0" initial={reduced ? false : { x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
              <TrainerSprite src={enc?.kind === 'trainer' || enc?.kind === 'gym' ? enc.spriteUrl : null} size={72} />
            </motion.div>
            <div className="text-lg leading-tight">
              {trainerLabel} is about to send out {data.species[nextMon.dex]?.name} (Lv.{nextMon.level}). Switch freely:
            </div>
          </div>
          <LeadPicker value={lead} onChange={setLead} />
        </div>
      )}
    </Overlay>
  )
}

export function WipeView() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const areaId = useGame((s) => s.run.areaId)
  const area = data.areas.find((a) => a.id === areaId)
  const p = save && areaId ? progressOf(save, areaId) : null
  const done = p?.roundsDone ?? 0
  return (
    <Overlay
      footer={
        <PixelButton variant="primary" size="lg" className="w-full" onClick={afterWipe}>
          TRY AGAIN
        </PixelButton>
      }
    >
      <div className="mb-2 text-center text-4xl">Your team fainted…</div>
      <p className="copy mb-3 text-lg">
        You hurried back to the start of {area?.name}. Your Pokémon have been fully healed, and you keep your Pokédollars,
        items and your Pokémon's levels.{' '}
        The round is lost{done > 0 ? ', but the rounds you had already finished stay done' : ''}. A new round starts with a
        freshly shuffled deck.
      </p>
      {area && p && <RoundsCounter area={area} progress={p} />}
    </Overlay>
  )
}

export function StalemateView() {
  return (
    <Overlay
      footer={
        <PixelButton variant="primary" size="lg" className="w-full" onClick={afterStalemate}>
          CONTINUE
        </PixelButton>
      }
    >
      <div className="mb-2 text-center text-4xl">Stalemate</div>
      <p className="copy text-lg">
        Neither side can land a single blow on the other, so the fight is called off. No rewards — but no harm done beyond
        the damage already taken.
      </p>
    </Overlay>
  )
}
