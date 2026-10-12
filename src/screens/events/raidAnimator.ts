// Plays a raid's log one entry at a time, like the battle animator: every duel entry is told exactly as in a battle
// (describe), with the pair in front standing in for the battle's two Pokémon, and the raid's own moments added — the
// pair stepping up, a bar breaking, a summon arriving, a side sending its next Pokémon or running out, the summons
// fleeing. The ally sides' and the summons' turns can play faster (the speed button). The UI never recomputes a rule.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BOSS_UID, type BattleState, type Battler, type LogEntry, type RaidLogEntry, type RaidSide } from '@/engine'
import { sfx } from '@/audio/sfx'
import { t } from '@/i18n'
import type { RaidRun } from '@/store/raidBattle'
import { describe, SCENE_TIMEOUT, type AnimatorContext, type Fx, type Step } from '../battle/useBattleAnimator'

export interface RaidFx extends Fx {
  /** The foe in front (the battle's `enemy`); `activeUid` is the ally in front. */
  foeUid: string
  /** Each side's Pokémon out, and the sides out of the raid, as the log has played. */
  sideActive: string[]
  out: boolean[]
  /** The summons on the field, in summoning order. */
  field: string[]
  broken: number
  points: number
  /** A bar just broke; a summon just arrived; the summons just ran. */
  barBreak: { id: number } | null
  arrived: { id: number; uid: string } | null
  fled: { id: number; uids: string[] } | null
  /** Every Pokémon the log has met, summons gone from the field included. */
  known: Record<string, Battler>
  /** The entry playing belongs to an ally side's or a summon's turn: the ones the speed button plays faster. */
  fast: boolean
}

let seq = 0
const nextId = () => ++seq

const RAID_ENTRIES = new Set(['raid_start', 'raid_front', 'raid_bar', 'raid_summon', 'raid_next', 'raid_out', 'raid_flee', 'raid_end'])
const isRaidEntry = (e: RaidLogEntry): e is Exclude<RaidLogEntry, LogEntry> => RAID_ENTRIES.has(e.kind)

function initFx(run: RaidRun): RaidFx {
  const st = run.state
  const known: Record<string, Battler> = { [st.boss.uid]: st.boss }
  const hp: Record<string, number> = { [st.boss.uid]: st.boss.maxHp }
  for (const side of st.sides)
    for (const m of side.mons) {
      known[m.uid] = m
      hp[m.uid] = m.maxHp
    }
  const lead = st.sides.map((s) => s.mons[0]!.uid)
  return {
    cursor: 0,
    message: '',
    hp,
    activeUid: lead[0]!,
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
    foeUid: BOSS_UID,
    sideActive: lead,
    out: st.sides.map(() => false),
    field: [],
    broken: 0,
    points: 0,
    barBreak: null,
    arrived: null,
    fled: null,
    known,
    fast: false,
  }
}

/** The pair in front as a battle state, so a duel entry reads exactly as it does in a battle. */
function frontState(run: RaidRun, f: RaidFx): BattleState {
  const allies = run.state.sides.flatMap((s) => s.mons)
  const foe = foeOf(run, f, f.foeUid)
  const activeIndex = Math.max(0, allies.findIndex((m) => m.uid === f.activeUid))
  return { ...(run.state.duel ?? ({} as BattleState)), kind: 'boss', player: allies, activeIndex, enemy: foe }
}

/** A Pokémon by uid: as the state has it now, or as the log last showed it (a summon long gone). */
export function battlerOf(run: RaidRun, f: Pick<RaidFx, 'known'>, uid: string): Battler | undefined {
  const st = run.state
  if (uid === st.boss.uid) return st.boss
  return st.summons.find((m) => m.uid === uid) ?? st.sides.flatMap((s) => s.mons).find((m) => m.uid === uid) ?? f.known[uid]
}
const foeOf = (run: RaidRun, f: RaidFx, uid: string) => battlerOf(run, f, uid) ?? run.state.boss

/** The side a Pokémon fights for. */
export const sideOfUid = (sides: readonly RaidSide[], uid: string) => sides.findIndex((s) => s.mons.some((m) => m.uid === uid))

