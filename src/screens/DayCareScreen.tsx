// The Pokémon Day Care: two Pokémon train on their own (real time, even while you're away), and Eggs hatch on the
// spot, full screen. Every number comes from src/engine/daycare.ts.
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  dayCareFullAt,
  dayCareOf,
  dayCareXp,
  depositError,
  eggOdds,
  hatchLevel,
  isDayCareOpen,
  nextDayCareTick,
  residentNow,
  type DayCareResident,
  type DepositError,
  type Hatch,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Chip, NewTag } from '@/components/Chip'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { SearchField } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { StageCanvas, type StageHandle } from '@/components/StageCanvas'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { hatchTimeline } from '@/fx/timelines/moments'
import { searchFold, t } from '@/i18n'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { hatchDayCareEgg, leaveAtDayCare, pickUpFromDayCare, visitDayCare } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'

// 12×14 pixel Egg: k outline, w shell, s shade, g spots.
const EGG = [
  '....kkkk....',
  '...kwwwwk...',
  '..kwwggwwk..',
  '.kwwgggwwwk.',
  '.kwwwggwwwk.',
  'kwwwwwwwggwk',
  'kwggwwwwggwk',
  'kwgggwwwwwsk',
  'kwwggwwwwwsk',
  'kwwwwwwgwwsk',
  '.kwwwwwggssk',
  '.kswwwwwsssk',
  '..kssssssk..',
  '...kkkkkk...',
]
const EGG_COLORS: Record<string, string> = { k: '#24304f', w: '#fbfdff', s: '#d8cfb4', g: '#34c97a' }

