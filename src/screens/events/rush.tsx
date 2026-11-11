// Type Rush (docs/71 §3; docs/15 §53), what players see: the type's art over the picture (its die, its badge, +20 %),
// the reward gauge with its rewards along it, the quest cards (one step at a time, the closest to done first), and the
// pop-up that opens from Home's square: opening it validates what's done — the steps tick green, their points fill
// the gauge, the rewards reached pop out and land — then INFO for the rules. After the end, a last pop-up settles what
// was done in time. Every rule and number is the engine's (engine/typeRush.ts).
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  liveLeft,
  rushCards,
  rushProgressOf,
  rushTotalPoints,
  rushType,
  type LiveEvent,
  type PokeType,
  type RushCard,
  type RushQuestKind,
  type RushValidation,
  type SaveData,
} from '@/engine'
import { CalendarRewardIcon, useRewardText } from '@/components/Calendar'
import { PixelIcon, type IconName } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton, RulesModal, type RuleRow } from '@/components/RulesModal'
import { useMyTurn, useOnScreen } from '@/components/popupTurn'
import { useT } from '@/i18n/react'
import { comboName, typeName } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import { useLive } from '@/store/live'
import { openRush, rushesToSettle } from '@/store/typeRush'
import { cx } from '@/theme/util'
import { LiveBadge, LiveGauge, LivePicture, liveName, liveTime } from './live'
import { RushArt } from './rushBits'
export { RushArt, RushTag, rushSub } from './rushBits'
import { bannerUrl } from './shared'

const HOUR = 3_600_000
const pct = (m: number) => Math.round((m - 1) * 100)

/** Each quest kind's icon. */
const KIND_ICON: Record<RushQuestKind, IconName> = {
  catch: 'ball',
  ko: 'sword',
  evolve: 'sparkle',
  damage: 'dice',
  hatch: 'heart',
  combo: 'star',
  raid: 'trophy',
}

/** A quest's line: "Catch Fire Pokémon", "Land a Full House with Fire Pokémon". */
export function useQuestText() {
  const { t } = useT()
  return (card: Pick<RushCard, 'quest'>, type: PokeType) => {
    const q = card.quest
    if (q.kind === 'combo' && q.combo && q.combo !== 'any')
      return t('ui.rush.quest.comboOf', { combo: comboName(q.combo), type: typeName(type) })
    return t(`ui.rush.quest.${q.kind}`, { type: typeName(type) })
  }
}

