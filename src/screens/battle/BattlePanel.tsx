// The battle panel under the stage: the dice tray, the readout under it (combo, damage math, effectiveness, statuses),
// the team pips, the switch rows and the Bag. Every number comes from the engine (computeDamage, statusesFromRoll, comboDice).
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  comboTier,
  faceOf,
  type Battler,
  type ComboKey,
  type DamageResult,
  type DieType,
  type LogEntry,
  type RolledDie,
  type Side,
  type StatusApplication,
} from '@/engine'
import { feelSound } from '@/audio/feel'
import { sfx } from '@/audio/sfx'
import { Chip, StatusChip } from '@/components/Chip'
import { PixelButton } from '@/components/PixelButton'
import { DiceSet } from '@/components/DiceSet'
import { Die } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { HpBar } from '@/components/HpBar'
import { MiniSprite } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { planScore, scoreLength, type ScoreBeat } from '@/fx/dice/score'
import { useT } from '@/i18n/react'
import { chancePercent, comboName } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { useMotion } from '@/lib/motion'
import { usePace } from '@/lib/pace'
import { useGame } from '@/store/game'
import { BoosterChip } from '@/screens/events/world'
import { PALETTE } from '@/theme/colors'
import { cx } from '@/theme/util'

export interface TrayDice {
  side: Side
  dice: RolledDie[]
  /** Change one to replay that die's tumble. */
  keys: string[]
}

/** A tray's throw as one string (its dice's roll keys): the readout waits until DiceTray says these are all down. */
export const trayKeyOf = (tray: TrayDice | null) => (tray ? tray.keys.slice(0, tray.dice.length).join(',') : '')

/** What the damage count-up shows so far (docs/38 F2a), from useDamageReveal. */
export interface ScoreView {
  id: number
  /** The dice whose "+N" has popped (their points, from the engine). */
  pops: { die: number; n: number }[]
  key: ComboKey | null
  tier: 0 | 1 | 2 | 3 | 4
  /** The combo has landed: its chip, its ring, its tier's flourish. */
  combo: boolean
  /** The total shown: a whole number on its way to the engine's damage. */
  value: number
}

/**
 * The count-up as it goes, beat by beat. A throw makes a dozen beats or more, 35 ms apart: held in the battle screen's
 * state, each one re-rendered the whole screen (stage, team, buttons) just as the dice landed, more work than a slow
 * phone gets done in 35 ms (players felt a freeze there, 2026-10-24). Only the tray and the readout read it
 * (`useScore`), so a beat redraws them alone.
 */
export interface ScoreFeed {
  get: () => ScoreView | null
  subscribe: (fn: () => void) => () => void
}

type ScoreSet = ScoreView | null | ((s: ScoreView | null) => ScoreView | null)

export function scoreFeed(): ScoreFeed & { set: (v: ScoreSet) => void } {
  let view: ScoreView | null = null
  const fns = new Set<() => void>()
  return {
    get: () => view,
    subscribe: (fn) => {
      fns.add(fn)
      return () => fns.delete(fn)
    },
    set: (v) => {
      const next = typeof v === 'function' ? v(view) : v
      if (next === view) return
      view = next
      fns.forEach((fn) => fn())
    },
  }
}

const noFeed = () => () => {}
const noView = () => null

/** The count-up's view now: the feed's latest beat, or a fixed view (the Kitchen Sink's). */
export function useScore(score: ScoreFeed | ScoreView | null | undefined): ScoreView | null {
  const feed = score && 'subscribe' in score ? score : null
  const live = useSyncExternalStore(feed?.subscribe ?? noFeed, feed?.get ?? noView)
  return feed ? live : ((score as ScoreView | null | undefined) ?? null)
}

// The tray's own moves (Web Animations, in steps): a 2 px shake for a tier-3+ combo, a 2-frame jitter before a throw.
const step = (tx: number) => ({ transform: `translateX(${tx}px)`, easing: 'steps(1, end)' })
const TRAY_SHAKE = [step(-2), step(2), step(-2), step(2), { transform: 'none' }]
const TRAY_JITTER = [step(-2), step(2), { transform: 'none' }]

