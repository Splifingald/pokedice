// The Pokédice trailer (docs/36-TRAILER-SCENARIO.md), drawn one frame at a time on request: scripts/trailer.ts opens
// this page, calls `trailer.render(n)` for every frame and records the canvas, then asks for the sound.
// Dev only: Vite serves it at /trailer/index.html; the game's build never includes it.
import { start } from './lib/app'
import { TOTAL_FRAMES } from './lib/clock'
import { scoreMusic } from './lib/music'
import { title } from './acts/title'
import { journey } from './acts/journey'
import { montage } from './acts/montage'
import { features } from './acts/features'
import { choice } from './acts/choice'
import { endCard } from './acts/end'

export type { Act } from './lib/app'

start([title, journey, montage, features, choice, endCard], TOTAL_FRAMES, scoreMusic)
