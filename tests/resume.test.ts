// An encounter under way survives a reload (src/store/resume.ts): the page is loaded again from what it stored, and the
// player is back in the same encounter, at the same point, with the same dice to come — and the round hasn't moved on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleEvent, SaveData } from '@/engine'
import { parseSave } from '@/save/schema'

/** localStorage for the node test runner: what one page load stores, the next one reads. */
class MemoryStorage {
  map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

let disk: MemoryStorage
/** Every page loaded so far: one left behind must not write into the next one's storage with a late debounced write. */
let pages: { flushWrite: () => void }[] = []

/** A fresh page load: every module evaluated again (the store boots from what `disk` holds). */
async function load() {
  vi.resetModules()
  const game = await import('@/store/game')
  const run = await import('@/store/run')
  const storage = await import('@/save/storage')
  const page = { ...game, ...run, ...storage }
  pages.push(page)
  return page
}
type Page = Awaited<ReturnType<typeof load>>

/** The pages open so far write what they still owe now, into the storage they were playing on. */
function closePages() {
  for (const p of pages) p.flushWrite()
}

/** The page goes away: what is waiting to be written goes out first (pagehide). */
function leave(page: Page): Map<string, string> {
  page.flushWrite()
  return new Map(disk.map)
}

/** Come back to what `stored` holds, as a reload would. */
async function reload(stored: Map<string, string>): Promise<Page> {
  closePages()
  disk = new MemoryStorage()
  disk.map = new Map(stored)
  vi.stubGlobal('localStorage', disk)
  return load()
}

/** A new game, rolled on in its first area until a wild Pokémon or a trainer is previewed. */
function toFightPreview(page: Page, seed: number) {
  page.seedRun(seed)
  page.startNewGame(7)
  rollToFight(page)
}

/** In the save's first area, rolled on (through Centers, finds and the Game Corner) until a fight is previewed. */
function rollToFight(page: Page) {
  const { data } = page.useGame.getState()
  page.enterArea(data.areas[0]!.id)
  for (let i = 0; i < 80; i++) {
    const { run } = page.useGame.getState()
    if (run.phase === 'preview' && (run.encounter?.kind === 'wild' || run.encounter?.kind === 'trainer'))
      return
    if (run.phase === 'center') page.finishCenter()
    else if (run.phase === 'preview') page.engage()
    else if (run.phase === 'casino') page.leaveCasino()
    else page.rollNext()
  }
  throw new Error('no fight previewed')
}

/** One step of the player's side, as the battle screen would send it (enemy turns included). */
function nextEvent(page: Page): BattleEvent | null {
  const st = page.useGame.getState().battle?.state
  if (!st) return null
  switch (st.phase) {
    case 'enemy_turn':
      return { t: 'AI_TURN' }
    case 'player_roll':
      return { t: 'ROLL' }
    case 'player_reroll':
      return { t: 'ATTACK' }
    case 'player_stunned':
      return { t: 'PASS' }
    case 'player_switch': {
      const next = st.player.find((p, i) => p.hp > 0 && i !== st.activeIndex)
      return next ? { t: 'SWITCH', instanceId: next.uid } : null
    }
    default:
      return null
  }
}

/** Plays `n` steps of the battle (fewer if it ends), and says what each one logged. */
function play(page: Page, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const e = nextEvent(page)
    if (!e) break
    const before = page.useGame.getState().battle!.log.length
    page.dispatchBattle(e)
    out.push(JSON.stringify(page.useGame.getState().battle?.log.slice(before) ?? []))
  }
  return out
}

const storedSave = (stored: Map<string, string>): SaveData =>
  JSON.parse(stored.get('pokedice.save')!) as SaveData

