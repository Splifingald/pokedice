// The Trades page (docs/23 §2), Social's fourth view (docs/43 §5.8): the board (5 listings picked for you, NEW PICKS
// twice a day, docs/23 §2.1; a search shows every match, with its sort and chips, rows greyed with why) and Mine (your
// slots, each with SHARE and CANCEL, + New listing, and the trades done, each playing its scene again). Phones: Board
// and Mine as two tabs, NEW LISTING pinned at the foot. PC: the board on the left, your listings beside it. A guest
// sees the connect prompt and the four newest listings; before the second badge, the lock. INFO opens the rules.
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  badgesHeld,
  boardPicks,
  inWorldRegion,
  isExtreme,
  newForTrade,
  picksLeft,
  tradeCfg,
  tradeClosed,
  tradesOf,
  tradesToWatch,
  tradesOn,
  tradeRulesDue,
  tradesTakenToday,
  tradeSnapshot,
  type TradeOut,
} from '@/engine'
import { AccountButton } from '@/components/AccountButton'
import { Chip, LevelTag, NewTag } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { SocialColumns, SocialDock } from '@/components/SocialTabs'
import { SortSelect } from '@/components/TypeSelect'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { FilterChips, SearchField, Seg } from '@/components/Segmented'
import { MiniSprite } from '@/components/SpriteImg'
import { playerOf } from '@/components/TrainerArt'
import { ListingSheet } from '@/components/trades/ListingSheet'
import { NewListingSheet } from '@/components/trades/NewListingSheet'
import { ShareListingModal, type Shared } from '@/components/trades/ShareListing'
import {
  ListHead,
  ListingRow,
  NewPicksButton,
  ShinyStar,
  TimeLeft,
  useTakeWhy,
  useTradeErrorText,
  VisChip,
  WantTile,
} from '@/components/trades/TradeBits'
import { TradesRulesModal, useTradesRules } from '@/components/trades/TradeRules'
import { RulesCard } from '@/components/RulesCard'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { agoText } from '@/lib/ago'
import { playerAvatarId } from '@/lib/avatars'
import { useOnline } from '@/lib/online'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { BoardQuery, TradeListing } from '@/lib/trades'
import { pushToast, useGame } from '@/store/game'
import {
  cancel,
  checkListings,
  loadBoard,
  loadPicks,
  newPicks,
  playTrade,
  seeTradeRules,
  useTrades,
} from '@/store/trades'
import { cx } from '@/theme/util'
import { NameIn } from '@/components/TrainerName'
import { InstTalentGem } from '@/components/Talent'

type Tab = 'board' | 'mine'
type Show = 'all' | 'friends' | 'new' | 'can'
type Sort = 'tradable' | 'soon' | 'newest'

export function TradesScreen() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const auth = useGame((s) => s.auth)
  const [rules, setRules] = useState(false)
  const on = tradesOn(data)
  const out = save ? tradesOf(save).out.length : 0
  const closed = save ? tradeClosed(save, data) : 'off'
  // Its rules where they apply (docs/43 §7): a card at the top of the page, for a signed-in player who can trade, until
  // GOT IT sets the flag. Opening the page no longer counts as reading them.
  const tradesRules = useTradesRules()
  const rulesDue = !!save && auth.status === 'signed_in' && tradeRulesDue(save, data)
  // Mine says what the server says: a listing taken since the last check shows up (and its scene waits for Home).
  useEffect(() => {
    if (auth.status === 'signed_in') void checkListings()
  }, [auth.status])

  // Off for this player, nothing listed: the feature isn't there (docs/15 §20). Inside a small world there are no
  // trades at all (docs/21).
  if (!isSupabaseConfigured || !save || inWorldRegion(save, data) || ((!on || isExtreme(save)) && !out))
    return <Navigate to="/home" replace />
  const cfg = tradeCfg(data)
  const signedIn = auth.status === 'signed_in'
  const used = tradesTakenToday(save, Date.now())

  let body
  if (auth.status === 'unavailable')
    body = (
      <p className="m-0 bg-paper px-3.5 py-4 text-center text-[20px] shadow-card">
        {t('ui.friends.offline')}
      </p>
    )
  else if (auth.status === 'unknown')
    body = <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
  else if (!signedIn) body = <Guest />
  else if (closed === 'badges') body = <Locked />
  else if (closed) body = <Mine offNote />
  else body = <Open />

  return (
    <div className="flex flex-col gap-3">
      <PageHead
        icon="trade"
        title={t('ui.trades.title')}
        count={
          signedIn && !closed
            ? t('ui.trades.today', { n: Math.max(0, cfg.tradesPerDay - used), max: cfg.tradesPerDay })
            : undefined
        }
        social="trades"
      />
      {rulesDue && (
        <RulesCard title={t('ui.trades.title')} icon="trade" rules={tradesRules} onDone={seeTradeRules} />
      )}
      {body}
      {on && <InfoButton name={t('ui.trades.title')} onClick={() => setRules(true)} />}
      <TradesRulesModal open={rules} onClose={() => setRules(false)} />
    </div>
  )
}

