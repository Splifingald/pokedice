// The Pokémon Day Care, one for every region (docs/15): a stage and its panel (docs/43 §5.7). The yard on top (everyone
// at the Day Care roaming, pairs seeking each other out, the Egg in its nest); the panel beside or under it: the Egg card
// or the Egg-now bar, your two, your friends', the Egg checks folded. Eggs hatch full screen. Numbers: src/engine.
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
  dayCareTutorialDue,
  boxedDepositError,
  everyRegionBox,
  friendMonLevel,
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
import { AccountButton } from '@/components/AccountButton'
import { DayCareRulesCard, DayCareRulesModal } from '@/components/FeatureRules'
import { SmallInfo } from '@/components/SmallInfo'
import { Chip, NewTag } from '@/components/Chip'
import { bumpGold } from '@/components/GoldPill'
import { BackButton } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { usePushAsk } from '@/components/PushPrompt'
import { SearchField, Seg } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite } from '@/components/SpriteImg'
import { StageCanvas, type StageHandle } from '@/components/StageCanvas'
import { TrainerLook } from '@/components/TrainerLook'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { hatchTimeline } from '@/fx/timelines/moments'
import { joinList, searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { eggGroupName, waitText } from '@/i18n/text'
import { avatarOf } from '@/lib/avatars'
import { useFriendCares } from '@/lib/friends'
import { isSupabaseConfigured } from '@/lib/supabase'
import { money } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { hatchDayCareEgg, leaveAtDayCare, pickUpFromDayCare, rushDayCareEgg } from '@/store/actions'
import { inviteFriendMon, parentName, sendGuestBack, syncFriendDayCares, tickDayCare } from '@/store/daycare'
import { pushToast, useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
import { cx } from '@/theme/util'
import {
  EggCardView,
  EmptySlot,
  GainTag,
  GuestTile,
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
import { useInWorld, WorldAwayPage } from '@/screens/events/world'
import { NameIn, TrainerName } from '@/components/TrainerName'

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

/**
 * A member's name: the nickname you gave one of yours (an instance, or a member holding your resident), else the
 * species, a friend's included (the card says whose).
 */
function useNameOf() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (m: { dex: number; nickname?: string; resident?: { inst: { nickname?: string } } }) =>
    m.nickname || m.resident?.inst.nickname || (data.species[m.dex]?.name ?? t('ui.common.pokemon'))
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
        <MatesLine lead={t('ui.dayCare.allButLegends')} />
      ) : mates.length ? (
        <MatesLine
          // Every partner wears a heart: yours in their own colour, a friend's in this card's.
          mates={mates.map((m) => (
            <Mate key={m.key} name={nameOf(m)} slot={m.mine ?? slot} />
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
  // Their golden name ("I am just rich", docs/25), as their Day Care was last read.
  const rich = useFriendCares((s) => s.rows.some((r) => r.rich && r.owner === g.owner))
  const nameOf = useNameOf()
  const name = nameOf(g)
  const mates = matesOf(save, data, guestKey(g)).filter((m) => m.mine != null)
  return (
    <GuestTile
      dex={g.dex}
      name={name}
      level={t('ui.common.level.short', { n: g.level })}
      owner={
        <span className="inline-flex max-w-full items-center gap-1">
          <TrainerLook src={avatarOf(g.ownerAvatar).src} w={20} h={20} className="-my-1 shrink-0" />
          <span className="truncate">
            <NameIn name={g.ownerName} rich={rich} text={(name) => t('ui.dayCare.ownerTag', { name })} />
          </span>
        </span>
      }
      mates={
        mates.length ? (
          <MatesLine
            mates={mates.map((m) => (
              <Mate key={m.key} name={nameOf(m)} slot={m.mine} />
            ))}
          />
        ) : (
          <MatesLine lead={t('ui.dayCare.noMatchYours')} />
        )
      }
      action={{ aria: t('ui.dayCare.sendBackName', { name, owner: g.ownerName }), onClick: onSend }}
    />
  )
}

/** The Egg checks: the rule, the two clocks, and every pair with what makes it one (and how often it's checked). */
function ChecksSection({ now }: { now: number }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const nameOf = useNameOf()
  const details = useDetails()
  const cfg = data.config.dayCare
  const ditto = data.species[132]?.name ?? 'Ditto'
  const ps = pairs(save, data)
  // A clock without a pair isn't running: it waits for one instead of counting down.
  const line = (clock: 'breed' | 'ditto', h: number) => {
    const at = clockDueAt(save, data, clock, now)
    return at == null ? t('ui.dayCare.clockIdle', { h }) : t('ui.dayCare.clockLine', { h, time: waitText(at - now) })
  }
  // Folded (docs/43 §5.7): the Egg-now bar already says when the next check comes and how many pairs could leave an
  // Egg; the clocks and each pair's group are for whoever wants them (open at once with More details).
  return (
    <details open={details || undefined} className="group grid gap-2 bg-paper px-3 pb-1 pt-1 shadow-ring-line open:pb-3">
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5">
        <span className="inline-block text-[16px] text-muted transition-transform group-open:rotate-90" aria-hidden>
          ▶
        </span>
        <h2 id="dc-checks" className="m-0 text-[20px] font-normal leading-none">
          {t('ui.dayCare.checks')}
        </h2>
      </summary>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 font-pixel-sm text-[16px] text-ink">
        <dt className="text-muted">{t('ui.dayCare.clockGroups')}</dt>
        <dd className="m-0">{line('breed', cfg.breedHours)}</dd>
        <dt className="text-muted">{ditto}</dt>
        <dd className="m-0">{line('ditto', cfg.breedDittoHours)}</dd>
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
                <small className="font-pixel-sm text-[16px] text-muted">
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
        <p className="m-0 font-pixel-sm text-[16px] leading-[1.2] text-muted">{t('ui.dayCare.noPairYet')}</p>
      )}
    </details>
  )
}

const REFUSED: Record<DepositError, string> = {
  full: 'ui.toast.dayCareFull',
  last: 'ui.dayCare.lastMember',
  missing: 'ui.toast.notWithYou',
  fossil: 'ui.dayCare.fossil',
}

/**
 * Leave which Pokémon? Every region's Box (each says its region once several are played), by level, lowest or highest
 * first; a search, and Compatible only once someone is here, yours or a friend's. A team member has the TEAM tag; the
 * last of a region's team is greyed. The tag says who it would pair with, in the colour of the slot being filled.
 */
function LeaveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const nameOf = useNameOf()
  const [q, setQ] = useState('')
  const [order, setOrder] = useState<'low' | 'high'>('low')
  const [only, setOnly] = useState(false)
  useEffect(() => {
    if (open) setQ('')
  }, [open])
  if (!save) return null
  const cfg = data.config.dayCare
  const slot = dayCareOf(save).residents.length
  const here = careMembers(save)
  // Nothing to be compatible with until someone is here.
  const compatOnly = only && here.length > 0
  const needle = searchFold(q.trim())
  const all = everyRegionBox(save, data)
  const manyRegions = new Set(all.map((m) => m.region)).size > 1
  // By level; ties keep every region's Box order, the region being played first.
  const rows = all
    .filter((m) => !needle || searchFold(nameOf(m.inst)).includes(needle))
    .map((m) => ({ ...m, mates: here.filter((o) => compatible(data, o.dex, m.inst.dex)) }))
    .filter((r) => !compatOnly || r.mates.length > 0)
    .sort((a, b) => (order === 'low' ? a.inst.level - b.inst.level : b.inst.level - a.inst.level))
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
        <div className="grid gap-2">
          <SearchField
            id="dc-q"
            value={q}
            onChange={setQ}
            label={t('ui.dayCare.searchLabel')}
            placeholder={t('ui.dayCare.searchLabel')}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Seg
              label={t('ui.dayCare.sortLevel')}
              value={order}
              onChange={setOrder}
              options={[
                { id: 'low', label: t('ui.dayCare.lowFirst') },
                { id: 'high', label: t('ui.dayCare.highFirst') },
              ]}
            />
            {here.length > 0 && (
              <button
                type="button"
                aria-pressed={only}
                onClick={() => setOnly((v) => !v)}
                className={cx(
                  'ml-auto min-h-[44px] shrink-0 px-3 font-pixel-sm text-[16px] leading-none shadow-ring',
                  only ? 'bg-gold text-night' : 'bg-paper text-ink',
                )}
              >
                {t('ui.dayCare.compatibleOnly')}
              </button>
            )}
          </div>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="m-0 p-2 text-center font-pixel-sm text-[16px] text-muted">
          {t(compatOnly && !needle ? 'ui.dayCare.noCompatibleMine' : 'ui.dayCare.noMatch')}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {rows.map((row) => {
            const { inst: p, region, inTeam, mates } = row
            const why = boxedDepositError(save, row, data)
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
                      <small className="font-pixel-sm text-[16px] text-muted">
                        {t('ui.common.level.short', { n: p.level })}
                        {manyRegions && ` · ${getRegion(data, region)?.name ?? region}`}
                      </small>
                    </b>
                    <small className="font-pixel-sm text-[16px] text-ink">{why ? t(REFUSED[why]) : groups}</small>
                    {!why && tag && <span className="mt-1">{tag}</span>}
                  </span>
                  {inTeam && <Chip tone="dark">{t('ui.dayCare.teamTag')}</Chip>}
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
 * Add a friend's Pokémon: a search (friend or Pokémon) and Compatible only, grouped by friend, the best matches
 * first. Each row says which of yours it would pair with, in their hearts' colours; Ditto with all but legendaries,
 * on its slower clock; one already here is greyed as Invited.
 */
function FriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tPlural } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const rows = useFriendCares((s) => s.rows)
  const state = useFriendCares((s) => s.state)
  const error = useFriendCares((s) => s.error)
  const nameOf = useNameOf()
  const [q, setQ] = useState('')
  const [only, setOnly] = useState(false)
  useEffect(() => {
    if (!open) return
    setQ('')
    void syncFriendDayCares()
  }, [open])
  if (!save) return null
  const cfg = data.config.dayCare
  const now = Date.now()
  const dc = dayCareOf(save)
  const taken = new Set(dc.guests.map(guestKey))
  const pairsWith = (dex: number) => dc.residents.flatMap((r, i) => (compatible(data, r.inst.dex, dex) ? [i] : []))
  const needle = searchFold(q.trim())
  const groups = rows
    .map((f) => {
      const list = f.mons
        .filter((m) => !needle || searchFold(f.name).includes(needle) || searchFold(nameOf(m)).includes(needle))
        .map((m) => ({ m, idx: pairsWith(m.dex) }))
        .filter((x) => !only || x.idx.length > 0)
      return { f, list, best: Math.max(0, ...list.map((x) => x.idx.length)) }
    })
    .filter((g) => g.list.length > 0)
    .sort((a, b) => b.best - a.best)
  const hearts = (idx: number[]) => idx.map((i) => <Heart key={i} color={slotColor(i)} />)
  const empty =
    state === 'error'
      ? t(error === 'not_set_up' ? 'ui.dayCare.friendsNoServer' : 'ui.dayCare.friendsFailed')
      : state !== 'ready'
        ? t('ui.common.loading')
        : !rows.length
          ? t('ui.dayCare.noFriendCare')
          : only
            ? t('ui.dayCare.noFriendCompatible')
            : t('ui.dayCare.noFriendMatch')
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ui.dayCare.friendPickTitle')}
      sub={t('ui.dayCare.friendPickSub')}
      head={
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchField
              id="dc-fq"
              value={q}
              onChange={setQ}
              label={t('ui.dayCare.friendSearchLabel')}
              placeholder={t('ui.dayCare.friendSearch')}
            />
          </div>
          <button
            type="button"
            aria-pressed={only}
            onClick={() => setOnly((v) => !v)}
            className={cx(
              'min-h-[44px] shrink-0 px-3 font-pixel-sm text-[16px] leading-none shadow-ring',
              only ? 'bg-gold text-night' : 'bg-paper text-ink',
            )}
          >
            {t('ui.dayCare.compatibleOnly')}
          </button>
        </div>
      }
    >
      {groups.length === 0 ? (
        <p className="m-0 p-2 text-center font-pixel-sm text-[16px] text-muted">{empty}</p>
      ) : (
        <div className="grid gap-3">
          {groups.map(({ f, list }) => (
            <section key={f.owner} className="grid gap-1.5" aria-label={f.name}>
              <h3 className="m-0 flex items-center gap-1.5 text-[19px] font-normal leading-none">
                <TrainerLook src={avatarOf(f.avatar).src} w={26} h={26} />
                <TrainerName name={f.name} rich={f.rich} className="min-w-0 truncate" />
                <small className="ml-auto font-pixel-sm text-[16px] text-muted">
                  {tPlural('ui.dayCare.atDayCare', f.mons.length, { n: f.mons.length })}
                </small>
              </h3>
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {list.map(({ m, idx }) => {
                  const added = taken.has(guestKey({ owner: f.owner, inst: m.inst }))
                  const name = nameOf(m)
                  const groupsLine = (data.eggGroups[m.dex]?.g ?? []).map(eggGroupName).join(' · ')
                  const tag = added ? (
                    <PairTag tone="plain">{t('ui.dayCare.invited')}</PairTag>
                  ) : isDitto(data, m.dex) ? (
                    <PairTag>
                      {hearts(idx)}
                      {t('ui.dayCare.compatDitto', { h: cfg.breedDittoHours })}
                    </PairTag>
                  ) : idx.length ? (
                    <PairTag>
                      {hearts(idx)}
                      {t('ui.dayCare.compatWith', { names: joinList(idx.map((i) => nameOf(dc.residents[i]!.inst))) })}
                    </PairTag>
                  ) : (
                    <PairTag tone="plain">{t('ui.dayCare.noMatchYours')}</PairTag>
                  )
                  return (
                    <li key={m.inst}>
                      <button
                        type="button"
                        disabled={added}
                        onClick={() => {
                          if (inviteFriendMon(f, m)) onClose()
                        }}
                        className={cx(
                          'flex min-h-[52px] w-full items-center gap-2 py-1.5 pl-1.5 pr-2.5 text-left',
                          added ? 'bg-well text-ink shadow-ring-line' : CARD,
                        )}
                      >
                        <MiniSprite dex={m.dex} size={40} className={cx('-my-1', added && 'opacity-60 grayscale')} />
                        <span className="grid min-w-0 flex-1 leading-[1.05]">
                          <b className="truncate text-[18px] font-normal">
                            {name}{' '}
                            <small className="font-pixel-sm text-[16px] text-muted">
                              {t('ui.common.level.short', { n: friendMonLevel(m, now, data) })}
                            </small>
                          </b>
                          <small className="font-pixel-sm text-[16px] text-ink">{groupsLine}</small>
                          <span className="mt-1">{tag}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
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
    // The timeline's own fanfare celebrates it: no jingle on top (docs/38 B6).
    setOpen(true)
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
        <small className="truncate font-pixel-sm text-[16px] leading-none text-muted">
          {tPlural('ui.dayCare.plateSub', count, { n: count })}
        </small>
      </span>
    </div>
  )
}

function DayCareScreenMain() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const now = useNow()
  const [leaving, setLeaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [rules, setRules] = useState(false)
  const [hatch, setHatch] = useState<Hatch | null>(null)
  const [hatchId, setHatchId] = useState(0)
  const open = !!save && isDayCareOpen(save, data)
  const { calm } = useMotion()
  const auth = useGame((s) => s.auth.status)
  const caresError = useFriendCares((s) => s.error)
  const location = useLocation()
  // From Home's gold widget: the page opens, and the Egg starts hatching a moment later.
  const wantsHatch = !!(location.state as { hatch?: boolean } | null)?.hatch
  // The rules where they apply (docs/43 §7): on the first visit they are a card at the top of the page until GOT IT
  // (the "visited" flag); opening the page no longer counts as having read them.
  const rulesDue = useGame((s) => !!s.save && dayCareTutorialDue(s.save, s.data))
  // Push notifications' question, once (docs/27): an Egg can be announced while the game is closed. It waits while
  // the rules card is up: one thing to read at a time, never a modal over the rules.
  usePushAsk('egg', open && !rulesDue)
  useEffect(() => {
    if (open) tickDayCare()
  }, [open])
  // Friends' Day Cares, read when the page opens (at most once a minute), refresh the visitors.
  useEffect(() => {
    if (open && auth === 'signed_in') void syncFriendDayCares()
  }, [open, auth])
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
  // Null while no pair is here: no clock runs, the bar says so instead of counting down.
  const nextCheck = nextCheckAt(save, data, now)
  const freeMine = Math.max(0, cfg.slots - dc.residents.length)
  const freeFriends = Math.max(0, cfg.friendSlots - dc.guests.length)
  // Why the friend slots wait, if they do: no online service, the sign-in still being checked, or a database without
  // 0034. Signed out, the friend list's connect prompt takes their place.
  const offline = !isSupabaseConfigured || auth === 'unavailable'
  const friendsWait = offline
    ? t('ui.friends.offline')
    : auth === 'unknown'
      ? t('ui.common.loading')
      : auth === 'signed_in' && caresError === 'not_set_up'
        ? t('ui.dayCare.friendsNoServer')
        : null
  const promptSignIn = auth === 'signed_out' && !offline

  return (
    // Stage and panel (docs/42, docs/43 §5.7): the yard on top — on PC on the left, as tall as the window allows at its
    // own shape — and beside or under it the panel: the Egg (or the Egg-now bar), your two, your friends', and at its
    // foot the Egg checks folded and the small INFO.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(320px,min(calc((100dvh-112px)*288/276),calc(100%-380px)))_minmax(360px,1fr)] lg:items-start lg:gap-5">
      <div className="-mx-3 -mt-4 overflow-hidden shadow-ledge md:pixel-panel md:m-0 md:p-0 md:shadow-none lg:sticky lg:top-[calc(var(--top-bar,56px)+1rem)]">
        <YardStage members={yard} egg={!!dc.egg} onHatch={() => show(hatchDayCareEgg())}>
          <YardPlate count={yard.length} onBack={() => navigate('/home')} />
        </YardStage>
      </div>

      <div className="flex flex-col gap-3 lg:pixel-panel lg:sticky lg:top-[calc(var(--top-bar,56px)+1rem)] lg:max-h-[calc(100dvh-var(--top-bar,56px)-2rem)] lg:overflow-y-auto lg:bg-panel lg:p-3">
        {/* The first visit: the rules first, right under the yard they explain (the panel's top on PC). */}
        {rulesDue && <DayCareRulesCard />}
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
            wait={nextCheck == null ? null : waitText(nextCheck - now)}
            pairs={pairs(save, data).length}
            price={price}
            short={short}
            onRush={rush}
            onShort={() => pushToast(t('ui.shop.needMore', { price: money(short) }), 'bad')}
          />
        )}

        <section aria-labelledby="dc-yours" className="grid gap-2">
          <SectionHead id="dc-yours" title={t('ui.dayCare.yours')} count={`${dc.residents.length}/${cfg.slots}`} />
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {dc.residents.map((r, i) => (
              <MineCard key={r.inst.id} res={r} slot={i} now={now} onTake={() => take(r.inst.id)} />
            ))}
            {Array.from({ length: freeMine }, (_, i) => (
              <EmptySlot key={`free-${i}`} title={t('ui.dayCare.leaveOne')} onClick={() => setLeaving(true)} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="dc-friends" className="grid gap-2">
          <SectionHead
            id="dc-friends"
            title={t('ui.dayCare.friends')}
            count={`${dc.guests.length}/${cfg.friendSlots}`}
          />
          {(dc.guests.length > 0 || !promptSignIn) && (
            // A line each, and one free slot for all the free ones (the count is in the heading): four dashed cards
            // asked the same thing four times.
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {dc.guests.map((g) => (
                <GuestCard key={guestKey(g)} g={g} onSend={() => sendGuestBack(g)} />
              ))}
              {!promptSignIn && freeFriends > 0 && (
                <EmptySlot
                  mini
                  title={t('ui.dayCare.addFriend')}
                  sub={friendsWait ?? undefined}
                  disabled={!!friendsWait}
                  onClick={() => setInviting(true)}
                />
              )}
            </ul>
          )}
          {promptSignIn && (
            // Smaller than it was (docs/43 §5.7): one line and the button, not a gold card the size of a slot.
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-paper px-3 py-2 shadow-ring-line">
              <p className="m-0 min-w-0 flex-1 basis-[180px] text-[18px] leading-[1.15]">{t('ui.friends.signedOut')}</p>
              <AccountButton size="sm" />
            </div>
          )}
        </section>

        {/* The panel's foot: the Egg checks folded, and the rules as the unlock pop-up gave them, a small INFO. */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ChecksSection now={now} />
          </div>
          <SmallInfo name={t('ui.home.dayCare')} onClick={() => setRules(true)} className="shrink-0" />
        </div>
      </div>

      <DayCareRulesModal open={rules} onClose={() => setRules(false)} />
      <LeaveSheet open={leaving} onClose={() => setLeaving(false)} />
      <FriendSheet open={inviting} onClose={() => setInviting(false)} />
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

/** The main game's: inside a small world it waits outside (docs/21), and the page says so. */
export function DayCareScreen() {
  const { t } = useT()
  const inside = useInWorld().inside
  return inside ? <WorldAwayPage title={t('ui.home.dayCare')} kind="main" /> : <DayCareScreenMain />
}
