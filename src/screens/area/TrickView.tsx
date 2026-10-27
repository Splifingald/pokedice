// Trick or Treat (docs/29), laid out as the battle is (docs/15 §14, §28): full screen, the battle's stage on top (the
// area's picture, the ghost at its centre, its plate), then the panel: the message box, the gauge with its value and
// what the last Treat or miss added, TREAT and TRICK BALL; INFO at the foot, a small FLEE at its right. The store asks the engine for each step
// (store/run.ts); this screen only plays it, with the battle's own pieces: the Treat's timeline (the toss, the munch,
// the flee) and the battle's catch timeline with the Trick Ball (the throw, the ball on the ground, the wobbles, Gotcha!
// or the break-free), the die shown as the ball stops. Once it's over, the result card rises as a battle's does.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  failPush,
  treatRange,
  trickBand,
  trickCfg,
  trickChance,
  trickRulesDue,
  trickZoneAt,
  markTrickRulesSeen,
  type TrickBand,
  type TrickPlaced,
  type TrickStep,
  type TrickTier,
} from '@/engine'
import { fxSound } from '@/audio/sfx'
import { Die } from '@/components/Die'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { InfoButton } from '@/components/RulesModal'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import {
  NeedDie,
  TierChip,
  TRICK_AT,
  TRICK_GROUND,
  TrickGauge,
  TrickRulesModal,
  TrickSprite,
  TrickStage,
  targetLabel,
  type TrickOverlay,
} from '@/components/TrickOrTreat'
import { loadTrickBall } from '@/fx/scenes'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { TREAT_URL, treatTimeline } from '@/fx/timelines/trick'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { mutateSave, useGame, type TrickRun } from '@/store/game'
import { fleeTrick, giveTreat, leaveTrick, throwTrickBall } from '@/store/run'
import { CatchCard, Overlay, SecretAreaCard } from '@/screens/battle/VictoryView'
import { cx } from '@/theme/util'
import { PlateBox } from '@/screens/battle/Plates'
import { RunRoundGauge } from './RoundGauge'

/** What the message box says once a step has played. */
export function stepMessage(step: TrickStep, name: string): string {
  const target = targetLabel(step.need ?? 6)
  if (step.kind === 'treat')
    return step.fled ? tr('ui.trick.fledTreat', { name }) : tr('ui.trick.ate', { name, n: step.amount })
  if (step.caught) return tr('ui.trick.caught', { name })
  if (step.fled) return tr('ui.trick.fledBall', { name, die: step.die ?? 0, target })
  return tr('ui.trick.missed', { name, die: step.die ?? 0, target, n: step.amount })
}

/** What the last step did, beside the gauge's value: the Treat, or the Trick Ball's die against what it needed. */
export interface TrickReadout {
  kind: 'treat' | 'ball'
  die?: number
  need?: number
  /** Replays the die's tumble when it changes (and `roll` is on). */
  key: number
  roll: boolean
}

