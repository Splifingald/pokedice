// Kitchen sink: Extreme mode's Pokémon Centers (docs/47) in every state — the boons (each kind, three on offer and
// the heal alone), a pick's confirm, who a full heal or Team Rocket's trade goes to, Team Rocket's reveal, the Center a
// K.O. sends, the Pokébuff's tag and the rules.
import { useMemo, useState } from 'react'
import { BuffTag } from '@/components/Extreme'
import {
  BoonChoiceView,
  BoonTargetPicker,
  CenterBoonConfirm,
  CenterRulesModal,
  describeBoon,
  RocketReveal,
  WipeCenterNote,
} from '@/components/ExtremeCenter'
import { PixelButton } from '@/components/PixelButton'
import {
  createInstance,
  HOUR_MS,
  instanceMaxHp,
  type CenterBoon,
  type PokemonInstance,
  type SaveData,
} from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

export function ExtremeCenterBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [picker, setPicker] = useState<null | 'full' | 'rocket'>(null)
  const [trade, setTrade] = useState<{ gave: PokemonInstance; got: PokemonInstance } | null>(null)
  const sample = useMemo(() => {
    const mon = (id: string, dex: number, level: number, hp?: number): PokemonInstance => {
      const p = createInstance(dex, level, data, id, 0)
      return hp == null ? p : { ...p, currentHp: Math.min(hp, instanceMaxHp(p, data)) }
    }
    const box = [mon('a', 2, 22, 12), mon('b', 5, 21, 0), mon('c', 8, 20), mon('d', 25, 18, 9)]
    const save = { box, team: ['a', 'b', 'c'] } as unknown as SaveData
    const all: CenterBoon[] = [
      { kind: 'heal', percent: 30 },
      { kind: 'full' },
      { kind: 'item', itemKey: 'super-potion' },
      { kind: 'buff', uid: 'c', type: 'water' },
      { kind: 'donor', gold: 540 },
      { kind: 'rocket' },
    ]
    const buffed = { ...box[2]!, buff: { type: 'water' as const, until: Date.now() + 23 * HOUR_MS } }
    return { save, all, buffed, box }
  }, [data])
  const views = sample.all.map((b) => describeBoon(b, sample.save, data, t))
  const fullTargets = sample.box.filter((p) => p.currentHp < instanceMaxHp(p, data))
  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules(true)}>
          Rules
        </PixelButton>
        <PixelButton size="sm" onClick={() => setConfirm(true)}>
          Confirm a boon
        </PixelButton>
        <PixelButton size="sm" onClick={() => setPicker('full')}>
          Who gets the full heal
        </PixelButton>
        <PixelButton size="sm" onClick={() => setPicker('rocket')}>
          Who goes to Team Rocket
        </PixelButton>
        <PixelButton
          size="sm"
          onClick={() => setTrade({ gave: sample.box[0]!, got: { ...createInstance(64, 25, data, 'r', 0) } })}
        >
          Rocket reveal
        </PixelButton>
        <PixelButton
          size="sm"
          onClick={() =>
            setTrade({ gave: sample.box[1]!, got: { ...createInstance(17, 24, data, 's', 0), shiny: true } })
          }
        >
          Rocket reveal (shiny)
        </PixelButton>
      </div>
      <p className="m-0 text-lg">Three on offer (the heal, a full heal, a Pokébuff):</p>
      <BoonChoiceView
        views={[views[0]!, views[1]!, views[3]!]}
        save={sample.save}
        onPick={() => {}}
        onInfo={() => setRules(true)}
      />
      <p className="m-0 text-lg">The others (an item, a donor, Team Rocket):</p>
      <BoonChoiceView
        views={[views[0]!, views[2]!, views[4]!, views[5]!]}
        save={sample.save}
        onPick={() => {}}
        onInfo={() => setRules(true)}
      />
      <p className="m-0 text-lg">Nothing else could help: the heal alone.</p>
      <BoonChoiceView
        views={[views[0]!]}
        save={sample.save}
        onPick={() => {}}
        onInfo={() => setRules(true)}
      />
      <WipeCenterNote />
      <span className="flex items-center gap-2 text-lg">
        <BuffTag inst={sample.buffed} /> a Pokébuff on a card
      </span>
      <CenterRulesModal open={rules} onClose={() => setRules(false)} />
      <CenterBoonConfirm
        view={confirm ? views[3]! : null}
        onBack={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
      />
      <BoonTargetPicker
        view={picker ? views[picker === 'full' ? 1 : 5]! : null}
        targets={picker === 'full' ? fullTargets : sample.box.slice(0, 3)}
        onBack={() => setPicker(null)}
        onPick={() => setPicker(null)}
      />
      <RocketReveal trade={trade} onClose={() => setTrade(null)} />
    </div>
  )
}
