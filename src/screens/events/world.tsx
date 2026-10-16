// Small worlds (docs/21), what players see. Outside a world: Home's square (first among the event squares), the pop-up
// once when one opens and the closing pop-up (the partner pick, the lab in the world's colours, is in worldPick.tsx).
// Inside: the world's colours, its strip on Home (its name, the time left, the way back), its two squares (the
// mythical, its Mart), the booster chips, the mythical's result card, and the panel the main game's pages show instead
// of theirs. Every rule and number comes from engine/worlds.ts; the store's actions are store/worlds.ts.
import { type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import {
  areaOpenAt,
  conditionStatus,
  currentWorld,
  dayCareTutorialDue,
  donationDue,
  eventUnlockDue,
  getRegion,
  hasWorldMythical,
  heldWorld,
  inWorld,
  nightmareLock,
  isAreaClosed,
  isAreaUnlocked,
  leaderboardTutorialDue,
  mythicalHome,
  regionOfferDue,
  generalRulesDue,
  versusRulesDue,
  worldByeDue,
  worldLeft,
  worldPopupDue,
  worldPrize,
  worldPrizeCaught,
  worldPrizes,
  worldProgress,
  worldSecrets,
  worldStarted,
  type Area,
  type BossDef,
  type GameData,
  type PokeType,
  type SaveData,
  type SmallWorld,
  type UnlockCondition,
  type WorldBye,
} from '@/engine'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { AreaStrip } from '@/components/AreaStrip'
import { Chip, NewTag } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { dayTime, typeName } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useRaidGifts } from '@/store/raidGifts'
import { serverNow, useServerNow } from '@/store/serverTime'
import { travelTo } from '@/store/travel'
import { enterSmallWorld, leaveSmallWorld, markWorldByeSeen, markWorldPopupSeen, useWorld, worldName } from '@/store/worlds'
import { HeadTag, Meter, Widget, WidgetBanner, WidgetRows, WIDGET_BANNER_H } from '@/screens/home/Widget'
import { areaStatus, lockReason } from '@/screens/home/areas'
import { conditionLabel } from '@/i18n/text'
import { cx, textOn } from '@/theme/util'
import { LiveGauge, liveTime } from './live'
import { bannerUrl } from './shared'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const HEX = /^#[0-9a-f]{6}$/i
const colour = (c: string | undefined, fallback: string) => (c && HEX.test(c) ? c : fallback)

/**
 * A world's colours as CSS variables (`--w-main`, `--w-accent`, `--w-ground`) and the ink that reads on each, so its
 * pieces wear them whatever the admin picked (a light main colour takes navy text, a dark one white).
 */
export function worldVars(w: Pick<SmallWorld, 'theme'> | null | undefined): CSSProperties {
  const main = colour(w?.theme.main, '#5b3a9e')
  const accent = colour(w?.theme.accent, '#ff6f9c')
  const ground = colour(w?.theme.ground, '#efe6fb')
  return {
    ['--w-main' as string]: main,
    ['--w-accent' as string]: accent,
    ['--w-ground' as string]: ground,
    ['--w-on-main' as string]: textOn(main),
    ['--w-on-accent' as string]: textOn(accent),
  }
}

/** WORLD, in the world's main colour. */
export function WorldTag({ className }: { className?: string }) {
  const { t } = useT()
  return <span className={cx('w-tag font-pixel-sm text-[13px]', className)}>{t('ui.world.tag')}</span>
}

/** SHINY MEW, gold with a sparkle: what the world is for. */
export function ShinyTag({ dex, data, className }: { dex: number; data: GameData; className?: string }) {
  const { t } = useT()
  const name = data.species[dex]?.name
  if (!name) return null
  return (
    <Chip tone="gold" className={cx('uppercase tracking-[0.04em]', className)}>
      <PixelIcon name="sparkle" size={11} />
      {t('ui.events.raid.shinyName', { name })}
    </Chip>
  )
}

