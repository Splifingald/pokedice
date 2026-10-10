import { useState, type ReactNode } from 'react'
import {
  asSeenBy,
  dueBoss,
  gymsFor,
  MONEY,
  playerSideOf,
  progressOf,
  teamAverageLevel,
  type Area,
  type EncounterKind,
} from '@/engine'
import { useT } from '@/i18n/react'
import { BadgeIcon } from '@/components/BadgeIcon'
import { Chip } from '@/components/Chip'
import { rarity } from '@/components/DexEntry'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { SheetSection } from '@/components/SheetSection'
import { PixelButton } from '@/components/PixelButton'
import { Seg } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { MiniSprite } from '@/components/SpriteImg'
import { money } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { RoundGauge } from '../Area'
import { levelText, useLevelSpan } from './AreaPlate'
import { areaStatus, lockReason } from './areas'
import { AreaStrip } from '@/components/AreaStrip'

/** Encounter kinds in the round mix: a colour each (the legend carries the words). */
const MIX: Record<EncounterKind, string> = {
  wild: '#34c97a',
  item: '#ffbe2e',
  center: '#ff7aa0',
  trainer: '#5b8def',
  casino: '#9b5de5',
}

function Fact({
  icon,
  small,
  title,
  note,
  tag,
  gold,
}: {
  icon: ReactNode
  small: string
  title: string
  note?: string
  tag?: ReactNode
  gold?: boolean
}) {
  return (
    <div
      className={cx(
        'flex items-center gap-2.5 px-2.5 py-2',
        gold ? 'bg-cream shadow-card-warm' : 'bg-paper shadow-card',
      )}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="grid min-w-0 flex-1 gap-0.5 leading-[1.05]">
        <small className="font-pixel-sm text-[13px] uppercase tracking-[0.08em] text-muted">{small}</small>
        <b className="text-[20px] font-normal">{title}</b>
        {note && <em className="font-pixel-sm text-[15px] not-italic text-muted">{note}</em>}
      </span>
      {tag}
    </div>
  )
}

/**
 * An area's details, in a sheet: its gym and legendary (and when the legendary shows up), the one-time finds still
 * there, the Pokémon to catch with rarity, odds, levels and a caught mark, what a round brings, and what turns up any
 * time. The footer continues here, travels here, or says why it's locked.
 */
export function AreaDetails({
  area,
  onClose,
  onPlay,
  onTravel,
}: {
  area: Area | null
  onClose: () => void
  onPlay: () => void
  onTravel: (area: Area) => void
}) {
  return (
    <Sheet
      open={!!area}
      onClose={onClose}
      title={area?.name ?? ''}
      sub={area ? <DetailsSub area={area} /> : null}
      footer={area ? <DetailsFoot area={area} onPlay={onPlay} onTravel={onTravel} /> : null}
    >
      {area && <DetailsBody key={area.id} area={area} />}
    </Sheet>
  )
}

function DetailsSub({ area }: { area: Area }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const span = useLevelSpan(area)
  const st = areaStatus(save, data, area)
  const rounds = area.roundsToClear
  return (
    <>
      {[
        levelText(span),
        rounds != null
          ? t(`ui.home.rounds.${rounds === 1 ? 'one' : 'other'}`, { n: rounds })
          : t('ui.home.secretArea'),
        t(`ui.home.stTitle.${st}`),
      ].join(' · ')}
    </>
  )
}

