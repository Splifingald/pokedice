// move.html, on the new address (docs/72): the old address sent the player here with a one-time code in the link's
// fragment. The device's game data is taken from the server and laid into this address's storage before the game
// starts, then the player goes on to the page they were on. A page of its own, so no game is running here yet to write
// over what arrives. When the take fails, the player goes back to the old address, which keeps the save and plays on.
import { ARRIVED_KEY, decodeMove, layIn, OLD_HOST, STAY_HASH, takeMove } from './moveIn'

/** The page to go on to: a path on this site only. */
function pathTo(): string {
  const to = new URLSearchParams(location.search).get('to') ?? '/'
  return to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/move.html') ? to : '/'
}

async function arrive() {
  const to = pathTo()
  const back = () => location.replace(`https://${OLD_HOST}${to}${STAY_HASH}`)
  const code = location.hash.slice(1)
  if (!/^[0-9a-f-]{36}$/i.test(code)) return location.replace(to)
  try {
    const env = import.meta.env
    const text = await takeMove(
      env.VITE_SUPABASE_URL?.trim() ?? '',
      env.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
      code,
    )
    // Taken already (this page opened again) or an hour past: with a save here, play on; without, the old address
    // still has it.
    if (text == null) return localStorage.getItem('pokedice.save') != null ? location.replace(to) : back()
    layIn(localStorage, await decodeMove(text))
    localStorage.setItem(ARRIVED_KEY, '1')
    location.replace(to)
  } catch (err) {
    console.warn('[move] could not take the save in', err)
    back()
  }
}

void arrive()
