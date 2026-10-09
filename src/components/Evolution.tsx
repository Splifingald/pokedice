// The evolution cut-scene on the pixel stage (src/fx/timelines/moments.ts: silhouette, a flicker that speeds up,
// rays, burst, reveal; a stone floats down first), and a full-screen queue that plays several in a row.
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getInstance, instanceStats } from '@/engine'
import { sfx } from '@/audio/sfx'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { evolveTimeline } from '@/fx/timelines/moments'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { DiceSet } from './DiceSet'
import { PixelButton } from './PixelButton'
import { StageCanvas } from './StageCanvas'
import { StatChip } from './StatChip'

export interface EvolutionShow {
  uid: string
  fromDex: number
  toDex: number
  /** The stone that did it (an item key): it floats down and touches the Pokémon first. */
  item?: string | null
}

/** One evolution, played once. `onDone` fires when the new form is revealed. */
export function EvolutionSequence({ uid, fromDex, toDex, item, onDone }: EvolutionShow & { onDone?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, uid) : undefined))
  const shiny = !!inst?.shiny
  const [done, setDone] = useState(false)
  const stoneUrl = item ? (data.items[item]?.spriteUrl ?? null) : null
  const { timeline, ready } = useMemo(
    () => ({
      ready: Promise.all([
        loadSprite(fromDex, false, shiny),
        loadSprite(toDex, false, shiny),
        ...(stoneUrl ? [loadItemSprite(stoneUrl)] : []),
      ]),
      timeline: evolveTimeline({
        from: spriteKey(fromDex, false, shiny),
        to: spriteKey(toDex, false, shiny),
        type: data.species[toDex]?.type1 ?? 'normal',
        stone: stoneUrl ? `item|${stoneUrl}` : null,
      }),
    }),
    // One scene per evolution: the instance's later changes don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, fromDex, toDex],
  )
  const from = data.species[fromDex]?.name ?? t('ui.common.unknown')
  const to = data.species[toDex]?.name ?? t('ui.common.unknown')
  const stats = inst ? instanceStats(inst, data) : null
  const reveal = () => {
    if (done) return
    setDone(true)
    sfx('levelup')
    onDone?.()
  }
  return (
    <div className="flex flex-col items-center gap-2 text-ink">
      <div className="w-full overflow-hidden shadow-ring">
        <StageCanvas
          timeline={timeline}
          ready={ready}
          hud={{ beat: (b) => b === 'evolved' && reveal() }}
          onEnd={reveal}
          label={done ? t('ui.evolution.evolved', { from, to }) : t('ui.evolution.evolving', { name: from })}
        />
      </div>
      <div className="min-h-[2lh] text-center text-2xl leading-tight" aria-live="polite">
        {done ? t('ui.evolution.evolved', { from, to }) : t('ui.evolution.evolving', { name: from })}
      </div>
      {done && stats && inst && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-lg">
          <DiceSet dice={stats.dice} size={24} />
          <StatChip stat="rerolls" value={stats.rerolls} />
          <StatChip stat="hp" value={`${inst.currentHp}/${stats.maxHp}`} />
        </div>
      )}
    </div>
  )
}

/**
 * Evolutions one after another, full screen: each plays, then CONTINUE moves to the next; after the last, `onDone`.
 * The button is always in view (bottom of the card).
 */
export function EvolutionQueue({ items, onDone }: { items: EvolutionShow[]; onDone: () => void }) {
  const { t } = useT()
  const [i, setI] = useState(0)
  const [ready, setReady] = useState(false)
  const cur = items[i]
  useEffect(() => {
    if (!cur) onDone()
  }, [cur]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return null
  // On the page itself, above any sheet it was opened from (a fixed box inside a transformed modal would be clipped).
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('ui.evolution.label')}
    >
      <div className="pixel-panel flex max-h-full w-full max-w-md flex-col gap-3 overflow-auto p-3">
        <EvolutionSequence key={`${cur.uid}-${i}`} {...cur} onDone={() => setReady(true)} />
        <PixelButton
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => {
            setReady(false)
            setI((n) => n + 1)
          }}
        >
          {ready ? t(i + 1 < items.length ? 'ui.evolution.next' : 'ui.common.continue') : t('ui.evolution.skip')}
        </PixelButton>
      </div>
    </motion.div>,
    document.body,
  )
}
