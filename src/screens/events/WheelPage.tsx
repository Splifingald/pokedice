// The Fortune Wheel's page (docs/18, the Visual Lab's mockup): the wheel, the blue Info button with every prize's
// real odds, and the day's free spin, or how long until the next one. The prize is drawn before the wheel turns
// (store/wheel.ts) and paid when it stops, then a card says what it was.
import { useEffect, useMemo, useRef, useState } from 'react'
import { prizeChances, wheelSlices, type GameData, type WheelPrize, type WheelReward } from '@/engine'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { isJackpot, WheelStage, type WheelMotion, type WheelSlice } from '@/fx/wheel'
import { useT } from '@/i18n/react'
import { countdown, money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { pushToast, useGame } from '@/store/game'
import { collectWheelPrize, spinWheel } from '@/store/wheel'
import { RewardIcon, rewardName, useWheelDay } from './shared'

const toSlice = (p: WheelPrize, data: GameData): WheelSlice => {
  const r = p.reward
  if (r.kind === 'gold') return { reward: r, label: money(r.amount) }
  return { reward: r, sprite: data.items[r.key]?.spriteUrl ?? undefined, label: r.qty > 1 ? `×${r.qty}` : '' }
}

export function WheelPage() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const pending = useGame((s) => s.save?.events?.wheelPending)
  const prizes = data.config.events.wheel.prizes
  const order = useMemo(() => wheelSlices(prizes), [prizes])
  const slices = useMemo(() => order.map((i) => toSlice(prizes[i]!, data)), [order, prizes, data])
  const { level, calm } = useMotion()
  const motion: WheelMotion = calm ? 'off' : level
  const day = useWheelDay()
  const [spinning, setSpinning] = useState(false)
  const [won, setWon] = useState<WheelReward | null>(null)
  const [odds, setOdds] = useState(false)

  const box = useRef<HTMLDivElement>(null)
  const disc = useRef<HTMLCanvasElement>(null)
  const fx = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<HTMLSpanElement>(null)
  const stage = useRef<WheelStage | null>(null)
  const spentToday = day.known && !day.ready

  // One stage for the page's life; the slices, the motion and the day are passed to it as they change.
  useEffect(() => {
    if (!box.current || !disc.current || !fx.current || !pointer.current) return
    const s = new WheelStage({ box: box.current, wheel: disc.current, fx: fx.current, pointer: pointer.current }, slices, motion)
    s.start(spentToday)
    stage.current = s
    const onResize = () => s.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      s.stop()
      stage.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; the effects below keep it current
  }, [])
  useEffect(() => stage.current?.setSlices(slices), [slices])
  useEffect(() => stage.current?.setMotion(motion), [motion])
  useEffect(() => {
    if (!spinning) stage.current?.setSpun(spentToday)
  }, [spentToday, spinning])
  // A prize still waiting that this page didn't spin for (it came with the cloud save): paid now.
  useEffect(() => {
    if (pending && !spinning) collectWheelPrize()
  }, [pending, spinning])

  const spin = async () => {
    if (spinning || !stage.current) return
    setSpinning(true)
    const res = await spinWheel()
    if (!res.ok) {
      setSpinning(false)
      if (res.reason === 'spent') pushToast(t('ui.events.wheel.spentElsewhere'), 'info')
      else if (res.reason === 'error') pushToast(t('ui.events.wheel.error'), 'bad')
      return
    }
    await stage.current?.spin(res.slice)
    collectWheelPrize()
    setWon(res.reward)
    setSpinning(false)
  }

  const live = prizes.filter((p) => p.count > 0 && p.odds > 0)
  const wheelLabel = t('ui.events.wheel.wheelLabel', {
    n: order.length,
    prizes: live.map((p) => `${p.count} × ${rewardName(p.reward, data)}`).join(', '),
  })
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-1.5">
      <div ref={box} className="ev-wheel">
        <span className="ev-wheel-rays" aria-hidden />
        <span ref={pointer} className="ev-pointer" aria-hidden />
        <canvas ref={disc} className="ev-wheel-disc" width={288} height={288} role="img" aria-label={wheelLabel} />
        <canvas ref={fx} className="ev-wfx" aria-hidden />
      </div>
      <div className="grid grid-cols-[1fr_2.2fr] items-stretch gap-2.5">
        <button type="button" className="ev-info" onClick={() => setOdds(true)} aria-label={t('ui.events.wheel.infoLabel')}>
          {t('ui.events.wheel.info')}
        </button>
        {spentToday && !spinning ? (
          <p className="m-0 grid content-center gap-[3px] bg-well p-2 text-center shadow-ring-line">
            <b className="text-[20px] font-normal leading-none">{t('ui.events.wheel.comeBack')}</b>
            <small className="font-pixel-sm text-[15px] leading-none text-muted">
              {t('ui.events.wheel.nextSpin', { time: countdown(day.msLeft) })}
            </small>
          </p>
        ) : (
          <PixelButton
            variant="primary"
            className="min-h-[64px] text-[26px]"
            disabled={spinning || !day.known}
            onClick={() => void spin()}
          >
            {day.known ? t('ui.events.wheel.spin') : t('ui.events.wheel.waitTime')}
          </PixelButton>
        )}
      </div>
      <p className="m-0 text-center font-pixel-sm text-[15px] text-muted">{t('ui.events.wheel.tip')}</p>
      <OddsSheet open={odds} onClose={() => setOdds(false)} prizes={live} data={data} slices={order.length} />
      <RewardCard reward={won} data={data} onClose={() => setWon(null)} calm={motion === 'off'} />
    </div>
  )
}

