// Raid Battles' page (docs/18 §3, the Visual Lab's mockup): today's raid Pokémon on the picture of the area that
// unlocked it, the time left, the tries, a CAUGHT stamp once it's caught, and START right under it.
import { useState, type ReactNode } from 'react'
import {
  ballBonus,
  catchChance,
  catchValueOf,
  raidLocked,
  raidRegion,
  raidRules,
  raidTeam,
  regionStarted,
  upcomingRaids,
  type RaidKindOf,
  type RaidNpcOption,
  type TodayRaid,
} from '@/engine'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { statHint, statLabel } from '@/components/StatChip'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { usePushAsk } from '@/components/PushPrompt'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { artPlacement, battleWindow, pictureOf } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useTodayRaid } from '@/store/raid'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { emptySlots, ensureNpcOffer, groupOf, startRaid, useRaidGroup } from '@/store/raidBattle'
import { PortalRaidCard } from './PortalRaid'
import { NightmareRaidCard } from './NightmareRaid'
import { ProgressRaidList } from './ProgressRaidList'
import { RaidNpcPicker } from './RaidNpcPicker'
import { RaidGroupSection, RaidTeamSection } from './RaidSetup'
import { EventInfo, raidDate, raidDateParts } from './shared'
import { cx } from '@/theme/util'

/** The raid's area picture, cut like a battle's (its middle 240 × 160, the horizon halfway down). */
export function RaidPicture({ areaId, className, children }: { areaId: string; className?: string; children?: ReactNode }) {
  const pic = pictureOf(areaId)
  return (
    <div className={cx('relative overflow-hidden bg-night', className)}>
      {pic && (
        <img
          src={pic.url}
          alt=""
          className="pixelated absolute max-w-none"
          style={{ ...artPlacement(battleWindow(pic)), imageRendering: 'pixelated' }}
        />
      )}
      {children}
    </div>
  )
}

/**
 * The raid card: the raid Pokémon on its area, its name, level and bars, the time left (the day's raid); stamped once
 * caught. A progression raid's (docs/24) has its own numbers and no time limit.
 */
export function RaidCard({
  raid,
  msLeft,
  kind = 'daily',
  portal = false,
  nightmare = false,
}: {
  raid: TodayRaid
  msLeft: number | null
  kind?: RaidKindOf
  /** Giratina's raid in an area in portal mode (docs/15 §27): on the Distortion World, distorted. */
  portal?: boolean
  /** Darkrai's raid in an area in nightmare mode (docs/15 §29): under the full moon. */
  nightmare?: boolean
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = data.config.events.raid
  // This raid Pokémon's own numbers (Admin → Raids), over the defaults.
  const rules = raidRules(data, raid.dex, kind, raid.areaId)
  const area = data.areas.find((a) => a.id === raid.areaId)
  const name = data.species[raid.dex]?.name ?? `#${raid.dex}`
  if (portal) return <PortalRaidCard raid={raid} rules={rules} name={name} areaName={area?.name ?? ''} />
  if (nightmare) return <NightmareRaidCard raid={raid} rules={rules} name={name} areaName={area?.name ?? ''} />
  return (
    <RaidPicture areaId={raid.areaId} className="aspect-[3/2] w-full shadow-ring">
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 58%, #ffbe2e55 0 22%, transparent 48%), linear-gradient(#f2553f20, #24304fa0)' }}
      />
      {area && (
        <span className="absolute left-2 top-2 bg-panel/90 px-1.5 pb-0.5 font-pixel-sm text-[15px] text-ink shadow-ring-line">{area.name}</span>
      )}
      {/* Its catch value, to get the balls ready before the fight. */}
      <span
        className="absolute left-2 top-[34px] flex items-center gap-1 bg-paper/95 px-1.5 pb-0.5 font-pixel-sm text-[15px] text-ink shadow-ring-line"
        title={statHint('catch')}
      >
        <PixelIcon name="ball" size={14} />
        {statLabel('catch')} <b className="font-normal tabular-nums">{catchValueOf(data, raid.dex)}</b>
      </span>
      {msLeft != null && (
        <span className="absolute right-2 top-2 bg-night px-1.5 pb-0.5 font-pixel-sm text-[15px] text-gold-light">
          {t(raid.caught ? 'ui.events.raid.newIn' : 'ui.events.raid.endsIn', { time: countdown(msLeft) })}
        </span>
      )}
      <span className={cx('absolute left-1/2 top-[18%] -translate-x-1/2', !raid.caught && 'ev-bob')}>
        <SpriteImg dex={raid.dex} size={128} shiny={raid.shiny} className={raid.caught ? 'grayscale-[0.4]' : undefined} />
      </span>
      <span className="absolute bottom-2 left-2.5 grid gap-0.5 leading-none text-white [text-shadow:0_2px_0_#24304f]">
        <b className="text-[28px] font-normal">{raid.shiny ? t('ui.events.raid.shinyName', { name }) : name}</b>
        <small className="font-pixel-sm text-[15px] text-gold-light">{t('ui.events.raid.sub', { level: rules.level, bars: rules.bars })}</small>
      </span>
      <span className="absolute bottom-3 right-2.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: rules.bars }, (_, i) => (
          <i key={i} className="block h-2 w-[18px] shadow-[0_0_0_2px_#24304f]" style={{ background: cfg.barColors[i % cfg.barColors.length] }} />
        ))}
      </span>
      {raid.caught && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 bg-white/85 px-3.5 pb-1.5 pt-1 text-[34px] leading-none tracking-[0.08em] text-forest shadow-[inset_0_0_0_3px_#34c97a,0_0_0_2px_#24304f]">
          {t('ui.events.raid.caught')}
        </span>
      )}
    </RaidPicture>
  )
}

