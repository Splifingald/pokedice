// The Underground's team (docs/31 §3), on its page: three seats, one orb colour each, dealt at random on joining; and
// the sheet to manage it: invitations to answer, friends to invite, the invitations sent, leaving. Solo (or signed
// out), every orb is the player's. The server decides every seat (store/ugTeams.ts).
import { useEffect, useState } from 'react'
import { ORB_COLOURS, type UgTeam } from '@/engine'
import { AccountButton } from '@/components/AccountButton'
import { PixelButton } from '@/components/PixelButton'
import { Sheet } from '@/components/Sheet'
import { SheetSection } from '@/components/SheetSection'
import { TrainerLook } from '@/components/TrainerLook'
import { OrbArt, UgNote } from '@/components/Underground'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { loadFriendList, useFriends } from '@/lib/friends'
import { pushToast, useGame } from '@/store/game'
import { ugAnswer, ugCancelInvite, ugInvite, ugLeave, useUgTeams } from '@/store/ugTeams'
import { useUgTeam } from '@/store/underground'
import { cx } from '@/theme/util'

/** The three seats: who holds each colour (you, a friend, or free), and the line under them. */
export function UgTeamSeats({ team }: { team: UgTeam | null }) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none gap-2 p-0">
        {ORB_COLOURS.map((c) => {
          const seat = team?.seats[c]
          const me = team?.me === c
          return (
            <li
              key={c}
              className={cx(
                'flex min-w-0 flex-1 flex-col items-center gap-1 p-1.5',
                seat ? 'bg-paper shadow-card' : 'bg-well shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
              )}
            >
              <OrbArt colour={c} px={22} className={cx(!seat && 'opacity-50')} />
              <span className="max-w-full truncate text-[18px] leading-none">
                {me ? t('ui.ug.you') : (seat?.name ?? (team ? t('ui.ug.freeSeat') : '—'))}
              </span>
              <span className="font-pixel-sm text-[14px] text-muted">{t(`ui.ug.colour.${c}`)}</span>
            </li>
          )
        })}
      </ul>
      <UgNote>{team ? t('ui.ug.teamNote') : t('ui.ug.teamSolo')}</UgNote>
    </div>
  )
}

/** A server refusal, in words. */
function useRefusal(): (code: string | null) => boolean {
  const { t } = useT()
  return (code) => {
    if (!code) return true
    const known = [
      'ug_team_full',
      'ug_not_friends',
      'ug_too_many_invites',
      'ug_no_invite',
      'ug_closed',
      'signed_out',
    ]
    pushToast(t(`ui.ug.err.${known.includes(code) ? code : 'failed'}`), 'bad')
    return false
  }
}

