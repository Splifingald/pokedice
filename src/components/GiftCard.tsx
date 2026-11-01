// The Gift card's pieces (docs/64 §4.0, §4.2; docs/15 §45): the present on the battle's stage (the area's picture, the
// present's timelines over it), its plate, the level gauge, a reward's line, the preview card and the rules. They only
// draw what the engine decided (engine/giftCard.ts); the area screen (GiftView) plays the steps. Every state is on
// /kitchen-sink (GiftCardBits).
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { MONEY, giftBreakChance, giftCfg, giftHelper, giftTop, type GiftItem } from '@/engine'
import { artPlacement, artUrl, battleWindow, pictureOf } from '@/fx/areaArt'
import { setArtUnderStage } from '@/fx/scenes'
import { type Hud, type Timeline } from '@/fx/timeline'
import { presentPicture, type PresentLook } from '@/fx/timelines/present'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { PlateBox } from '@/screens/battle/Plates'
import { cx } from '@/theme/util'
import { AreaArt } from './AreaArt'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { RulesModal, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'
import { StageCanvas } from './StageCanvas'

/** The present drawn as a picture on the page (its pixel art, scaled up whole). */
export function PresentImg({
  look = 'red',
  level = 3,
  scale = 2,
  className,
}: {
  look?: PresentLook
  level?: number
  scale?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const art = presentPicture(look, level)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g) return
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, art.width, art.height)
    g.drawImage(art, 0, 0)
  }, [art])
  return (
    <canvas
      ref={ref}
      width={art.width}
      height={art.height}
      aria-hidden
      className={cx('pixelated shrink-0', className)}
      style={{ width: art.width * scale, height: art.height * scale }}
    />
  )
}

/** One take of the present on the stage: its timeline, what it waits for, and what it tells the screen. */
export interface PresentTake {
  timeline: Timeline<unknown>
  ready?: Promise<unknown>
  hud?: Hud
  onEnd?: () => void
}

/**
 * The present on the battle's stage: 240 × 160 art pixels scaled up, the area's picture as the battle cuts it (a winter
 * night where there's none), the present's take playing over it on one canvas (every take holds its last frame).
 */
export function GiftStage({
  areaId,
  take,
  label,
  children,
}: {
  areaId: string | null
  take: PresentTake
  label: string
  /** The plate over the stage. */
  children?: ReactNode
}) {
  const pic = pictureOf(areaId)
  // The timelines draw no background of their own: the picture (or the night) shows through the canvas.
  useLayoutEffect(() => {
    setArtUnderStage(true)
    return () => setArtUnderStage(false)
  }, [])
  return (
    <div
      className="relative isolate z-0 aspect-[3/2] w-full select-none overflow-hidden"
      style={{ background: 'linear-gradient(#1b2f52, #2f5a86 70%, #dce9f5)' }}
    >
      {pic && <AreaArt key={pic.id} src={pic.url} place={artPlacement(battleWindow(pic))} />}
      <StageCanvas
        timeline={take.timeline}
        ready={take.ready}
        hud={take.hud}
        onEnd={take.onEnd}
        label={label}
        className="absolute inset-0"
      />
      <div className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto">{children}</div>
    </div>
  )
}

/** The present's plate, top left on the stage as a foe's: its name, its level out of the top, Delibird's help. */
export function GiftPlate({
  level,
  top,
  boss,
  helper,
}: {
  level: number
  top: number
  boss?: boolean
  helper?: boolean
}) {
  const { t } = useT()
  const name = t(boss ? 'ui.giftCard.bossName' : 'ui.giftCard.name')
  const lv = boss ? t('ui.giftCard.levelBoss', { level }) : t('ui.giftCard.levelOf', { level, top })
  return (
    <PlateBox label={`${name}, ${lv}`} className="left-1.5 top-1.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <PixelIcon name="gift" size={14} className="shrink-0" />
        <b className="min-w-0 truncate text-[20px] font-normal leading-none">{name}</b>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-pixel-sm text-[16px] leading-none">{lv}</span>
        {helper && <HelperChip />}
      </span>
    </PlateBox>
  )
}

