// Dev only (App.tsx mounts it under import.meta.env.DEV, so a production build has none of it): /__demo/:scene opens one
// of the promo trailer's scenes (src/dev/promo.ts) in the real game, for scripts/record-promo.ts. It only sets the
// starting state; what plays is the game's own.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Encounter, SaveData } from '@/engine'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { RaidIntro } from '@/screens/events/RaidIntro'
import { RaidView } from '@/screens/events/RaidView'
import type { RaidRun } from '@/store/raidBattle'
import { commitSave, initialRun, useGame } from '@/store/game'
import { useRaidRun } from '@/store/raidBattle'
import { engage, seedRun } from '@/store/run'
import { buildHeroSave, HERO_AREA_ID, HERO_LEAD_ID, heroEncounter, heroOptionsFrom } from './heroDemo'
import {
  AREA,
  DUELS,
  duelSave,
  planDuel,
  PLAYER,
  promoSave,
  raidRun,
  rayquazaRaid,
  withDayCare,
  withTrades,
  type DuelPlan,
} from './promo'

declare global {
  interface Window {
    /** What the recording reads back: the game's store, and a duel's turn (the dice it rerolls). */
    __promo?: { state: () => ReturnType<typeof useGame.getState>; plan?: DuelPlan }
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
  // Darkrai's and Giratina's raid intros, their worlds' scenes (the areas that hold those raids are the admin's).
  const [intro, setIntro] = useState<{ run: RaidRun; world: 'nightmare' | 'distortion' } | null>(null)
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
      case 'darkrai':
      case 'giratina': {
        const nightmare = scene === 'darkrai'
        const areaId = nightmare ? AREA.newmoon : AREA.turnback
        const save = promoSave(data, {
          team: [
            { dex: 149, level: 70 },
            { dex: 6, level: 70 },
            { dex: 130, level: 70 },
          ],
          areaId,
          region: 'sinnoh',
          now,
        })
        load(save)
        const look = avatarOf(playerAvatarId(PLAYER)).src
        setIntro({
          run: raidRun(data, areaId, look, nightmare ? 491 : 487, 'sinnoh'),
          world: nightmare ? 'nightmare' : 'distortion',
        })
        return
      }
      case 'title':
        // A first visit: no save at all.
        return navigate('/', { replace: true })
      default: {
        const duel = DUELS[scene]
        if (!duel) return
        const save = duelSave(data, duel, now)
        load(save)
        useGame.setState({
          run: { ...initialRun(), areaId: duel.areaId, phase: 'preview', encounter: duel.foe },
          battle: null,
        })
        engage(save.team[0]!)
        const battle = useGame.getState().battle!
        const enemy = battle.state.enemy
        // A fight already under way (the foe worn down), Z-Moves open: the starting state only.
        const state = {
          ...battle.state,
          enemy: duel.foeHp ? { ...enemy, hp: Math.round(enemy.maxHp * duel.foeHp) } : enemy,
          ...(duel.z && { zAllowed: true }),
        }
        useGame.setState({ battle: { ...battle, state } })
        // The turn the trailer shows, found on this very battle; its seed in before the first roll.
        const plan = planDuel(state, data, duel.goal)
        if (!plan) throw new Error(`No seed plays the ${scene} duel's turn`)
        seedRun(plan.seed)
        window.__promo.plan = plan
        return navigate('/area', { replace: true })
      }
    }
  }, [scene, params, navigate])

  if (blocked)
    return <div className="p-6 text-2xl">This browser already holds a save: open it in a private window.</div>
  if (scene === 'raid' && run) return <RaidView key={run.id} run={run} />
  if (intro) return <RaidIntro run={intro.run} world={intro.world} onDone={() => {}} />
  return <div className="p-6 text-2xl">Loading…</div>
}
