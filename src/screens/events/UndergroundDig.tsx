// Digging a wall (docs/34; docs/15 §32), full screen: the crack gauge, the wall, what's still buried, the pickaxe's
// roll. A tap on a tile strikes it (the engine rolls the die and digs); at the end the wall collapses or is cleared,
// and the haul shows where each thing went. Leaving keeps the wall: it waits in the save.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { kitsHeld, pickaxeFaces, thingDone, ugCfg, wallStatus, type HaulLine, type Wall } from '@/engine'
import { fxSound } from '@/audio/sfx'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import {
  CrackGauge,
  HaulList,
  OrbArt,
  PickaxeDie,
  PickaxeFaces,
  PlateArt,
  UG_IMPACT_MS,
  UgWall,
  thingName,
  type FoundFx,
  type StrikeFx,
} from '@/components/Underground'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { pushToast, useGame } from '@/store/game'
import { ugOpenWall, ugStrike, ugTakeHaul, useUnderground } from '@/store/underground'
import { cx } from '@/theme/util'
import { flushUgOutbox } from '@/store/ugTeams'
import { UgClosed } from './Underground'

const doneCount = (w: Wall) => w.things.filter((th) => thingDone(w, th)).length

export function UndergroundDig() {
  useHoldFullscreen()
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const { level, calm } = useMotion()
  const wide = useMediaQuery('(min-width: 1024px)')
  const { live, now, u } = useUnderground(5000)
  const [fx, setFx] = useState<StrikeFx | null>(null)
  const [freed, setFreed] = useState<FoundFx | null>(null)
  const [roll, setRoll] = useState<{ face: number; roll: number } | null>(null)
  const [haul, setHaul] = useState<HaulLine[] | null>(null)
  const keyRef = useRef(0)
  const wall = u?.wall ?? null
  const status = wall ? wallStatus(wall) : null

  // A new wall starts with nothing rolled.
  const wallId = wall?.id
  useEffect(() => {
    setFx(null)
    setFreed(null)
    setRoll(null)
  }, [wallId])

  if (now == null) return <p className="copy p-3 text-muted">{t('ui.common.loading')}</p>
  if (!live || !u) return <UgClosed />
  if (!wall && !haul) return <Navigate to="/underground" replace />

  const cfg = ugCfg(data)
  const faces = pickaxeFaces(cfg, u.pickaxe)

  const onStrike = (tile: number, at?: { x: number; y: number }) => {
    if (!wall || status !== 'digging') return
    const r = ugStrike(tile)
    if (!r) return
    const key = ++keyRef.current
    setRoll(r)
    setFx({ tile, roll: r.roll, key, at })
    const after = useGame.getState().save?.underground?.wall
    // The things this strike finished digging out: the first one's name pops over it.
    const first = after
      ? after.things.findIndex((th, k) => thingDone(after, th) && !thingDone(wall, wall.things[k]!))
      : -1
    setFreed(first >= 0 ? { thing: first, key } : null)
    // The sounds land with the pickaxe, not with the finger.
    const sounds = () => {
      fxSound('ug.strike', r.roll)
      if (first >= 0) fxSound('ug.found')
      if (after && wallStatus(after) === 'collapsed') fxSound('ug.collapse')
    }
    if (level === 'full') setTimeout(sounds, UG_IMPACT_MS)
    else sounds()
  }

  const takeHaul = () => {
    const lines = ugTakeHaul()
    if (!lines) return
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
  }

  const message =
    freed && wall?.things[freed.thing]
      ? t('ui.ug.dugOut', { thing: thingName(wall.things[freed.thing]!, data) })
      : roll == null
        ? t('ui.ug.tap')
        : roll.roll === 1
          ? t('ui.ug.rolled1')
          : wall && roll.roll - wall.neighbourLoss <= 0
            ? t('ui.ug.rolledHere', { n: roll.roll })
            : wall && wall.neighbourLoss === 0
              ? t('ui.ug.rolledAll', { n: roll.roll })
              : t('ui.ug.rolledN', { n: roll.roll, side: roll.roll - (wall?.neighbourLoss ?? 1) })

  const left = wall ? wall.strikes - wall.used : 0
  const hot = left <= 3
  const found = wall ? doneCount(wall) : 0

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

      {/* Phones: the gauge, the wall, what's buried, the die pinned at the foot. PC (docs/43 §5.11): the wall large on
          the left, as tall as the screen allows; the gauge, what's buried and the die docked at its right. */}
      <main
        className={cx(
          'mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-2.5 px-3 pt-2.5',
          'lg:grid lg:max-w-[1240px] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-8 lg:gap-y-4 lg:px-6 lg:pt-6',
        )}
      >
        {wall && (
          <div className="grid gap-1.5 lg:col-start-2 lg:row-start-1">
            <div className="flex items-end justify-between gap-2">
              <span className={cx('text-[19px] leading-none', hot ? 'text-[#ff9a6a]' : 'text-[#fbfdff]')}>
                {status === 'collapsed'
                  ? t('ui.ug.collapsedShort')
                  : hot && status === 'digging'
                    ? t('ui.ug.shaking')
                    : t('ui.ug.holds')}
              </span>
              <span
                key={wall.used}
                className={cx(
                  'ug-count font-pixel-sm text-[20px] leading-none tabular-nums',
                  hot ? 'text-[#ff9a6a]' : 'text-gold-light',
                  fx && level === 'full' && !calm && 'bump',
                )}
              >
                {t(`ui.ug.strikesLeft.${left === 1 ? 'one' : 'other'}`, { count: left })}
              </span>
            </div>
            <CrackGauge strikes={wall.strikes} used={wall.used} calm={calm} hitKey={fx?.key} motion={level} />
          </div>
        )}

        {wall && (
          <div
            className="w-full lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:justify-self-center"
            // As wide as the window's height allows for the wall's shape, so it's never cut by the fold.
            style={wide ? { maxWidth: `calc((100dvh - 150px) * ${wall.cols / wall.rows})` } : undefined}
          >
            <UgWall
              wall={wall}
              data={data}
              onStrike={onStrike}
              disabled={status !== 'digging'}
              fx={fx}
              found={freed}
              motion={level}
              calm={calm}
              collapsing={status === 'collapsed'}
            />
          </div>
        )}

        {wall && (
          <div className="grid gap-1 lg:col-start-2 lg:row-start-2">
            <span className="flex items-center justify-between gap-2 font-pixel-sm text-[16px] text-gold-light">
              <span>{t('ui.ug.buried', { n: wall.things.length, found })}</span>
              <span className="inline-flex shrink-0 items-center gap-1">
                <PixelIcon name="kit" size={14} />
                {t('ui.ug.kitsLeft', { n: kitsHeld(u) })}
              </span>
            </span>
            <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0">
              {wall.things.map((th, k) => {
                const done = thingDone(wall, th)
                return (
                  <li
                    key={k}
                    className={cx(
                      'flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 font-pixel-sm text-[16px]',
                      done
                        ? 'bg-paper text-ink shadow-ring-thin'
                        : 'bg-well-deep text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
                    )}
                  >
                    {done ? (
                      th.kind === 'plate' ? (
                        <PlateArt type={th.plate!} px={16} />
                      ) : th.colour ? (
                        <OrbArt colour={th.colour} px={12} />
                      ) : (
                        <PixelIcon name="pickaxeSm" size={12} />
                      )
                    ) : (
                      <span aria-hidden>?</span>
                    )}
                    <span className="truncate">{done ? thingName(th, data) : t('ui.ug.stillBuried')}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* The die and its line, or the end: pinned at a phone's foot, the panel's last card on PC. */}
        <footer className="sticky bottom-0 z-10 -mx-3 mt-auto border-t-2 border-edge bg-panel px-3 pb-4 pt-2.5 lg:static lg:col-start-2 lg:row-start-3 lg:mx-0 lg:mt-0 lg:border-0 lg:p-3 lg:shadow-card">
          {status === 'digging' || !wall ? (
            <div className="flex items-center gap-3">
              <PickaxeDie roll={roll?.roll ?? null} rollKey={fx?.key} />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="text-[19px] leading-tight" aria-live="polite">
                  {message}
                </span>
                <span className="font-pixel-sm text-[16px] text-muted">
                  {t('ui.ug.dieLabel', { level: u.pickaxe })}
                </span>
                <PickaxeFaces faces={faces} face={roll?.face} size={26} />
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="m-0 text-center text-[26px] leading-none" role="status">
                {status === 'cleared' ? t('ui.ug.clearedTitle') : t('ui.ug.collapsedTitle')}
              </p>
              <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">
                {t('ui.ug.endLine', { found, n: wall.things.length, used: wall.used })}
              </p>
              <PixelButton variant="primary" size="lg" onClick={takeHaul}>
                {t('ui.ug.seeHaul')}
              </PixelButton>
            </div>
          )}
        </footer>
      </main>

      <Modal
        open={!!haul}
        onClose={() => navigate('/underground')}
        title={haulTitle(t, haul)}
        className="max-w-md"
      >
        <div className="flex flex-col gap-3">
          {haul && <HaulList lines={haul} data={data} />}
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
