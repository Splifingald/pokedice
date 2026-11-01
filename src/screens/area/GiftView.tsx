// The Gift card (docs/61 §4.0, §4.2), laid out as the battle is (docs/15 §14, §45): full screen, the battle's stage on
// top (the area's picture, the present at its centre, its plate), then the panel: the message box, the level gauge,
// OPEN (with what it gives now) and MAKE IT BIGGER (red, with the next tap's break chance); INFO at the foot. A boss's
// present (Evergreen Hill's Delibird) offers MAKE IT BIGGER alone, no odds, no INFO. The store asks the engine for each
// step (store/run.ts); this screen only plays it on the present's timelines (fx/timelines/present.ts). Opened, the
// result card rises as a battle's does; broken or burst, FIGHT! leads into the battle with what came out.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  giftBreakChance,
  giftCardRulesDue,
  giftCfg,
  giftRewardAt,
  markGiftCardRulesSeen,
  MONEY,
  type Encounter,
  type GameData,
  type GiftItem,
  type GiftState,
} from '@/engine'
import { playCry } from '@/audio/cries'
import {
  GiftGauge,
  GiftPlate,
  GiftRulesModal,
  GiftStage,
  RewardLine,
  RewardList,
  useRewardText,
  type PresentTake,
} from '@/components/GiftCard'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { InfoButton } from '@/components/RulesModal'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { presentTimeline, type PresentContent, type PresentParams } from '@/fx/timelines/present'
import { t as tr } from '@/i18n'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { mutateSave, useGame, type GiftRun } from '@/store/game'
import { fightFromPresent, growPresent, leavePresent, openPresent } from '@/store/run'
import { Overlay } from '@/screens/battle/VictoryView'
import { cx } from '@/theme/util'
import { RunRoundGauge } from './RoundGauge'

/** A take of the present: its timeline params, what it loads first, what it tells the screen. */
export function presentTake(
  params: PresentParams,
  extra: { ready?: Promise<unknown>; hud?: PresentTake['hud']; onEnd?: () => void } = {},
): PresentTake {
  return { timeline: presentTimeline(params), ...extra }
}

/** What an opened present's things look like on the stage, and the promise that loads their pictures. */
export function presentContents(
  items: GiftItem[],
  data: { items: Record<string, { spriteUrl?: string | null }> },
) {
  const contents: PresentContent[] = items.map((it) => {
    const url = data.items[it.key]?.spriteUrl
    return it.key === MONEY || !url ? { key: MONEY, kind: 'gold' } : { key: `item|${url}`, kind: 'item' }
  })
  const ready = Promise.all(
    items.map((it) => data.items[it.key]?.spriteUrl).flatMap((u) => (u ? [loadItemSprite(u)] : [])),
  )
  return { contents, ready }
}

export interface GiftScreenProps {
  areaId: string | null
  take: PresentTake
  /** The level as shown (it changes as the present swells). */
  level: number
  top: number
  boss?: boolean
  helper?: boolean
  message: string
  /** What OPEN gives now, and at the next level. */
  reward: GiftItem[]
  next: GiftItem[] | null
  /** The next tap's break chance (%), null at the top (or a boss's present: none shown). */
  chance: number | null
  /** A step is playing: the buttons wait. */
  busy: boolean
  /** Over: opened, broken or burst. */
  ended: GiftState['end']
  onOpen: () => void
  onGrow: () => void
  onFight: () => void
  onInfo: () => void
  /** The screen's full height (the game); the kitchen sink shows it in a box. */
  fill?: boolean
  /** The result card and the rules, over the panel. */
  children?: ReactNode
}

