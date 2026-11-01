// A friend's trainer card (docs/16): drawn with the same pieces as your own — the blue card, their badges counted
// across every region — from their player card, as of their last cloud push. Friends only; REMOVE FRIEND ends it for both.
// Versus says the most trophies they ever held while the weekly league is on (docs/44 §10), as your own card does.
import { useEffect, useState, type ReactNode } from 'react'
import { linearAreas, regionCaseOf, regionSpecies, versusLeagueFor } from '@/engine'
import { getLang } from '@/i18n'
import { useT } from '@/i18n/react'
import { agoText } from '@/lib/ago'
import { avatarOf } from '@/lib/avatars'
import { fetchFriendProfile, friendError, removeFriend, type FriendProfile } from '@/lib/friends'
import { pushToast, useGame } from '@/store/game'
import { TeamIcons } from '../BoardRow'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { Sheet } from '../Sheet'
import { CardFrame, CardTeam, Stat, useLeagueBest } from '../TrainerCard'
import { TrainerLook } from '../TrainerLook'
import { TrophyCount } from '../TrophyCount'
import { TheirTrades } from '../trades/TheirTrades'
import { useAddText } from './AddFriendModal'
import { TrainerName } from '../TrainerName'
import { FriendStreakBlock } from './Friendship'
import { friendshipWaits, utcDay } from '@/engine'
import { useFriendship } from '@/store/friendship'

type Load = { state: 'loading' } | { state: 'ready'; profile: FriendProfile } | { state: 'gone' } | { state: 'error'; why: string }

const dateText = (ms: number) => new Date(ms).toLocaleDateString(getLang(), { day: 'numeric', month: 'short', year: 'numeric' })

