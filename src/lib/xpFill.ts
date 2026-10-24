// The result card's XP bar filling in steps (docs/38 F5c): from where it stood before the battle (the engine's `xp`
// event, `from`) to where it is now, one frame per step. No rule is decided here: the levels and the XP each one needs
// are the engine's (`xpToNext`); this only cuts the way between them into frames.
import { xpToNext, type GameConfig } from '@/engine'

export interface XpFrame {
  level: number
  xp: number
  /** The bar full and drawn white: a level-up's two flash frames. */
  white?: boolean
  /** A level-up lands on this frame: the bar starts again, empty, at the next level. */
  roll?: boolean
}

/** Steps for a full bar: a part of it takes its share, at least one. */
export const XP_FULL_STEPS = 8
/** Level-ups played one by one; more than that at once and the rest come in one go. */
export const XP_MAX_ROLLS = 3

type XpAt = { level: number; xp: number }

/**
 * The frames from `from` to `to`: each level's bar filling to full in steps (`XP_FULL_STEPS` for a whole bar), then,
 * with `flash`, two white frames (none under calm: no flashing), then the next level, empty. At the top level the bar
 * stops there (MAX). Nothing when there is nothing to fill.
 */
export function xpFillFrames(from: XpAt, to: XpAt, cfg: GameConfig, flash = true): XpFrame[] {
  const top = cfg.maxLevel
  const end: XpAt = to.level >= top ? { level: top, xp: 0 } : to
  if (from.level > end.level || (from.level === end.level && from.xp >= end.xp)) return []
  const frames: XpFrame[] = []
  const fillTo = (level: number, a: number, b: number) => {
    const need = Math.max(1, xpToNext(level, cfg))
    const steps = Math.max(1, Math.ceil((XP_FULL_STEPS * (b - a)) / need))
    for (let i = 1; i <= steps; i++) frames.push({ level, xp: Math.round(a + ((b - a) * i) / steps) })
  }
  let level = from.level
  let xp = Math.max(0, from.xp)
  let rolls = 0
  while (level < end.level) {
    if (rolls >= XP_MAX_ROLLS) {
      // Many level-ups at once (a big win early on): the rest land together.
      level = end.level
      xp = 0
      frames.push({ level, xp, roll: true })
      break
    }
    const need = xpToNext(level, cfg)
    fillTo(level, xp, need)
    if (flash) frames.push({ level, xp: need, white: true }, { level, xp: need, white: true })
    level += 1
    xp = 0
    rolls += 1
    frames.push({ level, xp, roll: true })
  }
  if (level < top && end.xp > xp) fillTo(level, xp, end.xp)
  return frames
}
