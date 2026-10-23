// A die thrown as a recorded throw (docs/37): the resting die hides (its place and its focus kept) while a decorative
// canvas plays the throw over it, then shows again. Behind the admin's switch; with it off the die tumbles as before.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { diceThrowsOn, type Face } from '@/engine'
import type { DieLook } from '@/fx/dice/cube'
import type { ThrowLevel } from '@/fx/dice/solve'
import { useMotion } from '@/lib/motion'
import { usePace } from '@/lib/pace'
import { useGame } from '@/store/game'

/** The Kitchen Sink's controls: the throw on whatever the switch says, a motion level, slow motion, a frozen frame. */
export interface DiceLab {
  on?: boolean
  level?: ThrowLevel | 'off'
  speed?: number
  freeze?: number
}
export const DiceLabContext = createContext<DiceLab | null>(null)

type Player = typeof import('@/fx/dice/player')
let player: Promise<Player> | null = null
/** The throws, their renderer and their player: one lazy chunk, fetched once the switch is on. */
export function loadDicePlayer(): Promise<Player> {
  player ??= import('@/fx/dice/player').catch((e: unknown) => {
    player = null
    throw e
  })
  return player
}

const sameFace = (a: Face, b: Face) =>
  a.kind === b.kind &&
  a.value === b.value &&
  (a.kind !== 'status' || (b.kind === 'status' && a.status === b.status))

/** Longest the first throw waits for its chunk; past it the die simply shows, as a die with no throw. */
const LOAD_WAIT_MS = 400

export interface DieThrowArgs {
  rollKey: string | number | undefined
  body: RefObject<HTMLElement>
  type: string
  face: Face | null | undefined
  size: number
  fill: string
  pip: string
  locked: boolean
  delay: number
  /** The die is down (docs/38: the tray's last landing, the readout waiting for it). */
  onLand?: () => void
}

/**
 * Whether this die plays a recorded throw (`active`, decided at mount: it replaces the tumble) and whether it is in
 * the air now (`flying`: its lift for a pick or a combo waits for the landing).
 */
export function useDieThrow(a: DieThrowArgs): { active: boolean; flying: boolean } {
  const lab = useContext(DiceLabContext)
  const on = useGame((s) => diceThrowsOn(s.data))
  const faces = useGame((s) => s.data.diceTypes[a.type as keyof typeof s.data.diceTypes]?.faces)
  const { level, calm } = useMotion()
  const pace = usePace()
  // Motion off: the die is at rest at once. The OS asking for less motion: a drop with no spin.
  const throwLevel: ThrowLevel | null = lab?.level
    ? lab.level === 'off'
      ? null
      : lab.level
    : level === 'off'
      ? null
      : calm
        ? 'calm'
        : level
  const active = (lab?.on ?? on) && a.rollKey !== undefined && !!a.face && throwLevel !== null
  const [landed, setLanded] = useState<string | number | undefined>(undefined)
  const flying = active && landed !== a.rollKey

  // Read when the throw starts, so a re-render mid-air (a new prop object) doesn't throw the die again.
  const now = useRef({ a, faces, throwLevel, pace, lab })
  now.current = { a, faces, throwLevel, pace, lab }

  useEffect(() => {
    if (on || lab?.on) void loadDicePlayer().catch(() => {})
  }, [on, lab?.on])

  useLayoutEffect(() => {
    if (!active) return
    const el = now.current.a.body.current
    if (!el) return
    const { a: args, faces: typeFaces, throwLevel: lvl, pace: p, lab: l } = now.current
    const face = args.face!
    // The cube's six faces are the die type's, the engine's face among them; a face its type doesn't have (a catch
    // die's value, a Bait) goes in the first slot.
    const all = typeFaces?.length ? typeFaces.slice(0, 6) : [face]
    let index = all.indexOf(face)
    if (index < 0) index = all.findIndex((f) => sameFace(f, face))
    const cube = index >= 0 ? all : [face, ...all.slice(1)]
    const look: DieLook = {
      size: args.size,
      fill: args.fill,
      pip: args.pip,
      mini: args.size < 40,
      alpha: args.locked ? 0.8 : 1,
      faces: cube,
    }
    el.style.visibility = 'hidden'
    let done = false
    let cancel: (() => void) | null = null
    const show = () => {
      if (done) return
      done = true
      el.style.visibility = ''
      setLanded(args.rollKey)
      now.current.a.onLand?.()
    }
    const startedAt = performance.now()
    const giveUp = setTimeout(show, LOAD_WAIT_MS + args.delay * 1000)
    loadDicePlayer().then(
      (m) => {
        if (done) return
        clearTimeout(giveUp)
        cancel = m.throwDie({
          el,
          key: String(args.rollKey),
          face: Math.max(0, index),
          look,
          level: lvl!,
          startedAt,
          delay: args.delay,
          pace: p,
          speed: l?.speed,
          freeze: l?.freeze,
          onLand: show,
        })
      },
      () => {
        clearTimeout(giveUp)
        show()
      },
    )
    return () => {
      clearTimeout(giveUp)
      cancel?.()
      if (!done) {
        done = true
        el.style.visibility = ''
      }
    }
  }, [active, a.rollKey, lab?.freeze, lab?.speed, lab?.level])

  return { active, flying }
}