/** The ghost's plate, top left on the stage as a foe's in battle: name, shiny, level, types and rarity (no HP). */
export function TrickPlate({
  dex,
  level,
  tier,
  shiny,
}: {
  dex: number
  level: number
  tier: TrickTier
  shiny?: boolean
}) {
  const { t } = useT()
  const sp = useGame((s) => s.data.species[dex])
  const name = sp?.name ?? `#${dex}`
  const lv = t('ui.common.level.short', { n: level })
  return (
    <PlateBox label={t('ui.battle.foePlate', { name, level: lv })} className="left-1.5 top-1.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="min-w-0 truncate text-[20px] font-normal leading-none">{name}</b>
        {shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
        <span className="shrink-0 font-pixel-sm text-[16px] leading-none">{lv}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {sp && <TypeBadge type={sp.type1} size="sm" />}
        {sp?.type2 && <TypeBadge type={sp.type2} size="sm" />}
        <span className="origin-left scale-90">
          <TierChip tier={tier} />
        </span>
      </span>
    </PlateBox>
  )
}

/** The last step beside the gauge's value: the Treat's picture, or the die, the sign and the die it needed. */
function Readout({ r }: { r: TrickReadout }) {
  const { t } = useT()
  if (r.kind === 'treat') return <TrickSprite kind="treat" size={36} className="-my-1" />
  if (r.die == null || r.need == null) return null
  return (
    <span className="flex items-center gap-1.5 font-pixel text-[22px] leading-none text-ink">
      <Die
        type="base"
        face={{ kind: 'number', value: r.die }}
        size={36}
        rollKey={r.roll ? `tt-${r.key}` : undefined}
        label={t('ui.catch.die', { value: r.die })}
      />
      <span aria-hidden>{r.die >= r.need ? '≥' : '<'}</span>
      <NeedDie need={r.need} size={22} />
    </span>
  )
}

export interface TrickScreenProps {
  areaId: string | null
  dex: number
  level: number
  tier: TrickTier
  shiny?: boolean
  band: TrickBand
  /** The gauge as shown (it fills when the Treat is eaten, or the ball breaks open). */
  gauge: number
  delta: { n: number; key: number } | null
  readout: TrickReadout | null
  message: string
  /** A step is playing: both buttons wait. */
  busy: boolean
  /** Caught or fled: no more Treats or Balls. */
  ended: boolean
  overlay: TrickOverlay | null
  rest: 'float' | 'caught' | 'fled'
  /** No idle float (calm). */
  still?: boolean
  /** The gauge jumps (animations off). */
  instant?: boolean
  onTreat: () => void
  onBall: () => void
  onInfo: () => void
  /** FLEE: leave the ghost be, back on the trail. */
  onFlee: () => void
  /** The screen's full height (the game); the kitchen sink shows it in a box. */
  fill?: boolean
  /** The result card, over the panel. */
  children?: ReactNode
}

/** The screen itself, from what TrickView (or the kitchen sink) gives it. */
export function TrickScreen(p: TrickScreenProps) {
  const { t } = useT()
  const cfg = trickCfg(useGame((s) => s.data))
  const name = useGame((s) => s.data.species[p.dex]?.name) ?? `#${p.dex}`
  const { min, max } = treatRange(cfg)
  const here = trickZoneAt(p.band, p.gauge)
  const odds = here ? Math.round(trickChance(here.zone.need) * 100) : 0
  const heading = t('ui.trick.stage', { name, level: p.level })
  const off = p.busy || p.ended
  const id = useId()
  return (
    // Wide screens: the battle's column, as big as the height allows with the panel still in view.
    <div className="mx-auto w-full lg:p-4">
      <section
        aria-label={t('ui.trick.title')}
        className={cx(
          'mx-auto flex w-full max-w-[max(300px,min(560px,calc((100dvh_-_330px)_*_1.5)))] flex-col lg:max-w-[max(560px,min(700px,calc((100dvh_-_380px)_*_1.5)))]',
          p.fill && 'min-h-[100dvh] lg:min-h-0',
        )}
      >
        {p.fill && <h1 className="sr-only">{t('ui.trick.title')}</h1>}
        <div className="shadow-ledge">
          <TrickStage
            areaId={p.areaId}
            dex={p.dex}
            shiny={p.shiny}
            overlay={p.overlay}
            rest={p.rest}
            still={p.still}
            label={heading}
          >
            {p.rest !== 'fled' && <TrickPlate dex={p.dex} level={p.level} tier={p.tier} shiny={p.shiny} />}
          </TrickStage>
        </div>
        <div
          className="flex flex-1 flex-col gap-2 px-3 pt-3"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <p
            className="pixel-dialogue m-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]"
            aria-live="polite"
          >
            {p.message}
          </p>
          <TrickGauge
            band={p.band}
            value={p.gauge}
            delta={p.delta}
            instant={p.instant}
            lead={p.readout ? <Readout r={p.readout} /> : undefined}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <PixelButton
                size="lg"
                className="w-full whitespace-nowrap px-2"
                disabled={off}
                onClick={p.onTreat}
                aria-describedby={`${id}-treat`}
              >
                <TrickSprite kind="treat" size={28} />
                {t('ui.trick.treat')}
              </PixelButton>
              <span
                id={`${id}-treat`}
                className="text-center font-pixel-sm text-[16px] leading-tight text-muted"
              >
                {t('ui.trick.treatNote', { min, max })}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <PixelButton
                variant="primary"
                size="lg"
                className="w-full whitespace-nowrap px-2"
                disabled={off}
                onClick={p.onBall}
                aria-describedby={`${id}-ball`}
              >
                <TrickSprite kind="ball" size={28} />
                {t('ui.trick.ball')}
              </PixelButton>
              <span
                id={`${id}-ball`}
                className="flex items-center justify-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-muted"
              >
                {here && (
                  <>
                    <NeedDie need={here.zone.need} size={18} className="text-ink" />
                    {t('ui.trick.ballOdds', { pct: odds, push: failPush(cfg) })}
                  </>
                )}
              </span>
            </div>
          </div>
          {/* FLEE stays small, beside INFO: the way out for those who'd rather skip it, never the main action. */}
          <div className="mt-auto flex items-center gap-2 pt-1">
            <InfoButton name={t('ui.trick.title')} onClick={p.onInfo} className="min-w-0 flex-1" />
            <PixelButton size="sm" className="shrink-0" disabled={off} onClick={p.onFlee}>
              <PixelIcon name="run" size={16} />
              {t('ui.enc.flee')}
            </PixelButton>
          </div>
        </div>
      </section>
      {p.children}
    </div>
  )
}

/** The result's body: the catch as a battle's card shows it (with the Trick Ball), or the ghost gone; secret areas. */
export function TrickRecapBody({
  dex,
  level,
  shiny,
  end,
  placed,
  isNew,
  replacedLevel,
  secrets = [],
}: {
  dex: number
  level: number
  shiny?: boolean
  end: 'caught' | 'fled'
  placed?: TrickPlaced
  isNew?: boolean
  replacedLevel?: number
  /** Names of the secret areas this catch opened. */
  secrets?: string[]
}) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-2">
      {end === 'caught' ? (
        <CatchCard
          dex={dex}
          level={level}
          shiny={!!shiny}
          isNew={isNew}
          ball={<TrickSprite kind="ball" size={40} />}
          where={t(`ui.trick.placed.${placed ?? 'box'}`, { level: replacedLevel ?? 0 })}
        />
      ) : (
        <div className="flex items-center gap-3 bg-paper p-2 shadow-ring">
          <SpriteImg dex={dex} size={72} shiny={shiny} className="shrink-0 opacity-50 grayscale" />
          <p className="copy m-0 text-lg text-muted">{t('ui.trick.fledText')}</p>
        </div>
      )}
      {secrets.map((s) => (
        <SecretAreaCard key={s} name={s} />
      ))}
    </div>
  )
}

