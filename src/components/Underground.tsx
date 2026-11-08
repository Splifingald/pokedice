// The Underground's pieces (docs/34; docs/15 §32): the cave drawn in code (Home's square, the rules, the Mart), the
// crack gauge, the wall with what it hides, the pickaxe die, orbs, plates and the haul's lines. They draw what the
// engine decided (engine/underground.ts); the screens are screens/events/Underground*.tsx.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import {
  freeKitRules,
  orbPrice,
  orbsValue,
  refreshOffer,
  soloShare,
  thingDone,
  thingTiles,
  ugCfg,
  ugRefreshOn,
  wallRules,
  type GameData,
  type HaulLine,
  type OrbColour,
  type OrbSize,
  type PokeType,
  type UndergroundConfig,
  type Wall,
  type WallThing,
} from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { money, typeName } from '@/lib/format'
import { cx } from '@/theme/util'
import sheet from '@/assets/underground.png'
import atlas from '@/data/underground-atlas.json'
import { Die } from './Die'
import { useCountUp } from './GoldPill'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'

const SPRITES = atlas.sprites as unknown as Record<string, [number, number, number, number] | undefined>
const [SHEET_W, SHEET_H] = atlas.size as [number, number]

/**
 * When the pickaxe meets the rock, after the tap (full motion): the swing's wind-up comes first, and the tile's flash,
 * the dust, the wall's give, the gauge's jolt and the clink all wait for it (underground.css keeps the same number).
 */
export const UG_IMPACT_MS = 90

const sizeOf = (kind: WallThing['kind']): OrbSize | null =>
  kind === 'orbS' ? 's' : kind === 'orbM' ? 'm' : kind === 'orbL' ? 'l' : null

/**
 * A thing's picture in the sheet (`pnpm underground-sprites`: Platinum's own mining treasures): a sphere (small, or the
 * large one for medium and large orbs), a plate, a fossil. Null for a fossil the sheet hasn't got yet.
 */
export function thingSprite(thing: WallThing): string | null {
  const size = sizeOf(thing.kind)
  const id =
    size != null
      ? `sphere.${thing.colour}.${size === 's' ? 's' : 'l'}`
      : thing.kind === 'plate'
        ? `plate.${thing.plate}`
        : `fossil.${thing.item}`
  return SPRITES[id] ? id : null
}

/** A thing's name: "Large Red Orb", "Flame Plate", "Helix Fossil". */
export function thingName(thing: WallThing, data: GameData): string {
  const size = sizeOf(thing.kind)
  if (size) return t(`ui.ug.orb.${thing.colour}.${size}`)
  if (thing.kind === 'plate') return t(`plate.${thing.plate}`)
  return data.items[thing.item ?? '']?.name ?? t('ui.ug.thing')
}

/**
 * One picture of the sheet. With `fit` (a box's width and height, in any unit) it fills that box as much as it can
 * without stretching, centred (the box being its positioned parent); with `px`, it is that wide and as high as its
 * shape says.
 */
export function UgSprite({
  id,
  fit,
  px,
  className,
  style,
}: {
  id: string
  fit?: { w: number; h: number }
  px?: number
  className?: string
  style?: CSSProperties
}) {
  const s = SPRITES[id]
  if (!s) return null
  const [sx, sy, sw, sh] = s
  const art: CSSProperties = {
    backgroundImage: `url(${sheet})`,
    backgroundSize: `${(SHEET_W / sw) * 100}% ${(SHEET_H / sh) * 100}%`,
    backgroundPosition: `${SHEET_W > sw ? (sx / (SHEET_W - sw)) * 100 : 0}% ${SHEET_H > sh ? (sy / (SHEET_H - sh)) * 100 : 0}%`,
    imageRendering: 'pixelated',
  }
  if (fit) {
    // The box's shape against the picture's: whichever side runs out first sets the scale.
    const wide = fit.w / fit.h > sw / sh
    const w = wide ? ((sw / sh) * (fit.h / fit.w)) * 100 : 100
    const h = wide ? 100 : ((sh / sw) * (fit.w / fit.h)) * 100
    return (
      <span
        aria-hidden
        className={cx('pixelated absolute block', className)}
        style={{ ...art, width: `${w}%`, height: `${h}%`, left: `${(100 - w) / 2}%`, top: `${(100 - h) / 2}%`, ...style }}
      />
    )
  }
  const width = px ?? sw
  return (
    <span
      aria-hidden
      className={cx('pixelated inline-block shrink-0', className)}
      style={{ ...art, width, height: (width * sh) / sw, ...style }}
    />
  )
}

/** The cave: rock walls, a dug face with a large sphere, two small ones and a plate in it, a pickaxe on the right. */
export function UgCave({ className, big }: { className?: string; big?: boolean }) {
  return (
    <span className={cx('ug-cave block overflow-hidden', big && 'big', className)} aria-hidden>
      <i className="ug-cave-floor" />
      {/* The scene keeps its size on a wide screen: centred, at most 320 px wide. */}
      <span className="ug-cave-stage">
        <i className="ug-cave-pillar l" />
        <i className="ug-cave-pillar r" />
        <i className="ug-cave-face" />
        <span className="ug-cave-gem" style={{ left: '35%', bottom: '30%', width: '15%' }}>
          <UgSprite id="sphere.red.l" fit={{ w: 1, h: 1 }} />
        </span>
        <span className="ug-cave-gem" style={{ left: '51%', bottom: '28%', width: '8%' }}>
          <UgSprite id="sphere.blue.s" fit={{ w: 1, h: 1 }} />
        </span>
        <span className="ug-cave-gem" style={{ left: '62%', bottom: '50%', width: '8%' }}>
          <UgSprite id="sphere.green.s" fit={{ w: 1, h: 1 }} />
        </span>
        <span className="ug-cave-gem plate" style={{ left: '50%', bottom: '50%', width: '11%' }}>
          <UgSprite id="plate.fire" fit={{ w: 4, h: 3 }} />
        </span>
        <PixelIcon name="pickaxe" size={big ? 44 : 28} className="ug-cave-pick" />
      </span>
    </span>
  )
}

