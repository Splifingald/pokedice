// The Elite Rebattle's page (docs/18, the Visual Lab's mockup): the region being played (its rebattle), the four tiers as
// medals (a bronze diamond, a silver pentagon, a gold hexagon, a blue circle for Diamond), the gauntlet's ladder with what each trainer still pays,
// and START / CONTINUE. The fights themselves are League battles on the usual screens (/area); a cleared tier comes
// back here to its medal card.
import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  currentTier,
  leagueArea,
  paidKey,
  rebattleComplete,
  rebattleGold,
  rebattleLineup,
  rebattleOpen,
  rebattleProgress,
  rebattleRegions,
  rebattleTiers,
  regionOf,
  type GameData,
  type SaveData,
} from '@/engine'
import { PixelIcon } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { clearRebattleRun, startRebattle, useRebattleMedal } from '@/store/rebattle'
import { cx } from '@/theme/util'
import { StagePanel } from './layout'
import { bannerUrl, EventInfo, EventPicture } from './shared'

/** A tier's medal: Bronze a diamond, Silver a pentagon, Gold a hexagon, Diamond a blue circle (never I, II, III). */
export function Medal({
  tier,
  size = 'md',
  className,
}: {
  tier: number
  size?: 'sm' | 'md' | 'big'
  className?: string
}) {
  return (
    <span
      className={cx('ev-medal', `m${Math.min(3, Math.max(0, tier))}`, size !== 'md' && size, className)}
      aria-hidden
    />
  )
}

/** A tier's name in the player's language ("Bronze"). */
export const tierName = (t: (k: string) => string, data: GameData, tier: number) => {
  const tiers = rebattleTiers(data)
  return t(`ui.events.rebattle.tier.${(tiers[tier] ?? tiers[tiers.length - 1])?.id ?? 'diamond'}`)
}

/** The level span of a tier's trainers, for its medal ("Lv.64–73"). */
function tierLevels(save: SaveData, data: GameData, regionId: string, tier: number) {
  const levels = rebattleLineup(save, data, regionId, tier).flatMap((x) => x.team.map((m) => m.level))
  return levels.length ? { min: Math.min(...levels), max: Math.max(...levels) } : null
}

