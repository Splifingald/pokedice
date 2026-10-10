// The Pokémon Day Care, one for every region (docs/15): laid out like Home, with the yard on top (everyone at the Day
// Care roaming, pairs seeking each other out, the Egg in its nest), the Egg card or the Egg-now bar under it, then your
// two, your friends' four, and the Egg checks. Eggs hatch full screen. Every number comes from src/engine.
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  careMembers,
  clockDueAt,
  compatible,
  dayCareLevelProgress,
  dayCareOf,
  depositError,
  getRegion,
  guestKey,
  isDayCareOpen,
  isDitto,
  matesOf,
  nextCheckAt,
  pairs,
  sharedGroups,
  type CareMember,
  type DayCareGuest,
  type DayCareResident,
  type DepositError,
  type Hatch,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Chip, NewTag } from '@/components/Chip'
import { bumpGold } from '@/components/GoldPill'
import { BackButton } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { SearchField } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite } from '@/components/SpriteImg'
import { StageCanvas, type StageHandle } from '@/components/StageCanvas'
import { TrainerLook } from '@/components/TrainerLook'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { hatchTimeline } from '@/fx/timelines/moments'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { eggGroupName, waitText } from '@/i18n/text'
import { avatarOf } from '@/lib/avatars'
import { money } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { hatchDayCareEgg, leaveAtDayCare, pickUpFromDayCare, rushDayCareEgg, visitDayCare } from '@/store/actions'
import { parentName, tickDayCare } from '@/store/daycare'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import {
  EggCardView,
  EmptySlot,
  GainTag,
  Heart,
  Mate,
  MatesLine,
  PairTag,
  RushBarView,
  SectionHead,
  SlotCard,
  XpBar,
  slotColor,
} from './daycare/parts'
import { YardStage, type YardMember } from './daycare/YardStage'

/** Re-render every 20 s so levels and countdowns stay current. */
function useNow(ms = 20_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

const CARD = 'bg-paper shadow-card'
/** A friend's card wears a grey band: it isn't one of your slots. */
const GUEST_BAND = 'rgb(var(--c-shadow))'

/** A member's name: the species, the same for yours and a friend's (the card says whose). */
function useNameOf() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (m: { dex: number }) => data.species[m.dex]?.name ?? t('ui.common.pokemon')
}