/**
 * Your dice land on their own; tap one to lift it for the reroll (red outline, ↻ tag), the combo's dice wear a gold
 * ring and gold corner brackets. The foe's dice are smaller and can't be pressed. The tray knows when the last die of
 * a throw is down (`onSettled`): it lands heavy; the readout waits for it.
 */
export function DiceTray({
  tray,
  live,
  selected,
  combo,
  onToggle,
  size,
  foeName,
  children,
  onSettled,
  score: scoreIn,
  hand,
  anticipate = 0,
  nervous = false,
  foeSize = Math.min(40, size),
}: {
  tray: TrayDice | null
  /** The roll you can act on (not a replayed one). */
  live: boolean
  selected: readonly boolean[]
  /** Indexes of the dice that make the combo. */
  combo: ReadonlySet<number>
  onToggle?: (i: number) => void
  /** Your dice's size; the foe's are smaller. */
  size: number
  foeName: string
  /** Shown instead of dice (the catch's ball picker). */
  children?: ReactNode
  /** Every die of this throw is down: its trayKeyOf. */
  onSettled?: (key: string) => void
  /** The count-up under way: the dice's "+N", the combo's ring tier, a tier 3's shake, a tier 4's banner. */
  score?: ScoreFeed | ScoreView | null
  /** No throw on the tray yet: whose turn it is, its dice waiting in hand, face down (F8c, P1c). */
  hand?: { side: Side; dice: readonly DieType[] }
  /** Bump it to jitter the tray for two frames, just before a throw (F8c). */
  anticipate?: number
  /** The last reroll is next (F9a): the picked dice jitter. */
  nervous?: boolean
  /** The foe's dice's size: 40 px, or bigger in a panel with room (P1c). */
  foeSize?: number
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const score = useScore(scoreIn)
  const { level, calm } = useMotion()
  const pace = usePace()
  const foe = (tray ?? hand)?.side === 'enemy'
  const box = useRef<HTMLDivElement>(null)

  // Which of this throw's dice are down. Read through a ref: a die calls back long after the render that made it.
  const keys = tray ? tray.keys.slice(0, tray.dice.length) : []
  const latest = useRef({ keys, foe, level, onSettled })
  latest.current = { keys, foe, level, onSettled }
  const down = useRef(new Set<string>())
  const [squash, setSquash] = useState<string | null>(null)
  const land = (key: string) => {
    const now = latest.current
    down.current.add(key)
    if (!now.keys.includes(key) || !now.keys.every((k) => down.current.has(k))) return
    down.current = new Set(now.keys)
    // The last one down lands heavy (F8b): a thud and a squash; your own dice buzz too (the haptics' own switch).
    if (now.level !== 'off') {
      feelSound('die.landHeavy')
      setSquash(key)
    }
    if (!now.foe) haptic('diceLand')
    now.onSettled?.(now.keys.join(','))
  }

  // F8c: a two-frame jitter of the tray just before it's thrown; none when the screen should be calm.
  useEffect(() => {
    if (anticipate && !calm) box.current?.animate?.(TRAY_JITTER, { duration: 100 * pace })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anticipate])

  // F2b: a tier 3 or 4 combo shakes the tray 2 px; a tier 4 names itself over it, with one white flash.
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null)
  useEffect(() => {
    if (!score?.combo) return
    if (score.tier >= 3 && !calm) box.current?.animate?.(TRAY_SHAKE, { duration: 200 * pace })
    if (score.tier < 4 || !score.key) return
    setBanner({ id: score.id, text: t('ui.battle.comboBanner', { combo: comboName(score.key) }) })
    const timer = setTimeout(() => setBanner(null), 1400 * pace)
    return () => {
      clearTimeout(timer)
      setBanner(null)
    }
    // Once per run, when its combo lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score?.id, score?.combo])

  const tier = score?.combo ? score.tier : 0
  return (
    <div
      ref={box}
      role="group"
      aria-label={foe ? t('ui.battle.foeDice', { name: foeName }) : t('ui.battle.yourDice')}
      className="relative flex min-h-[64px] flex-wrap items-end justify-center gap-2"
    >
      {children ??
        (tray
          ? tray.dice.map((d, i) => {
              const key = tray.keys[i]
              const pop = !foe ? score?.pops.find((p) => p.die === i) : undefined
              return (
                // Keyed by its throw: a die thrown in ahead of it (a Mega's) moves it along without a fresh tumble.
                <span key={key ?? i} className="relative inline-flex">
                  <Die
                    type={d.type}
                    face={faceOf(d, data)}
                    size={foe ? foeSize : size}
                    rollKey={key}
                    delay={i * 0.05}
                    selected={live && !foe && !!selected[i]}
                    combo={live && !foe && combo.has(i)}
                    tier={tier}
                    squash={!!key && squash === key}
                    jitter={nervous && !calm && live && !foe && !!selected[i]}
                    onLand={key ? () => land(key) : undefined}
                    onClick={onToggle && !foe ? () => onToggle(i) : undefined}
                    locked={foe}
                    asButton={!foe}
                  />
                  {pop && (
                    <span key={score!.id} className="score-pop font-pixel text-[22px] leading-none" aria-hidden>
                      +{pop.n}
                    </span>
                  )}
                </span>
              )
            })
          : hand?.dice.map((ty, i) => (
              <Die key={`h${i}`} type={ty} face={null} size={foe ? foeSize : size} locked={foe} />
            )))}
      {banner && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
          {!calm && <span key={`f${banner.id}`} className="tray-flash absolute -inset-1" />}
          <span
            key={banner.id}
            className="combo-banner relative whitespace-nowrap bg-gold px-3 pb-1 pt-0.5 text-[26px] uppercase leading-none text-ink shadow-ring"
          >
            {banner.text}
          </span>
        </span>
      )}
    </div>
  )
}

/** What can come between a turn's start and its throw: its dice stay in hand through them (docs/38 P1c). */
const BEFORE_THROW = new Set<string>(['status_tick', 'status', 'item', 'heal', 'cleansed', 'transform'])

/** The turn the log has reached whose dice haven't been thrown yet, if any: read from the log, never decided here. */
export function turnInHand(log: readonly LogEntry[], cursor: number) {
  for (let i = Math.min(cursor, log.length - 1); i >= 0; i--) {
    const e = log[i]!
    if (e.kind === 'turn') return e
    if (!BEFORE_THROW.has(e.kind)) return null
  }
  return null
}

let runs = 0

/**
 * The readout follows the dice (F2d): it shows once the last die of a throw is down (`settled`) and stays through a
 * reroll, with the roll before's numbers, until the new dice land. Each landing then plays the count-up (F2a,
 * fx/dice/score.ts): the scoring dice's "+N" a semitone apart, the combo's own beat, then the total counting to the
 * engine's damage. Nothing here decides a number: they all come from `preview`.
 */
export function useDamageReveal(
  preview: Preview | null,
  settled: boolean,
  throwKey: string,
): {
  preview: Preview | null
  score: ScoreFeed | null
  /** The combo may show: its beat has landed, or there's no count-up to wait for. */
  combo: boolean
} {
  const { level } = useMotion()
  const pace = usePace()
  const r = preview?.r
  // What makes a new reveal: other dice, or the same dice worth another number (a new target).
  const sig = r ? `${throwKey}|${r.final}|${r.combo?.key ?? ''}|${r.attackType ?? ''}` : null
  const [shown, setShown] = useState<{ sig: string; preview: Preview } | null>(null)
  const [run, setRun] = useState<{ id: number; beats: ScoreBeat[]; to: number } | null>(null)
  const [feed] = useState(scoreFeed)
  const setScore = feed.set
  // The one beat the battle screen redraws for: a boolean, so the other beats leave it alone.
  const combo = useSyncExternalStore(feed.subscribe, () => {
    const s = feed.get()
    return !s || s.combo
  })

  // The turn moved on (an attack, a switch…): nothing to show until the next throw is down.
  const gone = !preview
  useEffect(() => {
    if (!gone) return
    setShown(null)
    setRun(null)
    setScore(null)
  }, [gone, setScore])

  useEffect(() => {
    if (!preview || !settled || !sig || shown?.sig === sig) return
    setShown({ sig, preview })
    // A reroll counts on from what showed before; a fresh throw from nothing.
    const res = preview.r
    const from = shown?.preview.r.final ?? 0
    const key = res.combo?.key ?? null
    const tier = comboTier(key)
    const id = ++runs
    const points = res.perDie.map((p) => p.value + p.bonus)
    setRun({ id, beats: planScore({ points, tier, from, to: res.final, level, pace }), to: res.final })
    setScore({ id, pops: [], key, tier, combo: false, value: from })
    // Only a new throw, or new numbers, start one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, settled])

  // A new throw cuts a count short: its end state at once, and no "+N" left to pop over a die in the air.
  useEffect(() => {
    if (shown && !shown.sig.startsWith(`${throwKey}|`)) setRun(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwKey])

  // The run's beats, each with its sound.
  useEffect(() => {
    if (!run) return
    const { id, beats, to } = run
    const mine = (f: (s: ScoreView) => ScoreView) => setScore((s) => (s && s.id === id ? f(s) : s))
    let clicked = -Infinity
    const timers = beats.map((b) =>
      setTimeout(() => {
        if (b.kind === 'pop') {
          feelSound('score.tick', b.tick)
          mine((s) => ({ ...s, pops: [...s.pops, { die: b.die, n: b.n }] }))
        } else if (b.kind === 'combo') {
          feelSound(`combo.${b.tier}`)
          mine((s) => ({ ...s, combo: true }))
        } else {
          // One click per step, never a buzz.
          if (performance.now() - clicked >= 30) {
            clicked = performance.now()
            feelSound('score.count')
          }
          mine((s) => ({ ...s, value: b.value }))
        }
      }, b.at),
    )
    // The "+N"s have risen and gone: none left to pop again on a die thrown anew.
    timers.push(setTimeout(() => mine((s) => ({ ...s, pops: [] })), scoreLength(beats) + 700 * pace))
    return () => {
      timers.forEach(clearTimeout)
      // Cut short (a reroll, an attack): its end state, at once.
      mine((s) => ({ ...s, pops: [], combo: true, value: to }))
    }
    // One run per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  if (!preview || !shown) return { preview: null, score: null, combo }
  return { preview: shown.sig === sig ? preview : shown.preview, score: feed, combo }
}

export interface Preview {
  r: DamageResult
  /** What the roll's status faces do (engine `statusesFromRoll`). */
  statuses: StatusApplication[]
  recoil: number
}

/** A status chip's counter: Burn's stacks, a Freeze's or a Paralysis's chance short of sure, how confused, the heal. */
function statusCount(s: StatusApplication): string | undefined {
  if (s.status === 'burn') return s.stacks && s.stacks > 1 ? `×${s.stacks}` : undefined
  if (s.chance != null) return s.chance < 1 ? `${chancePercent(s.chance)}%` : undefined
  if (s.status === 'confuse') return s.level && s.level > 1 ? `×${s.level}` : undefined
  if (s.status === 'heal') return s.amount ? `+${s.amount}` : undefined
  return undefined
}

/**
 * Under the tray, one line led by the damage, big ("26 DMG": a button, the math behind it, shown once, under the
 * readout), the combo chip when there is one, how effective it is, and a chip per status the faces cause, with its
 * stacks, chance, level or heal. With a count-up under way (`score`), the combo shows once it has landed and the
 * damage counts up to the engine's number.
 */
export function Readout({
  preview,
  activeName,
  open,
  onToggle,
  score: scoreIn,
}: {
  preview: Preview
  activeName: string
  /** The breakdown is showing. */
  open: boolean
  onToggle: () => void
  /** The count-up under way (useDamageReveal). */
  score?: ScoreFeed | ScoreView | null
}) {
  const { t } = useT()
  const score = useScore(scoreIn)
  const { r } = preview
  const eff = r.immune ? 'none' : r.effectiveness > 1 ? 'up' : r.effectiveness < 1 ? 'down' : null
  const combo = r.combo && (!score || score.combo) ? r.combo : null
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('ui.battle.damageDetails', {
          amount: r.final,
          action: t(open ? 'ui.battle.hide' : 'ui.battle.show'),
        })}
        title={t('ui.battle.damageTitle')}
        onClick={onToggle}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 whitespace-nowrap px-1 font-pixel-sm text-[18px] leading-none text-ink md:min-h-[32px]"
      >
        {/* The count is for the eye: the button's name already says the engine's number. */}
        <b
          className="font-pixel text-[30px] font-normal leading-none tabular-nums underline decoration-dotted decoration-2 underline-offset-4"
          aria-hidden
        >
          {t('ui.battle.dmg', { amount: score ? score.value : r.final })}
        </b>
      </button>
      {combo && (
        <Chip tone="gold" className="text-[16px]">
          {t('ui.battle.comboChip', { combo: comboName(combo.key), bonus: combo.bonus })}
        </Chip>
      )}
      {r.boost && <BoosterChip type={r.boost.type} n={r.boost.multiplier} />}
      {eff && (
        <span
          className={cx(
            'font-pixel-sm text-[16px] leading-none',
            eff === 'up' ? 'text-good' : eff === 'down' ? 'text-[#8a5a2f] dark:text-[#e8b080]' : 'text-muted',
          )}
        >
          {eff === 'up' ? t('ui.lead.strong') : eff === 'down' ? t('ui.lead.weak') : t('ui.battle.effNone')}
        </span>
      )}
      {preview.statuses.map((s) => (
        <StatusChip key={s.status} status={s.status} count={statusCount(s)} />
      ))}
      {preview.recoil > 0 && (
        <span className="w-full text-center font-pixel-sm text-[16px] leading-tight text-danger">
          {t('ui.battle.confusedRecoil', { name: activeName, amount: preview.recoil })}
        </span>
      )}
    </>
  )
}

/** Your team at the bottom: icon and HP. Tap one to send it in; after a K.O. the ones that can go out pulse. */
export function TeamPips({
  team,
  activeUid,
  hpOf,
  canSwitch,
  calling,
  onPick,
  compact,
}: {
  team: Battler[]
  activeUid: string
  hpOf: (b: Battler) => number
  /** A tap does something right now (your turn, or a forced switch). */
  canSwitch: boolean
  /** "Who goes out next?": the ones that can, pulse. */
  calling: boolean
  onPick: (b: Battler) => void
  /** Narrower pips (44 px), for a row that holds more buttons beside them: the raid's. */
  compact?: boolean
}) {
  const { t } = useT()
  const reduced = useGame((s) => s.settings.reducedMotion)
  return (
    <div role="group" aria-label={t('ui.battle.switchGroup')} className="flex flex-wrap gap-1.5">
      {team.map((b) => {
        const hp = hpOf(b)
        const active = b.uid === activeUid
        const out = hp <= 0
        const open = canSwitch && !active && !out
        const pct = Math.max(0, Math.min(1, hp / b.maxHp))
        return (
          <button
            key={b.uid}
            type="button"
            onClick={open ? blip(() => onPick(b)) : undefined}
            aria-disabled={!open}
            aria-label={
              out
                ? t('ui.battle.pipFainted', { name: b.name })
                : t(active ? 'ui.battle.pipActive' : 'ui.battle.pipSwitch', {
                    name: b.name,
                    hp,
                    max: b.maxHp,
                  })
            }
            className={cx(
              'grid min-h-[48px] justify-items-center gap-px px-1 pb-[5px] pt-0.5',
              compact ? 'w-[44px]' : 'w-[52px]',
              // One or the other: side by side, the stylesheet's order picked plain paper over the gold.
              active ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-ring',
              out && 'opacity-55 grayscale',
              !open && 'cursor-default',
              calling && open && !reduced && 'bt-call',
            )}
          >
            <MiniSprite dex={b.dex} size={32} className="-mb-1 -mt-0.5" />
            <span
              className={cx('relative h-1.5 bg-line shadow-ring-thin', compact ? 'w-9' : 'w-10')}
              aria-hidden
            >
              <i
                className="absolute inset-y-px left-px block"
                style={{
                  width: `calc(${pct * 100}% - 2px)`,
                  background: pct > 0.5 ? PALETTE.hpGreen : pct > 0.2 ? PALETTE.hpYellow : PALETTE.hpRed,
                }}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The button blip before the action, as a PixelButton plays it: the pips and the Bag aren't PixelButtons (docs/38). */
function blip(act: () => void) {
  return () => {
    sfx('button')
    act()
  }
}

/** The Bag: one item a turn, and it doesn't end the turn. */
export function BagButton({
  disabled,
  title,
  keys,
  onClick,
}: {
  disabled: boolean
  title?: string
  /** Its keyboard shortcut, said to screen readers (the battle's B). */
  keys?: string
  onClick: () => void
}) {
  const { t } = useT()
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-keyshortcuts={keys}
      onClick={blip(onClick)}
      className="inline-flex min-h-[48px] items-center gap-1.5 bg-paper py-1 pl-2 pr-3 text-[18px] leading-none text-ink shadow-card disabled:opacity-50"
    >
      <PixelIcon name="bag" size={20} />
      {t('ui.battle.bag')}
    </button>
  )
}

/** A Pokémon to send in: sprite, name, level, HP; `detailed` adds its types and dice (the pick after a K.O.). */
export function SwitchRow({
  b,
  onPick,
  disabled,
  detailed,
}: {
  b: Battler
  onPick: () => void
  disabled?: boolean
  /** Its types, dice and rerolls too: the pick after a K.O. */
  detailed?: boolean
}) {
  const { t } = useT()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="pixel-panel flex w-full items-center gap-2 p-2 text-left enabled:hover:bg-paper disabled:opacity-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-xl leading-none">
          <span className="flex items-center gap-1">
            <MiniSprite dex={b.dex} size={40} className="-my-2" />
            {b.name}
          </span>
          <span>{t('ui.common.level.short', { n: b.level })}</span>
        </div>
        <HpBar hp={b.hp} max={b.maxHp} height={8} className="mt-1" />
        {detailed && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex gap-1">
              {b.types.map((x) => (
                <TypeBadge key={x} type={x} size="sm" />
              ))}
            </span>
            <DiceSet dice={b.dice} size={20} />
            <span className="ml-auto font-pixel-sm text-[16px] leading-none tabular-nums text-muted">
              {b.hp}/{b.maxHp}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

/**
 * Z-MOVE (docs/35): after the roll, the attack as the dice stand, with what its type adds (`hint`, said on hover and
 * read out). Gold like MEGA and G-MAX, the battle powers.
 */
export function ZMoveButton({ hint, disabled, onClick }: { hint: string; disabled?: boolean; onClick: () => void }) {
  const { t } = useT()
  return (
    <PixelButton
      size="sm"
      variant="gold"
      disabled={disabled}
      title={hint}
      aria-label={`${t('ui.battle.zMove')} — ${hint}`}
      onClick={onClick}
    >
      <PixelIcon name="sword" size={14} /> {t('ui.battle.zMove')}
    </PixelButton>
  )
}

/**
 * The battle's keys, shown discreetly on a computer (docs/43 §5.3): a line of key chips at the panel's foot, faint until
 * the pointer or the focus is in the panel, always there with More details. Not on phones (no keyboard). The buttons
 * carry the same keys as `aria-keyshortcuts`, so the line itself is only for the eye.
 */
export function KeyHints({ keys, className }: { keys: readonly (readonly [string, string])[]; className?: string }) {
  // More details' own flag, read straight from the store (the hooks module pulls the canvas code into tests).
  const details = useGame((s) => s.settings.details === true)
  if (!keys.length) return null
  return (
    <p
      aria-hidden
      data-key-hints
      className={cx(
        'm-0 hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 font-pixel-sm text-[16px] leading-none text-ink transition-opacity duration-150 lg:flex',
        details ? 'opacity-100' : 'opacity-0 group-focus-within/panel:opacity-100 group-hover/panel:opacity-100',
        className,
      )}
    >
      {keys.map(([key, what]) => (
        <span key={key} className="inline-flex items-center gap-1 whitespace-nowrap">
          <kbd className="min-w-[22px] bg-paper px-1 py-0.5 text-center font-pixel-sm text-[16px] leading-none shadow-ring">
            {key}
          </kbd>
          {what}
        </span>
      ))}
    </p>
  )
}
