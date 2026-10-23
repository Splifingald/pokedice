// The trailer's 15-second social media cut (docs/36 §12), on the same page machinery as the main one
// (/trailer/social.html; `pnpm trailer --cut social`).
import { start } from './lib/app'
import { scoreSocial } from './lib/music'
import { SOCIAL_ACTS, SOCIAL_FRAMES } from './acts/social'

start(SOCIAL_ACTS, SOCIAL_FRAMES, scoreSocial)
