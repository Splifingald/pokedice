// While a dialog is open the page behind it is `inert` (docs/15 §7): a screen reader's swipe (TalkBack, VoiceOver)
// can't wander out of it, which `aria-modal` and the Tab trap alone don't stop. Every dialog is portalled to <body>, so
// its host is one of <body>'s children. The dialog on top is the one drawn on top: the highest z-index, the latest
// opened among equals (a pop-up opened under the partner lab, z 90 under 100, stays under it). Under it go inert: what
// came before it (the game in #root) and every other dialog; what opened after it that isn't a dialog (a moment started
// from inside it, a gift's opening) stays live, and so do the toasts (`data-stay-live`). The rotate cover holds
// everything, the toasts included (`all`).

/** Marks a child of <body> that stays live under a dialog: the toasts. */
export const STAY_LIVE = 'data-stay-live'

/** A dialog's place in the pile: its host, its z-index, and whether it holds everything (the rotate cover). */
export interface LayerInfo<T> {
  host: T
  z: number
  all: boolean
}

/** The layer on top: the latest that holds everything, else the highest z-index, the latest among equals. */
export function topOf<T>(layers: readonly LayerInfo<T>[]): LayerInfo<T> | undefined {
  const holding = layers.filter((l) => l.all)
  if (holding.length) return holding[holding.length - 1]
  let top: LayerInfo<T> | undefined
  for (const l of layers) if (!top || l.z >= top.z) top = l
  return top
}

/**
 * Which of <body>'s children go inert under the top layer: those before its host and every other dialog (with `all`,
 * every other child), except those that stay live (unless `all`). Pure, so the rule is tested without a page.
 */
export function inertTargets<T>(
  children: readonly T[],
  top: LayerInfo<T>,
  others: readonly T[],
  staysLive: (el: T) => boolean,
): T[] {
  const at = children.indexOf(top.host)
  if (at < 0) return []
  return children.filter(
    (el, i) => el !== top.host && (top.all || others.includes(el) || (i < at && !staysLive(el))),
  )
}

const layers: LayerInfo<HTMLElement>[] = []
/** What this module made inert, so it never wakes up what something else put to sleep. */
const ours = new Set<HTMLElement>()

function apply() {
  if (typeof document === 'undefined') return
  const top = topOf(layers)
  const children = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  )
  const others = layers.filter((l) => l !== top).map((l) => l.host)
  const want = new Set(top ? inertTargets(children, top, others, (el) => el.hasAttribute(STAY_LIVE)) : [])
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

/** Whether the dialog holding `el` is the one on top: it answers the keyboard and keeps the focus. */
export function isTopLayer(el: HTMLElement | null): boolean {
  const host = bodyChildOf(el)
  return !!host && topOf(layers)?.host === host
}

/** Whether `el` sits in a dialog that holds a layer at all (one that doesn't falls back on the order of opening). */
export function hasLayer(el: HTMLElement | null): boolean {
  const host = bodyChildOf(el)
  return !!host && layers.some((l) => l.host === host)
}

const zOf = (el: HTMLElement): number => {
  const z = Number.parseInt(getComputedStyle(el).zIndex, 10)
  return Number.isFinite(z) ? z : 0
}

/**
 * Puts the page behind `el` to sleep until the function returned is called. Layers stack: closing the top one wakes
 * the one under it, and the page once the last one goes.
 */
export function holdInert(el: HTMLElement | null, opts: { all?: boolean } = {}): () => void {
  const host = bodyChildOf(el)
  if (!host) return () => {}
  const layer: LayerInfo<HTMLElement> = { host, z: zOf(host), all: !!opts.all }
  layers.push(layer)
  apply()
  return () => {
    const i = layers.indexOf(layer)
    if (i < 0) return
    layers.splice(i, 1)
    apply()
  }
}