/**
 * Whether an entry belongs to a turn the speed button plays faster: an ally side's or a summon's, from the pair that
 * steps to the front until the next one. Never the raid Pokémon's own (its summoning comes before it steps up) or
 * yours, nor the opening and the end.
 */
export function fastTurn(e: RaidLogEntry, sides: readonly RaidSide[], was: boolean): boolean {
  if (e.kind === 'raid_front') return e.actor === 'ally' ? sideOfUid(sides, e.ally) > 0 : e.foe !== BOSS_UID
  if (e.kind === 'raid_start' || e.kind === 'raid_summon' || e.kind === 'raid_flee' || e.kind === 'raid_end')
    return false
  return was
}

function describeRaid(e: RaidLogEntry, run: RaidRun, f: RaidFx, ctx: AnimatorContext): Step {
  const sides = run.state.sides
  const nameOf = (uid: string) => battlerOf(run, f, uid)?.name ?? t('ui.common.unknown')
  const boss = run.state.boss.name
  const raid = (apply: (x: RaidFx) => RaidFx) => apply as unknown as Step['apply']
  if (!isRaidEntry(e)) {
    // A side other than yours plays: "Ace Trainer Kai's Snorlax attacks!"
    if (e.kind === 'turn' && e.side === 'player' && sideOfUid(sides, e.uid) > 0) {
      const owner = sides[sideOfUid(sides, e.uid)]!.owner
      return { delay: 350, apply: (x) => ({ ...x, tray: null, fly: null, message: t('ui.raid.log.allyTurn', { owner, name: nameOf(e.uid) }) }) }
    }
    // A summon goes down for good (only the raid Pokémon itself is left worn out, for the catch).
    if (e.kind === 'faint' && e.side === 'enemy' && e.uid !== BOSS_UID)
      return {
        delay: 1000,
        sound: 'faint',
        apply: (x) => ({
          ...x,
          message: t('ui.log.fainted', { name: nameOf(e.uid) }),
          fainted: { ...x.fainted, [e.uid]: true },
          flash: { id: nextId(), target: 'enemy' },
          tray: null,
        }),
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
      return {
        delay: 900,
        apply: raid((x) => ({
          ...x,
          message: t('ui.raid.log.start', { boss }),
          field: e.summons.map((m) => m.uid),
          known: { ...x.known, ...Object.fromEntries(e.summons.map((m) => [m.uid, m])) },
          hp: { ...x.hp, ...Object.fromEntries(e.summons.map((m) => [m.uid, m.hp])) },
        })),
      }
    case 'raid_front':
      return {
        delay: e.ally === f.activeUid && e.foe === f.foeUid ? 0 : 380,
        // The dice stay: aiming at another foe mid-turn keeps the roll (each new turn clears the tray itself).
        apply: raid((x) => ({ ...x, activeUid: e.ally || x.activeUid, foeUid: e.foe || x.foeUid, fly: null })),
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
          points: e.points,
          barBreak: { id: nextId() },
          banner: { id: nextId(), text: t('ui.raid.break'), tone: 'super' },
          shake: { id: nextId(), power: 10 },
          cry: { id: nextId(), dex: run.state.boss.dex },
        })),
      }
    case 'raid_summon':
      return {
        delay: 1100,
        sound: 'levelup',
        apply: raid((x) => ({
          ...x,
          message: t('ui.raid.log.summon', { boss, name: e.b.name }),
          field: [...x.field, e.b.uid],
          known: { ...x.known, [e.b.uid]: e.b },
          hp: { ...x.hp, [e.b.uid]: e.b.hp },
          points: e.points,
          arrived: { id: nextId(), uid: e.b.uid },
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
          activeUid: x.sideActive[e.side] === x.activeUid ? e.uid : x.activeUid,
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
    case 'raid_flee':
      return {
        delay: 1200,
        apply: raid((x) => ({ ...x, message: t('ui.raid.log.flee'), fled: { id: nextId(), uids: e.uids }, field: [] })),
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
  /** The ally sides' and the summons' turns play this many times faster (the speed button); read as each entry starts. */
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