// Gifts from the developer (docs/15 §23): the wrapped gift under a message (and in My messages), its rules pop-up (once,
// then INFO), and the opening itself, full screen: the gift timeline (src/fx/timelines/gift.ts) with SKIP, then what
// arrived and where it went, and DONE. Every rule — where a gift lands, what it becomes — is the engine's.
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sfx } from '@/audio/sfx'
import {
  getRegion,
  GIFT_LATEST,
  parseGifts,
  regionOf,
  unlockedRegions,
  type GameData,
  type Gift,
  type GiftLanded,
  type GiftsWait,
} from '@/engine'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { giftTimeline, type GiftContent } from '@/fx/timelines/gift'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { closeGiftMoment, giftRulesGo, giftRulesLater, useGiftMoment } from '@/store/gifts'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { Chip, NewTag } from './Chip'
import { bumpGold } from './GoldPill'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { PixelButton } from './PixelButton'
import { RulesModal, type RuleRow } from './RulesModal'
import { MiniSprite } from './SpriteImg'
import { StageCanvas, type StageHandle } from './StageCanvas'

const regionName = (data: GameData, id: string) => getRegion(data, id)?.name ?? id

/** Why the gift can't open here, in words: Extreme mode, or a small world (the region the player came from). */
function useWaitLine(wait: GiftsWait | null): string | null {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const from = useGame((s) => s.save?.events?.world?.from)
  if (wait === 'extreme') return t('ui.gift.waitExtreme')
  if (wait === 'world') return t('ui.gift.waitWorld', { region: regionName(data, from ?? 'kanto') })
  return null
}

/**
 * The wrapped gift under a message: what it is and how many things are inside (not what: that's the opening), and
 * what happens next — closing the message opens it, or why it waits. `onOpen` adds OPEN IT (My messages).
 */
export function GiftPresent({
  count,
  wait,
  onOpen,
  busy,
  className,
}: {
  count: number
  wait: GiftsWait | null
  onOpen?: () => void
  busy?: boolean
  className?: string
}) {
  const { t, tPlural } = useT()
  const waitLine = useWaitLine(wait)
  return (
    <div className={cx('flex items-center gap-2.5 bg-gold-pale p-2 shadow-card-gold', className)}>
      <span
        className="grid h-[52px] w-[52px] shrink-0 place-items-center bg-cream shadow-ring-line"
        aria-hidden
      >
        <PixelIcon name="gift" size={36} className={wait ? undefined : 'egg-shake'} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
        <b className="text-[20px] font-normal leading-none">{t('ui.gift.attached')}</b>
        <small className="font-pixel-sm text-[15px] text-muted">
          {tPlural('ui.gift.count', count, { n: count })} ·{' '}
          {waitLine ?? t(onOpen ? 'ui.gift.openHere' : 'ui.gift.openOnClose')}
        </small>
      </span>
      {onOpen && !wait && (
        <PixelButton size="sm" variant="gold" disabled={busy} onClick={onOpen}>
          {t('ui.gift.openIt')}
        </PixelButton>
      )}
    </div>
  )
}

/** One gift's picture: the item's, the coin for Pokédollars, or the Pokémon's menu icon. */
export function GiftIcon({ g, size = 32 }: { g: Gift; size?: number }) {
  const data = useGame((s) => s.data)
  return g.kind === 'item' ? (
    <ItemSprite item={data.items[g.key]} size={size} />
  ) : g.kind === 'gold' ? (
    <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      <PixelIcon name="coin" size={Math.round(size * 0.7)} />
    </span>
  ) : (
    <MiniSprite dex={g.dex} size={size} className="-my-1" />
  )
}

/** A gift in words, for a line or a screen reader: "Rare Candy ×5", "₽1,000", "Ditto Lv.10 ✦ Shiny". */
export function useGiftText() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (g: Gift) =>
    g.kind === 'item'
      ? `${data.items[g.key]?.name ?? g.key} ${t('ui.gift.qty', { n: g.qty })}`
      : g.kind === 'gold'
        ? money(g.amount)
        : [
            data.species[g.dex]?.name ?? t('ui.common.aPokemon'),
            t('ui.common.level.short', { n: g.level }),
            ...(g.shiny ? [t('ui.dayCare.shinyTag')] : []),
          ].join(' ')
}