/** Each ball's chance to catch the raid Pokémon once it's worn out, and how many you have: what to buy first. */
export function BallOdds({ dex }: { dex: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inventory = useGame((s) => s.save?.inventory)
  const value = catchValueOf(data, dex)
  const balls = Object.values(data.items)
    .filter((it) => it.effect.kind === 'ball')
    .sort((a, b) => ballBonus(a) - ballBonus(b))
  const pct = (bonus: number) => Math.round(catchChance(value, bonus) * 100)
  return (
    <section aria-label={t('ui.raid.ballOdds')} className="grid gap-1.5">
      <h2 className="m-0 text-[22px] font-normal leading-none">{t('ui.raid.ballOdds')}</h2>
      <ul className="m-0 grid list-none gap-1.5 p-0" style={{ gridTemplateColumns: `repeat(${balls.length + 1}, minmax(0, 1fr))` }}>
        <li className="grid justify-items-center gap-0.5 bg-paper px-1 pb-1.5 pt-1 shadow-ring">
          <span className="grid h-[26px] place-items-center">
            <PixelIcon name="dice" size={20} />
          </span>
          <b className="font-pixel text-[20px] font-normal leading-none tabular-nums">{pct(0)}%</b>
          <small className="font-pixel-sm text-[13px] leading-none text-muted">{t('ui.catch.noBall')}</small>
        </li>
        {balls.map((it) => (
          <li key={it.key} className="grid justify-items-center gap-0.5 bg-paper px-1 pb-1.5 pt-1 shadow-ring" title={it.name}>
            <span className="grid h-[26px] place-items-center">
              <ItemSprite item={it} size={26} />
            </span>
            <b className="font-pixel text-[20px] font-normal leading-none tabular-nums">{pct(ballBonus(it))}%</b>
            <small className="font-pixel-sm text-[13px] leading-none text-muted">
              <span className="sr-only">{it.name} </span>×{inventory?.[it.key] ?? 0}
            </small>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Today's raid Pokémon would wait for you: its area, in its region, isn't completed yet. You can still fight and catch
 * it; it joins that region's Box once the area is completed.
 */
function LockNotice({ raid }: { raid: TodayRaid }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save || !raidLocked(save, data, raid.areaId)) return null
  const area = data.areas.find((a) => a.id === raid.areaId)
  const regionId = raidRegion(data, raid.areaId)
  const region = data.regions.find((r) => r.id === regionId)?.name ?? regionId
  const name = data.species[raid.dex]?.name ?? ''
  return (
    <div role="note" className="flex items-start gap-2.5 bg-gold-pale p-2.5 shadow-[inset_0_0_0_2px_#d99a1e]">
      <span className="grid h-9 w-9 shrink-0 place-items-center bg-paper shadow-ring-line" aria-hidden>
        <PixelIcon name="lock" size={18} />
      </span>
      <span className="grid gap-0.5 leading-tight">
        <b className="text-[19px] font-normal leading-none">{t('ui.raid.lockTitle', { name })}</b>
        <small className="font-pixel-sm text-[15px] text-ink">
          {t(regionStarted(save, regionId) ? 'ui.raid.lockText' : 'ui.raid.lockTextNew', { name, area: area?.name ?? '', region })}
        </small>
      </span>
    </div>
  )
}

/** The calendar button under Info: the next two weeks of raids (today first) in a pop-up, under a "may change" note. */
function RaidCalendar({ today, day }: { today: TodayRaid; day: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState(false)
  const days = open ? [{ day, raid: today }, ...upcomingRaids(data, day, 13)] : []
  return (
    <>
      <PixelButton size="lg" className="w-full" onClick={() => setOpen(true)} aria-label={t('ui.raid.calendarLabel')}>
        <PixelIcon name="calendar" size={22} />
        {t('ui.raid.calendar')}
      </PixelButton>
      <Modal open={open} onClose={() => setOpen(false)} title={t('ui.raid.calendarTitle')} className="max-w-md">
        <div className="grid gap-3">
          <p role="note" className="m-0 flex items-start gap-2 bg-gold-pale p-2.5 font-pixel-sm text-[15px] leading-tight text-ink shadow-[inset_0_0_0_2px_#d99a1e]">
            <PixelIcon name="warning" size={18} className="mt-px" />
            {t('ui.raid.calendarNote')}
          </p>
          <ol className="m-0 grid list-none gap-1.5 p-0">
            {days.map(({ day: d, raid: r }, i) => {
              const date = raidDateParts(d)
              return (
                <li
                  key={d}
                  className={cx('flex min-h-[64px] items-center gap-2.5 bg-paper p-1.5 pr-2.5', i === 0 ? 'shadow-card-gold' : 'shadow-ring-line')}
                  aria-current={i === 0 ? 'date' : undefined}
                >
                  <span className="sr-only">{raidDate(d)}</span>
                  {/* A calendar page: the weekday on its red strip, the day, the month. */}
                  <span className="grid w-[50px] shrink-0 bg-well text-center leading-none shadow-ring-line" aria-hidden>
                    <small className={cx('px-0.5 pb-0.5 pt-px font-pixel-sm text-[13px]', i === 0 ? 'bg-gold text-night' : 'bg-crimson text-white')}>
                      {date.weekday}
                    </small>
                    <b className="pt-0.5 text-[22px] font-normal tabular-nums">{date.date}</b>
                    <small className="pb-1 font-pixel-sm text-[13px] text-muted">{date.month}</small>
                  </span>
                  <SpriteImg dex={r.dex} size={48} shiny={r.shiny} alt="" />
                  <span className="grid min-w-0 flex-1 gap-0.5 leading-none">
                    <b className="truncate text-[20px] font-normal">{data.species[r.dex]?.name ?? `#${r.dex}`}</b>
                    {i === 0 && <small className="font-pixel-sm text-[14px] text-muted">{t('ui.raid.today')}</small>}
                  </span>
                  {r.shiny && (
                    <span className="flex shrink-0 items-center gap-1 bg-gold-pale px-1.5 pb-0.5 font-pixel-sm text-[14px] text-ink shadow-ring-line">
                      <PixelIcon name="star" size={12} />
                      {t('ui.mon.shiny')}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          <PixelButton variant="primary" onClick={() => setOpen(false)}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      </Modal>
    </>
  )
}

/** Raid Pokémon you caught that wait for their area: what to complete, and where. */
function Waiting() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const locks = save?.events?.raidLocked ?? []
  if (!locks.length) return null
  return (
    <section aria-labelledby="raid-wait-h" className="grid gap-1.5">
      <h2 id="raid-wait-h" className="m-0 text-[22px] font-normal leading-none">
        {t('ui.raid.waitingTitle')}
      </h2>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {locks.map((l, i) => {
          const area = data.areas.find((a) => a.id === l.areaId)
          const regionId = raidRegion(data, l.areaId)
          const region = data.regions.find((r) => r.id === regionId)?.name ?? regionId
          return (
            <li key={`${l.day}-${i}`} className="flex min-h-[52px] items-center gap-2 bg-well py-1 pl-1 pr-2.5 shadow-ring-line">
              <MiniSprite dex={l.dex} size={40} className="-my-1 grayscale-[0.6]" />
              <span className="grid min-w-0 flex-1 leading-[1.05]">
                <b className="truncate text-[18px] font-normal">
                  {l.shiny ? t('ui.events.raid.shinyName', { name: data.species[l.dex]?.name ?? '' }) : data.species[l.dex]?.name}
                </b>
                <small className="font-pixel-sm text-[14px] text-muted">{t('ui.raid.waitingFor', { area: area?.name ?? '', region })}</small>
              </span>
              <PixelIcon name="lock" size={16} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function RaidPage() {
  const { t, tPlural } = useT()
  const { raid, msLeft, day } = useTodayRaid()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  // START with empty slots: the four NPC trainers on offer (kept in the save, the same after a reload).
  const [offer, setOffer] = useState<RaidNpcOption[] | null>(null)
  const friends = groupOf('daily', useRaidGroup())
  // Push notifications' question, once (docs/27): each day's raid can be announced.
  usePushAsk('raid', !!raid)
  if (!raid || !save) return <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.events.raid.loading')}</p>
  const need = emptySlots(friends)
  const go = (npcs: RaidNpcOption[] = []) => {
    setOffer(null)
    if (!startRaid(npcs, friends)) pushToast(t('ui.raid.cantStart'), 'bad')
  }
  const me = { name: t('ui.raid.you'), look: avatarOf(playerAvatarId(save.player)).src }
  const group = [me, ...friends.filter((f) => f.team.length > 0).map((f) => ({ name: f.name, look: avatarOf(f.avatar).src }))]
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
      <RaidCard raid={raid} msLeft={msLeft} />
      {!raid.caught && <LockNotice raid={raid} />}
      {!raid.caught && (
        <PixelButton
          variant="primary"
          size="lg"
          className="w-full"
          // Empty slots in the group: pick NPC trainers to fill them first.
          onClick={() => (need ? (raidTeam(save, data).length ? setOffer(ensureNpcOffer({ kind: 'daily' })) : go()) : go())}
        >
          {t('ui.events.raid.start')}
        </PixelButton>
      )}
      <p className="m-0 text-center font-pixel-sm text-[15px] text-muted">{tPlural('ui.events.raid.tries', raid.tries, { n: raid.tries })}</p>
      <RaidTeamSection boss={raid.dex} />
      {!raid.caught && <RaidGroupSection boss={raid.dex} />}
      {!raid.caught && <BallOdds dex={raid.dex} />}
      <Waiting />
      <ProgressRaidList />
      <EventInfo id="raid" />
      {day && <RaidCalendar today={raid} day={day} />}
      {offer && (
        <RaidNpcPicker
          open
          offer={offer}
          need={need}
          group={group}
          level={data.config.events.raid.teamCap}
          boss={raid.dex}
          onBack={() => setOffer(null)}
          onStart={go}
        />
      )}
    </div>
  )
}
