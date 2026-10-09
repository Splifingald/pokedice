import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { installFrames } from './theme/frames'

// The pixel frames and the ground texture are drawn before the first paint, at this screen's pixel ratio.
installFrames()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
