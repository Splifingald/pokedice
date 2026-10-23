// The whole trailer in portrait, 1080×1920 (docs/36 §9): the same acts and score as trailer/main.ts, laid out by
// lib/frame's portrait frame (/trailer/portrait-long.html; `pnpm trailer --cut portrait-long`).
import { setFrame, PORTRAIT } from './lib/frame'
import { start } from './lib/app'
import { TOTAL_FRAMES } from './lib/clock'
import { scoreMusic } from './lib/music'
import { title } from './acts/title'
import { journey } from './acts/journey'
import { montage } from './acts/montage'
import { features } from './acts/features'
import { choice } from './acts/choice'
import { endCard } from './acts/end'

setFrame(PORTRAIT)
start([title, journey, montage, features, choice, endCard], TOTAL_FRAMES, scoreMusic)
