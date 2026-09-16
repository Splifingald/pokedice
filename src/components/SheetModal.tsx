import { useState, type ReactNode } from 'react'
import type { PokemonInstance } from '@/engine'
import { useGame } from '@/store/game'
import { DexEntry } from './DexEntry'
import { Modal } from './Modal'
import { PokemonSheet } from './PokemonSheet'

/** What the details modal opens on: one of your Pokémon, or a Pokédex entry. */
export type SheetView = { kind: 'inst'; id: string } | { kind: 'dex'; dex: number }

const viewKey = (v: SheetView) => (v.kind === 'inst' ? `i-${v.id}` : `d-${v.dex}`)

/** Pokémon details in a modal. Tapping an evolution opens its Pokédex entry on top, with Back. */
export function SheetModal({
  view,
  onClose,
  instExtra,
}: {
  view: SheetView | null
  onClose: () => void
  /** Extra actions under one of your Pokémon (e.g. "Use an item" on the Team screen). */
  instExtra?: (inst: PokemonInstance) => ReactNode
}) {
  return (
    <Modal open={!!view} onClose={onClose} label="Pokémon details">
      {view && <SheetStack key={viewKey(view)} initial={view} instExtra={instExtra} onClose={onClose} />}
    </Modal>
  )
}

function SheetStack({
  initial,
  instExtra,
  onClose,
}: {
  initial: SheetView
  instExtra?: (inst: PokemonInstance) => ReactNode
  onClose: () => void
}) {
  const box = useGame((s) => s.save?.box)
  const [stack, setStack] = useState<SheetView[]>([initial])
  const top = stack[stack.length - 1]!
  const open = (dex: number) => setStack((s) => [...s, { kind: 'dex', dex }])
  const inst = top.kind === 'inst' ? box?.find((p) => p.id === top.id) : undefined
  return (
    <div className="flex flex-col gap-2">
      {stack.length > 1 && (
        <button type="button" className="min-h-[44px] self-start text-xl underline" onClick={() => setStack((s) => s.slice(0, -1))}>
          ◀ Back
        </button>
      )}
      {top.kind === 'dex' ? (
        <DexEntry key={top.dex} dex={top.dex} onOpenDex={open} onTravel={onClose} />
      ) : inst ? (
        <PokemonSheet dex={inst.dex} inst={inst} onOpenDex={open}>
          {instExtra?.(inst)}
        </PokemonSheet>
      ) : null}
    </div>
  )
}
