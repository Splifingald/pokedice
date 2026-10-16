// Kitchen sink: Darkrai's nightmare (docs/30) in every state — the moon on the pixel engine (moving and still), the
// gauge of rounds (fresh, under way, won), the way in, the intro (playing, held at its end with "Tap to continue ▼",
// its rules over it), the rules pop-up (once and from INFO), Darkrai's strike after a round (playing, landed), the
// round's result cards (a round, the last, a gift), the Home bar's Areas button locked with its reason, the screen's
// vignette, the shadow passing over a few pieces, and the waking. Every scene is also on /kitchen-sink/fx.
import { useMemo, useRef, useState } from 'react'
import { createInstance, DEFAULT_NIGHTMARE } from '@/engine'
import {
  MoonScene,
  NightmareFx,
  NightmareGauge,
  NightmareIntro,
  NightmareRulesModal,
  NightmareStrikeView,
  NightmareVictoryView,
  NightmareWayInView,
} from '@/components/Nightmare'
import { useUiGlitch } from '@/components/PortalFx'
import { InfoButton } from '@/components/RulesModal'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

export function NightmareBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const mode = DEFAULT_NIGHTMARE
  const [open, setOpen] = useState<null | 'intro' | 'introRules' | 'rules' | 'info' | 'won' | 'fx'>(null)
  const [strike, setStrike] = useState(0)
  const [shadow, setShadow] = useState(false)
  const demo = useRef<HTMLDivElement>(null)
  // The shadow passing over the page, often, on the demo's pieces only.
  useUiGlitch({
    enabled: shadow,
    root: demo,
    selector: '[data-glitch]',
    every: [0.8, 1.6],
    dur: 500,
    classes: { full: 'ui-shadow', short: 'ui-shadow-short' },
  })
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
          The intro (Darkrai across the moon, tap to continue)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('introRules')}>
          The rules over the intro&apos;s end (the first time)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('rules')}>
          Rules pop-up
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
        <PixelButton size="sm" onClick={() => setOpen(open === 'fx' ? null : 'fx')}>
          Screen vignette {open === 'fx' ? 'off' : 'on'}
        </PixelButton>
        <PixelButton size="sm" onClick={() => setShadow((g) => !g)}>
          Shadow-over-the-page demo {shadow ? 'off' : 'on'}
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
      <div ref={demo} className="grid max-w-xl gap-2">
        <div data-glitch>
          <NightmareGauge round={0} total={7} />
        </div>
        <div data-glitch>
          <NightmareGauge round={3} total={7} />
        </div>
        <div data-glitch>
          <NightmareGauge round={7} total={7} />
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
      <div className="grid gap-3 lg:grid-cols-2">
        <NightmareWayInView
          mode={mode}
          data={data}
          onBegin={() => setOpen('intro')}
          onNotNow={() => {}}
          onTeam={() => {}}
        />
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
      {(open === 'intro' || open === 'introRules') && (
        <NightmareIntro
          picture={artUrl('a127')}
          under={open === 'introRules'}
          onContinue={() => setOpen('introRules')}
        />
      )}
      <NightmareRulesModal
        open={open === 'introRules' || open === 'rules'}
        onClose={close}
        mode={mode}
        data={data}
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
      {open === 'fx' && <NightmareFx />}
    </div>
  )
}
