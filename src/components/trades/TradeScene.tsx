// The trade scene (docs/23 §2), full screen: the games' trade in three acts (your Pokémon into its ball and up, the
// two balls crossing along the link, theirs down onto your pad and out), each Pokémon's cry, the lines in a text box;
// a trade evolution after it with the usual evolution scene; then what you got and where it went. SKIP goes straight
// to that. Played when you take a listing, by itself back Home ("Trade done!") when one of yours was taken while you
// were away, and from a trade in the Done list.
import { motion } from 'framer-motion'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { arrivalLevel, homeRegionOf, regionName, tradeCfg } from '@/engine'
import { playCry } from '@/audio/cries'
import { loadSprite, spriteKey } from '@/fx/sprites'
import type { BallKind } from '@/fx/scenes'
import { tradeTimeline } from '@/fx/timelines/trade'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useGame } from '@/store/game'
import type { TradeShow } from '@/store/trades'
import { Chip, LevelTag, NewTag } from '../Chip'
import { Dialogue } from '../Dialogue'
import { EvolutionSequence } from '../Evolution'
import { PixelIcon } from '../icons'
import { PixelButton } from '../PixelButton'
import { MiniSprite, SpriteImg } from '../SpriteImg'
import { StageCanvas } from '../StageCanvas'
import { useMinWhy } from './TradeBits'
import { NameIn } from '../TrainerName'

const BALLS: BallKind[] = ['poke', 'great', 'ultra']

export function TradeScene({ show, onDone }: { show: TradeShow | null; onDone: () => void }) {
  if (!show || typeof document === 'undefined') return null
  return createPortal(<SceneBody key={show.entry.id} show={show} onDone={onDone} />, document.body)
}

type Step = 'trade' | 'evolve' | 'done'

function SceneBody({ show, onDone }: { show: TradeShow; onDone: () => void }) {
  useHoldFullscreen()
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { entry: e } = show
  const [step, setStep] = useState<Step>('trade')
  const [line, setLine] = useState('')
  const [evolved, setEvolved] = useState(false)
  const end = useRef<HTMLButtonElement>(null)
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')
  // Each goes by the nickname it carries: "Misty sent Bolt over!"
  const give = e.gave.nickname || name(e.gave.dex)
  const get = e.got.nickname || name(e.got.dex)
  const who = e.with || t('ui.friends.someone')
  const { timeline, ready } = useMemo(
    () => ({
      ready: Promise.all([
        loadSprite(e.gave.dex, false, !!e.gave.shiny),
        loadSprite(e.got.dex, false, !!e.got.shiny),
      ]),
      timeline: tradeTimeline({
        give: spriteKey(e.gave.dex, false, !!e.gave.shiny),
        get: spriteKey(e.got.dex, false, !!e.got.shiny),
        giveBall: BALLS[e.gave.dex % 3]!,
        getBall: BALLS[(e.got.dex + 1) % 3]!,
        shiny: !!e.got.shiny,
      }),
    }),
    // One scene per trade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [e.id],
  )
  const finish = () => {
    setStep('done')
    requestAnimationFrame(() => end.current?.focus())
  }
  const afterTrade = () => (e.evolvedTo != null ? setStep('evolve') : finish())
  const beat = (b: string) => {
    // Each Pokémon cries as in the games: yours saying goodbye, theirs as it comes out.
    if (b === 'bye') playCry(e.gave.dex)
    else if (b === 'out') playCry(e.got.dex)
    else if (b === 'sending') setLine(t('ui.trades.scene.sending', { mon: give, name: who }))
    else if (b === 'incoming') setLine(t('ui.trades.scene.incoming', { mon: get, name: who }))
    else if (b === 'care') setLine(t('ui.trades.scene.care', { mon: get }))
  }
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return
    ev.stopPropagation()
    if (step === 'done') onDone()
    else finish()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-night/80 p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-scene-title"
      onKeyDown={onKeyDown}
    >
      <div className="pixel-panel flex max-h-full w-full min-w-0 max-w-md flex-col gap-2.5 overflow-auto p-3">
        <h2
          id="trade-scene-title"
          className="m-0 flex items-center gap-2 text-[26px] font-normal leading-none"
        >
          <PixelIcon name="trade" size={28} className="shrink-0" />
          <span className="min-w-0">
            {show.away ? (
              t('ui.trades.pop.title')
            ) : (
              <NameIn name={who} rich={e.withRich} text={(name) => t('ui.trades.scene.label', { name })} />
            )}
          </span>
        </h2>
        {show.away && (
          <p className="copy m-0 text-[19px] leading-tight">
            <NameIn
              name={who}
              rich={e.withRich}
              text={(name) => t('ui.trades.pop.body', { name, mon: give })}
            />
          </p>
        )}
        {step === 'trade' && (
          <>
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 bg-sky px-2 py-1 shadow-ring-line"
              aria-hidden
            >
              <span className="flex min-w-0 items-center gap-1">
                <MiniSprite dex={e.gave.dex} size={36} className="-my-1 shrink-0" />
                <span className="grid min-w-0 leading-none">
                  <b className="truncate text-[18px] font-normal">{give}</b>
                  <small className="truncate font-pixel-sm text-[13px] text-muted">
                    {t('ui.trades.pop.yours')}
                  </small>
                </span>
              </span>
              <PixelIcon name="trade" size={22} />
              <span className="flex min-w-0 flex-row-reverse items-center gap-1 text-right">
                <MiniSprite dex={e.got.dex} size={36} className="-my-1 shrink-0" />
                <span className="grid min-w-0 leading-none">
                  <b className="truncate text-[18px] font-normal">{get}</b>
                  <small className="truncate font-pixel-sm text-[13px] text-muted">
                    <NameIn name={who} rich={e.withRich} text={(name) => t('ui.trades.whose', { name })} />
                  </small>
                </span>
              </span>
            </div>
            <div className="w-full overflow-hidden shadow-ring">
              <StageCanvas
                timeline={timeline}
                ready={ready}
                hud={{ beat }}
                onEnd={afterTrade}
                label={t('ui.trades.scene.stage', { give, get })}
              />
            </div>
            {/* The games' text box; screen readers get each line whole, not letter by letter. */}
            <div aria-hidden>
              <Dialogue text={line || '…'} speed={18} className="min-h-[3.4em] text-[22px] leading-tight" />
            </div>
            <p className="sr-only" aria-live="polite">
              {line}
            </p>
            <PixelButton autoFocus className="w-full" onClick={finish}>
              {t('ui.evolution.skip')}
            </PixelButton>
          </>
        )}
        {step === 'evolve' && e.evolvedTo != null && (
          <>
            <EvolutionSequence
              uid={show.instId ?? ''}
              fromDex={e.got.dex}
              toDex={e.evolvedTo}
              shiny={!!e.got.shiny}
              onDone={() => setEvolved(true)}
            />
            <PixelButton variant="primary" size="lg" className="w-full" onClick={finish}>
              {evolved ? t('ui.common.continue') : t('ui.evolution.skip')}
            </PixelButton>
          </>
        )}
        {step === 'done' && (
          <>
            <TradeResult show={show} />
            <PixelButton ref={end} variant="primary" size="lg" className="w-full" onClick={onDone}>
              {t('ui.trades.done')}
            </PixelButton>
          </>
        )}
      </div>
    </motion.div>
  )
}

