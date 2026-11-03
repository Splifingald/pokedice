// The bots' weekly teams job (netlify/functions/versus-bots.mts, docs/44 §9): asks first, reads the content and draws
// the week's set only when the week still needs one, and stores it under the week's Monday.
import { describe, expect, it, vi } from 'vitest'
import { weekBotTeams } from '@/engine'
import { makeWeekBotTeams } from '../netlify/versus/bots'
import { data } from './fixtures'

const FRIDAY = Date.parse('2026-10-30T14:00:00Z')

describe('the bots’ weekly teams job', () => {
  it('does nothing more than ask when the week has its set (or the league is off)', async () => {
    const deps = { due: vi.fn(async () => false), data: vi.fn(async () => data), put: vi.fn(async () => 0) }
    expect(await makeWeekBotTeams(deps, FRIDAY)).toEqual({ week: '2026-10-26', made: 0 })
    expect(deps.due).toHaveBeenCalledWith('2026-10-26')
    expect(deps.data).not.toHaveBeenCalled()
    expect(deps.put).not.toHaveBeenCalled()
  })

  it('draws the week’s set and stores it when it is due', async () => {
    const put = vi.fn(async (_week: string, teams: unknown[]) => teams.length)
    const made = await makeWeekBotTeams({ due: async () => true, data: async () => data, put }, FRIDAY)
    expect(made).toEqual({ week: '2026-10-26', made: 200 })
    expect(put).toHaveBeenCalledWith('2026-10-26', weekBotTeams(data, '2026-10-26'))
  })
})
