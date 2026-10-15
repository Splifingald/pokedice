// Distortion World's portal run (docs/28, docs/15 §27): the breach that plays on the way in and the pop-up behind it
// (the rules, NOT NOW / READY!), the gauge of portals closed, a distortion's boons to pick from, the run's bonuses and
// the victory (shiny Giratina coming through, its cry). The scenes are the pixel engine's (src/fx/timelines/portal.ts);
// the portal, the distortions and the glitches are hosted in PortalFx.tsx.
// Every number comes from the engine (the area's mode, the run's state); these pieces only show them.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  monName,
  type DistortionOffer,
  type GameData,
  type PokemonInstance,
  type PokeType,
  type PortalRunMode,
} from '@/engine'
import { playCry } from '@/audio/cries'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { breachTimeline, victoryTimeline } from '@/fx/timelines/portal'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { typeName } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'
import { Die } from './Die'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { RuleList, RulesModal, type RuleRow } from './RulesModal'
import { PortalArt, PortalScene, useFullStage } from './PortalFx'
import { MiniSprite } from './SpriteImg'
import { StageCanvas, type StageHandle } from './StageCanvas'
import { TypeBadge } from './TypeBadge'

/** Giratina: the run's foe, and its prize. */
export const GIRATINA = 487

// ------------------------------------------------------------------ the portal

// The portal, the wild Pokémon's distortion, the screen's and the UI's glitches are drawn on the pixel engine
// (src/fx/timelines/portal.ts, src/fx/glitch.ts) and hosted in PortalFx.tsx.
export {
  DistortionFx,
  GlitchSprite,
  PortalArt,
  PortalCloseFx,
  PortalFilters,
  PortalScene,
  playPortalClose,
  useUiGlitch,
} from './PortalFx'

/** The rules pop-up's banner: the Distortion World, its rocks drifting, the portal turning in the middle. */
export function PortalBanner() {
  return <PortalScene />
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

/** The line under a full-screen scene: a card in the name card's colours (the void, Giratina's red and gold rims). */
const LINE_CARD =
  'm-0 max-w-md bg-[#12051f] px-4 py-3 text-center leading-tight text-[#f4ecff] shadow-[inset_0_3px_0_#e8384a,inset_0_-3px_0_#ffc94a,0_0_0_3px_#07020d]'

/**
 * The breach, full screen (breachTimeline): the area cracks and falls in pixel shards into a tear of the Distortion
 * World, a quake, the name card; the line says what is happening. A tap (or SKIP, or Esc) jumps to its end; `short`
 * plays it in half the time; with motion off it is over at once. Then `onDone`. `picture`: the area's picture.
 */
export function PortalBreach({ onDone, picture }: { onDone: () => void; picture?: string | null }) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(200)
  const [line, setLine] = useState(false)
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: picture ? loadItemSprite(picture) : Promise.resolve(),
      timeline: breachTimeline({
        ...size,
        title: t('ui.portal.title'),
        picture: picture ? `item|${picture}` : null,
        short: level === 'short',
      }),
    }),
    // One scene per breach; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    if (level === 'off') return onDone()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [level, onDone])
  // Its end state holds a moment (the whole way in stays near the old 3.6 s).
  const end = () => window.setTimeout(onDone, 300)
  if (level === 'off') return null
  return (
    <div
      className="portal-breach fixed inset-0 z-[95] overflow-hidden bg-[#07020d]"
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.portal.title')}
      onClick={onDone}
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{ beat: (b) => b === 'line' && setLine(true) }}
        onEnd={end}
        label={t('ui.portal.breach')}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        <p className={cx(LINE_CARD, 'text-[24px]', !line && 'invisible')} aria-live="polite">
          {t('ui.portal.breach')}
        </p>
        <PixelButton size="sm" onClick={onDone}>
          {t('ui.victory.skip')}
        </PixelButton>
      </div>
    </div>
  )
}

/** The pop-up behind the breach: the Distortion World and its portal turning behind it, the rules, the warning. */
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
  const rules = usePortalRules(mode, data)
  return (
    <Modal
      open={open}
      onClose={onNotNow}
      title={t('ui.portal.enterTitle')}
      className="portal-dialog max-w-md"
    >
      <div className="flex flex-col gap-3">
        <div className="relative -mx-4 h-[150px] overflow-hidden bg-[#07020d]" aria-hidden>
          <PortalScene />
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

/** Opening the area: the breach (over the area's picture), then its pop-up. */
export function PortalEntry({
  mode,
  data,
  picture,
  onReady,
  onNotNow,
}: {
  mode: PortalRunMode
  data: GameData
  picture?: string | null
  onReady: () => void
  onNotNow: () => void
}) {
  const [breach, setBreach] = useState(true)
  const done = useCallback(() => setBreach(false), [])
  return breach ? (
    <PortalBreach onDone={done} picture={picture} />
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
  return (
    <section className="pixel-panel portal-panel flex flex-col gap-3 p-3" aria-labelledby="portal-choice">
      <div className="flex items-center gap-3">
        <div className="shrink-0 bg-[#07020d] p-1 shadow-ring">
          <PortalArt size={72} />
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
 * Every portal closed, full screen (victoryTimeline, legend.ts's entrance for shiny Giratina): shadow tendrils out of
 * the last portal, its silhouette rising in its aura, the reveal with its cry and a quake, the shiny sparkle, the portal
 * sealed, the name card; then "Every portal is closed!", the line that it is in the raids now, and BACK TO THE WORLD.
 * A tap jumps to the end; with motion off it is there at once.
 */
export function PortalVictoryView({
  name,
  level: lv,
  onDone,
}: {
  name: string
  level?: number
  onDone: () => void
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(240)
  const stage = useRef<StageHandle>(null)
  const [card, setCard] = useState(level === 'off')
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: loadSprite(GIRATINA, false, true),
      timeline: victoryTimeline({
        ...size,
        mon: spriteKey(GIRATINA, false, true),
        name,
        subs: [t('ui.mon.shinyTag'), ...(lv ? [t('ui.common.level.short', { n: lv })] : [])],
        short: level === 'short',
      }),
    }),
    // One scene per victory; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return (
    <div
      className="portal-breach fixed inset-0 z-[95] overflow-hidden bg-[#07020d]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-won"
      onClick={() => !card && stage.current?.skip()}
    >
      <StageCanvas
        ref={stage}
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{
          beat: (b) => {
            if (b === 'roar') playCry(GIRATINA)
            if (b === 'card') setCard(true)
          },
        }}
        label={t('ui.portal.shinyName', { name })}
        className="absolute inset-0 h-full w-full"
      />
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6',
          !card && 'invisible',
        )}
      >
        <div className={cx(LINE_CARD, 'grid gap-2')}>
          <h2 id="portal-won" className="m-0 text-[30px] font-normal leading-none text-gold-light">
            {t('ui.portal.victoryTitle')}
          </h2>
          <p className="m-0 text-[20px] leading-tight" aria-live="polite">
            {t('ui.portal.victoryBody', { name })}
          </p>
        </div>
        <PixelButton variant="primary" size="lg" onClick={onDone} autoFocus={card}>
          {t('ui.portal.victoryOk')}
        </PixelButton>
      </div>
    </div>
  )
}
