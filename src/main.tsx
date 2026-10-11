import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { useGame } from './store/game'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
