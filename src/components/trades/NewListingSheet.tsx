// New listing (docs/23 §1.1, §2), three steps on one sheet: your Pokémon (every region's Box, blocked ones greyed
// with why), what you want for it (a species from the grid, any you don't own, or anything), who can see it. Picking
// folds a step into its pick, with Change. Then a summary and POST.
import { useMemo, useState, type ReactNode } from 'react'
import {
  homeRegionOf,
  newForTrade,
  ownedForTrades,
  regionName,
  tradeBlocked,
  tradeCfg,
  tradeChoices,
  tradeRegions,
  tradesOf,
  wantable,
  TRADE_VISIBILITY,
  type RegionId,
  type TradeVisibility,
  type TradeWant,
} from '@/engine'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { dexNo } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { post } from '@/store/trades'
import { cx } from '@/theme/util'
import { LevelTag } from '../Chip'
import { PixelButton } from '../PixelButton'
import { FilterChips, SearchField, Seg } from '../Segmented'
import { Sheet } from '../Sheet'
import { MiniSprite } from '../SpriteImg'
import type { Shared } from './ShareListing'
import { ShinyStar, useBlockText, useTradeErrorText } from './TradeBits'

/** The species grid shows this many at first, then more on demand: a phone draws a few hundred tiles slowly. */
const GRID_PAGE = 90

type Own = 'not' | 'own' | 'all'
type Kind = TradeWant['kind']

/** What was posted: enough to share it straight away. */
export interface Posted extends Shared {
  id: string
}

export function NewListingSheet({
  open,
  initial,
  onClose,
  onPosted,
}: {
  open: boolean
  /** A Pokémon already picked (TRADE on its sheet). */
  initial?: string | null
  onClose: () => void
  onPosted: (p: Posted) => void
}) {
  // A fresh draft each time it opens.
  if (!open) return null
  return <Draft initial={initial ?? null} onClose={onClose} onPosted={onPosted} />
}

