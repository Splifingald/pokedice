// Digging a wall (docs/34; docs/15 §32), full screen: the crack gauge with the strikes left, the wall, what it hides as
// slots, the pickaxe's die. Pictures over words (docs/34 §13): a tap strikes a tile (the engine rolls the die and digs),
// the layers taken pop over the tiles hit, rock flies, a 3 bursts; a thing dug out flies to its slot; the end is a
// stamp over the wall (dust for a collapse, confetti for a wall cleared), then the haul's cards turn over one by one.
// A collapsed wall can take another kit for a new gauge (docs/34 §12). The words are still read out. Leaving keeps the
// wall: it waits in the save.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  kitsHeld,
  pickaxeFaces,
  refreshOffer,
  thingDone,
  ugCfg,
  wallStatus,
  type HaulLine,
  type Wall,
} from '@/engine'
import { fxSound } from '@/audio/sfx'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import {
  CrackGauge,
  HaulList,
  HaulWorth,
  PickaxeDie,
  PickaxeFaces,
  UG_CARD_MS,
  UG_FLY_MS,
  UG_IMPACT_MS,
  UgBuriedSlots,
  UgFlight,
  UgWall,
  UgWallEnd,
  thingName,
  type FoundFx,
  type StrikeFx,
  type UgFlightFx,
} from '@/components/Underground'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { pushToast, useGame } from '@/store/game'
import { ugOpenWall, ugRefreshWall, ugStrike, ugTakeHaul, useUnderground } from '@/store/underground'
import { cx } from '@/theme/util'
import { flushUgOutbox } from '@/store/ugTeams'
import { UgClosed } from './Underground'

const doneCount = (w: Wall) => w.things.filter((th) => thingDone(w, th)).length

/** The stamp lands this long after the last strike's impact (underground.css's `ug-slam` delay). */
const STAMP_MS = 500