/** The screen itself, from what GiftView (or the kitchen sink) gives it. */
export function GiftScreen(p: GiftScreenProps) {
  const { t } = useT()
  const text = useRewardText()
  const title = t(p.boss ? 'ui.giftCard.bossName' : 'ui.giftCard.title')
  const off = p.busy || !!p.ended
  const atTop = !p.boss && p.chance == null
  const out = (p.ended === 'broken' || p.ended === 'burst') && !p.busy
  return (
    <div className="mx-auto w-full lg:p-4">
      <section
        aria-label={title}
        className={cx(
          'mx-auto flex w-full max-w-[max(300px,min(560px,calc((100dvh_-_330px)_*_1.5)))] flex-col lg:max-w-[max(560px,min(700px,calc((100dvh_-_380px)_*_1.5)))]',
          p.fill && 'min-h-[100dvh] lg:min-h-0',
        )}
      >
        {p.fill && <h1 className="sr-only">{title}</h1>}
        <div className="shadow-ledge">
          <GiftStage areaId={p.areaId} take={p.take} label={t('ui.giftCard.stage', { level: p.level })}>
            {!(p.ended === 'broken' || p.ended === 'burst') && (
              <GiftPlate level={p.level} top={p.top} boss={p.boss} helper={p.helper} />
            )}
          </GiftStage>
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
          <div className="flex min-h-[38px] items-center gap-3">
            <span className="flex shrink-0 items-center gap-1.5 font-pixel-sm text-[16px] leading-none text-muted">
              <PixelIcon name="gift" size={16} />
              {p.boss
                ? t('ui.giftCard.levelBoss', { level: p.level })
                : t('ui.giftCard.levelOf', { level: p.level, top: p.top })}
            </span>
            <GiftGauge level={p.level} top={p.top} boss={p.boss} className="min-w-0 flex-1" />
          </div>
          {!p.boss && p.next && !p.ended && (
            <p className="m-0 flex min-w-0 items-center justify-end gap-1.5 font-pixel-sm text-[16px] leading-none text-muted">
              <span className="shrink-0">{t('ui.giftCard.next', { level: p.level + 1 })}</span>
              <RewardLine items={p.next} className="text-ink" />
            </p>
          )}
          {out ? (
            <PixelButton variant="primary" size="lg" className="w-full" onClick={p.onFight}>
              <PixelIcon name="ball" size={22} />
              {t('ui.giftCard.fight')}
            </PixelButton>
          ) : p.boss ? (
            <div className="flex flex-col gap-0.5">
              <PixelButton variant="primary" size="lg" className="w-full" disabled={off} onClick={p.onGrow}>
                <PixelIcon name="gift" size={22} />
                {t('ui.giftCard.bigger')}
              </PixelButton>
              <span className="text-center font-pixel-sm text-[16px] leading-tight text-muted">
                {t('ui.giftCard.mystery')}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <PixelButton
                  size="lg"
                  className="w-full whitespace-nowrap px-2"
                  disabled={off}
                  onClick={p.onOpen}
                  aria-label={`${t('ui.giftCard.open')}: ${text(p.reward)}`}
                >
                  {t('ui.giftCard.open')}
                </PixelButton>
                <RewardLine items={p.reward} className="font-pixel-sm text-[16px] leading-tight text-ink" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <PixelButton
                  variant="primary"
                  size="lg"
                  className="w-full whitespace-nowrap px-2"
                  disabled={off || atTop}
                  onClick={p.onGrow}
                  aria-label={
                    atTop
                      ? t('ui.giftCard.topNote')
                      : `${t('ui.giftCard.bigger')}: ${t('ui.giftCard.breakOdds', { pct: p.chance ?? 0 })}`
                  }
                >
                  {t('ui.giftCard.bigger')}
                </PixelButton>
                <span
                  className={cx(
                    'flex items-center justify-center gap-1 font-pixel-sm text-[16px] leading-tight',
                    atTop ? 'text-muted' : p.chance ? 'text-danger' : 'text-success',
                  )}
                >
                  {atTop ? (
                    t('ui.giftCard.topNote')
                  ) : p.chance ? (
                    <>
                      <PixelIcon name="skull" size={14} />
                      {t('ui.giftCard.breakOdds', { pct: p.chance })}
                    </>
                  ) : (
                    t('ui.giftCard.safe')
                  )}
                </span>
              </div>
            </div>
          )}
          {!p.boss && (
            <div className="mt-auto flex items-center gap-2 pt-1">
              <InfoButton name={title} onClick={p.onInfo} className="min-w-0 flex-1" />
            </div>
          )}
        </div>
      </section>
      {p.children}
    </div>
  )
}

