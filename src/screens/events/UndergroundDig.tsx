// Digging a wall (docs/31; docs/15 §30), full screen: the crack gauge, the wall, what's still buried, the pickaxe's
// roll. A tap on a tile strikes it (the engine rolls the die and digs); at the end the wall collapses or is cleared,
// and the haul shows where each thing went. Leaving keeps the wall: it waits in the save.
import { useEffect, useRef, useState } from 'react'
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
  UgWall,
  thingName,
  type StrikeFx,
} from '@/components/Underground'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
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
  const { live, now, u } = useUnderground(5000)
  const [fx, setFx] = useState<StrikeFx | null>(null)
  const [roll, setRoll] = useState<{ face: number; roll: number } | null>(null)
  const [haul, setHaul] = useState<HaulLine[] | null>(null)
  const keyRef = useRef(0)
  const wall = u?.wall ?? null
  const status = wall ? wallStatus(wall) : null

  // A new wall starts with nothing rolled.
  const wallId = wall?.id
  useEffect(() => {
    setFx(null)
    setRoll(null)
  }, [wallId])

  if (now == null) return <p className="copy p-3 text-muted">{t('ui.common.loading')}</p>
  if (!live || !u) return <UgClosed />
  if (!wall && !haul) return <Navigate to="/underground" replace />

  const cfg = ugCfg(data)
  const faces = pickaxeFaces(cfg, u.pickaxe)

  const onStrike = (tile: number) => {
    if (!wall || status !== 'digging') return
    const before = doneCount(wall)
    const r = ugStrike(tile)
    if (!r) return
    setRoll(r)
    setFx({ tile, roll: r.roll, key: ++keyRef.current })
    fxSound('ug.strike', r.roll)
    const after = useGame.getState().save?.underground?.wall
    if (after && doneCount(after) > before) fxSound('ug.found')
    if (after && wallStatus(after) === 'collapsed') fxSound('ug.collapse')
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
    roll == null
      ? t('ui.ug.tap')
      : roll.roll === 1
        ? t('ui.ug.rolled1')
        : wall && roll.roll - wall.neighbourLoss <= 0
          ? t('ui.ug.rolledHere', { n: roll.roll })
          : wall && wall.neighbourLoss === 0
            ? t('ui.ug.rolledAll', { n: roll.roll })
            : t('ui.ug.rolledN', { n: roll.roll, side: roll.roll - (wall?.neighbourLoss ?? 1) })

  const left = wall ? wall.strikes - wall.used : 0
  const found = wall ? doneCount(wall) : 0

  return (
    <div className="ug-dig flex min-h-dvh flex-col bg-[#2b211a]">
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

      {wall && (
        <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-2.5 px-3 pt-2.5">
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between text-panel">
              <span className="text-[19px] leading-none text-[#fbfdff]">
                {status === 'collapsed'
                  ? t('ui.ug.collapsedShort')
                  : left <= 3 && status === 'digging'
                    ? t('ui.ug.shaking')
                    : t('ui.ug.holds')}
              </span>
              <span className="font-pixel-sm text-[16px] text-gold-light">
                {t(`ui.ug.strikesLeft.${left === 1 ? 'one' : 'other'}`, { count: left })}
              </span>
            </div>
            <CrackGauge strikes={wall.strikes} used={wall.used} calm={calm} />
          </div>

          <UgWall
            wall={wall}
            data={data}
            onStrike={onStrike}
            disabled={status !== 'digging'}
            fx={fx}
            motion={level}
            collapsing={status === 'collapsed'}
          />

          <div className="grid gap-1">
            <span className="flex items-center justify-between gap-2 font-pixel-sm text-[15px] text-gold-light">
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
                      'flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 font-pixel-sm text-[14px]',
                      done
                        ? 'bg-paper text-ink shadow-ring-thin'
                        : 'bg-well-deep text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
                    )}
                  >
                    {done ? (
                      th.kind === 'plate' ? (
                        <PlateArt type={th.plate!} style={{ width: 14, height: 10 }} />
                      ) : th.colour ? (
                        <OrbArt colour={th.colour} px={10} />
                      ) : (
                        <PixelIcon name="pickaxe" size={12} />
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
        </main>
      )}

      <footer className="mt-auto border-t-2 border-edge bg-panel px-3 pb-4 pt-2.5">
        <div className="mx-auto max-w-[440px]">
          {status === 'digging' || !wall ? (
            <div className="flex items-center gap-3">
              <PickaxeDie roll={roll?.roll ?? null} rollKey={fx?.key} />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="text-[19px] leading-tight" aria-live="polite">
                  {message}
                </span>
                <span className="font-pixel-sm text-[14px] text-muted">
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
        </div>
      </footer>

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
