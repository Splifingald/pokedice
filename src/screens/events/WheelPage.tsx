// The Fortune Wheel's page (docs/18, the Visual Lab's mockup): the tickets held and the next free one, the jackpot of
// the moment, the wheel, the blue Info button with every prize's real odds, SPIN (a ticket) and a ticket to buy. The
// prize is drawn before the wheel turns (store/wheel.ts) and paid when it stops, then a card says what it was.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  jackpotIndex,
  jackpotStage,
  prizeChances,
  roulettePrizes,
  ticketRules,
  wheelSlices,
  type GameData,
  type WheelPrize,
  type WheelReward,
} from '@/engine'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { spriteUrlFor } from '@/components/SpriteImg'
import { isJackpot, WheelStage, type WheelMotion, type WheelSlice } from '@/fx/wheel'
import { useT } from '@/i18n/react'
import { countdown, money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { mutateSave, pushToast, useGame } from '@/store/game'
import { buyWheelTicket, collectWheelPrize, spinWheel, useWheelTickets } from '@/store/wheel'
import { CashChip } from './live'
import { EventRulesModal, RewardIcon, rewardName } from './shared'

const toSlice = (p: WheelPrize, data: GameData): WheelSlice => {
  const r = p.reward
  if (r.kind === 'gold') return { reward: r, label: money(r.amount) }
  if (r.kind === 'pokemon') return { reward: r, sprite: spriteUrlFor(r.dex, 'front', !!r.shiny), label: '' }
  return { reward: r, sprite: data.items[r.key]?.spriteUrl ?? undefined, label: r.qty > 1 ? `×${r.qty}` : '' }
}

const pct = (n: number) => `${+n.toFixed(2)} %`

export function WheelPage() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const pending = save?.events?.wheelPending
  const wheel = data.config.events.wheel
  const stage = save ? jackpotStage(save, wheel) : 0
  const prizes = useMemo(() => roulettePrizes(wheel, stage), [wheel, stage])
  const order = useMemo(() => wheelSlices(prizes), [prizes])
  const slices = useMemo(() => order.map((i) => toSlice(prizes[i]!, data)), [order, prizes, data])
  const jackpot = wheel.jackpot?.[stage]
  const { price, everyMs } = ticketRules(wheel)
  const { level, calm } = useMotion()
  const motion: WheelMotion = calm ? 'off' : level
  const tickets = useWheelTickets()
  const [spinning, setSpinning] = useState(false)
  const [won, setWon] = useState<WheelReward | null>(null)
  const [odds, setOdds] = useState(false)
  // Its rules once, the first time the page opens since the wheel takes tickets (a new player saw them on unlocking).
  const [rules, setRules] = useState(() => !save?.events?.wheelRulesSeen)

  const box = useRef<HTMLDivElement>(null)
  const disc = useRef<HTMLCanvasElement>(null)
  const fx = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<HTMLSpanElement>(null)
  const stageRef = useRef<WheelStage | null>(null)
  const empty = tickets.known && tickets.tickets <= 0

  // One stage for the page's life; the slices, the motion and the tickets are passed to it as they change.
  useEffect(() => {
    if (!box.current || !disc.current || !fx.current || !pointer.current) return
    const s = new WheelStage({ box: box.current, wheel: disc.current, fx: fx.current, pointer: pointer.current }, slices, motion)
    s.start(empty)
    stageRef.current = s
    const onResize = () => s.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      s.stop()
      stageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; the effects below keep it current
  }, [])
  useEffect(() => stageRef.current?.setSlices(slices), [slices])
  useEffect(() => stageRef.current?.setMotion(motion), [motion])
  useEffect(() => {
    if (!spinning) stageRef.current?.setSpun(empty)
  }, [empty, spinning])
  // A prize still waiting that this page didn't spin for (it came with the cloud save): paid now.
  useEffect(() => {
    if (pending && !spinning) collectWheelPrize()
  }, [pending, spinning])

  const closeRules = () => {
    setRules(false)
    mutateSave((s) => (s.events?.wheelRulesSeen ? null : { ...s, events: { ...s.events, wheelRulesSeen: true } }))
  }

  const spin = async () => {
    if (spinning || !stageRef.current) return
    setSpinning(true)
    const res = spinWheel()
    if (!res.ok) {
      setSpinning(false)
      if (res.reason === 'tickets') pushToast(t('ui.events.wheel.noTickets'), 'info')
      return
    }
    await stageRef.current?.spin(res.slice)
    collectWheelPrize()
    setWon(res.reward)
    setSpinning(false)
  }

  const buy = () => {
    if (buyWheelTicket()) pushToast(t('ui.events.wheel.bought'), 'good')
  }

  const live = prizes.filter((p) => p.count > 0 && p.odds > 0)
  const wheelLabel = t('ui.events.wheel.wheelLabel', {
    n: order.length,
    prizes: live.map((p) => `${p.count} × ${rewardName(p.reward, data)}`).join(', '),
  })
  const full = tickets.known && tickets.tickets >= tickets.cap
  const canBuy = tickets.known && !full && (save?.gold ?? 0) >= price && !spinning
  const nextLine = !tickets.known
    ? t('ui.events.wheel.waitTime')
    : tickets.msLeft == null
      ? t('ui.events.wheel.full')
      : t('ui.events.wheel.nextTicket', { time: countdown(tickets.msLeft) })
  return (
    // The rays and the sparks reach past the wheel: clipped at the sides so a phone never scrolls sideways, and the
    // rows above and below it stacked over them (`relative z-[1]`) so they never cover a button.
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-1.5 overflow-x-clip">
      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2">
        <Chip tone="dark" className="gap-1.5 text-[17px]">
          <PixelIcon name="ticket" size={20} />
          <span className="tabular-nums" aria-label={t('ui.events.wheel.ticketsLabel', { n: tickets.known ? tickets.tickets : 0, cap: tickets.known ? tickets.cap : 0 })}>
            {tickets.known ? `${tickets.tickets}/${tickets.cap}` : '…'}
          </span>
        </Chip>
        {jackpot && (
          <Chip tone="gold" className="gap-1 text-[16px]">
            <span className="grid h-6 w-6 place-items-center overflow-hidden" aria-hidden>
              <RewardIcon reward={jackpot.reward} data={data} size={jackpot.reward.kind === 'pokemon' ? 32 : 24} />
            </span>
            {t('ui.events.wheel.jackpotNow', { prize: rewardName(jackpot.reward, data), chance: pct(jackpot.odds) })}
          </Chip>
        )}
      </div>
      <div ref={box} className="ev-wheel">
        <span className="ev-wheel-rays" aria-hidden />
        <span ref={pointer} className="ev-pointer" aria-hidden />
        <canvas ref={disc} className="ev-wheel-disc" width={288} height={288} role="img" aria-label={wheelLabel} />
        <canvas ref={fx} className="ev-wfx" aria-hidden />
      </div>
      <div className="relative z-[1] grid grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] items-stretch gap-2.5">
        <button type="button" className="ev-info" onClick={() => setOdds(true)} aria-label={t('ui.events.wheel.infoLabel')}>
          {t('ui.events.wheel.info')}
        </button>
        {empty && !spinning ? (
          <p className="m-0 grid content-center gap-[3px] bg-well p-2 text-center shadow-ring-line">
            <b className="text-[20px] font-normal leading-none">{t('ui.events.wheel.noTickets')}</b>
            <small className="font-pixel-sm text-[15px] leading-none text-muted">{nextLine}</small>
          </p>
        ) : (
          <PixelButton
            variant="primary"
            className="min-h-[64px] text-[26px]"
            disabled={spinning || !tickets.known}
            onClick={() => void spin()}
          >
            {tickets.known ? t('ui.events.wheel.spin') : t('ui.events.wheel.waitTime')}
          </PixelButton>
        )}
      </div>
      <PixelButton className="relative z-[1]" disabled={!canBuy} onClick={buy}>
        <PixelIcon name="ticket" size={20} />
        {t('ui.events.wheel.buy', { price: money(price) })}
      </PixelButton>
      <p className="m-0 text-center font-pixel-sm text-[15px] text-muted">
        {t('ui.events.wheel.tip', { hours: Math.round((everyMs / 3_600_000) * 10) / 10, cap: tickets.known ? tickets.cap : '' })}
      </p>
      <OddsSheet open={odds} onClose={() => setOdds(false)} prizes={prizes} jackpot={jackpotIndex(wheel, stage)} data={data} slices={order.length} />
      <RewardCard reward={won} data={data} onClose={() => setWon(null)} calm={motion === 'off'} />
      <EventRulesModal id="wheel" open={rules && !won} onClose={closeRules} />
    </div>
  )
}

