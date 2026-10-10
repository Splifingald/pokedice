// Plays the engine's battle log one entry at a time. The UI never recomputes rules — it only animates the log.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activeBattler,
  type BattleState,
  type DieType,
  type LogEntry,
  type RolledDie,
  type Side,
  type StatusKind,
} from '@/engine'
import { t } from '@/i18n'
import { comboName, typeName } from '@/lib/format'
import { hasOwnCry } from '@/audio/cries'
import { sfx, type SfxName } from '@/audio/sfx'
import type { BattleSlice } from '@/store/game'

export interface Fx {
  cursor: number
  message: string
  hp: Record<string, number>
  activeUid: string
  fainted: Record<string, boolean>
  tray: { side: Side; dice: RolledDie[]; keys: string[] } | null
  pop: { id: number; target: Side; amount: number; tone: 'super' | 'weak' | 'immune' | 'normal' | 'heal' } | null
  banner: { id: number; text: string; tone: 'super' | 'weak' | 'immune' | 'info' } | null
  shake: { id: number; power: number } | null
  flash: { id: number; target: Side } | null
  status: { id: number; target: Side; status: StatusKind } | null
  fly: { id: number; to: Side } | null
  /** A timeline the stage is playing for the current log entry (a move, a form change): the log waits for it. */
  scene: Scene | null
  /** A note under the dice until the next roll: the die a Mega Evolution or Gigantamax gave. */
  chip: { id: number; text: string } | null
  /** A cry the screen plays: a Mega's, once it stands there. */
  cry: { id: number; dex: number } | null
}

/** What the battle stage plays for a log entry (src/fx timelines). */
export interface Scene {
  id: number
  /** The log entry it belongs to. */
  cursor: number
  kind: 'attack' | 'mega' | 'gmax' | 'gmaxEnd'
  /** Who acts: the attacker, or the Pokémon whose form changes. */
  side: Side
  type?: DieType
  damage?: number
  fromDex?: number
  toDex?: number
}

export interface AnimatorContext {
  kind: BattleState['kind']
  trainerName: string | null
  itemName: (key: string) => string
  /** A species' (or form's) name, for the form changes. */
  speciesName: (dex: number) => string
  /** A Mega row's own mechanic (Primal Reversion, Ultra Burst), for the message. */
  megaMechanic: (dex: number) => 'primal' | 'ultra' | null
  /** How many turns a Gigantamax lasts (config). */
  gmaxTurns: number
}

let seq = 0
const nextId = () => ++seq

function initFx(b: BattleSlice): Fx {
  const hp: Record<string, number> = { [b.state.enemy.uid]: b.state.enemy.hp }
  for (const p of b.state.player) hp[p.uid] = p.hp
  return {
    cursor: 0,
    message: '',
    hp,
    activeUid: activeBattler(b.state).uid,
    fainted: {},
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
  }
}

interface Step {
  delay: number
  sound?: SfxName
  apply: (f: Fx) => Fx
  effect?: () => void
  /** Played on the stage; `land` then applies when the hit lands (the HP drains with it), the rest when it ends. */
  scene?: Omit<Scene, 'id' | 'cursor'>
  /** What changes when the scene's hit lands — or right away when there is no scene. `staged`: a scene drew it. */
  land?: (f: Fx, staged: boolean) => Fx
}

const STATUS_TEXT: Record<StatusKind, (n: string, stacks?: number) => string> = {
  burn: (name, s) => t('ui.log.burned', { name, stacks: s && s > 1 ? t('ui.log.stacks', { n: s }) : '' }),
  poison: (name) => t('ui.log.poisoned', { name }),
  frozen: (name) => t('ui.log.frozen', { name }),
  paralyze: (name) => t('ui.log.paralyzed', { name }),
  confuse: (name) => t('ui.log.confused', { name }),
  heal: (name) => t('ui.log.healing', { name }),
}