/** Signed in, the switch on, enough badges: the two tabs. */
function Open() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const location = useLocation()
  const navigate = useNavigate()
  // TRADE on a Pokémon's sheet comes here with that Pokémon to list.
  const asked = (location.state as { list?: string } | null)?.list ?? null
  const [tab, setTab] = useState<Tab>(asked ? 'mine' : 'board')
  const [drafting, setDrafting] = useState<string | null | false>(asked ?? false)
  const [sharing, setSharing] = useState<Shared | null>(null)
  const unseen = tradesToWatch(save).length
  const cfg = tradeCfg(data)
  const wide = useMediaQuery('(min-width: 1024px)')

  // The location's ask is used once: going back to the page later doesn't reopen the draft.
  useEffect(() => {
    if (asked) navigate('.', { replace: true, state: null })
  }, [asked, navigate])

  const out = tradesOf(save).out.length
  const full = out >= cfg.maxListings
  const newListing = (
    <PixelButton variant="primary" className="w-full" disabled={full} onClick={() => setDrafting(null)}>
      {t('ui.trades.newListing')} · {out}/{cfg.maxListings}
    </PixelButton>
  )
  const sheets = (
    <>
      <NewListingSheet
        open={drafting !== false}
        initial={drafting || null}
        onClose={() => setDrafting(false)}
        onPosted={(p) => {
          setDrafting(false)
          setTab('mine')
          if (p.visibility === 'private') setSharing(p)
        }}
      />
      <ShareListingModal listing={sharing} onClose={() => setSharing(null)} />
    </>
  )

  // PC: the board, and your listings beside it with NEW LISTING on top.
  if (wide)
    return (
      <>
        <SocialColumns
          main={<Board />}
          side={
            <section aria-labelledby="tr-mine-title" className="flex flex-col gap-2.5 bg-panel p-2.5 shadow-card">
              <h2 id="tr-mine-title" className="m-0 flex items-center gap-2 text-[24px] font-normal leading-none">
                <PixelIcon name="trade" size={24} />
                {t('ui.trades.tabMine')}
                {unseen > 0 && (
                  <span aria-label={t('ui.trades.dotLabel')} className="h-2.5 w-2.5 bg-gold shadow-ring-thin" />
                )}
              </h2>
              {newListing}
              <Mine onShare={setSharing} narrow />
            </section>
          }
        />
        {sheets}
      </>
    )

  return (
    <>
      <Seg
        tabs
        idPrefix="tr"
        label={t('ui.trades.title')}
        value={tab}
        onChange={setTab}
        options={[
          { id: 'board', label: t('ui.trades.tabBoard') },
          {
            id: 'mine',
            label: (
              <span className="relative inline-flex items-center gap-1">
                {t('ui.trades.tabMine')}
                {unseen > 0 && (
                  <span
                    aria-label={t('ui.trades.dotLabel')}
                    className="h-2.5 w-2.5 bg-gold shadow-ring-thin"
                  />
                )}
              </span>
            ),
            count: `${out}/${cfg.maxListings}`,
          },
        ]}
      />
      <div role="tabpanel" aria-labelledby={`tr-${tab}`} className="flex flex-col gap-2.5">
        {tab === 'board' ? <Board /> : <Mine onShare={setSharing} />}
      </div>
      {/* The page's one red action, in the thumb's reach on both tabs. */}
      <SocialDock>{newListing}</SocialDock>
      {sheets}
    </>
  )
}