/** The result card, risen over the panel as a battle's: what was inside, the round gauge and CONTINUE. */
export function GiftRecap({ items, onContinue }: { items: GiftItem[]; onContinue: () => void }) {
  const { t } = useT()
  const title = t('ui.giftCard.openedTitle')
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
        <span className="min-w-0 truncate text-lg text-muted">{t('ui.giftCard.title')}</span>
      </div>
      <RewardList items={items} />
    </Overlay>
  )
}

/** What came out of a broken (or burst) present: its sprite's key, the promise that loads it, its name. */
function outOf(enc: Encounter | null, species: Record<number, { name: string } | undefined>) {
  if (!enc || (enc.kind !== 'wild' && enc.kind !== 'boss')) return null
  return {
    dex: enc.dex,
    shiny: !!enc.shiny,
    key: spriteKey(enc.dex, false, !!enc.shiny),
    ready: loadSprite(enc.dex, false, !!enc.shiny),
    name: species[enc.dex]?.name ?? `#${enc.dex}`,
  }
}

/** What the message box says before any tap, or once a take has played to its end. */
export function giftMessage(st: GiftState, name: string | null, rewardText: string): string {
  if (st.end === 'opened') return tr('ui.giftCard.opened', { reward: rewardText })
  if (st.end === 'broken') return name ? tr('ui.giftCard.out', { name }) : tr('ui.giftCard.empty')
  if (st.end === 'burst') return tr('ui.giftCard.bossOut', { name: name ?? '' })
  if (st.boss)
    return st.taps
      ? st.level >= st.top
        ? tr('ui.giftCard.bossShakes')
        : tr('ui.giftCard.bossGrew')
      : tr('ui.giftCard.bossAppears')
  if (!st.taps) return tr('ui.giftCard.appears')
  return st.level >= st.top
    ? tr('ui.giftCard.top', { level: st.level })
    : tr('ui.giftCard.grew', { level: st.level })
}