function describe(e: LogEntry, st: BattleState, ctx: AnimatorContext): Step {
  const nameOf = (uid: string) =>
    uid === st.enemy.uid ? st.enemy.name : (st.player.find((p) => p.uid === uid)?.name ?? t('ui.common.unknown'))
  const sideUid = (side: Side, f: Fx) => (side === 'enemy' ? st.enemy.uid : f.activeUid)

  switch (e.kind) {
    case 'start': {
      const lead = activeBattler(st).name
      const text =
        ctx.kind === 'wild'
          ? t('ui.log.startWild', { foe: st.enemy.name, lead })
          : ctx.kind === 'boss'
            ? t('ui.log.startBoss', { foe: st.enemy.name, lead })
            : t('ui.log.startTrainer', { trainer: ctx.trainerName ?? t('ui.log.theTrainer'), foe: st.enemy.name, lead })
      return { delay: 1100, apply: (f) => ({ ...f, message: text }) }
    }
    case 'turn':
      return {
        delay: e.side === 'player' ? 150 : 350,
        apply: (f) => ({
          ...f,
          tray: null,
          fly: null,
          chip: e.side === 'player' ? f.chip : null,
          message:
            e.side === 'player' ? t('ui.log.whatWillDo', { name: nameOf(e.uid) }) : t('ui.log.foeRolls', { foe: st.enemy.name }),
        }),
      }
    case 'roll':
      return {
        delay: 750,
        sound: 'rattle',
        apply: (f) => ({ ...f, fly: null, tray: { side: e.side, dice: e.dice, keys: e.dice.map((_, i) => `r${nextId()}-${i}`) } }),
      }
    case 'reroll':
      return {
        delay: 700,
        sound: 'rattle',
        apply: (f) => ({
          ...f,
          message:
            e.side === 'enemy' ? t('ui.log.foeRerolls', { foe: st.enemy.name, count: e.mask.filter(Boolean).length }) : f.message,
          tray: {
            side: e.side,
            dice: e.dice,
            keys: e.dice.map((_, i) => (e.mask[i] ? `r${nextId()}-${i}` : (f.tray?.keys[i] ?? `k-${i}`))),
          },
        }),
      }
    case 'damage': {
      const r = e.result
      const eff = r.effectiveness
      const tone = r.immune ? 'immune' : eff >= 1.5 ? 'super' : eff <= 0.67 ? 'weak' : 'normal'
      const target = nameOf(e.targetUid)
      const combo = r.combo ? `${comboName(r.combo.key).toUpperCase()}! ` : ''
      const textFor = (f: Fx) => {
        const attacker = e.side === 'enemy' ? st.enemy.name : nameOf(f.activeUid)
        if (r.immune) return t('ui.log.noEffect', { target })
        return t('ui.log.dealt', { combo, attacker, amount: e.amount })
      }
      const banner =
        tone === 'super'
          ? t('ui.log.superEffective')
          : tone === 'weak'
            ? t('ui.log.notVeryEffective')
            : tone === 'immune'
              ? t('ui.log.noEffectBanner')
              : null
      const power = tone === 'super' ? (eff >= 3 ? 10 : 7) : tone === 'weak' ? 2 : tone === 'immune' ? 0 : 4
      return {
        delay: 1300,
        sound: tone === 'super' ? 'super' : tone === 'immune' ? 'error' : 'hit',
        // The dice fly at the target as the move starts; the HP waits for the hit.
        apply: (f) => ({ ...f, fly: { id: nextId(), to: e.target } }),
        // No effect: nothing to animate but the message.
        scene: r.immune
          ? undefined
          : { kind: 'attack', side: e.side, type: r.attackType ?? r.perDie[0]?.type ?? 'base', damage: e.amount },
        land: (f, staged) => ({
          ...f,
          message: textFor(f),
          hp: { ...f.hp, [e.targetUid]: e.hpAfter },
          // The stage draws its own damage number and shake.
          pop: staged ? f.pop : { id: nextId(), target: e.target, amount: e.amount, tone },
          banner: banner ? { id: nextId(), text: banner, tone: tone === 'normal' ? 'info' : tone } : null,
          shake: staged ? f.shake : power ? { id: nextId(), power } : f.shake,
        }),
      }
    }
    case 'status':
      return {
        delay: 850,
        apply: (f) => ({
          ...f,
          message: STATUS_TEXT[e.status](nameOf(e.targetUid), e.stacks),
          status: { id: nextId(), target: e.target, status: e.status },
        }),
      }
    case 'status_tick':
      return {
        delay: 850,
        sound: 'hit',
        apply: (f) => ({
          ...f,
          message: t('ui.log.hurtByStatus', {
            name: nameOf(e.targetUid),
            source: t(e.status === 'burn' ? 'ui.log.itsBurn' : 'ui.log.poisonSource'),
            amount: e.amount,
          }),
          hp: { ...f.hp, [e.targetUid]: e.hpAfter },
          status: { id: nextId(), target: e.target, status: e.status },
          pop: { id: nextId(), target: e.target, amount: e.amount, tone: 'normal' },
        }),
      }
    case 'stunned':
      return {
        delay: 1000,
        apply: (f) => ({
          ...f,
          tray: null,
          message: e.pending
            ? t('ui.log.stunnedPending', {
                name: nameOf(e.uid),
                state: t(e.status === 'frozen' ? 'ui.log.frozenSolid' : 'ui.log.paralysedWord'),
              })
            : t(e.status === 'frozen' ? 'ui.log.frozenPlain' : 'ui.log.paralysedCantMove', { name: nameOf(e.uid) }),
          status: { id: nextId(), target: e.side, status: e.status },
        }),
      }
    case 'faint':
      return {
        delay: 1200,
        sound: 'faint',
        apply: (f) => ({
          ...f,
          message: t('ui.log.fainted', { name: nameOf(e.uid) }),
          fainted: { ...f.fainted, [e.uid]: true },
          flash: { id: nextId(), target: e.side },
          tray: null,
        }),
      }
    case 'switch':
      return {
        delay: 800,
        apply: (f) => ({
          ...f,
          activeUid: e.uid,
          fainted: { ...f.fainted, [e.uid]: false },
          message: t('ui.log.goName', { name: nameOf(e.uid) }),
          tray: null,
        }),
      }
    case 'transform':
      return {
        delay: 900,
        apply: (f) => ({ ...f, message: t('ui.log.copiedDice', { name: nameOf(e.uid), from: nameOf(e.fromUid) }) }),
      }
    case 'form': {
      const before = ctx.speciesName(e.fromDex)
      const after = ctx.speciesName(e.toDex)
      const mechanic = e.reason === 'mega' ? ctx.megaMechanic(e.toDex) : null
      const text =
        e.reason === 'mega'
          ? mechanic === 'primal'
            ? t('ui.log.primal', { name: before })
            : mechanic === 'ultra'
              ? t('ui.log.ultra', { name: before, mega: after })
              : t('ui.log.megaEvolved', { name: before, mega: after })
          : e.reason === 'gmax'
            ? t(e.revert ? 'ui.log.gmaxEnd' : 'ui.log.gmax', { name: e.revert ? after : before })
            : e.reason === 'lowHp'
              ? t(e.revert ? 'ui.log.formBack' : 'ui.log.formChanged', { name: nameOf(e.uid) })
              : t('ui.log.typeChange', { name: nameOf(e.uid), type: typeName(e.dice[0] ?? 'normal') })
      // Your Pokémon's new die, said under the dice until its next roll.
      const gained =
        e.side === 'player' && !e.revert && e.die && (e.reason === 'mega' || e.reason === 'gmax')
          ? e.reason === 'mega'
            ? t('ui.battle.megaDie', { type: typeName(e.die) })
            : t(`ui.battle.gmaxDie.${ctx.gmaxTurns === 1 ? 'one' : 'other'}`, { type: typeName(e.die), n: ctx.gmaxTurns })
          : null
      const chip = (f: Fx) => (gained ? { id: nextId(), text: gained } : f.chip)
      // A Mega with a cry of its own lets it out in place of the jingle (Showdown has none for the Gigantamax forms).
      const cryDex = e.reason === 'mega' && !e.revert && hasOwnCry(e.toDex) ? e.toDex : null
      const cry = (f: Fx) => (cryDex ? { id: nextId(), dex: cryDex } : f.cry)
      const scene: Step['scene'] =
        e.reason === 'mega'
          ? { kind: 'mega', side: e.side, fromDex: e.fromDex, toDex: e.toDex }
          : e.reason === 'gmax'
            ? { kind: e.revert ? 'gmaxEnd' : 'gmax', side: e.side, fromDex: e.fromDex, toDex: e.toDex }
            : undefined
      return {
        delay: 1300,
        sound: cryDex ? undefined : 'levelup',
        apply: (f) => (scene ? f : { ...f, message: text, chip: chip(f), flash: { id: nextId(), target: e.side } }),
        scene,
        land: scene ? (f) => ({ ...f, message: text, chip: chip(f), cry: cry(f) }) : undefined,
      }
    }
    case 'item': {
      const who = nameOf(e.targetUid)
      const item = ctx.itemName(e.key)
      const text =
        e.side === 'enemy'
          ? t('ui.log.foeUsedItem', { trainer: ctx.trainerName ?? t('ui.log.theFoe'), item, who, amount: e.amount })
          : e.revived
            ? t('ui.log.usedRevive', { item, who, amount: e.amount })
            : e.cured?.length
              ? t('ui.log.usedCure', { item, who })
              : e.rerolls
                ? t(`ui.log.usedEther.${e.rerolls === 1 ? 'one' : 'other'}`, { item, who, n: e.rerolls })
                : t('ui.log.usedHeal', { item, who, amount: e.amount })
      // Items don't end the turn, so the dice on the tray stay put.
      return {
        delay: 900,
        sound: 'heal',
        apply: (f) => ({
          ...f,
          message: text,
          hp: { ...f.hp, [e.targetUid]: e.hpAfter },
          fainted: e.revived ? { ...f.fainted, [e.targetUid]: false } : f.fainted,
          pop: e.amount ? { id: nextId(), target: e.side ?? 'player', amount: e.amount, tone: 'heal' } : f.pop,
        }),
      }
    }
    case 'heal':
      return {
        delay: 900,
        sound: 'heal',
        apply: (f) => ({
          ...f,
          message: t('ui.log.restored', { name: nameOf(e.uid), amount: e.amount }),
          hp: { ...f.hp, [e.uid]: e.hpAfter },
          pop: { id: nextId(), target: e.side, amount: e.amount, tone: 'heal' },
          status: { id: nextId(), target: e.side, status: 'heal' },
        }),
      }
    case 'recoil':
      return {
        delay: 1000,
        sound: 'hit',
        apply: (f) => ({
          ...f,
          message: t('ui.log.recoil', { name: nameOf(e.uid), amount: e.amount }),
          hp: { ...f.hp, [e.uid]: e.hpAfter },
          pop: { id: nextId(), target: e.side, amount: e.amount, tone: 'normal' },
          status: { id: nextId(), target: e.side, status: 'confuse' },
          shake: { id: nextId(), power: 3 },
        }),
      }
    case 'end':
      return {
        delay: 500,
        apply: (f) => ({
          ...f,
          tray: null,
          message:
            e.result === 'won'
              ? t('ui.log.endWon', { foe: st.enemy.name })
              : e.result === 'lost'
                ? t(e.reason === 'forfeit' ? 'ui.log.endForfeit' : 'ui.log.endLost')
                : t(e.reason === 'stalemate' ? 'ui.log.endStalemate' : 'ui.log.endFled'),
        }),
      }
  }
  // exhaustive
  void sideUid
  return { delay: 0, apply: (f) => f }
}

