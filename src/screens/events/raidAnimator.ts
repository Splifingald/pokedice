// Plays a raid's log one entry at a time, like the battle animator: every duel entry is told exactly as in a battle
// (describe), with the ally in front and the raid Pokémon standing in for the battle's two Pokémon, and the raid's own
// moments added — an ally stepping up, a bar breaking, a side sending its next Pokémon or running out. The ally sides'
// turns can play faster (the speed button). The UI never recomputes a rule.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BOSS_UID,
  type BattleState,
  type Battler,
  type LogEntry,
  type RaidLogEntry,
  type RaidMove,
  type RaidSide,
  type RaidTerrain,
  type RaidWeather,
} from '@/engine'
import { typeName } from '@/lib/format'
import { sfx } from '@/audio/sfx'
import { t } from '@/i18n'
import type { RaidRun } from '@/store/raidBattle'
import { describe, SCENE_TIMEOUT, type AnimatorContext, type Fx, type Step } from '../battle/useBattleAnimator'

export interface RaidFx extends Fx {
  /** Each side's Pokémon out, and the sides out of the raid, as the log has played; `activeUid` is the ally in front. */
  sideActive: string[]
  out: boolean[]
  broken: number
  /** A bar just broke. */
  barBreak: { id: number } | null
  /** The entry playing belongs to an ally side's turn: the ones the speed button plays faster. */
  fast: boolean
  /** The raid overhaul (docs/39), as the log has played: the weather or terrain, a move charging, the shield. */
  raidField: { weather: RaidWeather | null; terrain: RaidTerrain | null }
  charge: { move: RaidMove; fires: number } | null
  shield: { hp: number; max: number } | null
  /** Its last bar's power has begun. */
  final: boolean
}

let seq = 0
const nextId = () => ++seq

const RAID_ENTRIES = new Set([
  'raid_start',
  'raid_front',
  'raid_bar',
  'raid_next',
  'raid_out',
  'raid_end',
  'raid_field',
  'raid_charge',
  'raid_interrupt',
  'raid_move',
  'raid_skip',
  'raid_tick',
  'raid_heal',
  'raid_shield',
  'raid_bounce',
  'raid_boost',
  'raid_shift',
  'raid_final',
])
const isRaidEntry = (e: RaidLogEntry): e is Exclude<RaidLogEntry, LogEntry> => RAID_ENTRIES.has(e.kind)

function initFx(run: RaidRun): RaidFx {
  const st = run.state
  const hp: Record<string, number> = { [st.boss.uid]: st.boss.maxHp }
  for (const side of st.sides) for (const m of side.mons) hp[m.uid] = m.maxHp
  const lead = st.sides.map((s) => s.mons[0]!.uid)
  return {
    cursor: 0,
    message: '',
    hp,
    activeUid: lead[0]!,
    foeUid: st.boss.uid,
    fainted: {},
    dex: {},
    wornOut: {},
    tray: null,
    pop: null,
    banner: null,
    shake: null,
    flash: null,
    status: null,
    fly: null,
    scene: null,
    chip: null,
    cry: null,
    sideActive: lead,
    out: st.sides.map(() => false),
    broken: 0,
    barBreak: null,
    fast: false,
    raidField: { weather: null, terrain: null },
    charge: null,
    shield: null,
    final: false,
  }
}

/** The ally in front and the raid Pokémon as a battle state, so a duel entry reads exactly as it does in a battle. */
function frontState(run: RaidRun, f: RaidFx): BattleState {
  const allies = run.state.sides.flatMap((s) => s.mons)
  const activeIndex = Math.max(0, allies.findIndex((m) => m.uid === f.activeUid))
  return {
    ...(run.state.duel ?? ({} as BattleState)),
    kind: 'boss',
    player: allies,
    activeIndex,
    enemy: run.state.boss,
  }
}

/** A Pokémon of the raid by uid: the raid Pokémon, or any side's. */
export function battlerOf(run: RaidRun, uid: string): Battler | undefined {
  const st = run.state
  if (uid === st.boss.uid) return st.boss
  return st.sides.flatMap((s) => s.mons).find((m) => m.uid === uid)
}

/** The side a Pokémon fights for. */
export const sideOfUid = (sides: readonly RaidSide[], uid: string) => sides.findIndex((s) => s.mons.some((m) => m.uid === uid))