/** An orb: Platinum's sphere of its colour (the large one for medium and large); `px` its width. */
export function OrbArt({
  colour,
  size = 's',
  px = 16,
  className,
}: {
  colour: OrbColour
  size?: OrbSize
  px?: number
  className?: string
}) {
  return <UgSprite id={`sphere.${colour}.${size === 's' ? 's' : 'l'}`} px={px} className={className} />
}

/** A plate: Platinum's plate in its type's colours; `px` its width. */
export function PlateArt({ type, px = 24, className }: { type: PokeType; px?: number; className?: string }) {
  return <UgSprite id={`plate.${type}`} px={px} className={className} />
}

/** A thing as it lies in the wall: its picture filling the tiles it takes (the item's sprite for one not drawn yet). */
function ThingArt({ thing, data, done }: { thing: WallThing; data: GameData; done: boolean }) {
  const id = thingSprite(thing)
  return (
    <span className={cx('ug-thing', done && 'done')}>
      {id ? (
        <UgSprite id={id} fit={{ w: thing.w, h: thing.h }} />
      ) : (
        <ItemSprite item={data.items[thing.item ?? '']} size={48} />
      )}
    </span>
  )
}

/** One section of the crack gauge: a slanted slab, alternately falling and rising, so the band zig-zags. */
const SEG_W = 10
const SEG_H = 14
const zig = (k: number): [number, number] => (k % 2 === 0 ? [1, 9] : [9, 1])
const segPoints = (k: number) => {
  const [a, b] = zig(k)
  const x0 = k * SEG_W
  const x1 = x0 + SEG_W
  return `${x0},${a} ${x1},${b} ${x1},${b + SEG_H} ${x0},${a + SEG_H}`
}

/**
 * The crack gauge, like the games' cleft meter: a zig-zag band of rock, one slab per strike, cracking from the right
 * (a bright crack runs through the broken ones). Its last three slabs left, the rock left glows red (and shakes,
 * unless calm). `hitKey` marks a new strike: the slab it broke flashes and sheds chips, and the band jolts (full
 * motion), timed to the pickaxe's impact.
 */
export function CrackGauge({
  strikes,
  used,
  calm,
  hitKey,
  rebuildKey,
  motion = 'full',
  className,
}: {
  strikes: number
  used: number
  calm?: boolean
  hitKey?: number
  /** A new gauge (docs/34 §12): its slabs come back from the left, one by one. */
  rebuildKey?: number
  motion?: 'full' | 'short' | 'off'
  className?: string
}) {
  const left = Math.max(0, strikes - used)
  const hot = left <= 3
  const broken = (k: number) => k >= left
  // The slab the last strike broke: the leftmost broken one.
  const fresh = hitKey != null && used > 0 && motion !== 'off' ? left : null
  const rebuild = rebuildKey != null && used === 0 && motion !== 'off'
  const crack: string[] = []
  for (let k = left; k < strikes; k++) {
    const [a, b] = zig(k)
    const x0 = k * SEG_W
    const mid = SEG_H / 2
    crack.push(
      `${x0},${a + mid}`,
      `${x0 + 4},${(a + b) / 2 + mid + (k % 2 ? -3 : 3)}`,
      `${x0 + SEG_W},${b + mid}`,
    )
  }
  return (
    <div
      role="meter"
      aria-label={t('ui.ug.gaugeLabel')}
      aria-valuemin={0}
      aria-valuemax={strikes}
      aria-valuenow={left}
      aria-valuetext={t(`ui.ug.strikesLeft.${left === 1 ? 'one' : 'other'}`, { count: left })}
      className={cx('ug-gauge', hot && 'hot', hot && left > 0 && !calm && 'shake', className)}
    >
      <div
        key={`${hitKey}:${rebuildKey}`}
        className={cx('ug-gauge-band', fresh != null && motion === 'full' && !calm && 'jolt')}
      >
        <svg
          viewBox={`0 0 ${strikes * SEG_W} ${SEG_H + 10}`}
          preserveAspectRatio="none"
          aria-hidden
          className="block h-full w-full"
        >
          {Array.from({ length: strikes }, (_, k) => (
            <polygon
              key={k}
              points={segPoints(k)}
              className={cx('ug-slab', broken(k) && 'broken', rebuild && !broken(k) && 'rebuild')}
              style={rebuild ? ({ '--k': `${k * 35}ms` } as CSSProperties) : undefined}
            />
          ))}
          {crack.length > 0 && <polyline points={crack.join(' ')} className="ug-crack" />}
          {fresh != null && <polygon points={segPoints(fresh)} className="ug-slab-flash" />}
        </svg>
        {fresh != null && motion === 'full' && (
          <i className="ug-chips" style={{ left: `${((fresh + 0.5) / strikes) * 100}%` }} aria-hidden>
            <b />
            <b />
            <b />
            <b />
          </i>
        )}
      </div>
    </div>
  )
}

/**
 * The last strike: which tile, how hard, where the finger landed (fractions of the wall's box; a key press strikes
 * the tile's centre) and a key that restarts its effects.
 */
export interface StrikeFx {
  tile: number
  roll: number
  key: number
  at?: { x: number; y: number }
}

/** A thing just dug out: which one, and a key that restarts its pop. */
export interface FoundFx {
  thing: number
  key: number
}

