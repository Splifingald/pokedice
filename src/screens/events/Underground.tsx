// The Underground's page (docs/31; docs/15 §30), reached from Home's live square: the Explorakits and DIG A WALL, the
// pickaxe and its upgrade, the team, the orb bag and selling, the plates, and INFO. The dig itself is full screen
// (UndergroundDig.tsx). Every number is the engine's.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  canSell,
  freeKitRules,
  kitsHeld,
  liveLeft,
  nextPickaxe,
  orbCount,
  orbsValue,
  pickaxeFaces,
  pickaxeMax,
  teamFull,
  ugCfg,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { InfoButton } from '@/components/RulesModal'
import { BackButton } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { OrbBagTable, PickaxeFaces, PlateGrid, UgCave, UgNote, UgRulesModal } from '@/components/Underground'
import { useT } from '@/i18n/react'
import { countdown, money, typeName } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { ugOpenWall, ugUpgrade, useUgTeam, useUnderground } from '@/store/underground'
import { ugSellOrbs, useUgTeamSync } from '@/store/ugTeams'
import { cx } from '@/theme/util'
import { liveTime } from './live'
import { UgTeamPanel } from './UndergroundTeam'

function Section({
  id,
  title,
  hint,
  children,
  warm,
}: {
  id: string
  title: string
  hint?: string
  children: React.ReactNode
  warm?: boolean
}) {
  return (
    <section
      aria-labelledby={id}
      className={cx('pixel-panel flex flex-col gap-2 p-3', warm && 'bg-cream shadow-card-gold')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id={id} className="m-0 text-[24px] font-normal leading-none">
          {title}
        </h2>
        {hint && <span className="font-pixel-sm text-[15px] text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Outside the event: its cave, a line, back Home. */
export function UgClosed() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="relative -mx-3 -mt-4 min-h-[132px] shadow-[0_2px_0_rgb(var(--c-edge))]">
        <UgCave big className="absolute inset-0" />
        <div className="pixel-plate absolute left-2 top-2 z-[1] flex items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
          <BackButton onClick={() => navigate('/home')} />
          <h1 className="m-0 text-[24px] font-normal leading-none">{t('ui.live.underground.name')}</h1>
        </div>
      </div>
      <p className="copy m-0 text-muted" role="status">
        {t('ui.ug.closed')}
      </p>
      <PixelButton variant="primary" onClick={() => navigate('/home')}>
        {t('ui.ug.home')}
      </PixelButton>
    </div>
  )
}

export function UndergroundScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const team = useUgTeam((s) => s.team)
  const { live, now, u } = useUnderground(1000)
  const [info, setInfo] = useState(false)
  // The team and the orbs between teammates, now and every minute while the page is open.
  useUgTeamSync(live?.id ?? null)
  if (now == null || !save) return <p className="copy p-3 text-muted">{t('ui.common.loading')}</p>
  // Not running for this player (or its content still on its way): say so; the page fills in once it runs.
  if (!live || !u) return <UgClosed />

  const cfg = ugCfg(data)
  const free = freeKitRules(cfg)
  const held = kitsHeld(u)
  const left = liveLeft(live, now)
  const next = nextPickaxe(cfg, u.pickaxe)
  const plates = save.plates ?? []
  const orbs = orbCount(u.bag)
  const worth = orbsValue(u.bag, cfg)
  const sellable = canSell(save, data, team)
  const tillFree = u.freeAt != null ? Math.max(0, u.freeAt - now) : null

  const dig = () => {
    if (u.wall) return navigate('/underground/dig')
    if (!ugOpenWall()) {
      pushToast(
        tillFree != null ? t('ui.ug.noKits', { time: countdown(tillFree) }) : t('ui.ug.noKitsBuy'),
        'bad',
      )
      return
    }
    sfx('button')
    navigate('/underground/dig')
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="relative -mx-3 -mt-4 min-h-[132px] shadow-[0_2px_0_rgb(var(--c-edge))]">
        <UgCave big className="absolute inset-0" />
        <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
          <BackButton onClick={() => navigate('/home')} />
          <span className="grid min-w-0 gap-0.5">
            <h1 className="m-0 text-[24px] font-normal leading-none">{t('ui.live.underground.name')}</h1>
            <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">
              {t('ui.live.endsIn', { time: liveTime(left.ms) })}
            </small>
          </span>
        </div>
      </div>

      <Section id="ug-kits" title={t('ui.ug.kits')} hint={t('ui.ug.kitHint')} warm>
        <div className="flex items-center gap-3">
          <PixelIcon name="kit" size={48} />
          <div className="grid min-w-0 flex-1 gap-1">
            <span className="text-[34px] leading-none" data-testid="ug-kits">
              {held} <small className="font-pixel-sm text-[16px] text-muted">{t('ui.ug.kitsWord')}</small>
            </span>
            <span className="font-pixel-sm text-[15px] text-muted">
              {t('ui.ug.kitsSplit', { free: u.freeKits, cap: free.cap, bought: u.boughtKits })}
            </span>
            <span className="font-pixel-sm text-[14px] text-muted">
              {tillFree != null ? t('ui.ug.nextFree', { time: countdown(tillFree) }) : t('ui.ug.freeFull')}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2.5">
          <PixelButton onClick={() => navigate('/shop')}>{t('ui.ug.buyKits')}</PixelButton>
          <PixelButton
            variant="primary"
            size="lg"
            className="sheen"
            onClick={dig}
            aria-disabled={!u.wall && held === 0}
          >
            {u.wall ? t('ui.ug.resume') : t('ui.ug.dig')}
          </PixelButton>
        </div>
      </Section>

      <Section
        id="ug-pick"
        title={t('ui.ug.pickaxe')}
        hint={t('ui.ug.pickaxeLevel', { level: u.pickaxe, max: pickaxeMax(cfg) })}
      >
        <UgNote>{t('ui.ug.dieNow')}</UgNote>
        <PickaxeFaces faces={pickaxeFaces(cfg, u.pickaxe)} />
        {next ? (
          <>
            <UgNote>{t('ui.ug.dieNext', { level: next.level })}</UgNote>
            <div className="flex flex-wrap items-center gap-2">
              <PickaxeFaces faces={next.faces} next={pickaxeFaces(cfg, u.pickaxe)} />
              <PixelButton
                variant={save.gold >= next.price ? 'gold' : 'secondary'}
                size="sm"
                className="ml-auto"
                aria-disabled={save.gold < next.price}
                onClick={() => {
                  if (save.gold < next.price)
                    return pushToast(t('ui.shop.needMore', { price: money(next.price - save.gold) }), 'bad')
                  if (ugUpgrade()) {
                    sfx('levelup')
                    pushToast(t('ui.ug.upgraded', { level: next.level }), 'good')
                  }
                }}
              >
                {save.gold >= next.price
                  ? t('ui.ug.upgrade', { price: money(next.price) })
                  : t('ui.shop.needMore', { price: money(next.price - save.gold) })}
              </PixelButton>
            </div>
          </>
        ) : (
          <UgNote>{t('ui.ug.pickaxeTop')}</UgNote>
        )}
      </Section>

      <UgTeamPanel />

      <Section id="ug-bag" title={t('ui.ug.bag')} hint={t('ui.ug.bagWorth', { price: money(worth) })}>
        <OrbBagTable bag={u.bag} cfg={cfg} />
        <PixelButton
          variant={sellable ? 'success' : 'secondary'}
          aria-disabled={!sellable}
          onClick={async () => {
            if (!orbs) return pushToast(t('ui.ug.sellEmpty'), 'info')
            if (!sellable) return pushToast(t('ui.ug.sellNeedTeam'), 'info')
            if (await ugSellOrbs()) {
              sfx('gold')
              pushToast(t('ui.ug.sold', { price: money(worth) }), 'good')
            } else pushToast(t('ui.ug.sellNeedTeam'), 'bad')
          }}
        >
          {!orbs
            ? t('ui.ug.sellEmpty')
            : sellable
              ? t('ui.ug.sell', { price: money(worth) })
              : t('ui.ug.sellNeedTeam')}
        </PixelButton>
        {cfg.sellNeedsFull && !teamFull(team) && <UgNote>{t('ui.ug.sellWhy')}</UgNote>}
      </Section>

      <Section
        id="ug-plates"
        title={t('ui.ug.plates')}
        hint={t('ui.ug.platesCount', { n: plates.length, total: 17 })}
      >
        <PlateGrid held={plates} />
        <UgNote>
          {plates.length
            ? t('ui.ug.platesSome', { types: plates.map((p) => typeName(p)).join(', ') })
            : t('ui.ug.platesNone')}
        </UgNote>
      </Section>

      <UgNote className="px-1">{t('ui.ug.fossilsNote')}</UgNote>
      <UgNote className="px-1">{t('ui.ug.endNote')}</UgNote>

      <InfoButton name={t('ui.live.underground.name')} onClick={() => setInfo(true)} />
      <UgRulesModal open={info} onClose={() => setInfo(false)} data={data} />
    </div>
  )
}