/** Every prize, how many slices it has and its real chance a spin. */
function OddsSheet({
  open,
  onClose,
  prizes,
  jackpot,
  data,
  slices,
}: {
  open: boolean
  onClose: () => void
  prizes: WheelPrize[]
  /** The jackpot's index in `prizes` (−1: none). */
  jackpot: number
  data: GameData
  slices: number
}) {
  const { t } = useT()
  const chances = prizeChances(prizes)
  const rows = prizes.map((p, i) => ({ p, i })).filter(({ p }) => p.count > 0 && p.odds > 0)
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
            {rows.map(({ p, i }) => (
              <tr key={i} className={i === jackpot ? 'border-t-2 border-line bg-gold-pale' : 'border-t-2 border-line'}>
                <td className="px-1.5 py-1">
                  <span className="flex items-center gap-1.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center">
                      <RewardIcon reward={p.reward} data={data} size={32} />
                    </span>
                    {rewardName(p.reward, data)}
                    {i === jackpot && <Chip tone="gold">{t('ui.events.wheel.jackpotTag')}</Chip>}
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
          <h3 className="relative m-0 inline-flex items-center gap-2 text-[28px] font-normal leading-[1.05]">
            +{rewardName(reward, data)}
            {reward.kind === 'gold' && <CashChip />}
          </h3>
          <p className="relative m-0 mb-1 font-pixel-sm text-[16px] text-muted">
            {t(reward.kind === 'gold' ? 'ui.events.wheel.toMoney' : reward.kind === 'pokemon' ? 'ui.events.wheel.toTeam' : 'ui.events.wheel.toBag')}
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
