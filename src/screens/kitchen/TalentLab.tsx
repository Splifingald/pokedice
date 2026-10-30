// Dev only (/kitchen-sink/talent-lab?talent=static): one hidden talent (docs/51) at work in a real fight on the battle
// screen, without the store: a set-up made for it (who carries it, a status, low HP…) and a seed picked so that it
// shows within the first turns (a chance talent included). Enter (or ATTACK) plays your side; the foe plays itself.
// The talents that work out of battle have their own steps (the Day Care, the victory card, the catch); Pickup's find
// has `?find=pickup`.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createRng, isTalentKey, reduce, type TalentKey } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { talentName } from '@/components/Talent'
import { useGame, type BattleSlice } from '@/store/game'
import { enterArea, rollNext } from '@/store/run'
import { BattleView, type VersusReplay } from '../battle/BattleView'
import { findSeed, LAB, setUp } from './talentLab'

/**
 * `?find=pickup`: Pickup's find (docs/51) as the area shows it after a win, without waiting on its 5 %: the find of
 * your lead (the area's first loot that isn't once-only) queued as the store queues it, and the area's next step.
 */
function PickupFind() {
  const navigate = useNavigate()
  useEffect(() => {
    const { save, data } = useGame.getState()
    if (!save) return
    const area = data.areas.find((a) => a.id === save.currentAreaId)
    const entry = area?.lootPool.find((e) => !e.unique && e.itemKey !== 'money')
    const lead = save.box.find((p) => p.id === save.team[0])
    if (!area || !entry || !lead || !enterArea(area.id)) return
    useGame.setState((s) => ({
      run: {
        ...s.run,
        pickup: {
          kind: 'item',
          entryId: entry.id,
          itemKey: entry.itemKey,
          qty: Math.max(1, entry.minQty),
          pickup: { uid: lead.id, dex: lead.dex },
        },
      },
    }))
    rollNext()
    navigate('/area')
  }, [navigate])
  return null
}

export function TalentLab() {
  const [params] = useSearchParams()
  return params.get('find') === 'pickup' ? <PickupFind /> : <LabFight />
}

function LabFight() {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const [params] = useSearchParams()
  const raw = params.get('talent')
  const key: TalentKey = isTalentKey(raw) && LAB[raw] ? raw : 'opener'
  const sc = LAB[key]!
  const [run, setRun] = useState(0)
  const seed = useMemo(() => findSeed(key, sc, data), [key, sc, data])
  const opened = useMemo(() => setUp(sc, data), [sc, data, run]) // eslint-disable-line react-hooks/exhaustive-deps
  const state = useRef(opened.state)
  const rng = useRef(createRng(seed))
  const firstDone = useRef(false)
  const [slice, setSlice] = useState<BattleSlice>(() => ({ state: opened.state, log: opened.log, id: 1 }))
  const [over, setOver] = useState(false)

  const restart = () => {
    const fresh = setUp(sc, data)
    state.current = fresh.state
    rng.current = createRng(seed)
    firstDone.current = false
    setOver(false)
    setRun((n) => n + 1)
    setSlice({ state: fresh.state, log: fresh.log, id: Date.now() })
  }

  const replay: VersusReplay = {
    dispatch: (e) => {
      // The scenario's own first move (a switch) stands in for the first roll.
      const move = e.t === 'ROLL' && sc.first && !firstDone.current ? sc.first(state.current) : e
      if (move !== e) firstDone.current = true
      const r = reduce(state.current, move, data, rng.current)
      if (r.state === state.current) return
      state.current = r.state
      setSlice((s) => ({ ...s, state: r.state, log: [...s.log, ...r.log] }))
    },
    nextMove: () => [],
    trainerName: `${talentName(key)} · lab`,
    trainerSprite: '',
    foeCount: sc.foes?.length ?? 1,
    foeIndex: 0,
    onPlayed: () => setOver(true),
    live: { auto: false, onAuto: () => {} },
    end: over ? (
      <div className="grid gap-2 p-2">
        <PixelButton variant="primary" size="lg" onClick={restart}>
          Again
        </PixelButton>
        <PixelButton onClick={() => navigate('/kitchen-sink')}>Kitchen sink</PixelButton>
      </div>
    ) : undefined,
  }
  return <BattleView key={slice.id} battle={slice} versus={replay} />
}
