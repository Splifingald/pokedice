// Push notifications' question and rules (docs/25, docs/15 §20). The first time a player opens a feature that can send
// them (the Day Care, the raids, a live event) while push is off on this device, one pop-up asks: "Enable push
// notifications to be notified about upcoming raids". Yes asks the browser; No thanks means that feature never asks
// again, while the others still ask once. On an iPhone in a Safari tab it says how to add the game to the Home Screen
// first, the only place iOS lets a web game send them. The same rules show from Settings' INFO button.
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  dayCareTutorialDue,
  donationDue,
  eventUnlockDue,
  leaderboardTutorialDue,
  liveEventAt,
  regionOfferDue,
  tradeRulesDue,
  versusRulesDue,
  type PushTopic,
} from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useFullscreen } from '@/lib/fullscreen'
import { platform, pushSupport } from '@/lib/platform'
import { askPush, declinePush, deferPush, enablePush, pushHours, pushReady, usePush } from '@/lib/push'
import { pushToast, useGame } from '@/store/game'
import { serverNow } from '@/store/serverTime'
import { EggSprite } from './EggSprite'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { RuleList, type RuleRow, type RulesPicture } from './RulesModal'

/** What each topic's notices say and when, with the config's hours. */
export function usePushRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const h = pushHours(data)
  return [
    {
      icon: <EggSprite size={22} />,
      title: t('ui.push.rules.egg.title'),
      text: t('ui.push.rules.egg.text', { from: h.quietFrom, to: h.quietTo }),
    },
    {
      icon: 'calendar',
      title: t('ui.push.rules.raid.title'),
      text: t('ui.push.rules.raid.text', { time: h.raid }),
    },
    { icon: 'sparkle', title: t('ui.push.rules.live.title'), text: t('ui.push.rules.live.text') },
    { icon: 'gear', title: t('ui.push.rules.choice.title'), text: t('ui.push.rules.choice.text') },
  ]
}

/** The steps to add the game to the Home Screen, for an iPhone or iPad in Safari. */
export function InstallSteps({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <p className={`copy m-0 bg-sky px-3 py-2 shadow-ring-line ${className ?? ''}`}>
      <PixelIcon name="warning" size={16} className="mr-1.5 inline-block align-[-2px]" />
      {t('ui.push.install')}
    </p>
  )
}

