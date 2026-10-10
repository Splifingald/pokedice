// The Elite Rebattle's page (docs/18, the Visual Lab's mockup): the regions whose League is won, the three tiers as
// medals (a bronze diamond, a silver pentagon, a gold hexagon), the gauntlet's ladder with what each trainer still pays,
// and START / CONTINUE. The fights themselves are League battles on the usual screens (/area); a cleared tier comes
// back here to its medal card.
import { useEffect } from 'react'
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
import { pushToast, useGame } from '@/store/game'
import { clearRebattleRun, startRebattle, useRebattleMedal } from '@/store/rebattle'
import { cx } from '@/theme/util'
import { EventPicture, EventRules } from './shared'

/** A tier's medal: Bronze a diamond, Silver a pentagon, Gold a hexagon (never I, II, III). */
export function Medal({ tier, size = 'md', className }: { tier: number; size?: 'sm' | 'md' | 'big'; className?: string }) {
  return <span className={cx('ev-medal', `m${Math.min(2, tier)}`, size !== 'md' && size, className)} aria-hidden />
}

/** A tier's name in the player's language ("Bronze"). */
export const tierName = (t: (k: string) => string, data: GameData, tier: number) =>
  t(`ui.events.rebattle.tier.${rebattleTiers(data)[tier]?.id ?? 'gold'}`)

/** The level span of a tier's trainers, for its medal ("Lv.64–73"). */
function tierLevels(save: SaveData, data: GameData, regionId: string, tier: number) {
  const levels = rebattleLineup(save, data, regionId, tier).flatMap((x) => x.team.map((m) => m.level))
  return levels.length ? { min: Math.min(...levels), max: Math.max(...levels) } : null
}