function Draft({
  initial,
  onClose,
  onPosted,
}: {
  initial: string | null
  onClose: () => void
  onPosted: (p: Posted) => void
}) {
  const { t, tPlural } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const errorText = useTradeErrorText()
  const blockText = useBlockText()
  const cfg = tradeCfg(data)
  const regions = tradeRegions(save, data)
  const [pick, setPick] = useState<string | null>(initial)
  const [monRegion, setMonRegion] = useState<RegionId>(regions[0] ?? 'kanto')
  const [monQ, setMonQ] = useState('')
  const [monSort, setMonSort] = useState<'level' | 'dex'>('level')
  const [kind, setKind] = useState<Kind>('species')
  const [want, setWant] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [own, setOwn] = useState<Own>('not')
  const [reg, setReg] = useState<RegionId | 'all'>('all')
  const [more, setMore] = useState(1)
  const [vis, setVis] = useState<TradeVisibility>('public')
  const [busy, setBusy] = useState(false)
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')
  const lv = (n: number) => t('ui.common.level.short', { n })

  const mons = useMemo(() => tradeChoices(save, data), [save, data])
  const picked = mons.find((m) => m.inst.id === pick) ?? null
  const owned = useMemo(() => ownedForTrades(save, data).has, [save, data])
  const all = useMemo(() => wantable(save, data), [save, data])
  const out = tradesOf(save).out.length
  const full = out >= cfg.maxListings

  // ---------------------------------------------------------------- 1. your Pokémon
  let step1
  if (picked)
    step1 = (
      <Picked
        dex={picked.inst.dex}
        title={
          <>
            {name(picked.inst.dex)}
            {picked.inst.shiny && <ShinyStar />}
            <LevelTag level={picked.inst.level} />
          </>
        }
        line={
          picked.inTeam
            ? t('ui.trades.new.inTeam')
            : t('ui.trades.new.inBox', { region: regionName(data, picked.region) })
        }
        onChange={() => setPick(null)}
      />
    )
  else {
    const needle = searchFold(monQ.trim())
    const list = mons
      .filter((m) => m.region === monRegion)
      .filter(
        (m) =>
          !needle ||
          searchFold(name(m.inst.dex)).includes(needle) ||
          String(m.inst.dex) === needle.replace(/^#?0*/, ''),
      )
      .sort(
        (a, b) =>
          (monSort === 'level' ? b.inst.level - a.inst.level : a.inst.dex - b.inst.dex) ||
          a.inst.dex - b.inst.dex,
      )
    step1 = (
      <div className="flex flex-col gap-2">
        {regions.length > 1 && (
          <Seg
            label={t('ui.trades.new.region')}
            value={monRegion}
            onChange={setMonRegion}
            options={regions.map((r) => ({ id: r, label: regionName(data, r) }))}
            className="overflow-x-auto"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            id="tr-mon-q"
            value={monQ}
            onChange={setMonQ}
            label={t('ui.trades.new.searchMon')}
            className="min-w-0 flex-[1_1_150px]"
          />
          <Seg
            label={t('ui.trades.new.sort')}
            value={monSort}
            onChange={setMonSort}
            options={[
              { id: 'level', label: t('ui.trades.new.sortLevel') },
              { id: 'dex', label: t('ui.team.sortDex') },
            ]}
          />
        </div>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 p-0">
          {list.length === 0 && (
            <li className="col-span-full p-3 text-center font-pixel-sm text-[16px] text-muted">
              {t('ui.search.noMatch')}
            </li>
          )}
          {list.map((m) => {
            const why = tradeBlocked(save, data, m)
            return (
              <li key={m.inst.id}>
                <button
                  type="button"
                  aria-disabled={!!why || undefined}
                  aria-label={`${name(m.inst.dex)}, ${lv(m.inst.level)}${why ? `: ${blockText(why, m.inst.dex)}` : ''}`}
                  onClick={() => (why ? pushToast(blockText(why, m.inst.dex), 'info') : setPick(m.inst.id))}
                  className={cx(
                    'relative grid h-full w-full justify-items-center gap-0.5 px-1 pb-1.5 pt-1 text-center',
                    why ? 'bg-well shadow-ring-line' : 'bg-paper shadow-ring-line hover:shadow-ring',
                  )}
                >
                  <MiniSprite dex={m.inst.dex} size={40} className={cx(why && 'opacity-60 grayscale')} />
                  <b className="max-w-full truncate text-[16px] font-normal leading-none">
                    {name(m.inst.dex)}
                  </b>
                  <span className="font-pixel-sm text-[16px] leading-none text-muted">
                    {lv(m.inst.level)}
                  </span>
                  {m.inst.shiny && (
                    <span className="absolute right-1 top-1">
                      <ShinyStar />
                    </span>
                  )}
                  {m.inTeam && (
                    <span className="light-scope absolute left-[3px] top-[3px] bg-night px-[3px] pb-[2px] pt-px font-pixel-sm text-tag leading-none text-gold-light">
                      {t('ui.trades.teamTag')}
                    </span>
                  )}
                  {why && (
                    <small className="font-pixel-sm text-tag leading-[1.05] text-ink">
                      {blockText(why, m.inst.dex)}
                    </small>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // ---------------------------------------------------------------- 2. in exchange
  let grid = null
  if (kind === 'species' && want != null)
    grid = (
      <Picked
        dex={want}
        title={name(want)}
        line={`${dexNo(want)} · ${
          owned.has(want)
            ? t('ui.trades.new.owned')
            : newForTrade(save, data, want)
              ? t('ui.trades.new.notInDex')
              : t('ui.trades.new.inDexNotBox')
        }`}
        onChange={() => setWant(null)}
      />
    )
  else if (kind === 'species') {
    const text = q.trim()
    const num = /^#?\d+$/.test(text) ? Number(text.replace('#', '')) : null
    const needle = searchFold(text)
    const base = all.filter(
      (d) =>
        (reg === 'all' || homeRegionOf(data, d) === reg) &&
        (num != null ? String(d).startsWith(String(num)) : !needle || searchFold(name(d)).includes(needle)),
    )
    const count = {
      not: base.filter((d) => !owned.has(d)).length,
      own: base.filter((d) => owned.has(d)).length,
    }
    const shown = base.filter((d) => (own === 'not' ? !owned.has(d) : own === 'own' ? owned.has(d) : true))
    const page = shown.slice(0, GRID_PAGE * more)
    grid = (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            id="tr-want-q"
            value={q}
            onChange={(v) => {
              setQ(v)
              setMore(1)
            }}
            label={t('ui.trades.new.searchWant')}
            className="min-w-0 flex-[1_1_150px]"
          />
          <Seg
            label={t('ui.trades.new.show')}
            value={own}
            onChange={(v) => {
              setOwn(v)
              setMore(1)
            }}
            options={[
              { id: 'not', label: t('ui.trades.new.notOwned'), count: count.not },
              { id: 'own', label: t('ui.trades.new.owned'), count: count.own },
              { id: 'all', label: t('ui.dex.fAll'), count: base.length },
            ]}
          />
        </div>
        {regions.length > 1 && (
          <FilterChips
            label={t('ui.trades.new.region')}
            value={reg}
            onChange={(v) => {
              setReg(v)
              setMore(1)
            }}
            options={[
              { id: 'all' as const, label: t('ui.trades.new.allRegions') },
              ...regions.map((r) => ({ id: r, label: regionName(data, r) })),
            ]}
          />
        )}
        <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0 sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))]">
          {page.length === 0 && (
            <li className="col-span-full p-3 text-center font-pixel-sm text-[16px] text-muted">
              {t('ui.trades.new.noSpecies')}
            </li>
          )}
          {page.map((d) => {
            const has = owned.has(d)
            const fresh = !has && newForTrade(save, data, d)
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setWant(d)}
                  aria-label={`${name(d)}, ${dexNo(d)}, ${
                    has
                      ? t('ui.trades.new.owned')
                      : fresh
                        ? t('ui.trades.new.notInDex')
                        : t('ui.trades.new.notOwned')
                  }`}
                  className="relative grid h-full w-full justify-items-center gap-0.5 bg-paper px-1 pb-1.5 pt-1 text-center shadow-ring-line hover:shadow-ring"
                >
                  <span className="font-pixel-sm text-tag leading-none text-muted">{dexNo(d)}</span>
                  <MiniSprite dex={d} size={40} />
                  <b className="max-w-full truncate text-[16px] font-normal leading-none">{name(d)}</b>
                  {has && (
                    <span className="absolute right-[3px] top-[3px] bg-good-pale px-[3px] pb-[2px] pt-px font-pixel-sm text-tag leading-none text-good shadow-[inset_0_0_0_1px_#34c97a]">
                      {t('ui.trades.new.owned')}
                    </span>
                  )}
                  {fresh && (
                    <span className="absolute right-[3px] top-[3px] bg-gold px-[3px] pb-[2px] pt-px font-pixel-sm text-tag leading-none text-ink shadow-ring-thin">
                      {t('ui.common.new')}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {shown.length > page.length && (
          <PixelButton size="sm" className="self-center" onClick={() => setMore((n) => n + 1)}>
            {t('ui.trades.new.more', { n: shown.length - page.length })}
          </PixelButton>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------- 3. who can see it, the summary, POST
  const ready = !!picked && (kind !== 'species' || want != null)
  const blocked = full
    ? tPlural('ui.trades.new.full', cfg.maxListings)
    : !picked
      ? t('ui.trades.new.pickYours')
      : !ready
        ? t('ui.trades.new.pickWant')
        : null
  const submit = async () => {
    if (!picked || !ready || busy || full) return
    setBusy(true)
    const w: TradeWant = kind === 'species' ? { kind, dex: want! } : { kind }
    try {
      const listing = await post(picked.inst.id, w, vis)
      pushToast(t('ui.trades.new.posted', { name: name(picked.inst.dex) }), 'good')
      onPosted({
        id: listing.id,
        code: listing.code,
        dex: picked.inst.dex,
        level: picked.inst.level,
        shiny: !!picked.inst.shiny,
        want: w,
        visibility: vis,
      })
    } catch (err) {
      pushToast(errorText(err), 'bad', 4500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('ui.trades.new.title')}
      sub={t('ui.trades.new.sub', {
        n: Math.min(out + 1, cfg.maxListings),
        max: cfg.maxListings,
        days: tPlural('ui.trades.days', cfg.listingDays),
      })}
      footer={
        <PixelButton
          variant="primary"
          size="lg"
          className="w-full"
          aria-disabled={!!blocked || busy || undefined}
          onClick={() => (blocked ? pushToast(blocked, 'info') : void submit())}
          data-testid="trade-post"
        >
          {busy ? t('ui.common.loading') : (blocked ?? t('ui.trades.new.post'))}
        </PixelButton>
      }
    >
      <div className="flex flex-col gap-4">
        <Step n={1} title={t('ui.trades.new.step1')}>
          {step1}
        </Step>
        <Step n={2} title={t('ui.trades.new.step2')}>
          <Seg
            label={t('ui.trades.new.step2')}
            value={kind}
            onChange={setKind}
            options={[
              { id: 'species', label: t('ui.trades.new.kindSpecies') },
              { id: 'notOwned', label: t('ui.trades.want.notOwned') },
              { id: 'any', label: t('ui.trades.want.any') },
            ]}
            className="overflow-x-auto"
          />
          {kind === 'species' ? (
            grid
          ) : (
            <p className="copy m-0 text-[17px] text-muted">
              {t(kind === 'notOwned' ? 'ui.trades.new.notOwnedNote' : 'ui.trades.new.anyNote')}
            </p>
          )}
        </Step>
        <Step n={3} title={t('ui.trades.new.step3')}>
          <Seg
            label={t('ui.trades.new.step3')}
            value={vis}
            onChange={setVis}
            options={TRADE_VISIBILITY.map((v) => ({ id: v, label: t(`ui.trades.vis.${v}`) }))}
          />
          <p className="copy m-0 text-[17px] text-muted">{t(`ui.trades.new.visNote.${vis}`)}</p>
        </Step>
        {ready && picked && (
          <p className="copy m-0 bg-gold-pale p-2.5 text-[18px] leading-tight shadow-card-gold">
            {t(picked.inst.level > cfg.levelCap ? 'ui.trades.new.summaryCapped' : 'ui.trades.new.summary', {
              name: name(picked.inst.dex),
              days: tPlural('ui.trades.days', cfg.listingDays),
              level: lv(Math.min(picked.inst.level, cfg.levelCap)),
            })}
          </p>
        )}
      </div>
    </Sheet>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 flex items-center gap-2 text-[22px] font-normal leading-none">
        <span className="light-scope grid h-7 w-7 place-items-center bg-night text-[18px] leading-none text-gold-light">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A step folded into its pick: the Pokémon, a line about it, and Change. */
function Picked({
  dex,
  title,
  line,
  onChange,
}: {
  dex: number
  title: ReactNode
  line: string
  onChange: () => void
}) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2 bg-gold-pale py-1.5 pl-1.5 pr-2 shadow-card-gold">
      <MiniSprite dex={dex} size={40} className="-my-1 shrink-0" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="flex min-w-0 items-center gap-1 text-[19px] font-normal leading-none">{title}</b>
        <small className="font-pixel-sm text-[16px] leading-tight text-muted">{line}</small>
      </span>
      <PixelButton size="sm" variant="ghost" onClick={onChange}>
        {t('ui.trades.new.change')}
      </PixelButton>
    </div>
  )
}