/** "Rare Candy" and "×5", "Pokédollars" and "₽5,000", or "Pikachu" and "Lv.20", with its ✦ Shiny. */
function GiftName({ g }: { g: Gift }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const name =
    g.kind === 'item'
      ? (data.items[g.key]?.name ?? g.key)
      : g.kind === 'gold'
        ? t('ui.home.pokedollars')
        : (data.species[g.dex]?.name ?? t('ui.common.aPokemon'))
  return (
    <>
      <b className="font-normal">{name}</b>
      <span className="font-pixel-sm text-[17px] text-muted">
        {g.kind === 'item'
          ? t('ui.gift.qty', { n: g.qty })
          : g.kind === 'gold'
            ? money(g.amount)
            : t('ui.common.level.short', { n: g.level })}
      </span>
      {g.kind === 'pokemon' && g.shiny && <Chip tone="gold">{t('ui.dayCare.shinyTag')}</Chip>}
    </>
  )
}

/** A gift already opened, in My messages: what it held, in a line of small chips. */
export function GiftOpened({ gifts }: { gifts: unknown }) {
  const { t } = useT()
  const list = parseGifts(gifts)
  if (!list.length) return null
  return (
    <div className="grid gap-1 bg-paper p-2 shadow-ring-line">
      <p className="m-0 flex items-center gap-1.5 text-lg leading-none">
        <PixelIcon name="gift" size={18} />
        {t('ui.gift.openedTitle')}
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
        {list.map((g, i) => (
          <li key={i} className="flex items-center gap-1 text-[18px] leading-none">
            <GiftIcon g={g} />
            <GiftName g={g} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Where each one went, in words: the Bag, the ₽ or the Box (with its region once there are several), or the team. */
function useWhere() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const many = useGame((s) => !!s.save && unlockedRegions(s.save, s.data).length > 1)
  return (l: GiftLanded) => {
    const region = regionName(data, l.region)
    const where =
      l.gift.kind === 'item'
        ? many
          ? t('ui.gift.inBagOf', { region })
          : t('ui.gift.inBag')
        : l.gift.kind === 'gold'
          ? many
            ? t('ui.gift.inMoneyOf', { region })
            : t('ui.gift.inMoney')
          : l.joinedTeam
            ? t('ui.gift.joinedTeam')
            : many
              ? t('ui.gift.inBoxOf', { region })
              : t('ui.gift.inBox')
    return l.moved && l.gift.region !== GIFT_LATEST
      ? `${where} ${t('ui.gift.moved', { region: regionName(data, l.gift.region) })}`
      : where
  }
}

/** What arrived: one row each, its picture, name, quantity or level, NEW and ✦ Shiny, and where it went. */
export function GiftResult({
  landed,
  onDone,
  doneRef,
}: {
  landed: GiftLanded[]
  onDone: () => void
  doneRef?: React.Ref<HTMLButtonElement>
}) {
  const { t } = useT()
  const where = useWhere()
  return (
    <div className="grid gap-2 bg-paper px-3 pb-3 pt-2.5 shadow-card">
      <p className="m-0 flex items-center gap-1.5 text-[22px] leading-none">
        <PixelIcon name="gift" size={22} />
        {t('ui.gift.insideTitle')}
      </p>
      <ul className="m-0 grid max-h-[46vh] list-none gap-1.5 overflow-y-auto p-0">
        {landed.map((l, i) => (
          <li key={i} className="grid gap-0.5 bg-well px-2 py-1.5">
            <p className="m-0 flex flex-wrap items-center gap-1.5 text-[20px] leading-none">
              <GiftIcon g={l.gift} />
              <GiftName g={l.gift} />
              {l.isNew && <NewTag />}
            </p>
            <p className="m-0 font-pixel-sm text-[16px] leading-tight text-ink">{where(l)}</p>
          </li>
        ))}
      </ul>
      <PixelButton ref={doneRef} variant="primary" onClick={onDone}>
        {t('ui.dayCare.done')}
      </PixelButton>
    </div>
  )
}

/** The rules pop-up's banner, drawn in code: three gifts on the night strip, and a few sparkles. */
function GiftBanner() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-3 bg-night pb-3" aria-hidden>
      <PixelIcon name="sparkle" size={18} className="mb-14" />
      <PixelIcon name="gift" size={48} />
      <PixelIcon name="gift" size={84} className="-mb-1" />
      <PixelIcon name="gift" size={48} />
      <PixelIcon name="sparkle" size={18} className="mb-16" />
    </div>
  )
}

export function useGiftRules(): RuleRow[] {
  const { t } = useT()
  return [
    { icon: 'mail', title: t('ui.rules.gift.msg.title'), text: t('ui.rules.gift.msg.text') },
    { icon: 'potion', title: t('ui.rules.gift.items.title'), text: t('ui.rules.gift.items.text') },
    { icon: 'ball', title: t('ui.rules.gift.mons.title'), text: t('ui.rules.gift.mons.text') },
    { icon: 'gift', title: t('ui.rules.gift.where.title'), text: t('ui.rules.gift.where.text') },
  ]
}

/** The gifts' rules: before the first gift opens (Later / Let's go!), and from My messages' INFO (OK). */
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
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.rules.gift.title')}
      picture={<GiftBanner />}
      icon="gift"
      rules={useGiftRules()}
      onGo={onGo}
    />
  )
}

