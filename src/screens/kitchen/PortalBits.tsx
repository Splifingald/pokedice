// Kitchen sink: Distortion World's portal run (docs/28) in every state — the portal (moving and still), the gauge (fresh,
// under way, won), the breach and its pop-up, the rules pop-up (once and from INFO), a distortion's boons (all five
// kinds; fewer when fewer can help), the run's bonuses (none, some), a distorted sprite at each motion level, the
// screen's distortion, and the victory.
import { useMemo, useState } from 'react'
import { createInstance, DEFAULT_PORTAL_RUN, type DistortionOffer } from '@/engine'
import {
  describeOffer,
  DistortionChoiceView,
  DistortionFx,
  DistortionGauge,
  PortalArt,
  PortalBreach,
  PortalEntryDialog,
  PortalFilters,
  PortalRulesModal,
  PortalVictoryView,
  RunBonuses,
} from '@/components/Portal'
import { InfoButton } from '@/components/RulesModal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

export function PortalBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const mode = DEFAULT_PORTAL_RUN
  const [open, setOpen] = useState<null | 'breach' | 'entry' | 'rules' | 'info' | 'won' | 'fx'>(null)
  const team = useMemo(
    () =>
      [94, 477, 609].map((dex, i) => ({
        ...createInstance(dex, 68, data, `sink-portal-${i}`, 0),
        currentHp: i === 1 ? 0 : 40,
      })),
    [data],
  )
  const all: DistortionOffer[] = [
    { kind: 'heal', percent: 30 },
    { kind: 'revive', uid: team[1]!.id },
    { kind: 'boost', type: 'ghost', amount: 10 },
    { kind: 'die', uid: team[0]!.id, type: 'poison' },
    { kind: 'item' },
  ]
  const views = all.map((o) => describeOffer(o, mode, data, team, () => 5, t))
  const close = () => setOpen(null)
  return (
    <div className="grid w-full gap-3">
      <PortalFilters />
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('breach')}>
          The breach
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('entry')}>
          Its pop-up (NOT NOW / READY!)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('rules')}>
          Rules pop-up (once)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('won')}>
          The victory
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen(open === 'fx' ? null : 'fx')}>
          Screen distortion {open === 'fx' ? 'off' : 'on'}
        </PixelButton>
      </div>
      <div className="flex flex-wrap items-end gap-4 bg-[#12051f] p-3">
        <PortalArt size={160} />
        <PortalArt size={96} still />
        <span className="portal-shader inline-block">
          <SpriteImg dex={94} size={96} />
        </span>
        <span className="portal-shader-short inline-block">
          <SpriteImg dex={609} size={96} />
        </span>
        <span className="portal-shader-still inline-block">
          <SpriteImg dex={477} size={96} />
        </span>
      </div>
      <div className="grid max-w-xl gap-2">
        <DistortionGauge closed={0} total={10} />
        <DistortionGauge closed={6} total={10} />
        <DistortionGauge closed={10} total={10} />
      </div>
      <DistortionChoiceView views={views.slice(0, 3)} index={4} total={10} onPick={() => {}} />
      <DistortionChoiceView views={views.slice(2)} index={9} total={10} onPick={() => {}} />
      <DistortionChoiceView views={views.slice(4)} index={2} total={10} onPick={() => {}} />
      <div className="grid max-w-xl gap-2">
        <RunBonuses boosts={{}} dice={[]} />
        <RunBonuses
          boosts={{ ghost: 20, fire: 10 }}
          dice={[
            { name: 'Gengar', dex: 94, types: ['poison', 'ghost'] },
            { name: 'Chandelure', dex: 609, types: ['fire'] },
          ]}
        />
      </div>
      <div className="max-w-xs">
        <InfoButton name={t('ui.portal.title')} onClick={() => setOpen('info')} />
      </div>
      {open === 'breach' && <PortalBreach onDone={close} />}
      <PortalEntryDialog open={open === 'entry'} mode={mode} data={data} onReady={close} onNotNow={close} />
      <PortalRulesModal open={open === 'rules'} onClose={close} onGo={close} mode={mode} data={data} />
      <PortalRulesModal open={open === 'info'} onClose={close} mode={mode} data={data} />
      {open === 'won' && <PortalVictoryView name={data.species[487]?.name ?? 'Giratina'} onDone={close} />}
      {open === 'fx' && <DistortionFx />}
    </div>
  )
}
