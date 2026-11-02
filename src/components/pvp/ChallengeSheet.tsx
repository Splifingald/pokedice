// Challenge a friend (docs/65; docs/15 §50): from their BATTLE button on the Friends page. The two modes as cards
// (Classic: your Versus team, unseen; Draft: the coin, one pick each, the shield), the fight's rules in chips, and
// SEND CHALLENGE. Sent, the game goes to the match's page to wait for the answer.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { friendBattlesConfig, PVP_LEVELS, type PvpLevel, type PvpMode } from '@/engine'
import { Sheet } from '@/components/Sheet'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { TrainerLook } from '@/components/TrainerLook'
import type { TVars } from '@/i18n'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { challenge, usePvp } from '@/store/pvp'
import { TicketCount } from './FriendBattleBits'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

export interface ChallengeTarget {
  id: string
  name: string
  avatar: string
  /** "You lead 4–3", or null when never fought. */
  record: string | null
}

/** A refusal, said for this friend and mode. */
export function challengeError(t: (k: string, v?: TVars) => string, code: string, name: string, mode: PvpMode) {
  switch (code) {
    case 'pvp_offline':
      return t('ui.pvp.err.offline', { name })
    case 'pvp_friend_busy':
      return t('ui.pvp.err.friendBusy', { name })
    case 'pvp_busy':
      return t('ui.pvp.err.busy')
    case 'pvp_no_team':
      return t(mode === 'classic' ? 'ui.pvp.err.noTeam' : 'ui.pvp.err.noDraft')
    case 'pvp_friend_no_team':
      return t(mode === 'classic' ? 'ui.pvp.err.friendNoTeam' : 'ui.pvp.err.friendNoDraft', { name })
    case 'pvp_level_off':
      return t('ui.pvp.err.failed')
    case 'pvp_no_ticket':
      return t('ui.pvp.err.noTicket')
    case 'pvp_friend_no_ticket':
      return t('ui.pvp.err.friendNoTicket', { name })
    default:
      return t('ui.pvp.err.failed')
  }
}

export function ChallengeSheet({ target, onClose }: { target: ChallengeTarget | null; onClose: () => void }) {
  const { t } = useT()
  const navigate = useNavigate()
  const cfg = friendBattlesConfig(useGame((s) => s.data))
  const modes = (['classic', 'draft'] as const).filter((m) => cfg[m])
  const [mode, setMode] = useState<PvpMode>(cfg.draft ? 'draft' : 'classic')
  // The fight's level (docs/65 §16): Lv.50, or Lv.100 while the admin offers it.
  const [level, setLevel] = useState<PvpLevel>(50)
  const lv = cfg.lv100 ? level : 50
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Battle tickets (docs/65 §15): none held, nothing to send (null: a database before 0132 counts none).
  const tickets = usePvp((s) => s.home?.tickets ?? null)
  const noTicket = tickets != null && tickets.balance < 1
  const chosen = modes.includes(mode) ? mode : (modes[0] ?? 'classic')
  const send = async () => {
    if (!target || busy) return
    setBusy(true)
    setError(null)
    const code = await challenge(target.id, chosen, lv)
    setBusy(false)
    if (code) return setError(challengeError(t, code, target.name, chosen))
    onClose()
    navigate('/battles/live')
  }
  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={target ? t('ui.pvp.challengeTitle', { name: target.name }) : ''}
      sub={target?.record ?? undefined}
      footer={
        <div className="grid gap-1.5">
          <PixelButton
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy || !modes.length || noTicket}
            onClick={() => void send()}
          >
            {t('ui.pvp.send')}
          </PixelButton>
          <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">
            {t('ui.pvp.answerWithin', { name: target?.name ?? '', n: Math.round(cfg.expiry / 60) || 1 })}
          </p>
        </div>
      }
    >
      {target && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-14 w-14 shrink-0 place-items-center bg-sky shadow-ring">
              <TrainerLook src={avatarOf(target.avatar).src} w={48} h={52} />
            </span>
            <span className="font-pixel-sm text-[16px] text-muted">{t('ui.pvp.pickMode')}</span>
          </div>
          <div role="radiogroup" aria-label={t('ui.pvp.pickMode')} className="grid gap-2">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={chosen === m}
                onClick={() => setMode(m)}
                className={cx(
                  'flex items-start gap-3 p-3 pb-4 text-left',
                  chosen === m ? 'bg-cream shadow-card-gold' : 'bg-paper shadow-card',
                )}
              >
                <PixelIcon name={m === 'draft' ? 'dice' : 'ball'} size={36} className="shrink-0" />
                <span className="grid gap-1">
                  <b className="flex items-center gap-2 text-[24px] font-normal leading-none">
                    {t(m === 'draft' ? 'ui.pvp.mode.draftName' : 'ui.pvp.mode.classicName')}
                    {chosen === m && <PixelIcon name="check" size={18} />}
                  </b>
                  <span className="copy text-[18px] leading-tight">
                    {t(m === 'draft' ? 'ui.pvp.mode.draftText' : 'ui.pvp.mode.classicText')}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {cfg.lv100 && (
            <div className="grid gap-1.5">
              <span className="font-pixel-sm text-[16px] text-muted">{t('ui.pvp.pickLevel')}</span>
              <div role="radiogroup" aria-label={t('ui.pvp.pickLevel')} className="grid grid-cols-2 gap-2">
                {PVP_LEVELS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={lv === n}
                    onClick={() => setLevel(n)}
                    className={cx(
                      'grid gap-0.5 p-2 pb-2.5 text-left',
                      lv === n ? 'bg-cream shadow-card-gold' : 'bg-paper shadow-card',
                    )}
                  >
                    <b className="flex items-center gap-1.5 text-[22px] font-normal leading-none">
                      {t('ui.common.level.short', { n })}
                      {lv === n && <PixelIcon name="check" size={16} />}
                    </b>
                    <span className="font-pixel-sm text-[16px] leading-tight text-muted">
                      {t(n === 100 ? 'ui.pvp.level100' : 'ui.pvp.level50')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[t('ui.pvp.chip.size'), t('ui.common.level.short', { n: lv }), t('ui.pvp.chip.items')].map((k) => (
              <span key={k} className="bg-paper px-2 py-0.5 font-pixel-sm text-[16px] shadow-ring-thin">
                {k}
              </span>
            ))}
          </div>
          {tickets && (
            <div className={cx('flex items-center gap-2 p-2', noTicket ? 'bg-rose shadow-ring-line' : 'bg-sky')}>
              <span className="min-w-0 flex-1 font-pixel-sm text-[16px] leading-tight">
                {noTicket ? t('ui.ticket.none') : t('ui.ticket.cost')}
              </span>
              <TicketCount n={tickets.balance} size="sm" />
            </div>
          )}
          {error && (
            <p role="alert" className="m-0 bg-rose px-3 py-2 text-[18px] leading-tight text-danger shadow-ring-line">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}
