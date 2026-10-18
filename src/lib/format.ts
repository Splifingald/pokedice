import type { IconName } from '@/components/icons'
import type { ComboKey, DieType, Milestone, PokeType, StatusKind, StatusRules } from '@/engine/types'
import { getLang, t, tPlural } from '@/i18n'

/** A textbook roll for each combo, in groups (Two Pair: 2 2 · 5 5) — the help table and the upgrade rows. */
export const COMBO_EXAMPLES: Record<ComboKey, number[][]> = {
  pair: [[4, 4]],
  two_pair: [
    [2, 2],
    [5, 5],
  ],
  three_kind: [[3, 3, 3]],
  small_straight: [[3, 4, 5, 6]],
  full_house: [
    [2, 2, 2],
    [6, 6],
  ],
  four_kind: [[5, 5, 5, 5]],
  full_straight: [[2, 3, 4, 5, 6]],
  five_kind: [[6, 6, 6, 6, 6]],
}

export const comboExampleText = (k: ComboKey) => COMBO_EXAMPLES[k].map((g) => g.join(' ')).join(' · ')

/** "Full House", "Grande suite"… — the engine's COMBO_NAMES stay English, for the admin and the tests. */
export const comboName = (k: ComboKey) => t(`ui.combo.${k}`)

/** "Fire", "Plante", "Gestein"… */
export const typeName = (type: DieType) => t(`ui.type.${type}`)

/** The three-letter die label. Three letters in every language, so the dice keep their width. */
export const dieAbbr = (type: DieType) => t(`ui.dieAbbr.${type}`)

export const dexNo = (n: number) => `#${String(n).padStart(3, '0')}`

export function milestoneText(m: Milestone, type1: DieType): string {
  const to = typeName(m.dieType ?? type1).toUpperCase()
  switch (m.effect) {
    case 'UPGRADE_DIE':
      return t('ui.milestone.upgradeDie', { to })
    case 'REPLACE_DIE':
      return t('ui.milestone.replaceDie', { from: typeName(m.fromDieType ?? 'base').toUpperCase(), to })
    case 'ADD_REROLL':
      return t('ui.milestone.addReroll', { amount: m.amount ?? 1 })
    case 'ADD_DIE':
      return t('ui.milestone.addDie', { type: to })
    case 'ADD_HP':
      return t('ui.milestone.addHp', { amount: m.amount ?? 0 })
    case 'EVOLVE':
      return t('ui.milestone.evolve')
  }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A countdown: "4:05" under an hour, "2h 05m" above. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return t('ui.time.hoursMinutes', { h, m: String(m).padStart(2, '0') })
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/**
 * A ticking clock to a start (a small world's preview): "1d 04:12:33", "4:12:33", "12:33". Seconds always show, so it
 * visibly counts down; only the days are words.
 */
export function clockTo(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  if (d > 0) return `${t('ui.live.days', { d })} ${String(h).padStart(2, '0')}:${mm}:${ss}`
  return h > 0 ? `${h}:${mm}:${ss}` : `${Number(mm)}:${ss}`
}

/** Time left on something that lasts days (a trade listing): "45 min", "5h 05m", "2d 4h". */
export function timeLeft(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000))
  if (mins < 60) return t('ui.time.minutes', { m: mins })
  const h = Math.floor(mins / 60)
  if (h < 24) return t('ui.time.hoursMinutes', { h, m: String(mins % 60).padStart(2, '0') })
  return t('ui.time.daysHours', { d: Math.floor(h / 24), h: h % 24 })
}

/** Pokédollars: ₽1,250 — grouped the way the player's language groups numbers. */
export const money = (n: number) => `₽${Math.round(n).toLocaleString(getLang())}`

/** Odds as the N of "1 in N" (0.001 → "1,000"), in the player's language's digits. */
export const oneInText = (chance: number) => Math.round(1 / chance).toLocaleString(getLang())

/** "Gym Leader Brock", "Champion d'Arène Pierre", "Bug Catcher Rick"… */
export function trainerTitle(tr: { name: string; kind?: string; role?: string }): string {
  return tr.role === 'leader' ? t('ui.trainer.gymLeader', { name: tr.name }) : tr.name
}

const turns = (n: number) => tPlural('ui.status.turns', n, { n })

/** Each status in plain words, with the live numbers from game_config.status (Help table, Upgrades screen). */
export function statusEffects(r: StatusRules): { status: StatusKind; icon: IconName; name: string; die: PokeType; when: string; what: string }[] {
  const faces = (n: number, status: StatusKind) => tPlural('ui.status.faces', n, { n, face: t(`ui.status.${status}.name`) })
  return [
    {
      status: 'burn',
      icon: 'burn',
      die: 'fire',
      name: t('ui.status.burn.name'),
      when: faces(r.burn.threshold, 'burn'),
      what: t('ui.status.burn.what', { percent: r.burn.percentPerStack, turns: turns(r.burn.duration) }),
    },
    {
      status: 'poison',
      icon: 'poison',
      die: 'poison',
      name: t('ui.status.poison.name'),
      when: faces(r.poison.threshold, 'poison'),
      what: t('ui.status.poison.what', { percent: r.poison.percent, turns: turns(r.poison.duration) }),
    },
    {
      status: 'frozen',
      icon: 'frozen',
      die: 'ice',
      name: t('ui.status.frozen.name'),
      when: faces(r.frozen.threshold, 'frozen'),
      what: t('ui.status.skip', { turns: turns(r.frozen.stunTurns) }),
    },
    {
      status: 'paralyze',
      icon: 'paralyze',
      die: 'electric',
      name: t('ui.status.paralyze.name'),
      when: faces(r.paralyze.threshold, 'paralyze'),
      what: t('ui.status.skip', { turns: turns(r.paralyze.stunTurns) }),
    },
    {
      status: 'confuse',
      icon: 'confuse',
      die: 'psychic',
      name: t('ui.status.confuse.name'),
      when: faces(r.confuse.threshold, 'confuse'),
      what: t('ui.status.confuse.what', { percent: r.confuse.recoilPercent }),
    },
    {
      status: 'heal',
      icon: 'heal',
      die: 'grass',
      name: t('ui.status.heal.name'),
      when: faces(r.heal.threshold, 'heal'),
      what: t('ui.status.heal.what', {
        source: t(r.heal.amount === 'healFaces' ? 'ui.status.heal.sourceFaces' : 'ui.status.heal.sourceTotal'),
      }),
    },
  ]
}

/** A status by name, title case: "Burn", "Brûlure". */
export const statusName = (status: StatusKind) => t(`ui.status.${status}.name`)

/** A moment in the player's language and time: "Sat 18 Oct, 18:00" (a small world's end, an area's opening). */
export const dayTime = (ms: number) =>
  new Date(ms).toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** An hour of the day as the player's language writes it: "18:00", "6:00 PM" (day and night's turns, docs/32). */
export const hourOfDay = (hour: number) =>
  new Date(2000, 0, 1, hour).toLocaleTimeString(getLang(), { hour: 'numeric', minute: '2-digit' })
