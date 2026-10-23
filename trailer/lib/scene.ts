// Stages that aren't a move: both Pokémon standing on the battle stage (the game's Stage, so they stand where a battle
// puts them), with a look per frame — a faint, a glow, a silhouette.
import { Stage, type Timeline } from '@/fx/timeline'
import type { SpriteLook } from '@/fx/sprites'
import type { Run } from './run'

export type Looks = (t: number) => { own?: SpriteLook; foe?: SpriteLook; hideOwn?: boolean; hideFoe?: boolean }

export function idle(own: string, foe: string, looks: Looks = () => ({}), { bare = false } = {}): Timeline<Stage> {
  return {
    id: 'trailer.idle',
    dur: 600,
    setup: () => new Stage({ own, foe }, 7),
    step: (s, t, dt) => void s.step(t, dt),
    draw(g, s, t) {
      const l = looks(t)
      if (!bare) s.begin(g, t)
      else g.save()
      // Foe first: its platform is further away.
      if (!l.hideFoe) s.drawTarget(g, t, l.foe ?? {})
      if (!l.hideOwn) s.drawAttacker(g, l.own ?? {})
      s.end(g)
    },
    cues: () => [],
  }
}

/**
 * A run seen from the act's clock: started at `start`, played from its own time `from` at `speed`. Its sounds are heard
 * from `from` on (what comes before was skipped, not played).
 */
export function playAt(run: Run, t: number, start: number, from = 0, speed = 1) {
  run.at(from + Math.max(0, t - start) * speed, from)
  return run.draw()
}
