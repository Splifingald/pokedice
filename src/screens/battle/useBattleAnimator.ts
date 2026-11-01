// Plays the engine's battle log one entry at a time. The UI never recomputes rules — it only animates the log.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activeBattler,
  hitPower,
  type BattleState,
  type DieType,
  type HitPower,
  type LogEntry,
  type RolledDie,
  type Side,
  type StatusKind,
  type TalentKey,
} from '@/engine'
import { t } from '@/i18n'
import { chancePercent, comboName, typeName } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { hasOwnCry, playCry } from '@/audio/cries'
import { feelSound } from '@/audio/feel'
import { sfx, type SfxName } from '@/audio/sfx'
import type { BattleSlice } from '@/store/game'
import { talentLogText } from '@/components/Talent'

export interface Fx {
  cursor: number
  message: string
  hp: Record<string, number>
  activeUid: string
  /** The foe in front (a double battle's acting or targeted one, docs/33; else the one foe). */
  foeUid: string
  /**
   * A double battle's Pokémon out, as the log has played (the state may be past it), left to right: a K.O.'d one stays
   * (fainted) until another takes its spot.
   */
  field?: { own: string[]; foes: string[] }
  fainted: Record<string, boolean>
  /**
   * The form each Pokémon shows, as the log has played so far: the state is already past the log (a Gigantamax has
   * reverted by the time its attack plays; a trainer's Mega stands there before its scene), so the stage draws this.
   */
  dex: Record<string, number>
  /** A K.O.'d foe that's about to be caught stays on the field, worn out, instead of fainting away. */
  wornOut: Record<string, boolean>
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
  /** Pokémon away after a Flying, Ground or Water Z-Move (docs/35): the stage doesn't draw them until they strike. */
  away?: Record<string, 'fly' | 'dig' | 'dive'>
  /**
   * A hidden talent at work (docs/51): its plaque slides in on its owner's side, its gem bursts on the Pokémon.
   * `entry`: one that works on its own, said as it first acts (its text on the plaque).
   */
  talent?: { id: number; side: Side; uid: string; key: TalentKey; name: string; entry?: boolean } | null
}

/** What the battle stage plays for a log entry (src/fx timelines). */
export interface Scene {
  id: number
  /** The log entry it belongs to. */
  cursor: number
  kind: 'attack' | 'mega' | 'gmax' | 'gmaxEnd' | 'unleash' | 'zmove' | 'zstrike' | 'zaway'
  /** A Z-Move's going away, or the strike's coming back (docs/35). */
  how?: 'fly' | 'dig' | 'dive'
  /** Who acts: the attacker, or the Pokémon whose form changes. */
  side: Side
  /** The attack's type, or the die an unleashed form gained. */
  type?: DieType
  damage?: number
  fromDex?: number
  toDex?: number
  /** Played this many times faster: a raid's sped-up turns (absent = as drawn). */
  speed?: number
  /** An attack's hit: how it sounds when it lands, and how hard the stage plays it (docs/38). */
  hit?: SceneHit
}

/** A hit, as the log decided it: what the stage and the speakers make of it when it lands. */
export interface SceneHit {
  tone: 'super' | 'weak' | 'normal'
  /** How hard it lands (docs/38 F3a): the stage scales its shake, particles and hit-stop with it. */
  power: HitPower
  /** The sound it has always made on landing (with a scene, at its contact). */
  sound: SfxName
}

/**
 * A hit landing, heard and felt: at the scene's contact, or at once without a scene. Its own sound (a bug fixed in
 * docs/38 B2: with a scene it was never heard), super effective and resisted their own (F3b). A vibration by how hard
 * it lands (the K.O.'s comes with its boss stop, `finalBlow`).
 */
export function landHit(hit: SceneHit) {
  if (hit.tone === 'normal') sfx(hit.sound)
  else feelSound(hit.tone === 'super' ? 'hit.super' : 'hit.resisted')
  const { tier } = hit.power
  haptic(tier >= 3 ? 'hit3' : tier === 2 ? 'hit2' : 'hit1')
}

/** The final blow (docs/38 F4a), as its boss stop holds the stage: the K.O.'s thud and its vibration. */
export function finalBlow() {
  feelSound('hit.ko')
  haptic('ko')
}

