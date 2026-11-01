// A progression raid's page (docs/24), /raid/:areaId/:dex: reached from its area (RAID on CONTINUE, the area's
// details), the Raids page's list on a phone, or the Pokédex. The page is the events' shape (docs/43 §5.11): the card on
// its area's picture as the stage; the panel — the lock or what's done, your team for it (from its region's Box, left
// on it for your friends), your group, this raid's rules folded — with START pinned at its foot. On PC the Raids page
// docks the same panel beside its list (`ProgressRaidPanel`). Giratina's and Darkrai's wear their worlds.
import { useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  getRegion,
  progressRaidKey,
  progressRaidOf,
  progressRaidReachable,
  progressRaidShiny,
  megaRaidLock,
  progressRaidState,
  portalModeOf,
  portalSkin,
  nightmareModeOf,
  timeRaceModeOf,
  progressRaidTeam,
  raidTeamCap,
  type GameData,
  type ProgressRaid,
  type RaidNpcOption,
  type TodayRaid,
} from '@/engine'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { pushToast, useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
import {
  emptySlots,
  ensureNpcOffer,
  groupOf,
  startProgressRaid,
  useRaidGroup,
  useRaidRun,
} from '@/store/raidBattle'
import { BallOdds, RaidCard } from './RaidPage'
import { RaidNpcPicker } from './RaidNpcPicker'
import { RaidRulesPanel } from './RaidRules'
import { RaidGroupSection, RaidTeamSection } from './RaidSetup'
import { RaidView } from './RaidView'
import { DistortionFx, DistortionGround } from '@/components/Portal'
import { cx } from '@/theme/util'
import { PortalRaidBanner } from './PortalRaid'
import { NightGround, NightmareFx } from '@/components/Nightmare'
import { NightmareRaidBanner } from './NightmareRaid'
import { EventDock, StagePanel } from './layout'

export function ProgressRaidScreen() {
  const { areaId = '', dex = '' } = useParams()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const run = useRaidRun((s) => s.run)
  const key = progressRaidKey(areaId, Number(dex))
  const raid = progressRaidOf(data, key)
  // A stale link, raids switched off for this player, or a raid of somewhere else than where they play (a small
  // world's from outside it, a region's from inside a world).
  if (!save || !raid || !progressRaidReachable(save, data, raid)) return <Navigate to="/home" replace />
  // The raid being fought takes the whole screen.
  if (run?.source.kind === 'progress' && run.source.key === key) return <RaidView key={run.id} run={run} />
  return <ProgressRaidPage raidKey={key} />
}

/** What a progression raid looks like: its world (portal, nightmare) and the card's data. */
export function progressRaidLook(data: GameData, raid: ProgressRaid, caught: boolean) {
  const area = data.areas.find((a) => a.id === raid.areaId)
  // A portal area's raid (docs/28) opens with its run won, not its rounds; Distortion World's wears its look, the
  // Stairway of Plates' (docs/61 §4.5) the usual one, its lock in its own words.
  const pm = portalModeOf(area, data)
  const portal = !!pm && portalSkin(pm) === 'distortion'
  const plates = !!pm && !portal
  // So does a nightmare area's (docs/30), once the player wakes up; it wears the moonlit night (docs/15 §29).
  const nightmare = !pm && !!nightmareModeOf(area, data)
  const card: TodayRaid = {
    day: '',
    dex: raid.dex,
    shiny: progressRaidShiny(data, raid),
    areaId: raid.areaId,
    caught,
    tries: 0,
  }
  return { portal, plates, nightmare, card, scope: portal ? 'dw-scope' : nightmare ? 'nm-scope' : undefined }
}

/** A progression raid's card on its area, in its world. */
export function ProgressRaidStage({ raidKey, plate }: { raidKey: string; plate?: ReactNode }) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const raid = progressRaidOf(data, raidKey)!
  const look = progressRaidLook(data, raid, progressRaidState(save, data, raid) === 'done')
  const card = (
    <RaidCard
      raid={look.card}
      msLeft={null}
      kind="progress"
      portal={look.portal}
      nightmare={look.nightmare}
      plated={!!plate}
    />
  )
  if (!plate) return card
  return (
    <div className="relative">
      {card}
      {plate}
    </div>
  )
}

