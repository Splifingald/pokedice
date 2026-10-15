// Distortion World's portal run (docs/28, docs/15 §27): the portal drawn in code, the breach that plays on the way in
// and the pop-up behind it (the rules, NOT NOW / READY!), the gauge of portals closed, a distortion's boons to pick
// from, the run's bonuses, the victory (shiny Giratina coming through, its cry) and the screen's recurring distortion.
// Every number comes from the engine (the area's mode, the run's state); these pieces only show them.
import { useEffect, useState, type ReactNode } from 'react'
import {
  monName,
  type DistortionOffer,
  type GameData,
  type PokemonInstance,
  type PokeType,
  type PortalRunMode,
} from '@/engine'
import { playCry } from '@/audio/cries'
import { fxSound, sfx } from '@/audio/sfx'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { typeName } from '@/lib/format'
import { useMotion, type MotionLevel } from '@/lib/motion'
import { cx } from '@/theme/util'
import { Die } from './Die'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { RuleList, RulesModal, type RuleRow } from './RulesModal'
import { MiniSprite, SpriteImg } from './SpriteImg'
import { TypeBadge } from './TypeBadge'

/** Giratina: the run's foe, and its prize. */
export const GIRATINA = 487

// ------------------------------------------------------------------ the portal

/**
 * The distortion portal, drawn in code: rings from the void outwards, Giratina's red and black streaks turning in it,
 * the glow as hard stepped rings (never a blur). `still` holds it (motion off, or the OS asking for less).
 */
export function PortalArt({
  size = 160,
  still,
  className,
}: {
  size?: number
  still?: boolean
  className?: string
}) {
  const arms = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      aria-hidden
      shapeRendering="crispEdges"
      className={cx('portal-art', still && 'portal-still', className)}
    >
      <circle r="49" fill="#2fd3c4" opacity="0.18" />
      <circle r="45" fill="#b05cff" opacity="0.3" />
      <circle r="40" fill="#6b2fc4" />
      <circle r="35" fill="#3b1466" />
      <g className="portal-swirl">
        {arms.map((a) => (
          <path
            key={a}
            d="M 0 -6 Q 14 -18 6 -33 L 10 -33 Q 20 -16 3 -6 Z"
            fill={a % 90 === 0 ? '#e8384a' : '#12051f'}
            transform={`rotate(${a})`}
          />
        ))}
      </g>
      <circle r="17" fill="#12051f" />
      <circle r="11" fill="#05010a" />
      <circle
        r="40"
        fill="none"
        stroke="#2fd3c4"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        className="portal-rim"
      />
    </svg>
  )
}

/** The rules pop-up's banner: the portal on the night, the void on both sides. */
export function PortalBanner() {
  const { calm } = useMotion()
  return (
    <div className="portal-banner absolute inset-0 grid place-items-center">
      <PortalArt size={150} still={calm} />
    </div>
  )
}

/** The SVG filters the sprites' and the screen's distortion use (once in the page). */
export function PortalFilters() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <filter id="portal-warp-a" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.01 0.22" numOctaves="1" seed="3" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="portal-warp-b" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.02 0.35" numOctaves="1" seed="11" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="G" yChannelSelector="R" />
      </filter>
    </svg>
  )
}

/** The class a distorted sprite wears at this motion level: the warp now and then, a slower tint, or a still rim. */
export const shaderClass = (level: MotionLevel, calm: boolean): string =>
  level === 'off' || calm
    ? 'portal-shader-still'
    : level === 'short'
      ? 'portal-shader-short'
      : 'portal-shader'

/**
 * The screen's recurring distortion while a run is under way: a dithered edge in the void's colours, and now and then a
 * band of torn lines crossing the screen. `short` keeps the edge flickering slowly; motion off or a calm OS, the edge
 * alone. It catches no tap.
 */
export function DistortionFx() {
  const { level, calm } = useMotion()
  const moving = level === 'full' && !calm
  return (
    <div aria-hidden className={cx('portal-fx', level === 'short' && !calm && 'portal-fx-short')}>
      <PortalFilters />
      {moving && <div className="portal-tear" />}
    </div>
  )
}

// ------------------------------------------------------------------ the gauge

/**
 * The gauge of portals closed (in place of the round gauge): one tile per portal, the closed ones sealed with a check,
 * the next one with a gold edge, then "3/10".
 */
