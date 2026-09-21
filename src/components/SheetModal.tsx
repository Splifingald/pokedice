import { useState, type ReactNode } from 'react'
import { sendOnBlocked, sendOnTarget, type PokemonInstance } from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { sendPokemonOn } from '@/store/regions'
import { DexEntry } from './DexEntry'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
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
    <Modal open={!!view} onClose={onClose} label={t('ui.newGame.details')}>
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
  const { t } = useT()
  const box = useGame((s) => s.save?.box)
  const [stack, setStack] = useState<SheetView[]>([initial])
  const top = stack[stack.length - 1]!
  const open = (dex: number) => setStack((s) => [...s, { kind: 'dex', dex }])
  const inst = top.kind === 'inst' ? box?.find((p) => p.id === top.id) : undefined
  return (
    <div className="flex flex-col gap-2">
      {stack.length > 1 && (
        <button type="button" className="min-h-[44px] self-start text-xl underline" onClick={() => setStack((s) => s.slice(0, -1))}>
          {t('ui.sheet.backStack')}
        </button>
      )}
      {top.kind === 'dex' ? (
        <DexEntry key={top.dex} dex={top.dex} onOpenDex={open} onTravel={onClose} />
      ) : inst ? (
        <PokemonSheet dex={inst.dex} inst={inst} onOpenDex={open}>
          <SendOnPanel inst={inst} onSent={onClose} />
          {instExtra?.(inst)}
        </PokemonSheet>
      ) : null}
    </div>
  )
}

/**
 * "Send to Johto": once this region's league is done and the next one has been started, a Pokémon that region could
 * have given the player itself may follow them there. It is the only thing that ever crosses between regions, so the
 * reason it can't is always spelled out rather than the button just vanishing.
 */
function SendOnPanel({ inst, onSent }: { inst: PokemonInstance; onSent: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [asked, setAsked] = useState(false)
  if (!save) return null
  const target = sendOnTarget(save, data)
  if (!target) return null
  const why = sendOnBlocked(save, data, inst, target)
  // Not one of that region's own Pokémon: it has no business there, and saying so would only be noise.
  if (why === 'species') return null

  const name = data.species[inst.dex]?.name ?? t('ui.common.pokemon')
  return (
    <section className="flex flex-col items-start gap-1 border-t-[3px] border-dashed border-shadow/40 pt-2">
      <PixelButton
        variant="primary"
        disabled={!!why}
        onClick={() => (asked ? (sendPokemonOn(inst.id), onSent()) : setAsked(true))}
      >
        {asked ? t('ui.sheet.sendOnConfirm') : t('ui.sheet.sendOn', { region: target.name })}
      </PixelButton>
      <p className="copy text-base text-muted">
        {why === 'last'
          ? t('ui.sheet.sendOnLast')
          : why === 'reviving'
            ? t('ui.sheet.sendOnReviving')
            : t('ui.sheet.sendOnHint', { name, region: target.name })}
      </p>
    </section>
  )
}
