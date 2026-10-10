import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { instanceMaxHp, type Area, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { HpBar } from '@/components/HpBar'
import { LevelTag } from '@/components/Chip'
import { placeSprite, stageSprite, type StageSprite } from '@/fx/sprites'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import { clamp, type G } from '@/fx/pixel'
import { artPlacement, homeWindow } from '@/fx/areaArt'
import { AreaArt } from '@/components/AreaArt'
import { H, W, worldOf } from './scene'
import { Herd, type Mon } from './team'

interface Member {
  inst: PokemonInstance
  name: string
  maxHp: number
  sprite: StageSprite
}

/**
 * The area's scene with the team roaming it: a canvas under the sprites (scenery, shadows, motes), the sprites
 * themselves as <img>s the browser animates, and a canvas over them (tall grass, bubbles, hearts and notes). Tapping a
 * Pokémon makes it hop and shows its card; the card (and the team list, for keyboards) opens its sheet. With calm
 * motion the team stands still. `children` sit on top of the scene (the area plate).
 */
/** Two taps on the same Pokémon within this long open its sheet. */
const DOUBLE_TAP_MS = 400

export function SceneStage({
  area,
  team,
  onOpen,
  children,
}: {
  area: Area
  team: PokemonInstance[]
  onOpen: (uid: string) => void
  children?: ReactNode
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { calm } = useMotion()
  const still = useRef<HTMLCanvasElement>(null)
  const back = useRef<HTMLCanvasElement>(null)
  const front = useRef<HTMLCanvasElement>(null)
  const imgs = useRef<(HTMLImageElement | null)[]>([])
  const [card, setCard] = useState<{ uid: string; x: number; y: number } | null>(null)
  const lastTap = useRef<{ uid: string; t: number } | null>(null)

  const members: Member[] = useMemo(
    () =>
      team.map((inst) => ({
        inst,
        name: data.species[inst.dex]?.name ?? t('ui.common.pokemon'),
        maxHp: instanceMaxHp(inst, data),
        sprite: stageSprite(inst.dex, false, !!inst.shiny),
      })),
    [team, data, t],
  )
  // A new herd for a new area or a new team; HP changes keep the herd (they only change who is tired).
  const teamKey = team
    .map(
      (p) =>
        `${p.id}:${p.dex}:${p.shiny ? 1 : 0}:${p.currentHp > 0 && p.currentHp / instanceMaxHp(p, data) >= 0.5 ? 1 : 0}`,
    )
    .join('|')
  const herd = useMemo(() => {
    const world = worldOf(area)
    const seed = [...area.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7)
    return new Herd(
      world,
      members.map((m) => ({
        uid: m.inst.id,
        dex: m.inst.dex,
        types: [data.species[m.inst.dex]?.type1, data.species[m.inst.dex]?.type2].filter(
          (x): x is NonNullable<typeof x> => !!x,
        ),
        hp: Math.max(0, m.inst.currentHp),
        maxHp: m.maxHp,
        w: Math.round(m.sprite.artW * m.sprite.k),
        h: Math.round(m.sprite.artH * m.sprite.k),
      })),
      seed,
      calm,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id, area.bannerUrl, teamKey])
  useEffect(() => {
    herd.calm = calm
  }, [herd, calm])

  const sprites = useMemo(() => members.map((m) => m.sprite), [members])
  useHerdLoop(herd, sprites, { still, back, front, imgs })

  // The card hides itself after a moment. It sits above the area plate (z 460): near the top of the scene the two
  // overlap, and a tap on the card's name or HP must open the Pokémon, not the area.
  useEffect(() => {
    if (!card) return
    const id = setTimeout(() => setCard(null), 5000)
    return () => clearTimeout(id)
  }, [card])

  const poke = (m: Mon) => {
    herd.poke(m)
    setCard({ uid: m.def.uid, x: m.x, y: m.y - m.sz.h })
  }
  const art = herd.world.art
  const names = members.map((m) => m.name).join(', ')
  const shown = card ? members.find((m) => m.inst.id === card.uid) : null
  const shownMon = card ? herd.mons.find((m) => m.def.uid === card.uid) : null
  const note = shownMon
    ? shownMon.tired
      ? t('ui.home.tired')
      : shownMon.state === 'rest'
        ? t('ui.home.napping')
        : shownMon.state === 'sing'
          ? t('ui.home.singing')
          : ''
    : ''

  return (
    <div
      className="relative isolate z-0 w-full select-none overflow-hidden"
      style={{ aspectRatio: `${W} / ${H}`, containerType: 'inline-size' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        const r = e.currentTarget.getBoundingClientRect()
        const hit = herd.hitTest(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H)
        if (!hit) return setCard(null)
        // A second tap on the same Pokémon soon after the first opens its sheet, like tapping its card.
        const now = e.timeStamp
        if (lastTap.current?.uid === hit.def.uid && now - lastTap.current.t < DOUBLE_TAP_MS) {
          lastTap.current = null
          return onOpen(hit.def.uid)
        }
        lastTap.current = { uid: hit.def.uid, t: now }
        poke(hit)
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
      {art && <AreaArt key={art.id} src={art.url} place={artPlacement(homeWindow())} />}
      <canvas
        ref={back}
        width={W}
        height={H}
        role="img"
        aria-label={t('ui.home.teamLabel', { area: area.name, names })}
        className="pixelated absolute inset-0 h-full w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      {members.map((m, i) => (
        <img
          key={m.inst.id}
          ref={(el) => {
            imgs.current[i] = el
          }}
          src={m.sprite.url}
          alt=""
          draggable={false}
          onError={(e) => {
            const fb = m.sprite.fallback
            if (fb && e.currentTarget.src !== new URL(fb, location.href).href) e.currentTarget.src = fb
          }}
          className="pointer-events-none absolute max-w-none"
          style={{
            imageRendering: 'pixelated',
            filter: m.inst.currentHp <= 0 ? 'grayscale(0.6)' : undefined,
          }}
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
      {shown && card && (
        <button
          type="button"
          onClick={() => onOpen(shown.inst.id)}
          aria-label={t('ui.home.openMon', { name: shown.name })}
          className="pixel-plate absolute z-[470] flex w-[170px] flex-col gap-1 px-2.5 pb-2 pt-1.5 text-left"
          style={{
            left: `clamp(6px, calc(${(card.x / W) * 100}% - 85px), calc(100% - 176px))`,
            top: `max(54px, calc(${((card.y - 8) / H) * 100}% - 70px))`,
          }}
        >
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate text-[20px] leading-none">{shown.name}</span>
            <LevelTag level={shown.inst.level} />
          </span>
          <HpBar hp={Math.max(0, shown.inst.currentHp)} max={shown.maxHp} height={10} />
          {note && <span className="font-pixel-sm text-[15px] leading-tight text-danger">{note}</span>}
        </button>
      )}
      {children}
      <ul className="sr-only" aria-label={t('ui.home.teamList')}>
        {members.map((m, i) => (
          <li key={m.inst.id}>
            <button
              type="button"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => {
                const mon = herd.mons[i]
                if (mon) herd.poke(mon)
                onOpen(m.inst.id)
              }}
            >
              {t('ui.home.monButton', {
                name: m.name,
                level: m.inst.level,
                hp: Math.max(0, m.inst.currentHp),
                max: m.maxHp,
              })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Something drawn with the herd, under the sprites (`back`) or over them (`front`): the Day Care's nest. */
export type HerdOverlay = (g: G, t: number, layer: 'back' | 'front') => void

/**
 * A herd on a stage: the scenery drawn once on `still`, then every frame the herd moves, both canvases are drawn and
 * the sprites (the DOM <img>s in `imgs`, in the herd's order) are placed. Paused while the stage is off screen.
 */
export function useHerdLoop(
  herd: Herd,
  sprites: StageSprite[],
  refs: {
    still: RefObject<HTMLCanvasElement>
    back: RefObject<HTMLCanvasElement>
    front: RefObject<HTMLCanvasElement>
    imgs: RefObject<(HTMLImageElement | null)[]>
  },
  overlay?: HerdOverlay,
) {
  const { still, back, front, imgs } = refs
  // The scenery itself, drawn once: the area's drawn scene, or the stand-in under its picture.
  useEffect(() => {
    const g = still.current?.getContext('2d')
    if (!g) return
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, W, H)
    g.drawImage(herd.world.cv, 0, 0)
  }, [herd, still])

  // The loop: update the herd, draw both canvases, move the sprites. Paused while the scene is off screen.
  useEffect(() => {
    const bg = back.current?.getContext('2d')
    const fg = front.current?.getContext('2d')
    if (!bg || !fg) return
    bg.imageSmoothingEnabled = false
    fg.imageSmoothingEnabled = false
    let raf = 0
    let last = performance.now()
    let visible = true
    const place = () => {
      herd.mons.forEach((m, i) => {
        const el = imgs.current?.[i]
        const s = sprites[i]
        if (!el || !s) return
        const p = herd.pose(m)
        const box = placeSprite(s, p.x, p.y - p.lift)
        el.style.left = `${(box.left / W) * 100}%`
        el.style.top = `${(box.top / H) * 100}%`
        el.style.width = `${(box.w / W) * 100}%`
        el.style.height = `${(box.h / H) * 100}%`
        el.style.zIndex = String(10 + p.z)
        el.style.transform = p.flip ? 'scaleX(-1)' : ''
        // A swimmer's lower half is under water: hide what lies below the waterline (y − 7).
        const under = p.swim ? clamp((7 - p.lift + s.below * s.k) / box.h, 0, 1) : 0
        el.style.clipPath = under > 0 ? `inset(0 0 ${under * 100}% 0)` : ''
      })
    }
    const draw = () => {
      bg.clearRect(0, 0, W, H)
      herd.drawBack(bg)
      overlay?.(bg, herd.t, 'back')
      fg.clearRect(0, 0, W, H)
      herd.drawFront(fg)
      overlay?.(fg, herd.t, 'front')
      place()
    }
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible) {
        herd.update(dt)
        draw()
      }
      raf = requestAnimationFrame(frame)
    }
    draw()
    raf = requestAnimationFrame(frame)
    const io =
      typeof IntersectionObserver !== 'undefined' && back.current
        ? new IntersectionObserver((es) => (visible = !!es[0]?.isIntersecting))
        : null
    if (io && back.current) io.observe(back.current)
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
    }
  }, [herd, sprites, overlay, back, front, imgs])
}
