// move.html's own code, on the new address (docs/72). It imports nothing from the game on purpose: a module both pages
// used would be split into a file of its own that every player's game would then download too. So the few names it
// shares with src/save/move.ts are written out here again, and tests/site-move.test.ts checks they still agree.

/** The old address, where a failed take sends the player back. */
export const OLD_HOST = 'poke-dice.netlify.app'
/** Back on the old address: play there this time, and send the save again next load. */
export const STAY_HASH = '#stay'
/** The game says once that the save came over (engine/popups.ts `moved`). */
export const ARRIVED_KEY = 'pokedice.move.arrived'
/** A save that came while this address had one: the game compares the two as it starts (settleMovedSaves). */
export const PENDING = 'pokedice.move.pending:'

const STAYS = new Set([
  'pokedice.push',
  'pokedice.spritesDown',
  'pokedice.reloadSignal',
  'pokedice.room',
  'pokedice.linking',
  'pokedice.authProviders',
  'pokedice.devConfig',
])

/** Only the game's keys, as the old address packs them: a hand-made code can't plant anything else (a sign-in). */
export const carriedIn = (key: string): boolean =>
  key.startsWith('pokedice.') && !key.startsWith('pokedice.move.') && !STAYS.has(key)

/** Each save's key, by the key of what goes with it (its cloud mark). */
const SAVE_OF: Record<string, string> = {
  'pokedice.save': 'pokedice.save',
  'pokedice.save.cloud': 'pokedice.save',
  'pokedice.save.extreme': 'pokedice.save.extreme',
  'pokedice.save.extreme.cloud': 'pokedice.save.extreme',
}

/**
 * Lays what came into this address's storage. A key this address already has stays as it is, but a save: the one
 * that came waits beside it (`PENDING`) with its cloud mark, for the game to keep the further one and back up the other.
 */
export function layIn(ls: Storage, moved: Record<string, string>) {
  const had = new Set(Object.values(SAVE_OF).filter((k) => ls.getItem(k) != null))
  for (const [key, value] of Object.entries(moved)) {
    if (!carriedIn(key) || typeof value !== 'string') continue
    const save = SAVE_OF[key]
    if (save && had.has(save)) ls.setItem(PENDING + key, value)
    else if (ls.getItem(key) == null) ls.setItem(key, value)
  }
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** The server's text back into the keys: gzip in base64 (`g:`) or plain JSON (`j:`), as encodeMove wrote it. */
export async function decodeMove(text: string): Promise<Record<string, string>> {
  let json: string
  if (text.startsWith('g:')) {
    const out = new Blob([fromBase64(text.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip'))
    json = await new Response(out).text()
  } else if (text.startsWith('j:')) json = text.slice(2)
  else throw new Error('move_format')
  const data = JSON.parse(json) as unknown
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('move_format')
  return Object.fromEntries(
    Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
}

/** What the old address left under `code`, once (the server deletes it as it answers); null when gone. */
export async function takeMove(base: string, key: string, code: string): Promise<string | null> {
  const res = await fetch(`${base}/rest/v1/rpc/site_move_take`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_code: code }),
  })
  if (!res.ok) throw new Error(`take_${res.status}`)
  const payload = (await res.json()) as unknown
  return typeof payload === 'string' ? payload : null
}
