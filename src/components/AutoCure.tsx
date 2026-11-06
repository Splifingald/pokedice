// Auto-mode's HEAL button (docs/67, Ash's suggestion): a stunned Pokémon (frozen, paralysed) with its cure in the Bag
// gets a few seconds' offer instead of losing its turn at once. Tapped, the cure is used and the turn goes ahead; left,
// the gauge runs out and the turn passes as before. The engine picks the item (`autoCureItem`) and the time.
import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { ItemDef } from '@/engine'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelButton } from '@/components/PixelButton'
import { useT } from '@/i18n/react'

export function AutoCureOffer({
  name,
  item,
  ms,
  hold = false,
  onUse,
  onTimeout,
}: {
  /** The stunned Pokémon's name. */
  name: string
  item: ItemDef
  /** How long the offer stays. */
  ms: number
  /** A dialog over the fight: the gauge waits, and starts again once it's closed. */
  hold?: boolean
  onUse: () => void
  onTimeout: () => void
}) {
  const { t } = useT()
  const latest = useRef(onTimeout)
  latest.current = onTimeout
  useEffect(() => {
    if (hold) return
    const timer = setTimeout(() => latest.current(), ms)
    return () => clearTimeout(timer)
  }, [hold, ms])
  return (
    <div className="grid gap-1.5">
      <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-ink" role="status">
        {t('ui.battle.autoCureNote', { name })}
      </p>
      <PixelButton variant="primary" size="lg" className="relative w-full overflow-hidden" onClick={onUse}>
        <ItemSprite item={item} size={24} />
        {t('ui.battle.autoCure', { item: item.name })}
        {/* The time left, draining: once it's empty the turn passes. */}
        {!hold && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[5px] bg-black/20">
            <motion.span
              className="block h-full bg-gold-light"
              initial={{ width: '100%' }}
              animate={{ width: 0 }}
              transition={{ duration: ms / 1000, ease: 'linear' }}
            />
          </span>
        )}
      </PixelButton>
    </div>
  )
}

// Stunned (frozen, paralysed) with its cure in the Bag, by hand (the user's ask, 2026-11-06): the cure one tap away in
// red, SKIP TURN beside it in white. The engine picks the item (`autoCureItem`); the Bag still holds the others.
export function StunCureActions({
  item,
  onUse,
  onPass,
}: {
  item: ItemDef
  onUse: () => void
  onPass: () => void
}) {
  const { t } = useT()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
      <PixelButton size="lg" className="whitespace-nowrap px-2" onClick={onPass}>
        {t('ui.battle.skipTurn')}
      </PixelButton>
      <PixelButton variant="primary" size="lg" className="whitespace-nowrap px-2" onClick={onUse}>
        <ItemSprite item={item} size={24} />
        {t('ui.battle.autoCure', { item: item.name })}
      </PixelButton>
    </div>
  )
}
