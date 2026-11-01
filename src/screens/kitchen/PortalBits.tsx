// Kitchen sink: Distortion World's portal run (docs/28) in every state — the portal and the Distortion World on the
// pixel engine (moving and still), the gauge (fresh, under way, won), the breach held at its end and its pop-up over
// it, the pop-up on its own, the rules pop-up (once and from INFO), a distortion's boons (all five kinds; fewer when
// fewer can help), their icons (an extra die, a rare item turning through its items, still), a boon's confirm pop-up,
// the team's changes at the way in, a portal closing, the run's bonuses (none, some), a distorted sprite at each motion
// level, the UI's glitch on a few pieces, the screen's distortion, and the victory. Every scene is also on
// /kitchen-sink/fx, frame by frame. With `skin="plates"`, the same states dressed as the Hall of Origin's Stairway of
// Plates (docs/61 §4.5): the stairway and its altars, a landing's gauge, the way in, an altar's blessings (a Plate
// among them), an altar lit, the wild Pokémon in light, the screen's gleam, and shiny Arceus coming down.
import { useMemo, useRef, useState } from 'react'
import {
  createInstance,
  DEFAULT_PORTAL_RUN,
  PLATE_BARS,
  type DistortionOffer,
  type PortalSkin,
} from '@/engine'
import {
  BoonConfirm,
  describeOffer,
  DistortionChoiceView,
  DistortionFx,
  DistortionGauge,
  ExtraDie,
  GlitchSprite,
  ItemCycle,
  PortalArt,
  PortalEntry,
  PortalCloseFx,
  PortalEntryDialog,
  PortalFilters,
  PortalRulesModal,
  PortalScene,
  PortalVictoryView,
  playPortalClose,
  RunBonuses,
  useUiGlitch,
} from '@/components/Portal'
import { InfoButton } from '@/components/RulesModal'
import { PortalSkinProvider, PRIZE, skinKey } from '@/components/portalSkin'
import { PixelButton } from '@/components/PixelButton'
import { TeamSwapActions } from '@/components/TeamSwapActions'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

/** The Hall of Origin's run (scripts/content-snowglobe-valley.ts's numbers): Distortion World's, in light. */
const PLATES_RUN = {
  ...DEFAULT_PORTAL_RUN,
  skin: 'plates' as const,
  raid: { level: 90, upgradeLevel: 10, bars: 4, teamCap: 90, barTypes: [...PLATE_BARS] },
}

export function PortalBits({ skin = 'distortion' }: { skin?: PortalSkin }) {
  return (
    <PortalSkinProvider value={skin}>
      <Bits skin={skin} />
    </PortalSkinProvider>
  )
}

