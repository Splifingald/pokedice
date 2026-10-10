import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { EGG_COLORS, EGG_MAP } from '@/components/EggSprite'
import { ellipse, icon } from '@/fx/pixel'
import { stageSprite } from '@/fx/sprites'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import { H, W, dayCareWorld } from '../home/scene'
import { useHerdLoop, type HerdOverlay } from '../home/SceneStage'
import { Herd } from '../home/team'

/** Someone at the Day Care, as the yard needs them: who they could make an Egg with, by key. */
export interface YardMember {
  key: string
  dex: number
  shiny?: boolean
  name: string
  likes: string[]
}

/** The nest, by the pond's side of the meadow, in the scene's art pixels. */
const NEST = { x: 214, y: 236 }

/**
 * The Day Care's yard (docs/15), the size and place of Home's scene: the meadow with the cottage, everyone at the Day
 * Care roaming it with Home's herd. Pairs that could make an Egg seek each other out and send hearts; nobody sings.
 * A tap makes a Pokémon hop with a heart. With an Egg waiting, it shakes in a nest, and a tap on it hatches it. The
 * canvas has a label, and everything it does is also a button in a hidden list. `children` sit on top (the plate).
 */
export function YardStage({
  members,
  egg,
  onHatch,
  children,
}: {
  members: YardMember[]
  egg: boolean
  onHatch: () => void
  children?: ReactNode
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { calm } = useMotion()
  const still = useRef<HTMLCanvasElement>(null)
  const back = useRef<HTMLCanvasElement>(null)
  const front = useRef<HTMLCanvasElement>(null)
  const imgs = useRef<(HTMLImageElement | null)[]>([])

  const key = members.map((m) => `${m.key}:${m.dex}:${m.shiny ? 1 : 0}:${m.likes.join(',')}`).join('|')
  const sprites = useMemo(
    () => members.map((m) => stageSprite(m.dex, false, !!m.shiny)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  const herd = useMemo(() => {
    const world = dayCareWorld()
    return new Herd(
      world,
      members.map((m, i) => ({
        uid: m.key,
        dex: m.dex,
        types: [data.species[m.dex]?.type1, data.species[m.dex]?.type2].filter((x): x is NonNullable<typeof x> => !!x),
        hp: 1,
        maxHp: 1,
        w: Math.round(sprites[i]!.artW * sprites[i]!.k),
        h: Math.round(sprites[i]!.artH * sprites[i]!.k),
        likes: m.likes,
      })),
      29,
      calm,
      true,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sprites])
  useEffect(() => {
    herd.calm = calm
  }, [herd, calm])

  // The Egg in its nest, shaking now and then (still when calm).
  const nest = useCallback<HerdOverlay>(
    (g, time, layer) => {
      if (!egg || layer !== 'back') return
      ellipse(g, NEST.x, NEST.y, 14, 5, '#8a5a32')
      ellipse(g, NEST.x, NEST.y - 1, 12, 4, '#c8945a')
      const shake = calm ? 0 : time % 1.6 < 0.5 ? (Math.floor(time * 14) % 2 ? 1 : -1) : 0
      const e = icon(EGG_MAP, EGG_COLORS)
      g.drawImage(e, NEST.x - Math.round(e.width / 2) + shake, NEST.y + 1 - e.height)
      ellipse(g, NEST.x, NEST.y + 2, 12, 2, '#a0704a')
    },
    [egg, calm],
  )
  useHerdLoop(herd, sprites, { still, back, front, imgs }, nest)

  const names = members.map((m) => m.name).join(', ')
  return (
    <div
      className="relative isolate z-0 w-full select-none overflow-hidden"
      style={{ aspectRatio: `${W} / ${H}`, containerType: 'inline-size' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        const r = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - r.left) / r.width) * W
        const y = ((e.clientY - r.top) / r.height) * H
        if (egg && Math.abs(x - NEST.x) < 16 && y > NEST.y - 30 && y < NEST.y + 8) return onHatch()
        const hit = herd.hitTest(x, y)
        if (hit) herd.poke(hit)
      }}
    >
      <canvas
        ref={still}
        width={W}
        height={H}
        aria-hidden
        className="pixelated absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      <canvas
        ref={back}
        width={W}
        height={H}
        role="img"
        aria-label={members.length ? t('ui.dayCare.yardLabel', { names }) : t('ui.dayCare.yardEmpty')}
        className="pixelated absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      {members.map((m, i) => (
        <img
          key={m.key}
          ref={(el) => {
            imgs.current[i] = el
          }}
          src={sprites[i]!.url}
          alt=""
          draggable={false}
          onError={(e) => {
            const fb = sprites[i]!.fallback
            if (fb && e.currentTarget.src !== new URL(fb, location.href).href) e.currentTarget.src = fb
          }}
          className="pointer-events-none absolute max-w-none"
          style={{ imageRendering: 'pixelated' }}
        />
      ))}
      <canvas
        ref={front}
        width={W}
        height={H}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[400] h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      {children}
      <ul className="sr-only" aria-label={t('ui.dayCare.yardList')}>
        {members.map((m, i) => (
          <li key={m.key}>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => {
                const mon = herd.mons[i]
                if (mon) herd.poke(mon)
              }}
            >
              {m.name}
            </button>
          </li>
        ))}
        {egg && (
          <li>
            <button type="button" className="min-h-[44px] min-w-[44px]" onClick={onHatch}>
              {t('ui.dayCare.hatchIt')}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
