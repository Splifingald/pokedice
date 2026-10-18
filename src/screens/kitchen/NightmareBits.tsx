// Kitchen sink: Darkrai's nightmare (docs/30) in every state — the moon on the pixel engine (moving and still), the
// gauge of rounds (fresh, under way, won), the way in (the intro full screen, held at its end with "Tap to continue ▼",
// then its pop-up over that end; the pop-up at once, back from TEAM; the pop-up on its own), the rules pop-up (INFO),
// a haunted foe (its preview at each motion level, and on the battle stage), Darkrai's strike after a round (playing,
// landed), the round's result cards (a round, the last, a gift), the Home bar's Areas button locked with its reason,
// and the waking. Every scene is also on /kitchen-sink/fx; the raid's vignette is with the raid's pieces.
import { useMemo, useState } from 'react'
import { createInstance, DEFAULT_NIGHTMARE, makeBattler } from '@/engine'
import {
  HauntSprite,
  MoonScene,
  NightmareEntry,
  NightmareEntryDialog,
  NightmareGauge,
  NightmareRulesModal,
  NightmareStrikeView,
  NightmareVictoryView,
} from '@/components/Nightmare'
import { InfoButton } from '@/components/RulesModal'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import type { Fx } from '../battle/useBattleAnimator'

export function NightmareBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const mode = DEFAULT_NIGHTMARE
  const [open, setOpen] = useState<null | 'intro' | 'held' | 'entry' | 'info' | 'won'>(null)
  const [strike, setStrike] = useState(0)
  // A round's fight: the foe haunted on the night's stage.
  const fight = useMemo(
    () => ({
      own: makeBattler({ uid: 'k-nm-own', dex: 448, level: 50, hp: 160 }, data),
      foe: { ...makeBattler({ uid: 'k-nm-foe', dex: 197, level: 50, hp: 160 }, data), mega: false },
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
  // A team as the strike finds it; its HP drops once the beams land (here, a second strike resets it).
  const base = useMemo(
    () =>
      [94, 448, 609].map((dex, i) => ({
        ...createInstance(dex, 64, data, `sink-nm-${i}`, 0),
        currentHp: 120 - i * 50,
      })),
    [data],
  )
  const [hit, setHit] = useState(false)
  const team = hit
    ? base.map((p) => ({ ...p, currentHp: Math.max(p.currentHp > 0 ? 1 : 0, p.currentHp - 20) }))
    : base
  const revive = data.items.revive
  const close = () => setOpen(null)
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap gap-2 [&>*]:max-w-full [&>*]:whitespace-normal">
        <PixelButton size="sm" onClick={() => setOpen('intro')}>
          The intro (Darkrai across the moon, tap to continue, then its pop-up over its end)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('held')}>
          The pop-up over the intro&apos;s end (back from TEAM)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('entry')}>
          Its pop-up on its own (TEAM / NOT NOW / BEGIN THE NIGHTMARE)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('info')}>
          Rules pop-up (INFO)
        </PixelButton>
        <PixelButton
          size="sm"
          onClick={() => {
            setHit(false)
            setStrike((n) => n + 1)
          }}
        >
          Darkrai&apos;s strike again
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('won')}>
          The waking (HEAL &amp; START RAID over a green BACK TO THE WORLD)
        </PixelButton>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative h-[150px] overflow-hidden">
          <MoonScene />
        </div>
        <div className="relative h-[150px] overflow-hidden">
          <MoonScene still />
        </div>
      </div>
      <div className="grid max-w-xl gap-2">
        <NightmareGauge round={0} total={7} />
        <NightmareGauge round={3} total={7} />
        <NightmareGauge round={7} total={7} />
      </div>
      {/* A haunted foe: the round's preview at each motion level (full, short, off), then on the night's stage. */}
      <div className="flex flex-wrap items-end gap-3">
        {(['full', 'short', 'off'] as const).map((level) => (
          <figure key={level} className="m-0 grid justify-items-center gap-1">
            <div className="light-scope bg-[#080b1f] shadow-[inset_0_0_0_3px_#5a3aa8]">
              <HauntSprite dex={197} size={104} level={level} />
            </div>
            <figcaption className="font-pixel-sm text-[15px] text-muted">{level}</figcaption>
          </figure>
        ))}
      </div>
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
          label="A round of the nightmare: Umbreon haunted"
          world="nightmare"
          haunted
        />
      </div>
      {/* The round's result cards, as VictoryView shows them. */}
      <div className="grid max-w-xl gap-2">
        <div className="light-scope flex items-center justify-center gap-2 bg-[#080b1f] p-2 text-center text-[#eef0ff] shadow-[inset_0_3px_0_#f3efd6,0_0_0_2px_#24304f]">
          <PixelIcon name="moon" size={22} />
          <span className="text-xl leading-tight">{t('ui.nightmare.roundWon', { n: 3, total: 7 })}</span>
        </div>
        <div className="light-scope flex items-center justify-center gap-2 bg-[#080b1f] p-2 text-center text-[#eef0ff] shadow-[inset_0_3px_0_#f3efd6,0_0_0_2px_#24304f]">
          <PixelIcon name="moon" size={22} />
          <span className="text-xl leading-tight">{t('ui.nightmare.lastRoundWon')}</span>
        </div>
        <div className="flex items-center justify-center gap-2 bg-gold-pale p-2 text-center shadow-ring">
          {revive && <ItemSprite item={revive} size={32} />}
          <span className="text-xl leading-tight">
            {t('ui.nightmare.gotGift', { item: revive?.name ?? 'Revive' })}
          </span>
        </div>
      </div>
      {/* Home's Areas button while the nightmare holds the player: locked, its reason next to it. */}
      <div className="grid max-w-xl grid-cols-[76px_minmax(0,1fr)] items-start gap-2.5">
        <button
          type="button"
          aria-disabled
          aria-label={t('ui.nightmare.areasLocked')}
          className="pixel-btn hatched relative flex min-h-[72px] flex-col items-center justify-center gap-0.5 px-0.5"
        >
          <PixelIcon name="lock" size={24} />
          <span className="font-pixel-sm text-[15px] uppercase leading-none tracking-[0.04em]">
            {t('ui.home.areas')}
          </span>
        </button>
        <p className="m-0 flex items-start gap-2 bg-well p-2 font-pixel-sm text-[15px] leading-tight text-muted shadow-ring-line">
          <PixelIcon name="lock" size={16} className="mt-px shrink-0" />
          <span>{t('ui.nightmare.locked', { area: 'Newmoon Island' })}</span>
        </p>
      </div>
      <div className="max-w-xl">
        <NightmareStrikeView
          key={strike}
          team={team.map((p) => ({ uid: p.id, dex: p.dex }))}
          round={3}
          total={7}
          percent={mode.strikePercent}
          onStrike={() => setHit(true)}
          onContinue={() => {
            setHit(false)
            setStrike((n) => n + 1)
          }}
        >
          <ol className="m-0 grid list-none gap-2 p-0">
            {team.map((p) => (
              <li key={p.id}>
                <MonCard inst={p} />
              </li>
            ))}
          </ol>
        </NightmareStrikeView>
      </div>
      {/* Landed already (back from Home): the scene's end, the HP taken, CONTINUE ready. */}
      <div className="max-w-xl">
        <NightmareStrikeView
          team={base.map((p) => ({ uid: p.id, dex: p.dex }))}
          round={6}
          total={7}
          percent={mode.strikePercent}
          hit
          onStrike={() => {}}
          onContinue={() => {}}
        />
      </div>
      <div className="max-w-xs">
        <InfoButton name={t('ui.nightmare.title')} onClick={() => setOpen('info')} />
      </div>
      {(open === 'intro' || open === 'held') && (
        <NightmareEntry
          mode={mode}
          data={data}
          picture={artUrl('a127')}
          popup={open === 'held'}
          onBegin={close}
          onNotNow={close}
          onTeam={close}
        />
      )}
      <NightmareEntryDialog
        open={open === 'entry'}
        mode={mode}
        data={data}
        onBegin={close}
        onNotNow={close}
        onTeam={close}
      />
      <NightmareRulesModal open={open === 'info'} onClose={close} mode={mode} data={data} />
      {open === 'won' && (
        <NightmareVictoryView
          name={data.species[491]?.name ?? 'Darkrai'}
          level={mode.raid.level}
          onDone={close}
          onRaid={close}
        />
      )}
    </div>
  )
}
