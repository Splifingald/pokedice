// The evolution cut-scene (silhouette → flash → new sprite), and a full-screen queue that plays several in a row.
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getInstance, instanceStats } from '@/engine'
import { sfx } from '@/audio/sfx'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { Confetti } from './Confetti'
import { DiceSet } from './DiceSet'
import { PixelButton } from './PixelButton'
import { SpriteImg } from './SpriteImg'
import { StatChip } from './StatChip'

export interface EvolutionShow {
  uid: string
  fromDex: number
  toDex: number
}

/** One evolution, played once. `onDone` fires when the new form is revealed. */
export function EvolutionSequence({ uid, fromDex, toDex, onDone }: EvolutionShow & { onDone?: () => void }) {
  const { t } = useT()
  const reduced = useGame((s) => s.settings.reducedMotion)
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, uid) : undefined))
  const [stage, setStage] = useState(reduced ? 3 : 0)
  useEffect(() => {
    if (stage >= 3) return
    const t = setTimeout(() => setStage((s) => s + 1), [1000, 1400, 350][stage])
    return () => clearTimeout(t)
  }, [stage])
  useEffect(() => {
    if (stage !== 3) return
    sfx('levelup')
    onDone?.()
  }, [stage]) // eslint-disable-line react-hooks/exhaustive-deps
  const from = data.species[fromDex]?.name ?? t('ui.common.unknown')
  const to = data.species[toDex]?.name ?? t('ui.common.unknown')
  const stats = inst ? instanceStats(inst, data) : null
  return (
    <div className="flex flex-col items-center gap-2 border-[3px] border-ink bg-parchment p-3 text-ink">
      <div className="relative" style={{ width: 144, height: 144 }}>
        {stage < 3 && (
          <motion.div
            className="absolute inset-0"
            animate={stage === 1 ? { opacity: [1, 0, 1, 0, 1, 0, 1, 0] } : { opacity: 1 }}
            transition={{ duration: 1.4 }}
          >
            <SpriteImg dex={fromDex} size={144} silhouette={stage >= 1} />
          </motion.div>
        )}
        {stage === 1 && (
          <motion.div className="absolute inset-0" animate={{ opacity: [0, 1, 0, 1, 0, 1, 0, 1] }} transition={{ duration: 1.4 }}>
            <SpriteImg dex={toDex} size={144} silhouette />
          </motion.div>
        )}
        {stage === 2 && <div className="absolute inset-0 bg-white" />}
        {stage === 3 && (
          <>
            <motion.div className="absolute inset-0" initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <SpriteImg dex={toDex} size={144} />
            </motion.div>
            {/* The new form arrives to a burst of confetti. */}
            <Confetti count={26} spread={60} size={12} />
          </>
        )}
      </div>
      <div className="text-center text-2xl">{stage < 3 ? t('ui.evolution.evolving', { name: from }) : t('ui.evolution.evolved', { from, to })}</div>
      {stage === 3 && stats && inst && (
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
