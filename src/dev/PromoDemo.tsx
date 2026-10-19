// Dev only (App.tsx mounts it under import.meta.env.DEV, so a production build has none of it): /__demo/:scene opens one
// of the promo trailer's scenes (src/dev/promo.ts) in the real game, for scripts/record-promo.ts. It only sets the
// starting state; what plays is the game's own.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Encounter, SaveData } from '@/engine'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { RaidView } from '@/screens/events/RaidView'
import { commitSave, initialRun, useGame } from '@/store/game'
import { useRaidRun } from '@/store/raidBattle'
import { engage, seedRun } from '@/store/run'
import { buildHeroSave, HERO_AREA_ID, HERO_LEAD_ID, heroEncounter, heroOptionsFrom } from './heroDemo'
import { AREA, PLAYER, promoSave, rayquazaRaid, withDayCare, withTrades } from './promo'

declare global {
  interface Window {
    /** What the recording reads back: the game's store. */
    __promo?: { state: () => ReturnType<typeof useGame.getState> }
  }
}

// StrictMode runs effects twice in dev: a scene is set up once.
let booted = false

/** The save in, its settings (sound on, animations full) in play. */
function load(save: SaveData) {
  useGame.setState((g) => ({ settings: { ...g.settings, ...save.settings } }))
  commitSave(save)
}

/** An encounter engaged as CONTINUE → ENGAGE would, then the battle's dice seeded. */
function fight(areaId: string, encounter: Encounter, lead: string, seed: number) {
  useGame.setState({ run: { ...initialRun(), areaId, phase: 'preview', encounter }, battle: null })
  engage(lead)
  // engage() seeds the battle at random: the scene's seed goes in after it, before the first roll.
  seedRun(seed)
}

export default function PromoDemo() {
  const { scene = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState(false)
  const run = useRaidRun((s) => s.run)

  useEffect(() => {
    if (booted) return
    // It writes a save of its own: never over a real one (a fresh browser profile, as the recording uses).
    if (useGame.getState().save) {
      setBlocked(true)
      return
    }
    booted = true
    window.__promo = { state: () => useGame.getState() }
    const { data } = useGame.getState()
    const now = Date.now()
    const seed = Number(params.get('seed') ?? 1)
    switch (scene) {
      case 'battle': {
        // The hero turn (scripts/find-hero-seed.ts), Raichu and Gyarados on the team too.
        const o = heroOptionsFrom(params)
        const base = buildHeroSave(data, o, now)
        const more = promoSave(data, {
          team: [
            { dex: 26, level: 48 },
            { dex: 130, level: 49 },
          ],
          areaId: HERO_AREA_ID,
          region: 'kanto',
          now,
        })
        load({
          ...base,
          settings: more.settings,
          player: PLAYER,
          box: [...base.box, ...more.box],
          team: [...base.team, ...more.team],
          pokedex: [...new Set([...base.pokedex, ...more.pokedex])],
        })
        fight(HERO_AREA_ID, heroEncounter(o), HERO_LEAD_ID, o.seed)
        return navigate('/area', { replace: true })
      }
      case 'boss': {
        // Celebi's shrine in Ilex Forest: Dragonite leads, Gyarados swapped out.
        const save = promoSave(data, {
          team: [
            { dex: 149, level: 55 },
            { dex: 6, level: 52 },
            { dex: 26, level: 50 },
          ],
          areaId: AREA.ilexShrine,
          region: 'johto',
          now,
        })
        load(save)
        fight(AREA.ilexShrine, { kind: 'boss', dex: 251, level: 50 }, save.team[0]!, seed)
        return navigate('/area', { replace: true })
      }
      case 'mega': {
        // Lumiose City: Lucario (Lv.50, where Mega Evolution opens) against a wild Greninja.
        const save = promoSave(data, {
          team: [
            { dex: 448, level: 50 },
            { dex: 149, level: 52 },
            { dex: 6, level: 52 },
          ],
          areaId: AREA.lumiose,
          region: 'kalos',
          now,
        })
        load(save)
        fight(AREA.lumiose, { kind: 'wild', dex: 658, level: 36, isNew: true }, save.team[0]!, seed)
        return navigate('/area', { replace: true })
      }
      case 'home':
      case 'daycare':
      case 'trade': {
        const base = promoSave(data, {
          team: [
            { dex: 6, level: 50 },
            { dex: 26, level: 48 },
            { dex: 130, level: 49 },
          ],
          box: [{ dex: 67, level: 40 }],
          areaId: AREA.ceruleanCave,
          region: 'kanto',
          now,
        })
        const save = scene === 'daycare' ? withDayCare(data, base, now) : withTrades(data, base)
        load(save)
        return navigate(scene === 'home' ? '/home' : scene === 'daycare' ? '/daycare' : '/trades', {
          replace: true,
        })
      }
      case 'raid': {
        const save = promoSave(data, {
          team: [
            { dex: 149, level: 70 },
            { dex: 6, level: 70 },
            { dex: 130, level: 70 },
          ],
          areaId: AREA.skyPillar,
          region: 'hoenn',
          now,
        })
        load(save)
        useRaidRun.setState({ run: rayquazaRaid(data, AREA.skyPillar, avatarOf(playerAvatarId(PLAYER)).src) })
        return
      }
      case 'title':
        // A first visit: no save at all.
        return navigate('/', { replace: true })
    }
  }, [scene, params, navigate])

  if (blocked)
    return <div className="p-6 text-2xl">This browser already holds a save: open it in a private window.</div>
  if (scene === 'raid' && run) return <RaidView key={run.id} run={run} />
  return <div className="p-6 text-2xl">Loading…</div>
}