export interface AnimatorContext {
  kind: BattleState['kind']
  trainerName: string | null
  /** The boss is a roadblock (docs/61 §2): said as a wild Pokémon, not a legendary. */
  roadblock?: boolean
  /** A rival's set meeting (docs/61 §5.2): the fight opens with their line. */
  rival?: boolean
  /**
   * The foe goes to the catch throw once it's K.O.'d (wild or legendary, and a catch on offer). A double battle asks per
   * foe: a wild pair's first K.O. waits, worn out on its spot, for the other's (docs/33).
   */
  catchable: boolean | ((uid: string) => boolean)
  itemName: (key: string) => string
  /** A species' (or form's) name, for the form changes. */
  speciesName: (dex: number) => string
  /** A Mega row's own mechanic (Primal Reversion, Ultra Burst), for the message. */
  megaMechanic: (dex: number) => 'primal' | 'ultra' | null
  /** How many turns a Gigantamax lasts (config). */
  gmaxTurns: number
}

/** The pause on each reroll; the foe's is shorter (docs/38 F1d). */
export const REROLL_MS = 700
export const FOE_REROLL_MS = 450

let seq = 0
const nextId = () => ++seq

function initFx(b: BattleSlice): Fx {
  const hp: Record<string, number> = { [b.state.enemy.uid]: b.state.enemy.hp }
  for (const f of b.state.double?.foes ?? []) hp[f.uid] = f.hp
  for (const p of b.state.player) hp[p.uid] = p.hp
  // A double battle's log starts from its opening pair; its focus entries move the pair from there.
  const opening = b.log[0]?.kind === 'start' ? b.log[0].double : undefined
  // The forms as of the log's start: replaying it from there changes them on its form entries.
  const dex: Record<string, number> = {}
  for (const e of b.log) if (e.kind === 'form' && !(e.uid in dex)) dex[e.uid] = e.fromDex
  return {
    cursor: 0,
    message: '',
    hp,
    activeUid: opening?.own[0] ?? activeBattler(b.state).uid,
    foeUid: opening?.foes[0] ?? b.state.enemy.uid,
    ...(opening && { field: { own: [...opening.own], foes: [...opening.foes] } }),
    fainted: {},
    dex,
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
    away: {},
    talent: null,
  }
}

/**
 * A fight picked up as it stands (store/resume.ts: a reload, a return): its whole log applied at once, with no sound,
 * no scene and no delay, so the stage, the plates and the message box open where the fight was left. The moment's
 * flourishes (a damage number, a banner, a shake…) are dropped: they belonged to a moment already over.
 */
export function caughtUpFx(b: BattleSlice, ctx: AnimatorContext): Fx {
  let f = initFx(b)
  for (const entry of b.log) {
    const step = describe(entry, b.state, ctx)
    const applied = step.apply(f)
    f = step.land ? step.land(applied, false) : applied
  }
  return { ...f, cursor: b.log.length, pop: null, banner: null, shake: null, flash: null, status: null, fly: null, scene: null, cry: null, talent: null }
}

export interface Step {
  delay: number
  sound?: SfxName
  apply: (f: Fx) => Fx
  effect?: () => void
  /** Played on the stage; `land` then applies when the hit lands (the HP drains with it), the rest when it ends. */
  scene?: Omit<Scene, 'id' | 'cursor'>
  /** A hit: heard (`landHit`) when it lands, in place of `sound`. */
  hit?: SceneHit
  /** What changes when the scene's hit lands — or right away when there is no scene. `staged`: a scene drew it. */
  land?: (f: Fx, staged: boolean) => Fx
}

/** `n`: Burn's stacks, or how confused (1 a bit, 2, 3 very). */
const STATUS_TEXT: Record<StatusKind, (name: string, n?: number) => string> = {
  burn: (name, s) => t('ui.log.burned', { name, stacks: s && s > 1 ? t('ui.log.stacks', { n: s }) : '' }),
  poison: (name) => t('ui.log.poisoned', { name }),
  frozen: (name) => t('ui.log.frozen', { name }),
  paralyze: (name) => t('ui.log.paralyzed', { name }),
  confuse: (name, lv = 2) => t(lv <= 1 ? 'ui.log.confusedBit' : lv >= 3 ? 'ui.log.confusedVery' : 'ui.log.confused', { name }),
  heal: (name) => t('ui.log.healing', { name }),
}

