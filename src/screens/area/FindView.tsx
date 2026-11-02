import { motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { feelSound } from '@/audio/feel'
import {
  earnedGold,
  findRarity,
  MONEY,
  progressOf,
  type Encounter,
  type FindRarity,
} from '@/engine'
import { AutoButton } from '@/components/AutoButton'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { TalentGem } from '@/components/Talent'
import { pictureOf } from '@/fx/areaArt'
import { effectText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { StageBackground } from '@/screens/battle/BattleStage'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { StagePanel } from '@/screens/area/StagePanel'
import { useGame } from '@/store/game'
import { currentLive } from '@/store/live'
import { fightSprung, pickUpFind, revealDisguise } from '@/store/run'
import { fxSound } from '@/audio/sfx'
import { SpriteImg } from '@/components/SpriteImg'
import { cx } from '@/theme/util'

type Find = Extract<Encounter, { kind: 'item' }>

/** Where a find lands: the middle of the stage, its foot on the ground in front (shares of the stage's width, height). */
const FIND_SPOT = { x: 0.5, y: 0.72 }

/** An easing cut into `n` held steps: pixel art moves a frame at a time, never in a glide. */
const stepped =
  (n: number, curve: (p: number) => number = (p) => p) =>
  (p: number) =>
    p >= 1 ? 1 : Math.floor(curve(p) * n) / n
/** A fall gathers speed; a bounce loses it. */
const fall = stepped(7, (p) => p * p)
const rise = stepped(3, (p) => 1 - (1 - p) * (1 - p))
const drop = stepped(3, (p) => p * p)

/** Where the sparkles twinkle round the find, as shares of its own box; a rarer find gets more of them. */
const SPARKLES: Record<FindRarity, { x: number; y: number; d: number }[]> = {
  common: [
    { x: -0.18, y: 0.1, d: 0 },
    { x: 1.0, y: 0.3, d: 0.5 },
  ],
  uncommon: [
    { x: -0.2, y: 0.05, d: 0 },
    { x: 1.05, y: 0.2, d: 0.35 },
    { x: 0.5, y: -0.32, d: 0.7 },
  ],
  rare: [
    { x: -0.25, y: 0.0, d: 0 },
    { x: 1.08, y: 0.15, d: 0.2 },
    { x: 0.45, y: -0.38, d: 0.4 },
    { x: -0.1, y: 0.65, d: 0.6 },
    { x: 1.0, y: 0.7, d: 0.8 },
  ],
}

/** The rarity's chip: plain for a common find, green for an uncommon one, gold with a sparkle for a rare one. */
const RARITY_LOOK: Record<FindRarity, string> = {
  common: 'bg-paper text-muted shadow-ring-line',
  uncommon: 'bg-hp-green text-ink shadow-ring',
  rare: 'bg-gold text-ink shadow-ring',
}

/**
 * A find, as a step of its own (the user's call, 2026-10-28: a toast the trail ran past looked skipped). The area's
 * ground (no Pokémon spots on it: nobody stands there), the round's strip on its top edge, and the find dropping into
 * the middle of it: it falls, lands with a thud and a puff of dust, bounces and twinkles. The panel says how rare it is
 * ("Common find", "Rare find": its share of the area's loot, `findRarity`), what it is and what it does, and PICK IT UP
 * waits for the tap, as every one-button step does now (it loads and presses itself only while auto-mode or Idle mode
 * plays the area). Phones: the stage on top, the button pinned; PC: the stage on the left, the panel at its right, as
 * in a fight.
 */
export function FindView() {
  const { t } = useT()
  const raw = useGame((s) => s.run.encounter)
  // A Pokémon posing as a find (docs/61 §3): the find it looks like until PICK IT UP, then the Pokémon springing out.
  const disguise = raw?.kind === 'wild' && raw.disguisedAs ? raw : null
  const sprung = useGame((s) => !!s.run.sprung) && !!disguise
  const enc = useMemo<Find | null>(
    () =>
      raw?.kind === 'item'
        ? raw
        : disguise
          ? { kind: 'item', entryId: `disguise:${disguise.dex}`, itemKey: disguise.disguisedAs!, qty: 1 }
          : null,
    [raw, disguise],
  )
  const areaId = useGame((s) => s.run.areaId)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const art = useMemo(() => pictureOf(areaId), [areaId])
  const area = data.areas.find((a) => a.id === areaId)
  // Read as it was found: picking a once-only find up strikes it off the table the rarity is read from.
  const entryId = enc?.entryId
  const rarity = useMemo<FindRarity>(
    // A disguise looks like the plainest of finds.
    () => (area && save && entryId && !disguise ? findRarity(area, progressOf(save, area.id), data, entryId) : 'common'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryId],
  )
  if (!enc) return null
  const item = data.items[enc.itemKey]
  const isMoney = enc.itemKey === MONEY
  // The purse's sum as it will be paid (a live event's Cash Flow included), the bag's name and count otherwise.
  const what = isMoney
    ? money(earnedGold(enc.qty, currentLive()).amount)
    : `${item?.name ?? enc.itemKey}${enc.qty > 1 ? ` ×${enc.qty}` : ''}`
  const fossil = item?.effect.kind === 'fossil' ? item.effect : null
  const line = fossil
    ? t('ui.toast.foundFossil', {
        item: item!.name,
        name: data.species[fossil.dex]?.name ?? t('ui.toast.itsPokemon'),
        hours: fossil.hours,
      })
    : t('ui.toast.found', { what })
  const does = !isMoney && !fossil && item ? effectText(item) : ''
  const stage = (
    <div className="relative isolate aspect-[3/2] w-full select-none overflow-hidden shadow-ledge">
      <StageBackground art={art} zones={false} />
      <RunRoundGauge strip className="absolute inset-x-0 top-0 z-30" />
      {sprung && disguise ? (
        <SprungThing itemKey={enc.itemKey} dex={disguise.dex} shiny={disguise.shiny} />
      ) : (
        <FoundThing key={enc.entryId} enc={enc} isMoney={isMoney} rarity={rarity} />
      )}
    </div>
  )
  if (sprung && disguise) {
    const name = data.species[disguise.dex]?.name ?? `#${disguise.dex}`
    return (
      <StagePanel
        scene={stage}
        bar={
          <AutoButton variant="primary" size="lg" className="w-full" paused="byDialogs" onClick={fightSprung}>
            <PixelIcon name="sword" size={22} />
            {t('ui.enc.fight')}
          </AutoButton>
        }
      >
        <div className="flex flex-col items-center gap-2 py-2 text-center" role="status">
          <p className="m-0 text-[26px] leading-tight text-danger">{t('ui.disguise.reveal', { name })}</p>
          <p className="copy m-0 text-muted">{t('ui.disguise.noRun')}</p>
        </div>
      </StagePanel>
    )
  }
  return (
    <StagePanel
      scene={stage}
      bar={
        <AutoButton
          variant="primary"
          size="lg"
          className="w-full"
          paused="byDialogs"
          onClick={disguise ? () => void revealDisguise() : pickUpFind}
        >
          {t('ui.enc.pickUp')}
        </AutoButton>
      }
    >
      <div className="flex flex-col items-center gap-2 py-2 text-center" role="status">
        {/* Pickup's find after a win (docs/51): who found it, with its talent's gem. */}
        {enc.pickup && <PickupTag uid={enc.pickup.uid} dex={enc.pickup.dex} />}
        <RarityTag rarity={rarity} />
        <p className="m-0 text-[26px] leading-tight">{line}</p>
        {does && <p className="copy m-0 text-muted">{does}</p>}
      </div>
    </StagePanel>
  )
}

/** "Found by Zigzagoon's Pickup!": over a find a Pokémon's Pickup talent made after a win (docs/51). */
export function PickupTag({ uid, dex }: { uid: string; dex: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const nick = useGame((s) => s.save?.box.find((p) => p.id === uid)?.nickname)
  const name = nick || data.species[dex]?.name || t('ui.common.pokemon')
  return (
    <span className="inline-flex items-center gap-1.5 bg-gold-pale px-2 pb-1 pt-0.5 text-[18px] leading-none shadow-ring-line">
      <TalentGem talent="pickup" size={14} />
      {t('ui.talent.pickupFind', { name })}
    </span>
  )
}

/** "Common find", "Uncommon find", "Rare find": small, over the find's name. */
export function RarityTag({ rarity }: { rarity: FindRarity }) {
  const { t } = useT()
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 px-2 pb-1 pt-0.5 font-pixel-sm text-[16px] leading-none',
        RARITY_LOOK[rarity],
      )}
    >
      {rarity === 'rare' && <PixelIcon name="sparkle" size={14} />}
      {t(`ui.find.${rarity}`)}
    </span>
  )
}

