// While a dialog is open the page behind it is `inert` (docs/15 §7): a screen reader's swipe (TalkBack, VoiceOver)
// can't wander out of it, which `aria-modal` and the Tab trap alone don't stop. Every dialog is portalled to <body>, so
// its host is one of <body>'s children: what came before it (the game in #root, a dialog under it) goes inert, what
// came after it (a moment opened from inside it, a gift's opening) stays live. The toasts (`data-stay-live`) stay
// readable. The rotate cover holds everything, the toasts included (`all`).

interface Layer {
  host: HTMLElement
  /** Everything else goes inert, not just what came before (the rotate cover, over anything opened later). */
  all: boolean
}

/** Marks a child of <body> that stays live under a dialog: the toasts. */
export const STAY_LIVE = 'data-stay-live'

/**
 * Which of <body>'s children go inert under the top layer: those before its host (with `all`, every other one),
 * except those that stay live (unless `all`). Pure, so the rule is tested without a page.
 */
export function inertTargets<T>(
  children: readonly T[],
  host: T,
  all: boolean,
  staysLive: (el: T) => boolean,
): T[] {
  const at = children.indexOf(host)
  if (at < 0) return []
  return children.filter((el, i) => el !== host && (all || (i < at && !staysLive(el))))
}

const layers: Layer[] = []
/** What this module made inert, so it never wakes up what something else put to sleep. */
const ours = new Set<HTMLElement>()

/** The layer on top: the latest that holds everything, else the latest. */
const topLayer = (): Layer | undefined =>
  [...layers].reverse().find((l) => l.all) ?? layers[layers.length - 1]

function apply() {
  if (typeof document === 'undefined') return
  const top = topLayer()
  const children = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  )
  const want = new Set(
    top ? inertTargets(children, top.host, top.all, (el) => el.hasAttribute(STAY_LIVE)) : [],
  )
  for (const el of ours) {
    if (want.has(el)) continue
    el.inert = false
    ours.delete(el)
  }
  for (const el of want) {
    if (el.inert) continue
    el.inert = true
    ours.add(el)
  }
}

/** The child of <body> that holds `el` (a dialog's portal root). */
export function bodyChildOf(el: HTMLElement | null): HTMLElement | null {
  let node = el
  while (node && node.parentElement !== document.body) node = node.parentElement
  return node
}

/**
 * Puts the page behind `el` to sleep until the function returned is called. Layers stack: closing the top one wakes
 * the one under it, and the page once the last one goes.
 */
export function holdInert(el: HTMLElement | null, opts: { all?: boolean } = {}): () => void {
  const host = bodyChildOf(el)
  if (!host) return () => {}
  const layer: Layer = { host, all: !!opts.all }
  layers.push(layer)
  apply()
  return () => {
    const i = layers.indexOf(layer)
    if (i < 0) return
    layers.splice(i, 1)
    apply()
  }
}
