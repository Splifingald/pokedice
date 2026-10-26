import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { setSettings, useGame } from './store/game'
import { installFrames } from './theme/frames'
import { applyTheme, resolveTheme } from './theme/theme'

// The pixel frames and the ground texture are drawn before the first paint, at this screen's pixel ratio and in the
// player's theme; the theme follows the setting from then on.
const theme = () => useGame.getState().settings.theme
installFrames(resolveTheme(theme()))
applyTheme(theme())
useGame.subscribe((s, prev) => {
  if (s.settings.theme !== prev.settings.theme) applyTheme(s.settings.theme)
})

// Safari pinch-zooms whatever touch-action says (index.css): its own gesture events are the way to stop it.
for (const type of ['gesturestart', 'gesturechange'])
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })

// Test scripts (the prototype, the dev server) reach the store; the real build has neither.
if (import.meta.env.VITE_PROTO || import.meta.env.DEV)
  void import('./store/run').then((run) => Object.assign(window, { __pd: { useGame, run, setSettings } }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