/** One of yours: its slot's colour, the levels gained here, the bar to the next level, who it pairs with. */
function MineCard({ res, slot, now, onTake }: { res: DayCareResident; slot: number; now: number; onTake: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const nameOf = useNameOf()
  const p = dayCareLevelProgress(res, now, data)
  const name = nameOf(res.inst)
  const lv = (n: number) => t('ui.common.level.short', { n })
  const line = p.toNext
    ? t('ui.dayCare.toNext', { next: lv(p.level + 1), from: lv(res.inst.level) })
    : t('ui.dayCare.maxed', { level: lv(p.level) })
  const gained = p.level - res.inst.level
  const mates = matesOf(save, data, res.inst.id)
  return (
    <SlotCard
      band={slotColor(slot)}
      head={
        <>
          <Heart color={slotColor(slot)} />
          <span>{t('ui.dayCare.yoursTag')}</span>
        </>
      }
      tag={<GainTag>{gained > 0 ? t('ui.dayCare.gainedLv', { n: gained }) : t('ui.dayCare.newHere')}</GainTag>}
      dex={res.inst.dex}
      shiny={res.inst.shiny}
      name={name}
      level={lv(p.level)}
      action={{ label: t('ui.dayCare.takeBack'), aria: t('ui.dayCare.takeBackName', { name }), onClick: onTake }}
    >
      <XpBar k={p.toNext ? p.xp / p.toNext : 1} line={line} />
      {isDitto(data, res.inst.dex) ? (
        <MatesLine lead={t('ui.dayCare.pairsAll')} />
      ) : mates.length ? (
        <MatesLine
          lead={t('ui.dayCare.pairsWith')}
          mates={mates.map((m) => (
            <Mate key={m.key} name={nameOf(m)} slot={m.mine} />
          ))}
        />
      ) : (
        <MatesLine lead={t('ui.dayCare.noPartner')} />
      )}
    </SlotCard>
  )
}

/** A friend's Pokémon visiting: whose it is, its level, which of yours it pairs with, and Send back. */
function GuestCard({ g, onSend }: { g: DayCareGuest; onSend: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const nameOf = useNameOf()
  const name = nameOf(g)
  const mates = matesOf(save, data, guestKey(g)).filter((m) => m.mine != null)
  return (
    <SlotCard
      band={GUEST_BAND}
      head={
        <>
          <TrainerLook src={avatarOf(g.ownerAvatar).src} w={26} h={26} className="-my-1 -ml-0.5" />
          <span className="truncate">{t('ui.dayCare.ownerTag', { name: g.ownerName })}</span>
        </>
      }
      dex={g.dex}
      shiny={g.shiny}
      name={name}
      level={t('ui.common.level.short', { n: g.level })}
      action={{
        label: t('ui.dayCare.sendBack'),
        aria: t('ui.dayCare.sendBackName', { name, owner: g.ownerName }),
        onClick: onSend,
      }}
    >
      {mates.length ? (
        <MatesLine
          lead={t('ui.dayCare.pairsWith')}
          mates={mates.map((m) => (
            <Mate key={m.key} name={nameOf(m)} slot={m.mine} />
          ))}
        />
      ) : (
        <MatesLine lead={t('ui.dayCare.noMatchYours')} />
      )}
    </SlotCard>
  )
}

/** The Egg checks: the rule, the two clocks, and every pair with what makes it one (and how often it's checked). */
function ChecksSection({ now }: { now: number }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const nameOf = useNameOf()
  const cfg = data.config.dayCare
  const ditto = data.species[132]?.name ?? 'Ditto'
  const ps = pairs(save, data)
  const next = (clock: 'breed' | 'ditto') => waitText(clockDueAt(save, data, clock, now) - now)
  return (
    <section aria-labelledby="dc-checks" className="grid gap-2 bg-paper px-3 pb-3 pt-2.5 shadow-ring-line">
      <h2 id="dc-checks" className="m-0 text-[21px] font-normal leading-none">
        {t('ui.dayCare.checks')}
      </h2>
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
        {t('ui.dayCare.checksRule', { h: cfg.breedHours, d: cfg.breedDittoHours, ditto })}
      </p>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 font-pixel-sm text-[15px] text-ink">
        <dt className="text-muted">{t('ui.dayCare.clockGroups')}</dt>
        <dd className="m-0">{t('ui.dayCare.clockLine', { h: cfg.breedHours, time: next('breed') })}</dd>
        <dt className="text-muted">{ditto}</dt>
        <dd className="m-0">{t('ui.dayCare.clockLine', { h: cfg.breedDittoHours, time: next('ditto') })}</dd>
      </dl>
      {ps.length ? (
        <ul className="m-0 grid list-none gap-1 p-0">
          {ps.map((p) => (
            <li key={`${p.a.key}+${p.b.key}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[18px] leading-[1.1]">
              <Heart color={slotColor(p.a.mine ?? 0)} />
              <b className="font-normal">{nameOf(p.a)}</b>
              <span aria-hidden>+</span>
              <b className="font-normal">{nameOf(p.b)}</b>
              {p.b.guest && (
                <small className="font-pixel-sm text-[14px] text-muted">
                  {t('ui.dayCare.ownerTag', { name: p.b.guest.ownerName })}
                </small>
              )}
              <span className="ml-auto">
                <PairTag tone={p.slow ? 'slow' : 'plain'}>
                  {p.slow
                    ? t('ui.dayCare.pairTag', { groups: ditto, h: cfg.breedDittoHours })
                    : t('ui.dayCare.pairTag', {
                        groups: sharedGroups(data, p.a.dex, p.b.dex).map(eggGroupName).join(' · '),
                        h: cfg.breedHours,
                      })}
                </PairTag>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 font-pixel-sm text-[15px] leading-[1.2] text-danger">{t('ui.dayCare.noPairHelp', { ditto })}</p>
      )}
    </section>
  )
}

const REFUSED: Record<DepositError, string> = {
  full: 'ui.toast.dayCareFull',
  last: 'ui.dayCare.lastMember',
  missing: 'ui.toast.notWithYou',
  fossil: 'ui.dayCare.fossil',
}

/**
 * Leave which Pokémon? A search; those that would pair with someone already here first, then the team (TEAM tag; your
 * last team member is greyed), then the Box, lowest level first. The tag says who it would pair with, in the colour
 * of the slot being filled.
 */
function LeaveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const nameOf = useNameOf()
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) setQ('')
  }, [open])
  if (!save) return null
  const cfg = data.config.dayCare
  const slot = dayCareOf(save).residents.length
  const here = careMembers(save)
  const needle = searchFold(q.trim())
  const inTeam = (id: string) => save.team.includes(id)
  const rows = save.box
    .filter((p) => !needle || searchFold(nameOf(p)).includes(needle))
    .map((p) => ({ p, mates: here.filter((o) => compatible(data, o.dex, p.dex)) }))
    .sort(
      (a, b) =>
        Number(b.mates.length > 0) - Number(a.mates.length > 0) ||
        (inTeam(a.p.id) === inTeam(b.p.id) ? a.p.level - b.p.level : inTeam(a.p.id) ? -1 : 1),
    )
  const mateName = (m: CareMember) =>
    isDitto(data, m.dex) ? t('ui.dayCare.everyH', { name: nameOf(m), h: cfg.breedDittoHours }) : nameOf(m)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ui.dayCare.leaveWhich')}
      sub={t('ui.dayCare.depositHint', {
        xp: cfg.xpPerTick,
        minutes: cfg.tickMinutes,
        max: t('ui.common.level.short', { n: data.config.maxLevel }),
      })}
      head={
        <SearchField
          id="dc-q"
          value={q}
          onChange={setQ}
          label={t('ui.dayCare.searchLabel')}
          placeholder={t('ui.dayCare.searchLabel')}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 p-2 text-center font-pixel-sm text-[16px] text-muted">{t('ui.dayCare.noMatch')}</p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {rows.map(({ p, mates }) => {
            const why = depositError(save, p.id, data)
            const name = nameOf(p)
            const groups = (data.eggGroups[p.dex]?.g ?? []).map(eggGroupName).join(' · ')
            const tag = isDitto(data, p.dex) ? (
              <PairTag>
                <Heart color={slotColor(slot)} />
                {t('ui.dayCare.compatDitto', { h: cfg.breedDittoHours })}
              </PairTag>
            ) : mates.length ? (
              <PairTag>
                <Heart color={slotColor(slot)} />
                {t('ui.dayCare.compatWith', { names: mates.map(mateName).join(', ') })}
              </PairTag>
            ) : null
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!!why}
                  onClick={() => {
                    if (leaveAtDayCare(p.id)) {
                      pushToast(t('ui.dayCare.staysToast', { name }), 'good')
                      onClose()
                    }
                  }}
                  className={cx(
                    'flex min-h-[52px] w-full items-center gap-2 py-1.5 pl-1.5 pr-2.5 text-left',
                    why ? 'bg-well text-ink shadow-ring-line' : CARD,
                  )}
                >
                  <MiniSprite dex={p.dex} size={40} className={cx('-my-1', why && 'opacity-60 grayscale')} />
                  <span className="grid min-w-0 flex-1 leading-[1.05]">
                    <b className="truncate text-[18px] font-normal">
                      {name}{' '}
                      <small className="font-pixel-sm text-[13px] text-muted">
                        {t('ui.common.level.short', { n: p.level })}
                      </small>
                    </b>
                    <small className="font-pixel-sm text-[14px] text-ink">{why ? t(REFUSED[why]) : groups}</small>
                    {!why && tag && <span className="mt-1">{tag}</span>}
                  </span>
                  {inTeam(p.id) && <Chip tone="dark">{t('ui.dayCare.teamTag')}</Chip>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

/**
 * The hatching, full screen over the page: the timeline on the stage (src/fx/timelines/moments.ts) with Skip, then
 * what hatched (NEW, ✦ Shiny) and where it went, and Done. Escape skips to the end, then closes.
 */
function HatchMoment({ hatch, onDone }: { hatch: Hatch; onDone: () => void }) {
  const { t } = useT()
  useHoldFullscreen()
  const data = useGame((s) => s.data)
  const stage = useRef<StageHandle>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const scene = useMemo(
    () => ({
      ready: loadSprite(hatch.inst.dex, false, hatch.inst.shiny),
      timeline: hatchTimeline({ baby: spriteKey(hatch.inst.dex, false, hatch.inst.shiny), shiny: hatch.shiny }),
    }),
    [hatch],
  )
  const sp = data.species[hatch.inst.dex]
  const name = sp?.name ?? t('ui.common.aPokemon')
  const reveal = () => {
    if (open) return
    setOpen(true)
    sfx('levelup')
  }
  useEffect(() => {
    if (open) doneRef.current?.focus({ preventScroll: true })
  }, [open])
  const where = !hatch.kept
    ? hatch.gold > 0
      ? t('ui.dayCare.keptStrongerGold', { name, gold: money(hatch.gold) })
      : t('ui.dayCare.keptStronger', { name })
    : `${hatch.replaced ? t('ui.dayCare.replacedYours', { level: hatch.replaced.level, name }) : ''}${t(
        hatch.joinedTeam ? 'ui.dayCare.joinedTeam' : 'ui.dayCare.wentToBox',
      )}`
  const said = open
    ? t(hatch.shiny ? 'ui.dayCare.hatchedShiny' : 'ui.dayCare.hatched', { name })
    : t('ui.dayCare.eggMoving')
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.dayCare.eggHatching')}
      className="fixed inset-0 z-[100] overflow-y-auto bg-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        if (open) onDone()
        else stage.current?.skip()
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-3 pb-4">
        <div className="shadow-ledge">
          <StageCanvas
            ref={stage}
            timeline={scene.timeline}
            ready={scene.ready}
            hud={{ beat: (b) => b === 'hatched' && reveal() }}
            onEnd={reveal}
            label={said}
          />
        </div>
        <p
          className="pixel-dialogue mx-3 my-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]"
          aria-live="polite"
        >
          {said}
        </p>
        {!open ? (
          <PixelButton className="mx-3 self-end" size="sm" onClick={() => stage.current?.skip()}>
            {t('ui.evolution.skip')}
          </PixelButton>
        ) : (
          <div className={cx('mx-3 grid gap-2 px-3 pb-3 pt-2.5', CARD)}>
            <p className="m-0 flex flex-wrap items-center gap-1.5 text-[22px] leading-none">
              <MiniSprite dex={hatch.inst.dex} size={40} className="-my-2" />
              <b className="font-normal">{name}</b>
              <span className="font-pixel-sm text-[17px] text-muted">
                {t('ui.common.level.short', { n: hatch.inst.level })}
              </span>
              {hatch.shiny && <Chip tone="gold">{t('ui.dayCare.shinyTag')}</Chip>}
              {hatch.isNew && <NewTag />}
            </p>
            <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{where}</p>
            <PixelButton ref={doneRef} onClick={onDone}>
              {t('ui.dayCare.done')}
            </PixelButton>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

/** The plate on the yard: the back arrow, the page's one title, and "Every region · 4 Pokémon here". */
function YardPlate({ count, onBack }: { count: number; onBack: () => void }) {
  const { t, tPlural } = useT()
  return (
    <div className="pixel-plate absolute left-2 right-2 top-2 z-[460] flex items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
      <BackButton onClick={onBack} />
      <span className="grid min-w-0 gap-0.5">
        <h1 className="m-0 text-[24px] font-normal leading-none">{t('ui.home.dayCare')}</h1>
        <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">
          {tPlural('ui.dayCare.plateSub', count, { n: count })}
        </small>
      </span>
    </div>
  )
}

export function DayCareScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const now = useNow()
  const [leaving, setLeaving] = useState(false)
  const [hatch, setHatch] = useState<Hatch | null>(null)
  const [hatchId, setHatchId] = useState(0)
  const open = !!save && isDayCareOpen(save, data)
  const { calm } = useMotion()
  const location = useLocation()
  // From Home's gold widget: the page opens, and the Egg starts hatching a moment later.
  const wantsHatch = !!(location.state as { hatch?: boolean } | null)?.hatch
  useEffect(() => {
    if (!open) return
    visitDayCare()
    tickDayCare()
  }, [open])
  useEffect(() => {
    if (!open || !wantsHatch) return
    const id = setTimeout(
      () => {
        // Forget the request, so going back and forth (or a reload) doesn't hatch again.
        navigate(location.pathname, { replace: true, state: null })
        const res = hatchDayCareEgg()
        if (res) {
          setHatch(res)
          setHatchId((n) => n + 1)
        }
      },
      calm ? 0 : 450,
    )
    return () => clearTimeout(id)
  }, [open, wantsHatch, calm, navigate, location.pathname])
  const yard = useMemo<YardMember[]>(() => {
    if (!save) return []
    const all = careMembers(save)
    return all.map((m) => ({
      key: m.key,
      dex: m.dex,
      shiny: m.resident?.inst.shiny ?? m.guest?.shiny,
      name: data.species[m.dex]?.name ?? '',
      // Pairs seek each other out: yours with everyone, a visitor with yours.
      likes: all
        .filter((o) => o !== m && (o.mine != null || m.mine != null) && compatible(data, o.dex, m.dex))
        .map((o) => o.key),
    }))
  }, [save, data])
  if (!save) return <Navigate to="/" replace />
  if (!open) return <Navigate to="/home" replace />
  const cfg = data.config.dayCare
  const dc = dayCareOf(save)

  const show = (res: Hatch | null) => {
    if (!res) return
    setHatch(res)
    setHatchId((n) => n + 1)
  }
  const rush = () => {
    const res = rushDayCareEgg()
    if ('hatch' in res) show(res.hatch)
    else if (res.refused === 'pair') pushToast(t('ui.dayCare.noPairYet'), 'bad')
  }
  const take = (uid: string) => {
    const res = pickUpFromDayCare(uid)
    if (!res) return
    sfx(res.levelsGained > 0 ? 'levelup' : 'button')
    const name = data.species[res.inst.dex]?.name ?? t('ui.common.unknown')
    const grew =
      res.levelsGained > 0
        ? t(`ui.dayCare.grewLevels.${res.levelsGained === 1 ? 'one' : 'other'}`, {
            xp: res.xpGained,
            levels: res.levelsGained,
            level: res.inst.level,
          })
        : t('ui.dayCare.gainedXp', { xp: res.xpGained })
    const where = !res.live
      ? t('ui.dayCare.inRegionBox', { region: getRegion(data, res.region)?.name ?? res.region })
      : t(res.joinedTeam ? 'ui.dayCare.rejoined' : 'ui.dayCare.wentToBox')
    pushToast(`${t('ui.dayCare.isBack', { name })} ${grew} ${where}`, 'good', 5000)
  }
  const price = cfg.rushPrice
  const short = Math.max(0, price - save.gold)
  const freeMine = Math.max(0, cfg.slots - dc.residents.length)
  const freeFriends = Math.max(0, cfg.friendSlots - dc.guests.length)

  return (
    <div className="flex flex-col gap-3 md:gap-4 lg:grid lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-3">
        <div className="-mx-3 -mt-4 overflow-hidden shadow-ledge md:pixel-panel md:m-0 md:p-0 md:shadow-none">
          <YardStage members={yard} egg={!!dc.egg} onHatch={() => show(hatchDayCareEgg())}>
            <YardPlate count={yard.length} onBack={() => navigate('/home')} />
          </YardStage>
        </div>
        {dc.egg ? (
          <EggCardView
            from={
              dc.egg.parents
                ? t('ui.dayCare.eggFrom', { a: parentName(dc.egg.parents[0]), b: parentName(dc.egg.parents[1]) })
                : t('ui.dayCare.eggGift')
            }
            onHatch={() => show(hatchDayCareEgg())}
          />
        ) : (
          <RushBarView
            wait={waitText(nextCheckAt(save, data, now) - now)}
            pairs={pairs(save, data).length}
            price={price}
            short={short}
            onRush={rush}
            onShort={() => pushToast(t('ui.shop.needMore', { price: money(short) }), 'bad')}
          />
        )}
      </section>

      <div className="flex flex-col gap-4">
        <section aria-labelledby="dc-yours" className="grid gap-2">
          <SectionHead
            id="dc-yours"
            title={t('ui.dayCare.yours')}
            count={`${dc.residents.length}/${cfg.slots}`}
            note={t('ui.dayCare.yoursNote', {
              xp: cfg.xpPerTick,
              minutes: cfg.tickMinutes,
              max: t('ui.common.level.short', { n: data.config.maxLevel }),
            })}
          />
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {dc.residents.map((r, i) => (
              <MineCard key={r.inst.id} res={r} slot={i} now={now} onTake={() => take(r.inst.id)} />
            ))}
            {Array.from({ length: freeMine }, (_, i) => (
              <EmptySlot
                key={`free-${i}`}
                title={t('ui.dayCare.leaveOne')}
                sub={t('ui.dayCare.leaveFrom')}
                onClick={() => setLeaving(true)}
              />
            ))}
          </ul>
        </section>

        <section aria-labelledby="dc-friends" className="grid gap-2">
          <SectionHead
            id="dc-friends"
            title={t('ui.dayCare.friends')}
            count={`${dc.guests.length}/${cfg.friendSlots}`}
            note={t('ui.dayCare.friendsNote')}
          />
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {dc.guests.map((g) => (
              <GuestCard key={guestKey(g)} g={g} onSend={() => undefined} />
            ))}
            {/* The friend list's Day Cares come with migration 0034: until then the slots wait, and say why. */}
            {Array.from({ length: freeFriends }, (_, i) => (
              <EmptySlot key={`friend-${i}`} title={t('ui.dayCare.addFriend')} sub={t('ui.dayCare.friendsSoon')} disabled />
            ))}
          </ul>
        </section>

        <ChecksSection now={now} />
      </div>

      <LeaveSheet open={leaving} onClose={() => setLeaving(false)} />
      {hatch && (
        <HatchMoment
          key={hatchId}
          hatch={hatch}
          onDone={() => {
            // The Day Care couple's ₽ came in while the top bar was hidden: its pill bumps when it's back.
            if (hatch.gold > 0) bumpGold()
            setHatch(null)
          }}
        />
      )}
    </div>
  )
}
