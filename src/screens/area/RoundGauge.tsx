import {
  asSeenBy,
  deckSize,
  fightBosses,
  gameFeelOn,
  gymsFor,
  playerSideOf,
  nightmareModeOf,
  portalModeOf,
  progressOf,
  type Area,
  type AreaProgress,
  type DeckCard,
} from '@/engine'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { feelSound } from '@/audio/feel'
import { BadgeIcon } from '@/components/BadgeIcon'
import { PixelIcon, type IconName } from '@/components/icons'
import { joinList, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { DistortionGauge } from '@/components/Portal'
import { NightmareGauge } from '@/components/Nightmare'

const CARD_ICON: Record<DeckCard, IconName> = {
  wild: 'ball',
  trainer: 'vs',
  center: 'heart',
  item: 'box',
  casino: 'coin',
  trick: 'pumpkin',
  legend: 'masterball',
}
/** What a met card was, for the gauge's tooltips. */
const cardName = (card: DeckCard) => t(`ui.card.${card}`)

/**
 * The round gauge, under the area name (no label): one tile per card of the current round's deck · n/total.
 * Met cards fill in, the one in play is white (a fight's strip) or the next has a white edge (the page), the rest stay
 * grey (nothing ahead is given away but the Pokémon Centers). A lost round (wipe) or a finished one leaves the next
 * round waiting, empty. Hidden with game_config.showRoundGauge, or when encounters aren't dealt from a deck. `compact` (the action bars) keeps the gauge alone, without the preview row.
 */
export function RoundGauge({
  area,
  progress,
  compact,
  strip,
  banner,
  className,
}: {
  area: Area
  progress: AreaProgress
  compact?: boolean
  /** A fight's: a thin bar along the stage's top edge, no label, taking no height of its own (a 360×640 phone). */
  strip?: boolean
  /** Home's area banner: the round's steps across its width on a light ground, the ones still ahead grey. */
  banner?: boolean
  className?: string
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config
  // A portal run (docs/28) counts the portals closed instead of a round's cards.
  const portal = portalModeOf(area, data)
  if (portal)
    return (
      <DistortionGauge closed={progress.portal?.closed ?? 0} total={portal.portals} className={className} />
    )
  // The nightmare (docs/30) counts its rounds won.
  const dream = nightmareModeOf(area, data)
  if (dream)
    return (
      <NightmareGauge
        round={progress.nightmare?.round ?? 0}
        total={dream.foes.length}
        className={className}
      />
    )
  if (!cfg.showRoundGauge || cfg.encounterMode !== 'deck') return null
  const remaining = progress.deck?.length ?? 0
  const met = progress.drawn ?? []
  const inRound = remaining > 0
  const justDone = !inRound && met.length > 0 // the round's last card was just met
  // Saves from before rounds were tracked know how many cards are left, not which were met.
  const total = inRound
    ? progress.drawn
      ? met.length + remaining
      : Math.max(deckSize(area, data), remaining)
    : justDone
      ? met.length
      : deckSize(area, data)
  const metCount = inRound ? total - remaining : justDone ? total : 0
  // Which round this is, of how many; every round done fills the gauge in green.
  const need = area.roundsToClear || 1
  const allDone = (progress.roundsDone ?? 0) >= need
  const round = Math.min((progress.roundsDone ?? 0) + (justDone ? 0 : 1), need)
  // Preview (admin option): the deck is drawn from the end, so the next card is its last one.
  const ahead = cfg.showRoundPreview && inRound ? [...progress.deck!].reverse() : []
  const side = save ? playerSideOf(save) : null
  const gymId = cfg.showRoundPreview
    ? gymsFor(area, data, side).find((id) => !progress.gymsDefeated.includes(id) && data.trainers[id])
    : undefined
  const gym = gymId ? asSeenBy(data.trainers[gymId]!, side) : undefined
  const boss =
    cfg.showRoundPreview && !gym
      ? fightBosses(area, data).find((b) => !progress.bossesDefeated.includes(b.dex))
      : undefined
  const finale = gym
    ? gym.badge
      ? t('ui.area.gymWithBadge', { name: gym.name, badge: gym.badge })
      : gym.name
    : boss
      ? (data.species[boss.dex]?.name ?? t('ui.area.aLegendary'))
      : null
  const label = justDone
    ? t('ui.area.roundComplete')
    : t(`ui.area.roundProgress${metCount === 1 ? '.one' : ''}`, { done: metCount, total })
  // Where the round's Pokémon Centers are (the user's call, 2026-10-27): a heart on their segments, met or still to come,
  // so a hurt team knows how far its next heal is. The deck is drawn from its end.
  const order: (DeckCard | undefined)[] = inRound ? [...met, ...[...progress.deck!].reverse()] : met
  const isCenter = (i: number) => order[i] === 'center'
  // Where the player is (the user, 2026-10-27): the cards met fill in (green once the area is cleared, the free play's
  // rounds), the one being played is white on a fight's strip, the next one has a white edge on the page's gauge, and
  // the rest stay grey.
  const passed = allDone ? 'bg-hp-green' : 'bg-gold'
  const centersLabel = order.slice(0, total).some((c, i) => c === 'center' && i >= metCount)
    ? ` ${t('ui.area.centerAhead', { n: order.slice(metCount, total).indexOf('center') + 1 })}`
    : ''
  if (strip)
    return (
      <div role="img" aria-label={label + centersLabel} className={cx('pointer-events-none', className)}>
        <ol className="flex h-[14px] gap-[2px] bg-night/80" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <li
              key={i}
              className={cx(
                'relative grid min-w-0 flex-1 place-items-center',
                i === metCount - 1 ? 'bg-white' : i < metCount ? passed : 'bg-[#3d4a6b]',
              )}
            >
              {isCenter(i) && <PixelIcon name="heart" size={12} />}
              {i === metCount - 1 && <FreshPip areaId={area.id} met={metCount} />}
            </li>
          ))}
        </ol>
      </div>
    )
  if (banner)
    return (
      // Inside the area's button, whose name already says where the area stands: drawn only.
      <div className={cx('flex items-center gap-2', className)} aria-hidden>
        <ol className="flex h-[14px] min-w-0 flex-1 gap-[3px]">
          {Array.from({ length: total }, (_, i) => (
            <li
              key={i}
              className={cx(
                'grid min-w-0 flex-1 place-items-center',
                i < metCount ? `${passed} shadow-ring` : 'bg-line shadow-ring-line',
                i === metCount && inRound && 'shadow-ring',
              )}
            >
              {isCenter(i) && <PixelIcon name="heart" size={12} />}
            </li>
          ))}
        </ol>
        <span className="whitespace-nowrap font-pixel-sm text-[16px] leading-none tabular-nums" aria-hidden>
          {allDone ? '✓' : `${round}/${need}`}
        </span>
      </div>
    )
  const gauge = (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={label + centersLabel}
    >
      {/* The rework: a plain gauge, a segment per card and no icons; the round beside it. */}
      <ol className="flex h-[20px] min-w-0 flex-1 gap-[3px] bg-night p-[3px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cx(
              'grid min-w-0 flex-1 place-items-center',
              i < metCount ? passed : 'bg-[#3d4a6b]',
              i === metCount && inRound && 'outline outline-2 -outline-offset-2 outline-white',
            )}
          >
            {isCenter(i) && <PixelIcon name="heart" size={12} />}
          </li>
        ))}
      </ol>
      <span className="min-w-[3ch] text-right font-pixel-sm text-[16px] tabular-nums leading-none text-muted" aria-hidden>
        {allDone ? '✓' : `${round}/${need}`}
      </span>
    </div>
  )
  if (compact || (!ahead.length && !finale)) return gauge
  return (
    <>
      {gauge}
      <div className="flex items-center gap-2">
        <span className="sr-only">{t('ui.area.ahead')}</span>
        <ol
          className="flex min-w-0 flex-1 gap-[2px]"
          aria-label={t('ui.area.stillToCome', {
            cards: joinList(ahead.map(cardName)) || t('ui.area.nothing'),
          })}
        >
          {Array.from({ length: total }, (_, i) => {
            const card = i >= metCount ? ahead[i - metCount] : undefined
            return (
              <li
                key={i}
                className="flex h-6 min-w-0 flex-1 items-center justify-center"
                title={card ? cardName(card) : undefined}
              >
                {card && <PixelIcon name={CARD_ICON[card]} size={16} />}
              </li>
            )
          })}
        </ol>
        <span
          className="flex min-w-[6ch] justify-end"
          title={finale ? t('ui.area.whenRoundsDone', { who: finale }) : undefined}
        >
          {gym?.badge ? (
            <BadgeIcon badge={gym.badge} earned size={18} />
          ) : gym ? (
            <PixelIcon name="vs" size={18} title={t('ui.map.gym', { name: gym.name })} />
          ) : boss ? (
            <PixelIcon
              name="masterball"
              size={18}
              title={t('ui.area.legendaryNamed', { name: finale ?? '' })}
            />
          ) : null}
        </span>
      </div>
    </>
  )
}

