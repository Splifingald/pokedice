// The player cap's waiting line (docs/74): when the game is full, the player waits here, their place in line said and
// kept up to date, and gets in by themselves when their turn comes. At start it is the whole page (nothing of the game
// has loaded); sent back for being idle, it covers the game as a pop-up that can't be closed, the fight left as it was.
// Its rules are behind INFO at its foot (docs/15 §20). The server decides everything (migration 0157): this shows it.
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { playerCapOf } from '@/engine'
import { useT } from '@/i18n/react'
import { getSupabase } from '@/lib/supabase'
import { useMotion } from '@/lib/motion'
import { startCcu, useCcu, type CcuView } from '@/store/ccu'
import { useGame } from '@/store/game'
import { signIn, startBackgroundServices } from '@/store/sync'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PageLoading } from './PageLoading'
import { PixelButton } from './PixelButton'
import { InfoButton, RulesModal, type RuleRow } from './RulesModal'

/** The cap's rules, with the numbers the server answered (else the game's settings). */
function usePlayerCapRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const answeredCap = useCcu((s) => s.cap)
  const answeredMinutes = useCcu((s) => s.idleMinutes)
  const cfg = playerCapOf(data)
  const cap = answeredCap ?? cfg.cap
  const minutes = answeredCap != null ? answeredMinutes : cfg.idleMinutes
  return [
    { icon: 'user', title: t('ui.ccu.rule.capTitle', { cap }), text: t('ui.ccu.rule.capText') },
    { icon: 'ball', title: t('ui.ccu.rule.tabTitle'), text: t('ui.ccu.rule.tabText') },
    { icon: 'clock', title: t('ui.ccu.rule.idleTitle', { minutes }), text: t('ui.ccu.rule.idleText') },
  ]
}

export function PlayerCapRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.ccu.title')}
      picture={<LineBanner />}
      icon="user"
      rules={usePlayerCapRules()}
    />
  )
}

/** The rules' banner, drawn in code: a line of Poké Balls on the night ground, the first one lit. */
function LineBanner() {
  return (
    <div className="flex h-full items-center justify-center gap-3 bg-night" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cx(i > 0 && 'opacity-50')}>
          <PixelIcon name="ball" size={i === 0 ? 48 : 32} />
        </span>
      ))}
    </div>
  )
}

export interface QueueViewProps {
  position: number | null
  queueLength: number | null
  idle: boolean
  idleMinutes: number
  /** Signed in already: no sign-in line. */
  signedIn: boolean
  onSignIn: () => void
  onInfo: () => void
  /** The page's own heading (at start); in the pop-up the pop-up's title is the heading. */
  heading?: boolean
  /** As calm draws it, whatever the setting (the kitchen sink). */
  still?: boolean
}

/** The line itself: why, the place in it, what to do, and INFO at its foot. */
export function QueueView({
  position,
  idle,
  idleMinutes,
  signedIn,
  onSignIn,
  onInfo,
  heading,
  still,
}: QueueViewProps) {
  const { t } = useT()
  const { calm } = useMotion()
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className={cx('inline-block', !calm && !still && 'loading-ball')} aria-hidden>
        <PixelIcon name="ball" size={48} />
      </span>
      {heading && (
        <h1 tabIndex={-1} className="text-title leading-none">
          {t('ui.ccu.title')}
        </h1>
      )}
      {idle && (
        <p className="copy w-full bg-gold-pale px-3 py-2 text-ink shadow-ring-line">
          {t('ui.ccu.idle', { minutes: idleMinutes })}
        </p>
      )}
      <p className="copy">{t('ui.ccu.full')}</p>
      <p role="status" aria-live="polite" className="text-[30px] leading-none tabular-nums">
        {position != null ? t('ui.ccu.position', { n: position }) : t('ui.common.loading')}
      </p>
      <p className="copy text-muted">{t('ui.ccu.keepOpen')}</p>
      {!signedIn && (
        <div className="flex flex-col items-center gap-2">
          <p className="copy text-muted">{t('ui.ccu.whitelist')}</p>
          <PixelButton size="sm" variant="secondary" onClick={onSignIn}>
            {t('ui.account.connect')}
          </PixelButton>
        </div>
      )}
      <InfoButton name={t('ui.ccu.title')} onClick={onInfo} className="mt-1" />
    </div>
  )
}

/** Signed in, as far as can be told before the game's own sign-in check has run (it waits for the line). */
function useSignedIn(): boolean {
  const status = useGame((s) => s.auth.status)
  const [stored, setStored] = useState(false)
  useEffect(() => {
    if (status !== 'unknown') return
    let live = true
    void getSupabase()
      .then((c) => c?.auth.getSession())
      .then((r) => live && setStored(!!r?.data.session))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [status])
  return status === 'signed_in' || (status === 'unknown' && stored)
}

function ConnectedQueue({ heading }: { heading?: boolean }) {
  const view = useCcu()
  const signedIn = useSignedIn()
  const [info, setInfo] = useState(false)
  return (
    <>
      <QueueView
        {...view}
        heading={heading}
        signedIn={signedIn}
        onSignIn={() => void signIn('google')}
        onInfo={() => setInfo(true)}
      />
      <PlayerCapRulesModal open={info} onClose={() => setInfo(false)} />
    </>
  )
}

/** At start, the game full: the whole page. */
function QueueScreen() {
  const { t } = useT()
  useEffect(() => {
    document.title = t('ui.page.title', { page: t('ui.ccu.title') })
  }, [t])
  return (
    <main className="grid min-h-dvh place-items-center p-3">
      <section className="pixel-panel w-full max-w-md bg-panel p-4">
        <ConnectedQueue heading />
      </section>
    </main>
  )
}

/** Sent back to the line mid-game (idle, or the place lost): over the game, which waits as it was. */
function QueueModal() {
  const { t } = useT()
  return (
    <Modal open dismissable={false} title={t('ui.ccu.title')} className="max-w-md">
      <ConnectedQueue />
    </Modal>
  )
}

/** The admin panel, the setup guide and the dev pages never wait: they aren't the game. */
const TOOL_PATH = /^\/(admin|setup|kitchen-sink)(\/|$)/

/**
 * Before the game: the place in it (docs/74). Nothing of the game runs (no content check, no cloud sync, no other
 * request) until the server has let this player in, or couldn't be asked (offline, an older database: the game plays
 * as before). Once in, the game stays mounted: a later trip to the line covers it rather than unloading it.
 */
export function PlayerCapGate({ children }: { children: ReactNode }) {
  const status = useCcu((s: CcuView) => s.status)
  const tool = TOOL_PATH.test(useLocation().pathname)
  const admitted = status === 'active' || status === 'open'
  const [booted, setBooted] = useState(admitted)
  useEffect(() => startCcu(), [])
  useEffect(() => {
    if (!admitted && !tool) return
    setBooted(true)
    startBackgroundServices()
  }, [admitted, tool])
  if (tool) return <>{children}</>
  if (!booted) return status === 'queued' ? <QueueScreen /> : <PageLoading className="min-h-dvh" />
  return (
    <>
      {children}
      {status === 'queued' && <QueueModal />}
    </>
  )
}