/**
 * The board (docs/23 §2.1): the listings picked for you (`boardPicks`: up to the admin's 5 you can take, a Pokémon
 * you don't have first, then a hidden talent your family lacks), with NEW PICKS twice a day; typing a search shows
 * every listing that matches, with the chips and the sort, as often as you like.
 */
function Board() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('tradable')
  const [needle, setNeedle] = useState('')

  // The search reaches the server a moment after typing stops: the species it names, and a trainer's name.
  useEffect(() => {
    const id = setTimeout(() => setNeedle(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])
  const query = useMemo(() => {
    if (!needle) return null
    const f = searchFold(needle)
    const dex = data.speciesList.filter((s) => searchFold(s.name).includes(f)).map((s) => s.dex)
    return {
      sort: sort === 'newest' ? ('newest' as const) : ('soon' as const),
      dex: dex.slice(0, 200),
      query: needle,
    }
  }, [needle, sort, data])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          id="tr-q"
          value={q}
          onChange={setQ}
          label={t('ui.trades.search')}
          className="min-w-0 flex-[1_1_140px]"
        />
        {query && (
          <SortSelect
            label={t('ui.trades.sort')}
            value={sort}
            onChange={setSort}
            className="flex-[0_1_auto]"
            options={[
              { id: 'tradable', label: t('ui.trades.sortTradable') },
              { id: 'soon', label: t('ui.trades.sortSoon') },
              { id: 'newest', label: t('ui.trades.sortNewest') },
            ]}
          />
        )}
      </div>
      {query ? <Found query={query} sort={sort} /> : <Picks />}
    </>
  )
}

/** The listings picked for you, and NEW PICKS. */
function Picks() {
  const { t } = useT()
  const online = useOnline()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const candidates = useTrades((s) => s.picks)
  const state = useTrades((s) => s.picksState)
  const takeWhy = useTakeWhy()
  const [open, setOpen] = useState<TradeListing | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void loadPicks(), [])

  const now = Date.now()
  const { picks, more } = useMemo(
    () => boardPicks(save, data, candidates ?? [], now),
    // `now` moves every render; the picks only change with the save, the data or the candidates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save, data, candidates],
  )
  const cfg = tradeCfg(data)
  const reroll = async () => {
    setBusy(true)
    try {
      await newPicks(picks.map((p) => p.listing.id))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="grid gap-1">
        <ListHead count={candidates ? picks.length : undefined}>{t('ui.trades.picksTitle')}</ListHead>
        <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{t('ui.trades.picksWhy')}</p>
      </div>
      {state === 'loading' && !candidates && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
      )}
      {state === 'error' && !candidates && (
        <p className="m-0 p-4 text-center text-[20px] text-danger">
          {t(online ? 'ui.trades.error.failed' : 'ui.common.offline')}
        </p>
      )}
      {candidates && (
        <ul className="m-0 grid list-none gap-1.5 p-0 xl:grid-cols-2" data-testid="trade-board">
          {picks.length === 0 && (
            <li className="bg-paper px-3.5 py-4 text-center font-pixel-sm text-[17px] leading-[1.2] text-muted shadow-ring-line">
              {t(candidates.length ? 'ui.trades.nothingPicked' : 'ui.trades.empty')}
            </li>
          )}
          {picks.map(({ listing: l }) => (
            <ListingRow key={l.id} listing={l} why={takeWhy(l, now)} now={now} onOpen={() => setOpen(l)} />
          ))}
        </ul>
      )}
      {picks.length > 0 && (
        <NewPicksButton
          left={picksLeft(save, data, now)}
          max={cfg.boardRerolls}
          more={more}
          busy={busy}
          onClick={() => void reroll()}
        />
      )}
      <ListingSheet listing={open} onClose={() => setOpen(null)} onChanged={() => void loadPicks(true)} />
    </>
  )
}

