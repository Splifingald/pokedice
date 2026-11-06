import { pushToast } from '@/store/game'

/**
 * The native share sheet on phones; where there is none (desktop), the link is copied and `copied` said in a toast.
 * True once shared or copied; false when the sheet was cancelled or the clipboard refused. `withText` copies the text
 * above the link, for a link that means little on its own (a trade listing's).
 */
export async function shareOrCopy(
  share: { title: string; text: string; url: string },
  copied: string,
  { withText = false } = {},
): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share(share)
      return true
    }
    await navigator.clipboard.writeText(withText ? `${share.text}\n${share.url}` : share.url)
    pushToast(copied, 'good')
    return true
  } catch {
    return false
  }
}

/** Copies a short text (a friend ID) and says so; says it couldn't when the clipboard refuses. */
export async function copyText(value: string, copied: string, refused: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    pushToast(copied, 'good')
  } catch {
    pushToast(refused, 'bad')
  }
}