/** A scene that never reports back (its stage went away) stops holding the log after this long. */
const SCENE_TIMEOUT = 12_000

/**
 * Plays the log. Returns the display state, whether every entry has been played (inputs unlock only then), and the
 * two calls the stage makes while it plays an entry's scene: the hit landed, the scene ended.
 */
export function useBattleAnimator(
  battle: BattleSlice,
  /** Animations off (or skipping): every step at once, no scenes. */
  instant: boolean,
  ctx: AnimatorContext,
  /** Multiplies every step's delay (auto-mode plays faster). */
  pace = 1,
  /** An entrance is playing: the opening line shows, the rest of the log waits. */
  hold = false,
): { fx: Fx; ready: boolean; sceneContact: () => void; sceneDone: () => void } {
  const [fx, setFx] = useState(() => initFx(battle))
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  // What the scene playing now will apply when its hit lands.
  const landing = useRef<((f: Fx, staged: boolean) => Fx) | null>(null)
  const pending = fx.cursor < battle.log.length

  useEffect(() => {
    if (!pending || (hold && fx.cursor > 0)) return
    const cursor = fx.cursor
    const entry = battle.log[cursor]!
    const step = describe(entry, battle.state, ctxRef.current)
    if (step.scene && !instant) {
      landing.current = step.land ?? null
      setFx((f) => ({ ...step.apply(f), scene: { ...step.scene!, id: nextId(), cursor } }))
      step.effect?.()
      // The stage reports back; if it can't (it went away), the log moves on anyway.
      const t = setTimeout(
        () =>
          setFx((f) => {
            if (f.cursor !== cursor) return f
            const land = landing.current
            landing.current = null
            return { ...(land ? land(f, true) : f), scene: null, cursor: cursor + 1 }
          }),
        SCENE_TIMEOUT,
      )
      return () => clearTimeout(t)
    }
    setFx((f) => {
      const applied = step.apply(f)
      return step.land ? step.land(applied, false) : applied
    })
    if (step.sound) sfx(step.sound)
    step.effect?.()
    const t = setTimeout(
      () => setFx((f) => (f.cursor === cursor ? { ...f, cursor: cursor + 1 } : f)),
      instant ? 0 : step.delay * pace,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.cursor, pending, hold])

  /** The scene's hit landed: the HP drains now. */
  const sceneContact = useCallback(() => {
    const land = landing.current
    landing.current = null
    if (land) setFx((f) => land(f, true))
  }, [])
  /** The scene ended: whatever it didn't land yet lands, and the log moves on. */
  const sceneDone = useCallback(() => {
    const land = landing.current
    landing.current = null
    setFx((f) => (f.scene ? { ...(land ? land(f, true) : f), scene: null, cursor: f.scene.cursor + 1 } : f))
  }, [])

  return { fx, ready: !pending, sceneContact, sceneDone }
}
