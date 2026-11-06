// At sign-in, the raids the server recorded the player winning (0089) come back into a save that lost them — a page
// left open from a build before 2026-10-22 wrote saves back without them (2026-10-29). Only ever adds.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newSave, type SaveData } from '@/engine'
import { useGame } from '@/store/game'
import { restoreRaidsDone } from '@/store/sync'
import { data, newId } from './fixtures'

const server = vi.hoisted(() => ({ done: null as string[] | null }))
vi.mock('@/lib/raid', () => ({ fetchRaidsDone: async () => server.done }))

const base = newSave(4, data, 1000, newId)

afterEach(() => {
  server.done = null
  useGame.setState({ save: null })
})

describe('raids won, restored from the server’s record', () => {
  it('adds back the raids the save lost, keeping the ones it has', async () => {
    useGame.setState({ save: { ...base, events: { raidsDone: ['b:144'], raidsWon: 3 } } })
    server.done = ['a:150', 'b:144', 'c:146']
    await restoreRaidsDone()
    const events = useGame.getState().save!.events
    expect(events?.raidsDone).toEqual(['b:144', 'a:150', 'c:146'])
    expect(events?.raidsWon).toBe(3)
  })

  it('brings them back to a save whose events were lost altogether', async () => {
    const stripped: SaveData = { ...base }
    delete stripped.events
    useGame.setState({ save: stripped })
    server.done = ['a:150']
    await restoreRaidsDone()
    expect(useGame.getState().save!.events?.raidsDone).toEqual(['a:150'])
  })

  it('leaves the save alone when the server says nothing new, or can’t be read', async () => {
    const save: SaveData = { ...base, events: { raidsDone: ['a:150'] } }
    useGame.setState({ save })
    server.done = ['a:150']
    await restoreRaidsDone()
    expect(useGame.getState().save).toBe(save)
    server.done = null
    await restoreRaidsDone()
    expect(useGame.getState().save).toBe(save)
  })
})