/**
 * The find dropping into the middle of the stage: it falls from above the picture (turning a little, its shadow
 * growing under it), lands squashed with a thud and a puff of dust either side, bounces twice and settles, then bobs
 * and twinkles while it waits — more sparkles, and a glow behind it, the rarer it is. Short motion: one bounce; no
 * motion, or a screen that should stay calm: it lies there, still.
 */
export function FoundThing({ enc, isMoney, rarity }: { enc: Find; isMoney: boolean; rarity: FindRarity }) {
  const data = useGame((s) => s.data)
  const { level, calm } = useMotion()
  const wide = useMediaQuery('(min-width: 1024px)')
  const still = level === 'off' || calm
  const short = level === 'short'
  const size = wide ? 136 : 80
  const item = data.items[enc.itemKey]
  // The fall's length, and when it touches the ground (its share of it).
  const dur = short ? 0.5 : 0.95
  const land = short ? 0.6 : 0.45
  // Its sounds: the whistle as it falls, the thud as it lands, its sparkle (a rare one's fanfare).
  useEffect(() => {
    if (still) {
      feelSound(rarity === 'rare' ? 'find.rare' : 'find.item')
      return
    }
    feelSound('find.fall')
    const timers = [
      setTimeout(() => feelSound('find.land'), dur * land * 1000),
      setTimeout(() => feelSound(rarity === 'rare' ? 'find.rare' : 'find.item'), dur * 1000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [still, dur, land, rarity])
  // The fall, then the bounces: each segment its own stepped curve.
  const keys = short
    ? {
        y: ['-420%', '0%', '-14%', '0%'],
        scaleY: [1, 0.72, 1.05, 1],
        scaleX: [1, 1.25, 0.96, 1],
        rotate: [-18, 0, 0, 0],
        times: [0, land, 0.8, 1],
        ease: [fall, rise, drop],
      }
    : {
        y: ['-420%', '0%', '-24%', '0%', '-7%', '0%'],
        scaleY: [1, 0.7, 1.06, 0.88, 1.02, 1],
        scaleX: [1, 1.28, 0.95, 1.1, 0.99, 1],
        rotate: [-20, 0, 4, 0, 0, 0],
        times: [0, land, 0.62, 0.76, 0.88, 1],
        ease: [fall, rise, drop, rise, drop],
      }
  const shadow = short ? [0.2, 1, 0.85, 1] : [0.2, 1, 0.75, 1, 0.92, 1]
  return (
    <div
      className="absolute z-20"
      style={{
        left: `${FIND_SPOT.x * 100}%`,
        top: `${FIND_SPOT.y * 100}%`,
        width: size,
        height: size,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {/* A rare find glows behind, a slow pulse in steps. */}
      {rarity === 'rare' && (
        <motion.span
          aria-hidden
          className="absolute -inset-[30%] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,214,90,0.55) 0%, rgba(255,214,90,0) 65%)' }}
          initial={{ opacity: 0 }}
          animate={still ? { opacity: 0.8 } : { opacity: [0, 0.9, 0.5, 0.9] }}
          transition={
            still
              ? { duration: 0 }
              : { delay: dur, duration: 1.6, times: [0, 0.2, 0.6, 1], repeat: Infinity, ease: stepped(3) }
          }
        />
      )}
      {/* Its shadow on the ground, small while it's high, full as it lands (centred by its frame: the animation's own
          transform would undo a translate on it). */}
      <span aria-hidden className="absolute left-1/2 top-[90%] h-[12%] w-[72%] -translate-x-1/2 -translate-y-1/2">
        <motion.span
          className="block h-full w-full bg-black/30"
          style={{ borderRadius: '50%' }}
          initial={still ? false : { scale: 0.2, opacity: 0.4 }}
          animate={{ scale: still ? 1 : shadow, opacity: 1 }}
          transition={{ duration: dur, times: keys.times, ease: stepped(4) }}
        />
      </span>
      {/* The puff of dust either side as it lands. */}
      {!still &&
        [-1, 1].map((side) => (
          <motion.span
            key={side}
            aria-hidden
            className="absolute top-full h-[14%] w-[22%] bg-white/75"
            style={{ left: '39%', borderRadius: '50%' }}
            initial={{ opacity: 0, x: 0, y: '-60%', scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], x: `${side * 160}%`, y: ['-60%', '-130%'], scale: [0.4, 1, 1.2] }}
            transition={{ delay: dur * land, duration: 0.36, ease: stepped(4), times: [0, 0.3, 1] }}
          />
        ))}
      <motion.div
        className="relative h-full w-full"
        style={{ transformOrigin: '50% 100%' }}
        initial={still ? false : { y: '-420%', scaleY: 1, scaleX: 1, rotate: -20 }}
        animate={
          still ? { y: '0%' } : { y: keys.y, scaleY: keys.scaleY, scaleX: keys.scaleX, rotate: keys.rotate }
        }
        transition={still ? { duration: 0 } : { duration: dur, times: keys.times, ease: keys.ease }}
      >
        {/* Then it bobs, two pixels up and back, while it waits to be picked up. */}
        <motion.div
          className="h-full w-full"
          animate={still ? undefined : { y: ['0%', '-4%', '0%'] }}
          transition={{ delay: dur + 0.3, duration: 1.2, repeat: Infinity, ease: stepped(2) }}
        >
          {isMoney ? <PixelIcon name="coin" size={size} /> : <ItemSprite item={item} size={size} />}
        </motion.div>
      </motion.div>
      {!still &&
        SPARKLES[rarity].map((s, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: 0.9,
              delay: dur + 0.1 + s.d,
              repeat: Infinity,
              repeatDelay: rarity === 'rare' ? 0.3 : 0.7,
              ease: stepped(2),
              times: [0, 0.4, 1],
            }}
          >
            <PixelIcon name="sparkle" size={Math.round(size / 4)} />
          </motion.span>
        ))}
    </div>
  )
}

/**
 * A Pokémon posing as a find springs out (docs/61 §3): the ball on the ground wobbles, the third wobble bursts it in a
 * white flash, and the Pokémon stands where it lay, with a hop. No motion, or a calm screen: the Pokémon is simply there.
 */
export function SprungThing({
  itemKey,
  dex,
  shiny,
  size: own,
}: {
  itemKey: string
  dex: number
  shiny?: boolean
  /** Its size to the stage's (a gift's, sized to the stage); unset = the find's screen's. */
  size?: number
}) {
  const data = useGame((s) => s.data)
  const { level, calm } = useMotion()
  const wide = useMediaQuery('(min-width: 1024px)')
  const still = level === 'off' || calm
  const size = own ?? (wide ? 136 : 80)
  const item = data.items[itemKey]
  // The wobbles and the burst take this long; the Pokémon is out from there.
  const burst = level === 'short' ? 0.45 : 0.8
  useEffect(() => {
    if (still) return void fxSound('catch.open')
    fxSound('catch.wobble')
    const timers = [
      setTimeout(() => fxSound('catch.wobble'), burst * 400),
      setTimeout(() => fxSound('catch.open'), burst * 1000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [still, burst])
  return (
    <div
      className="absolute z-20"
      style={{
        left: `${FIND_SPOT.x * 100}%`,
        top: `${FIND_SPOT.y * 100}%`,
        width: size * 1.6,
        height: size * 1.6,
        transform: 'translate(-50%, -100%)',
      }}
    >
      {!still && (
        <motion.div
          aria-hidden
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{ width: size * 0.62, height: size * 0.62, transformOrigin: '50% 100%' }}
          initial={{ rotate: 0, opacity: 1, scale: 1 }}
          animate={{ rotate: [0, -18, 18, -12, 0], opacity: [1, 1, 1, 1, 0], scale: [1, 1, 1, 1.4, 1.6] }}
          transition={{ duration: burst, times: [0, 0.25, 0.5, 0.8, 1], ease: stepped(6) }}
        >
          <ItemSprite item={item} size={Math.round(size * 0.62)} />
        </motion.div>
      )}
      {!still && (
        <motion.span
          aria-hidden
          className="absolute bottom-[5%] left-1/2 h-[70%] w-[70%] -translate-x-1/2 bg-white"
          style={{ borderRadius: '50%' }}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 0.95, 0], scale: [0.2, 1.2, 1.5] }}
          transition={{ delay: burst * 0.85, duration: 0.35, ease: stepped(4) }}
        />
      )}
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{ transformOrigin: '50% 100%' }}
        initial={still ? false : { opacity: 0, scale: 0.3, y: 0 }}
        animate={still ? { opacity: 1 } : { opacity: [0, 1, 1, 1], scale: [0.3, 1.1, 0.95, 1], y: ['0%', '-12%', '0%', '0%'] }}
        transition={still ? { duration: 0 } : { delay: burst * 0.9, duration: 0.5, ease: stepped(5) }}
      >
        <SpriteImg dex={dex} size={Math.round(size * 1.5)} shiny={shiny} />
      </motion.div>
    </div>
  )
}
