// Dev only (App.tsx mounts it under import.meta.env.DEV, so a production build has none of it): /__demo/hero boots
// straight into the promo clip's battle (src/dev/heroDemo.ts) with its seed, for scripts/record-hero.ts. It only sets
// the starting state; the battle is the game's own, engaged and played through the store like any other.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { commitSave, initialRun, useGame } from '@/store/game'
import { engage, seedRun } from '@/store/run'
import { buildHeroSave, HERO_AREA_ID, HERO_LEAD_ID, heroEncounter, heroOptionsFrom } from './heroDemo'

declare global {
  interface Window {
    /** What the recording reads back: the battle as the store holds it, and the run around it. */
    __heroDemo?: { state: () => ReturnType<typeof useGame.getState> }
  }
}

// StrictMode runs effects twice in dev: the battle is set up once.
let booted = false

export default function HeroDemo() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (booted) return
    // It writes a save of its own: never over a real one (a fresh browser profile, as the recording uses).
    if (useGame.getState().save) {
      setBlocked(true)
      return
    }
    booted = true
    const o = heroOptionsFrom(params)
    const { data, settings } = useGame.getState()
    const save = buildHeroSave(data, o, Date.now())
    useGame.setState({ settings: { ...settings, ...save.settings } })
    commitSave(save)
    useGame.setState({
      run: { ...initialRun(), areaId: HERO_AREA_ID, phase: 'preview', encounter: heroEncounter(o) },
      battle: null,
    })
    engage(HERO_LEAD_ID)
    // engage() seeds the battle at random: the clip's seed goes in after it, before the first roll.
    seedRun(o.seed)
    if (o.foeHp != null)
      useGame.setState((g) =>
        g.battle
          ? {
              battle: {
                ...g.battle,
                state: { ...g.battle.state, enemy: { ...g.battle.state.enemy, hp: o.foeHp! } },
              },
            }
          : {},
      )
    window.__heroDemo = { state: () => useGame.getState() }
    navigate('/area', { replace: true })
  }, [params, navigate])

  return (
    <div className="p-6 text-2xl">
      {blocked
        ? 'This browser already holds a save: open /__demo/hero in a private window.'
        : 'Loading the hero clip…'}
    </div>
  )
}