/** What you got and where it went: its level (raised to its minimum, or capped), how it was kept. */
export function TradeResult({ show }: { show: TradeShow }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const minWhy = useMinWhy()
  const { entry: e } = show
  const final = e.evolvedTo ?? e.got.dex
  const fin = data.species[final]?.name ?? t('ui.common.pokemon')
  // Its nickname came with it, unless it merged into yours.
  const nick = e.outcome !== 'merged' ? e.got.nickname : undefined
  const home = homeRegionOf(data, e.got.dex)
  const region = home ? regionName(data, home) : ''
  const arrival = arrivalLevel(data, e.got.dex, e.gave.level)
  const lv = (n: number) => t('ui.common.level.short', { n })
  const where =
    e.outcome === 'merged'
      ? show.mine != null
        ? t('ui.trades.result.merged', { name: fin, level: lv(show.mine) })
        : t('ui.trades.result.mergedNoLv', { name: fin })
      : e.outcome === 'replaced'
        ? show.mine != null
          ? t('ui.trades.result.replaced', { name: fin, level: lv(show.mine) })
          : t('ui.trades.result.replacedNoLv', { name: fin })
        : e.outcome === 'shiny'
          ? t('ui.trades.result.shiny', { region })
          : t(show.isNew ? 'ui.trades.result.joinedNew' : 'ui.trades.result.joined', { region })
  const level = arrival.raised
    ? t('ui.trades.result.raised', {
        from: lv(Math.min(e.gave.level, tradeCfg(data).levelCap)),
        to: lv(e.got.level),
        why: minWhy(arrival.min.reason),
      })
    : arrival.capped
      ? t('ui.trades.result.capped', { level: lv(tradeCfg(data).levelCap) })
      : ''
  return (
    <div className="grid justify-items-center gap-2 text-center">
      <SpriteImg dex={final} size={96} shiny={!!e.got.shiny} />
      <p className="m-0 flex flex-wrap items-center justify-center gap-1.5">
        <b className="text-[26px] font-normal leading-none">{nick || fin}</b>
        {nick && <span className="font-pixel-sm text-[17px] leading-none text-muted">{fin}</span>}
        <LevelTag level={e.got.level} />
        {e.got.shiny && <Chip tone="gold">{t('ui.trades.shinyTag')}</Chip>}
        {show.isNew && <NewTag />}
        {e.outcome === 'replaced' && <Chip tone="green">{t('ui.trades.stronger')}</Chip>}
      </p>
      <p className="copy m-0 text-[18px] leading-tight">{[where, level].filter(Boolean).join(' ')}</p>
      <p className="m-0 font-pixel-sm text-[15px] text-muted">
        {t('ui.trades.result.dexStays', { name: data.species[e.gave.dex]?.name ?? t('ui.common.pokemon') })}
      </p>
    </div>
  )
}
