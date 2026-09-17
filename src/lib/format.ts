import type { IconName } from '@/components/icons'
import type { ComboKey, DieType, Milestone, PokeType, StatusKind, StatusRules } from '@/engine/types'

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

export const dexNo = (n: number) => `#${String(n).padStart(3, '0')}`

export const DIE_ABBR: Record<DieType, string> = {
  base: 'BAS',
  normal: 'NRM',
  fire: 'FIR',
  water: 'WTR',
  electric: 'ELE',
  grass: 'GRS',
  ice: 'ICE',
  fighting: 'FGT',
  poison: 'PSN',
  ground: 'GRD',
  flying: 'FLY',
  psychic: 'PSY',
  bug: 'BUG',
  rock: 'RCK',
  ghost: 'GHO',
  dragon: 'DRG',
  dark: 'DRK',
  steel: 'STL',
  fairy: 'FAI',
}

export function milestoneText(m: Milestone, type1: DieType): string {
  switch (m.effect) {
    case 'UPGRADE_DIE':
      return `BASE DIE → ${(m.dieType ?? type1).toUpperCase()} DIE`
    case 'REPLACE_DIE':
      return `${(m.fromDieType ?? 'base').toUpperCase()} DIE → ${(m.dieType ?? type1).toUpperCase()} DIE`
    case 'ADD_REROLL':
      return `+${m.amount ?? 1} REROLL!`
    case 'ADD_DIE':
      return `+1 ${(m.dieType ?? type1).toUpperCase()} DIE!`
    case 'ADD_HP':
      return `+${m.amount ?? 0} MAX HP!`
    case 'EVOLVE':
      return 'EVOLUTION'
  }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Pokédollars: ₽1,250 */
export const money = (n: number) => `₽${Math.round(n).toLocaleString('en')}`

/** "Gym Leader Brock", "Elite Four Lorelei", "Bug Catcher Rick"… */
export function trainerTitle(t: { name: string; kind?: string; role?: string }): string {
  return t.role === 'leader' ? `Gym Leader ${t.name}` : t.name
}

const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`

/** Each status in plain words, with the live numbers from game_config.status (Help table, Upgrades screen). */
export function statusEffects(r: StatusRules): { status: StatusKind; icon: IconName; name: string; die: PokeType; when: string; what: string }[] {
  const faces = (n: number, face: string) => `${n}+ ${face} face${n === 1 ? '' : 's'}`
  return [
    { status: 'burn', icon: 'burn', name: 'Burn', die: 'fire', when: faces(r.burn.threshold, 'Burn'), what: `${r.burn.damagePerStack} damage per stack at the start of the foe's turn for ${turns(r.burn.duration)}. Each Burn face adds a stack.` },
    { status: 'poison', icon: 'poison', name: 'Poison', die: 'poison', when: faces(r.poison.threshold, 'Poison'), what: `${r.poison.damage} damage at the start of the foe's turn for ${turns(r.poison.duration)}. Doesn't stack.` },
    { status: 'frozen', icon: 'frozen', name: 'Frozen', die: 'ice', when: faces(r.frozen.threshold, 'Frozen'), what: `The foe skips ${turns(r.frozen.stunTurns)}.` },
    { status: 'paralyze', icon: 'paralyze', name: 'Paralyze', die: 'electric', when: faces(r.paralyze.threshold, 'Paralyze'), what: `The foe skips ${turns(r.paralyze.stunTurns)}.` },
    { status: 'confuse', icon: 'confuse', name: 'Confuse', die: 'psychic', when: faces(r.confuse.threshold, 'Confuse'), what: "The foe's next attack hits itself." },
    {
      status: 'heal',
      icon: 'heal',
      name: 'Heal',
      die: 'grass',
      when: faces(r.heal.threshold, 'Heal'),
      what: `You heal HP equal to ${r.heal.amount === 'healFaces' ? 'the values of your Heal faces' : 'the total of your dice'}, on top of your damage.`,
    },
  ]
}
