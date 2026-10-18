// The Underground's pieces (docs/34; docs/15 §32): the cave drawn in code (Home's square, the rules, the Mart), the
// crack gauge, the wall with what it hides, the pickaxe die, orbs, plates and the haul's lines. They draw what the
// engine decided (engine/underground.ts); the screens are screens/events/Underground*.tsx.
import { type CSSProperties, type ReactNode } from 'react'
import {
  freeKitRules,
  orbsValue,
  thingDone,
  thingTiles,
  ugCfg,
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
import { ItemSprite } from './ItemSprite'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'

const SPRITES = atlas.sprites as unknown as Record<string, [number, number, number, number] | undefined>
const [SHEET_W, SHEET_H] = atlas.size as [number, number]

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

/**
 * The crack gauge, like the games' cleft meter: one section per strike, cracking from the right. Its last three
 * sections left, it turns red (and shakes, unless the player asked for calm).
 */
export function CrackGauge({
  strikes,
  used,
  calm,
  className,
}: {
  strikes: number
  used: number
  calm?: boolean
  className?: string
}) {
  const left = Math.max(0, strikes - used)
  const hot = left <= 3
  return (
    <div
      role="meter"
      aria-label={t('ui.ug.gaugeLabel')}
      aria-valuemin={0}
      aria-valuemax={strikes}
      aria-valuenow={left}
      aria-valuetext={t(`ui.ug.strikesLeft.${left === 1 ? 'one' : 'other'}`, { count: left })}
      className={cx(
        'ug-gauge flex flex-row-reverse',
        hot && 'hot',
        hot && left > 0 && !calm && 'shake',
        className,
      )}
    >
      {Array.from({ length: strikes }, (_, i) => (
        <span key={i} className={cx('ug-seg', i < used && 'used')}>
          {i < used && (
            <svg viewBox="0 0 10 11" preserveAspectRatio="none" aria-hidden shapeRendering="crispEdges">
              <rect x="4" y="0" width="2" height="3" />
              <rect x="5" y="3" width="2" height="3" />
              <rect x="3" y="6" width="2" height="3" />
              <rect x="4" y="9" width="2" height="2" />
            </svg>
          )}
        </span>
      ))}
    </div>
  )
}

/** The last strike, for the tiles it hit: which tile, how hard, and a key that restarts its flash. */
export interface StrikeFx {
  tile: number
  roll: number
  key: number
}

/**
 * The wall: what it hides drawn underneath, each tile on top a button (its layers as rock and as dots, its row,
 * column and layers read out). A dug tile shows what lies beneath. `fx` flashes the tiles the last strike hit.
 */
export function UgWall({
  wall,
  data,
  onStrike,
  disabled,
  fx,
  motion = 'full',
  collapsing,
}: {
  wall: Wall
  data: GameData
  onStrike?: (tile: number) => void
  disabled?: boolean
  fx?: StrikeFx | null
  motion?: 'full' | 'short' | 'off'
  collapsing?: boolean
}) {
  const owner = new Map<number, WallThing>()
  for (const th of wall.things) for (const i of thingTiles(wall, th)) owner.set(i, th)
  const near = (i: number) => {
    if (!fx) return false
    const dx = Math.abs((i % wall.cols) - (fx.tile % wall.cols))
    const dy = Math.abs(Math.floor(i / wall.cols) - Math.floor(fx.tile / wall.cols))
    return dx + dy === 1 && fx.roll - wall.neighbourLoss > 0
  }
  const animate = motion !== 'off'
  return (
    <div
      className={cx('ug-wall relative', collapsing && animate && (motion === 'full' ? 'fall' : 'thud'))}
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
          const hit = animate && fx && (fx.tile === i || near(i))
          return (
            <button
              key={i}
              type="button"
              aria-label={label}
              disabled={disabled || d === 0}
              onClick={() => onStrike?.(i)}
              className={cx('ug-tile relative', d > 0 ? `d${d}` : 'open')}
            >
              {d > 0 && <i className={cx('ug-dots', `n${d}`)} aria-hidden />}
              {hit && <i key={fx!.key} className={cx('ug-flash', fx!.tile === i && 'main')} aria-hidden />}
              {hit && fx!.tile === i && motion === 'full' && (
                <i key={`d${fx!.key}`} className="ug-dust" aria-hidden>
                  <b />
                  <b />
                  <b />
                  <b />
                </i>
              )}
            </button>
          )
        })}
      </div>
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

/** The haul, one line per thing: its picture, its name, where it went. A new plate first, then in the wall's order. */
export function HaulList({ lines, data }: { lines: HaulLine[]; data: GameData }) {
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
                : l.outcome === 'bag'
                  ? t('ui.ug.out.bagSub')
                  : t('ui.ug.out.lostSub')
        const tag =
          l.outcome === 'sent'
            ? t('ui.ug.out.sent', { name: l.to!.name })
            : l.outcome === 'plate'
              ? t('ui.common.new')
              : t(`ui.ug.out.${l.outcome}`)
        return (
          <li
            key={k}
            className={cx(
              'flex items-center gap-2.5 p-2',
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
              <small className="font-pixel-sm text-[15px] text-muted">{sub}</small>
            </span>
            {l.outcome !== 'lost' && (
              <span
                className={cx(
                  'shrink-0 whitespace-nowrap px-1.5 pb-0.5 pt-px font-pixel-sm text-[14px]',
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
              'grid justify-items-center gap-0.5 px-0.5 pb-0.5 pt-1 font-pixel-sm text-[12px] leading-none',
              has ? 'bg-paper text-ink shadow-ring-thin' : 'bg-well-deep text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
            )}
          >
            <span className="relative block aspect-[4/3] w-full max-w-[40px]">
              <UgSprite id={`plate.${type}`} fit={{ w: 4, h: 3 }} className={cx(!has && 'opacity-30 grayscale')} />
            </span>
            <span className="max-w-full truncate">{has ? typeName(type) : '?'}</span>
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
            <th key={s} scope="col" className="font-pixel-sm text-[15px] font-normal text-muted">
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
      text: t('ui.ug.rules.wall.text', { cols: w.cols, rows: w.rows, strikes: w.strikes }),
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
      text: t(cfg.sellNeedsFull ? 'ui.ug.rules.orbs.text' : 'ui.ug.rules.orbs.textFree'),
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

/** A short line under a section title, muted. */
export function UgNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('m-0 font-pixel-sm text-[15px] leading-snug text-muted', className)}>{children}</p>
}