export function RebattlePage() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  useEffect(() => clearRebattleRun(), [])
  if (!save) return null
  const live = regionOf(save)
  const regionName = (id: string) => data.regions.find((r) => r.id === id)?.name ?? id
  const open = rebattleRegions(data).filter((id) => rebattleOpen(save, data, id))
  const here = open.includes(live)
  const tiers = rebattleTiers(data)
  const prog = rebattleProgress(save, live)
  const tier = currentTier(save, data, live)
  const complete = rebattleComplete(save, data, live)
  const lineup = here ? rebattleLineup(save, data, live, tier) : []
  const league = leagueArea(data, live)
  const go = () => {
    if (startRebattle()) navigate('/area')
  }
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
      {open.length > 1 && (
        <div role="radiogroup" aria-label={t('ui.events.rebattle.region')} className="flex flex-wrap gap-1.5">
          {open.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === live}
              aria-disabled={id !== live}
              onClick={() => id !== live && pushToast(t('ui.events.rebattle.travel', { region: regionName(id) }))}
              className={cx(
                'flex min-h-[36px] items-center gap-1.5 px-2.5 text-[18px] shadow-ring-line',
                id === live ? 'bg-gold text-ink shadow-ring' : 'bg-well text-muted',
              )}
            >
              {regionName(id)}
              {rebattleComplete(save, data, id) && <Medal tier={2} size="sm" />}
              {id !== live && <PixelIcon name="lock" size={14} />}
            </button>
          ))}
        </div>
      )}
      {!here ? (
        <p className="copy m-0 bg-well p-3 text-[18px] shadow-ring-line">{t('ui.events.rebattle.notHere', { region: regionName(live) })}</p>
      ) : (
        <>
          <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
            {tiers.map((x, i) => {
              const st = i < prog.done ? 'done' : i === tier && !complete ? 'now' : 'locked'
              const lv = tierLevels(save, data, live, i)
              return (
                <li
                  key={x.id}
                  className={cx(
                    'grid justify-items-center gap-1 px-1 py-2 text-center leading-none',
                    st === 'now' ? 'bg-cream shadow-[inset_0_0_0_3px_#f2553f]' : st === 'done' ? 'bg-panel shadow-ring' : 'bg-well text-muted shadow-ring-line',
                  )}
                >
                  <Medal tier={i} className={st === 'locked' ? 'grayscale opacity-50' : undefined} />
                  <b className="text-[17px] font-normal">{tierName(t, data, i)}</b>
                  <small className="font-pixel-sm text-[14px] text-muted">
                    {lv && (lv.min === lv.max ? t('ui.common.level.short', { n: lv.min }) : t('ui.map.levelRange', { min: lv.min, max: lv.max }))}
                    {' · '}₽×{x.gold}
                  </small>
                  {st === 'done' && <em className="bg-hp-green px-1.5 pb-0.5 font-pixel-sm text-[13px] not-italic text-ink">{t('ui.events.rebattle.cleared')}</em>}
                  {st === 'locked' && <em className="bg-well-deep px-1.5 pb-0.5 font-pixel-sm text-[13px] not-italic text-muted">{t('ui.events.rebattle.locked')}</em>}
                </li>
              )
            })}
          </ol>
          {complete ? (
            <p className="copy m-0 bg-good-pale p-3 text-[18px] shadow-[inset_0_0_0_2px_#34c97a]">
              {t('ui.events.rebattle.allCleared', { league: league?.name ?? regionName(live) })}
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-[22px] font-normal leading-none">{t('ui.events.rebattle.gauntlet', { tier: tierName(t, data, tier) })}</h2>
                <span className="font-pixel-sm text-[16px] tabular-nums text-muted">
                  {prog.step}/{lineup.length}
                </span>
              </div>
              <ol className="m-0 grid list-none gap-1.5 p-0">
                {lineup.map((m, i) => {
                  const st = i < prog.step ? 'won' : i === prog.step ? 'next' : ''
                  const levels = m.team.map((x) => x.level)
                  const owed = m.team.reduce(
                    (n, x, k) => n + (prog.paid.includes(paidKey(tier, m.id, k)) ? 0 : rebattleGold(data, live, tier, x.level)),
                    0,
                  )
                  return (
                    <li
                      key={m.id}
                      className={cx(
                        'flex items-center gap-2 px-1.5 py-1',
                        st === 'next' ? 'bg-cream shadow-[inset_0_0_0_3px_#f2553f]' : st === 'won' ? 'bg-good-pale shadow-[inset_0_0_0_2px_#34c97a]' : 'bg-panel shadow-ring-line',
                      )}
                    >
                      <TrainerSprite src={m.spriteUrl} size={48} className={st === 'won' ? 'grayscale-[0.8]' : undefined} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <b className="truncate text-[18px] font-normal leading-none">
                          {m.name}
                          {m.role === 'champion' && (
                            <em className="ml-1 bg-gold px-1 pb-px align-[2px] font-pixel-sm text-[12px] not-italic text-ink">{t('ui.events.rebattle.championTag')}</em>
                          )}
                        </b>
                        <span className="flex gap-0.5" aria-label={m.team.map((x) => data.species[x.dex]?.name ?? '').join(', ')}>
                          {m.team.map((x, k) => (
                            <MiniSprite key={k} dex={x.dex} size={20} />
                          ))}
                        </span>
                        <small className="font-pixel-sm text-[14px] leading-none text-muted">
                          {t('ui.map.levelRange', { min: Math.min(...levels), max: Math.max(...levels) })}
                          {' · '}
                          {owed > 0 ? money(owed) : t('ui.events.rebattle.paid')}
                        </small>
                      </span>
                      {st === 'won' && (
                        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center bg-hp-green shadow-ring" aria-label={t('ui.events.rebattle.beaten')}>
                          <PixelIcon name="check" size={16} />
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
              <EventRules id="rebattle" data={data} />
              <PixelButton variant="primary" size="lg" className="w-full" onClick={go}>
                {prog.step && lineup[prog.step]
                  ? t('ui.events.rebattle.continue', { name: lineup[prog.step]!.name })
                  : t('ui.events.rebattle.start', { tier: tierName(t, data, tier) })}
              </PixelButton>
            </>
          )}
        </>
      )}
      <MedalCard />
    </div>
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
          <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">{status}</small>
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
          <p className="relative m-0 font-pixel-sm text-[16px] uppercase tracking-[0.1em] text-ink">{league?.name}</p>
          <h3 className="relative m-0 text-[28px] font-normal leading-[1.05]">
            {t('ui.events.rebattle.medalTitle', { tier: tierName(t, data, medal.tier) })}
          </h3>
          <p className="relative m-0 mb-1 font-pixel-sm text-[16px] text-muted">
            {last ? t('ui.events.rebattle.medalLast') : t('ui.events.rebattle.medalNext', { tier: tierName(t, data, medal.tier + 1) })}
          </p>
          <PixelButton variant="primary" className="relative w-full" onClick={close} autoFocus>
            {t('ui.events.rebattle.great')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}
