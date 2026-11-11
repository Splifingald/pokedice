// The new address (docs/72). A browser keeps a site's storage per address, so a player opening pokedice.graf.quest
// would find none of what poke-dice.netlify.app kept: the save, the Extreme save, the settings, the device's id. The
// old address packs it all (`packDevice`), the server holds it under a one-time code for an hour (migration 0148), and
// the new address lays it into its storage before the game starts there (move.html: src/move.ts, src/moveIn.ts, which
// share no code with the game, so the names they share are written out in both). A save that finds one already there
// waits beside it until the game starts, which keeps the further one (`settleMovedSaves`). The requests and the
// timing on the old address are src/lib/siteMove.ts's.
import type { SaveData, SaveMode } from '@/engine/types'
import { tIn } from '@/i18n'
import { decideSync } from './cloud'
import { parseSave } from './schema'
import { backupSave, readSettings, slotKeys, writeSave } from './storage'

/** The old address: the one players had until the move. */
export const OLD_HOST = 'poke-dice.netlify.app'
/** The new address, where the old one sends them. */
export const NEW_ORIGIN = 'https://pokedice.graf.quest'

/** The page on the new address that takes the save in (move.html, src/move.ts), the code in its fragment. */
export const MOVE_PAGE = '/move.html'
/** Back on the old address after a failed take: play there this time, and send the save again next load. */
export const STAY_HASH = '#stay'

/** On the new address: the save just came over, and the game says so once (engine/popups.ts `moved`). */
export const ARRIVED_KEY = 'pokedice.move.arrived'
/** A save that came while the new address had one, by its key: compared as the game starts (settleMovedSaves). */
export const PENDING = 'pokedice.move.pending:'
/** On the old address: the fingerprint of what it last handed over, so a visit that changed nothing sends nothing. */
export const SENT_KEY = 'pokedice.move.sent'

/**
 * What stays behind: the move's own marks, and what belongs to the address rather than the player — the push
 * subscription (made for the old address: the new one asks again), the sprite fallback and reload signals, the room
 * probe, a sign-in under way, the sign-in options' cache and the dev server's config.
 */
const STAYS = new Set([
  'pokedice.push',
  'pokedice.spritesDown',
  'pokedice.reloadSignal',
  'pokedice.room',
  'pokedice.linking',
  'pokedice.authProviders',
  'pokedice.devConfig',
])

/** A key the move carries: every key of the game's (`pokedice.`), but what stays behind. */
export const carried = (key: string): boolean =>
  key.startsWith('pokedice.') && !key.startsWith('pokedice.move.') && !STAYS.has(key)

/** The device's game data, key by key. */
export function packDevice(): Record<string, string> {
  const ls = localStorage
  const out: Record<string, string> = {}
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i)
    if (!key || !carried(key)) continue
    const value = ls.getItem(key)
    if (value != null) out[key] = value
  }
  return out
}

const SLOTS: SaveMode[] = ['main', 'extreme']

function parse(raw: string | null | undefined): SaveData | null {
  if (!raw) return null
  try {
    const res = parseSave(JSON.parse(raw))
    return res.ok ? res.save : null
  } catch {
    return null
  }
}

/**
 * As the game starts on the new address: a save that came from the old one while this address had a save of its own
 * (the player tried the new address first) meets it as a cloud copy would (`decideSync`: the further one wins), and
 * the other is kept in the save's backups (Settings), never lost. Usually nothing waits, and this reads two keys.
 */
export function settleMovedSaves() {
  let ls: Storage
  try {
    ls = localStorage
    if (!SLOTS.some((w) => ls.getItem(PENDING + slotKeys(w).save) != null)) return
  } catch {
    return
  }
  // The language the backups' reason is written in: the player's.
  const lang = readSettings().lang ?? 'en'
  for (const which of SLOTS) {
    const keys = slotKeys(which)
    const raw = ls.getItem(PENDING + keys.save)
    const mark = ls.getItem(PENDING + keys.cloud)
    ls.removeItem(PENDING + keys.save)
    ls.removeItem(PENDING + keys.cloud)
    const came = parse(raw)
    if (!came) continue
    const here = parse(ls.getItem(keys.save))
    if (here && decideSync(here, came) !== 'cloud') {
      backupSave(came, tIn(lang, 'ui.move.backupOld'))
      continue
    }
    if (here) backupSave(here, tIn(lang, 'ui.move.backupHere'))
    writeSave(came, which)
    if (mark) ls.setItem(keys.cloud, mark)
    else ls.removeItem(keys.cloud)
  }
}

// ---------------------------------------------------------------- on the way

/** Base64 of bytes, in slices: a big save would overflow the arguments of one String.fromCharCode call. */
function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/**
 * The packed data as text for the server: gzip in base64 (`g:`), a big save's 1.3 MB down to a few hundred KB, or
 * plain JSON (`j:`) on a browser without CompressionStream (Safari before 16.4).
 */
export async function encodeMove(data: Record<string, string>): Promise<string> {
  const json = JSON.stringify(data)
  if (typeof CompressionStream === 'undefined') return `j:${json}`
  return `g:${toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip')))}`
}