/** The question itself: the feature's picture, its sentence, the rules, and No thanks / Enable (or OK, on an iPhone tab). */
export function PushAskModal({
  open,
  topic,
  picture,
  install,
  busy,
  onYes,
  onNo,
}: {
  open: boolean
  topic: PushTopic
  picture: RulesPicture
  /** An iPhone in a Safari tab: the Home Screen steps instead of Enable. */
  install: boolean
  busy?: boolean
  onYes: () => void
  onNo: () => void
}) {
  const { t } = useT()
  const rules = usePushRules()
  return (
    <Modal open={open} onClose={onNo} title={t('ui.push.title')} className="max-w-md">
      <div className="flex flex-col gap-3">
        <div className="relative -mx-4 h-[112px] overflow-hidden bg-night shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]">
          <img
            src={picture.src}
            alt=""
            className="pixelated absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: picture.focus ?? '50% 50%' }}
          />
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 bg-gold px-1.5 pb-0.5 pt-px font-pixel-sm text-[14px] tracking-[0.08em] text-ink shadow-ring-line">
            <PixelIcon name="bell" size={16} />
            {t('ui.push.tag')}
          </span>
        </div>
        <p className="m-0 text-[22px] leading-tight">{t(`ui.push.ask.${topic}`)}</p>
        <RuleList rules={rules} />
        {install && <InstallSteps />}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5 pt-1">
          <PixelButton onClick={onNo} disabled={busy}>
            {t('ui.push.no')}
          </PixelButton>
          <PixelButton variant="primary" onClick={onYes} disabled={busy}>
            {t(install ? 'ui.common.ok' : 'ui.push.yes')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/** Each feature's picture, as its own pop-ups show it. */
export function pushPicture(topic: PushTopic, banners: { raid: string; live: string | null }): RulesPicture {
  const src = (key: string) => (key.includes('/') ? key : artUrl(key))
  if (topic === 'egg') return { src: artUrl('daycare'), focus: '50% 27%' }
  if (topic === 'live' && banners.live) return { src: src(banners.live) }
  return { src: src(banners.raid), focus: '50% 60%' }
}

/** Says what came of a yes, in a toast. */
export function toastEnable(result: Awaited<ReturnType<typeof enablePush>>, t: (k: string) => string) {
  if (result === 'on') pushToast(t('ui.push.toast.on'), 'good')
  else if (result === 'denied') pushToast(t('ui.push.toast.denied'), 'bad', 5000)
  else if (result === 'failed') pushToast(t('ui.push.toast.failed'), 'bad')
}

/**
 * The question, wherever it was asked from (askPush): between fights, never over a full-screen moment, and after the
 * other one-time pop-ups.
 */
export function PushAsk() {
  const { t } = useT()
  const asking = usePush((s) => s.asking)
  const busy = usePush((s) => s.busy)
  const data = useGame((s) => s.data)
  const idle = useGame((s) => s.run.phase === 'idle')
  const full = useFullscreen()
  if (!asking || !pushReady(data)) return null
  const install = pushSupport() === 'install'
  const live = liveEventAt(data, serverNow())
  return (
    <PushAskModal
      open={idle && !full}
      topic={asking}
      picture={pushPicture(asking, { raid: data.config.events.raid.banner, live: live?.banner || null })}
      install={install}
      busy={busy}
      onNo={() => declinePush(asking)}
      onYes={() => {
        if (install) return deferPush(asking)
        void enablePush(asking).then((r) => toastEnable(r, t))
      }}
    />
  )
}

/** The other one-time pop-ups come first: they'd fight over the screen. */
function useOthersDue(): boolean {
  return useGame(
    (s) =>
      !s.save ||
      dayCareTutorialDue(s.save, s.data) ||
      leaderboardTutorialDue(s.save, s.data) ||
      donationDue(s.save, s.data) ||
      !!regionOfferDue(s.save, s.data) ||
      !!eventUnlockDue(s.save, s.data) ||
      versusRulesDue(s.save, s.data) ||
      tradeRulesDue(s.save, s.data),
  )
}

/** A feature's page asks its question once it has opened (a beat later, so the page is seen first). */
export function usePushAsk(topic: PushTopic, ready = true) {
  const data = useGame((s) => s.data)
  const others = useOthersDue()
  const due = usePush((s) => !s.asking && !s.on && s.asked[topic] !== 'no' && s.asked[topic] !== 'yes')
  useEffect(() => {
    if (!ready || others || !due || !pushReady(data)) return
    const id = setTimeout(() => askPush(topic), 700)
    return () => clearTimeout(id)
  }, [ready, others, due, data, topic])
}

/**
 * A tap on a notification while the game is open: the service worker passes on where it leads, and the game goes there
 * between fights (sw.js never reloads the tab, which would lose a fight under way).
 */
export function usePushLinks() {
  const navigate = useNavigate()
  const here = useLocation().pathname
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; url?: string } | null
      if (msg?.type !== 'pokedice:open' || !msg.url?.startsWith('/')) return
      if (useGame.getState().run.phase !== 'idle' || msg.url === here) return
      navigate(msg.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate, here])
}

/** The device, in words, for Settings: "Android phone", "iPhone or iPad (Home Screen app)". */
export function useDeviceName(): string {
  const { t } = useT()
  const p = platform()
  const name = t(`ui.push.device.${p.os}`)
  return p.standalone ? t('ui.push.device.app', { device: name }) : name
}