/** Where on the wall's box a tile's centre lies, as CSS lengths (the frame's 6 px padding counted). */
const tileCentre = (wall: Pick<Wall, 'cols' | 'rows'>, tile: number) => ({
  left: `calc(6px + (100% - 12px) * ${((tile % wall.cols) + 0.5) / wall.cols})`,
  top: `calc(6px + (100% - 12px) * ${(Math.floor(tile / wall.cols) + 0.5) / wall.rows})`,
})

/** Where a tile's flecks sit (`v0`–`v3`), so neighbouring tiles of the same rock don't look stamped. */
const tileVariant = (i: number, cols: number) => (i * 7 + Math.floor(i / cols) * 3) % 4

/** Rock flying off a strike: more and bigger chunks the bigger the roll, thrown both ways. */
function Debris({ roll }: { roll: number }) {
  const n = 2 + roll * 2
  return (
    <i className="ug-debris" aria-hidden>
      {Array.from({ length: n }, (_, k) => {
        const side = k % 2 ? 1 : -1
        const spread = 10 + ((k * 13) % 22) + roll * 6
        return (
          <b
            key={k}
            style={
              {
                '--dx': `${side * spread}px`,
                '--up': `${14 + ((k * 7) % 16) + roll * 5}px`,
                '--dy': `${18 + ((k * 11) % 20)}px`,
                '--sz': `${4 + ((k + roll) % 3) * 2}px`,
                '--rc': ['#8a6440', '#c49a63', '#4e3523'][k % 3],
              } as CSSProperties
            }
          />
        )
      })}
    </i>
  )
}

const CONFETTI = ['#ffbe2e', '#f2553f', '#34c97a', '#3a7bd5', '#ff9a85', '#fff']

/** The end over the wall: the stamp, and the collapse's dust or a cleared wall's confetti (full motion). */
function WallEndFx({ end, motion }: { end: 'cleared' | 'collapsed'; motion: 'full' | 'short' | 'off' }) {
  return (
    <>
      {motion === 'full' && end === 'collapsed' && (
        <i className="ug-cloud" aria-hidden>
          <b />
          <b />
          <b />
          <b />
          <b />
        </i>
      )}
      {motion === 'full' && end === 'cleared' && (
        <i className="ug-confetti" aria-hidden>
          {Array.from({ length: 18 }, (_, k) => (
            <b
              key={k}
              style={
                {
                  '--x': `${(k * 37) % 100}%`,
                  '--c': CONFETTI[k % CONFETTI.length],
                  '--d': `${(k * 90) % 700}ms`,
                  '--sx': `${((k * 23) % 60) - 30}px`,
                } as CSSProperties
              }
            />
          ))}
        </i>
      )}
      <b
        className={cx('ug-stamp font-normal', end === 'cleared' && 'gold', motion !== 'off' && 'slam')}
        aria-hidden
      >
        {end === 'cleared' ? t('ui.ug.stampCleared') : t('ui.ug.stampCollapsed')}
      </b>
    </>
  )
}

/**
 * The wall: what it hides drawn underneath, each tile on top a button (its rock by layers left and its dots, its row,
 * column and layers read out). A dug tile shows what lies beneath; a thin tile over something buried glints. `fx`
 * swings the pickaxe where the finger landed, and on its impact the tiles hit flash, show the layers taken, and throw
 * rock (a 3 bursts white); `found` shines on a thing just dug out; `end` stamps the wall cleared or collapsed.
 */