export function DistortionGauge({
  closed,
  total,
  className,
}: {
  closed: number
  total: number
  className?: string
}) {
  const { t } = useT()
  const done = Math.min(closed, total)
  return (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={t('ui.portal.gauge', { done, total })}
    >
      <PixelIcon name="sparkle" size={16} />
      <ol className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cx(
              'flex h-6 min-w-0 flex-1 items-center justify-center border-2',
              i < done
                ? 'light-scope border-edge bg-[#b9a2e8]'
                : i === done
                  ? 'border-gold bg-line'
                  : 'border-edge bg-line',
            )}
            style={{ borderRadius: 2 }}
          >
            {i < done && <PixelIcon name="check" size={12} />}
          </li>
        ))}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {done}/{total}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ its rules

/** The run's rules, from the area's numbers. */
export function usePortalRules(mode: PortalRunMode, data: GameData): RuleRow[] {
  const { t } = useT()
  const name = data.species[GIRATINA]?.name ?? 'Giratina'
  return [
    {
      icon: 'sparkle',
      title: t('ui.portal.rule.close.title', { n: mode.portals }),
      text: t('ui.portal.rule.close.text', { wild: mode.wild, items: mode.items, n: mode.portals }),
    },
    { icon: 'lock', title: t('ui.portal.rule.inside.title'), text: t('ui.portal.rule.inside.text') },
    {
      icon: 'star',
      title: t('ui.portal.rule.boons.title'),
      text: t('ui.portal.rule.boons.text', { n: mode.offers }),
    },
    { icon: 'skull', title: t('ui.portal.rule.end.title'), text: t('ui.portal.rule.end.text', { name }) },
  ]
}

/** The rules pop-up (docs/15 §20): once when the area opens (`onGo`: Later / Let's go!), and from INFO (OK). */
export function PortalRulesModal({
  open,
  onClose,
  onGo,
  mode,
  data,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
  mode: PortalRunMode
  data: GameData
}) {
  const { t } = useT()
  const rules = usePortalRules(mode, data)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      onGo={onGo}
      title={t('ui.portal.title')}
      picture={<PortalBanner />}
      icon="sparkle"
      rules={rules}
    />
  )
}

// ------------------------------------------------------------------ the way in

/**
 * The breach, full screen: the distortion opens up over the page and the line says what is happening. A tap (or SKIP,
 * or Esc) jumps to its end; with motion off it is over at once. Then `onDone`.
 */
export function PortalBreach({ onDone }: { onDone: () => void }) {
  const { t } = useT()
  const { level, calm } = useMotion()
  useHoldFullscreen()
  useEffect(() => {
    if (level === 'off') return onDone()
    fxSound('portal.breach')
    const id = setTimeout(onDone, level === 'short' ? 1800 : 3600)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(id)
      window.removeEventListener('keydown', esc)
    }
  }, [level, onDone])
  return (
    <div
      className="portal-breach fixed inset-0 z-[95] flex flex-col items-center justify-center gap-6 bg-[#12051f] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.portal.title')}
      onClick={onDone}
    >
      <div className={cx('portal-grow', calm && 'portal-still')}>
        <PortalArt size={260} still={calm} />
      </div>
      <p className="m-0 max-w-md text-center text-[26px] leading-tight text-[#f4ecff]" aria-live="polite">
        {t('ui.portal.breach')}
      </p>
      <PixelButton size="sm" variant="ghost" className="text-[#f4ecff]" onClick={onDone}>
        {t('ui.victory.skip')}
      </PixelButton>
    </div>
  )
}