/** A booster: the type's badge and its multiplier, said in full for screen readers (it's never a hidden number). */
export function BoosterChip({ type, n, className }: { type: PokeType; n: number; className?: string }) {
  const { t } = useT()
  const label = t('ui.world.boostLabel', { type: typeName(type), n })
  return (
    <span role="img" aria-label={label} title={label} className={cx('inline-flex shrink-0 items-center', className)}>
      <TypeBadge type={type} size="sm" />
      <span className="w-boost-x font-pixel-sm">×{n}</span>
    </span>
  )
}

/** Every booster of a world, in a row. */
export function Boosters({ world, className }: { world: SmallWorld; className?: string }) {
  if (!world.boosters.length) return null
  return (
    <span className={cx('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {world.boosters.map((b) => (
        <BoosterChip key={b.type} type={b.type} n={b.multiplier} />
      ))}
    </span>
  )
}

/** The mythical: a silhouette glowing in the world's accent until it's caught, then its shiny colours. */
export function MythicalArt({ dex, caught, size, sparkles }: { dex: number; caught: boolean; size: number; sparkles?: number }) {
  return (
    <span className="relative grid place-items-center" aria-hidden>
      {!!sparkles && (
        <span className="lv-fx lv-spk">
          {Array.from({ length: sparkles }, (_, i) => (
            <i key={i}>
              <PixelIcon name="sparkle" size={size > 80 ? 24 : 16} />
            </i>
          ))}
        </span>
      )}
      <SpriteImg dex={dex} shiny silhouette={!caught} size={size} className={cx('relative z-[1]', caught ? 'w-got' : 'w-sil')} />
    </span>
  )
}

// ------------------------------------------------------------------ getting in: the square, the pop-up, the pick

/** The partner pick is open (from the square or the pop-up; `WorldPick` in worldPick.tsx). */
export const useWorldPick = create<{ open: boolean }>(() => ({ open: false }))

/** Into the world: back where the player left it, or the first time through the partner pick. */
export function goIntoWorld(world: SmallWorld): boolean {
  const { save } = useGame.getState()
  if (!save) return false
  if (worldStarted(save, world)) return enterSmallWorld()
  useWorldPick.setState({ open: true })
  return false
}

/**
 * Home's square for a world: its picture, WORLD and its shiny mythical's tags, the mythical's silhouette (in colour once
 * caught), the areas cleared, the time left draining.
 */
export function WorldSquareView({
  world,
  now,
  cleared,
  total,
  partner,
  caught,
  onClick,
}: {
  world: SmallWorld
  now: number
  cleared: number
  total: number
  /** The partner picked, once the player has been in. */
  partner: string | null
  caught: boolean
  onClick: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  // What it's for: its mythical, or the prize it is known by (docs/26 §2.5).
  const prize = worldPrize(data, world)
  const left = worldLeft(world, now)
  const name = worldName(world, data)
  const areas = t('ui.world.areas', { cleared, total })
  const sub = partner ? t('ui.world.with', { name: partner }) : t('ui.world.fresh')
  const time = t('ui.live.endsIn', { time: liveTime(left.ms) })
  const hot = left.ms < DAY
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('ui.world.label', { name, areas, sub, time })}
      className="pixel-panel lv-square w-square relative isolate flex min-w-0 flex-col gap-[5px] overflow-hidden px-2.5 pb-2.5 pt-2 text-left"
      style={worldVars(world)}
    >
      <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
        {world.banner && <img src={bannerUrl(world.banner)} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />}
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5 text-[19px] leading-none">
        <WorldTag />
        <HeadTag>
          <ShinyTag dex={prize?.dex ?? 0} data={data} className="max-w-full truncate" />
        </HeadTag>
      </span>
      <span className="relative grid w-full place-items-center" style={{ aspectRatio: `288 / ${WIDGET_BANNER_H}` }}>
        {prize && <MythicalArt dex={prize.dex} caught={caught} size={56} sparkles={3} />}
      </span>
      <WidgetRows
        top={<span className="lv-ink truncate text-[20px] leading-none">{name}</span>}
        meter={<LiveGauge share={left.share} hot={hot} />}
        bottom={
          <span className={cx('lv-ink', hot ? 'text-[#ffb3a8]' : 'text-gold-light')}>
            {areas} · {time}
          </span>
        }
      />
    </button>
  )
}

