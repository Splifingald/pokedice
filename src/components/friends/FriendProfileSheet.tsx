// A friend's trainer card (docs/16): drawn with the same pieces as your own — the blue card, the badge cases — from
// their player card, as of their last cloud push. Friends only; REMOVE FRIEND ends it for both.
import { useEffect, useState } from 'react'
import { linearAreas, regionCaseOf, regionSpecies, type RegionCase } from '@/engine'
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
import { BadgeCases, CardFrame, CardTeam, Stat } from '../TrainerCard'
import { TrainerLook } from '../TrainerLook'
import { useAddText } from './AddFriendModal'

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
  // The badge cases in the regions' own order.
  const cases: RegionCase[] = profile
    ? data.regions
        .map((rg) => profile.regions.find((r) => r.region === rg.id))
        .filter((r) => !!r)
        .map((r) => regionCaseOf(data, r.region, r.badges, r.endgame))
        .filter((c): c is RegionCase => !!c)
    : []

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
                  <b className="min-w-0 truncate text-[26px] font-normal leading-none">{profile.name}</b>
                  {!profile.region ? (
                    <p className="m-0 font-pixel-sm text-[15px] text-muted">{t('ui.friends.noGame')}</p>
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
                      {here && <Stat label={t('ui.card.shinies')} value={String(here.shinies)} />}
                      <Stat
                        label={t('ui.card.versus')}
                        value={
                          profile.versus
                            ? t('ui.card.versusRecord', { won: profile.versus.attackWins, held: profile.versus.defenseWins })
                            : '—'
                        }
                      />
                    </dl>
                  )}
                </div>
              </div>
              {here && here.team.length > 0 && <CardTeam team={here.team} label={t('ui.board.theirTeam', { name: profile.name })} />}
            </CardFrame>

            <BadgeCases regions={cases} />

            {profile.versus && profile.versus.team.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="m-0 text-[24px] font-normal leading-none">{t('ui.friends.versusTeam')}</h3>
                <div className="flex items-center gap-2 bg-paper py-1.5 pl-3 pr-2 shadow-ring-line">
                  <TeamIcons team={profile.versus.team} owner={profile.name} size={40} />
                </div>
              </section>
            )}
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