beforeEach(() => {
  disk = new MemoryStorage()
  vi.stubGlobal('localStorage', disk)
})
afterEach(() => {
  vi.restoreAllMocks()
  closePages()
  pages = []
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('an encounter under way survives a reload', () => {
  it('a previewed encounter is still there after a reload: the round has not moved on', async () => {
    const page = await load()
    toFightPreview(page, 31)
    const before = page.useGame.getState()
    const stored = leave(page)
    // Stored beside the save on the device; the save in play and the cloud's never carry it.
    expect(storedSave(stored).resume?.run).toMatchObject({ phase: 'preview', areaId: before.run.areaId })
    expect(before.save).not.toHaveProperty('resume')

    const back = await reload(stored)
    const after = back.useGame.getState()
    expect(after.run.phase).toBe('preview')
    expect(after.run.encounter).toEqual(before.run.encounter)
    expect(after.run.areaId).toBe(before.run.areaId)
    // Nothing was dealt or counted meanwhile: the area's deck and rounds are as they were.
    expect(after.save!.areaProgress).toEqual(before.save!.areaProgress)
    expect(after.save).not.toHaveProperty('resume')
  })

  it('a fight picks up at the same point and rolls exactly what staying would have', async () => {
    const page = await load()
    toFightPreview(page, 47)
    page.engage()
    play(page, 3)
    const mid = page.useGame.getState()
    expect(mid.run.phase).toBe('battle')
    const stored = leave(page)
    // Staying: the next steps of the fight.
    const stayed = play(page, 12)
    expect(stayed.length).toBeGreaterThan(0)

    const back = await reload(stored)
    const after = back.useGame.getState()
    expect(after.run.phase).toBe('battle')
    expect(after.battle).toMatchObject({ id: mid.battle!.id, resumed: true })
    expect(after.battle!.state).toEqual(mid.battle!.state)
    expect(after.battle!.log).toEqual(mid.battle!.log)
    // Leaving can't be used to throw again: the same steps log the same dice and the same damage.
    expect(play(back, 12)).toEqual(stayed)
  })

  it('the catch throw and the rewards are picked up too', async () => {
    // A battle's stream is seeded afresh from Math.random: pinned, so this fight ends on a catch every time.
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const page = await load()
    toFightPreview(page, 5)
    page.engage()
    for (let i = 0; i < 400 && page.useGame.getState().run.phase === 'battle'; i++) play(page, 1)
    expect(page.useGame.getState().run.phase).toBe('catch')
    const before = page.useGame.getState()
    const back = await reload(leave(page))
    const after = back.useGame.getState()
    expect(after.run.phase).toBe('catch')
    expect(after.run.events).toEqual(before.run.events)
    expect(after.run.catch).toEqual(before.run.catch)
    // The same ball, the same die. (A caught Pokémon's id is new on each page; the roll is what has to match.)
    page.throwBall(null)
    back.throwBall(null)
    const roll = (p: Page) => {
      const { events: _e, pendingCatchId: _p, ...r } = p.useGame.getState().run.catch!.result!
      return r
    }
    expect(roll(back)).toEqual(roll(page))
  })

  it('nothing is kept once the encounter is over', async () => {
    const page = await load()
    toFightPreview(page, 47)
    page.engage()
    page.forfeit()
    page.afterWipe()
    expect(page.useGame.getState().run.phase).toBe('idle')
    const stored = leave(page)
    expect(storedSave(stored)).not.toHaveProperty('resume')
    const back = await reload(stored)
    expect(back.useGame.getState().run.phase).toBe('idle')
    expect(back.useGame.getState().battle).toBeNull()
  })

  it('the next battle after a picked-up one is a new screen (a new id)', async () => {
    const page = await load()
    toFightPreview(page, 47)
    page.engage()
    play(page, 2)
    const back = await reload(leave(page))
    const old = back.useGame.getState().battle!.id
    back.forfeit()
    back.afterWipe()
    rollToFight(back)
    back.engage()
    expect(back.useGame.getState().battle!.id).toBeGreaterThan(old)
  })

  it("a snapshot that doesn't fit the save any more is dropped, never the save", async () => {
    const page = await load()
    toFightPreview(page, 47)
    page.engage()
    const stored = leave(page)
    const save = storedSave(stored)
    // The Pokémon fighting is no longer in this save (another device's copy came in, say): its place taken by another.
    const lead = (save.resume!.battle!.state as { player: { uid: string }[] }).player[0]!.uid
    const swap = (id: string) => (id === lead ? 'someone-else' : id)
    const other = { ...save, box: save.box.map((p) => ({ ...p, id: swap(p.id) })), team: save.team.map(swap) }
    stored.set('pokedice.save', JSON.stringify(other))
    const back = await reload(stored)
    expect(back.useGame.getState().save).not.toBeNull()
    expect(back.useGame.getState().run.phase).toBe('idle')
    expect(back.useGame.getState().battle).toBeNull()
  })
})

describe('the stored snapshot in the save format', () => {
  it('is kept when it has the right outline, and an odd one is dropped without losing the save', async () => {
    const page = await load()
    toFightPreview(page, 31)
    const save = storedSave(leave(page))
    const ok = parseSave(save)
    expect(ok.ok && ok.save.resume?.run).toMatchObject({ phase: 'preview' })
    const odd = parseSave({ ...save, resume: { v: 2, run: 'nope' } })
    expect(odd.ok).toBe(true)
    expect(odd.ok && odd.save.resume).toBeUndefined()
  })
})
