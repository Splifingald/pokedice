// The Pokémon Day Care: two Pokémon train on their own (real time, even while you're away), and Eggs hatch on the
// spot, full screen. Every number comes from src/engine/daycare.ts.
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  dayCareLevelProgress,
  dayCareOf,
  depositError,
  getRegion,
  isDayCareOpen,
  nextCheckAt,
  pairs,
  type DayCareResident,
  type DepositError,
  type Hatch,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Chip, NewTag } from '@/components/Chip'
import { EggSprite } from '@/components/EggSprite'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { SearchField } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { StageCanvas, type StageHandle } from '@/components/StageCanvas'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { hatchTimeline } from '@/fx/timelines/moments'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { waitText } from '@/i18n/text'
import { money } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { hatchDayCareEgg, leaveAtDayCare, pickUpFromDayCare, rushDayCareEgg, visitDayCare } from '@/store/actions'
import { parentName, tickDayCare } from '@/store/daycare'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

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

/** One resident: its sprite, the level it came at → its level now, the bar to the next level. */
function Resident({ res, now, onTake }: { res: DayCareResident; now: number; onTake: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const p = dayCareLevelProgress(res, now, data)
  const name = data.species[res.inst.dex]?.name ?? t('ui.common.unknown')
  const lv = (n: number) => t('ui.common.level.short', { n })
  const line = p.toNext
    ? t('ui.dayCare.toNext', { next: lv(p.level + 1), from: lv(res.inst.level) })
    : t('ui.dayCare.maxed', { level: lv(p.level) })
  return (
    <li className={cx('grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 px-2.5 pb-2.5 pt-2', CARD)}>
      <SpriteImg dex={res.inst.dex} size={84} shiny={res.inst.shiny} />
      <div className="grid min-w-0 gap-1">
        <b className="min-w-0 truncate text-[22px] font-normal leading-none">{name}</b>
        <span className="text-[18px] leading-none">
          {lv(res.inst.level)}
          {p.level > res.inst.level && (
            <>
              {' '}
              <span aria-hidden className="text-muted">
                →
              </span>{' '}
              <span className="text-good">{lv(p.level)}</span>
            </>
          )}
        </span>
        <span className="relative block h-2 bg-line shadow-ring-thin" role="img" aria-label={line}>
          <i
            className="absolute inset-y-px left-px block bg-[#5b8def]"
            style={{ width: `calc(${p.toNext ? Math.min(100, (p.xp / p.toNext) * 100) : 100}% - 2px)` }}
          />
        </span>
        <small className="font-pixel-sm text-[14px] leading-[1.15] text-muted">{line}</small>
      </div>
      <PixelButton
        variant="secondary"
        className="col-span-2 w-full"
        aria-label={t('ui.dayCare.takeBackName', { name })}
        onClick={onTake}
      >
        {t('ui.dayCare.takeBack')}
      </PixelButton>
    </li>
  )
}

const REFUSED: Record<DepositError, string> = {
  full: 'ui.toast.dayCareFull',
  last: 'ui.dayCare.lastMember',
  missing: 'ui.toast.notWithYou',
  fossil: 'ui.dayCare.fossil',
}

/** Who stays: a search, then the team first (TEAM tag), then the Box, lowest level first (they gain the most). */
function LeaveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (open) setQ('')
  }, [open])
  if (!save) return null
  const cfg = data.config.dayCare
  const needle = searchFold(q.trim())
  const rows = save.box
    .filter((p) => !needle || searchFold(data.species[p.dex]?.name ?? '').includes(needle))
    .sort((a, b) => {
      const ta = save.team.includes(a.id)
      const tb = save.team.includes(b.id)
      return ta === tb ? a.level - b.level : ta ? -1 : 1
    })
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
          {rows.map((p) => {
            const why = depositError(save, p.id, data)
            const name = data.species[p.dex]?.name ?? t('ui.common.unknown')
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
                    <b className="truncate text-[18px] font-normal">{name}</b>
                    <small className="font-pixel-sm text-[14px] text-ink">
                      {why ? t(REFUSED[why]) : t('ui.common.level.short', { n: p.level })}
                    </small>
                  </span>
                  {save.team.includes(p.id) && <Chip tone="dark">{t('ui.dayCare.teamTag')}</Chip>}
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

/** The Egg waiting, in gold: who left it (or the gift), and Hatch it. */
function EggCard({ onHatch }: { onHatch: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const egg = dayCareOf(save).egg
  if (!egg) return null
  const from = egg.parents
    ? t('ui.dayCare.eggFrom', { a: parentName(egg.parents[0]), b: parentName(egg.parents[1]) })
    : t('ui.dayCare.eggGift')
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 bg-gold-pale px-3 pb-3 pt-2.5 shadow-card-gold-lip">
      <EggSprite size={36} shake className="mx-auto" />
      <div className="grid min-w-0 gap-1">
        <b className="text-[22px] font-normal leading-none">{t('ui.dayCare.eggWaiting')}</b>
        <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-ink">
          {from} {t('ui.dayCare.eggHatchesInto')}
        </p>
      </div>
      <PixelButton variant="gold" className="col-span-2 w-full" onClick={onHatch}>
        {t('ui.dayCare.hatchIt')}
      </PixelButton>
    </div>
  )
}

/** When the next check runs, how many pairs could leave an Egg, and Egg now (skip the wait for ₽). */
function RushBar({ now, onRush }: { now: number; onRush: () => void }) {
  const { t, tPlural } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const price = data.config.dayCare.rushPrice
  const n = pairs(save, data).length
  const short = Math.max(0, price - save.gold)
  return (
    <div className={cx('flex items-center gap-2.5 py-2 pl-3 pr-2.5', CARD)}>
      <span className="grid min-w-0 flex-1 gap-px">
        <small className="font-pixel-sm text-[14px] leading-none text-muted">{t('ui.dayCare.nextCheck')}</small>
        <b className="text-[24px] font-normal leading-none">
          {t('ui.dayCare.inTime', { time: waitText(nextCheckAt(save, data, now) - now) })}
        </b>
        <small className="font-pixel-sm text-[14px] leading-tight text-muted">
          {n ? tPlural('ui.dayCare.pairsCan', n, { n }) : t('ui.dayCare.noPairYet')}
        </small>
      </span>
      <PixelButton
        variant="gold"
        disabled={!n}
        aria-disabled={short > 0 || undefined}
        aria-label={t('ui.dayCare.eggNowLabel', { price: money(price) })}
        className="grid min-h-[56px] shrink-0 justify-items-center gap-0.5 px-3.5"
        onClick={() => (short > 0 ? pushToast(t('ui.shop.needMore', { price: money(short) }), 'bad') : onRush())}
      >
        <span className="text-[19px] leading-none">{t('ui.dayCare.eggNow')}</span>
        <span className={cx('font-pixel-sm text-[15px] leading-none', short > 0 && 'text-danger')}>{money(price)}</span>
      </PixelButton>
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead
        title={t('ui.dayCare.title')}
        count={`${dc.residents.length}/${cfg.slots}`}
        onBack={() => navigate('/home')}
      />
      {dc.egg ? <EggCard onHatch={() => show(hatchDayCareEgg())} /> : <RushBar now={now} onRush={rush} />}
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
        {t('ui.dayCare.yoursNote', {
          xp: cfg.xpPerTick,
          minutes: cfg.tickMinutes,
          max: t('ui.common.level.short', { n: data.config.maxLevel }),
        })}
      </p>

      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2" aria-label={t('ui.dayCare.staying')}>
        {dc.residents.map((r) => (
          <Resident key={r.inst.id} res={r} now={now} onTake={() => take(r.inst.id)} />
        ))}
        {Array.from({ length: Math.max(0, cfg.slots - dc.residents.length) }, (_, i) => (
          <li key={`empty-${i}`}>
            <button
              type="button"
              onClick={() => setLeaving(true)}
              className="flex min-h-[96px] w-full items-center gap-3 bg-well px-3.5 py-2.5 text-left shadow-[inset_0_0_0_2px_rgb(var(--c-faint))] outline-dashed outline-2 -outline-offset-[6px] outline-shadow hover:bg-paper"
            >
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center bg-[#5b8def] text-[32px] leading-none text-white shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_#3c6cc8]"
              >
                +
              </span>
              <span className="grid gap-0.5">
                <b className="text-[21px] font-normal leading-none">{t('ui.dayCare.leaveOne')}</b>
                <small className="font-pixel-sm text-[15px] text-muted">{t('ui.dayCare.leaveFrom')}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <LeaveSheet open={leaving} onClose={() => setLeaving(false)} />
      {hatch && <HatchMoment key={hatchId} hatch={hatch} onDone={() => setHatch(null)} />}
    </div>
  )
}