/**
 * Whether an entry belongs to a turn the speed button plays faster: an ally side's, from the ally that steps to the
 * front until the next one. Never the raid Pokémon's (even when it strikes back at an ally) or yours, nor the opening
 * and the end.
 */
export function fastTurn(e: RaidLogEntry, sides: readonly RaidSide[], was: boolean): boolean {
  if (e.kind === 'raid_front') return e.actor === 'ally' && sideOfUid(sides, e.ally) > 0
  if (e.kind === 'raid_start' || e.kind === 'raid_end') return false
  return was
}

/**
 * Whether a side's next Pokémon, sent after a K.O., is the one to step to the front next: the log's next ally in front
 * is it. When another side plays first, it waits beside the others for its turn, so it's never sent to the front only
 * to step straight back.
 */
export function frontsNext(log: readonly RaidLogEntry[], from: number, uid: string): boolean {
  for (let i = from; i < log.length; i++) {
    const e = log[i]!
    if (e.kind === 'raid_front') return e.ally === uid
  }
  return false
}

function describeRaid(e: RaidLogEntry, run: RaidRun, f: RaidFx, ctx: AnimatorContext): Step {
  const sides = run.state.sides
  const nameOf = (uid: string) => battlerOf(run, uid)?.name ?? t('ui.common.unknown')
  const boss = run.state.boss.name
  const raid = (apply: (x: RaidFx) => RaidFx) => apply as unknown as Step['apply']
  if (!isRaidEntry(e)) {
    // A side other than yours plays: "Ace Trainer Kai's Snorlax attacks!"
    if (e.kind === 'turn' && e.side === 'player' && sideOfUid(sides, e.uid) > 0) {
      const owner = sides[sideOfUid(sides, e.uid)]!.owner
      return { delay: 350, apply: (x) => ({ ...x, tray: null, fly: null, message: t('ui.raid.log.allyTurn', { owner, name: nameOf(e.uid) }) }) }
    }
    // A side swaps its Pokémon on its turn (you, or an ally whose Pokémon can't touch its foe): that side's Pokémon
    // out changes, and an ally's trainer is named.
    if (e.kind === 'switch') {
      const i = sideOfUid(sides, e.uid)
      const step = describe(e, frontState(run, f), ctx)
      return {
        ...step,
        apply: raid((x) => ({
          ...(step.apply(x) as RaidFx),
          ...(i > 0 && { message: t('ui.raid.log.next', { owner: sides[i]!.owner, name: nameOf(e.uid) }) }),
          sideActive: x.sideActive.map((u, k) => (k === i ? e.uid : u)),
        })),
      }
    }
    return describe(e, frontState(run, f), ctx)
  }
  switch (e.kind) {
    case 'raid_start':
      return { delay: 900, apply: raid((x) => ({ ...x, message: t('ui.raid.log.start', { boss }) })) }
    case 'raid_front':
      return {
        // The raid Pokémon striking back at the ally that just played: it's already in front.
        delay: e.ally === f.activeUid ? 0 : 380,
        apply: raid((x) => ({ ...x, activeUid: e.ally || x.activeUid, fly: null })),
      }
    case 'raid_bar':
      return {
        delay: 1500,
        sound: 'super',
        apply: raid((x) => ({
          ...x,
          message: t(e.barsLeft === 1 ? 'ui.raid.log.barLast' : 'ui.raid.log.bar', { boss, n: e.barsLeft }),
          hp: { ...x.hp, [BOSS_UID]: e.hpAfter },
          broken: e.broken,
          barBreak: { id: nextId() },
          banner: { id: nextId(), text: t('ui.raid.break'), tone: 'super' },
          shake: { id: nextId(), power: 10 },
          cry: { id: nextId(), dex: run.state.boss.dex },
        })),
      }
    case 'raid_next': {
      const owner = sides[e.side]?.owner ?? ''
      return {
        delay: 900,
        apply: raid((x) => ({
          ...x,
          message: e.side === 0 ? t('ui.log.goName', { name: nameOf(e.uid) }) : t('ui.raid.log.next', { owner, name: nameOf(e.uid) }),
          sideActive: x.sideActive.map((u, i) => (i === e.side ? e.uid : u)),
          activeUid: x.sideActive[e.side] === x.activeUid && frontsNext(run.log, f.cursor + 1, e.uid) ? e.uid : x.activeUid,
          fainted: { ...x.fainted, [e.uid]: false },
        })),
      }
    }
    case 'raid_out':
      return {
        delay: 1100,
        sound: 'faint',
        apply: raid((x) => ({
          ...x,
          message: t(e.side === 0 ? 'ui.raid.log.youOut' : 'ui.raid.log.out', { owner: sides[e.side]?.owner ?? '' }),
          out: x.out.map((o, i) => o || i === e.side),
        })),
      }
    case 'raid_end':
      return {
        delay: 600,
        apply: raid((x) => ({
          ...x,
          tray: null,
          message:
            e.result === 'won'
              ? t('ui.raid.log.won', { boss })
              : t(e.reason === 'forfeit' ? 'ui.raid.log.forfeit' : e.reason === 'stalemate' ? 'ui.raid.log.stalemate' : 'ui.raid.log.lost'),
        })),
      }
    default:
      return describeSpecial(e, run, f)
  }
}