/** Every prize, how many slices it has and its real chance a spin. */
function OddsSheet({
  open,
  onClose,
  prizes,
  data,
  slices,
}: {
  open: boolean
  onClose: () => void
  prizes: WheelPrize[]
  data: GameData
  slices: number
}) {
  const { t } = useT()
  const chances = prizeChances(prizes)
  const pct = (n: number) => `${+n.toFixed(2)} %`
  return (
    <Modal open={open} onClose={onClose} title={t('ui.events.wheel.oddsTitle')} className="max-w-md">
      <div className="flex flex-col gap-2.5">
        <p className="copy m-0 text-[17px] text-muted">{t('ui.events.wheel.oddsNote', { n: slices })}</p>
        <table className="w-full border-collapse text-[18px]">
          <thead>
            <tr className="font-pixel-sm text-[15px] text-muted">
              <th scope="col" className="px-1.5 py-1 text-left font-normal">{t('ui.events.wheel.oddsPrize')}</th>
              <th scope="col" className="px-1.5 py-1 text-left font-normal">{t('ui.events.wheel.oddsSlices')}</th>
              <th scope="col" className="px-1.5 py-1 text-left font-normal">{t('ui.events.wheel.oddsChance')}</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((p, i) => (
              <tr key={i} className="border-t-2 border-line">
                <td className="px-1.5 py-1">
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center">
                      <RewardIcon reward={p.reward} data={data} size={32} />
                    </span>
                    {rewardName(p.reward, data)}
                  </span>
                </td>
                <td className="px-1.5 py-1 tabular-nums">{p.count}</td>
                <td className="px-1.5 py-1 tabular-nums">
                  {pct(chances[i]!)}
                  {p.count > 1 && (
                    <small className="block font-pixel-sm text-[13px] text-muted">
                      {t('ui.events.wheel.oddsEach', { chance: pct(chances[i]! / p.count) })}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

/** What the wheel gave: the prize bobbing on its rays; confetti for the big ones. */
function RewardCard({ reward, data, onClose, calm }: { reward: WheelReward | null; data: GameData; onClose: () => void; calm: boolean }) {
  const { t } = useT()
  const big = !!reward && isJackpot(reward)
  return (
    <Modal
      open={!!reward}
      onClose={onClose}
      dismissable={false}
      label={reward ? `${t('ui.events.wheel.won')} ${rewardName(reward, data)}` : undefined}
      className={big ? 'max-w-[330px] overflow-hidden bg-gradient-to-b from-gold-pale to-panel' : 'max-w-[330px] overflow-hidden'}
    >
      {reward && (
        <div className="relative grid justify-items-center gap-2 pt-1 text-center">
          <span className="ev-rays" aria-hidden />
          {big && !calm && <Confetti />}
          <span className="ev-bob relative grid h-24 w-24 place-items-center">
            <RewardIcon reward={reward} data={data} size={96} />
          </span>
          <p className="relative m-0 font-pixel-sm text-[16px] tracking-[0.1em] text-ink">
            {big ? t('ui.events.wheel.jackpot') : t('ui.events.wheel.won')}
          </p>
          <h3 className="relative m-0 text-[28px] font-normal leading-[1.05]">+{rewardName(reward, data)}</h3>
          <p className="relative m-0 mb-1 font-pixel-sm text-[16px] text-muted">
            {reward.kind === 'gold' ? t('ui.events.wheel.toMoney') : t('ui.events.wheel.toBag')}
          </p>
          <PixelButton variant="primary" className="relative w-full" onClick={onClose} autoFocus>
            {t('ui.events.wheel.nice')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}

/** A burst of square confetti behind the jackpot card. */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    const cols = ['#ffbe2e', '#f2553f', '#34c97a', '#5b8def', '#c58aff', '#ffffff']
    const ps = Array.from({ length: 70 }, () => ({
      x: 144 + (Math.random() - 0.5) * 40,
      y: 120,
      vx: (Math.random() - 0.5) * 6,
      vy: -3 - Math.random() * 5,
      c: cols[Math.floor(Math.random() * cols.length)]!,
      s: Math.random() < 0.5 ? 2 : 3,
    }))
    let f = 0
    let raf = 0
    const step = () => {
      if (f++ > 150) return
      g.clearRect(0, 0, cv.width, cv.height)
      for (const p of ps) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12
        p.vx *= 0.99
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s)
      }
      raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} width={288} height={320} className="pixelated pointer-events-none absolute left-1/2 top-0 h-[320px] w-[288px] -translate-x-1/2" aria-hidden />
}