/** The reward gauge: Rush points along a bar, each reward a tile at its mark, those given ticked; `fill` animates it. */
export function RushGauge({
  e,
  points,
  given,
  popping = [],
}: {
  e: LiveEvent
  points: number
  given: number
  /** Rewards (their index) popping out now. */
  popping?: number[]
}) {
  const { t } = useT()
  const text = useRewardText()
  const rows = e.rush.gauge
  const max = Math.max(1, rows[rows.length - 1]?.at ?? rushTotalPoints(e))
  const share = Math.min(1, points / max)
  return (
    <section
      aria-label={t('ui.rush.gaugeLabel', { n: points, max })}
      className="grid gap-1.5"
      data-testid="rush-gauge"
    >
      <div className="flex items-baseline justify-between gap-2 leading-none">
        <b className="text-[19px] font-normal">{t('ui.rush.gauge')}</b>
        <span className="font-pixel-sm text-[16px] text-muted">
          {t('ui.rush.points', { n: points, max })}
        </span>
      </div>
      <div className="relative h-[66px]">
        <span className="rush-bar absolute inset-x-0 top-[26px] block h-3" aria-hidden>
          <i style={{ width: `${share * 100}%` }} />
        </span>
        <ul className="m-0 list-none p-0">
          {rows.map((row, i) => {
            const got = i < given
            return (
              <li
                key={`${row.at}-${i}`}
                className={cx('rush-tile', got && 'got', popping.includes(i) && 'pop')}
                style={{ left: `${Math.min(100, (row.at / max) * 100)}%` }}
                title={`${row.at} · ${text(row.reward)}`}
              >
                <span className="sr-only">
                  {t(got ? 'ui.rush.rewardGot' : 'ui.rush.rewardAt', { n: row.at, reward: text(row.reward) })}
                </span>
                <CalendarRewardIcon reward={row.reward} size={22} />
                {got && <PixelIcon name="check" size={12} className="rush-got" />}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** A quest's card: its icon, its line, the counter on a bar, its points; ticked green as it's validated. */
export function RushQuestCard({ card, type, ticked }: { card: RushCard; type: PokeType; ticked?: boolean }) {
  const { t } = useT()
  const line = useQuestText()(card, type)
  const steps = card.quest.steps.length
  const share = Math.min(1, card.count / card.target)
  const count =
    card.quest.kind === 'damage' ? (n: number) => n.toLocaleString('en') : (n: number) => String(n)
  return (
    <li
      className={cx('rush-card', card.ready && 'ready', ticked && 'ticked', card.finished && 'finished')}
      data-testid="rush-quest"
      aria-label={t(card.finished ? 'ui.rush.cardDone' : 'ui.rush.cardLabel', {
        quest: line,
        count: count(card.count),
        target: count(card.target),
        points: card.points,
      })}
    >
      <span className="rush-card-icon" aria-hidden>
        {ticked || card.finished ? (
          <PixelIcon name="check" size={20} />
        ) : (
          <PixelIcon name={KIND_ICON[card.quest.kind]} size={20} />
        )}
      </span>
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1" aria-hidden>
        <span className="flex items-start gap-2 leading-none">
          <b className="min-w-0 flex-1 text-[18px] font-normal leading-tight">{line}</b>
          <span className="shrink-0 font-pixel-sm text-[16px]">
            {card.finished
              ? t('ui.rush.done')
              : `${count(Math.min(card.count, card.target))} / ${count(card.target)}`}
          </span>
        </span>
        <span className="rush-card-bar block h-1.5">
          <i style={{ width: `${(card.finished ? 1 : share) * 100}%` }} />
        </span>
        <span className="flex items-center justify-between font-pixel-sm text-[15px] leading-none text-muted">
          <span>{steps > 1 ? t('ui.rush.step', { n: card.step + 1, total: steps }) : ' '}</span>
          <span className={cx('rush-pts', ticked && 'on')}>{t('ui.rush.plus', { n: card.points })}</span>
        </span>
      </span>
    </li>
  )
}

/** Type Rush's rules (docs/15 §20: INFO at the foot of its pop-up), with its numbers. */
export function useRushRules(e: LiveEvent): RuleRow[] {
  const { t } = useT()
  const type = typeName(rushType(e))
  return [
    {
      icon: 'sword',
      title: t('ui.rush.rules.boost.title', { type, pct: pct(e.rush.boost) }),
      text: t('ui.rush.rules.boost.text', { type }),
    },
    { icon: 'star', title: t('ui.rush.rules.quests.title'), text: t('ui.rush.rules.quests.text', { type }) },
    { icon: 'gift', title: t('ui.rush.rules.gauge.title'), text: t('ui.rush.rules.gauge.text') },
    { icon: 'calendar', title: t('ui.rush.rules.end.title'), text: t('ui.rush.rules.end.text') },
  ]
}

export function RushRulesModal({ e, open, onClose }: { e: LiveEvent; open: boolean; onClose: () => void }) {
  const rules = useRushRules(e)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={liveName(e)}
      picture={{ src: bannerUrl(e.banner) }}
      icon="star"
      rules={rules}
    />
  )
}

/** The animation's steps: the ticks, the gauge filling, the rewards popping out, then still. */
type Phase = 'tick' | 'fill' | 'reward' | 'done'
const PHASE_MS: Record<Exclude<Phase, 'done'>, number> = { tick: 900, fill: 1000, reward: 1300 }

/**
 * Opening a Type Rush: what was done is validated as it opens (once, in one commit), then played: the cards as they
 * were with the ready ones ticking green, the points filling the gauge, the rewards reached popping out, then the
 * cards as they are now. A tap skips to the end; without motion it is the end at once.
 */
/**
 * What the last opening validated, by event: kept outside the pop-up, so the pop-up remounting (its queue's turn
 * passing to another holder once nothing is due) doesn't lose what it has to play. Cleared as it closes.
 */
const usePlayed = create<{
  id: string | null
  v: { res: RushValidation; before: RushCard[]; given: number } | null
}>(() => ({ id: null, v: null }))

function useValidation(e: LiveEvent, open: boolean) {
  const { level } = useMotion()
  const played = usePlayed((x) => (x.id === e.id ? x.v : null))
  const [phase, setPhase] = useState<Phase>('done')
  useEffect(() => {
    if (!open || usePlayed.getState().id === e.id) return
    const save = useGame.getState().save as SaveData | null
    if (!save) return
    const before = rushCards(save, e)
    const given = rushProgressOf(save, e).given
    const res = openRush(e)
    // Opened once, validated or not: it doesn't validate again until it's closed and opened anew.
    usePlayed.setState({ id: e.id, v: res ? { res, before, given } : null })
    if (res) setPhase(level === 'off' ? 'done' : 'tick')
  }, [open, e, level])
  useEffect(() => {
    if (phase === 'done') return
    const next: Phase =
      phase === 'tick' ? 'fill' : phase === 'fill' && played?.res.rewards.length ? 'reward' : 'done'
    const timer = setTimeout(() => setPhase(next), PHASE_MS[phase] / (level === 'short' ? 2 : 1))
    return () => clearTimeout(timer)
  }, [phase, played, level])
  return { v: played, phase, skip: () => setPhase('done') }
}

/** The pop-up closed: its next opening validates again. */
export const forgetRushPlay = () => usePlayed.setState({ id: null, v: null })

/**
 * The Type Rush pop-up (from Home's square, its first turn in the queue, or after its end): the picture with its type,
 * the time left, the gauge, the quests, what arrived, INFO, OK.
 */
export function RushModal({
  e,
  open,
  onClose,
  ended,
}: {
  e: LiveEvent
  open: boolean
  onClose: () => void
  /** The last pop-up, after the end: no time left, its own title. */
  ended?: boolean
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const { now } = useLive(1000)
  const text = useRewardText()
  const [info, setInfo] = useState(false)
  const { v, phase, skip } = useValidation(e, open)
  const close = () => {
    forgetRushPlay()
    onClose()
  }
  if (!save) return null
  const type = rushType(e)
  const p = rushProgressOf(save, e)
  const playing = phase !== 'done' && !!v
  // While it plays, the cards and the gauge as they were; then as they are.
  const cards = playing && phase === 'tick' ? v.before : rushCards(save, e)
  const ticked = new Set(playing && phase === 'tick' ? v.res.ticks.map((x) => x.questId) : [])
  const points = playing && phase === 'tick' ? v.res.before : p.points
  const given = playing && phase !== 'reward' ? v.given : p.given
  const popping = phase === 'reward' && v ? v.res.rewards.map((r) => r.index) : []
  const arrived = v && (phase === 'reward' || phase === 'done') ? v.res.rewards : []
  const left = now != null ? liveLeft(e, now) : null
  const name = liveName(e)
  return (
    <>
      <Modal
        open={open && !info}
        onClose={close}
        title={ended ? t('ui.rush.endedTitle', { name }) : name}
        className="max-w-md"
      >
        {/* A tap anywhere skips what's playing (the buttons keep theirs). */}
        <div className="flex flex-col gap-3" onClick={playing ? skip : undefined} data-testid="rush-modal">
          <span className="relative -mx-4 block h-[112px] shadow-[0_3px_0_rgb(var(--c-edge)),0_-2px_0_rgb(var(--c-edge))]">
            <LivePicture e={e} className="absolute inset-0">
              <RushArt e={e} big />
            </LivePicture>
            {!ended && <LiveBadge label="ui.live.liveEvent" className="absolute left-2.5 top-2.5" />}
          </span>
          {ended ? (
            <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.rush.endedLine')}</p>
          ) : (
            left && (
              <div className="grid gap-1.5">
                <p className="m-0 font-pixel-sm text-[16px] leading-none text-muted">
                  {t('ui.rush.boostLine', { type: typeName(type), pct: pct(e.rush.boost) })} ·{' '}
                  {t('ui.live.endsIn', { time: liveTime(left.ms) })}
                </p>
                <LiveGauge share={left.share} hot={left.ms < 3 * HOUR} className="lv-gauge-light" />
              </div>
            )
          )}
          <RushGauge e={e} points={points} given={given} popping={popping} />
          {arrived.length > 0 && (
            <ul
              className="rush-arrived m-0 grid list-none gap-1 p-0"
              aria-live="polite"
              data-testid="rush-arrived"
            >
              {arrived.map((r) => (
                <li key={r.index} className="flex items-center gap-2">
                  <CalendarRewardIcon reward={r.row.reward} size={20} />
                  <span className="text-[17px] leading-none">
                    {t('ui.rush.received', { reward: text(r.row.reward) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ul className="m-0 grid list-none gap-1.5 p-0" aria-label={t('ui.rush.questsLabel')}>
            {cards.map((c) => (
              <RushQuestCard key={c.quest.id} card={c} type={type} ticked={ticked.has(c.quest.id)} />
            ))}
          </ul>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 pt-1">
            <InfoButton compact name={name} onClick={() => setInfo(true)} />
            <PixelButton variant="primary" onClick={close}>
              {t('ui.common.ok')}
            </PixelButton>
          </div>
        </div>
      </Modal>
      <RushRulesModal e={e} open={open && info} onClose={() => setInfo(false)} />
    </>
  )
}

/**
 * The last pop-up of a Type Rush that ended with something done in time and never validated (docs/71 §3.6), on its
 * turn in the one-time queue, one ended run after another.
 */
export function RushEndPopup() {
  const turn = useMyTurn('rushEnd')
  const save = useGame((s) => s.save)
  const [shown, setShown] = useState<LiveEvent | null>(null)
  // Worked out again as the save changes (validating one takes it off the list).
  const next = save ? (rushesToSettle()[0] ?? null) : null
  const e = shown ?? next
  const open = !!e && (turn || !!shown)
  useOnScreen('rushEnd', open)
  useEffect(() => {
    if (turn && next && !shown) setShown(next)
  }, [turn, next, shown])
  if (!e) return null
  return <RushModal key={e.id} e={e} open={open} onClose={() => setShown(null)} ended />
}

export { RushBoostChip } from '@/components/RushBoostChip'