/** A search's listings: every one that matches, with the chips and the sort (tradable first by default). */
function Found({ query, sort }: { query: BoardQuery; sort: Sort }) {
  const { t } = useT()
  const online = useOnline()
  const data = useGame((s) => s.data)
  const board = useTrades((s) => s.board)
  const state = useTrades((s) => s.boardState)
  const takeWhy = useTakeWhy()
  const save = useGame((s) => s.save)!
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<TradeListing | null>(null)
  useEffect(() => void loadBoard(query), [query])

  const now = Date.now()
  const rows = (board ?? []).map((l) => ({ l, why: l.isMe ? null : takeWhy(l, now) }))
  const fresh = (l: TradeListing) => !l.isMe && newForTrade(save, data, l.dex)
  const counts = {
    all: rows.length,
    friends: rows.filter((r) => r.l.isFriend).length,
    new: rows.filter((r) => fresh(r.l)).length,
    can: rows.filter((r) => !r.l.isMe && !r.why).length,
  }
  const shown = rows.filter((r) =>
    show === 'friends'
      ? r.l.isFriend
      : show === 'new'
        ? fresh(r.l)
        : show === 'can'
          ? !r.l.isMe && !r.why
          : true,
  )
  // Tradable first: what you can take now, friends first, then ending soonest; yours last.
  if (sort === 'tradable')
    shown.sort(
      (a, b) =>
        Number(a.l.isMe) - Number(b.l.isMe) ||
        Number(!!a.why) - Number(!!b.why) ||
        Number(b.l.isFriend) - Number(a.l.isFriend) ||
        a.l.endsAt - b.l.endsAt,
    )

  return (
    <>
      <FilterChips
        label={t('ui.trades.show')}
        value={show}
        onChange={setShow}
        options={[
          { id: 'all', label: t('ui.dex.fAll'), count: counts.all },
          { id: 'friends', label: t('ui.trades.chipFriends'), count: counts.friends },
          { id: 'new', label: t('ui.trades.chipNew'), count: counts.new },
          { id: 'can', label: t('ui.trades.chipCan'), count: counts.can },
        ]}
      />
      {state === 'loading' && !board && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
      )}
      {state === 'error' && !board && (
        <p className="m-0 p-4 text-center text-[20px] text-danger">
          {t(online ? 'ui.trades.error.failed' : 'ui.common.offline')}
        </p>
      )}
      {board && (
        <ul className="m-0 grid list-none gap-1.5 p-0 xl:grid-cols-2" data-testid="trade-board">
          {shown.length === 0 && (
            <li className="bg-paper px-3.5 py-4 text-center font-pixel-sm text-[17px] leading-[1.2] text-muted shadow-ring-line">
              {show === 'can' && rows.length ? t('ui.trades.nothingToTake') : t('ui.trades.noMatch')}
            </li>
          )}
          {shown.map(({ l, why }) => (
            <ListingRow key={l.id} listing={l} why={why} now={now} onOpen={() => setOpen(l)} />
          ))}
        </ul>
      )}
      <ListingSheet
        listing={open}
        onClose={() => setOpen(null)}
        onChanged={() => void loadBoard(query, true)}
      />
    </>
  )
}