function Bits({ skin }: { skin: PortalSkin }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const plates = skin === 'plates'
  const mode = plates ? PLATES_RUN : DEFAULT_PORTAL_RUN
  const prize = PRIZE[skin]
  const [open, setOpen] = useState<
    null | 'breach' | 'held' | 'entry' | 'rules' | 'info' | 'won' | 'fx' | 'confirm'
  >(null)
  const [glitch, setGlitch] = useState(false)
  const demo = useRef<HTMLDivElement>(null)
  // The UI's glitch, often, on the demo's pieces only.
  useUiGlitch({ enabled: glitch, root: demo, selector: '[data-glitch]', every: [0.8, 1.6] })
  const team = useMemo(
    () =>
      (plates ? [143, 461, 998] : [94, 477, 609]).map((dex, i) => ({
        ...createInstance(dex, 68, data, `sink-portal-${skin}-${i}`, 0),
        currentHp: i === 1 ? 0 : 40,
      })),
    [data, plates, skin],
  )
  const all: DistortionOffer[] = [
    { kind: 'heal', percent: 30 },
    { kind: 'revive', uid: team[1]!.id },
    // The Stairway of Plates names it after a Plate: the Flame Plate, Fire +10.
    { kind: 'boost', type: plates ? 'fire' : 'ghost', amount: 10 },
    { kind: 'die', uid: team[0]!.id, type: plates ? 'normal' : 'poison' },
    { kind: 'item' },
  ]
  const views = all.map((o) => describeOffer(o, mode, data, team, () => 5, t, skin))
  const rare = mode.item.items.flatMap((i) => (data.items[i.key] ? [data.items[i.key]!] : []))
  const save = useGame((s) => s.save)
  const lead = save?.box.find((p) => p.id === save.team[0])
  const boxed = save?.box.find((p) => !save.team.includes(p.id))
  const close = () => setOpen(null)
  return (
    <div className="grid w-full gap-3">
      <PortalFilters />
      <PortalCloseFx />
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen('breach')}>
          The breach (tap to continue, then its pop-up over its end)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('held')}>
          The pop-up over the breach&apos;s end (back from TEAM)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('entry')}>
          Its pop-up on its own (TEAM / NOT NOW / READY!)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('rules')}>
          Rules pop-up (once)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('confirm')}>
          A boon&apos;s confirm pop-up (BACK / CONFIRM)
        </PixelButton>
        <PixelButton size="sm" onClick={() => playPortalClose(plates ? 'fire' : null)}>
          A portal closing
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('won')}>
          The victory (HEAL &amp; START RAID over a green BACK TO THE WORLD)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen(open === 'fx' ? null : 'fx')}>
          Screen distortion {open === 'fx' ? 'off' : 'on'}
        </PixelButton>
        <PixelButton size="sm" onClick={() => setGlitch((g) => !g)}>
          UI glitch demo {glitch ? 'off' : 'on'}
        </PixelButton>
      </div>
      <div
        className={
          plates
            ? 'flex flex-wrap items-end gap-4 bg-[#fff6dc] p-3'
            : 'flex flex-wrap items-end gap-4 bg-[#07020d] p-3'
        }
      >
        <PortalArt size={160} />
        <PortalArt size={96} still />
      </div>
      {/* A wild Pokémon's distortion at each motion level: full, short, off (still), as on the preview's card. */}
      <div className="flex flex-wrap items-end gap-4">
        <GlitchSprite dex={team[0]!.dex} size={144} level="full" className="bg-paper shadow-ring" />
        <GlitchSprite dex={team[2]!.dex} size={144} level="short" className="bg-paper shadow-ring" />
        <GlitchSprite dex={team[1]!.dex} size={144} level="off" className="bg-paper shadow-ring" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative h-[150px] overflow-hidden">
          <PortalScene />
        </div>
        <div className="relative h-[150px] overflow-hidden">
          <PortalScene still />
        </div>
      </div>
      <div ref={demo} className="grid max-w-xl gap-2">
        <div data-glitch>
          <DistortionGauge closed={0} total={10} />
        </div>
        <div data-glitch>
          <DistortionGauge closed={6} total={10} />
        </div>
        <div data-glitch>
          <DistortionGauge closed={10} total={10} />
        </div>
        <div className="flex gap-2">
          <PixelButton data-glitch size="sm">
            Fight
          </PixelButton>
          <PixelButton data-glitch size="sm" variant="primary">
            Continue
          </PixelButton>
        </div>
      </div>
      {/* The boons' own icons: an extra die (its type's die with a "+"), a rare item turning through its items
          every 2 s with a pop (and held on the first, as with motion off). */}
      <div className="flex flex-wrap items-center gap-4">
        <ExtraDie type="poison" />
        <ExtraDie type="ground" size={44} />
        <ItemCycle items={rare} />
        <ItemCycle items={rare} size={44} />
        <ItemCycle items={rare} still />
      </div>
      <DistortionChoiceView views={views.slice(0, 3)} index={4} total={10} onPick={() => playPortalClose()} />
      <DistortionChoiceView views={views.slice(2)} index={9} total={10} onPick={() => playPortalClose()} />
      <DistortionChoiceView views={views.slice(4)} index={2} total={10} onPick={() => playPortalClose()} />
      <div className="grid max-w-xl gap-2">
        <RunBonuses boosts={{}} dice={[]} />
        <RunBonuses
          boosts={plates ? { fire: 20, ice: 10 } : { ghost: 20, fire: 10 }}
          dice={
            plates
              ? [
                  { name: 'Snorlax', dex: 143, types: ['normal', 'normal'] },
                  { name: 'Weavile', dex: 461, types: ['ice'] },
                ]
              : [
                  { name: 'Gengar', dex: 94, types: ['poison', 'ghost'] },
                  { name: 'Chandelure', dex: 609, types: ['fire'] },
                ]
          }
        />
      </div>
      <div className="max-w-xs">
        <InfoButton name={t(skinKey(skin, 'ui.portal.title'))} onClick={() => setOpen('info')} />
      </div>
      {/* The team's changes at the way in (and at a Center), for the save's lead and one from its Box: here, outside
          both, the buttons show but change nothing (teamSwapsOpen). */}
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        {[lead, boxed].map(
          (inst) =>
            inst && (
              <div key={inst.id} className="pixel-panel p-3">
                <TeamSwapActions inst={inst} onDone={() => {}} />
              </div>
            ),
        )}
      </div>
      {(open === 'breach' || open === 'held') && (
        <PortalEntry
          mode={mode}
          data={data}
          picture={artUrl(plates ? 'a130' : 'a123')}
          popup={open === 'held'}
          onReady={close}
          onNotNow={close}
          onTeam={close}
        />
      )}
      <PortalEntryDialog
        open={open === 'entry'}
        mode={mode}
        data={data}
        onReady={close}
        onNotNow={close}
        onTeam={close}
      />
      <BoonConfirm
        view={open === 'confirm' ? views[3]! : null}
        onBack={close}
        onConfirm={() => {
          close()
          playPortalClose()
        }}
      />
      <PortalRulesModal open={open === 'rules'} onClose={close} onGo={close} mode={mode} data={data} />
      <PortalRulesModal open={open === 'info'} onClose={close} mode={mode} data={data} />
      {open === 'won' && (
        <PortalVictoryView
          name={data.species[prize]?.name ?? ''}
          dex={prize}
          portals={mode.portals}
          level={mode.raid.level}
          onDone={close}
          onRaid={close}
        />
      )}
      {open === 'fx' && <DistortionFx />}
    </div>
  )
}