type SpecialEntry = Extract<
  RaidLogEntry,
  {
    kind:
      | 'raid_field'
      | 'raid_charge'
      | 'raid_interrupt'
      | 'raid_move'
      | 'raid_skip'
      | 'raid_tick'
      | 'raid_heal'
      | 'raid_shield'
      | 'raid_bounce'
      | 'raid_boost'
      | 'raid_shift'
      | 'raid_final'
  }
>

/** The raid overhaul's moments (docs/39): what the engine decided, told and shown. */
function describeSpecial(e: SpecialEntry, run: RaidRun, f: RaidFx): Step {
  const boss = run.state.boss.name
  const nameOf = (uid: string) => battlerOf(run, uid)?.name ?? t('ui.common.unknown')
  const raid = (apply: (x: RaidFx) => RaidFx) => apply as unknown as Step['apply']
  void f
  switch (e.kind) {
    case 'raid_field': {
      const key = e.weather ? `ui.raid.x.weather.${e.weather}` : `ui.raid.x.terrain.${e.terrain}`
      return {
        delay: 1100,
        apply: raid((x) => ({ ...x, raidField: { weather: e.weather, terrain: e.terrain }, message: t(`${key}.start`) })),
      }
    }
    case 'raid_charge':
      return {
        delay: 1100,
        sound: 'levelup',
        apply: raid((x) => ({
          ...x,
          charge: { move: e.move, fires: e.fires },
          message: t(`ui.raid.x.charge.${e.move}`, { boss }),
          banner: { id: nextId(), text: t('ui.raid.x.chargeBanner'), tone: 'info' },
        })),
      }
    case 'raid_interrupt':
      return {
        delay: 1200,
        sound: 'super',
        apply: raid((x) => ({
          ...x,
          charge: null,
          message: t('ui.raid.x.interrupt', { boss }),
          banner: { id: nextId(), text: t('ui.raid.x.interrupted'), tone: 'super' },
          shake: { id: nextId(), power: 6 },
        })),
      }
    case 'raid_move':
      return {
        delay: 1100,
        apply: raid((x) => ({
          ...x,
          charge: null,
          message: t(`ui.raid.x.move.${e.move}`, { boss }),
          banner: { id: nextId(), text: t('ui.raid.x.moveBanner'), tone: 'weak' },
          shake: { id: nextId(), power: 8 },
          cry: { id: nextId(), dex: run.state.boss.dex },
        })),
      }
    case 'raid_skip':
      return { delay: 900, apply: raid((x) => ({ ...x, message: t(`ui.raid.x.skip.${e.reason}`, { boss }) })) }
    case 'raid_tick':
      return {
        delay: 800,
        sound: 'hit',
        apply: raid((x) => ({
          ...x,
          hp: { ...x.hp, [e.uid]: e.hpAfter },
          message: t(`ui.raid.x.tick.${e.cause}`, { name: nameOf(e.uid), boss }),
        })),
      }
    case 'raid_heal':
      return {
        delay: 800,
        sound: 'heal',
        apply: raid((x) => ({
          ...x,
          hp: { ...x.hp, [e.uid]: e.hpAfter },
          message: t(`ui.raid.x.heal.${e.cause}`, { name: nameOf(e.uid), boss }),
        })),
      }
    case 'raid_shield':
      return {
        delay: e.hp === e.max ? 900 : e.hp === 0 ? 900 : 0,
        ...(e.hp === 0 && { sound: 'super' as const }),
        apply: raid((x) => ({
          ...x,
          shield: e.hp > 0 ? { hp: e.hp, max: e.max } : null,
          ...(e.hp === e.max && { message: t('ui.raid.x.shieldUp', { boss }) }),
          ...(e.hp === 0 && { message: t('ui.raid.x.shieldBroken', { boss }), banner: { id: nextId(), text: t('ui.raid.break'), tone: 'super' } }),
        })),
      }
    case 'raid_bounce':
      return { delay: 800, apply: raid((x) => ({ ...x, message: t('ui.raid.x.bounce') })) }
    case 'raid_boost':
      return {
        delay: 900,
        sound: 'levelup',
        apply: raid((x) => ({
          ...x,
          message:
            e.cause === 'charge'
              ? t('ui.raid.x.boost.charge', { boss })
              : t(`ui.raid.x.boost.${e.cause}`, { boss, type: typeName(e.dice[0] ?? 'base') }),
        })),
      }
    case 'raid_shift':
      return {
        delay: 1000,
        sound: 'levelup',
        apply: raid((x) => ({ ...x, message: t('ui.raid.x.shift', { boss, type: typeName(e.type) }) })),
      }
    case 'raid_final':
      return {
        delay: 1400,
        sound: 'super',
        apply: raid((x) => ({
          ...x,
          final: true,
          message: e.dice.length ? t('ui.raid.x.finalDice', { boss, n: e.dice.length }) : t('ui.raid.x.final', { boss }),
          banner: { id: nextId(), text: t('ui.raid.x.finalBanner'), tone: 'super' },
          shake: { id: nextId(), power: 8 },
        })),
      }
  }
}

