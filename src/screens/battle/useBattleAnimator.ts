// Plays the engine's battle log one entry at a time. The UI never recomputes rules — it only animates the log.
import { useEffect, useRef, useState } from 'react'
import { activeBattler, type BattleState, type LogEntry, type RolledDie, type Side, type StatusKind } from '@/engine'
import { t } from '@/i18n'
import { comboName } from '@/lib/format'
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
}

export interface AnimatorContext {
  kind: BattleState['kind']
  trainerName: string | null
  itemName: (key: string) => string
  colorOf: (type: string) => string
  onHit: (target: Side, color: string, power: number) => void
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
  }
}

interface Step {
  delay: number
  sound?: SfxName
  apply: (f: Fx) => Fx
  effect?: () => void
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
      const color = ctx.colorOf(r.attackType ?? r.perDie[0]?.type ?? 'base')
      return {
        delay: 1300,
        sound: tone === 'super' ? 'super' : tone === 'immune' ? 'error' : 'hit',
        apply: (f) => ({
          ...f,
          message: textFor(f),
          hp: { ...f.hp, [e.targetUid]: e.hpAfter },
          fly: { id: nextId(), to: e.target },
          pop: { id: nextId(), target: e.target, amount: e.amount, tone },
          banner: banner ? { id: nextId(), text: banner, tone: tone === 'normal' ? 'info' : tone } : null,
          shake: power ? { id: nextId(), power } : f.shake,
        }),
        effect: () => {
          if (!r.immune) ctx.onHit(e.target, color, power / 4 + 0.6)
        },
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

/** Returns the display state and whether every log entry has been played (inputs unlock only then). */
export function useBattleAnimator(
  battle: BattleSlice,
  reduced: boolean,
  ctx: AnimatorContext,
  /** Multiplies every step's delay (auto-mode plays faster). */
  pace = 1,
): { fx: Fx; ready: boolean } {
  const [fx, setFx] = useState(() => initFx(battle))
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const pending = fx.cursor < battle.log.length

  useEffect(() => {
    if (!pending) return
    const cursor = fx.cursor
    const entry = battle.log[cursor]!
    const step = describe(entry, battle.state, ctxRef.current)
    setFx((f) => step.apply(f))
    if (step.sound) sfx(step.sound)
    step.effect?.()
    const t = setTimeout(
      () => setFx((f) => (f.cursor === cursor ? { ...f, cursor: cursor + 1 } : f)),
      reduced ? 0 : step.delay * pace,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.cursor, pending])

  return { fx, ready: !pending }
}