export function UndergroundDig() {
  useHoldFullscreen()
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const { level, calm } = useMotion()
  const wide = useMediaQuery('(min-width: 1024px)')
  const { live, now, u } = useUnderground(5000)
  const [fx, setFx] = useState<StrikeFx | null>(null)
  const [freed, setFreed] = useState<FoundFx | null>(null)
  const [flight, setFlight] = useState<UgFlightFx | null>(null)
  const [roll, setRoll] = useState<{ face: number; roll: number } | null>(null)
  const [haul, setHaul] = useState<HaulLine[] | null>(null)
  // The wall just finished stays drawn behind its haul.
  const [past, setPast] = useState<Wall | null>(null)
  const [rebuild, setRebuild] = useState<number | null>(null)
  const [said, setSaid] = useState('')
  const keyRef = useRef(0)
  const wallBox = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const wall = u?.wall ?? (haul ? past : null)
  const status = wall ? wallStatus(wall) : null

  // A new wall starts with nothing rolled.
  const wallId = wall?.id
  useEffect(() => {
    setFx(null)
    setFreed(null)
    setFlight(null)
    setRoll(null)
    setRebuild(null)
  }, [wallId])

  // The haul's cards turn over with a tick each, a chime for a new plate.
  useEffect(() => {
    if (!haul || level === 'off') return
    const timers = haul.map((l, k) =>
      setTimeout(() => fxSound(l.outcome === 'plate' ? 'ug.found' : 'ug.reveal'), 120 + k * UG_CARD_MS),
    )
    return () => timers.forEach(clearTimeout)
  }, [haul, level])

  if (now == null) return <p className="copy p-3 text-muted">{t('ui.common.loading')}</p>
  if (!live || !u) return <UgClosed />
  if (!wall) return <Navigate to="/underground" replace />

  const cfg = ugCfg(data)
  const faces = pickaxeFaces(cfg, u.pickaxe)
  const ended = status === 'cleared' || status === 'collapsed' ? status : null

  const onStrike = (tile: number, at?: { x: number; y: number }) => {
    if (!u.wall || status !== 'digging') return
    const before = u.wall
    const r = ugStrike(tile)
    if (!r) return
    const key = ++keyRef.current
    setRoll(r)
    setRebuild(null)
    setFx({ tile, roll: r.roll, key, at })
    const after = useGame.getState().save?.underground?.wall
    // The things this strike finished digging out: the first one shines, and flies to its slot (full motion).
    const first = after
      ? after.things.findIndex((th, k) => thingDone(after, th) && !thingDone(before, before.things[k]!))
      : -1
    setFreed(first >= 0 ? { thing: first, key } : null)
    setFlight(first >= 0 && level === 'full' ? flightOf(after!, first, key) : null)
    const end = after ? wallStatus(after) : 'digging'
    // Read out what a sighted player sees: the roll, a find, the end.
    setSaid(
      first >= 0
        ? t('ui.ug.dugOut', { thing: thingName(after!.things[first]!, data) })
        : r.roll === 1
          ? t('ui.ug.rolled1')
          : r.roll - before.neighbourLoss <= 0
            ? t('ui.ug.rolledHere', { n: r.roll })
            : before.neighbourLoss === 0
              ? t('ui.ug.rolledAll', { n: r.roll })
              : t('ui.ug.rolledN', { n: r.roll, side: r.roll - before.neighbourLoss }),
    )
    // A 3 shakes the whole screen.
    const main = mainRef.current
    if (r.roll >= 3 && level === 'full' && !calm && main && typeof main.animate === 'function')
      main.animate(
        [
          { transform: 'translate(0, 0)' },
          { transform: 'translate(-6px, 4px)' },
          { transform: 'translate(5px, -3px)' },
          { transform: 'translate(-3px, 2px)' },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 260, delay: UG_IMPACT_MS, easing: 'steps(5, end)' },
      )
    // The sounds land with the pickaxe, not with the finger; the stamp's thud with the stamp.
    const sounds = () => {
      fxSound('ug.strike', r.roll)
      if (r.roll >= 3) fxSound('ug.crit')
      if (first >= 0) fxSound('ug.found')
      if (end === 'collapsed') fxSound('ug.collapse')
      if (end === 'cleared') fxSound('ug.clear')
    }
    const wait = level === 'full' ? UG_IMPACT_MS : 0
    setTimeout(sounds, wait)
    if (end !== 'digging' && level !== 'off') setTimeout(() => fxSound('ug.stamp'), wait + STAMP_MS)
  }

  /** Where the thing lies on screen, and where its slot is: the flight's ends. */
  function flightOf(w: Wall, thing: number, key: number): UgFlightFx | null {
    const box = wallBox.current?.querySelector('.ug-wall')?.getBoundingClientRect()
    const slot = document.querySelector(`[data-slot="${thing}"]`)?.getBoundingClientRect()
    const th = w.things[thing]
    if (!box || !slot || !th) return null
    // The tiles sit inside the frame's 6 px padding.
    const cw = (box.width - 12) / w.cols
    const ch = (box.height - 12) / w.rows
    return {
      key,
      thing: th,
      from: { x: box.left + 6 + th.x * cw, y: box.top + 6 + th.y * ch, w: th.w * cw, h: th.h * ch },
      to: { x: slot.left, y: slot.top, w: slot.width, h: slot.height },
    }
  }

  const takeHaul = () => {
    const done = u.wall
    const lines = ugTakeHaul()
    if (!lines) return
    setPast(done)
    setHaul(lines)
    // Orbs owed to teammates go to the server now (they wait in the save if it can't be reached).
    void flushUgOutbox()
  }

  const nextWall = () => {
    if (!ugOpenWall()) {
      pushToast(t('ui.ug.noKitsBuy'), 'bad')
      return
    }
    setHaul(null)
    setPast(null)
  }

  // A collapsed wall's new gauge (docs/34 §12): the same wall, its layers and finds kept, struck from a fresh start.
  const offer = save && !haul ? refreshOffer(save, data, now) : null
  const refresh = () => {
    if (!offer) return
    if (offer.kind === 'buy' && offer.soldOut) return pushToast(t('ui.ug.refreshSoldOut'), 'bad')
    if (offer.kind === 'buy' && offer.short > 0)
      return pushToast(t('ui.shop.needMore', { price: money(offer.short) }), 'bad')
    if (!ugRefreshWall()) return
    setFx(null)
    setFreed(null)
    setFlight(null)
    setRoll(null)
    setRebuild(++keyRef.current)
    setSaid(t('ui.ug.refreshed'))
    if (level !== 'off') fxSound('ug.refill')
  }

  const left = wall.strikes - wall.used
  const hot = left <= 3
  const found = doneCount(wall)

  return (
    <div
      className="ug-dig flex min-h-dvh flex-col bg-[#2b211a]"
      // The gauge's mark waits for the pickaxe's impact too (underground.css).
      style={{ '--ug-impact': level === 'full' ? `${UG_IMPACT_MS}ms` : '0ms' } as CSSProperties}
    >
      <header className="flex items-center gap-2 border-b-2 border-edge bg-panel px-3 py-2">
        <h1 className="m-0 min-w-0 flex-1 truncate text-[26px] font-normal leading-none">
          {t('ui.ug.wallTitle')}
        </h1>
        {!haul && status === 'digging' && (
          <PixelButton
            size="sm"
            onClick={() => {
              pushToast(t('ui.ug.waits'), 'info')
              navigate('/underground')
            }}
          >
            {t('ui.ug.leave')}
          </PixelButton>
        )}
      </header>

      {/* Phones: the gauge, the wall, its slots, the die pinned at the foot. PC (docs/43 §5.11): the wall large on the
          left, as tall as the screen allows; the gauge, the slots and the die docked at its right. */}
      <main
        ref={mainRef}
        className={cx(
          'mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-3 px-3 pt-2.5',
          'lg:grid lg:max-w-[1240px] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-8 lg:gap-y-4 lg:px-6 lg:pt-6',
        )}
      >
        <div className="flex items-stretch gap-2 lg:col-start-2 lg:row-start-1">
          <CrackGauge
            strikes={wall.strikes}
            used={wall.used}
            calm={calm}
            hitKey={fx?.key}
            rebuildKey={rebuild ?? undefined}
            motion={level}
            className="min-w-0 flex-1"
          />
          <span
            key={wall.used}
            className={cx(
              'ug-left ug-count light-scope font-normal tabular-nums',
              hot && 'hot',
              fx && level === 'full' && !calm && 'bump',
            )}
            aria-hidden
          >
            {left}
          </span>
        </div>

        <div
          ref={wallBox}
          className="w-full lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:justify-self-center"
          // As wide as the window's height allows for the wall's shape, so it's never cut by the fold.
          style={wide ? { maxWidth: `calc((100dvh - 150px) * ${wall.cols / wall.rows})` } : undefined}
        >
          <UgWall
            wall={wall}
            data={data}
            onStrike={onStrike}
            disabled={status !== 'digging' || !!haul}
            fx={fx}
            found={freed}
            motion={level}
            calm={calm}
            end={ended}
          />
        </div>

        <div className="flex items-center justify-between gap-3 lg:col-start-2 lg:row-start-2">
          <UgBuriedSlots
            wall={wall}
            data={data}
            popped={freed}
            delay={flight ? UG_IMPACT_MS + UG_FLY_MS - 80 : 0}
          />
          <span className="light-scope inline-flex shrink-0 items-center gap-1 text-[24px] leading-none text-gold-light">
            <PixelIcon name="kit" size={26} />
            <span aria-hidden>{kitsHeld(u)}</span>
            <span className="sr-only">{t('ui.ug.kitsLeft', { n: kitsHeld(u) })}</span>
          </span>
        </div>

        {/* The die and its faces, or what to do at the end: pinned at a phone's foot, the panel's last card on PC. */}
        <footer className="sticky bottom-0 z-10 -mx-3 mt-auto border-t-2 border-edge bg-panel px-3 pb-4 pt-2.5 lg:static lg:col-start-2 lg:row-start-3 lg:mx-0 lg:mt-0 lg:border-0 lg:p-3 lg:shadow-card">
          <p className="sr-only" aria-live="polite">
            {roll == null && !said ? t('ui.ug.tap') : said}
          </p>
          {status === 'digging' ? (
            <div className="flex items-center gap-3">
              <PickaxeDie roll={roll?.roll ?? null} rollKey={fx?.key} size={64} />
              <div className="grid min-w-0 flex-1 justify-items-start gap-1.5">
                <span className="bg-ink px-1.5 pb-0.5 text-[16px] leading-tight text-paper">
                  <PixelIcon name="pickaxeSm" size={12} className="mr-1 align-[-1px]" />
                  <span aria-hidden>{t('ui.ug.lv', { level: u.pickaxe })}</span>
                  <span className="sr-only">{t('ui.ug.dieLabel', { level: u.pickaxe })}</span>
                </span>
                <PickaxeFaces faces={faces} face={roll?.face} size={30} />
              </div>
            </div>
          ) : (
            <UgWallEnd
              cleared={status === 'cleared'}
              found={found}
              n={wall.things.length}
              used={wall.used + (wall.usedBefore ?? 0)}
              offer={offer}
              onRefresh={refresh}
              onHaul={takeHaul}
            />
          )}
        </footer>
      </main>

      {flight && <UgFlight key={flight.key} fx={flight} data={data} delay={UG_IMPACT_MS} />}

      <Modal
        open={!!haul}
        onClose={() => navigate('/underground')}
        title={haulTitle(t, haul)}
        className="max-w-md"
      >
        <div className="flex flex-col gap-3">
          {haul && <HaulWorth lines={haul} data={data} reveal={level !== 'off'} />}
          {haul && <HaulList lines={haul} data={data} reveal={level !== 'off'} />}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2.5">
            <PixelButton onClick={() => navigate('/underground')}>{t('ui.ug.done')}</PixelButton>
            <PixelButton variant="primary" aria-disabled={kitsHeld(u) === 0} onClick={nextWall}>
              {t('ui.ug.next', { n: kitsHeld(u) })}
            </PixelButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function haulTitle(
  t: (k: string, v?: Record<string, string | number>) => string,
  haul: HaulLine[] | null,
): string {
  const n = haul?.filter((l) => l.outcome !== 'lost').length ?? 0
  return n === 0 ? t('ui.ug.haul.none') : t(`ui.ug.haul.title.${n === 1 ? 'one' : 'other'}`, { count: n })
}
