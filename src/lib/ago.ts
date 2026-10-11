import { t } from '@/i18n'

/** "3 min ago" from a timestamp: just now, minutes, hours, then days. */
export function agoText(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return t('ui.sync.justNow')
  if (min < 60) return t('ui.sync.minAgo', { n: min })
  if (min < 24 * 60) return t('ui.sync.hAgo', { n: Math.floor(min / 60) })
  return t('ui.sync.dAgo', { n: Math.floor(min / (24 * 60)) })
}
