import {
  asSeenBy,
  deckSize,
  fightBosses,
  gymsFor,
  playerSideOf,
  portalModeOf,
  progressOf,
  type Area,
  type AreaProgress,
  type DeckCard,
} from '@/engine'
import { BadgeIcon } from '@/components/BadgeIcon'
import { PixelIcon, type IconName } from '@/components/icons'
import { joinList, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { DistortionGauge } from '@/components/Portal'

const CARD_ICON: Record<DeckCard, IconName> = {
  wild: 'ball',
  trainer: 'vs',
  center: 'heart',
  item: 'box',
  casino: 'coin',
  legend: 'masterball',
}
/** What a met card was, for the gauge's tooltips. */
const cardName = (card: DeckCard) => t(`ui.card.${card}`)

/**
 * The round gauge, under the area name (no label): one tile per card of the current round's deck · n/total.
 * Met cards show their icon, the next one has a gold edge, the rest stay dark (nothing ahead is given away). A lost
 * round (wipe) or a finished one leaves the next round waiting, empty. Hidden with game_config.showRoundGauge, or when
 * encounters aren't dealt from a deck. `compact` (the action bars) keeps the gauge alone, without the preview row.
 */
export function RoundGauge({
  area,
  progress,
  compact,
  className,
}: {
  area: Area
  progress: AreaProgress
  compact?: boolean
  className?: string
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config
  // A portal run (docs/28) counts the portals closed instead of a round's cards.
  const portal = portalModeOf(area, data)
  if (portal) return <DistortionGauge closed={progress.portal?.closed ?? 0} total={portal.portals} className={className} />
  if (!cfg.showRoundGauge || cfg.encounterMode !== 'deck') return null
  const remaining = progress.deck?.length ?? 0
  const met = progress.drawn ?? []
  const inRound = remaining > 0
  const justDone = !inRound && met.length > 0 // the round's last card was just met
  // Saves from before rounds were tracked know how many cards are left, not which were met.
  const total = inRound
    ? progress.drawn
      ? met.length + remaining
      : Math.max(deckSize(area), remaining)
    : justDone
      ? met.length
      : deckSize(area)
  const metCount = inRound ? total - remaining : justDone ? total : 0
  const unknown = Math.max(0, metCount - met.length)
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
  const gauge = (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={
        justDone
          ? t('ui.area.roundComplete')
          : t(`ui.area.roundProgress${metCount === 1 ? '.one' : ''}`, { done: metCount, total })
      }
    >
      <ol className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          const done = i < metCount
          const next = !justDone && i === metCount
          const card = done && i >= unknown ? met[i - unknown] : undefined
          return (
            <li
              key={i}
              title={
                done
                  ? card
                    ? cardName(card)
                    : t('ui.area.cardMet')
                  : t(next ? 'ui.area.cardNext' : 'ui.area.cardToCome')
              }
              className={cx(
                'flex h-6 min-w-0 flex-1 items-center justify-center border-2',
                done ? 'border-edge bg-panel' : next ? 'border-gold bg-line' : 'border-edge bg-line',
              )}
              style={{ borderRadius: 2 }}
            >
              {card && <PixelIcon name={CARD_ICON[card]} size={14} />}
            </li>
          )
        })}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {justDone ? '✓' : `${metCount}/${total}`}
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

/**
 * The run's area gauge, over an area step's action bar (HOME / CONTINUE after a fight, the Center, between
 * encounters, the Game Corner): where the round stands, without scrolling back up to the header. Nothing in an Elite
 * Rebattle, which has no rounds.
 */
export function RunRoundGauge({ className }: { className?: string }) {
  const area = useGame((s) => (s.run.rebattle ? undefined : s.data.areas.find((a) => a.id === s.run.areaId)))
  const save = useGame((s) => s.save)
  if (!area || !save) return null
  return <RoundGauge area={area} progress={progressOf(save, area.id)} compact className={className} />
}
