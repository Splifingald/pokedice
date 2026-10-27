// The Underground's page (docs/34; docs/15 §32), reached from Home's live square: the Explorakits and DIG A WALL, the
// pickaxe and its upgrade, the team, the orb bag and selling, the plates, and INFO. The dig itself is full screen
// (UndergroundDig.tsx). Every number is the engine's.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  canSell,
  freeKitRules,
  fullPrice,
  kitsHeld,
  liveLeft,
  nextPickaxe,
  orbCount,
  orbsValue,
  pickaxeFaces,
  pickaxeMax,
  sellValue,
  soloShare,
  ugCfg,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { markLivePopupSeen } from '@/store/live'
import { BackButton } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import {
  OrbBagTable,
  PickaxeFaces,
  PlateGrid,
  UgCave,
  UgNote,
  UgRulesModal,
  UgSellModal,
  UgSoloWarning,
  ugRuleRows,
} from '@/components/Underground'
import { useT } from '@/i18n/react'
import { countdown, money, typeName } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { ugOpenWall, ugRulesSeen, ugUpgrade, useUgTeam, useUnderground } from '@/store/underground'
import { ugSellOrbs, useUgTeamSync } from '@/store/ugTeams'
import { cx } from '@/theme/util'
import { liveTime } from './live'
import { UgTeamPanel } from './UndergroundTeam'
import { StagePanel } from './layout'

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
        {hint && <span className="font-pixel-sm text-[16px] text-muted">{hint}</span>}
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
  const [confirm, setConfirm] = useState(false)
  const details = useDetails()
  const wide = useMediaQuery('(min-width: 1024px)')
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
  const full = fullPrice(data, team)
  const share = soloShare(cfg)
  const soloPrice = sellValue(u.bag, cfg, false)
  const tillFree = u.freeAt != null ? Math.max(0, u.freeAt - now) : null

  const sell = async (solo: boolean) => {
    const r = await ugSellOrbs(solo)
    // The team isn't full after all (changed on another device): the warning, before anything sells.
    if (r === 'notFull') return setConfirm(true)
    if (!r) return pushToast(t('ui.ug.sellFailed'), 'bad')
    sfx('gold')
    pushToast(t('ui.ug.sold', { price: money(r.paid) }), 'good')
  }

  const dig = () => {
    if (u.wall) return navigate('/underground/dig')
    if (!ugOpenWall()) {
      pushToast(
        tillFree != null ? t('ui.ug.noKits', { time: countdown(tillFree) }) : t('ui.ug.noKitsBuy'),
        'bad',
      )
      return
    }
    // No blip of its own: the PixelButton plays it as the finger lands (docs/38 F7a).
    navigate('/underground/dig')
  }

  // Kits: how many, and when the next free one comes; its split (free, bought) is More details'.
  const kits = (
    <section aria-labelledby="ug-kits" className="flex items-center gap-3 bg-cream p-3 shadow-card-gold">
      <PixelIcon name="kit" size={48} />
      <div className="grid min-w-0 flex-1 gap-1">
        <h2 id="ug-kits" className="sr-only">
          {t('ui.ug.kits')}
        </h2>
        <span className="text-[34px] leading-none" data-testid="ug-kits">
          {held} <small className="text-[18px] text-muted">{t('ui.ug.kitsWord')}</small>
        </span>
        <span className="text-[18px] leading-tight text-muted">
          {tillFree != null ? t('ui.ug.nextFree', { time: countdown(tillFree) }) : t('ui.ug.freeFull')}
        </span>
        {details && (
          <span className="text-[16px] text-muted">
            {t('ui.ug.kitsSplit', { free: u.freeKits, cap: free.cap, bought: u.boughtKits })}
          </span>
        )}
      </div>
    </section>
  )

  const pickaxe = (
    <Section
      id="ug-pick"
      title={t('ui.ug.pickaxe')}
      hint={t('ui.ug.pickaxeLevel', { level: u.pickaxe, max: pickaxeMax(cfg) })}
    >
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
  )

  return (
    // The events' shape (docs/43 §5.11): what you dig with on top (PC: on the cave, at the left), the team, the orb bag
    // and the plates in the panel, DIG A WALL pinned at the foot with BUY KITS and INFO.
    <StagePanel
      head={
        <div className="flex flex-col gap-3">
          <div className="relative -mx-3 -mt-4 min-h-[96px] shadow-[0_2px_0_rgb(var(--c-edge))] [@media(min-height:740px)]:min-h-[132px] lg:mx-0 lg:mt-0 lg:min-h-[120px] lg:shadow-card">
            <UgCave big className="absolute inset-0" />
            <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
              <BackButton onClick={() => navigate('/home')} />
              <span className="grid min-w-0 gap-0.5">
                <h1 className="m-0 text-[24px] font-normal leading-none">{t('ui.live.underground.name')}</h1>
                <small className="truncate text-[16px] leading-none text-muted">
                  {t('ui.live.endsIn', { time: liveTime(left.ms) })}
                </small>
              </span>
            </div>
          </div>
          {/* Its rules where they apply (docs/43 §7): a card at the top until GOT IT; INFO at the foot again. */}
          {!u.rulesSeen && (
            <RulesCard
              title={t('ui.live.underground.name')}
              icon="pickaxe"
              rules={ugRuleRows(data)}
              onDone={() => {
                ugRulesSeen()
                markLivePopupSeen(live)
              }}
            />
          )}
        </div>
      }
      stage={
        <div className="relative flex flex-col gap-3 lg:min-h-[calc(100dvh-var(--top-bar,56px)-15.5rem)] lg:justify-end lg:p-4">
          {/* PC: the cave fills the stage behind the kits and the pickaxe. */}
          {wide && <UgCave big className="absolute inset-0 shadow-card" />}
          <div className="relative flex flex-col gap-3 lg:mx-auto lg:w-full lg:max-w-[520px]">
            {kits}
            {pickaxe}
          </div>
        </div>
      }
      panel={
        <>
          <UgTeamPanel />
          <Section id="ug-bag" title={t('ui.ug.bag')} hint={t('ui.ug.bagWorth', { price: money(worth) })}>
            <OrbBagTable bag={u.bag} cfg={cfg} />
            {orbs > 0 && !full && share > 0 && <UgSoloWarning share={share} price={soloPrice} full={worth} />}
            <PixelButton
              variant={sellable && full ? 'success' : 'secondary'}
              aria-disabled={!sellable}
              onClick={() => {
                if (!orbs) return pushToast(t('ui.ug.sellEmpty'), 'info')
                if (!sellable) return pushToast(t('ui.ug.sellNeedTeam'), 'info')
                // Outside a full team, nothing sells before the player has seen both prices and said yes.
                if (!full) return setConfirm(true)
                void sell(false)
              }}
            >
              {!orbs
                ? t('ui.ug.sellEmpty')
                : !sellable
                  ? t('ui.ug.sellNeedTeam')
                  : full
                    ? t('ui.ug.sell', { price: money(worth) })
                    : t('ui.ug.sellSolo', { share, price: money(soloPrice) })}
            </PixelButton>
            {!full && share === 0 && <UgNote>{t('ui.ug.sellWhy')}</UgNote>}
          </Section>
          <UgSellModal
            open={confirm}
            onClose={() => setConfirm(false)}
            onSell={() => {
              setConfirm(false)
              void sell(true)
            }}
            share={share}
            price={soloPrice}
            full={worth}
          />
          <Section
            id="ug-plates"
            title={t('ui.ug.plates')}
            hint={t('ui.ug.platesCount', { n: plates.length, total: 17 })}
          >
            <PlateGrid held={plates} />
            {details && (
              <UgNote>
                {plates.length
                  ? t('ui.ug.platesSome', { types: plates.map((p) => typeName(p)).join(', ') })
                  : t('ui.ug.platesNone')}
              </UgNote>
            )}
          </Section>
          {details && <UgNote className="px-1">{t('ui.ug.fossilsNote')}</UgNote>}
          {details && <UgNote className="px-1">{t('ui.ug.endNote')}</UgNote>}
          <UgRulesModal open={info} onClose={() => setInfo(false)} data={data} />
        </>
      }
      dock={
        <>
          <PixelButton
            variant="primary"
            size="lg"
            className="sheen w-full"
            onClick={dig}
            aria-disabled={!u.wall && held === 0}
          >
            {u.wall ? t('ui.ug.resume') : t('ui.ug.dig')}
          </PixelButton>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <PixelButton className="min-w-0 px-2" onClick={() => navigate('/shop')}>
              {t('ui.ug.buyKits')}
            </PixelButton>
            <InfoButton compact name={t('ui.live.underground.name')} onClick={() => setInfo(true)} />
          </div>
        </>
      }
    />
  )
}