/** Your slots, then the trades done. `offNote`: trades were switched off with something still listed. */
function Mine({
  onShare,
  offNote,
  narrow,
}: {
  onShare?: (s: Shared) => void
  offNote?: boolean
  /** PC's side column: one listing a row. */
  narrow?: boolean
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const errorText = useTradeErrorText()
  const cfg = tradeCfg(data)
  const tr = tradesOf(save)
  const [open, setOpen] = useState<TradeListing | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // A listing taken while away is NEW (and keeps the gold dot) until its scene has played, here or back Home.
  const fresh = new Set(tr.unseen ?? [])
  // A traded Pokémon whose Box is still to pick: its scene ends on the pick.
  const picking = new Set((tr.landing ?? []).map((l) => l.id))
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')
  // A Pokémon traded with its nickname goes by it; the line under keeps the species.
  const called = (m: { dex: number; nickname?: string }) => m.nickname || name(m.dex)
  const lv = (n: number) => t('ui.common.level.short', { n })
  const now = Date.now()
  const asListing = (o: TradeOut): TradeListing => ({
    id: o.listing,
    code: o.code,
    owner: null,
    name: playerOf(save).name,
    avatar: playerAvatarId(save.player),
    isMe: true,
    isFriend: false,
    dex: o.mon.dex,
    level: o.mon.level,
    shiny: !!o.mon.shiny,
    talent: !!o.mon.talent,
    homeRegion: o.region,
    want: o.want,
    visibility: o.visibility,
    createdAt: o.at,
    endsAt: o.endsAt,
    poster: tradeSnapshot(save, data),
  })
  const doCancel = async (o: TradeOut) => {
    setBusy(o.listing)
    try {
      const res = await cancel(o.listing)
      pushToast(
        t(res === 'cancelled' ? 'ui.trades.backInBox' : 'ui.trades.tooLate', { name: called(o.mon) }),
        'info',
        4000,
      )
    } catch (err) {
      pushToast(errorText(err), 'bad', 4500)
    } finally {
      setBusy(null)
    }
  }

  const slots = Array.from({ length: Math.max(cfg.maxListings, tr.out.length) }, (_, i) => tr.out[i] ?? null)
  return (
    <>
      {/* How a listing lives is the rules' (INFO); only the switched-off note stays, as it explains the page. */}
      {offNote && <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{t('ui.trades.offNote')}</p>}
      <ul className={cx('m-0 grid list-none gap-1.5 p-0', !narrow && 'sm:grid-cols-2')} data-testid="trade-slots">
        {slots.map((o, i) =>
          o ? (
            <li key={o.listing} className="grid gap-1.5 bg-paper p-2 shadow-card">
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 text-left"
                onClick={() => setOpen(asListing(o))}
              >
                <MiniSprite dex={o.mon.dex} size={40} className="-my-1 shrink-0" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <b className="flex min-w-0 items-center gap-1 text-[19px] font-normal leading-none">
                    <span className="truncate">{called(o.mon)}</span>
                    {o.mon.shiny && <ShinyStar />}
                    <InstTalentGem inst={o.mon} />
                    <LevelTag level={o.mon.level} />
                  </b>
                  <small className="font-pixel-sm text-[16px] leading-tight text-muted">
                    {t('ui.trades.frozen')}
                  </small>
                </span>
                <VisChip visibility={o.visibility} />
              </button>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="font-pixel-sm text-[16px] text-muted">{t('ui.trades.for')}</span>
                <WantTile want={o.want} />
              </span>
              <TimeLeft endsAt={o.endsAt} days={cfg.listingDays} now={now} prefix />
              <span className="grid grid-cols-2 gap-1.5">
                <PixelButton
                  size="sm"
                  disabled={!onShare}
                  onClick={() =>
                    onShare?.({
                      code: o.code,
                      dex: o.mon.dex,
                      level: o.mon.level,
                      shiny: !!o.mon.shiny,
                      want: o.want,
                      visibility: o.visibility,
                    })
                  }
                >
                  {t('ui.trades.share.button')}
                </PixelButton>
                <PixelButton size="sm" disabled={busy === o.listing} onClick={() => void doCancel(o)}>
                  {t('ui.common.cancel')}
                </PixelButton>
              </span>
            </li>
          ) : (
            // An open slot: a dashed outline, its number (NEW LISTING, pinned at the foot or on top of the column, fills it).
            <li
              key={`empty-${i}`}
              className="grid min-h-[52px] place-content-center border-2 border-dashed border-shadow font-pixel-sm text-[18px] text-muted"
            >
              {t('ui.home.freeSlot')}
            </li>
          ),
        )}
      </ul>

      <ListHead count={tr.log?.length ?? 0}>{t('ui.trades.doneTitle')}</ListHead>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {!tr.log?.length && (
          <li className="bg-paper px-3.5 py-4 text-center font-pixel-sm text-[17px] leading-[1.2] text-muted shadow-ring-line">
            {t('ui.trades.doneEmpty')}
          </li>
        )}
        {(tr.log ?? []).map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 bg-paper py-1.5 pl-1.5 pr-2.5 text-left shadow-ring-line hover:shadow-ring"
              onClick={() => playTrade({ entry: e, away: e.role === 'poster' && fresh.has(e.id) })}
            >
              <span className="flex shrink-0 items-center" aria-hidden>
                <MiniSprite dex={e.gave.dex} size={32} className="-my-1" />
                <span className="px-0.5 text-[18px] text-muted">→</span>
                <MiniSprite dex={e.evolvedTo ?? e.got.dex} size={32} className="-my-1" />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <b className="text-[18px] font-normal leading-tight">
                  <NameIn
                    name={e.with || t('ui.friends.someone')}
                    rich={!!e.with && e.withRich}
                    text={(name) =>
                      e.role === 'taker'
                        ? t('ui.trades.log.took', { name, mon: called(e.got) })
                        : t('ui.trades.log.taken', { name, mon: called(e.gave) })
                    }
                  />
                </b>
                <small className="font-pixel-sm text-[16px] leading-tight text-muted">
                  {[
                    t('ui.trades.log.gave', { mon: `${name(e.gave.dex)} ${lv(e.gave.level)}` }),
                    t('ui.trades.log.got', { mon: `${name(e.got.dex)} ${lv(e.got.level)}` }),
                    e.evolvedTo != null ? t('ui.trades.log.evolved', { mon: name(e.evolvedTo) }) : '',
                    agoText(e.at, now),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              {picking.has(e.id) ? (
                <Chip tone="gold" className="shrink-0">
                  {t('ui.trades.log.pick')}
                </Chip>
              ) : (
                fresh.has(e.id) && <NewTag className="shrink-0" />
              )}
              <PixelIcon name="play" size={16} className="shrink-0 text-muted" />
              <span className="sr-only">{t('ui.trades.log.watch')}</span>
            </button>
          </li>
        ))}
      </ul>
      <ListingSheet listing={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** A guest: the connect prompt, and the four newest public listings under it. */
function Guest() {
  const { t } = useT()
  const board = useTrades((s) => s.board)
  const [open, setOpen] = useState<TradeListing | null>(null)
  useEffect(() => void loadBoard({ sort: 'newest' }), [])
  return (
    <>
      <div className="flex flex-col items-center gap-3 bg-gold-pale px-3.5 py-4 text-center shadow-card-gold">
        <span className="flex items-center gap-2" aria-hidden>
          <MiniSprite dex={25} size={40} />
          <PixelIcon name="trade" size={40} />
          <MiniSprite dex={158} size={40} />
        </span>
        <b className="text-[22px] font-normal leading-tight">{t('ui.trades.guestTitle')}</b>
        <p className="m-0 text-[18px] leading-[1.15]">{t('ui.trades.guestBody')}</p>
        <AccountButton />
      </div>
      {!!board?.length && (
        <>
          <ListHead count={board.length}>{t('ui.trades.onBoardNow')}</ListHead>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {board.slice(0, 4).map((l) => (
              <ListingRow key={l.id} listing={l} why={null} guest onOpen={() => setOpen(l)} />
            ))}
          </ul>
        </>
      )}
      <ListingSheet listing={open} onClose={() => setOpen(null)} />
    </>
  )
}

/** Before the badges it takes: how many, and why. */
function Locked() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const need = tradeCfg(data).minBadges
  const have = badgesHeld(save, data)
  return (
    <>
      <div className="grid justify-items-center gap-2 bg-paper px-3.5 py-4 text-center shadow-card">
        <PixelIcon name="lock" size={36} />
        <b className="text-[21px] font-normal leading-[1.1]">{t('ui.trades.locked', { n: need })}</b>
        <span className={cx('relative block h-2.5 w-[70%] bg-line shadow-ring-line-thin')} aria-hidden>
          <i
            className="absolute inset-y-0 left-0 block bg-gold"
            style={{ width: `${Math.min(1, have / Math.max(1, need)) * 100}%` }}
          />
        </span>
        <small className="font-pixel-sm text-[16px] text-muted">
          {t('ui.trades.lockedCount', { n: have, max: need })}
        </small>
      </div>
      <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{t('ui.trades.lockedWhy')}</p>
    </>
  )
}
