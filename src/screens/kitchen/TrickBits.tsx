// Kitchen sink (dev only): Trick or Treat (docs/28) — the gauge of each tier at every stage, the Treat and the Trick
// Ball, the rarity chips, the stage in each of its looks, the preview card, the results and the rules (unlock and INFO).
import { useState } from 'react'
import { DEFAULT_CONFIG, TRICK_TIERS, trickBand } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import {
  TierChip,
  TrickCard,
  TrickGauge,
  TrickResult,
  TrickRulesModal,
  TrickSprite,
  TrickStage,
  restLook,
  type TrickLook,
} from '@/components/TrickOrTreat'
import { useGame } from '@/store/game'

const CFG = DEFAULT_CONFIG.trickOrTreat

const LOOKS: [string, TrickLook][] = [
  ['Floating (idle)', restLook(0)],
  ['A Treat in the air', { ...restLook(20), treat: 1 }],
  ['Munching', { ...restLook(35), ghost: 'munch' }],
  ['The ball in the air', { ...restLook(45), ball: { at: 'fly', wobble: 0, key: 1 } }],
  ['Drawn into the ball', { ...restLook(45), ghost: 'absorb', ball: { at: 'ground', wobble: 0, key: 1 } }],
  ['A wobble', { ...restLook(45), ghost: 'hidden', ball: { at: 'ground', wobble: 2, key: 1 } }],
  ['Broke free', { ...restLook(80), ghost: 'out' }],
  ['Caught (stars)', restLook(45, 'caught')],
  ['Fled', restLook(100, 'fled')],
]

export function TrickBits() {
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const [replay, setReplay] = useState(0)
  const areaId = useGame(
    (s) => s.data.areas.find((a) => a.name === 'Pokémon Tower')?.id ?? s.data.areas[0]?.id ?? null,
  )
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <TrickSprite kind="treat" size={30} />
        <TrickSprite kind="ball" size={30} />
        <TrickSprite kind="treat" size={60} />
        <TrickSprite kind="ball" size={60} />
        {TRICK_TIERS.map((t) => (
          <TierChip key={t} tier={t} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TRICK_TIERS.flatMap((tier) =>
          [0, 45, 78, 100].map((v) => (
            <div key={`${tier}-${v}`} className="flex flex-col gap-1">
              <span className="font-pixel-sm text-[13px] text-muted">
                {tier} · gauge {v}
              </span>
              <TrickGauge band={trickBand(CFG, tier)} value={v} instant />
            </div>
          )),
        )}
      </div>

      <div className="flex items-center gap-2">
        <PixelButton size="sm" onClick={() => setReplay((n) => n + 1)}>
          Replay the stages
        </PixelButton>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" key={replay}>
        {LOOKS.map(([name, look]) => (
          <div key={name} className="flex flex-col gap-1">
            <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
            <TrickStage areaId={areaId} dex={92} look={look} label={name} />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <span className="font-pixel-sm text-[13px] text-muted">
            Shiny, still (reduced motion), no area picture
          </span>
          <TrickStage areaId={null} dex={200} shiny still look={restLook(30)} label="still" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="pixel-panel p-3">
          <TrickCard dex={92} level={6} tier="common" isNew />
        </div>
        <div className="pixel-panel p-3">
          <TrickCard dex={426} level={47} tier="rare" isNew={false} />
        </div>
        <div className="pixel-panel p-3">
          <TrickCard dex={478} level={30} tier="veryRare" isNew shiny />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <TrickResult name="Gastly" dex={92} level={6} end="caught" placed="team" isNew />
        <TrickResult name="Gastly" dex={92} level={6} end="caught" placed="box" />
        <TrickResult
          name="Misdreavus"
          dex={200}
          level={18}
          end="caught"
          placed="replaced"
          replacedLevel={12}
          shiny
        />
        <TrickResult
          name="Shuppet"
          dex={353}
          level={27}
          end="caught"
          placed="merged"
          secrets={['Cemetery']}
        />
        <TrickResult name="Froslass" dex={478} level={30} end="fled" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PixelButton onClick={() => setRules('unlock')}>Rules (first time)</PixelButton>
        <div className="w-64">
          <InfoButton name="Trick or Treat" onClick={() => setRules('info')} />
        </div>
      </div>
      <TrickRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </div>
  )
}
