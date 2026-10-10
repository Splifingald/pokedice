import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  deckSize,
  asSeenBy,
  gymsFor,
  playerSideOf,
  progressOf,
  scaledLevelSpan,
  teamAverageLevel,
  type Area,
  type AreaProgress,
  type DeckCard,
} from '@/engine'
import { AreaTypes } from '@/components/AreaTypes'
import { AutoModeToggle } from '@/components/AutoModeToggle'
import { BadgeIcon } from '@/components/BadgeIcon'
import { PixelIcon, type IconName } from '@/components/icons'
import { preloadSprites } from '@/components/SpriteImg'
import { joinList, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { BattleView } from './battle/BattleView'
import { CasinoView } from './area/CasinoView'
import { CenterView } from './area/CenterView'
import { EncounterPreview } from './area/EncounterPreview'
import { AreaDetails } from './home/AreaDetails'
import { RebattleHeader } from './events/RebattlePage'
import { AreaStrip } from '@/components/AreaStrip'

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
 * encounters aren't dealt from a deck.
 */
export function RoundGauge({ area, progress }: { area: Area; progress: AreaProgress }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config
  if (!cfg.showRoundGauge || cfg.encounterMode !== 'deck') return null
  const remaining = progress.deck?.length ?? 0
  const met = progress.drawn ?? []
  const inRound = remaining > 0
  const justDone = !inRound && met.length > 0 // the round's last card was just met
  // Saves from before rounds were tracked know how many cards are left, not which were met.
  const total = inRound ? (progress.drawn ? met.length + remaining : Math.max(deckSize(area), remaining)) : justDone ? met.length : deckSize(area)
  const metCount = inRound ? total - remaining : justDone ? total : 0
  const unknown = Math.max(0, metCount - met.length)
  // Preview (admin option): the deck is drawn from the end, so the next card is its last one.
  const ahead = cfg.showRoundPreview && inRound ? [...progress.deck!].reverse() : []
  const side = save ? playerSideOf(save) : null
  const gymId = cfg.showRoundPreview ? gymsFor(area, data, side).find((id) => !progress.gymsDefeated.includes(id) && data.trainers[id]) : undefined
  const gym = gymId ? asSeenBy(data.trainers[gymId]!, side) : undefined
  const boss = cfg.showRoundPreview && !gym ? (area.legendaryBoss ?? []).find((b) => !progress.bossesDefeated.includes(b.dex)) : undefined
  const finale = gym
    ? gym.badge
      ? t('ui.area.gymWithBadge', { name: gym.name, badge: gym.badge })
      : gym.name
    : boss
      ? (data.species[boss.dex]?.name ?? t('ui.area.aLegendary'))
      : null
  const gauge = (
    <div
      className="flex items-center gap-2"
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
              title={done ? (card ? cardName(card) : t('ui.area.cardMet')) : t(next ? 'ui.area.cardNext' : 'ui.area.cardToCome')}
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
  if (!ahead.length && !finale) return gauge
  return (
    <>
      {gauge}
      <div className="flex items-center gap-2">
        <span className="sr-only">{t('ui.area.ahead')}</span>
        <ol
          className="flex min-w-0 flex-1 gap-[2px]"
          aria-label={t('ui.area.stillToCome', { cards: joinList(ahead.map(cardName)) || t('ui.area.nothing') })}
        >
          {Array.from({ length: total }, (_, i) => {
            const card = i >= metCount ? ahead[i - metCount] : undefined
            return (
              <li key={i} className="flex h-6 min-w-0 flex-1 items-center justify-center" title={card ? cardName(card) : undefined}>
                {card && <PixelIcon name={CARD_ICON[card]} size={16} />}
              </li>
            )
          })}
        </ol>
        <span className="flex min-w-[6ch] justify-end" title={finale ? t('ui.area.whenRoundsDone', { who: finale }) : undefined}>
          {gym?.badge ? (
            <BadgeIcon badge={gym.badge} earned size={18} />
          ) : gym ? (
            <PixelIcon name="vs" size={18} title={t('ui.map.gym', { name: gym.name })} />
          ) : boss ? (
            <PixelIcon name="masterball" size={18} title={t('ui.area.legendaryNamed', { name: finale ?? '' })} />
          ) : null}
        </span>
      </div>
    </>
  )
}

/**
 * Encounter types, a slim banner, then the name with its round (or a checkmark) and levels, the round gauge and, in a
 * cleared area, the auto-mode switch.
 */
function AreaHeader({ area, progress, teamAvg }: { area: Area; progress: AreaProgress; teamAvg: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const span = area.scalesToTeam ? scaledLevelSpan(area, teamAvg, data) : { min: area.minLevel, max: area.maxLevel }
  const notes = [
    area.scalesToTeam && t('ui.area.foesScale'),
    progress.cleared && t('ui.area.clearedNote', { multiplier: area.backtrackMultiplier }),
  ].filter(Boolean)
  // "Round 2/3" while rounds are still needed; a checkmark once they're all done (secret areas: nothing).
  const need = area.roundsToClear
  const done = progress.roundsDone ?? 0
  const [details, setDetails] = useState(false)
  return (
    <section className="pixel-panel overflow-hidden p-0" aria-labelledby="area-title">
      <AreaDetails area={details ? area : null} onClose={() => setDetails(false)} />
      {/* The encounter types sit on the banner's top right corner. */}
      <div className="relative">
        <AreaStrip area={area} h={40} className="block h-auto w-full" />
        <AreaTypes area={area} className="absolute left-2 right-2 top-2" />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            {/* The title opens the area's details, as its plate does on Home. */}
            <h1 id="area-title" className="m-0 min-w-0 text-[32px] font-normal leading-none">
              <button
                type="button"
                onClick={() => setDetails(true)}
                aria-haspopup="dialog"
                className="min-h-[44px] text-left underline decoration-dotted decoration-2 underline-offset-4 md:min-h-0"
              >
                {area.name}
              </button>
            </h1>
            {need != null &&
              (done >= need ? (
                <span
                  className="self-center bg-hp-green px-1.5 text-xl leading-tight text-ink shadow-ring"
                  style={{ borderRadius: 2 }}
                  title={t(`ui.area.allRoundsDone.${need === 1 ? 'one' : 'other'}`, { n: need })}
                  aria-label={t(`ui.area.allRoundsDone.${need === 1 ? 'one' : 'other'}`, { n: need })}
                >
                  ✓
                </span>
              ) : (
                <span className="shrink-0 text-2xl leading-none text-muted">
                  {t('ui.area.roundOf', { n: Math.min(done + 1, need), total: need })}
                </span>
              ))}
          </div>
          <span className="shrink-0 text-2xl leading-none">
            {span.min === span.max
              ? t('ui.area.levelOne', { n: span.min })
              : t('ui.map.levelRange', { min: span.min, max: span.max })}
          </span>
        </div>
        {notes.length > 0 && <div className="text-lg leading-tight text-muted">{notes.join(' · ')}</div>}
        <RoundGauge area={area} progress={progress} />
        {/* A cleared area can play itself: switched here, between its encounters, without a trip Home. */}
        {progress.cleared && (
          <div className="flex justify-end">
            <AutoModeToggle />
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * The encounter route: the preview of what CONTINUE rolled on Home, the Pokémon Center, the Game Corner and the battle.
 * Between encounters there is nothing to do here: Home is the area hub, so an idle run goes back there.
 */
export function AreaScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)

  const area = data.areas.find((a) => a.id === (run.areaId ?? save?.currentAreaId))
  useEffect(() => {
    if (area) preloadSprites(area.wildPool.map((w) => w.dex))
  }, [area])

  if (!save) return <Navigate to="/" replace />
  if (battle) return <BattleView key={battle.id} battle={battle} />
  // An Elite Rebattle run ends on its own page.
  if (!area || !run.areaId || run.phase === 'idle') return <Navigate to={run.rebattle ? '/events/rebattle' : '/home'} replace />

  const progress = progressOf(save, area.id)
  return (
    <div className="flex flex-col gap-4">
      {run.rebattle ? <RebattleHeader /> : <AreaHeader area={area} progress={progress} teamAvg={teamAverageLevel(save)} />}
      {run.phase === 'preview' && run.encounter && <EncounterPreview enc={run.encounter} />}
      {run.phase === 'center' && <CenterView />}
      {run.phase === 'casino' && <CasinoView />}
    </div>
  )
}