/**
 * A progression raid's panel: what stands in the way (or that it's done), the team for it, the group, its rules
 * folded, and START at its foot. Its page's, and the Raids page's docked one on PC.
 */
export function ProgressRaidPanel({ raidKey, title }: { raidKey: string; title?: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const details = useDetails()
  const raid = progressRaidOf(data, raidKey)!
  const friends = groupOf(raidKey, useRaidGroup())
  const [offer, setOffer] = useState<RaidNpcOption[] | null>(null)
  const state = progressRaidState(save, data, raid)
  const { portal, plates, nightmare } = progressRaidLook(data, raid, state === 'done')
  // A Mega raid (docs/40): locked until its raid Pokémon is caught, then until Mega Evolution is earned in Kalos.
  const megaLock = raid.mega && state === 'locked' ? megaRaidLock(save, data, raid) : null
  const gemName = raid.mega ? (data.items[raid.mega.gem]?.name ?? raid.mega.gem) : ''
  const area = data.areas.find((a) => a.id === raid.areaId)!
  // A race area's raid (docs/61 §4.4): opened by the race won at its legend's gate.
  const raceGate = timeRaceModeOf(area, data)?.legends.find((l) => l.dex === raid.dex)?.type ?? null
  const region = getRegion(data, raid.region)?.name ?? raid.region
  const name = data.species[raid.dex]?.name ?? ''
  const need = emptySlots(friends)
  const source = { kind: 'progress' as const, key: raidKey }
  const go = (npcs: RaidNpcOption[] = []) => {
    setOffer(null)
    if (!startProgressRaid(raidKey, npcs, friends)) pushToast(t('ui.raid.cantStart'), 'bad')
  }
  const start = () => {
    if (!progressRaidTeam(save, data, raid).length) return pushToast(t('ui.raid.cantStart'), 'bad')
    if (need) setOffer(ensureNpcOffer(source))
    else go()
  }
  const me = { name: t('ui.raid.you'), look: avatarOf(playerAvatarId(save.player)).src }
  const group = [
    me,
    ...friends.filter((f) => f.team.length > 0).map((f) => ({ name: f.name, look: avatarOf(f.avatar).src })),
  ]
  return (
    <>
      {title && (
        // Docked beside the Raids page's list: which raid this panel is.
        <h2 className="m-0 grid gap-1 text-[26px] font-normal leading-none">
          {data.species[raid.dex]?.name}
          <small className="text-[18px] text-muted">{t('ui.raid.progress.where', { area: area.name, region })}</small>
        </h2>
      )}
      {state === 'locked' && (
        <div
          role="note"
          data-glitch={portal || nightmare || undefined}
          className="flex items-start gap-2.5 bg-gold-pale p-2.5 shadow-[inset_0_0_0_2px_#d99a1e]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-paper shadow-ring-line" aria-hidden>
            <PixelIcon name="lock" size={18} />
          </span>
          <span className="grid gap-0.5 leading-tight">
            <b className="text-[20px] font-normal leading-none">
              {t(
                megaLock
                  ? `ui.raid.mega.lock.${megaLock}.title`
                  : portal
                    ? 'ui.portal.raidLockTitle'
                    : plates
                      ? 'ui.plates.raidLockTitle'
                      : nightmare
                      ? 'ui.nightmare.raidLockTitle'
                      : raceGate
                        ? 'ui.timeRace.raidLockTitle'
                        : 'ui.raid.progress.lockTitle',
                { area: area.name, name: data.species[raid.mega?.base ?? 0]?.name ?? '' },
              )}
            </b>
            <small className="text-[16px] text-ink">
              {t(
                megaLock
                  ? `ui.raid.mega.lock.${megaLock}.text`
                  : portal
                    ? 'ui.portal.raidLockText'
                    : plates
                      ? 'ui.plates.raidLockText'
                      : nightmare
                      ? 'ui.nightmare.raidLockText'
                      : raceGate
                        ? 'ui.timeRace.raidLockText'
                        : 'ui.raid.progress.lockText',
                { name, gem: gemName, type: raceGate ? typeName(raceGate) : '' },
              )}
            </small>
          </span>
        </div>
      )}
      {state === 'done' && (
        <p role="status" className="m-0 bg-good-pale p-2.5 text-[18px] leading-tight shadow-[inset_0_0_0_2px_#34c97a]">
          {t(raid.mega ? 'ui.raid.mega.doneText' : 'ui.raid.progress.doneText', { name, gem: gemName })}
        </p>
      )}

      <RaidTeamSection source={source} portal={portal} nightmare={nightmare} />
      {state === 'open' && <RaidGroupSection source={source} portal={portal} nightmare={nightmare} />}
      <RaidRulesPanel dex={raid.dex} kind="progress" areaId={raid.areaId} />
      {state === 'open' && !raid.mega && details && <BallOdds dex={raid.dex} />}
      {state === 'open' && <p className="m-0 text-[16px] text-muted">{t('ui.raid.progress.tries')}</p>}

      {state === 'open' && (
        <EventDock className="mt-auto">
          <PixelButton variant="primary" size="lg" className={cx('w-full', (portal || nightmare) && 'sheen')} onClick={start}>
            {t('ui.events.raid.start')}
          </PixelButton>
        </EventDock>
      )}

      {offer && (
        <RaidNpcPicker
          open
          offer={offer}
          need={need}
          group={group}
          level={raidTeamCap(data, raid.dex, 'progress', raid.areaId)}
          boss={raid.dex}
          onBack={() => setOffer(null)}
          onStart={go}
          portal={portal ? raid.dex : undefined}
          nightmare={nightmare ? raid.dex : undefined}
        />
      )}
    </>
  )
}

function ProgressRaidPage({ raidKey }: { raidKey: string }) {
  const { t } = useT()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const raid = progressRaidOf(data, raidKey)!
  const state = progressRaidState(save, data, raid)
  const { portal, nightmare } = progressRaidLook(data, raid, state === 'done')
  const area = data.areas.find((a) => a.id === raid.areaId)!
  const region = getRegion(data, raid.region)?.name ?? raid.region

  const plate = (
    <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5 leading-normal">
      <button
        type="button"
        onClick={() => navigate(from ?? '/home')}
        aria-label={t('ui.common.back')}
        className="-mx-1.5 grid h-11 w-11 shrink-0 place-items-center"
      >
        <span
          aria-hidden
          className="block h-[18px] w-[14px] bg-ink [clip-path:polygon(0_50%,100%_0,100%_34%,50%_50%,100%_66%,100%_100%)]"
        />
      </button>
      <span className="grid min-w-0 gap-0.5">
        <h1 className="m-0 text-[24px] font-normal leading-none">{t(raid.mega ? 'ui.raid.mega.kicker' : 'ui.raid.progress.kicker')}</h1>
        <small className="truncate text-[16px] leading-none text-muted">{t('ui.raid.progress.where', { area: area.name, region })}</small>
      </span>
    </div>
  )
  // Shorter on a short phone, as the events' banner.
  const bannerH = '-mx-3 -mt-4 h-[96px] [@media(min-height:740px)]:h-[132px] lg:mx-0 lg:mt-0'

  return (
    // Giratina's raid, its area in portal mode (docs/15 §27): the Distortion World's violet night on the page and its
    // pop-ups, the portal turning as its banner, the void as its ground, the screen's tears and the UI's glitches.
    // Everything else is any progression raid's.
    <div
      className={cx('flex flex-col', portal && 'dw-scope', nightmare && 'nm-scope')}
      data-portal-raid={portal || undefined}
      data-nightmare-raid={nightmare || undefined}
    >
      {portal && (
        <>
          <DistortionGround />
          <DistortionFx />
        </>
      )}
      {nightmare && (
        <>
          <NightGround />
          <NightmareFx />
        </>
      )}
      <StagePanel
        head={
          portal ? (
            <PortalRaidBanner className={bannerH}>{plate}</PortalRaidBanner>
          ) : nightmare ? (
            <NightmareRaidBanner className={bannerH}>{plate}</NightmareRaidBanner>
          ) : // Any other raid has no banner: its card is already the area's picture, and the plate lies on it (the
          // user's call, 2026-10-27).
          undefined
        }
        stage={<ProgressRaidStage raidKey={raidKey} plate={portal || nightmare ? undefined : plate} />}
        panel={<ProgressRaidPanel raidKey={raidKey} />}
      />
    </div>
  )
}
