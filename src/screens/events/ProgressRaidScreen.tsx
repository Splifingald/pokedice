// A progression raid's page (docs/24), /raid/:areaId/:dex: reached from its area (RAID on CONTINUE, the area's
// details), the Raids page's list or the Pokédex. The card on its area's picture; START once the area is completed (the
// lock and what to complete before); your team for it, from its region's Box, left on it for your friends; your group
// (the friends who left a team on it); the ball odds. A caught one says so and still takes a team.
import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  getRegion,
  progressRaidKey,
  progressRaidOf,
  progressRaidReachable,
  progressRaidShiny,
  progressRaidState,
  progressRaidTeam,
  raidTeamCap,
  type RaidNpcOption,
  type TodayRaid,
} from '@/engine'
import { AreaStrip } from '@/components/AreaStrip'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { useT } from '@/i18n/react'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { pushToast, useGame } from '@/store/game'
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
import { RaidGroupSection, RaidTeamSection } from './RaidSetup'
import { RaidView } from './RaidView'

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

function ProgressRaidPage({ raidKey }: { raidKey: string }) {
  const { t } = useT()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const raid = progressRaidOf(data, raidKey)!
  const friends = groupOf(raidKey, useRaidGroup())
  const [offer, setOffer] = useState<RaidNpcOption[] | null>(null)
  const state = progressRaidState(save, data, raid)
  const area = data.areas.find((a) => a.id === raid.areaId)!
  const region = getRegion(data, raid.region)?.name ?? raid.region
  const name = data.species[raid.dex]?.name ?? ''
  const card: TodayRaid = {
    day: '',
    dex: raid.dex,
    shiny: progressRaidShiny(data, raid),
    areaId: raid.areaId,
    caught: state === 'done',
    tries: 0,
  }
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
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
      <div className="relative -mx-3 -mt-4 overflow-hidden bg-night leading-[0] shadow-[0_2px_0_rgb(var(--c-edge))]">
        <AreaStrip area={area} h={132} className="h-[132px] w-full" />
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
            <h1 className="m-0 text-[24px] font-normal leading-none">{t('ui.raid.progress.kicker')}</h1>
            <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">
              {t('ui.raid.progress.where', { area: area.name, region })}
            </small>
          </span>
        </div>
      </div>

      <RaidCard raid={card} msLeft={null} kind="progress" />

      {state === 'locked' && (
        <div
          role="note"
          className="flex items-start gap-2.5 bg-gold-pale p-2.5 shadow-[inset_0_0_0_2px_#d99a1e]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center bg-paper shadow-ring-line" aria-hidden>
            <PixelIcon name="lock" size={18} />
          </span>
          <span className="grid gap-0.5 leading-tight">
            <b className="text-[19px] font-normal leading-none">
              {t('ui.raid.progress.lockTitle', { area: area.name })}
            </b>
            <small className="font-pixel-sm text-[15px] text-ink">
              {t('ui.raid.progress.lockText', { name })}
            </small>
          </span>
        </div>
      )}
      {state === 'done' && (
        <p
          role="status"
          className="m-0 bg-good-pale p-2.5 text-[18px] leading-tight shadow-[inset_0_0_0_2px_#34c97a]"
        >
          {t('ui.raid.progress.doneText', { name })}
        </p>
      )}
      {state === 'open' && (
        <>
          <PixelButton variant="primary" size="lg" className="w-full" onClick={start}>
            {t('ui.events.raid.start')}
          </PixelButton>
          <p className="m-0 text-center font-pixel-sm text-[15px] text-muted">
            {t('ui.raid.progress.tries')}
          </p>
        </>
      )}

      <RaidTeamSection source={source} />
      {state === 'open' && <RaidGroupSection source={source} />}
      {state === 'open' && <BallOdds dex={raid.dex} />}

      {offer && (
        <RaidNpcPicker
          open
          offer={offer}
          need={need}
          group={group}
          level={raidTeamCap(data, raid.dex, 'progress')}
          onBack={() => setOffer(null)}
          onStart={go}
        />
      )}
    </div>
  )
}