export function EggSprite({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * EGG.length) / EGG[0]!.length}
      viewBox={`0 0 ${EGG[0]!.length} ${EGG.length}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {EGG.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={EGG_COLORS[ch]} />
          ),
        ),
      )}
    </svg>
  )
}

const duration = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000))
  return m >= 60
    ? t('ui.dayCare.hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') })
    : t('ui.dayCare.minutes', { n: m })
}

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

/** One resident: its sprite, Lv now → Lv after, the stay's XP bar, when the next XP comes and when it is full. */
function Resident({ res, now, onTake }: { res: DayCareResident; now: number; onTake: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = data.config.dayCare
  const grown = residentNow(res, now, data)
  const xp = dayCareXp(res, now, data)
  const next = nextDayCareTick(res, now, data)
  const fullAt = dayCareFullAt(res, data)
  const ready = next == null
  const name = data.species[res.inst.dex]?.name ?? t('ui.common.unknown')
  const status = ready
    ? t('ui.dayCare.fullShort')
    : [
        t('ui.dayCare.nextTick', { xp: cfg.xpPerTick, time: duration(next) }),
        fullAt != null ? t('ui.dayCare.fullIn', { time: duration(fullAt - now) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
  return (
    <li
      className={cx(
        'grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 px-2.5 pb-2.5 pt-2',
        ready
          ? 'bg-[#f2fff6] shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_4px_#34c97a,inset_0_-6px_0_rgb(var(--c-good-pale))] dark:bg-[#12261c]'
          : CARD,
      )}
    >
      <SpriteImg dex={res.inst.dex} size={84} shiny={res.inst.shiny} />
      <div className="grid min-w-0 gap-1">
        <span className="flex items-center gap-2">
          <b className="min-w-0 truncate text-[22px] font-normal leading-none">{name}</b>
          {ready && <Chip tone="green">{t('ui.home.ready')}</Chip>}
        </span>
        <span className="text-[18px] leading-none">
          {t('ui.common.level.short', { n: res.inst.level })}
          {grown.level > res.inst.level && (
            <>
              {' '}
              <span aria-hidden className="text-muted">
                →
              </span>{' '}
              <span className="text-good">{t('ui.common.level.short', { n: grown.level })}</span>
            </>
          )}
        </span>
        <span
          className="relative block h-2 bg-line shadow-ring-thin"
          role="img"
          aria-label={t('ui.dayCare.xpOf', { xp, max: cfg.maxXp })}
        >
          <i
            className={cx('absolute inset-y-px left-px block', ready ? 'bg-hp-green' : 'bg-[#5b8def]')}
            style={{ width: `calc(${Math.min(100, (xp / Math.max(1, cfg.maxXp)) * 100)}% - 2px)` }}
          />
        </span>
        <small className="font-pixel-sm text-[14px] leading-[1.15] text-muted">
          {t('ui.dayCare.xpOf', { xp, max: cfg.maxXp })} · {status}
        </small>
      </div>
      <PixelButton
        variant={ready ? 'primary' : 'secondary'}
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
      sub={t('ui.dayCare.depositHint', { xp: cfg.xpPerTick, minutes: cfg.tickMinutes, max: cfg.maxXp })}
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
                      {why
                        ? t(REFUSED[why])
                        : t('ui.dayCare.gainsUpTo', {
                            level: t('ui.common.level.short', { n: p.level }),
                            max: cfg.maxXp,
                          })}
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
 * what hatched and where it went, Done and "Another".
 */
function HatchMoment({
  hatch,
  onDone,
  onAgain,
}: {
  hatch: Hatch
  onDone: () => void
  onAgain: (() => void) | null
}) {
  const { t } = useT()
  useHoldFullscreen()
  const data = useGame((s) => s.data)
  const price = data.config.dayCare.eggPrice
  const stage = useRef<StageHandle>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const scene = useMemo(
    () => ({
      ready: loadSprite(hatch.inst.dex, false, hatch.inst.shiny),
      timeline: hatchTimeline({ baby: spriteKey(hatch.inst.dex, false, hatch.inst.shiny) }),
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
    ? t('ui.dayCare.keptStronger', { name })
    : `${hatch.replaced ? t('ui.dayCare.replacedYours', { level: hatch.replaced.level, name }) : ''}${t(
        hatch.joinedTeam ? 'ui.dayCare.joinedTeam' : 'ui.dayCare.wentToBox',
      )}`
  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.dayCare.eggHatching')}
      className="fixed inset-0 z-[100] overflow-y-auto bg-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onKeyDown={(e) => e.key === 'Escape' && open && onDone()}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col gap-3 pb-4">
        <div className="shadow-ledge">
          <StageCanvas
            ref={stage}
            timeline={scene.timeline}
            ready={scene.ready}
            hud={{ beat: (b) => b === 'hatched' && reveal() }}
            onEnd={reveal}
            label={open ? t('ui.dayCare.hatched', { name }) : t('ui.dayCare.eggMoving')}
          />
        </div>
        <p
          className="pixel-dialogue mx-3 my-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]"
          aria-live="polite"
        >
          {open ? t('ui.dayCare.hatched', { name }) : t('ui.dayCare.eggMoving')}
        </p>
        {!open ? (
          <PixelButton className="mx-3 self-end" size="sm" onClick={() => stage.current?.skip()}>
            {t('ui.evolution.skip')}
          </PixelButton>
        ) : (
          <div className={cx('mx-3 grid gap-2 px-3 pb-3 pt-2.5', CARD)}>
            <p className="m-0 flex items-center gap-1.5 text-[22px] leading-none">
              <MiniSprite dex={hatch.inst.dex} size={40} className="-my-2" />
              <b className="font-normal">{name}</b>
              <span className="font-pixel-sm text-[17px] text-muted">
                {t('ui.common.level.short', { n: hatch.inst.level })}
              </span>
              {hatch.isNew && <NewTag />}
            </p>
            <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{where}</p>
            <div className={cx('grid gap-2.5', onAgain ? 'grid-cols-[1fr_1.4fr]' : 'grid-cols-1')}>
              <PixelButton ref={doneRef} onClick={onDone}>
                {t('ui.dayCare.done')}
              </PixelButton>
              {onAgain && (
                <PixelButton variant="primary" className="whitespace-nowrap px-2" onClick={onAgain}>
                  {t('ui.dayCare.another', { price })}
                </PixelButton>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

/** The Egg: free once, then bought; the level it hatches at and the odds of a missing species, from the engine. */
function EggCard({ onHatch }: { onHatch: (free: boolean) => void }) {
  const { t, tPlural } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const cfg = data.config.dayCare
  const free = !dayCareOf(save).eggClaimed
  const short = Math.max(0, cfg.eggPrice - save.gold)
  const missing = eggOdds(save, data).filter((o) => o.weight > 1).length
  return (
    <div
      className={cx(
        'grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 pb-3 pt-2.5',
        free
          ? 'bg-gold-pale shadow-card-gold-lip'
          : 'bg-sand shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-sand-lip))]',
      )}
    >
      <EggSprite size={64} className="mx-auto" />
      <div className="grid min-w-0 gap-1">
        <b className="text-[22px] font-normal leading-none">
          {t(free ? 'ui.dayCare.eggForYou' : 'ui.dayCare.buyTitle')}
        </b>
        <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
          {free ? t('ui.dayCare.freeEgg') : t('ui.dayCare.buyEgg', { price: cfg.eggPrice })}
        </p>
        <ul className="m-0 mt-0.5 flex list-none flex-wrap gap-1 p-0">
          <li className="bg-paper px-1.5 pb-0.5 pt-px font-pixel-sm text-[14px] text-ink shadow-[inset_0_0_0_1px_#d8c8a8] dark:shadow-[inset_0_0_0_1px_rgb(var(--c-sand-lip))]">
            {t('ui.dayCare.hatchAt', { level: t('ui.common.level.short', { n: hatchLevel(save, data) }) })}
          </li>
          <li className="bg-paper px-1.5 pb-0.5 pt-px font-pixel-sm text-[14px] text-ink shadow-[inset_0_0_0_1px_#d8c8a8] dark:shadow-[inset_0_0_0_1px_rgb(var(--c-sand-lip))]">
            {missing > 0
              ? tPlural('ui.dayCare.missing', missing, { n: missing, k: cfg.unownedWeight })
              : t('ui.dayCare.haveAll')}
          </li>
        </ul>
      </div>
      <PixelButton
        variant="primary"
        className="col-span-2 w-full"
        aria-disabled={!free && short > 0}
        onClick={() => {
          if (!free && short > 0) pushToast(t('ui.shop.needMore', { price: money(short) }), 'bad')
          else onHatch(free)
        }}
      >
        {free
          ? t('ui.dayCare.takeEgg')
          : short > 0
            ? t('ui.shop.needMore', { price: money(short) })
            : t('ui.dayCare.buy', { price: cfg.eggPrice })}
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
  useEffect(() => {
    if (open) visitDayCare()
  }, [open])
  if (!save) return <Navigate to="/" replace />
  if (!open) return <Navigate to="/home" replace />
  const cfg = data.config.dayCare
  const dc = dayCareOf(save)
  const free = !dc.eggClaimed

  const takeEgg = (isFree: boolean) => {
    const res = hatchDayCareEgg(isFree)
    if (res) {
      setHatch(res)
      setHatchId((n) => n + 1)
    }
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
    pushToast(
      `${t('ui.dayCare.isBack', { name })} ${grew} ${t(res.joinedTeam ? 'ui.dayCare.rejoined' : 'ui.dayCare.wentToBox')}`,
      'good',
      5000,
    )
  }
  const canAgain = save.gold >= cfg.eggPrice

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead
        title={t('ui.dayCare.title')}
        count={`${dc.residents.length}/${cfg.slots}`}
        onBack={() => navigate('/home')}
      />
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
        {t('ui.dayCare.intro', {
          slots: cfg.slots,
          xp: cfg.xpPerTick,
          minutes: cfg.tickMinutes,
          max: cfg.maxXp,
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

      <div className="mt-1 flex items-baseline gap-2">
        <h2 className="m-0 text-[24px] font-normal leading-none">{t('ui.dayCare.eggs')}</h2>
        {free && <Chip tone="gold">{t('ui.dayCare.freeChip')}</Chip>}
      </div>
      <EggCard onHatch={takeEgg} />

      <LeaveSheet open={leaving} onClose={() => setLeaving(false)} />
      {hatch && (
        <HatchMoment
          key={hatchId}
          hatch={hatch}
          onDone={() => setHatch(null)}
          onAgain={canAgain ? () => takeEgg(false) : null}
        />
      )}
    </div>
  )
}
