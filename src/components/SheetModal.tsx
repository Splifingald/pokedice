import { useState, type ReactNode } from 'react'
import {
  evolutionGate,
  levelEvolutions,
  regionSpecies,
  sendOnBlocked,
  sendTargets,
  type PokemonInstance,
  type RegionId,
} from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { evolveAtLevelCap } from '@/store/actions'
import { useGame } from '@/store/game'
import { sendPokemonOn } from '@/store/regions'
import { AreaDex } from './AreaDex'
import { DexEntry } from './DexEntry'
import { EvolutionQueue, type EvolutionShow } from './Evolution'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { PokemonSheet } from './PokemonSheet'

/** What the details modal opens on: one of your Pokémon, a Pokédex entry, or an area's Pokémon. */
export type SheetView = { kind: 'inst'; id: string } | { kind: 'dex'; dex: number } | { kind: 'area'; areaId: string }

const viewKey = (v: SheetView) => (v.kind === 'inst' ? `i-${v.id}` : v.kind === 'dex' ? `d-${v.dex}` : `a-${v.areaId}`)

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
      {top.kind === 'area' ? (
        <AreaDex areaId={top.areaId} onOpenDex={open} />
      ) : top.kind === 'dex' ? (
        <DexEntry key={top.dex} dex={top.dex} onOpenDex={open} onTravel={onClose} />
      ) : inst ? (
        <PokemonSheet dex={inst.dex} inst={inst} onOpenDex={open}>
          <SendOnPanel inst={inst} onSent={onClose} />
          {instExtra?.(inst)}
          <LevelCapEvolvePanel inst={inst} />
        </PokemonSheet>
      ) : null}
    </div>
  )
}

/**
 * "Send to Kanto", "Send to Johto"…: one button per region whose league is done and whose Pokédex lists this
 * Pokémon — the regions it could follow the player to. It is the only thing that ever crosses between regions, so
 * the reason it can't is always spelled out rather than the buttons just vanishing.
 */
function SendOnPanel({ inst, onSent }: { inst: PokemonInstance; onSent: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [asked, setAsked] = useState<RegionId | null>(null)
  if (!save) return null
  // Not one of a region's own Pokémon: it has no business there, and offering it would only be noise.
  const targets = sendTargets(save, data).filter((r) => regionSpecies(data, r.id).has(inst.dex))
  if (!targets.length) return null
  // With the species settled, what is left ('last', 'reviving') is about this Pokémon, the same for every region.
  const why = sendOnBlocked(save, data, inst, targets[0]!)
  const hinted = targets.find((r) => r.id === asked) ?? (targets.length === 1 ? targets[0] : undefined)

  const name = data.species[inst.dex]?.name ?? t('ui.common.pokemon')
  return (
    <section className="flex flex-col items-start gap-1 border-t-[3px] border-dashed border-shadow/40 pt-2">
      <div className="flex flex-wrap gap-2">
        {targets.map((r) => (
          <PixelButton
            key={r.id}
            variant="primary"
            disabled={!!why}
            onClick={() => (asked === r.id ? (sendPokemonOn(inst.id, r.id), onSent()) : setAsked(r.id))}
          >
            {asked === r.id ? t('ui.sheet.sendOnConfirm') : t('ui.sheet.sendOn', { region: r.name })}
          </PixelButton>
        ))}
      </div>
      <p className="copy text-base text-muted">
        {why === 'last'
          ? t('ui.sheet.sendOnLast')
          : why === 'reviving'
            ? t('ui.sheet.sendOnReviving')
            : hinted
              ? t('ui.sheet.sendOnHint', { name, region: hinted.name })
              : t('ui.sheet.sendOnPick', { name })}
      </p>
    </section>
  )
}

/**
 * "Evolve": a Pokémon that reached the level cap without taking an evolution by level it qualifies for — the gate held
 * it back until a later region opened, or the Day Care raised it — earns no more XP to trigger it, so it is offered
 * here, at the bottom of its sheet.
 */
function LevelCapEvolvePanel({ inst }: { inst: PokemonInstance }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  // The scene outlives the button: once evolved, the Pokémon no longer qualifies.
  const [evolving, setEvolving] = useState<EvolutionShow | null>(null)
  const scene = evolving && <EvolutionQueue items={[evolving]} onDone={() => setEvolving(null)} />
  if (!save || inst.level < data.config.maxLevel || inst.revivesAt != null) return scene || null
  const ready = levelEvolutions(inst, data, evolutionGate(save, data))
  if (!ready.length) return scene || null

  const name = data.species[inst.dex]?.name ?? t('ui.common.pokemon')
  const names = ready.map((e) => data.species[e.toDex]?.name ?? `#${e.toDex}`).join(' / ')
  return (
    <section className="flex flex-col items-start gap-1 border-t-[3px] border-dashed border-shadow/40 pt-2">
      <PixelButton
        variant="primary"
        onClick={() => {
          const evolved = evolveAtLevelCap(inst.id)
          if (evolved) setEvolving(evolved)
        }}
      >
        {t('ui.sheet.evolveNow')}
      </PixelButton>
      <p className="copy text-base text-muted">
        {t('ui.sheet.evolveNowHint', { name, names })} {ready.length > 1 && t('ui.sheet.oneAtRandom')}
      </p>
      {scene}
    </section>
  )
}
