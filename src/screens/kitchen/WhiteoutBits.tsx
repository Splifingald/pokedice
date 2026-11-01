// Kitchen sink: Crown Shrine's whiteout (docs/61 §4.3, docs/15 §47) in every state — the shrine on the pixel engine
// (moving and still), the gauge of waves (fresh, mid-wave, every wave cleared, the boss next), the blizzard's chip and
// its snow over a fight's stage, the way in (the intro full screen, held at its end with "Tap to continue ▼", then its
// pop-up over that end; the pop-up at once, back from TEAM; the pop-up on its own), the rules pop-up (INFO), the bonfire
// (catching, warmed already, the last one, one Pokémon, six), the wave's result card, the shut bag's line, the Home
// bar's Areas button locked with its reason, and the end. Abomasnow's entrance is on /kitchen-sink/fx and in the
// admin's Legend intros.
import { useMemo, useState } from 'react'
import { createInstance, DEFAULT_WHITEOUT, makeBattler } from '@/engine'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { InfoButton } from '@/components/RulesModal'
import { BagButton } from '../battle/BattlePanel'
import {
  BlizzardChip,
  BonfireView,
  ShrineScene,
  SnowOverStage,
  WhiteoutEntry,
  WhiteoutEntryDialog,
  WhiteoutGauge,
  WhiteoutRulesModal,
  WhiteoutVictoryView,
} from '@/components/Whiteout'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { pushToast, useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import type { Fx } from '../battle/useBattleAnimator'

export function WhiteoutBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const mode = DEFAULT_WHITEOUT
  const sizes = mode.waves.map((w) => w.length)
  const [open, setOpen] = useState<null | 'intro' | 'held' | 'entry' | 'info' | 'won'>(null)
  const [camp, setCamp] = useState(0)
  // A wave's fight in the blizzard: Ampharos against Glalie, snow driving over the stage.
  const fight = useMemo(
    () => ({
      own: makeBattler({ uid: 'k-wo-own', dex: 181, level: 50, hp: 160 }, data),
      foe: { ...makeBattler({ uid: 'k-wo-foe', dex: 362, level: 47, hp: 160 }, data), mega: false },
    }),
    [data],
  )
  const fx: Fx = {
    cursor: 0,
    message: '',
    hp: {},
    activeUid: fight.own.uid,
    foeUid: fight.foe.uid,
    fainted: {},
    dex: {},
    wornOut: {},
    tray: null,
    pop: null,
    banner: null,
    shake: null,
    flash: null,
    status: null,
    fly: null,
    scene: null,
    chip: null,
    cry: null,
  }
  // A team as a bonfire finds it: hurt, one K.O.; it fills by 40 % (not the K.O. one) once the fire has caught.
  const base = useMemo(
    () =>
      [181, 508, 733].map((dex, i) => ({
        ...createInstance(dex, 50, data, `sink-wo-${i}`, 0),
        currentHp: [40, 0, 90][i]!,
      })),
    [data],
  )
  const [warm, setWarm] = useState(false)
  const team = warm
    ? base.map((p) => ({ ...p, currentHp: p.currentHp > 0 ? Math.min(150, p.currentHp + 60) : 0 }))
    : base
  const six = [181, 508, 733, 460, 362, 614].map((dex, i) => ({ uid: `six-${i}`, dex, shiny: i === 3 }))
  const close = () => setOpen(null)
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap gap-2 [&>*]:max-w-full [&>*]:whitespace-normal">
        <PixelButton size="sm" onClick={() => setOpen('intro')}>
          The intro (the blizzard rolls in, eyes in the crown tree, tap to continue, then its pop-up)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('held')}>
          The pop-up over the intro&apos;s end (back from TEAM)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('entry')}>
          Its pop-up on its own (TEAM / NOT NOW / BRAVE THE BLIZZARD)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('info')}>
          Rules pop-up (INFO)
        </PixelButton>
        <PixelButton
          size="sm"
          onClick={() => {
            setWarm(false)
            setCamp((n) => n + 1)
          }}
        >
          Light the bonfire again
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('won')}>
          The end (the blizzard lifts, sunlight on the shrine, BACK TO THE WORLD)
        </PixelButton>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative h-[150px] overflow-hidden">
          <ShrineScene />
        </div>
        <div className="relative h-[150px] overflow-hidden">
          <ShrineScene still />
        </div>
      </div>
      {/* The gauge: fresh; the second wave under way (one of three beaten); every wave behind, at the last bonfire;
          the boss next. */}
      <div className="grid max-w-xl gap-2">
        <WhiteoutGauge sizes={sizes} wave={0} foe={0} />
        <WhiteoutGauge sizes={sizes} wave={1} foe={1} />
        <WhiteoutGauge sizes={sizes} wave={3} foe={0} />
        <WhiteoutGauge sizes={sizes} wave={3} foe={0} boss />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BlizzardChip />
        <BagButton
          disabled={false}
          title={t('ui.whiteout.noBag')}
          onClick={() => pushToast(t('ui.whiteout.noBag'), 'info')}
        />
        <span className="font-pixel-sm text-[16px] text-muted">{t('ui.whiteout.noBag')}</span>
      </div>
      {/* A wave's fight: the snow over the stage, the chip by the strip. */}
      <div className="max-w-xl">
        <BattleStage
          own={fight.own}
          foe={fight.foe}
          fx={fx}
          ownShown
          foeShown
          trainer={null}
          overlay={null}
          onContact={() => {}}
          onSceneDone={() => {}}
          tapLabel={(b) => b.name}
          label="A wave of the whiteout: Glalie in the blizzard"
        >
          <SnowOverStage className="z-[5]" />
          <span className="absolute right-1 top-1 z-20 leading-[0]">
            <BlizzardChip />
          </span>
        </BattleStage>
      </div>
      {/* The wave's result card, as VictoryView shows it. */}
      <div className="grid max-w-xl gap-2">
        <div className="light-scope flex items-center justify-center gap-2 bg-[#16264a] p-2 text-center text-[#eef6ff] shadow-[inset_0_3px_0_#e6f1fa,0_0_0_2px_#060b18]">
          <PixelIcon name="burn" size={22} />
          <span className="text-xl leading-tight">{t('ui.whiteout.waveWon', { n: 1, total: 3 })}</span>
        </div>
        <p className="copy m-0 text-lg">{t('ui.whiteout.wipeBody', { n: 2 })}</p>
      </div>
      {/* Home's Areas button while the whiteout holds the player: locked, its reason next to it. */}
      <div className="grid max-w-xl grid-cols-[76px_minmax(0,1fr)] items-start gap-2.5">
        <button
          type="button"
          aria-disabled
          aria-label={t('ui.whiteout.areasLocked')}
          className="pixel-btn hatched relative flex min-h-[72px] flex-col items-center justify-center gap-0.5 px-0.5"
        >
          <PixelIcon name="lock" size={24} />
          <span className="font-pixel-sm text-[16px] uppercase leading-none tracking-[0.04em]">
            {t('ui.home.areas')}
          </span>
        </button>
        <p className="m-0 flex items-start gap-2 bg-well p-2 font-pixel-sm text-[16px] leading-tight text-muted shadow-ring-line">
          <PixelIcon name="lock" size={16} className="mt-px shrink-0" />
          <span>{t('ui.whiteout.locked', { area: 'Crown Shrine' })}</span>
        </p>
      </div>
      {/* The bonfire, catching (its heal lands on the cards under it). */}
      <div className="max-w-xl">
        <BonfireView
          key={camp}
          team={team.map((p) => ({ uid: p.id, dex: p.dex }))}
          wave={1}
          waves={3}
          last={false}
          percent={mode.bonfirePercent}
          onWarm={() => setWarm(true)}
          onTeam={() => {}}
          onMoveOn={() => {
            setWarm(false)
            setCamp((n) => n + 1)
          }}
        >
          <ol className="m-0 grid list-none gap-2 p-0">
            {team.map((p) => (
              <li key={p.id}>
                <MonCard inst={p} />
              </li>
            ))}
          </ol>
        </BonfireView>
      </div>
      {/* Warmed already (back from the Team screen): the fire burning, MOVE ON ready; the last one, Abomasnow next. */}
      <div className="max-w-xl">
        <BonfireView
          team={six}
          wave={3}
          waves={3}
          last
          percent={mode.bonfirePercent}
          warmed
          onWarm={() => {}}
          onTeam={() => {}}
          onMoveOn={() => {}}
        />
      </div>
      {/* One Pokémon alone by the fire. */}
      <div className="max-w-xl">
        <BonfireView
          team={[{ uid: 'one', dex: 508 }]}
          wave={2}
          waves={3}
          last={false}
          percent={mode.bonfirePercent}
          warmed
          onWarm={() => {}}
          onMoveOn={() => {}}
        />
      </div>
      <div className="max-w-xs">
        <InfoButton name={t('ui.whiteout.title')} onClick={() => setOpen('info')} />
      </div>
      {(open === 'intro' || open === 'held') && (
        <WhiteoutEntry
          mode={mode}
          data={data}
          picture={artUrl('a855')}
          popup={open === 'held'}
          onBegin={close}
          onNotNow={close}
          onTeam={close}
        />
      )}
      <WhiteoutEntryDialog
        open={open === 'entry'}
        mode={mode}
        data={data}
        onBegin={close}
        onNotNow={close}
        onTeam={close}
      />
      <WhiteoutRulesModal open={open === 'info'} onClose={close} mode={mode} data={data} />
      {open === 'won' && (
        <WhiteoutVictoryView
          name={data.species[460]?.name ?? 'Abomasnow'}
          area="Crown Shrine"
          onDone={close}
        />
      )}
    </div>
  )
}