/** Delibird's help, as a chip: its sprite and "Delibird helps" (never the sprite alone). */
export function HelperChip({ className }: { className?: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const dex = giftHelper(giftCfg(data)).dex
  const name = data.species[dex]?.name ?? `#${dex}`
  return (
    <span
      className={cx(
        'light-scope inline-flex items-center gap-1 bg-gold-light pr-1.5 text-[15px] leading-none text-ink shadow-ring',
        className,
      )}
    >
      <SpriteImg dex={dex} size={22} className="-my-1" />
      {t('ui.giftCard.helps', { name })}
    </span>
  )
}

/**
 * The level gauge: a step per level up to the top, the ones reached filled gold (each its number, never colour alone),
 * the one it's at ringed; a boss's present shows its steps with no top. A meter for screen readers.
 */
export function GiftGauge({
  level,
  top,
  boss,
  className,
}: {
  level: number
  top: number
  boss?: boolean
  className?: string
}) {
  const { t } = useT()
  const steps = Array.from({ length: top }, (_, i) => i + 1)
  return (
    <div
      role="meter"
      aria-valuemin={1}
      aria-valuemax={top}
      aria-valuenow={level}
      aria-label={t('ui.giftCard.gauge')}
      aria-valuetext={boss ? t('ui.giftCard.levelBoss', { level }) : t('ui.giftCard.levelOf', { level, top })}
      className={cx('flex items-end gap-1', className)}
    >
      {steps.map((n) => {
        const reached = n <= level
        const here = n === level
        // Each step a little taller than the last: the present grows.
        const h = 16 + n * 3
        return (
          <span
            key={n}
            aria-hidden
            className={cx(
              'pixel-corners relative flex flex-1 items-center justify-center font-pixel-sm text-[16px] leading-none',
              reached ? 'light-scope bg-gold text-ink' : 'bg-line text-muted',
              here ? 'shadow-[0_0_0_2px_#24304f,0_0_0_4px_#ffbe2e]' : 'shadow-ring-line',
            )}
            style={{ height: h }}
          >
            {boss && n === top && !reached ? '?' : n}
          </span>
        )
      })}
    </div>
  )
}

/** What a reward is, in words: "2 Great Balls", "₽450". */
export function useRewardText(): (items: GiftItem[]) => string {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (items) =>
    items
      .map((it) =>
        it.key === MONEY
          ? money(it.qty)
          : t('ui.giftCard.qty', { n: it.qty, name: data.items[it.key]?.name ?? it.key }),
      )
      .join(t('ui.giftCard.and'))
}

/** A reward as a row: each thing's picture (coins for ₽) and its words. */
export function RewardLine({ items, className }: { items: GiftItem[]; className?: string }) {
  const data = useGame((s) => s.data)
  const text = useRewardText()
  return (
    <span className={cx('flex min-w-0 items-center justify-center gap-1', className)}>
      {items.map((it) =>
        it.key === MONEY ? (
          <PixelIcon key={it.key} name="coin" size={18} className="shrink-0" />
        ) : (
          <ItemSprite key={it.key} item={data.items[it.key]} size={24} className="-my-1" />
        ),
      )}
      <span className="min-w-0 truncate">{text(items)}</span>
    </span>
  )
}

/** The rewards got, as a list for the result card: each thing big, its name and how many. */
export function RewardList({ items }: { items: GiftItem[] }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-3 bg-paper p-2 shadow-ring">
          {it.key === MONEY ? (
            <span className="grid h-12 w-12 shrink-0 place-items-center">
              <PixelIcon name="coin" size={32} />
            </span>
          ) : (
            <ItemSprite item={data.items[it.key]} size={48} />
          )}
          <span className="text-[22px] leading-none">
            {it.key === MONEY
              ? money(it.qty)
              : t('ui.giftCard.qty', { n: it.qty, name: data.items[it.key]?.name ?? it.key })}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The encounter's card while the present comes out: the present, and what's to come. */
export function GiftCardPreview() {
  const { t } = useT()
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <span
        className="grid h-[104px] w-[104px] shrink-0 place-items-center shadow-ring"
        style={{ background: 'linear-gradient(#1b2f52, #2f5a86)' }}
      >
        <PresentImg level={3} scale={2} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[30px] leading-none">{t('ui.giftCard.title')}</span>
        <p className="copy m-0 text-[17px] text-muted">{t('ui.giftCard.intro')}</p>
      </div>
    </div>
  )
}

/** Its rules, with the config's numbers: OPEN, MAKE IT BIGGER, a broken gift, Delibird's help. */
export function useGiftRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = giftCfg(data)
  const top = giftTop(cfg, false)
  const helper = giftHelper(cfg)
  const name = data.species[helper.dex]?.name ?? `#${helper.dex}`
  const chances = Array.from({ length: top - 1 }, (_, i) => `${giftBreakChance(cfg, i + 1, false)}%`).join(
    ' · ',
  )
  const rows: RuleRow[] = [
    { icon: 'gift', title: t('ui.giftCard.rules.open.title'), text: t('ui.giftCard.rules.open.text') },
    {
      icon: 'dice',
      title: t('ui.giftCard.rules.grow.title'),
      text: t('ui.giftCard.rules.grow.text', { chances, top }),
    },
    { icon: 'ball', title: t('ui.giftCard.rules.break.title'), text: t('ui.giftCard.rules.break.text') },
  ]
  if (helper.dex > 0)
    rows.push({
      icon: <SpriteImg dex={helper.dex} size={40} />,
      title: t('ui.giftCard.rules.helper.title', { name }),
      text: t('ui.giftCard.rules.helper.text', { safer: helper.safer, top: giftTop(cfg, true) }),
    })
  return rows
}

/** The rules pop-up's banner: the snowy town, presents growing on it. */
function GiftBanner() {
  return (
    <>
      <img
        src={artUrl('snowtown')}
        alt=""
        className="pixelated absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '50% 65%' }}
      />
      <span className="absolute bottom-2 right-3 flex items-end gap-2" aria-hidden>
        <PresentImg level={1} scale={2} />
        <PresentImg level={3} scale={2} />
        <PresentImg level={5} scale={2} />
      </span>
    </>
  )
}

/** The Gift card's rules (docs/15 §20): once, the first time a present appears (Later / Let's go!), then from INFO. */
export function GiftRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useGiftRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.giftCard.title')}
      picture={<GiftBanner />}
      icon="gift"
      rules={rules}
      onGo={onGo}
    />
  )
}
