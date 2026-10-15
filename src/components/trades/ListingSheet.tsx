// A listing, in a sheet (docs/23 §1.2, §2): the Pokémon large, whose, what they want, the time left, the level you'd
// get it at, then TRADE, or why you can't. TRADE opens the picker of your Pokémon that answer the want (what each
// brings: NEW, STRONGER, a trade evolution, nothing gained, locked), then a plain confirm (with the pick of its Box
// when several of your regions list it), then the scene. Your own listing offers CANCEL and SHARE instead.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  arrivalLevel,
  homeRegionOf,
  previewLandings,
  previewTake,
  regionName,
  takeChoices,
  tradeCfg,
  tradeEvolutionOf,
  tradeLandings,
  tradeRegions,
  type RegionId,
  type TakeChoice,
} from '@/engine'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { useFriends } from '@/lib/friends'
import type { TradeListing } from '@/lib/trades'
import { pushToast, useGame } from '@/store/game'
import { cancel, playTrade, take } from '@/store/trades'
import { cx } from '@/theme/util'
import { useConnect } from '../AccountButton'
import { Chip, LevelTag, NewTag } from '../Chip'
import { PixelButton } from '../PixelButton'
import { Sheet } from '../Sheet'
import { MiniSprite, SpriteImg } from '../SpriteImg'
import { TrainerLook } from '../TrainerLook'
import { TypeBadge } from '../TypeBadge'
import { speciesTypes } from '../TypeMatchups'
import { ShareListingModal, type Shared } from './ShareListing'
import { NameIn } from '../TrainerName'
import {
  LandingPick,
  RegionTag,
  ShinyStar,
  TimeLeft,
  useBlockText,
  useMinWhy,
  useTakeWhy,
  useTradeErrorText,
  VisChip,
  WantTile,
} from './TradeBits'

type Step = { kind: 'view' } | { kind: 'pick' } | { kind: 'confirm'; give: TakeChoice; region?: RegionId }

