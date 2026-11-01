// A trainer holding its ace's Mega Gem (docs/64, the user's review of 2026-11-01): Snowglobe Valley's Champion
// Nicholas Mega Evolves his Abomasnow inside the small world, where trainers' Megas are otherwise off.
import { describe, expect, it } from 'vitest'
import { compileGameData, enemyPlanFor, newSave } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { REGION_ID, snowglobe, withSnowglobe } from '../../scripts/content-snowglobe-valley'

const data = compileGameData(withSnowglobe(BUNDLE))
const champ = (() => {
  const league = snowglobe().areas.find((a) => a.name === 'Frost League')!
  return data.trainers[league.gyms.at(-1)!]!
})()
let n = 0
const save = newSave(179, data, 0, () => `t${++n}`)
const ace = { regionId: REGION_ID, role: champ.role, ace: true, items: champ.items }

describe('a trainer’s Mega Gem', () => {
  it('makes the Champion’s Abomasnow Mega Evolve in the world, with no unlock of the player’s', () => {
    expect(champ.items).toContain('abomasite')
    expect(enemyPlanFor(save, data, { dex: 460, level: 60 }, ace)?.mega).toBe(10060)
  })

  it('only for its ace, and only for the species the gem is for', () => {
    expect(enemyPlanFor(save, data, { dex: 460, level: 60 }, { ...ace, ace: false })?.mega).toBeUndefined()
    expect(enemyPlanFor(save, data, { dex: 473, level: 60 }, ace)?.mega).toBeUndefined()
  })

  it('changes nothing for a trainer with no gem', () => {
    expect(
      enemyPlanFor(save, data, { dex: 460, level: 60 }, { ...ace, items: ['hyper-potion'] })?.mega,
    ).toBeUndefined()
  })
})