/** The result card, risen over the panel as a battle's: the title, the recap, the round gauge and CONTINUE. */
export function TrickRecap({
  name,
  onContinue,
  ...body
}: Parameters<typeof TrickRecapBody>[0] & { name: string; onContinue: () => void }) {
  const { t } = useT()
  const title =
    body.end === 'caught' ? t('ui.trick.caughtTitle', { name }) : t('ui.trick.fledTitle', { name })
  return (
    <Overlay
      label={title}
      footer={
        <div className="flex flex-col gap-2">
          <RunRoundGauge className="px-1" />
          <PixelButton variant="primary" size="lg" className="w-full" onClick={onContinue}>
            {t('ui.common.continue')}
          </PixelButton>
        </div>
      }
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[28px] font-normal leading-none">{title}</h2>
        <span className="min-w-0 truncate text-lg text-muted">{t('ui.trick.title')}</span>
      </div>
      <TrickRecapBody {...body} />
    </Overlay>
  )
}

export function TrickView() {
  useHoldFullscreen()
  const { t } = useT()
  const run = useGame((s) => s.run)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const trick = run.trick as TrickRun
  const { level, calm } = useMotion()
  const st = trick.state
  const name = data.species[st.dex]?.name ?? `#${st.dex}`
  const last = trick.last
  const [gauge, setGauge] = useState(st.gauge)
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(() =>
    last && last.amount > 0 ? { n: last.amount, key: 0 } : null,
  )
  const [readout, setReadout] = useState<TrickReadout | null>(() =>
    last ? { kind: last.kind, die: last.die, need: last.need, key: 0, roll: false } : null,
  )
  const [message, setMessage] = useState(() =>
    last ? stepMessage(last, name) : t('ui.trick.appears', { name }),
  )
  const [overlay, setOverlay] = useState<TrickOverlay | null>(null)
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState<'unlock' | 'info' | null>(() =>
    save && trickRulesDue(save, data) ? 'unlock' : null,
  )
  const seq = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const band = trickBand(trickCfg(data), st.tier)
  const end = st.end
  const done = !!end && !busy
  const short = level === 'short'
  const foeKey = spriteKey(st.dex, false, st.shiny)
  const ghost = () => loadSprite(st.dex, false, st.shiny)

  /** The step has played to its end: the words, the gauge and the buttons as the engine left them. */
  const settle = (step: TrickStep) => {
    if (!alive.current) return
    setGauge(step.to)
    setMessage(stepMessage(step, name))
    setBusy(false)
    // Still there: the page's sprite takes over again. Over: the timeline's last frame stays.
    if (!step.state.end) setOverlay(null)
  }

  const play = (step: TrickStep) => {
    const key = ++seq.current
    setBusy(true)
    setDelta(null)
    setReadout(null)
    const fill = () => {
      setGauge(step.to)
      if (step.amount > 0) setDelta({ n: step.amount, key })
    }
    if (step.kind === 'treat') {
      setReadout({ kind: 'treat', key, roll: false })
      setOverlay({
        timeline: treatTimeline({ own: '', foe: foeKey, at: TRICK_AT, fled: step.fled, short }),
        ready: Promise.all([ghost(), loadItemSprite(TREAT_URL)]),
        label: t('ui.trick.stage', { name, level: st.level }),
        hud: {
          beat: (b) => {
            if (b === 'ate') setMessage(stepMessage({ ...step, fled: false }, name))
            else if (b === 'fill') fill()
            else if (b === 'fled') setMessage(stepMessage(step, name))
          },
        },
        onEnd: () => settle(step),
      })
      return
    }
    // A Trick Ball: the battle's catch, with the Trick Ball, at the ghost's spot. A miss that leaves it there is
    // Capture Luck's stay ("!" and two hops: restless); one that pushes it into the flee zone runs off as a wild one.
    setMessage(t('ui.trick.throwing'))
    let out = false
    setOverlay({
      timeline: catchTimeline({
        own: '',
        foe: foeKey,
        ball: 'trick',
        caught: !!step.caught,
        roll: { total: step.die ?? 0, need: step.need ?? 6, caught: !!step.caught },
        short,
        stays: !step.caught && !step.fled,
        awake: true,
        ghost: true,
        at: TRICK_AT,
        ground: TRICK_GROUND,
      }),
      ready: Promise.all([ghost(), loadTrickBall()]),
      label: t('ui.trick.throwing'),
      hud: {
        // The die and the result show together as the ball stops, never before (the wobbles would be spoilt).
        catchResult: (caught) => {
          out = true
          setReadout({ kind: 'ball', die: step.die, need: step.need, key, roll: level !== 'off' })
          setMessage(stepMessage({ ...step, fled: false }, name))
          if (!caught) {
            fxSound('trick.fill')
            fill()
          }
        },
        show: (_, on) => {
          // After the result, the ghost leaving the stage is the flee.
          if (out && !on && step.fled) {
            fxSound('trick.flee')
            setMessage(stepMessage(step, name))
          }
        },
      },
      onEnd: () => settle(step),
    })
  }

  const act = (f: () => TrickStep | null) => {
    if (busy || end) return
    const step = f()
    if (step) play(step)
  }

  const closeRules = () => {
    if (rules === 'unlock') mutateSave((s) => (s.trickOrTreat?.rulesSeen ? null : markTrickRulesSeen(s)))
    setRules(null)
  }

  return (
    <TrickScreen
      areaId={run.areaId}
      dex={st.dex}
      level={st.level}
      tier={st.tier}
      shiny={st.shiny}
      band={band}
      gauge={gauge}
      delta={delta}
      readout={readout}
      message={message}
      busy={busy}
      ended={!!end}
      overlay={overlay}
      rest={end === 'caught' ? 'caught' : end === 'fled' ? 'fled' : 'float'}
      still={calm}
      instant={level === 'off'}
      onTreat={() => act(giveTreat)}
      onBall={() => act(throwTrickBall)}
      onInfo={() => setRules('info')}
      onFlee={() => {
        if (!busy && !end) fleeTrick()
      }}
      fill
    >
      <TrickRulesModal
        open={rules != null}
        onClose={closeRules}
        onGo={rules === 'unlock' ? closeRules : undefined}
      />
      {done && (
        <TrickRecap
          name={name}
          dex={st.dex}
          level={st.level}
          shiny={st.shiny}
          end={end}
          placed={trick.caught?.placed}
          isNew={trick.caught?.isNew}
          replacedLevel={trick.caught?.replacedLevel}
          secrets={(trick.caught?.secrets ?? []).map((id) => data.areas.find((a) => a.id === id)?.name ?? id)}
          onContinue={leaveTrick}
        />
      )}
    </TrickScreen>
  )
}
