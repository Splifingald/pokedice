// Friend Battles' page (docs/65; docs/15 §50), `/battles`, from the Friends page's card: the rules the first time (a
// card at the top), a match still on, your record, each friend's head to head and the last battles, INFO at the foot.
// A challenge starts from a friend's BATTLE button on the Friends page.
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { friendBattlesFor, friendBattlesRulesDue, isExtreme } from '@/engine'
import { AccountButton } from '@/components/AccountButton'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { RulesCard } from '@/components/RulesCard'
import { TrainerLook } from '@/components/TrainerLook'
import { FriendBattleRulesModal, ModeTag, useFriendBattleRules } from '@/components/pvp/FriendBattleBits'
import type { TVars } from '@/i18n'
import { useT } from '@/i18n/react'
import { agoText } from '@/lib/ago'
import { avatarOf } from '@/lib/avatars'
import { isLive } from '@/lib/pvp'
import { useGame } from '@/store/game'
import { foeOf, loadHome, seeFriendBattlesRules, usePvp } from '@/store/pvp'
import { cx } from '@/theme/util'

export function BattlesScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth.status)
  const home = usePvp((s) => s.home)
  const match = usePvp((s) => s.match)
  const rules = useFriendBattleRules()
  const [info, setInfo] = useState(false)
  const [now] = useState(() => Date.now())

  const open = friendBattlesFor(save, data)
  useEffect(() => {
    if (open) void loadHome()
  }, [open])

  if (!save) return null
  if (!open && !isExtreme(save)) return <Navigate to="/friends" replace />

  const head = <PageHead icon="vs" title={t('ui.pvp.title')} onBack={() => navigate('/friends')} />
  const note = (text: string, extra?: ReactNode) => (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      {head}
      <div className="flex flex-col items-center gap-3 bg-paper px-3.5 py-4 text-center shadow-card">
        <PixelIcon name="vs" size={48} />
        <p className="m-0 text-[20px] leading-[1.15]">{text}</p>
        {extra}
      </div>
    </div>
  )
  if (isExtreme(save)) return note(t('ui.pvp.extreme'))
  if (auth === 'signed_out') return note(t('ui.pvp.signedOut'), <AccountButton />)

  const wins = home?.records.reduce((n, r) => n + r.wins, 0) ?? 0
  const losses = home?.records.reduce((n, r) => n + r.losses, 0) ?? 0
  const live = match && isLive(match.state) ? match : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-4">
      {head}
      {friendBattlesRulesDue(save, data) && (
        <RulesCard title={t('ui.pvp.title')} icon="vs" rules={rules} onDone={seeFriendBattlesRules} />
      )}

      {live && (
        <div className="flex items-center gap-2.5 bg-cream p-2.5 shadow-card-gold">
          <TrainerLook src={avatarOf(foeOf(live).avatar).src} w={44} h={48} />
          <span className="min-w-0 flex-1 text-[20px] leading-tight">
            {live.state === 'invited' ? t('ui.pvp.waitingFor', { name: foeOf(live).name }) : t('ui.pvp.onWith', { name: foeOf(live).name })}
          </span>
          <PixelButton variant="primary" size="sm" onClick={() => navigate('/battles/live')}>
            {t('ui.pvp.backTo')}
          </PixelButton>
        </div>
      )}

      <section aria-labelledby="pvp-record" className="flex flex-col gap-1.5">
        <h2 id="pvp-record" className="m-0 flex items-center justify-between text-[24px] font-normal leading-none">
          {t('ui.pvp.record')}
          <span className="flex gap-1.5 font-pixel-sm text-[16px]">
            <span className="bg-good-pale px-1.5 text-good">{t('ui.pvp.winsShort', { n: wins })}</span>
            <span className="light-scope bg-crimson px-1.5 text-white">{t('ui.pvp.lossesShort', { n: losses })}</span>
          </span>
        </h2>
        {!home && <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>}
        {home && home.history.length === 0 && (
          <p className="m-0 bg-paper px-3.5 py-4 text-center text-[18px] leading-[1.2] text-muted shadow-ring-line">
            {t('ui.pvp.noBattles')}
          </p>
        )}
        {home && home.history.length > 0 && (
          <ul className="m-0 grid list-none gap-1.5 p-0 md:grid-cols-2">
            {home.history.map((h) => {
              const rec = home.records.find((r) => r.id === h.foe.id)
              return (
                <li key={h.id} className="flex items-center gap-2 bg-paper p-2 shadow-ring-line">
                  <TrainerLook src={avatarOf(h.foe.avatar).src} w={40} h={44} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <b className="truncate text-[20px] font-normal leading-none">{t('ui.pvp.vs', { name: h.foe.name })}</b>
                      <ModeTag mode={h.mode} />
                    </span>
                    <small className="truncate font-pixel-sm text-[16px] text-muted">
                      {agoText(h.at, now)}
                      {rec && ` · ${headToHead(t, rec.wins, rec.losses, h.foe.name)}`}
                    </small>
                  </span>
                  <span
                    className={cx(
                      'text-[22px] uppercase leading-none',
                      h.result === 'win' ? 'text-good' : h.result === 'loss' ? 'text-danger' : 'text-muted',
                    )}
                  >
                    {t(`ui.pvp.result.${h.result}`)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-col items-center gap-2 bg-sky p-3 text-center shadow-[inset_0_0_0_2px_rgb(var(--c-sky-line))]">
        <p className="copy m-0 text-[18px]">{t('ui.pvp.howToStart')}</p>
        <PixelButton size="sm" onClick={() => navigate('/friends')}>
          {t('ui.pvp.toFriends')}
        </PixelButton>
      </div>
      <InfoButton name={t('ui.pvp.title')} onClick={() => setInfo(true)} />
      <FriendBattleRulesModal open={info} onClose={() => setInfo(false)} />
    </div>
  )
}

/** "You lead 4–3", "Kiro leads 1–0", "Tied 2–2". */
export function headToHead(
  t: (k: string, v?: TVars) => string,
  wins: number,
  losses: number,
  name: string,
): string {
  if (wins > losses) return t('ui.pvp.youLead', { a: wins, b: losses })
  if (losses > wins) return t('ui.pvp.theyLead', { name, a: losses, b: wins })
  return t('ui.pvp.tied', { a: wins, b: losses })
}