function DetailsFoot({
  area,
  onPlay,
  onTravel,
}: {
  area: Area
  onPlay: () => void
  onTravel: (area: Area) => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const st = areaStatus(save, data, area)
  if (st === 'locked')
    return (
      <PixelButton size="lg" className="w-full" disabled>
        <PixelIcon name="lock" size={20} />
        {lockReason(save, data, area)}
      </PixelButton>
    )
  return (
    <PixelButton
      variant="primary"
      size="lg"
      className="w-full"
      onClick={() => (st === 'here' ? onPlay() : onTravel(area))}
    >
      <PixelIcon
        name={st === 'here' ? 'play' : 'map'}
        size={22}
        color={st === 'here' ? '#ffffff' : undefined}
      />
      {st === 'here' ? t('ui.home.continueHere') : t('ui.home.travelHere')}
    </PixelButton>
  )
}

function DetailsBody({ area }: { area: Area }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const [view, setView] = useState<SheetView | null>(null)
  const p = progressOf(save, area.id)
  const st = areaStatus(save, data, area)
  const locked = st === 'locked'
  const side = playerSideOf(save)
  const avg = teamAverageLevel(save)
  const span = useLevelSpan(area)

  // The gym, or the League's battles.
  const gyms = gymsFor(area, data, side)
    .map((id) => data.trainers[id] && asSeenBy(data.trainers[id]!, side))
    .filter((g): g is NonNullable<typeof g> => !!g)
  const league = gyms.length > 1
  const due = dueBoss(area, p, avg)

  // Wild Pokémon, merged by species: their share of the pool and their levels.
  const total = area.wildPool.reduce((n, w) => n + Math.max(0, w.weight), 0)
  const wild = new Map<number, { share: number; min: number; max: number }>()
  for (const w of area.wildPool) {
    if (w.weight <= 0) continue
    const cur = wild.get(w.dex)
    wild.set(w.dex, {
      share: (cur?.share ?? 0) + (total ? w.weight / total : 0),
      min: Math.min(cur?.min ?? Infinity, w.minLevel),
      max: Math.max(cur?.max ?? 0, w.maxLevel),
    })
  }
  const mons = [...wild].map(([dex, w]) => ({ dex, ...w })).sort((a, b) => b.share - a.share || a.dex - b.dex)
  const left = mons.filter((m) => !save.pokedex.includes(m.dex))
  const [mode, setMode] = useState<'catch' | 'all'>(left.length ? 'catch' : 'all')
  const shown = mode === 'catch' ? left : mons

  const finds = area.lootPool.filter((e) => e.unique && e.weight > 0)
  const found = new Set(p.uniqueFound ?? [])
  const common = area.lootPool.filter((e) => !e.unique && e.weight > 0)
  const kinds = (Object.entries(area.encounterWeights) as [EncounterKind, number][]).filter(
    ([k, v]) => v > 0 && MIX[k],
  )
  const sum = kinds.reduce((n, [, v]) => n + v, 0)
  const pct = kinds.map(([k, v]) => [k, Math.round((v / sum) * 100)] as const).sort((x, y) => y[1] - x[1])
  const itemName = (key: string, qty?: number) =>
    key === MONEY ? money(qty ?? 0) : (data.items[key]?.name ?? key)

  return (
    <div className="grid gap-3.5 pt-0.5">
      <div className="relative mx-0.5 leading-[0] shadow-halo">
        <AreaStrip
          area={area}
          h={96}
          className={cx('h-auto w-full', locked && 'brightness-[0.92] grayscale-[0.7]')}
        />
        {locked && (
          <span className="absolute left-1/2 top-1/2 inline-flex max-w-[92%] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap bg-night/90 px-2.5 pb-1.5 pt-1 text-[17px] leading-none text-white">
            <PixelIcon name="lock" size={16} color="#ffffff" />
            {t('ui.dex.locked')}
          </span>
        )}
      </div>

      {(gyms.length > 0 || (area.legendaryBoss ?? []).length > 0) && (
        <div className="grid gap-2">
          {gyms.length > 0 &&
            (league ? (
              <Fact
                icon={<PixelIcon name="trophy" size={24} />}
                small={t('ui.home.league')}
                title={t('ui.home.eliteChampion')}
                note={t('ui.home.battlesInRow', { n: gyms.length })}
                tag={p.cleared ? <Chip tone="done">{t('ui.versus.beaten')}</Chip> : undefined}
              />
            ) : (
              <Fact
                icon={
                  gyms[0]!.badge ? (
                    <BadgeIcon badge={gyms[0]!.badge} earned size={24} />
                  ) : (
                    <PixelIcon name="badge" size={24} />
                  )
                }
                small={t('ui.home.gym')}
                title={gyms[0]!.name}
                note={gyms[0]!.badge ?? undefined}
                tag={
                  p.gymsDefeated.includes(gyms[0]!.id) ? (
                    <Chip tone="done">{t('ui.versus.beaten')}</Chip>
                  ) : undefined
                }
              />
            ))}
          {(area.legendaryBoss ?? []).map((b) => {
            const caught = save.pokedex.includes(b.dex)
            const beaten = p.bossesDefeated.includes(b.dex)
            const ready = due?.dex === b.dex
            const when =
              b.teamAvgThreshold == null
                ? t('ui.home.legendAfterRounds')
                : avg >= b.teamAvgThreshold
                  ? t('ui.home.legendReadyAvg', { avg })
                  : t('ui.home.legendAt', { need: b.teamAvgThreshold, avg })
            return (
              <Fact
                key={b.dex}
                gold
                icon={<MiniSprite dex={b.dex} size={40} silhouette={!caught && !beaten} />}
                small={t('ui.map.legendary')}
                title={`${caught || beaten ? (data.species[b.dex]?.name ?? '???') : t('ui.common.unknown')} · ${t('ui.common.level.short', { n: b.level })}`}
                note={when}
                tag={
                  caught ? (
                    <Chip tone="done">{t('ui.enc.caught')}</Chip>
                  ) : ready && !locked ? (
                    <Chip tone="gold">{t('ui.home.ready')}</Chip>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      )}

      {st === 'here' && <RoundGauge area={area} progress={p} />}

      {finds.length > 0 && (
        <SheetSection title={t('ui.home.finds')} hint={t('ui.home.oneTime')}>
          <ul className="grid gap-1.5">
            {finds.map((e) => {
              const got = found.has(e.id)
              return (
                <li
                  key={e.id}
                  className={cx(
                    'flex min-h-[46px] items-center gap-2 py-1 pl-1.5 pr-2.5',
                    got ? 'bg-well text-muted shadow-ring-line' : 'bg-cream shadow-card-warm',
                  )}
                >
                  {e.itemKey === MONEY ? (
                    <PixelIcon name="coin" size={20} className="mx-1" />
                  ) : (
                    <ItemSprite item={data.items[e.itemKey]} size={30} />
                  )}
                  <span className="grid min-w-0 flex-1 leading-[1.05]">
                    <b className="text-[19px] font-normal">{itemName(e.itemKey, e.maxQty)}</b>
                    <small className="font-pixel-sm text-[14px] text-muted">
                      {e.itemKey === MONEY ? t('ui.home.moneyStash') : t('ui.home.onlyOne')}
                    </small>
                  </span>
                  {got ? (
                    <Chip tone="done">{t('ui.home.found')}</Chip>
                  ) : (
                    <Chip tone="gold">{t('ui.home.stillHere')}</Chip>
                  )}
                </li>
              )
            })}
          </ul>
        </SheetSection>
      )}

      <SheetSection
        title={t('ui.common.pokemon')}
        extra={
          mons.length > 0 && (
            <Seg
              label={t('ui.home.showPokemon')}
              value={mode}
              onChange={setMode}
              options={[
                { id: 'catch', label: t('ui.home.fCatch'), count: left.length },
                { id: 'all', label: t('ui.home.fAll'), count: mons.length },
              ]}
            />
          )
        }
      >
        {!mons.length ? (
          <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.home.noWild')}</p>
        ) : !shown.length ? (
          <p className="m-0 flex items-center gap-1.5 font-pixel-sm text-[16px] text-muted">
            <PixelIcon name="ball" size={12} />
            {t('ui.home.allInDex', { n: mons.length })}
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(102px,1fr))] gap-1.5">
            {shown.map((m) => {
              const got = save.pokedex.includes(m.dex)
              const unknown = locked && !got
              const r = m.share >= 0.15 ? 'com' : m.share >= 0.06 ? 'unc' : 'rare'
              const levels = area.scalesToTeam ? levelText(span) : levelText({ min: m.min, max: m.max })
              return (
                <li key={m.dex}>
                  <button
                    type="button"
                    onClick={() => setView({ kind: 'dex', dex: m.dex })}
                    className={cx(
                      'relative grid w-full min-w-0 justify-items-center gap-[3px] px-1 pb-2 pt-1 text-center shadow-ring-line',
                      got ? 'bg-well' : 'bg-paper',
                    )}
                  >
                    <MiniSprite
                      dex={m.dex}
                      size={40}
                      silhouette={unknown}
                      className={got ? 'opacity-50' : undefined}
                    />
                    <b
                      className={cx(
                        'max-w-full truncate text-[17px] font-normal leading-none',
                        got && 'opacity-60',
                      )}
                    >
                      {unknown ? t('ui.common.unknown') : data.species[m.dex]?.name}
                    </b>
                    <span
                      className={cx(
                        'whitespace-nowrap px-1 pb-0.5 font-pixel-sm text-[13px] leading-none',
                        r === 'rare'
                          ? 'bg-gold text-ink shadow-ring-thin'
                          : r === 'unc'
                            ? 'bg-good-pale text-good'
                            : 'bg-sky text-ink',
                      )}
                    >
                      {rarity(m.share)} · {Math.round(m.share * 100)}%
                    </span>
                    <span className="font-pixel-sm text-[13px] leading-none text-muted">{levels}</span>
                    {got && (
                      <PixelIcon
                        name="ball"
                        size={12}
                        title={t('ui.enc.caught')}
                        className="absolute right-1.5 top-1.5"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </SheetSection>

      {sum > 0 && (
        <SheetSection title={t('ui.home.eachRound')}>
          <div
            className="flex h-4 gap-0.5 bg-night p-0.5"
            role="img"
            aria-label={pct.map(([k, n]) => `${t(`ui.home.kind.${k}`)} ${n}%`).join(', ')}
          >
            {pct.map(([k, n]) => (
              <i key={k} className="block min-w-1" style={{ flex: n, background: MIX[k] }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 font-pixel-sm text-[15px] text-muted" aria-hidden>
            {pct.map(([k, n]) => (
              <li key={k} className="inline-flex items-center gap-1">
                <i className="block h-2.5 w-2.5 shadow-ring-thin" style={{ background: MIX[k] }} />
                {t(`ui.home.kind.${k}`)} <b className="font-normal text-ink">{n}%</b>
              </li>
            ))}
          </ul>
        </SheetSection>
      )}

      {common.length > 0 && (
        <SheetSection title={t('ui.home.alsoHere')} hint={t('ui.home.anyTime')}>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {common.map((e) => (
              <li key={e.id} className="inline-flex items-center gap-1 font-pixel-sm text-[15px]">
                {e.itemKey === MONEY ? (
                  <PixelIcon name="coin" size={16} />
                ) : (
                  <ItemSprite item={data.items[e.itemKey]} size={26} />
                )}
                {e.itemKey === MONEY ? t('ui.home.pokedollars') : itemName(e.itemKey)}
              </li>
            ))}
          </ul>
        </SheetSection>
      )}

      <SheetModal view={view} onClose={() => setView(null)} />
    </div>
  )
}