export function UgWall({
  wall,
  data,
  onStrike,
  disabled,
  fx,
  found,
  motion = 'full',
  calm,
  end,
}: {
  wall: Wall
  data: GameData
  onStrike?: (tile: number, at?: { x: number; y: number }) => void
  disabled?: boolean
  fx?: StrikeFx | null
  found?: FoundFx | null
  motion?: 'full' | 'short' | 'off'
  calm?: boolean
  end?: 'cleared' | 'collapsed' | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const owner = new Map<number, WallThing>()
  for (const th of wall.things) for (const i of thingTiles(wall, th)) owner.set(i, th)
  const side = fx ? fx.roll - wall.neighbourLoss : 0
  const near = (i: number) => {
    if (!fx) return false
    const dx = Math.abs((i % wall.cols) - (fx.tile % wall.cols))
    const dy = Math.abs(Math.floor(i / wall.cols) - Math.floor(fx.tile / wall.cols))
    return dx + dy === 1 && side > 0
  }
  const animate = motion !== 'off'
  const swing = motion === 'full'

  // The wall gives under the blow, harder the bigger the roll: on the pickaxe's impact, never under calm.
  const fxKey = fx?.key
  const fxRoll = fx?.roll ?? 1
  useEffect(() => {
    const el = box.current
    if (fxKey == null || !el || !swing || calm || typeof el.animate !== 'function') return
    const d = 1 + fxRoll * (fxRoll >= 3 ? 2 : 1)
    el.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(0, ${d}px)` },
        { transform: `translate(${-d / 2}px, ${-1}px)` },
        { transform: `translate(${d / 3}px, 0)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: fxRoll >= 3 ? 220 : 150, delay: UG_IMPACT_MS, easing: 'steps(5, end)' },
    )
  }, [fxKey, fxRoll, swing, calm])

  const pickAt = fx
    ? fx.at
      ? { left: `${fx.at.x * 100}%`, top: `${fx.at.y * 100}%` }
      : tileCentre(wall, fx.tile)
    : null
  const shine = found ? wall.things[found.thing] : undefined
  return (
    <div
      ref={box}
      className={cx('ug-wall relative', swing && 'swing', end === 'collapsed' && animate && (swing ? 'fall' : 'thud'))}
      style={{ aspectRatio: `${wall.cols} / ${wall.rows}` }}
    >
      <div className="ug-soil absolute inset-0" aria-hidden>
        {wall.things.map((th, k) => (
          <span
            key={k}
            className="absolute block"
            style={{
              left: `${(th.x / wall.cols) * 100}%`,
              top: `${(th.y / wall.rows) * 100}%`,
              width: `${(th.w / wall.cols) * 100}%`,
              height: `${(th.h / wall.rows) * 100}%`,
            }}
          >
            <ThingArt thing={th} data={data} done={thingDone(wall, th)} />
          </span>
        ))}
      </div>
      <div
        role="group"
        aria-label={t('ui.ug.wallLabel', { cols: wall.cols, rows: wall.rows })}
        className="ug-tiles relative grid h-full w-full"
        style={{ gridTemplateColumns: `repeat(${wall.cols}, minmax(0, 1fr))` }}
      >
        {wall.depth.map((d, i) => {
          const row = Math.floor(i / wall.cols) + 1
          const col = (i % wall.cols) + 1
          const th = owner.get(i)
          const label =
            d > 0
              ? t(`ui.ug.tile.${d === 1 ? 'one' : 'other'}`, { row, col, count: d })
              : th
                ? t('ui.ug.tileThing', { row, col, thing: thingName(th, data) })
                : t('ui.ug.tileOpen', { row, col })
          const main = !!fx && fx.tile === i
          const hit = animate && fx && (main || near(i))
          const glint = d === 1 && th && !end && !thingDone(wall, th)
          return (
            <button
              key={i}
              type="button"
              aria-label={label}
              disabled={disabled || d === 0}
              onClick={(e) => {
                // A tap strikes where the finger landed; a key press (no pointer: detail 0), the tile's centre.
                const r = box.current?.getBoundingClientRect()
                const at =
                  e.detail > 0 && r && r.width > 0 && r.height > 0
                    ? { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
                    : undefined
                onStrike?.(i, at)
              }}
              className={cx('ug-tile relative', d > 0 ? `d${d} v${tileVariant(i, wall.cols)}` : 'open')}
            >
              {d > 0 && <i className={cx('ug-dots', `n${d}`)} aria-hidden />}
              {glint && animate && (
                <i className="ug-glint" style={{ '--gd': `${(i * 373) % 2400}ms` } as CSSProperties} aria-hidden />
              )}
              {hit && <i key={fx!.key} className={cx('ug-flash', main && 'main')} aria-hidden />}
              {hit && (
                <i
                  key={`n${fx!.key}`}
                  className={cx('ug-dmg', main && 'main', main && fx!.roll >= 3 && 'crit')}
                  aria-hidden
                >
                  -{main ? fx!.roll : side}
                </i>
              )}
              {hit && main && swing && <Debris key={`d${fx!.key}`} roll={fx!.roll} />}
            </button>
          )
        })}
      </div>
      {animate && fx && pickAt && (
        <i key={`p${fx.key}`} className={cx('ug-pick', swing ? 'full' : 'short')} style={pickAt} aria-hidden>
          <span>
            <PixelIcon name="pickaxe" size={64} />
          </span>
        </i>
      )}
      {swing && fx && pickAt && fx.roll >= 3 && !calm && (
        <i key={`b${fx.key}`} className="ug-burst" style={pickAt} aria-hidden />
      )}
      {animate && shine && found && (
        <i
          key={`f${found.key}`}
          className="ug-burst"
          style={{
            left: `calc(6px + (100% - 12px) * ${(shine.x + shine.w / 2) / wall.cols})`,
            top: `calc(6px + (100% - 12px) * ${(shine.y + shine.h / 2) / wall.rows})`,
          }}
          aria-hidden
        />
      )}
      {end && <WallEndFx end={end} motion={motion} />}
    </div>
  )
}

/** The pickaxe's die as rolled: a white die showing the roll; it tumbles when `rollKey` changes. */
export function PickaxeDie({
  roll,
  rollKey,
  size = 56,
}: {
  roll: number | null
  rollKey?: number
  size?: number
}) {
  return (
    <Die
      type="base"
      face={roll == null ? null : { kind: 'number', value: roll }}
      size={size}
      rollKey={rollKey}
      label={roll == null ? t('ui.ug.notRolled') : t('ui.ug.rolled', { n: roll })}
    />
  )
}

/** The die's six faces; the one that came up ringed in gold, lifted. */
export function PickaxeFaces({
  faces,
  face,
  size = 28,
  next,
}: {
  faces: number[]
  face?: number | null
  size?: number
  next?: number[]
}) {
  return (
    <span
      className="flex flex-wrap gap-1"
      role="img"
      aria-label={t('ui.ug.facesLabel', { faces: faces.join(', ') })}
    >
      {faces.map((v, i) => (
        <Die
          key={i}
          type="base"
          face={{ kind: 'number', value: v }}
          size={size}
          combo={face === i || (!!next && next[i] !== faces[i])}
          className={cx(face === i && '-translate-y-1')}
        />
      ))}
    </span>
  )
}

const OUTCOME_TONE: Record<HaulLine['outcome'], string> = {
  bag: 'bg-good-pale text-good shadow-[inset_0_0_0_2px_rgb(var(--c-good))]',
  sent: 'bg-sky text-ink shadow-ring-thin',
  box: 'bg-good-pale text-good shadow-[inset_0_0_0_2px_rgb(var(--c-good))]',
  plate: 'bg-gold text-ink shadow-ring-thin light-scope',
  lost: 'bg-well-deep text-ink',
}