/** Home's square for the world that's open to this player, first among the event squares. Tap: in (the pick first). */
export function WorldSquare() {
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { world, now } = useWorld(1000)
  if (!world || !save || now == null || inWorld(save, data)) return null
  const prog = worldProgress(save, data, world)
  const held = heldWorld(save)
  const mine = held?.id === world.id
  const prize = worldPrize(data, world)
  return (
    <WorldSquareView
      world={world}
      now={now}
      cleared={prog.cleared}
      total={prog.total}
      partner={mine ? (data.species[held.partner]?.name ?? null) : null}
      caught={!!prize && worldPrizeCaught(save, world, prize)}
      onClick={() => {
        if (goIntoWorld(world)) navigate('/home')
      }}
    />
  )
}

/** Its rules in short, with its numbers: XP ×, the boosters, the shiny mythical or its prizes, its Pokémon going home. */
export function WorldRules({ world }: { world: SmallWorld }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const myth = data.species[world.mythical.dex]?.name ?? ''
  const rows: { key: string; icon: ReactNode; title: string; text: string }[] = [
    {
      key: 'xp',
      icon: <span className="font-pixel-sm text-[16px] leading-none">×{world.xpMultiplier}</span>,
      title: t('ui.world.rules.xp.title', { n: world.xpMultiplier }),
      text: t('ui.world.rules.xp.text', { n: world.xpMultiplier }),
    },
  ]
  if (world.boosters.length)
    rows.push({
      key: 'boost',
      icon: <PixelIcon name="up" size={22} />,
      title: joinList(world.boosters.map((b) => t('ui.world.boost', { type: typeName(b.type), n: b.multiplier }))),
      text: t('ui.world.rules.boost.text'),
    })
  if (myth && hasWorldMythical(data, world))
    rows.push({
      key: 'myth',
      icon: <SpriteImg dex={world.mythical.dex} shiny size={36} />,
      title: t('ui.world.rules.myth.title', { name: myth }),
      text: t('ui.world.rules.myth.text'),
    })
  // Its other shiny prizes: the bosses and raids of its areas marked shiny (docs/26 §2.5).
  const prizes = worldPrizes(data, world).filter((p) => p.kind !== 'mythical')
  if (prizes.length)
    rows.push({
      key: 'prizes',
      icon: <SpriteImg dex={prizes.at(-1)!.dex} shiny size={36} />,
      title: t('ui.world.rules.prizes.title', { names: joinList(prizes.map((p) => data.species[p.dex]?.name ?? `#${p.dex}`)) }),
      text: t('ui.world.rules.prizes.text'),
    })
  // Every world (docs/26 §1): its Pokémon go home when it ends, each locked by level in its own region.
  rows.push({
    key: 'home',
    icon: <PixelIcon name="box" size={22} />,
    title: t('ui.world.rules.home.title'),
    text: t('ui.world.rules.home.text'),
  })
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2.5">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
            {r.icon}
          </span>
          <span className="grid gap-0.5 leading-tight">
            <b className="text-[19px] font-normal leading-none">{r.title}</b>
            <small className="font-pixel-sm text-[15px] text-muted">{r.text}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The banner of the pop-ups: the world's picture, its tag, the mythical (or the prize it is known by). */
function WorldBanner({ world, tag, closed }: { world: SmallWorld | null; tag: string; closed?: boolean }) {
  const data = useGame((s) => s.data)
  const prize = world ? worldPrize(data, world) : null
  return (
    <span className={cx('relative -mx-4 block h-[128px] shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]', closed && 'grayscale-[0.7]')}>
      <span className="lv-pic absolute inset-0 block overflow-hidden bg-night" aria-hidden>
        {world?.banner && <img src={bannerUrl(world.banner)} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />}
      </span>
      {prize && !closed && (
        <span className="absolute inset-0 z-[1] grid place-items-center">
          <MythicalArt dex={prize.dex} caught={false} size={96} sparkles={6} />
        </span>
      )}
      <span className="w-tag absolute left-2.5 top-2.5 z-[2] font-pixel-sm text-[15px]">{tag}</span>
    </span>
  )
}

/** Other one-time pop-ups go first; the world's waits its turn (it goes before the live event's). */
function useOthersDue(): boolean {
  const gifts = useRaidGifts((s) => s.gifts.length)
  const others = useGame(
    (s) =>
      !s.save ||
      dayCareTutorialDue(s.save, s.data) ||
      leaderboardTutorialDue(s.save, s.data) ||
      donationDue(s.save, s.data) ||
      !!regionOfferDue(s.save, s.data) ||
      !!eventUnlockDue(s.save, s.data) ||
      versusRulesDue(s.save, s.data) ||
      generalRulesDue(s.save, s.data),
  )
  return others || gifts > 0
}

/** The world's pop-up: its banner, the time left, its rules; Later and Enter. */
export function WorldPopupView({
  world,
  now,
  open,
  onLater,
  onEnter,
}: {
  world: SmallWorld
  now: number
  open: boolean
  onLater: () => void
  onEnter: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const left = worldLeft(world, now)
  return (
    <Modal open={open} onClose={onLater} title={worldName(world, data)} className="max-w-md">
      <div className="flex flex-col gap-3" style={worldVars(world)}>
        <WorldBanner world={world} tag={t('ui.world.name')} />
        <div className="grid gap-1.5">
          <p className="m-0 font-pixel-sm text-[16px] leading-none text-muted">
            {t('ui.live.leftUntil', { time: liveTime(left.ms), date: dayTime(Date.parse(world.end)) })}
          </p>
          <LiveGauge share={left.share} hot={left.ms < DAY} className="lv-gauge-light" />
        </div>
        <WorldRules world={world} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5 pt-1">
          <PixelButton onClick={onLater}>{t('ui.events.later')}</PixelButton>
          <PixelButton variant="primary" onClick={onEnter}>
            {t('ui.world.enter')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/**
 * The world's pop-up: once, the first time the player is between fights while it's open (after Prof. Oak's tutorials
 * and the other pop-ups, before the live event's). Later, or Enter (the partner pick the first time).
 */
export function WorldPopup() {
  const navigate = useNavigate()
  const onShop = useLocation().pathname.startsWith('/shop')
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const others = useOthersDue()
  const idle = useGame((s) => s.run.phase === 'idle' && !s.battle)
  const picking = useWorldPick((s) => s.open)
  const { world, now } = useWorld(5000)
  if (!world || !save || now == null || inWorld(save, data)) return null
  const open = idle && !picking && worldPopupDue(save, world) && !others && !onShop
  const close = () => {
    if (worldPopupDue(save, world)) markWorldPopupSeen(world)
  }
  return (
    <WorldPopupView
      world={world}
      now={now}
      open={open}
      onLater={close}
      onEnter={() => {
        close()
        if (goIntoWorld(world)) navigate('/home')
      }}
    />
  )
}

/** The closing pop-up: the world gone grey, what was kept (or got away), and that the rest stayed there. */
export function WorldByeView({ bye, open, onOk }: { bye: WorldBye; open: boolean; onOk: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const w = bye.world
  const name = worldName(w, data)
  const myth = w ? data.species[w.mythical.dex]?.name : null
  const home = w ? (getRegion(data, mythicalHome(data, w.mythical.dex))?.name ?? '') : ''
  const partner = bye.partner ? data.species[bye.partner]?.name : null
  // "Kanto 8 · Johto 5 · Sinnoh 3", in the regions' order (docs/26 §1).
  const homeList = data.regions
    .filter((r) => (bye.home[r.id] ?? 0) > 0)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((r) => t('ui.world.bye.homeCount', { region: r.name, n: bye.home[r.id]! }))
    .join(' · ')
  return (
    <Modal open={open} onClose={onOk} title={t('ui.world.bye.title', { world: name })} className="max-w-md">
      <div className="flex flex-col gap-3" style={worldVars(w)}>
        <WorldBanner world={w} tag={t('ui.world.bye.tag')} closed />
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {w && myth && (
            <li className="flex items-center gap-2.5">
              <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
                <SpriteImg dex={w.mythical.dex} shiny silhouette={!bye.caught} size={36} />
              </span>
              <span className="grid gap-0.5 leading-tight">
                <b className="text-[19px] font-normal leading-none">
                  {bye.caught ? t('ui.world.bye.kept', { name: myth }) : t('ui.world.bye.gone', { name: myth })}
                </b>
                <small className="font-pixel-sm text-[15px] text-muted">
                  {bye.caught ? t('ui.world.myth.home', { region: home }) : t('ui.world.bye.goneText')}
                </small>
              </span>
            </li>
          )}
          {homeList && (
            <li className="flex items-center gap-2.5">
              <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
                {partner ? <SpriteImg dex={bye.partner!} size={36} /> : <PixelIcon name="box" size={22} />}
              </span>
              <span className="grid gap-0.5 leading-tight">
                <b className="text-[19px] font-normal leading-none">{t('ui.world.bye.home')}</b>
                <small className="font-pixel-sm text-[15px] text-muted">{t('ui.world.bye.homeText', { list: homeList })}</small>
              </span>
            </li>
          )}
          <li className="flex items-center gap-2.5">
            <span className="grid h-[42px] w-[42px] shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
              <PixelIcon name="close" size={20} />
            </span>
            <span className="grid gap-0.5 leading-tight">
              <b className="text-[19px] font-normal leading-none">{t('ui.world.bye.rest')}</b>
              <small className="font-pixel-sm text-[15px] text-muted">
                {bye.entered ? t('ui.world.bye.restText') : t('ui.world.bye.notEntered')}
              </small>
            </span>
          </li>
        </ul>
        <PixelButton variant="primary" onClick={onOk}>
          {t('ui.common.ok')}
        </PixelButton>
      </div>
    </Modal>
  )
}

/** The closing pop-up: once, to whoever played the world (what they kept) or saw it open. */
export function WorldByePopup() {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const others = useOthersDue()
  const idle = useGame((s) => s.run.phase === 'idle' && !s.battle)
  const now = useServerNow(5000)
  const bye = save ? worldByeDue(save, data, now) : null
  if (!bye || !save) return null
  return <WorldByeView bye={bye} open={idle && !others} onOk={() => markWorldByeSeen(bye.id)} />
}

// ------------------------------------------------------------------ inside

/** The world being played, for the screens inside it (null outside one). */
export function useInWorld(): { world: SmallWorld | null; inside: boolean; save: SaveData | null } {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const inside = !!save && inWorld(save, data)
  return { world: inside && save ? currentWorld(save, data) : null, inside, save }
}

/** "Back to Kanto": where the player came from (from the save's own record, so it works before the content is in). */
export function useBackName(): string {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const from = save ? heldWorld(save)?.from : null
  return (from && getRegion(data, from)?.name) || ''
}

/**
 * Under the top bar inside a world: its picture, its name, the time left (red in the last day) and Back to the region
 * the player came from. `world` may be unknown yet (the content not in): the way back still works.
 */
export function WorldStripView({
  world,
  now,
  back,
  onBack,
  locked,
}: {
  world: SmallWorld | null
  now: number | null
  back: string
  onBack: () => void
  /** Why the way back is shut right now (Darkrai's nightmare holds the player, docs/30): a lock on it, its reason. */
  locked?: string | null
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const left = world && now != null ? worldLeft(world, now) : null
  const hot = !!left && left.ms < DAY
  return (
    <div className="w-strip relative isolate flex items-center gap-2 px-2.5 py-2" style={worldVars(world)}>
      <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
        {world?.banner && <img src={bannerUrl(world.banner)} alt="" className="pixelated absolute inset-0 h-full w-full object-cover" />}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5 leading-none">
        <span className="flex min-w-0 items-center gap-1.5">
          <WorldTag />
          <b className="lv-ink truncate text-[22px] font-normal">{worldName(world, data)}</b>
        </span>
        {left && (
          <small className={cx('lv-ink font-pixel-sm text-[15px]', hot ? 'text-[#ffb3a8]' : 'text-gold-light')}>
            {t('ui.live.endsIn', { time: liveTime(left.ms) })}
          </small>
        )}
      </span>
      {/* Shut by the nightmare: still a button, so a tap says why (the reason is its accessible description too). */}
      <PixelButton
        size="sm"
        className={cx('shrink-0', locked && 'hatched')}
        onClick={onBack}
        aria-disabled={locked ? true : undefined}
        title={locked ?? undefined}
        aria-description={locked ?? undefined}
      >
        {locked && <PixelIcon name="lock" size={16} />}
        {t('ui.world.backTo', { region: back })}
      </PixelButton>
    </div>
  )
}

/** The strip of the world being played (nothing outside one). */
export function WorldStrip() {
  const { world, inside } = useInWorld()
  const now = useServerNow(1000)
  const back = useBackName()
  const { t } = useT()
  const held = useGame((s) => nightmareLock(s.save, s.data))
  if (!inside) return null
  return (
    <WorldStripView
      world={world}
      now={now}
      back={back}
      onBack={() => leaveSmallWorld()}
      locked={held ? t('ui.nightmare.locked', { area: held.name }) : null}
    />
  )
}

/** Inside a world, Home's square for its mythical: its silhouette (its colours once caught), its level, where it is. */
export function MythicalSquare({ world, caught, state, onClick }: { world: SmallWorld; caught: boolean; state: string; onClick: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const m = world.mythical
  const name = data.species[m.dex]?.name ?? ''
  return (
    <Widget
      title={t('ui.world.myth.title')}
      tag={<HeadTag>{caught ? <Chip tone="done">{t('ui.events.raid.caught')}</Chip> : <ShinyTag dex={m.dex} data={data} />}</HeadTag>}
      label={t('ui.world.myth.label', { name, level: m.level, state })}
      onClick={onClick}
      className="w-widget"
    >
      <WidgetBanner>
        <span className="w-myth-ground absolute inset-0 grid place-items-center" style={worldVars(world)}>
          <MythicalArt dex={m.dex} caught={caught} size={56} />
        </span>
      </WidgetBanner>
      <WidgetRows
        top={
          <span className="truncate text-[20px] leading-none">
            {t('ui.common.level.short', { n: m.level })} · {name}
          </span>
        }
        bottom={state}
      />
    </Widget>
  )
}

/** A secret area's row as Home inside a world shows it: locked (what opens it), new, open, or its prize caught. */
export type SecretRowState = 'locked' | 'new' | 'open' | 'done'

/**
 * One of a world's secret areas on Home, two squares wide (docs/26 §2.6): its picture fills the row (greyed while
 * locked), its boss on the right (a silhouette until it opens), and over the picture's dark foot its name and what's
 * next: the condition with its gauge, the boss or raid and its level, or that it's caught.
 */
export function SecretRowView({
  area,
  state,
  boss,
  raid,
  cond,
  onClick,
}: {
  area: Area
  state: SecretRowState
  boss: BossDef | null
  raid: boolean
  /** The condition still to meet, while locked. */
  cond: { kind: UnlockCondition['kind']; label: string; current: number; target: number } | null
  onClick: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const locked = state === 'locked'
  const bossName = boss ? (data.species[boss.dex]?.name ?? `#${boss.dex}`) : ''
  // Its colours are on the sprite and the header's chip; the line keeps to the name, so a phone shows it whole.
  const shown = bossName
  const bottom = locked
    ? !cond
      ? ''
      : cond.kind === 'pokedex'
        ? t('ui.home.secretDex', { current: Math.min(cond.current, cond.target), target: cond.target })
        : cond.kind === 'maxLevel'
          ? t('ui.home.secretLevel', { current: Math.min(cond.current, cond.target), target: cond.target })
          : cond.label
    : !boss
      ? ''
      : state === 'done'
        ? t('ui.world.secret.done', { name: shown })
        : t(raid ? 'ui.world.secret.raid' : 'ui.world.secret.boss', { name: shown, level: boss.level })
  const tag = locked ? (
    <PixelIcon name="lock" size={14} />
  ) : state === 'new' ? (
    <NewTag />
  ) : state === 'done' ? (
    <Chip tone="done">{t('ui.events.raid.caught')}</Chip>
  ) : boss?.shiny ? (
    <ShinyTag dex={boss.dex} data={data} className="max-w-full truncate" />
  ) : null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('ui.world.secret.label', {
        area: area.name,
        state: locked && cond ? `${cond.label}, ${bottom}` : boss?.shiny ? `${bottom} (${t('ui.mon.shiny')})` : bottom,
      })}
      className="pixel-panel lv-square w-square relative isolate col-span-2 flex min-h-[132px] min-w-0 flex-col gap-[5px] overflow-hidden px-2.5 pb-2.5 pt-2 text-left"
    >
      {/* The whole row is its picture, darker at the top and foot where the words sit (docs/26 §2.6). */}
      <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
        <AreaStrip area={area} h={132} className={cx('absolute inset-0 h-full w-full', locked && 'grayscale-[0.7]')} />
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5 text-[19px] leading-none">
        <span className="lv-ink min-w-0 flex-1 truncate">{t('ui.home.secretArea')}</span>
        <HeadTag>{tag}</HeadTag>
      </span>
      {boss && (
        <span className="absolute right-3 top-1/2 z-[1] -translate-y-1/2" aria-hidden>
          <SpriteImg dex={boss.dex} shiny={boss.shiny && !locked} silhouette={locked} size={64} className={locked ? 'w-sil' : 'w-got'} />
        </span>
      )}
      <span className="mt-auto grid w-full max-w-[calc(100%-76px)] grid-rows-[22px_6px_15px] gap-[5px]">
        <span className="lv-ink truncate text-[22px] leading-none">{area.name}</span>
        <span>{locked && cond && cond.target > 1 && <Meter value={cond.current} max={cond.target} />}</span>
        <span className="lv-ink truncate font-pixel-sm text-[15px] leading-none text-gold-light">{bottom}</span>
      </span>
    </button>
  )
}

/** Inside a world, Home's squares: the mythical (or its Pokédex), its Mart, then a row per secret area. */
export function WorldWidgets() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { world, save } = useInWorld()
  if (!world || !save) return null
  const secrets = worldSecrets(save, data, world).map((x) => {
    const status = areaStatus(save, data, x.area)
    const state: SecretRowState = status === 'locked' ? 'locked' : x.caught ? 'done' : status === 'new' ? 'new' : 'open'
    const unmet = (x.area.unlockConditions ?? []).map((c) => conditionStatus(c, save, data)).find((c) => !c.met)
    const cond = unmet ? { kind: unmet.cond.kind, label: conditionLabel(unmet.cond, data), current: unmet.current, target: unmet.target } : null
    return { ...x, state, cond }
  })
  const rows = secrets.map((x) => (
    <SecretRowView
      key={x.area.id}
      area={x.area}
      state={x.state}
      boss={x.boss}
      raid={x.raid}
      cond={x.state === 'locked' ? x.cond : null}
      onClick={() => (x.state === 'locked' ? pushToast(lockReason(save, data, x.area), 'info') : travelTo(x.area))}
    />
  ))
  // The nav bar reaches its Mart, Pokédex and Upgrades: Home keeps to what has no other place (docs/26 §2.6).
  if (!hasWorldMythical(data, world)) return <>{rows}</>
  const caught = !!heldWorld(save)?.caught
  const m = world.mythical
  const area = data.areas.find((a) => a.id === m.areaId)
  const open = !!area && isAreaUnlocked(save, area.id, data) && areaOpenAt(data, area.id, serverNow()) && !isAreaClosed(save, area.id, data)
  const home = getRegion(data, mythicalHome(data, m.dex))?.name ?? ''
  const waiting = (save.events?.worldPending ?? []).some((p) => p.worldId === world.id)
  const state = caught
    ? waiting
      ? t('ui.world.myth.waits', { region: home })
      : t('ui.world.myth.home', { region: home })
    : open
      ? t('ui.world.myth.ready')
      : t('ui.world.myth.inArea', { area: area?.name ?? '' })
  return (
    <>
      <MythicalSquare
        world={world}
        caught={caught}
        state={state}
        onClick={() => {
          if (caught) return pushToast(state, 'info')
          if (area && open) return void travelTo(area)
          if (area) pushToast(lockReason(save, data, area), 'info')
        }}
      />
      {rows}
    </>
  )
}

/** What the main game's pages show inside a world (the events, the Day Care, Versus): why, and the way back. */
export function WorldAwayView({ world, kind, back, onBack }: { world: SmallWorld | null; kind: 'events' | 'main'; back: string; onBack: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <section className="pixel-panel flex flex-col items-center gap-3 p-4 text-center" style={worldVars(world)}>
      <WorldTag />
      <h2 className="m-0 text-[26px] leading-none">{t('ui.world.away.title', { world: worldName(world, data) })}</h2>
      <p className="copy m-0 text-muted">{t(kind === 'events' ? 'ui.world.away.events' : 'ui.world.away.main')}</p>
      <PixelButton variant="primary" onClick={onBack}>
        {t('ui.world.backTo', { region: back })}
      </PixelButton>
    </section>
  )
}

function WorldAway({ kind }: { kind: 'events' | 'main' }) {
  const { world } = useInWorld()
  const back = useBackName()
  return <WorldAwayView world={world} kind={kind} back={back} onBack={() => leaveSmallWorld()} />
}

/** The result card's line for the mythical caught: it left the world for its home region's Box (or waits for it). */
export function WorldMythicalCard({ dex, region, waiting }: { dex: number; region: string; waiting: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const name = data.species[dex]?.name ?? ''
  const home = getRegion(data, region)?.name ?? region
  return (
    <div className="w-won relative isolate flex items-center gap-3 overflow-hidden p-2 light-scope">
      <span className="ev-rays" aria-hidden />
      <SpriteImg dex={dex} shiny size={72} className="relative shrink-0" />
      <span className="relative grid gap-1 text-left">
        <b className="text-[22px] font-normal leading-none">{t('ui.world.won.title', { name })}</b>
        <small className="font-pixel-sm text-[15px] leading-tight">
          {waiting ? t('ui.world.won.waits', { region: home }) : t('ui.world.won.home', { region: home })}
        </small>
      </span>
    </div>
  )
}

/** A main-game page opened inside a world (its link, a reload): its title, and why it waits outside. */
export function WorldAwayPage({ title, kind }: { title: string; kind: 'events' | 'main' }) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <PageHead title={title} onBack={() => navigate('/home')} />
      <WorldAway kind={kind} />
    </div>
  )
}

/**
 * Home inside a world the content doesn't hold yet (it comes with the next answer from the server): wait, or go back
 * with the strip's button (one way back, not two).
 */
export function WorldWaiting() {
  const { t } = useT()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <WorldStrip />
      <section className="pixel-panel p-4 text-center">
        <p className="copy m-0 text-muted">{t('ui.world.loading')}</p>
      </section>
    </div>
  )
}
