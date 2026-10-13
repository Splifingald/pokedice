// Which device the game runs on (docs/25): a phone or a computer, and its system. Push notifications depend on it: an
// iPhone only gets them once the game is added to its Home Screen (iOS 16.4+), and the words that say how differ by
// system. Read from the browser's own hints; `detectPlatform` takes them as arguments so the tests can feed any device.

export type OS = 'ios' | 'android' | 'windows' | 'mac' | 'linux' | 'chromeos' | 'other'

export interface Platform {
  os: OS
  /** A phone or a tablet: a touch device whose system is a mobile one. */
  mobile: boolean
  /** Opened from the Home Screen (an installed web app), not in a browser tab. */
  standalone: boolean
}

export interface PlatformHints {
  userAgent: string
  /** navigator.userAgentData.platform where the browser has it (Chromium). */
  uaPlatform?: string
  /** navigator.userAgentData.mobile. */
  uaMobile?: boolean
  /** navigator.maxTouchPoints: an iPad asking for the desktop site says "Macintosh", but has a touch screen. */
  maxTouchPoints: number
  standalone: boolean
}

export function detectPlatform(h: PlatformHints): Platform {
  const ua = h.userAgent
  const p = (h.uaPlatform ?? '').toLowerCase()
  let os: OS = 'other'
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && h.maxTouchPoints > 1)) os = 'ios'
  else if (p === 'android' || /android/i.test(ua)) os = 'android'
  else if (p === 'chrome os' || /cros/i.test(ua)) os = 'chromeos'
  else if (p === 'windows' || /windows/i.test(ua)) os = 'windows'
  else if (p === 'macos' || /mac os x|macintosh/i.test(ua)) os = 'mac'
  else if (p === 'linux' || /linux/i.test(ua)) os = 'linux'
  const mobile = os === 'ios' || os === 'android' || !!h.uaMobile || /mobi/i.test(ua)
  return { os, mobile, standalone: h.standalone }
}

/** This device, read once. */
let cached: Platform | null = null
export function platform(): Platform {
  if (cached) return cached
  if (typeof navigator === 'undefined') return { os: 'other', mobile: false, standalone: false }
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean }
    standalone?: boolean
  }
  const standalone =
    nav.standalone === true ||
    (typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches)
  cached = detectPlatform({
    userAgent: nav.userAgent ?? '',
    uaPlatform: nav.userAgentData?.platform,
    uaMobile: nav.userAgentData?.mobile,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone,
  })
  return cached
}

/**
 * Whether this browser can take push notifications: `yes`; `install` on an iPhone or iPad in a Safari tab (push only
 * reaches a web app added to the Home Screen); `no` otherwise (an old browser, a private window without a service
 * worker).
 */
export type PushSupport = 'yes' | 'install' | 'no'

export function pushSupportOf(
  p: Platform,
  apis: { serviceWorker: boolean; pushManager: boolean; notification: boolean },
): PushSupport {
  if (apis.serviceWorker && apis.pushManager && apis.notification) return 'yes'
  // iOS 16.4+ hides PushManager in a tab and shows it in the Home Screen app.
  if (p.os === 'ios' && !p.standalone && apis.serviceWorker) return 'install'
  return 'no'
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'no'
  return pushSupportOf(platform(), {
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
  })
}

/** The device's name for analytics and the admin's counts: "ios", "android", "windows"… plus "-app" when installed. */
export const platformTag = (p: Platform): string =>
  `${p.os}${p.mobile && p.os !== 'ios' && p.os !== 'android' ? '-mobile' : ''}${p.standalone ? '-app' : ''}`