export function ListingSheet({
  listing,
  via,
  onClose,
  onChanged,
}: {
  listing: TradeListing | null
  /** Opened from a shared link (said under the title). */
  via?: 'link'
  onClose: () => void
  /** Taken or cancelled: the board should forget it. */
  onChanged?: () => void
}) {
  // The last listing stays while the sheet slides away; each listing opened starts a fresh flow.
  const last = useRef(listing)
  if (listing) last.current = listing
  const shown = listing ?? last.current
  if (!shown) return null
  return (
    <ListingFlow
      key={shown.id}
      open={!!listing}
      listing={shown}
      via={via}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

function ListingFlow({
  open,
  listing: l,
  via,
  onClose,
  onChanged,
}: {
  open: boolean
  listing: TradeListing
  via?: 'link'
  onClose: () => void
  onChanged?: () => void
}) {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const friends = useFriends((s) => s.ids)
  const takeWhy = useTakeWhy()
  const errorText = useTradeErrorText()
  const blockText = useBlockText()
  const minWhy = useMinWhy()
  const { connect, chooser } = useConnect()
  const [step, setStep] = useState<Step>({ kind: 'view' })
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState<Shared | null>(null)
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')
  const lv = (n: number) => t('ui.common.level.short', { n })
  const mon = name(l.dex)
  const who = l.isMe ? t('ui.trades.you') : l.name || t('ui.friends.someone')
  const cfg = tradeCfg(data)

  const doCancel = async () => {
    setBusy(true)
    try {
      const res = await cancel(l.id)
      pushToast(
        t(res === 'cancelled' ? 'ui.trades.backInBox' : 'ui.trades.tooLate', { name: mon }),
        'info',
        4000,
      )
      onChanged?.()
      onClose()
    } catch (err) {
      pushToast(errorText(err), 'bad', 4500)
    } finally {
      setBusy(false)
    }
  }

  const doTake = async (give: TakeChoice, region: RegionId) => {
    setBusy(true)
    try {
      const show = await take(l, give.at.inst.id, region)
      onChanged?.()
      onClose()
      playTrade(show)
    } catch (err) {
      pushToast(errorText(err), 'bad', 4500)
      setStep({ kind: 'view' })
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- the picker
  if (step.kind === 'pick' && save) {
    const choices = takeChoices(save, data, l.want, l.poster)
    const several = tradeRegions(save, data).length > 1
    const ok = choices.filter((c) => !c.why).length
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={t('ui.trades.pick.title', { name: mon })}
        sub={tPlural('ui.trades.pick.matches', ok)}
        footer={
          <PixelButton className="w-full" onClick={() => setStep({ kind: 'view' })}>
            {t('ui.common.back')}
          </PixelButton>
        }
      >
        <div className="flex flex-col gap-2">
          <p className="copy m-0 text-[17px] text-muted">
            {l.want.kind === 'species'
              ? t('ui.trades.pick.wantsSpecies', { name: who, mon: name(l.want.dex) })
              : l.want.kind === 'notOwned'
                ? t('ui.trades.pick.wantsNotOwned', { name: who })
                : t('ui.trades.pick.wantsAny', { name: who })}{' '}
            {t('ui.trades.pick.level', { mon })}
          </p>
          <ul className="m-0 grid list-none gap-1.5 p-0" data-testid="trade-picker">
            {choices.map((c) => {
              const p = c.at.inst
              const pv = c.why ? null : previewTake(save, data, l, p)
              const r = pv?.received
              const line = c.why
                ? blockText(c.why, p.dex, who)
                : [
                    t('ui.trades.pick.youGet', { mon: `${mon} ${lv(r!.arrival.level)}` }) +
                      (r!.arrival.raised
                        ? ` ${t('ui.trades.pick.itsMin')}`
                        : r!.arrival.capped
                          ? ` ${t('ui.trades.pick.theCap')}`
                          : ''),
                    r!.outcome === 'merged' && pv!.mine != null
                      ? t('ui.trades.pick.nothingGained', { level: lv(pv!.mine) })
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!!c.why || busy}
                    onClick={() => setStep({ kind: 'confirm', give: c })}
                    className={cx(
                      'flex min-h-[56px] w-full items-center gap-2 py-1.5 pl-1.5 pr-2.5 text-left',
                      c.why ? 'cursor-not-allowed bg-well shadow-ring-line' : 'bg-paper shadow-card',
                      r?.outcome === 'merged' && 'opacity-80',
                    )}
                  >
                    <MiniSprite dex={p.dex} size={40} className="-my-1 shrink-0" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-1">
                        <b className="truncate text-[19px] font-normal leading-none">{name(p.dex)}</b>
                        {p.shiny && <ShinyStar />}
                        <LevelTag level={p.level} />
                        {c.at.inTeam && <Chip tone="dark">{t('ui.trades.teamTag')}</Chip>}
                        {several && <Chip tone="lock">{regionName(data, c.at.region)}</Chip>}
                      </span>
                      <small className="font-pixel-sm text-[14px] leading-tight text-muted">{line}</small>
                    </span>
                    {r && (
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {r.outcome === 'locked' && <Chip tone="lock">{t('ui.map.locked')}</Chip>}
                        {r.isNew && <NewTag />}
                        {r.outcome === 'replaced' && <Chip tone="green">{t('ui.trades.stronger')}</Chip>}
                        {r.outcome === 'shiny' && <Chip tone="gold">{t('ui.trades.shinyTag')}</Chip>}
                        {r.evolvedTo != null && <Chip tone="blue">→ {name(r.evolvedTo)}</Chip>}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </Sheet>
    )
  }

  // ---------------------------------------------------------------- the confirm
  if (step.kind === 'confirm' && save) {
    const g = step.give.at.inst
    // Each Box it may go to; the pick starts where it can play now (previewTake's choice).
    const previews = previewLandings(save, data, l, g)
    const region = step.region ?? previewTake(save, data, l, g).received.region
    const { received: r, mine, best } = previews.find((p) => p.received.region === region) ?? previews[0]!
    const final = r.evolvedTo ?? l.dex
    const facts = [
      r.arrival.raised
        ? t('ui.trades.confirm.raised', {
            from: lv(Math.min(g.level, cfg.levelCap)),
            to: lv(r.arrival.level),
            why: minWhy(r.arrival.min.reason),
          })
        : '',
      r.arrival.capped ? t('ui.trades.confirm.capped', { level: lv(cfg.levelCap) }) : '',
      r.evolvedTo != null ? t('ui.trades.confirm.evolves', { name: name(r.evolvedTo) }) : '',
      r.outcome === 'merged' && mine != null
        ? t('ui.trades.confirm.merged', { name: name(final), level: lv(mine) })
        : '',
      r.outcome === 'replaced' && mine != null
        ? t('ui.trades.confirm.replaced', { name: name(final), level: lv(mine) })
        : '',
      r.outcome === 'locked'
        ? t('ui.trades.confirm.locked', {
            region: regionName(data, r.region),
            level: lv(r.arrival.level),
            best: lv(best),
          })
        : '',
    ].filter(Boolean)
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={t('ui.trades.confirm.title')}
        sub={t('ui.trades.confirm.with', { name: who })}
        footer={
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2.5">
            <PixelButton disabled={busy} onClick={() => setStep({ kind: 'pick' })}>
              {t('ui.common.back')}
            </PixelButton>
            <PixelButton variant="primary" disabled={busy} onClick={() => void doTake(step.give, r.region)}>
              {busy ? t('ui.common.loading') : t('ui.trades.trade')}
            </PixelButton>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 bg-paper p-2 shadow-ring-line">
            <span className="grid justify-items-center gap-0.5 text-center">
              <MiniSprite dex={g.dex} size={56} />
              <b className="max-w-full truncate text-[18px] font-normal leading-none">{name(g.dex)}</b>
              <LevelTag level={g.level} />
            </span>
            <span className="text-[28px] leading-none text-muted" aria-hidden>
              ⇄
            </span>
            <span className="grid justify-items-center gap-0.5 text-center">
              <MiniSprite dex={l.dex} size={56} />
              <b className="flex max-w-full items-center gap-1 truncate text-[18px] font-normal leading-none">
                {mon}
                {l.shiny && <ShinyStar />}
              </b>
              <LevelTag level={r.arrival.level} />
            </span>
          </div>
          <p className="copy m-0 text-[19px] leading-tight">
            {t('ui.trades.confirm.body', {
              give: `${name(g.dex)} ${lv(g.level)}`,
              get: `${mon} ${lv(r.arrival.level)}`,
            })}
          </p>
          {previews.length > 1 && (
            <div className="grid gap-1.5">
              <b className="text-[19px] font-normal leading-none">{t('ui.trades.land.title')}</b>
              <p className="copy m-0 text-[17px] leading-tight text-muted">
                {t('ui.trades.land.note', { name: name(final) })}
              </p>
              <LandingPick
                name={name(final)}
                level={r.arrival.level}
                value={r.region}
                disabled={busy}
                onChange={(to) => setStep({ ...step, region: to })}
                options={previews.map((p) => ({
                  region: p.received.region,
                  outcome: p.received.outcome,
                  isNew: p.received.isNew,
                  mine: p.mine,
                  best: p.best,
                }))}
              />
            </div>
          )}
          {facts.length > 0 && (
            <ul className="m-0 grid list-disc gap-1 pl-5 font-pixel-sm text-[15px] leading-tight text-muted">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    )
  }

  // ---------------------------------------------------------------- the listing
  const why = l.isMe ? null : takeWhy(l)
  const friendsOnly =
    !l.isMe && l.visibility === 'friends' && !l.isFriend && !(l.owner && friends.has(l.owner))
  const min = arrivalLevel(data, l.dex, 1).min
  const evo = tradeEvolutionOf(data, l.dex)
  const home = homeRegionOf(data, l.dex)
  // The Boxes it may go to here: more than one, and you pick on the confirm.
  const lands = save ? tradeLandings(save, data, evo ?? l.dex) : []
  const haveCount =
    save && l.want.kind === 'species'
      ? takeChoices(save, data, l.want, l.poster).filter(
          (c) => c.at.inst.dex === (l.want as { dex: number }).dex,
        ).length
      : 0
  let footer
  if (l.isMe)
    footer = (
      <div className="grid grid-cols-2 gap-2.5">
        <PixelButton disabled={busy} onClick={() => void doCancel()}>
          {t('ui.common.cancel')}
        </PixelButton>
        <PixelButton
          variant="primary"
          onClick={() => setSharing({ code: l.code, dex: l.dex, visibility: l.visibility })}
        >
          {t('ui.trades.share.button')}
        </PixelButton>
      </div>
    )
  else if (!signedIn)
    footer = (
      <div className="flex flex-col gap-2">
        <p className="copy m-0 text-center text-[18px]">{t('ui.trades.connectToTake', { name: who })}</p>
        <PixelButton variant="primary" className="w-full" onClick={connect}>
          {t('ui.account.connect')}
        </PixelButton>
      </div>
    )
  else if (friendsOnly)
    footer = (
      <div className="flex flex-col gap-2">
        <p className="copy m-0 text-center text-[18px]">{t('ui.trades.why.friendsOnly', { name: who })}</p>
        <PixelButton
          className="w-full"
          onClick={() => {
            onClose()
            navigate('/friends')
          }}
        >
          {t('ui.friends.title')}
        </PixelButton>
      </div>
    )
  else
    footer = (
      <PixelButton
        variant="primary"
        size="lg"
        className="w-full"
        aria-disabled={!!why || undefined}
        onClick={() => (why ? pushToast(why, 'info') : setStep({ kind: 'pick' }))}
      >
        {why ?? t('ui.trades.trade')}
      </PixelButton>
    )

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-1.5">
            {mon}
            {l.shiny && <ShinyStar />}
          </span>
        }
        sub={[
          `#${String(l.dex).padStart(3, '0')}`,
          l.isMe ? t('ui.trades.yourListing') : t('ui.trades.theirListing', { name: who }),
          via === 'link' ? t('ui.trades.fromLink') : '',
        ]
          .filter(Boolean)
          .join(' · ')}
        footer={footer}
      >
        <div className="flex flex-col gap-3" data-testid="listing-sheet">
          <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
            <div className="grid place-items-center bg-paper shadow-ring-line">
              <SpriteImg dex={l.dex} size={104} shiny={l.shiny} />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <span className="flex flex-wrap gap-1">
                {speciesTypes(data, l.dex).map((ty) => (
                  <TypeBadge key={ty} type={ty} size="sm" />
                ))}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <TrainerLook src={avatarOf(l.avatar).src} w={28} h={30} />
                <b className="truncate text-[19px] font-normal leading-none">
                  {l.isMe ? (
                    t('ui.trades.yours')
                  ) : (
                    <NameIn name={who} rich={l.rich} text={(name) => t('ui.trades.whose', { name })} />
                  )}
                </b>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <VisChip visibility={l.visibility} />
                <RegionTag dex={l.dex} />
                <LevelTag level={l.level} />
              </span>
            </div>
          </div>

          <div className="grid gap-1 bg-paper px-2.5 py-2 shadow-ring-line">
            <span className="font-pixel-sm text-[14px] uppercase tracking-[0.06em] text-muted">
              {l.isMe ? t('ui.trades.youWant') : t('ui.trades.theyWant')}
            </span>
            <WantTile want={l.want} big />
            {!l.isMe && l.want.kind === 'species' && signedIn && (
              <small className="font-pixel-sm text-[14px] text-muted">
                {haveCount
                  ? tPlural('ui.trades.youHave', haveCount, { name: name(l.want.dex) })
                  : t('ui.trades.why.noSpecies', { name: name(l.want.dex) })}
              </small>
            )}
            {!l.isMe && l.want.kind === 'notOwned' && (
              <small className="font-pixel-sm text-[14px] text-muted">
                {t('ui.trades.notOwnedNote', { name: who })}
              </small>
            )}
          </div>

          <TimeLeft endsAt={l.endsAt} days={cfg.listingDays} prefix />

          <ul className="m-0 grid list-none gap-2 p-0">
            <li className="grid gap-0.5">
              <b className="text-[18px] font-normal leading-tight">
                {l.isMe ? t('ui.trades.fact.ownLevel') : t('ui.trades.fact.level')}
              </b>
              <small className="font-pixel-sm text-[14px] leading-tight text-muted">
                {l.isMe
                  ? t('ui.trades.fact.ownLevelNote', { level: lv(Math.min(l.level, cfg.levelCap)) })
                  : t('ui.trades.fact.levelNote', {
                      min: lv(min.level),
                      why: minWhy(min.reason),
                      cap: lv(Math.max(cfg.levelCap, min.level)),
                    })}
              </small>
            </li>
            {evo != null && !l.isMe && (
              <li className="grid gap-0.5">
                <b className="text-[18px] font-normal leading-tight">{t('ui.trades.fact.evolves')}</b>
                <small className="font-pixel-sm text-[14px] leading-tight text-muted">
                  {t('ui.trades.fact.evolvesNote', { name: mon, to: name(evo) })}
                </small>
              </li>
            )}
            {!l.isMe && lands.length > 1 ? (
              <li className="grid gap-0.5">
                <b className="text-[18px] font-normal leading-tight">
                  {t('ui.trades.fact.landsPick', {
                    regions: lands.map((id) => regionName(data, id)).join(t('ui.common.listSep')),
                  })}
                </b>
                <small className="font-pixel-sm text-[14px] leading-tight text-muted">
                  {t('ui.trades.fact.landsPickNote')}
                </small>
              </li>
            ) : (
              !l.isMe &&
              home && (
                <li className="grid gap-0.5">
                  <b className="text-[18px] font-normal leading-tight">
                    {t('ui.trades.fact.lands', { region: regionName(data, home) })}
                  </b>
                  <small className="font-pixel-sm text-[14px] leading-tight text-muted">
                    {t(l.shiny ? 'ui.trades.fact.landsShiny' : 'ui.trades.fact.landsNote')}
                  </small>
                </li>
              )
            )}
            {!l.isMe && (
              <li className="grid gap-0.5">
                <b className="text-[18px] font-normal leading-tight">{t('ui.trades.fact.lock')}</b>
                <small className="font-pixel-sm text-[14px] leading-tight text-muted">
                  {t('ui.trades.fact.lockNote')}
                </small>
              </li>
            )}
          </ul>
        </div>
      </Sheet>
      <ShareListingModal listing={sharing} onClose={() => setSharing(null)} />
      {chooser}
    </>
  )
}