export function RebattlePage({ head }: { head?: ReactNode }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const details = useDetails()
  const wide = useMediaQuery('(min-width: 1024px)')
  useEffect(() => clearRebattleRun(), [])
  if (!save) return null
  const live = regionOf(save)
  const regionName = (id: string) => data.regions.find((r) => r.id === id)?.name ?? id
  const open = rebattleRegions(data).filter((id) => rebattleOpen(save, data, id))
  const here = open.includes(live)
  const prog = rebattleProgress(save, live)
  const tier = currentTier(save, data, live)
  const complete = rebattleComplete(save, data, live)
  const lineup = here ? rebattleLineup(save, data, live, tier) : []
  const league = leagueArea(data, live)
  const next = !complete ? lineup[prog.step] : undefined
  const owedBy = (m: (typeof lineup)[number]) =>
    m.team.reduce(
      (n, x, k) =>
        n + (prog.paid.includes(paidKey(tier, m.id, k)) ? 0 : rebattleGold(data, live, tier, x.level)),
      0,
    )
  const go = () => {
    if (startRebattle()) navigate('/area')
  }
  const info = <EventInfo id="rebattle" compact={!!(here && !complete)} />
  return (
    <>
      <StagePanel
        head={head}
        stage={
          !here ? (
            <p className="copy m-0 bg-well p-3 text-[18px] shadow-ring-line">
              {t('ui.events.rebattle.notHere', { region: regionName(live) })}
            </p>
          ) : complete ? (
            <p className="copy m-0 bg-good-pale p-3 text-[18px] shadow-[inset_0_0_0_2px_#34c97a]">
              {t('ui.events.rebattle.allCleared', { league: league?.name ?? regionName(live) })}
            </p>
          ) : (
            // The gauntlet as a hall: the five trainers in a row on the carpet, who's next standing forward.
            // On PC the hall is the League's own picture, as tall as the screen, the trainers standing at its foot.
            <section
              aria-labelledby="rb-gauntlet"
              className="pixelated grid gap-2 bg-paper bg-cover px-2 pb-0 pt-2 shadow-card lg:flex lg:min-h-[calc(100dvh-var(--top-bar,56px)-15.5rem)] lg:flex-col lg:px-4 lg:pt-4"
              style={
                wide
                  ? {
                      backgroundImage: `url(${bannerUrl(data.config.events.rebattle.banner)})`,
                      backgroundPosition: '50% 80%',
                    }
                  : undefined
              }
            >
              <div
                className={cx(
                  'flex items-baseline justify-between gap-2',
                  wide && 'pixel-plate gap-6 self-start px-3 py-2',
                )}
              >
                <h2
                  id="rb-gauntlet"
                  className="m-0 flex items-center gap-2 text-[22px] font-normal leading-none lg:text-[28px]"
                >
                  <Medal tier={tier} size="sm" />
                  {t('ui.events.rebattle.gauntlet', { tier: tierName(t, data, tier) })}
                </h2>
                <span className="text-[18px] tabular-nums text-muted">
                  {prog.step}/{lineup.length}
                </span>
              </div>
              <ol className="rb-hall m-0 grid list-none grid-cols-5 items-end gap-1 p-0 pb-2 lg:mt-auto lg:gap-3 lg:pb-4">
                {lineup.map((m, i) => {
                  const st = i < prog.step ? 'won' : i === prog.step ? 'next' : 'later'
                  return (
                    <li
                      key={m.id}
                      aria-current={st === 'next' ? 'step' : undefined}
                      className={cx(
                        'relative grid justify-items-center gap-1 text-center',
                        st === 'next' && '-translate-y-1',
                      )}
                    >
                      <span
                        className={cx(
                          'relative grid w-full place-items-center pt-1',
                          st === 'next' ? 'bg-cream shadow-[inset_0_0_0_3px_#f2553f]' : 'bg-transparent',
                        )}
                      >
                        <TrainerSprite
                          src={m.spriteUrl}
                          size={wide ? (st === 'next' ? 112 : 96) : st === 'next' ? 56 : 48}
                          className={st === 'won' ? 'opacity-60 grayscale' : undefined}
                        />
                        {st === 'won' && (
                          <span className="absolute right-0 top-0 grid h-6 w-6 place-items-center bg-hp-green shadow-ring">
                            <PixelIcon name="check" size={16} />
                          </span>
                        )}
                      </span>
                      {/* The name on wide screens; a phone has the next one's in the panel. */}
                      <span className="hidden max-w-full truncate bg-panel px-1.5 text-[18px] leading-tight shadow-ring-line lg:block">
                        {m.name.replace(/^.* /, '')}
                      </span>
                      <span className="sr-only">
                        {m.name}
                        {st === 'won'
                          ? `, ${t('ui.events.rebattle.beaten')}`
                          : st === 'next'
                            ? `, ${t('ui.events.rebattle.next')}`
                            : ''}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        }
        panel={
          here && (
            <>
              {next && <NextTrainer trainer={next} owed={owedBy(next)} details={details} />}
              <MedalTrack save={save} data={data} live={live} details={details} />
              {details && !complete && (
                <ol
                  className="m-0 grid list-none gap-1 p-0"
                  aria-label={t('ui.events.rebattle.gauntlet', { tier: tierName(t, data, tier) })}
                >
                  {lineup.map((m, i) => {
                    const levels = m.team.map((x) => x.level)
                    const owed = owedBy(m)
                    return (
                      <li
                        key={m.id}
                        className={cx(
                          'flex items-center justify-between gap-2 text-[18px]',
                          i < prog.step && 'text-muted',
                        )}
                      >
                        <span className="truncate">{m.name}</span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {t('ui.map.levelRange', { min: Math.min(...levels), max: Math.max(...levels) })} ·{' '}
                          {owed > 0 ? money(owed) : t('ui.events.rebattle.paid')}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          )
        }
        dock={
          here && next ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <PixelButton variant="primary" size="lg" className="min-w-0 px-2" onClick={go}>
                {prog.step
                  ? t('ui.events.rebattle.continue', { name: next.name })
                  : t('ui.events.rebattle.start', { tier: tierName(t, data, tier) })}
              </PixelButton>
              {info}
            </div>
          ) : (
            info
          )
        }
      />
      <MedalCard />
    </>
  )
}

/** Who's next: the trainer, their team, what they still pay. */
function NextTrainer({
  trainer,
  owed,
  details,
}: {
  trainer: ReturnType<typeof rebattleLineup>[number]
  owed: number
  details: boolean
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <section className="flex items-center gap-3 bg-paper p-2.5 shadow-card" aria-labelledby="rb-next">
      <TrainerSprite src={trainer.spriteUrl} size={64} />
      <span className="grid min-w-0 flex-1 gap-1">
        <h2 id="rb-next" className="m-0 truncate text-[22px] font-normal leading-none">
          {t('ui.events.rebattle.nextFight', { name: trainer.name })}
        </h2>
        <span
          className="flex flex-wrap items-center gap-1"
          role="img"
          aria-label={trainer.team.map((x) => data.species[x.dex]?.name ?? '').join(', ')}
        >
          {trainer.team.map((x, k) => (
            <MiniSprite key={k} dex={x.dex} size={32} />
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-[18px] leading-none">
          {owed > 0 ? (
            <span className="inline-flex items-center gap-1">
              <PixelIcon name="coin" size={16} />
              {money(owed)}
            </span>
          ) : (
            <span className="text-muted">{t('ui.events.rebattle.paid')}</span>
          )}
          {details && (
            <span className="text-muted">
              {t('ui.map.levelRange', {
                min: Math.min(...trainer.team.map((x) => x.level)),
                max: Math.max(...trainer.team.map((x) => x.level)),
              })}
            </span>
          )}
        </span>
      </span>
    </section>
  )
}

/** The four tiers as a track of medals: cleared (a check), under way (ringed), locked (greyed, a lock). */
function MedalTrack({
  save,
  data,
  live,
  details,
}: {
  save: SaveData
  data: GameData
  live: string
  details: boolean
}) {
  const { t } = useT()
  const tiers = rebattleTiers(data)
  const prog = rebattleProgress(save, live)
  const tier = currentTier(save, data, live)
  const complete = rebattleComplete(save, data, live)
  return (
    <ol className="m-0 grid list-none grid-cols-4 gap-1 p-0">
      {tiers.map((x, i) => {
        const st = i < prog.done ? 'done' : i === tier && !complete ? 'now' : 'locked'
        const lv = details ? tierLevels(save, data, live, i) : null
        const state =
          st === 'done'
            ? t('ui.events.rebattle.cleared')
            : st === 'locked'
              ? t('ui.events.rebattle.locked')
              : t('ui.events.rebattle.next')
        return (
          <li
            key={x.id}
            aria-current={st === 'now' ? 'step' : undefined}
            className={cx(
              'relative grid justify-items-center gap-1 px-0.5 py-2 text-center leading-none',
              st === 'now'
                ? 'bg-cream shadow-[inset_0_0_0_3px_#f2553f]'
                : st === 'done'
                  ? 'bg-panel shadow-ring'
                  : 'bg-well text-muted shadow-ring-line',
            )}
          >
            <Medal tier={i} className={st === 'locked' ? 'opacity-50 grayscale' : undefined} />
            <b className="text-[18px] font-normal">{tierName(t, data, i)}</b>
            <span className="sr-only">{state}</span>
            {st === 'done' && (
              <span
                aria-hidden
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center bg-hp-green shadow-ring"
              >
                <PixelIcon name="check" size={12} />
              </span>
            )}
            {st === 'locked' && (
              <span aria-hidden className="absolute right-1 top-1">
                <PixelIcon name="lock" size={14} />
              </span>
            )}
            {lv && (
              <small className="text-[16px] text-muted">
                {lv.min === lv.max
                  ? t('ui.common.level.short', { n: lv.min })
                  : t('ui.map.levelRange', { min: lv.min, max: lv.max })}
                <br />
                ₽×{x.gold}
              </small>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The Area screen's header during a gauntlet fight: the event's banner, the tier's medal and the fight's place. */
export function RebattleHeader() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const enc = run.encounter
  if (!run.rebattle) return null
  const status = [
    tierName(t, data, run.rebattle.tier),
    enc?.kind === 'gym' ? t('ui.events.rebattle.fightOf', { n: enc.index, total: enc.total }) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <EventPicture id="rebattle" data={data} className="min-h-[96px] shadow-ring">
      <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-2 px-2.5 pb-1.5 pt-1">
        <Medal tier={run.rebattle.tier} size="sm" />
        <span className="grid min-w-0 gap-0.5">
          <span className="text-[22px] leading-none">{t('ui.events.rebattle.name')}</span>
          <small className="truncate font-pixel-sm text-[16px] leading-none text-muted">{status}</small>
        </span>
      </div>
    </EventPicture>
  )
}

/** A tier cleared: its medal, big, on rays, with confetti. */
function MedalCard() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const medal = useRebattleMedal((s) => s.medal)
  const close = () => useRebattleMedal.setState({ medal: null })
  const tiers = rebattleTiers(data)
  const last = !!medal && medal.tier >= tiers.length - 1
  const league = medal ? leagueArea(data, medal.regionId) : undefined
  return (
    <Modal
      open={!!medal}
      onClose={close}
      dismissable={false}
      label={medal ? t('ui.events.rebattle.medalTitle', { tier: tierName(t, data, medal.tier) }) : undefined}
      className="max-w-[330px] overflow-hidden bg-gradient-to-b from-gold-pale to-panel"
    >
      {medal && (
        <div className="relative grid justify-items-center gap-2 pt-1 text-center">
          <span className="ev-rays" aria-hidden />
          <Medal tier={medal.tier} size="big" className="relative" />
          <p className="relative m-0 font-pixel-sm text-[16px] uppercase tracking-[0.1em] text-ink">
            {league?.name}
          </p>
          <h3 className="relative m-0 text-[28px] font-normal leading-[1.05]">
            {t('ui.events.rebattle.medalTitle', { tier: tierName(t, data, medal.tier) })}
          </h3>
          <p className="relative m-0 mb-1 font-pixel-sm text-[16px] text-muted">
            {last
              ? t('ui.events.rebattle.medalLast')
              : t('ui.events.rebattle.medalNext', { tier: tierName(t, data, medal.tier + 1) })}
          </p>
          <PixelButton variant="primary" className="relative w-full" onClick={close} autoFocus>
            {t('ui.events.rebattle.great')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}