export function FriendProfileSheet({
  userId,
  name,
  onClose,
}: {
  /** The friend to show; null closes the sheet. */
  userId: string | null
  /** Their name, shown while the card loads. */
  name?: string
  onClose: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  // Your friendship streak with them (docs/60), while it's on for you in the main game.
  const fship = useFriendship((s) => s.status)
  const fshipOn = useGame((s) => !!s.save && [null, 'world'].includes(friendshipWaits(s.save, s.data))) && !!fship
  // The league is the main game's (Extreme keeps Versus as it was), so the realm being played decides, as for your card.
  const league = useGame((s) => !!s.save && versusLeagueFor(s.save, s.data))
  const best = useLeagueBest(!!userId && league, userId ?? undefined)
  const errorText = useAddText()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    let live = true
    setLoad({ state: 'loading' })
    fetchFriendProfile(userId)
      .then((profile) => live && setLoad(profile ? { state: 'ready', profile } : { state: 'gone' }))
      .catch((err) => live && setLoad({ state: 'error', why: errorText(friendError(err)) }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const profile = load.state === 'ready' ? load.profile : null
  const shownName = profile?.name ?? name ?? ''
  const now = Date.now()
  const here = profile?.regions.find((r) => r.region === profile.region) ?? null
  const species = profile?.region ? regionSpecies(data, profile.region) : null
  const chain = profile?.region ? linearAreas(data, profile.region) : []
  const area = profile?.areaId ? data.areas.find((a) => a.id === profile.areaId) : undefined
  // Badges won in every region, as the game knows them (a region or gym since removed doesn't count).
  const badges = (profile?.regions ?? []).reduce(
    (n, r) => n + (regionCaseOf(data, r.region, r.badges, r.endgame)?.earned ?? 0),
    0,
  )
  // With the league on, their high mark; a 0 from a friend who never had a Versus team reads as nothing to show.
  let versusValue: ReactNode = '—'
  if (league) {
    if (best != null && (best > 0 || profile?.versus)) versusValue = <TrophyCount n={best} size={13} inherit />
  } else if (profile?.versus) {
    versusValue = t('ui.card.versusRecord', {
      won: profile.versus.attackWins,
      held: profile.versus.defenseWins,
    })
  }

  const remove = async () => {
    if (!userId || busy) return
    setBusy(true)
    try {
      await removeFriend(userId)
      pushToast(t('ui.friends.removed', { name: shownName }), 'info')
      setConfirm(false)
      onClose()
    } catch (err) {
      pushToast(errorText(friendError(err)), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={!!userId}
        onClose={onClose}
        title={shownName}
        sub={profile?.since ? t('ui.friends.since', { date: dateText(profile.since) }) : undefined}
        footer={
          profile && (
            <div className="flex justify-end">
              <PixelButton size="sm" variant="danger" onClick={() => setConfirm(true)}>
                {t('ui.friends.remove')}
              </PixelButton>
            </div>
          )
        }
      >
        {load.state === 'loading' && <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>}
        {load.state === 'gone' && <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.friends.gone')}</p>}
        {load.state === 'error' && <p className="m-0 p-4 text-center text-[20px] text-danger">{load.why}</p>}
        {profile && (
          <div className="flex flex-col gap-3">
            <CardFrame
              label={t('ui.profile.title')}
              note={profile.updatedAt ? t('ui.friends.played', { when: agoText(profile.updatedAt, now) }) : undefined}
            >
              <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2.5 px-1">
                <TrainerLook src={avatarOf(profile.avatar).src} w={96} h={124} zoom={2} className="bg-paper shadow-ring" />
                <div className="grid min-w-0 gap-1.5">
                  <b className="min-w-0 truncate text-[26px] font-normal leading-none">
                    <TrainerName name={profile.name} rich={profile.rich} />
                  </b>
                  {!profile.region ? (
                    <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.friends.noGame')}</p>
                  ) : (
                    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
                      <Stat
                        label={t('ui.friends.nowIn')}
                        value={[data.regions.find((r) => r.id === profile.region)?.name ?? profile.region, area?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      {here && species && (
                        <Stat label={t('ui.card.dex')} value={`${here.pokedex}/${species.size || data.speciesList.length}`} />
                      )}
                      {here && <Stat label={t('ui.card.best')} value={t('ui.common.level.short', { n: here.maxLevel })} />}
                      {here && chain.length > 0 && (
                        <Stat
                          label={t('ui.card.areas')}
                          value={`${chain.filter((a) => here.progress[a.id]?.cleared).length}/${chain.length}`}
                        />
                      )}
                      <Stat label={t('ui.card.badges')} value={String(badges)} />
                      {here && <Stat label={t('ui.card.shinies')} value={String(here.shinies)} />}
                      <Stat label={t(league ? 'ui.card.versusBest' : 'ui.card.versus')} value={versusValue} />
                    </dl>
                  )}
                </div>
              </div>
              {here && here.team.length > 0 && <CardTeam team={here.team} label={t('ui.board.theirTeam', { name: profile.name })} />}
            </CardFrame>

            {fshipOn && (
              <FriendStreakBlock
                s={fship?.streaks.find((x) => x.friend === profile.userId)}
                today={fship?.day || utcDay(Date.now())}
                name={profile.name}
              />
            )}

            {profile.versus && profile.versus.team.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="m-0 text-[24px] font-normal leading-none">{t('ui.friends.versusTeam')}</h3>
                <div className="flex items-center gap-2 bg-paper py-1.5 pl-3 pr-2 shadow-ring-line">
                  <TeamIcons team={profile.versus.team} owner={profile.name} size={40} spaced />
                </div>
              </section>
            )}
            {userId && <TheirTrades userId={userId} />}
          </div>
        )}
      </Sheet>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('ui.friends.removeTitle', { name: shownName })}>
        <p className="copy mb-4 text-lg">{t('ui.friends.removeBody', { name: shownName })}</p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirm(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" disabled={busy} onClick={() => void remove()}>
            {t('ui.friends.remove')}
          </PixelButton>
        </div>
      </Modal>
    </>
  )
}