export function GiftView() {
  useHoldFullscreen()
  const run = useGame((s) => s.run)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const g = run.gift as GiftRun
  const { level: motion, calm } = useMotion()
  const short = motion === 'short'
  const st = g.state
  const look = st.boss ? 'silver' : 'red'
  const text = useRewardText()
  const out = outOf(g.out, data.species)
  const [shown, setShown] = useState(st.level)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(() => giftMessage(st, out?.name ?? null, text(g.got ?? [])))
  const [rules, setRules] = useState<'unlock' | 'info' | null>(() =>
    !st.boss && save && giftCardRulesDue(save, data) ? 'unlock' : null,
  )
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // The first take: it drops in (or, back from a reload, stands as it was left).
  const [take, setTake] = useState<PresentTake>(() => {
    if (st.end === 'opened') {
      const c = presentContents(g.got ?? [], data)
      return presentTake(
        { mode: 'open', level: st.level, look, contents: c.contents, still: calm },
        { ready: c.ready },
      )
    }
    if (st.end === 'broken' || st.end === 'burst')
      return presentTake(
        {
          mode: st.end === 'burst' ? 'burst' : 'break',
          level: st.level,
          look,
          mon: out?.key,
          shiny: out?.shiny,
          still: calm,
        },
        { ready: out?.ready },
      )
    return presentTake({ mode: st.taps ? 'idle' : 'appear', level: st.level, look, short, still: calm })
  })

  const grow = () => {
    if (busy || st.end) return
    const step = growPresent()
    if (!step) return
    setBusy(true)
    const after = useGame.getState().run.gift
    const done = () => {
      if (!alive.current) return
      setBusy(false)
    }
    if (step.broke || step.burst) {
      const o = outOf(after?.out ?? null, data.species)
      setMessage(tr(step.burst ? 'ui.giftCard.bossStrain' : 'ui.giftCard.strain'))
      setTake(
        presentTake(
          {
            mode: step.burst ? 'burst' : 'break',
            level: step.from,
            look,
            mon: o?.key,
            shiny: o?.shiny,
            short,
            still: calm,
          },
          {
            ready: o?.ready,
            hud: {
              beat: (b) => {
                if (b === 'broke') setMessage(tr(step.burst ? 'ui.giftCard.bossBurst' : 'ui.giftCard.broke'))
                if (b === 'out') {
                  if (o) playCry(o.dex)
                  setMessage(giftMessage(step.state, o?.name ?? null, ''))
                }
              },
            },
            onEnd: () => {
              setMessage(giftMessage(step.state, o?.name ?? null, ''))
              done()
            },
          },
        ),
      )
      return
    }
    setTake(
      presentTake(
        { mode: 'grow', level: step.from, to: step.to, look, short, still: calm },
        {
          hud: {
            beat: (b) => {
              if (b !== 'grown') return
              setShown(step.to)
              setMessage(giftMessage(step.state, null, ''))
            },
          },
          onEnd: () => {
            setShown(step.to)
            setMessage(giftMessage(step.state, null, ''))
            done()
          },
        },
      ),
    )
  }

  const open = () => {
    if (busy || st.end) return
    const items = openPresent()
    if (!items) return
    setBusy(true)
    setMessage(tr('ui.giftCard.opening'))
    const c = presentContents(items, data)
    setTake(
      presentTake(
        { mode: 'open', level: st.level, look, contents: c.contents, short, still: calm },
        {
          ready: c.ready,
          hud: {
            beat: (b) => b === 'opened' && setMessage(tr('ui.giftCard.opened', { reward: text(items) })),
          },
          onEnd: () => {
            if (!alive.current) return
            setMessage(tr('ui.giftCard.opened', { reward: text(items) }))
            setBusy(false)
          },
        },
      ),
    )
  }

  const closeRules = () => {
    if (rules === 'unlock') mutateSave((s) => (s.giftCard?.rulesSeen ? null : markGiftCardRulesSeen(s)))
    setRules(null)
  }

  const reward = useMemo(() => giftRewardAt(st, Math.max(1, Math.min(st.level, shown))), [st, shown])
  const next = shown < st.top ? giftRewardAt(st, shown + 1) : null
  const chance = st.boss || st.end ? null : giftChanceFor(data, st, shown)
  return (
    <GiftScreen
      areaId={run.areaId}
      take={take}
      level={shown}
      top={st.top}
      boss={!!st.boss}
      helper={st.helper}
      message={message}
      reward={reward}
      next={next && next.length ? next : null}
      chance={chance}
      busy={busy}
      ended={st.end}
      onOpen={open}
      onGrow={grow}
      onFight={fightFromPresent}
      onInfo={() => setRules('info')}
      fill
    >
      {!st.boss && (
        <GiftRulesModal
          open={rules != null}
          onClose={closeRules}
          onGo={rules === 'unlock' ? closeRules : undefined}
        />
      )}
      {st.end === 'opened' && !busy && <GiftRecap items={g.got ?? []} onContinue={leavePresent} />}
      {st.end === 'broken' && !busy && !g.out && <GiftEmpty onContinue={leavePresent} />}
    </GiftScreen>
  )
}

/** The break chance for a gift's player (Delibird's help or not) at a level; null at the top. */
export const giftChanceFor = (data: GameData, st: Pick<GiftState, 'helper'>, level: number): number | null =>
  giftBreakChance(giftCfg(data), level, st.helper)

/** A broken gift with nothing in it (an area with no wild Pokémon): a short card, back on the trail. */
function GiftEmpty({ onContinue }: { onContinue: () => void }) {
  const { t } = useT()
  return (
    <Overlay
      label={t('ui.giftCard.empty')}
      footer={
        <PixelButton variant="primary" size="lg" className="w-full" onClick={onContinue}>
          {t('ui.common.continue')}
        </PixelButton>
      }
    >
      <p className="copy m-0 text-lg">{t('ui.giftCard.empty')}</p>
    </Overlay>
  )
}