export function describe(e: LogEntry, st: BattleState, ctx: AnimatorContext): Step {
  const foes = st.double?.foes ?? [st.enemy]
  const nameOf = (uid: string) =>
    (foes.find((f) => f.uid === uid) ?? st.player.find((p) => p.uid === uid))?.name ?? t('ui.common.unknown')
  const sideUid = (side: Side, f: Fx) => (side === 'enemy' ? f.foeUid : f.activeUid)
  const names = (uids: readonly string[]) => uids.map(nameOf)

  switch (e.kind) {
    case 'start': {
      if (e.double) {
        const [foe = '', foe2 = ''] = names(e.double.foes)
        const [lead = '', lead2] = names(e.double.own)
        const go = lead2 ? t('ui.log.goPair', { a: lead, b: lead2 }) : t('ui.log.goName', { name: lead })
        const text =
          ctx.kind === 'wild'
            ? t('ui.log.startWildPair', { foe, foe2, go })
            : t('ui.log.startTrainerPair', { trainer: ctx.trainerName ?? t('ui.log.theTrainer'), foe, foe2, go })
        return { delay: 1300, apply: (f) => ({ ...f, message: text }) }
      }
      const lead = activeBattler(st).name
      const text =
        ctx.kind === 'wild'
          ? t('ui.log.startWild', { foe: st.enemy.name, lead })
          : ctx.kind === 'boss'
            ? t(ctx.roadblock ? 'ui.log.startWild' : 'ui.log.startBoss', { foe: st.enemy.name, lead })
            : t(ctx.rival ? 'ui.log.startRival' : 'ui.log.startTrainer', {
                trainer: ctx.trainerName ?? t('ui.log.theTrainer'),
                foe: st.enemy.name,
                lead,
              })
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
            e.side === 'player' ? t('ui.log.whatWillDo', { name: nameOf(e.uid) }) : t('ui.log.foeRolls', { foe: nameOf(e.uid) }),
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
        delay: e.side === 'enemy' ? FOE_REROLL_MS : REROLL_MS,
        sound: 'rattle',
        apply: (f) => ({
          ...f,
          message:
            e.side === 'enemy' ? t('ui.log.foeRerolls', { foe: nameOf(f.foeUid), count: e.mask.filter(Boolean).length }) : f.message,
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
        const attacker = nameOf(sideUid(e.side, f))
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
      const sound: SfxName = tone === 'super' ? 'super' : tone === 'immune' ? 'error' : 'hit'
      const struck = foes.find((f) => f.uid === e.targetUid) ?? st.player.find((p) => p.uid === e.targetUid)
      // How hard it lands (docs/38): the log's numbers, read for the stage and the speakers. No effect: no hit at all.
      const hit: SceneHit | undefined =
        tone === 'immune'
          ? undefined
          : {
              tone,
              sound,
              power: hitPower({
                effectiveness: eff,
                combo: r.combo?.key,
                damage: e.amount,
                maxHp: struck?.maxHp ?? 0,
                ko: e.hpAfter <= 0,
              }),
            }
      return {
        delay: 1300,
        sound,
        hit,
        // The dice fly at the target as the move starts; the HP waits for the hit. A Z-Move's strike brings back an
        // attacker that went away.
        apply: (f) => {
          const atkUid = e.side === 'enemy' ? st.enemy.uid : f.activeUid
          const { [atkUid]: _back, ...away } = f.away ?? {}
          return { ...f, fly: { id: nextId(), to: e.target }, away }
        },
        // No effect: nothing to animate but the message. A Z-Move has a strike of its own.
        scene: r.immune
          ? undefined
          : e.z
            ? { kind: 'zstrike', side: e.side, type: r.attackType ?? r.perDie[0]?.type ?? 'base', damage: e.amount, how: e.z.from, hit }
            : { kind: 'attack', side: e.side, type: r.attackType ?? r.perDie[0]?.type ?? 'base', damage: e.amount, hit },
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
          message: STATUS_TEXT[e.status](nameOf(e.targetUid), e.status === 'confuse' ? e.level : e.stacks),
          status: { id: nextId(), target: e.target, status: e.status },
        }),
      }
    case 'talent':
      return {
        // Long enough to read the plaque; one that only says what works on its own reads its line too. Mirror waits
        // for its die to land.
        delay: e.entry ? 1300 : e.dice ? 1500 : 1050,
        sound: 'talent',
        apply: (f) => ({
          ...f,
          // Mirror: the roll stays, and only its lowest die is thrown again, landing on the highest's face.
          ...(e.dice &&
            e.index != null && {
              tray: {
                side: e.side,
                dice: e.dice,
                keys: e.dice.map((_, i) => (i === e.index ? `m${nextId()}-${i}` : (f.tray?.keys[i] ?? `k-${i}`))),
              },
            }),
          message: talentLogText(e.name ?? nameOf(e.uid), e, e.ally ? nameOf(e.ally) : undefined),
          talent: { id: nextId(), side: e.side, uid: e.uid, key: e.talent, name: e.name ?? nameOf(e.uid), ...(e.entry && { entry: true }) },
          ...(e.hpAfter != null && {
            hp: { ...f.hp, [e.uid]: e.hpAfter },
            pop: { id: nextId(), target: e.side, amount: e.amount ?? 0, tone: 'heal' as const },
          }),
          // Rough Skin (docs/51): the attacker it hurt back.
          ...(e.hurt && {
            hp: { ...f.hp, [e.hurt.uid]: e.hurt.hpAfter },
            pop: { id: nextId(), target: e.hurt.side, amount: e.hurt.amount, tone: 'normal' as const },
            shake: { id: nextId(), power: 2 },
          }),
        }),
      }
    case 'status_resisted':
      return {
        delay: 850,
        apply: (f) => ({
          ...f,
          message: t(e.status === 'frozen' ? 'ui.log.resistedFrozen' : 'ui.log.resistedParalyze', {
            name: nameOf(e.targetUid),
            pct: chancePercent(e.chance),
          }),
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
      if (e.side === 'enemy' && (typeof ctx.catchable === 'function' ? ctx.catchable(e.uid) : ctx.catchable))
        return {
          delay: 1200,
          // The K.O. opens the catch (docs/38 F4b): a sting, where there was silence.
          effect: () => feelSound('ko.sting'),
          apply: (f) => ({
            ...f,
            message: t('ui.catch.wornOut', {
              who: t(ctx.kind === 'boss' && !ctx.roadblock ? 'ui.catch.theLegendary' : 'ui.catch.theWild'),
              name: nameOf(e.uid),
            }),
            wornOut: { ...f.wornOut, [e.uid]: true },
            tray: null,
          }),
        }
      return {
        delay: 1200,
        sound: 'faint',
        // Its cry, slower and lower, as it falls (docs/38 F4a).
        effect: () => playCry(e.dex, { rate: 0.75 }),
        apply: (f) => ({
          ...f,
          message: t('ui.log.fainted', { name: nameOf(e.uid) }),
          fainted: { ...f.fainted, [e.uid]: true },
          flash: { id: nextId(), target: e.side },
          tray: null,
        }),
      }
    case 'focus':
      // You picked another foe to attack: only the foe in front changes; the dice stay on the tray, unrolled again.
      if (e.aim) return { delay: 0, apply: (f) => ({ ...f, foeUid: e.foe }) }
      // A double battle's pair in front moves (docs/33): the stage swaps them, big in front, small behind.
      return { delay: 350, apply: (f) => ({ ...f, activeUid: e.own, foeUid: e.foe, tray: null }) }
    case 'foe_out':
      return {
        delay: 900,
        apply: (f) => ({
          ...f,
          // It takes the spot of the first one K.O.'d.
          field: f.field && { ...f.field, foes: takeSpot(f.field.foes, e.uid, (u) => !!f.fainted[u]) },
          fainted: { ...f.fainted, [e.uid]: false },
          message: t('ui.log.foeSentOut', { trainer: ctx.trainerName ?? t('ui.log.theTrainer'), name: nameOf(e.uid) }),
          tray: null,
        }),
      }
    case 'switch':
      return {
        delay: 800,
        apply: (f) => ({
          ...f,
          activeUid: e.uid,
          // A double battle: into a K.O.'d one's spot, an empty one, or the spot of the one going back.
          field: f.field && {
            ...f.field,
            own:
              e.free || f.field.own.some((u) => f.fainted[u])
                ? takeSpot(f.field.own, e.uid, (u) => !!f.fainted[u])
                : // Alone on its side, the newcomer joins it; else it takes the place of the one going back.
                  takeSpot(f.field.own, e.uid, (u) => f.field!.own.length >= 2 && u === f.activeUid),
          },
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
        e.reason === 'mega' && e.revert
          ? t('ui.log.megaEnd', { name: after })
          : e.reason === 'mega'
          ? mechanic === 'primal'
            ? t('ui.log.primal', { name: before })
            : mechanic === 'ultra'
              ? t('ui.log.ultra', { name: before, mega: after })
              : t('ui.log.megaEvolved', { name: before, mega: after })
          : e.reason === 'gmax'
            ? t(e.revert ? 'ui.log.gmaxEnd' : 'ui.log.gmax', { name: e.revert ? after : before })
            : e.reason === 'lowHp'
              ? t(e.revert ? 'ui.log.formBack' : 'ui.log.formChanged', { name: nameOf(e.uid) })
              : e.reason === 'unleash'
                ? t('ui.raid.log.unleashed', {
                    name: before,
                    form: t(`ui.raid.form.${e.toDex}`),
                    type: typeName(e.die ?? 'normal'),
                  })
                : t('ui.log.typeChange', { name: nameOf(e.uid), type: typeName(e.dice[0] ?? 'normal') })
      // Your Pokémon's new die, said under the dice until its next roll.
      const gained =
        e.side === 'player' && !e.revert && e.die && (e.reason === 'mega' || e.reason === 'gmax')
          ? e.reason === 'mega'
            ? st.megaTurns
              ? t('ui.battle.megaDieTimed', { type: typeName(e.die), n: st.megaTurns })
              : t('ui.battle.megaDie', { type: typeName(e.die) })
            : st.gmaxBoost
              ? t(`ui.battle.gmaxBoostDie.${ctx.gmaxTurns === 1 ? 'one' : 'other'}`, {
                  type: typeName(e.die),
                  dice: st.gmaxBoost.dice,
                  n: ctx.gmaxTurns,
                })
              : t(`ui.battle.gmaxDie.${ctx.gmaxTurns === 1 ? 'one' : 'other'}`, { type: typeName(e.die), n: ctx.gmaxTurns })
          : null
      const chip = (f: Fx) => (gained ? { id: nextId(), text: gained } : f.chip)
      // A Mega with a cry of its own lets it out in place of the jingle (Showdown has none for the Gigantamax
      // forms); a raid Pokémon unleashing its form roars with its own.
      const unleash = e.reason === 'unleash'
      const cryDex = unleash || (e.reason === 'mega' && !e.revert && hasOwnCry(e.toDex)) ? e.toDex : null
      const cry = (f: Fx) => (cryDex ? { id: nextId(), dex: cryDex } : f.cry)
      // The raid's word over the stage, like BREAK!.
      const banner = (f: Fx) =>
        unleash ? { id: nextId(), text: t('ui.raid.unleash'), tone: 'super' as const } : f.banner
      // A timed Mega changing back (the gem rules) has no scene of its own: the flash, like a form going back.
      const scene: Step['scene'] =
        e.reason === 'mega' && e.revert
          ? undefined
          : e.reason === 'mega'
          ? { kind: 'mega', side: e.side, fromDex: e.fromDex, toDex: e.toDex }
          : e.reason === 'gmax'
            ? { kind: e.revert ? 'gmaxEnd' : 'gmax', side: e.side, fromDex: e.fromDex, toDex: e.toDex }
            : unleash
              ? { kind: 'unleash', side: e.side, fromDex: e.fromDex, toDex: e.toDex, type: e.die }
              : undefined
      const formed = (f: Fx) => ({ ...f.dex, [e.uid]: e.toDex })
      // Dice gained mid-turn land in your hand: only they tumble, the others keep their keys (and stay still).
      const hand = e.hand
      const tray = (f: Fx): Fx['tray'] => {
        if (!hand) return f.tray
        const old = f.tray?.side === e.side ? f.tray.keys : []
        let j = 0
        const keys = hand.dice.map((_, i) => (hand.fresh[i] ? undefined : old[j++]) ?? `r${nextId()}-${i}`)
        return { side: e.side, dice: hand.dice, keys }
      }
      return {
        delay: 1300,
        sound: cryDex ? undefined : 'levelup',
        apply: (f) =>
          scene
            ? f
            : { ...f, dex: formed(f), message: text, chip: chip(f), tray: tray(f), flash: { id: nextId(), target: e.side } },
        scene,
        land: scene
          ? (f) => ({ ...f, dex: formed(f), message: text, chip: chip(f), tray: tray(f), cry: cry(f), banner: banner(f) })
          : undefined,
      }
    }
    case 'zmove': {
      // The power gathers on the stage, then the attack's own scene plays with the next entry.
      const name = e.side === 'enemy' ? st.enemy.name : nameOf(e.uid)
      const type = e.type ? typeName(e.type) : t('ui.common.unknown')
      return {
        delay: 1100,
        apply: (f) => ({ ...f, message: t('ui.log.zMove', { name, type }) }),
        scene: { kind: 'zmove', side: e.side, type: e.type ?? 'base' },
        land: (f) => ({ ...f, banner: { id: nextId(), text: t('ui.battle.zBanner'), tone: 'super' } }),
      }
    }
    case 'away':
      return {
        delay: 1000,
        apply: (f) => ({ ...f, message: t(`ui.log.zAway.${e.how}`, { name: nameOf(e.uid) }) }),
        scene: { kind: 'zaway', side: e.side, how: e.how },
        land: (f) => ({ ...f, away: { ...(f.away ?? {}), [e.uid]: e.how } }),
      }
    case 'dodge':
      return {
        delay: 1000,
        sound: 'error',
        apply: (f) => ({
          ...f,
          message: t(`ui.log.zDodge.${e.how}`, { name: nameOf(e.uid) }),
          banner: { id: nextId(), text: t('ui.log.missBanner'), tone: 'immune' },
        }),
      }
    case 'cleansed':
      return {
        delay: 900,
        sound: 'heal',
        apply: (f) => ({
          ...f,
          message: t('ui.log.zCleansed', { name: nameOf(e.uid) }),
          status: { id: nextId(), target: e.side, status: 'heal' },
        }),
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
          // A double battle with a spot empty: the revived one stands back up there (docs/33).
          field:
            e.revived && f.field && !f.field.own.includes(e.targetUid) && st.double
              ? { ...f.field, own: takeSpot(f.field.own, e.targetUid, (u) => !!f.fainted[u]) }
              : f.field,
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
          message: t(e.z ? 'ui.log.zRecoil' : 'ui.log.recoil', { name: nameOf(e.uid), amount: e.amount }),
          hp: { ...f.hp, [e.uid]: e.hpAfter },
          pop: { id: nextId(), target: e.side, amount: e.amount, tone: 'normal' },
          status: e.z ? f.status : { id: nextId(), target: e.side, status: 'confuse' },
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
              ? st.double
                ? t('ui.log.endWonPair')
                : t('ui.log.endWon', { foe: st.enemy.name })
              : e.result === 'lost'
                ? t(e.reason === 'forfeit' ? 'ui.log.endForfeit' : 'ui.log.endLost')
                : t(e.reason === 'stalemate' ? 'ui.log.endStalemate' : 'ui.log.endFled'),
        }),
      }
  }
  // exhaustive
  return { delay: 0, apply: (f) => f }
}

/** `uid` comes out in the first spot `leaving` says is free (or a third, while one side has a single Pokémon out). */
function takeSpot(row: readonly string[], uid: string, leaving: (uid: string) => boolean): string[] {
  const at = row.findIndex(leaving)
  if (at >= 0) return row.map((u, i) => (i === at ? uid : u))
  return row.length < 2 ? [...row, uid] : [...row]
}

/** A scene that never reports back (its stage went away) stops holding the log after this long. */
export const SCENE_TIMEOUT = 12_000

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
  const [fx, setFx] = useState(() => (battle.resumed ? caughtUpFx(battle, ctx) : initFx(battle)))
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  // What the scene playing now will apply when its hit lands.
  const landing = useRef<((f: Fx, staged: boolean) => Fx) | null>(null)
  const pending = fx.cursor < battle.log.length
  // A new target alone doesn't lock the inputs: the picker, the dice and the damage stay up while it plays.
  const settled = battle.log.slice(fx.cursor).every((e) => e.kind === 'focus' && e.aim)

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
    if (step.hit) {
      landHit(step.hit)
      if (step.hit.power.ko) finalBlow()
    } else if (step.sound) sfx(step.sound)
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

  return { fx, ready: settled, sceneContact, sceneDone }
}
