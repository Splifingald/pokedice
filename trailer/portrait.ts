// The social cut in portrait, 1080×1920, for TikTok, YouTube Shorts and Reels (docs/36 §13): the same acts and score,
// laid out by lib/frame's portrait frame (/trailer/portrait.html; `pnpm trailer --cut portrait`).
import { setFrame, PORTRAIT } from './lib/frame'
import { start } from './lib/app'
import { scoreSocial } from './lib/music'
import { SOCIAL_ACTS, SOCIAL_FRAMES } from './acts/social'

setFrame(PORTRAIT)
start(SOCIAL_ACTS, SOCIAL_FRAMES, scoreSocial)
