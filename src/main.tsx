import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { ensureLanguage } from './store/game'

/** How long the first screen waits for the player's language file before showing in English (it switches on arrival). */
const LANG_WAIT_MS = 3000

async function start() {
  // English is built in; any other language is its own small file. Waiting for it keeps the first screen from
  // flashing English. Offline or slow, the game starts anyway and switches when it arrives.
  await Promise.race([ensureLanguage(), new Promise((resolve) => setTimeout(resolve, LANG_WAIT_MS))])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