/** The team's sheet: invitations to answer, the seats, friends to invite (or the invitation to take back), leaving. */
export function UgTeamSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const team = useUgTeam((s) => s.team)
  const { invites, sent, state } = useUgTeams()
  const friends = useFriends((s) => s.list)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const refused = useRefusal()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open && signedIn) void loadFriendList()
  }, [open, signedIn])
  const run = async (fn: () => Promise<string | null>, done?: string) => {
    setBusy(true)
    const ok = refused(await fn())
    setBusy(false)
    if (ok && done) pushToast(done, 'good')
  }
  const seated = new Set(Object.values(team?.seats ?? {}).map((s) => s!.id))
  const invited = new Set(sent.map((s) => s.id))
  const full = !!team && ORB_COLOURS.every((c) => team.seats[c])

  return (
    <Sheet open={open} onClose={onClose} title={t('ui.ug.teamTitle')}>
      {!signedIn ? (
        <div className="flex flex-col gap-3">
          <UgNote>{t('ui.ug.signIn')}</UgNote>
          <AccountButton size="sm" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <UgTeamSeats team={team} />

          {invites.length > 0 && (
            <SheetSection title={t('ui.ug.invitations')}>
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {invites.map((i) => (
                  <li key={i.team} className="flex items-center gap-2 bg-cream p-1.5 shadow-card-gold">
                    <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                      <b className="truncate text-[19px] font-normal leading-none">{i.name}</b>
                      <small className="font-pixel-sm text-[14px] text-muted">
                        {t('ui.ug.wantsYou', { n: i.seats })}
                      </small>
                    </span>
                    <PixelButton size="sm" disabled={busy} onClick={() => run(() => ugAnswer(i.team, false))}>
                      {t('ui.ug.decline')}
                    </PixelButton>
                    <PixelButton
                      size="sm"
                      variant="success"
                      disabled={busy}
                      onClick={() => run(() => ugAnswer(i.team, true), t('ui.ug.joined', { name: i.name }))}
                    >
                      {t('ui.ug.join')}
                    </PixelButton>
                  </li>
                ))}
              </ul>
              {team && <UgNote>{t('ui.ug.joinLeaves')}</UgNote>}
            </SheetSection>
          )}

          <SheetSection title={t('ui.ug.inviteTitle')} hint={full ? t('ui.ug.teamFull') : undefined}>
            {friends == null ? (
              <UgNote>{t('ui.common.loading')}</UgNote>
            ) : friends.length === 0 ? (
              <UgNote>{t('ui.ug.noFriends')}</UgNote>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {friends.map((f) => {
                  const inTeam = seated.has(f.userId)
                  const waiting = invited.has(f.userId)
                  return (
                    <li
                      key={f.userId}
                      className="flex items-center gap-2 bg-paper py-1 pl-1.5 pr-1.5 shadow-card"
                    >
                      <TrainerLook src={avatarOf(f.avatar).src} w={36} h={40} />
                      <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                        <b className="truncate text-[19px] font-normal leading-none">{f.name}</b>
                        <small className="font-pixel-sm text-[14px] text-muted">
                          {inTeam
                            ? t('ui.ug.inYourTeam')
                            : waiting
                              ? t('ui.ug.invitedWaiting')
                              : t('ui.ug.canInvite')}
                        </small>
                      </span>
                      {!inTeam &&
                        (waiting ? (
                          <PixelButton
                            size="sm"
                            disabled={busy}
                            onClick={() => run(() => ugCancelInvite(f.userId))}
                          >
                            {t('ui.ug.cancelInvite')}
                          </PixelButton>
                        ) : (
                          <PixelButton
                            size="sm"
                            variant="success"
                            disabled={busy || full}
                            onClick={() =>
                              run(() => ugInvite(f.userId), t('ui.ug.invited', { name: f.name }))
                            }
                          >
                            {t('ui.ug.invite')}
                          </PixelButton>
                        ))}
                    </li>
                  )
                })}
              </ul>
            )}
          </SheetSection>

          {team && (
            <PixelButton
              variant="danger"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => run(() => ugLeave(), t('ui.ug.left'))}
            >
              {t('ui.ug.leaveTeam')}
            </PixelButton>
          )}
          {state === 'error' && <UgNote>{t('ui.ug.err.failed')}</UgNote>}
        </div>
      )}
    </Sheet>
  )
}

export function UgTeamPanel() {
  const { t } = useT()
  const team = useUgTeam((s) => s.team)
  const invites = useUgTeams((s) => s.invites.length)
  const [open, setOpen] = useState(false)
  return (
    <section aria-labelledby="ug-team" className="pixel-panel flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ug-team" className="m-0 text-[24px] font-normal leading-none">
          {t('ui.ug.team')}
        </h2>
        <PixelButton size="sm" variant={invites ? 'gold' : 'secondary'} onClick={() => setOpen(true)}>
          {invites ? t('ui.ug.invitesWaiting', { n: invites }) : team ? t('ui.ug.manage') : t('ui.ug.teamUp')}
        </PixelButton>
      </div>
      <UgTeamSeats team={team} />
      <UgTeamSheet open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