/** The last count each area's strip showed this session, and the count it last found new (docs/42). */
const shownMet = new Map<string, number>()
const freshMet = new Map<string, number>()

/**
 * The pip a new encounter just filled (docs/42): it flashes white, stands tall and settles to gold in steps, with a
 * chime, so every step of the area is felt. Once per pip; game feel only, and not when the screen should be calm.
 */
function FreshPip({ areaId, met }: { areaId: string; met: number }) {
  const { level, calm } = useMotion()
  const feel = useGame((s) => gameFeelOn(s.data))
  // Decided as the strip first draws, the same however many times React asks (StrictMode draws twice).
  const [isNew] = useState(() => {
    const before = shownMet.get(areaId)
    if (before !== met) {
      shownMet.set(areaId, met)
      freshMet.set(areaId, before != null && met > before ? met : -1)
    }
    return freshMet.get(areaId) === met
  })
  const fresh = isNew && feel && level !== 'off' && !calm
  useEffect(() => {
    if (fresh) feelSound('round.fill')
  }, [fresh])
  if (!fresh) return null
  return (
    <motion.span
      className="block h-full origin-top bg-white"
      initial={{ opacity: 1, scaleY: 2 }}
      animate={{ opacity: [1, 1, 0], scaleY: [2, 1.5, 1] }}
      // Held a beat for the stage's swipe to open, then three steps.
      transition={{ duration: 0.75, delay: 0.35, times: [0, 0.5, 1], ease: (p: number) => (p < 1 ? 0 : 1) }}
    />
  )
}

/**
 * The run's area gauge, over an area step's action bar (HOME / CONTINUE after a fight, the Center, between
 * encounters, the Game Corner): where the round stands, without scrolling back up to the header. Nothing in an Elite
 * Rebattle, which has no rounds.
 */
export function RunRoundGauge({ className, strip }: { className?: string; strip?: boolean }) {
  const area = useGame((s) => (s.run.rebattle ? undefined : s.data.areas.find((a) => a.id === s.run.areaId)))
  const save = useGame((s) => s.save)
  if (!area || !save) return null
  return <RoundGauge area={area} progress={progressOf(save, area.id)} compact strip={strip} className={className} />
}