/** What the stage draws for each gift: the Pokémon's front sprite (its shiny one), the item's picture, coins. */
function contentsOf(
  landed: GiftLanded[],
  data: GameData,
): { contents: GiftContent[]; ready: Promise<unknown> } {
  const loads: Promise<unknown>[] = []
  const contents = landed.map((l): GiftContent => {
    if (l.gift.kind === 'pokemon') {
      loads.push(loadSprite(l.gift.dex, false, !!l.gift.shiny))
      return { kind: 'mon', key: spriteKey(l.gift.dex, false, !!l.gift.shiny), shiny: !!l.gift.shiny }
    }
    if (l.gift.kind === 'gold') return { kind: 'gold', key: 'gold' }
    const url = data.items[l.gift.key]?.spriteUrl
    if (url) loads.push(loadItemSprite(url))
    return { kind: 'item', key: `item|${url ?? ''}` }
  })
  return { contents, ready: Promise.all(loads) }
}

/**
 * The opening, full screen over the game: the stage with SKIP, the lines in the message box, then what arrived and
 * DONE. Escape skips to the end, then closes.
 */
export function GiftMoment({
  landed,
  onDone,
  source = 'message',
}: {
  landed: GiftLanded[]
  onDone: () => void
  /** The developer's gift (a message), or invite rewards (docs/15 §25): only the first line and the title differ. */
  source?: 'message' | 'invite'
}) {
  const { t } = useT()
  useHoldFullscreen()
  const data = useGame((s) => s.data)
  const stage = useRef<StageHandle>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  const [beat, setBeat] = useState<'start' | 'wobble' | 'untie' | 'opened'>('start')
  const scene = useMemo(() => {
    const { contents, ready } = contentsOf(landed, data)
    return { ready, timeline: giftTimeline({ contents }) }
    // The gifts on screen don't change while it plays; a new language doesn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed])
  const open = beat === 'opened'
  const reveal = () => {
    if (open) return
    setBeat('opened')
    sfx('levelup')
  }
  useEffect(() => {
    if (open) doneRef.current?.focus({ preventScroll: true })
  }, [open])
  const said =
    beat === 'opened'
      ? t('ui.gift.got')
      : beat === 'untie'
        ? t('ui.gift.untie')
        : beat === 'wobble'
          ? t('ui.gift.wobble')
          : t(source === 'invite' ? 'ui.invite.arrive' : 'ui.gift.arrive')
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t(source === 'invite' ? 'ui.invite.momentTitle' : 'ui.gift.title')}
      className="fixed inset-0 z-[100] overflow-y-auto bg-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        if (open) onDone()
        else stage.current?.skip()
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-3 pb-4">
        <div className="shadow-ledge">
          <StageCanvas
            ref={stage}
            timeline={scene.timeline}
            ready={scene.ready}
            hud={{
              beat: (b) => {
                if (b === 'opened') reveal()
                else if (b === 'wobble' || b === 'untie') setBeat((cur) => (cur === 'opened' ? cur : b))
              },
            }}
            onEnd={reveal}
            label={said}
          />
        </div>
        <p
          className="pixel-dialogue mx-3 my-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]"
          aria-live="polite"
        >
          {said}
        </p>
        {!open ? (
          <PixelButton className="mx-3 self-end" size="sm" autoFocus onClick={() => stage.current?.skip()}>
            {t('ui.evolution.skip')}
          </PixelButton>
        ) : (
          <div className="mx-3">
            <GiftResult landed={landed} onDone={onDone} doneRef={doneRef} />
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

/** The gifts' pop-ups, wherever the game is: the rules the first time, and the opening. */
export function GiftService() {
  const opening = useGiftMoment((s) => s.opening)
  const source = useGiftMoment((s) => s.source)
  const rulesFor = useGiftMoment((s) => s.rulesFor)
  const live = useGame((s) => (s.save ? regionOf(s.save) : null))
  const done = () => {
    // ₽ for the region being played came in while the top bar was hidden: its pill bumps when it's back.
    if (opening?.some((l) => l.gift.kind === 'gold' && l.region === live)) bumpGold()
    closeGiftMoment()
  }
  return (
    <>
      <GiftRulesModal open={!!rulesFor} onClose={giftRulesLater} onGo={giftRulesGo} />
      {opening && <GiftMoment landed={opening} onDone={done} source={source} />}
    </>
  )
}