/**
 * The raid's log, played. Returns the display state, whether every entry has played (your input unlocks only then),
 * and the stage's two calls while an entry's scene plays.
 */
export function useRaidAnimator(
  run: RaidRun,
  instant: boolean,
  ctx: AnimatorContext,
  pace = 1,
  /** The opening is playing: nothing moves until it's done. */
  hold = false,
  /** The ally sides' turns play this many times faster (the speed button); read as each entry starts. */
  speedUp = 1,
): { fx: RaidFx; ready: boolean; sceneContact: () => void; sceneDone: () => void } {
  const [fx, setFx] = useState(() => initFx(run))
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const fxRef = useRef(fx)
  fxRef.current = fx
  const runRef = useRef(run)
  runRef.current = run
  const speedRef = useRef(speedUp)
  speedRef.current = speedUp
  const landing = useRef<((f: Fx, staged: boolean) => Fx) | null>(null)
  const pending = fx.cursor < run.log.length

  useEffect(() => {
    if (!pending || hold) return
    const cursor = fx.cursor
    const entry = runRef.current.log[cursor]!
    const step = describeRaid(entry, runRef.current, fxRef.current, ctxRef.current)
    const fast = fastTurn(entry, runRef.current.state.sides, fxRef.current.fast)
    const k = fast ? speedRef.current : 1
    const asRaid = (f: Fx) => f as RaidFx
    if (step.scene && !instant) {
      landing.current = step.land ?? null
      setFx((f) =>
        asRaid({ ...step.apply(f), fast, scene: { ...step.scene!, id: nextId(), cursor, speed: k } } as Fx),
      )
      step.effect?.()
      const timer = setTimeout(
        () =>
          setFx((f) => {
            if (f.cursor !== cursor) return f
            const land = landing.current
            landing.current = null
            return asRaid({ ...(land ? land(f, true) : f), scene: null, cursor: cursor + 1 })
          }),
        SCENE_TIMEOUT,
      )
      return () => clearTimeout(timer)
    }
    setFx((f) => {
      const applied = step.apply(f)
      return { ...asRaid(step.land ? step.land(applied, false) : applied), fast }
    })
    if (step.sound) sfx(step.sound)
    step.effect?.()
    const timer = setTimeout(
      () => setFx((f) => (f.cursor === cursor ? { ...f, cursor: cursor + 1 } : f)),
      instant ? 0 : (step.delay * pace) / k,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.cursor, pending, hold])

  const sceneContact = useCallback(() => {
    const land = landing.current
    landing.current = null
    if (land) setFx((f) => land(f, true) as RaidFx)
  }, [])
  const sceneDone = useCallback(() => {
    const land = landing.current
    landing.current = null
    setFx((f) => (f.scene ? ({ ...(land ? land(f, true) : f), scene: null, cursor: f.scene.cursor + 1 } as RaidFx) : f))
  }, [])

  return { fx, ready: !pending, sceneContact, sceneDone }
}