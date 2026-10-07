// SYNC ONLINE: only for signed-in players, never mid-fight, and resting 5 minutes after a successful sync.
import { afterEach, describe, expect, it } from 'vitest'
import { initialRun, useGame } from '@/store/game'
import { SYNC_COOLDOWN_MS, syncBlockedBy, useCloudSync } from '@/store/sync'

const signIn = () => useGame.setState({ auth: { status: 'signed_in', userId: 'u1', email: 'a@b.c' } })

describe('SYNC ONLINE', () => {
  afterEach(() => {
    useGame.setState({
      auth: { status: 'unknown', userId: null, email: null },
      run: initialRun(),
      syncConflict: null,
    })
    useCloudSync.setState({ lastAt: null, busy: false })
  })

  it('is for players signed in with Google', () => {
    expect(syncBlockedBy()).toBe('signedOut')
    signIn()
    expect(syncBlockedBy()).toBeNull()
  })

  it('rests for 5 minutes after a successful sync', () => {
    signIn()
    const now = 1_000_000
    useCloudSync.setState({ lastAt: now })
    expect(syncBlockedBy(now + 1000)).toBe('cooldown')
    expect(syncBlockedBy(now + SYNC_COOLDOWN_MS - 1)).toBe('cooldown')
    expect(syncBlockedBy(now + SYNC_COOLDOWN_MS)).toBeNull()
    expect(SYNC_COOLDOWN_MS).toBe(5 * 60_000)
  })

  it('waits for a running sync, a fight to end, or a save conflict to be settled', () => {
    signIn()
    useCloudSync.setState({ busy: true })
    expect(syncBlockedBy()).toBe('busy')
    useCloudSync.setState({ busy: false })
    useGame.setState({ run: { ...initialRun(), phase: 'battle' } })
    expect(syncBlockedBy()).toBe('fight')
  })
})

describe('reloading for a newer build', () => {
  afterEach(() => useGame.setState({ run: initialRun(), syncConflict: null }))

  it('waits for a moment with nothing to lose: no fight, encounter or catch decision on screen', async () => {
    const { safeToReload } = await import('@/store/sync')
    expect(safeToReload()).toBe(true)
    for (const phase of ['battle', 'catch', 'victory', 'preview', 'center'] as const) {
      useGame.setState({ run: { ...initialRun(), phase } })
      expect(safeToReload(), phase).toBe(false)
    }
    useGame.setState({ run: { ...initialRun(), pendingCatchId: 'x' } })
    expect(safeToReload()).toBe(false)
  })

  it('waits for the end of a Versus fight, which plays outside the run', async () => {
    const { holdReload, safeToReload } = await import('@/store/sync')
    const release = holdReload()
    expect(safeToReload()).toBe(false)
    release()
    release() // a second call changes nothing
    expect(safeToReload()).toBe(true)
  })
})