/** The pop-up behind the breach: the glowing portal behind it, the rules, the warning, NOT NOW / READY!. */
export function PortalEntryDialog({
  open,
  mode,
  data,
  onReady,
  onNotNow,
}: {
  open: boolean
  mode: PortalRunMode
  data: GameData
  onReady: () => void
  onNotNow: () => void
}) {
  const { t } = useT()
  const { calm } = useMotion()
  const rules = usePortalRules(mode, data)
  return (
    <Modal
      open={open}
      onClose={onNotNow}
      title={t('ui.portal.enterTitle')}
      className="portal-dialog max-w-md"
    >
      <div className="flex flex-col gap-3">
        <div
          className="relative -mx-4 grid h-[150px] place-items-center overflow-hidden bg-[#12051f]"
          aria-hidden
        >
          <div className="portal-glow">
            <PortalArt size={170} still={calm} />
          </div>
        </div>
        <RuleList rules={rules} />
        <p
          role="note"
          className="m-0 flex items-start gap-2 bg-rose p-2.5 text-[18px] leading-tight text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-danger))]"
        >
          <PixelIcon name="warning" size={20} className="mt-0.5 shrink-0" />
          <span>{t('ui.portal.sure')}</span>
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton onClick={onNotNow}>{t('ui.portal.notNow')}</PixelButton>
          <PixelButton variant="primary" onClick={onReady}>
            {t('ui.portal.ready')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/** Opening the area: the breach, then its pop-up. */
export function PortalEntry({
  mode,
  data,
  onReady,
  onNotNow,
}: {
  mode: PortalRunMode
  data: GameData
  onReady: () => void
  onNotNow: () => void
}) {
  const [breach, setBreach] = useState(true)
  return breach ? (
    <PortalBreach onDone={() => setBreach(false)} />
  ) : (
    <PortalEntryDialog open mode={mode} data={data} onReady={onReady} onNotNow={onNotNow} />
  )
}

// ------------------------------------------------------------------ a distortion's boons

/** One boon as the card shows it. */
export interface OfferView {
  offer: DistortionOffer
  icon: ReactNode
  title: string
  text: string
}

/** What a boon says: who and what it names, its numbers from the area's mode. */
export function describeOffer(
  offer: DistortionOffer,
  mode: PortalRunMode,
  data: GameData,
  team: readonly PokemonInstance[],
  diceOf: (inst: PokemonInstance) => number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): OfferView {
  const who = (uid: string) => team.find((p) => p.id === uid)
  switch (offer.kind) {
    case 'heal':
      return {
        offer,
        icon: <PixelIcon name="heart" size={28} />,
        title: t('ui.portal.offer.heal.title', { percent: offer.percent }),
        text: t('ui.portal.offer.heal.text', { percent: offer.percent }),
      }
    case 'revive': {
      const p = who(offer.uid)
      const name = p ? monName(p, data) : '?'
      const fx = data.items.revive?.effect
      return {
        offer,
        icon: p ? <MiniSprite dex={p.dex} size={32} /> : <PixelIcon name="heart" size={28} />,
        title: t('ui.portal.offer.revive.title', { name }),
        text: t('ui.portal.offer.revive.text', { name, percent: fx?.kind === 'revive' ? fx.percent : 50 }),
      }
    }
    case 'boost':
      return {
        offer,
        icon: <TypeBadge type={offer.type} />,
        title: t('ui.portal.offer.boost.title', { type: typeName(offer.type), n: offer.amount }),
        text: t('ui.portal.offer.boost.text', { type: typeName(offer.type), n: offer.amount }),
      }
    case 'die': {
      const p = who(offer.uid)
      const name = p ? monName(p, data) : '?'
      return {
        offer,
        icon: <Die type={offer.type} face={null} size={30} label={typeName(offer.type)} />,
        title: t('ui.portal.offer.die.title', { name }),
        text: t('ui.portal.offer.die.text', {
          name,
          type: typeName(offer.type),
          dice: p ? diceOf(p) + 1 : 0,
          max: mode.die.maxDice,
        }),
      }
    }
    case 'item': {
      const total = mode.item.items.reduce((s, i) => s + Math.max(0, i.weight), 0) || 1
      const odds = joinList(
        mode.item.items
          .filter((i) => i.weight > 0 && data.items[i.key])
          .map((i) => `${data.items[i.key]!.name} ${Math.round((100 * i.weight) / total)}%`),
      )
      const first = mode.item.items.find((i) => data.items[i.key])
      return {
        offer,
        icon: first ? (
          <ItemSprite item={data.items[first.key]} size={30} />
        ) : (
          <PixelIcon name="box" size={28} />
        ),
        title: t('ui.portal.offer.item.title'),
        text: t('ui.portal.offer.item.text', { odds }),
      }
    }
  }
}

/** A distortion is open: its boons as big buttons, one to pick; the portal over them, its number. */
export function DistortionChoiceView({
  views,
  index,
  total,
  onPick,
}: {
  views: OfferView[]
  /** Which distortion this is (1-based). */
  index: number
  total: number
  onPick: (i: number) => void
}) {
  const { t } = useT()
  const { calm } = useMotion()
  return (
    <section className="pixel-panel portal-panel flex flex-col gap-3 p-3" aria-labelledby="portal-choice">
      <div className="flex items-center gap-3">
        <div className="shrink-0 bg-[#12051f] p-1 shadow-ring">
          <PortalArt size={72} still={calm} />
        </div>
        <div className="grid min-w-0 gap-1">
          <h2 id="portal-choice" className="m-0 text-[28px] font-normal leading-none">
            {t('ui.portal.choiceTitle', { n: index, total })}
          </h2>
          <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
            {t('ui.portal.choiceBody')}
          </p>
        </div>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-3">
        {views.map((v, i) => (
          <li key={`${v.offer.kind}-${i}`}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-label={t('ui.portal.pickLabel', { title: v.title })}
              className="pixel-btn flex h-full min-h-[64px] w-full items-center gap-3 bg-paper px-3 py-2 text-left md:flex-col md:items-start"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center bg-line shadow-ring-line"
                aria-hidden
              >
                {v.icon}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <b className="text-[21px] font-normal leading-none">{v.title}</b>
                <small className="font-pixel-sm text-[15px] leading-tight text-muted">{v.text}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The run's bonuses so far: each boost as its type and +n, each extra die with whose it is. Nothing yet: a line says so. */
export function RunBonuses({
  boosts,
  dice,
}: {
  boosts: Partial<Record<PokeType, number>>
  dice: { name: string; dex: number; types: PokeType[] }[]
}) {
  const { t } = useT()
  const list = Object.entries(boosts).filter(([, n]) => (n ?? 0) > 0) as [PokeType, number][]
  const none = !list.length && !dice.some((d) => d.types.length)
  return (
    <section className="pixel-panel portal-panel flex flex-col gap-2 p-3" aria-labelledby="portal-bonuses">
      <h2 id="portal-bonuses" className="m-0 text-[22px] font-normal leading-none">
        {t('ui.portal.bonuses')}
      </h2>
      {none ? (
        <p className="m-0 font-pixel-sm text-[15px] text-muted">{t('ui.portal.noBonus')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {list.map(([type, n]) => (
            <li key={type} className="inline-flex items-center gap-1.5 bg-paper px-2 py-1 shadow-ring-line">
              <TypeBadge type={type} size="sm" />
              <span className="font-pixel-sm text-[15px]">{t('ui.portal.boostChip', { n })}</span>
            </li>
          ))}
          {dice
            .filter((d) => d.types.length)
            .map((d) => (
              <li
                key={d.name}
                className="inline-flex items-center gap-1.5 bg-paper px-2 py-1 shadow-ring-line"
              >
                <MiniSprite dex={d.dex} size={24} />
                <span className="font-pixel-sm text-[15px]">
                  {t('ui.portal.diceChip', {
                    name: d.name,
                    dice: d.types.map((x) => typeName(x)).join(', '),
                  })}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ the victory

/**
 * Every portal closed: full screen, the portal again and shiny Giratina coming out of it (its cry), the line saying the
 * portals are closed and that it is now in the raids, then back to the world. Motion off: it is out already.
 */
export function PortalVictoryView({ name, onDone }: { name: string; onDone: () => void }) {
  const { t } = useT()
  const { level, calm } = useMotion()
  useHoldFullscreen()
  useEffect(() => {
    playCry(GIRATINA)
    sfx('catch')
  }, [])
  return (
    <div
      className="portal-breach fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-[#12051f] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-won"
    >
      <div className="relative grid place-items-center" style={{ width: 280, height: 280 }}>
        <PortalArt size={260} still={calm} className="absolute" />
        <div className={cx('relative', level !== 'off' && !calm && 'portal-emerge')}>
          <SpriteImg dex={GIRATINA} shiny size={200} alt={t('ui.portal.shinyName', { name })} />
        </div>
      </div>
      <h2 id="portal-won" className="m-0 text-center text-[32px] font-normal leading-none text-gold-light">
        {t('ui.portal.victoryTitle')}
      </h2>
      <p className="m-0 max-w-md text-center text-[21px] leading-tight text-[#f4ecff]" aria-live="polite">
        {t('ui.portal.victoryBody', { name })}
      </p>
      <PixelButton variant="primary" size="lg" onClick={onDone} autoFocus>
        {t('ui.portal.victoryOk')}
      </PixelButton>
    </div>
  )
}