/** A haul's thing, as a small picture: its sprite filling a square on night. */
export function ThingIcon({ thing, data, size = 40 }: { thing: WallThing; data: GameData; size?: number }) {
  const id = thingSprite(thing)
  return (
    <span
      className="relative grid shrink-0 place-items-center bg-night shadow-ring"
      style={{ width: size + 4, height: size + 4 }}
      aria-hidden
    >
      <span className="absolute inset-[3px]">
        {id ? <UgSprite id={id} fit={{ w: 1, h: 1 }} /> : <ItemSprite item={data.items[thing.item ?? '']} size={size - 4} />}
      </span>
    </span>
  )
}

/** What a collapsed wall's new gauge takes, as the engine says (`refreshOffer`). */
export type UgRefreshOffer = ReturnType<typeof refreshOffer>

/**
 * A wall's end, in the dig's footer: the stamp over the wall says how it ended, so this is only what to do next. A
 * collapsed wall offers a new gauge (docs/34 §12) when the engine does: DIG ON with a kit, or with a kit's price (gold;
 * drawn disabled with what's missing when the purse is short or the limit reached, its tap saying why). Then SEE THE
 * HAUL. The title and the count are read out.
 */
export function UgWallEnd({
  cleared,
  found,
  n,
  used,
  offer,
  onRefresh,
  onHaul,
}: {
  cleared: boolean
  found: number
  n: number
  used: number
  offer: UgRefreshOffer
  onRefresh: () => void
  onHaul: () => void
}) {
  const { t } = useT()
  const blocked = offer?.kind === 'buy' && (offer.soldOut || offer.short > 0)
  const name = !offer
    ? ''
    : offer.kind === 'kit'
      ? t('ui.ug.refreshKit', { n: offer.held })
      : offer.soldOut
        ? t('ui.ug.refreshSoldOut')
        : offer.short > 0
          ? t('ui.shop.needMore', { price: money(offer.short) })
          : t('ui.ug.refreshBuy', { price: money(offer.price) })
  return (
    <div className="grid gap-2">
      <p className="sr-only" role="status">
        {cleared ? t('ui.ug.clearedTitle') : t('ui.ug.collapsedTitle')} {t('ui.ug.endLine', { found, n, used })}
      </p>
      {offer && (
        <PixelButton
          data-testid="ug-refresh"
          variant={blocked ? 'secondary' : 'gold'}
          aria-disabled={blocked}
          aria-label={name}
          onClick={onRefresh}
        >
          {offer.kind === 'buy' && offer.soldOut ? (
            t('ui.live.shop.soldOut')
          ) : offer.kind === 'buy' && offer.short > 0 ? (
            t('ui.shop.needMore', { price: money(offer.short) })
          ) : (
            <>
              {t('ui.ug.digOn')}
              <PixelIcon name="kit" size={26} />
              {offer.kind === 'kit' ? '×1' : money(offer.price)}
            </>
          )}
        </PixelButton>
      )}
      <PixelButton variant="primary" size="lg" onClick={onHaul}>
        {t('ui.ug.seeHaul')}
      </PixelButton>
    </div>
  )
}

/**
 * What the wall hides, one slot per thing: its shape as a dark silhouette with "?" while it's buried, its picture once
 * dug out (`popped` makes a slot pop, after `delay`, as the thing flying to it lands). Each slot's name is read out.
 */
export function UgBuriedSlots({
  wall,
  data,
  popped,
  delay = 0,
}: {
  wall: Wall
  data: GameData
  popped?: FoundFx | null
  delay?: number
}) {
  const found = wall.things.filter((th) => thingDone(wall, th)).length
  return (
    <ul
      aria-label={t('ui.ug.buried', { n: wall.things.length, found })}
      className="m-0 flex list-none flex-wrap gap-2.5 p-0"
    >
      {wall.things.map((th, k) => {
        const done = thingDone(wall, th)
        const pop = popped?.thing === k
        const id = thingSprite(th)
        const cols = Math.min(th.w, 3)
        return (
          <li
            key={`${k}:${pop ? popped!.key : 0}`}
            data-slot={k}
            aria-label={done ? thingName(th, data) : t('ui.ug.stillBuried')}
            className={cx('ug-slot', done && 'done', pop && done && 'pop')}
            style={{ '--fly': `${delay}ms` } as CSSProperties}
          >
            {done ? (
              <span className="absolute inset-[6px]" aria-hidden>
                {id ? (
                  <UgSprite id={id} fit={{ w: 1, h: 1 }} />
                ) : (
                  <ItemSprite item={data.items[th.item ?? '']} size={36} />
                )}
              </span>
            ) : (
              <>
                <span
                  className="ug-shape"
                  style={{ gridTemplateColumns: `repeat(${cols}, 9px)` }}
                  aria-hidden
                >
                  {Array.from({ length: cols * Math.min(th.h, 3) }, (_, c) => (
                    <i key={c} />
                  ))}
                </span>
                <b className="ug-q font-normal" aria-hidden>
                  ?
                </b>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A thing just dug out, on its way from the wall to its slot. */
export interface UgFlightFx {
  key: number
  thing: WallThing
  from: { x: number; y: number; w: number; h: number }
  to: { x: number; y: number; w: number; h: number }
}

/** How long a thing takes to fly to its slot, after the pickaxe's impact. */
export const UG_FLY_MS = 620

/** The flight: the thing's picture rises out of the wall in an arc, shining, and shrinks into its slot. */
export function UgFlight({ fx, data, delay = 0 }: { fx: UgFlightFx; data: GameData; delay?: number }) {
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = el.current
    if (!node || typeof node.animate !== 'function') return
    const dx = fx.to.x + fx.to.w / 2 - (fx.from.x + fx.from.w / 2)
    const dy = fx.to.y + fx.to.h / 2 - (fx.from.y + fx.from.h / 2)
    const k = Math.min(fx.to.w / fx.from.w, fx.to.h / fx.from.h)
    node.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.3}px, ${Math.min(dy * 0.3, 0) - 60}px) scale(1.35)`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 1 },
      ],
      { duration: UG_FLY_MS, delay, easing: 'steps(9, end)', fill: 'both' },
    )
  }, [fx, delay])
  const id = thingSprite(fx.thing)
  return (
    <span
      ref={el}
      className="ug-fly"
      style={{ left: fx.from.x, top: fx.from.y, width: fx.from.w, height: fx.from.h }}
      aria-hidden
    >
      {id ? <UgSprite id={id} fit={{ w: fx.thing.w, h: fx.thing.h }} /> : <ItemSprite item={data.items[fx.thing.item ?? '']} size={48} />}
    </span>
  )
}

/** The haul's cards turn over this far apart. */
export const UG_CARD_MS = 280

/** What the orbs of a haul that went into the bag are worth, counting up from 0 as the cards turn. */
export function HaulWorth({ lines, data, reveal }: { lines: HaulLine[]; data: GameData; reveal?: boolean }) {
  const cfg = ugCfg(data)
  const worth = lines.reduce((n, l) => {
    const size = sizeOf(l.thing.kind)
    return l.outcome === 'bag' && size ? n + orbPrice(cfg, l.thing.colour!, size) : n
  }, 0)
  const shown = useCountUp(worth, reveal ? 300 + lines.length * UG_CARD_MS : 0, reveal ? 0 : worth)
  if (!worth) return null
  return (
    <p className="m-0 flex items-center justify-center gap-2 bg-cream px-3 py-1.5 text-[22px] leading-none shadow-card-gold">
      <OrbArt colour="red" px={20} />
      <span className="tabular-nums">{t('ui.ug.bagWorth', { price: money(shown) })}</span>
    </p>
  )
}

/** The haul, one line per thing: its picture, its name, where it went. A new plate first, then in the wall's order. */
export function HaulList({
  lines,
  data,
  reveal,
}: {
  lines: HaulLine[]
  data: GameData
  /** The cards turn over one by one (`UG_CARD_MS` apart), a new plate with a flash. */
  reveal?: boolean
}) {
  const order: HaulLine['outcome'][] = ['plate', 'box', 'bag', 'sent', 'lost']
  const sorted = [...lines].sort((a, b) => order.indexOf(a.outcome) - order.indexOf(b.outcome))
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {sorted.map((l, k) => {
        const item = l.thing.kind === 'fossil' ? data.items[l.thing.item ?? ''] : undefined
        const species = item?.effect.kind === 'fossil' ? data.species[item.effect.dex] : undefined
        const sub =
          l.outcome === 'plate'
            ? t('ui.ug.out.plate', { type: typeName(l.thing.plate!) })
            : l.outcome === 'box'
              ? t('ui.ug.out.boxSub', { species: species?.name ?? '' })
              : l.outcome === 'sent'
                ? t('ui.ug.out.sentSub', { colour: t(`ui.ug.colour.${l.thing.colour}`), name: l.to!.name })
                : // The tag says where an orb went; a lost thing's name says it all.
                  null
        const tag =
          l.outcome === 'sent'
            ? t('ui.ug.out.sent', { name: l.to!.name })
            : l.outcome === 'plate'
              ? t('ui.common.new')
              : t(`ui.ug.out.${l.outcome}`)
        return (
          <li
            key={k}
            style={reveal ? ({ '--i': `${k * UG_CARD_MS}ms` } as CSSProperties) : undefined}
            className={cx(
              'flex items-center gap-2.5 p-2',
              reveal && 'ug-card',
              reveal && l.outcome === 'plate' && 'plate',
              l.outcome === 'plate'
                ? 'bg-cream shadow-card-gold'
                : l.outcome === 'lost'
                  ? 'bg-well shadow-ring-line'
                  : 'bg-paper shadow-card',
            )}
          >
            {l.outcome === 'lost' ? (
              <span
                className="grid h-11 w-11 shrink-0 place-items-center bg-well-deep text-[22px] text-ink shadow-ring-line"
                aria-hidden
              >
                ?
              </span>
            ) : (
              <ThingIcon thing={l.thing} data={data} />
            )}
            <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
              <b className="truncate text-[20px] font-normal leading-none">
                {l.outcome === 'lost' ? t('ui.ug.out.lost') : thingName(l.thing, data)}
              </b>
              {sub && <small className="font-pixel-sm text-[16px] text-muted">{sub}</small>}
            </span>
            {l.outcome !== 'lost' && (
              <span
                className={cx(
                  'shrink-0 whitespace-nowrap px-1.5 pb-0.5 pt-px font-pixel-sm text-[16px]',
                  OUTCOME_TONE[l.outcome],
                )}
              >
                {tag}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The plates: one tile per type, its plate and type when held, a dim plate and "?" when not. */
export function PlateGrid({ held }: { held: readonly PokeType[] }) {
  const all: PokeType[] = ['fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']
  return (
    <ul className="m-0 grid list-none grid-cols-6 gap-1 p-0">
      {all.map((type) => {
        const has = held.includes(type)
        const name = t(`plate.${type}`)
        return (
          <li
            key={type}
            title={has ? name : undefined}
            aria-label={has ? name : t('ui.ug.plateMissing')}
            className={cx(
              'grid min-h-[40px] place-items-center px-0.5 py-1',
              has ? 'bg-paper text-ink shadow-ring-thin' : 'bg-well-deep text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
            )}
          >
            <span className="relative block aspect-[4/3] w-full max-w-[40px]">
              <UgSprite id={`plate.${type}`} fit={{ w: 4, h: 3 }} className={cx(!has && 'opacity-30 grayscale')} />
            </span>
            {/* The plate's picture says which: its name is the tile's label (and its tooltip), never 14 px print. */}
          </li>
        )
      })}
    </ul>
  )
}

/** The orb bag: a row per colour, a column per size, and what it's worth. */
export function OrbBagTable({
  bag,
  cfg,
}: {
  bag: Record<OrbColour, Record<OrbSize, number>>
  cfg: UndergroundConfig
}) {
  const { t } = useT()
  const colours: OrbColour[] = ['red', 'blue', 'green']
  const sizes: OrbSize[] = ['s', 'm', 'l']
  return (
    <table className="w-full border-separate border-spacing-[3px] text-[17px]">
      <caption className="sr-only">{t('ui.ug.bagCaption', { price: money(orbsValue(bag, cfg)) })}</caption>
      <thead>
        <tr>
          <th />
          {sizes.map((s) => (
            <th key={s} scope="col" className="font-pixel-sm text-[16px] font-normal text-muted">
              {t(`ui.ug.size.${s}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {colours.map((c) => (
          <tr key={c}>
            <th scope="row" className="text-left font-normal">
              <span className="inline-flex items-center gap-1.5">
                <OrbArt colour={c} px={14} />
                {t(`ui.ug.colour.${c}`)}
              </span>
            </th>
            {sizes.map((s) => (
              <td key={s} className="bg-well text-center font-pixel-sm tabular-nums text-ink">
                {bag[c][s]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The solo price, said before anything sells: a red-ringed note (a warning icon, never colour alone) with the share
 * and both prices.
 */
export function UgSoloWarning({
  share,
  price,
  full,
  className,
}: {
  share: number
  price: number
  full: number
  className?: string
}) {
  const { t } = useT()
  return (
    <p
      role="note"
      className={cx(
        'm-0 flex items-start gap-2 bg-rose p-2.5 text-[18px] leading-tight text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-danger))]',
        className,
      )}
    >
      <PixelIcon name="warning" size={20} className="mt-0.5 shrink-0" />
      <span>{t('ui.ug.soloWarn', { share, price: money(price), full: money(full) })}</span>
    </p>
  )
}

/**
 * Selling outside a full team, confirmed: both prices side by side, what's given up, KEEP MY ORBS or the red SELL FOR.
 * Nothing sells until the player says so.
 */
export function UgSellModal({
  open,
  onClose,
  onSell,
  share,
  price,
  full,
}: {
  open: boolean
  onClose: () => void
  onSell: () => void
  share: number
  price: number
  full: number
}) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('ui.ug.soloTitle', { share })} className="max-w-md">
      <div className="flex flex-col gap-3">
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 bg-well p-2.5 shadow-ring-line">
          <dt className="text-[19px] leading-tight text-muted">{t('ui.ug.soloFull')}</dt>
          <dd className="m-0 text-right font-pixel-sm text-[18px] tabular-nums text-muted line-through">
            {money(full)}
          </dd>
          <dt className="text-[22px] leading-tight">{t('ui.ug.soloNow')}</dt>
          <dd className="m-0 text-right text-[28px] leading-none tabular-nums text-danger">{money(price)}</dd>
        </dl>
        <p
          role="note"
          className="m-0 flex items-start gap-2 bg-rose p-2.5 text-[18px] leading-tight text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-danger))]"
        >
          <PixelIcon name="warning" size={20} className="mt-0.5 shrink-0" />
          <span>{t('ui.ug.soloLoss', { price: money(full - price) })}</span>
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2.5">
          <PixelButton onClick={onClose}>{t('ui.ug.keep')}</PixelButton>
          <PixelButton variant="danger" onClick={onSell}>
            {t('ui.ug.soloSell', { price: money(price) })}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/** The rules' rows, with the admin's numbers. */
export function ugRuleRows(data: GameData): RuleRow[] {
  const cfg = ugCfg(data)
  const free = freeKitRules(cfg)
  const w = wallRules(cfg)
  return [
    {
      icon: <PixelIcon name="kit" size={26} />,
      title: t('ui.ug.rules.kits.title'),
      text: t('ui.ug.rules.kits.text', { free: free.amount, hours: cfg.kits.freePeriodHours, cap: free.cap }),
    },
    {
      icon: <PixelIcon name="pickaxe" size={26} />,
      title: t('ui.ug.rules.wall.title'),
      text: t(ugRefreshOn(data) ? 'ui.ug.rules.wall.textRefresh' : 'ui.ug.rules.wall.text', {
        cols: w.cols,
        rows: w.rows,
        strikes: w.strikes,
      }),
    },
    {
      icon: (
        <span className="flex gap-0.5">
          <OrbArt colour="red" px={10} />
          <OrbArt colour="blue" px={10} />
          <OrbArt colour="green" px={10} />
        </span>
      ),
      title: t('ui.ug.rules.orbs.title'),
      text: !cfg.sellNeedsFull
        ? t('ui.ug.rules.orbs.textFree')
        : soloShare(cfg) > 0
          ? t('ui.ug.rules.orbs.textSolo', { share: soloShare(cfg) })
          : t('ui.ug.rules.orbs.text'),
    },
    {
      icon: <PlateArt type="fire" px={28} />,
      title: t('ui.ug.rules.plates.title'),
      text: t('ui.ug.rules.plates.text'),
    },
  ]
}

/** The Underground's rules: once per event (Later / Let's go!), and again from INFO (OK). */
export function UgRulesModal({
  open,
  onClose,
  onGo,
  data,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
  data: GameData
}) {
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      onGo={onGo}
      title={t('ui.live.underground.name')}
      picture={<UgCave big className="absolute inset-0" />}
      icon="pickaxe"
      rules={ugRuleRows(data)}
    />
  )
}

/**
 * The Explorakits as pictures: one slot per free kit the cap allows (held ones gold; the next one with its clock as a
 * ring filling round it and the time under it; the rest empty), and the bought kits in a blue slot with their count.
 * The whole row is read out as one line.
 */
export function UgKitSlots({
  freeKits,
  cap,
  bought,
  tillFree,
  everyMs,
  label,
}: {
  freeKits: number
  cap: number
  bought: number
  /** ms until the next free kit; null at the cap. */
  tillFree: number | null
  everyMs: number
  label: string
}) {
  const slots = Math.max(cap, freeKits)
  const p = tillFree != null && Number.isFinite(everyMs) ? Math.round((1 - tillFree / everyMs) * 100) : 0
  return (
    <div role="img" aria-label={label} className="flex flex-wrap items-center gap-2 pb-2">
      {Array.from({ length: slots }, (_, k) => {
        const held = k < freeKits
        const next = !held && k === freeKits && tillFree != null
        return (
          <span
            key={k}
            className={cx('ug-kitslot', held && 'held', next && 'next')}
            style={next ? ({ '--p': Math.max(0, Math.min(100, p)) } as CSSProperties) : undefined}
          >
            <PixelIcon name="kit" size={34} className={cx(!held && 'opacity-25 grayscale')} />
            {next && <b className="ug-kit-time font-normal">{countdownShort(tillFree!)}</b>}
          </span>
        )
      })}
      {bought > 0 && (
        <span className="ug-kitslot bought">
          <PixelIcon name="kit" size={34} />
          <b className="absolute -right-1.5 -top-1.5 bg-ink px-1 text-[16px] font-normal leading-tight text-paper">
            {bought}
          </b>
        </span>
      )}
    </div>
  )
}

/** "5h", "42m", "30s": the next free kit's time, short enough for a badge. */
function countdownShort(ms: number): string {
  const m = Math.ceil(ms / 60_000)
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
  return m > 1 ? `${m}m` : `${Math.max(1, Math.ceil(ms / 1000))}s`
}

/** The pickaxe's metal by tier: stone, bronze, steel, gold, crystal, as it climbs its levels. */
const PICK_TIERS: Record<string, string>[] = [
  { d: '#5f5446', s: '#8f8270', S: '#bdb09a' },
  { d: '#8a4f1e', s: '#c27a3a', S: '#f0b070' },
  {},
  { d: '#a8780a', s: '#f0c030', S: '#fff0a0' },
  { d: '#1f6f9a', s: '#60c8f0', S: '#e0faff' },
]

/** Which tier a level is in: the levels spread over the five metals, the top level always crystal. */
export const pickTier = (level: number, max: number): number =>
  max > 0 ? Math.min(4, Math.round((level / max) * 4)) : 0

/** The pickaxe on its stand, in its tier's metal, its level on a tag; `up` plays the level-up flourish. */
export function UgPickStand({ level, max, up }: { level: number; max: number; up?: boolean }) {
  const tier = pickTier(level, max)
  return (
    <span className={cx('ug-pickstand shrink-0', `t${tier}`, up && 'up')} aria-hidden>
      <PixelIcon name="pickaxe" size={60} palette={PICK_TIERS[tier]} />
      <b className="ug-lv font-normal">{t('ui.ug.lv', { level })}</b>
    </span>
  )
}

/** Where the heap's orbs lie, bottom row first: x (% of the width) and bottom (px). */
const HEAP: [number, number][] = [
  [50, 4], [32, 4], [68, 4], [16, 4], [84, 4],
  [41, 28], [59, 28], [24, 26], [76, 26],
  [50, 50], [34, 48], [66, 48],
]
const ORB_PX: Record<OrbSize, number> = { s: 20, m: 28, l: 34 }

/**
 * The orb bag as a heap: its orbs piled up, the large ones at the bottom (up to 12 drawn); under it, each colour's
 * count. Each colour's sizes are read out.
 */
export function UgOrbHeap({ bag }: { bag: Record<OrbColour, Record<OrbSize, number>> }) {
  const { t } = useT()
  const colours: OrbColour[] = ['red', 'blue', 'green']
  const sizes: OrbSize[] = ['l', 'm', 's']
  const all: { colour: OrbColour; size: OrbSize }[] = []
  for (const size of sizes)
    for (let i = 0; i < 12; i++) for (const colour of colours) if (bag[colour][size] > i) all.push({ colour, size })
  const pile = all.slice(0, HEAP.length)
  return (
    <div className="grid gap-2">
      <div className="ug-heap" aria-hidden>
        {pile.length === 0 && (
          <span className="ug-heap-empty">
            <OrbArt colour="red" px={28} className="grayscale" />
          </span>
        )}
        {pile.map((o, k) => (
          <span key={k} style={{ left: `${HEAP[k]![0]}%`, bottom: HEAP[k]![1] }}>
            <OrbArt colour={o.colour} size={o.size} px={ORB_PX[o.size]} />
          </span>
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
        {colours.map((c) => {
          const n = bag[c].s + bag[c].m + bag[c].l
          return (
            <li
              key={c}
              aria-label={t('ui.ug.bagRow', {
                colour: t(`ui.ug.colour.${c}`),
                s: bag[c].s,
                m: bag[c].m,
                l: bag[c].l,
              })}
              className={cx(
                'flex items-center justify-center gap-1.5 py-1 text-[22px] leading-none',
                n ? 'bg-paper shadow-ring-thin' : 'bg-well text-muted',
              )}
            >
              <OrbArt colour={c} px={18} className={cx(!n && 'opacity-40 grayscale')} />
              <span className="tabular-nums" aria-hidden>
                ×{n}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A short line under a section title, muted. */
export function UgNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('m-0 font-pixel-sm text-[16px] leading-snug text-muted', className)}>{children}</p>
}
