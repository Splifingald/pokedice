import { useRef, useState, type ReactNode } from 'react'
import {
  evolutionGate,
  instanceMaxHp,
  levelEvolutions,
  monName,
  nationalDex,
  regionBestLevel,
  regionSpecies,
  sendArrivesLocked,
  sendOnBlocked,
  sendTargets,
  worldHomers,
  type PokemonInstance,
  type RegionId,
} from '@/engine'
import { dexNo } from '@/lib/format'
import { useT } from '@/i18n/react'
import { evolveAtLevelCap, letHomerGo, reorderTeam } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { sendPokemonOn } from '@/store/regions'
import { AreaDex } from './AreaDex'
import { DexEntry } from './DexEntry'
import { EvolutionQueue, type EvolutionShow } from './Evolution'
import { PixelIcon } from './icons'
import { ItemPanel, useHasFieldItems } from './ItemPanel'
import { HomerLock } from './HomerLock'
import { NicknameButton, NicknameModal } from './Nickname'
import { PixelButton } from './PixelButton'
import { PokemonSheet } from './PokemonSheet'
import { Sheet } from './Sheet'
import { useTradeThis } from './trades/TradeThis'

/**
 * What the details sheet opens on: one of your Pokémon, a Pokédex entry, an area's Pokémon, or a small world's Pokémon
 * waiting to unlock in this region (docs/26 §1).
 */
export type SheetView =
  | { kind: 'inst'; id: string }
  | { kind: 'dex'; dex: number; shiny?: boolean }
  | { kind: 'area'; areaId: string }
  | { kind: 'homer'; id: string }
/** Views reached from inside the sheet: also the "Use an item" list for one of your Pokémon. */
type StackView = SheetView | { kind: 'items'; id: string }

const viewKey = (v: SheetView) =>
  v.kind === 'inst' ? `i-${v.id}` : v.kind === 'dex' ? `d-${v.dex}${v.shiny ? '-s' : ''}` : v.kind === 'homer' ? `h-${v.id}` : `a-${v.areaId}`

/**
 * Pokémon details in a sheet (from the bottom on phones). Tapping an evolution opens its Pokédex entry on top, with
 * Back. `manage` adds the footer the Team and Home use: Make lead and Use an item for a team member, the Center rule
 * and Use an item for one in the Box. `instExtra` adds actions inside the body (the Pokémon Center's team moves).
 */
export function SheetModal({
  view,
  onClose,
  instExtra,
  manage,
  swaps,
}: {
  view: SheetView | null
  onClose: () => void
  instExtra?: (inst: PokemonInstance) => ReactNode
  manage?: boolean
  /** The team can change here (a Center, a portal's way in): no Center rule under one in the Box. */
  swaps?: boolean
}) {
  // The last view stays while the sheet slides away.
  const last = useRef(view)
  if (view) last.current = view
  const shown = view ?? last.current
  if (!shown) return null
  return (
    <SheetStack
      key={viewKey(shown)}
      open={!!view}
      initial={shown}
      instExtra={instExtra}
      manage={manage}
      swaps={swaps}
      onClose={onClose}
    />
  )
}

function SheetStack({
  open,
  initial,
  instExtra,
  manage,
  swaps,
  onClose,
}: {
  open: boolean
  initial: SheetView
  instExtra?: (inst: PokemonInstance) => ReactNode
  manage?: boolean
  swaps?: boolean
  onClose: () => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const hasItems = useHasFieldItems()
  const [stack, setStack] = useState<StackView[]>([initial])
  // The nickname dialog, over the sheet: it opens from the Pokémon's name (docs/15 §13).
  const [naming, setNaming] = useState(false)
  const top = stack[stack.length - 1]!
  const push = (v: StackView) => setStack((s) => [...s, v])
  const back = () => setStack((s) => s.slice(0, -1))
  const openDex = (dex: number) => push({ kind: 'dex', dex })
  const inst = top.kind === 'inst' || top.kind === 'items' ? save?.box.find((p) => p.id === top.id) : undefined
  const homer = top.kind === 'homer' && save ? worldHomers(save).find((h) => h.inst.id === top.id) : undefined
  const species = (dex: number) => data.species[dex]?.name ?? t('ui.common.unknown')
  const no = (dex: number) => dexNo(nationalDex(data, dex))

  let title: ReactNode = ''
  let sub: string | undefined
  if (top.kind === 'area') title = data.areas.find((a) => a.id === top.areaId)?.name ?? ''
  else if (top.kind === 'dex') {
    const caught = !!save?.pokedex.includes(top.dex)
    title = caught ? species(top.dex) : t('ui.common.unknown')
    sub = caught ? no(top.dex) : `${no(top.dex)} · ${t('ui.sheet.notCaughtYet')}`
  } else if (inst && top.kind === 'items') {
    title = t('ui.itemPanel.title')
    sub = t('ui.sheet.itemsOn', { name: monName(inst, data), hp: inst.currentHp, max: instanceMaxHp(inst, data) })
  } else if (homer) {
    title = <NicknameButton name={monName(homer.inst, data)} onClick={() => setNaming(true)} />
    sub = [
      ...(homer.inst.nickname ? [species(homer.inst.dex)] : []),
      no(homer.inst.dex),
      t('ui.common.level.short', { n: homer.inst.level }),
      t('ui.sheet.subWaiting'),
    ].join(' · ')
  } else if (inst) {
    const at = save?.team.indexOf(inst.id) ?? -1
    // Its name is the button that gives it a nickname; a fossil still reviving isn't a Pokémon yet.
    title =
      inst.revivesAt == null ? (
        <NicknameButton name={monName(inst, data)} onClick={() => setNaming(true)} />
      ) : (
        species(inst.dex)
      )
    sub = [
      // Nicknamed: its species leads the line under the name.
      ...(inst.nickname ? [species(inst.dex)] : []),
      no(inst.dex),
      t('ui.common.level.short', { n: inst.level }),
      at === 0 ? t('ui.sheet.subLead') : at > 0 ? t('ui.sheet.subOut', { n: at + 1 }) : t('ui.sheet.subBox'),
    ].join(' · ')
  }

  let footer: ReactNode = null
  if (homer) {
    footer = <LetGoButton id={homer.inst.id} name={monName(homer.inst, data)} onGone={onClose} />
  } else if (top.kind === 'items') {
    footer = (
      <PixelButton className="w-full" onClick={back}>
        {t('ui.common.back')}
      </PixelButton>
    )
  } else if (manage && top.kind === 'inst' && inst && save) {
    const at = save.team.indexOf(inst.id)
    const useItem = hasItems && inst.revivesAt == null && (
      <PixelButton
        variant="primary"
        size="lg"
        className="min-w-0 flex-1"
        onClick={() => push({ kind: 'items', id: inst.id })}
      >
        {t('ui.itemPanel.title')}
      </PixelButton>
    )
    footer =
      at >= 0 ? (
        <div className="flex items-center gap-2">
          {at > 0 ? (
            // A square crown: its label ran the row off the screen in French, so the name lives in aria-label.
            <PixelButton
              size="lg"
              className="w-[56px] shrink-0 !px-0"
              aria-label={t('ui.team.makeLead')}
              title={t('ui.team.makeLead')}
              onClick={() => {
                reorderTeam([inst.id, ...save.team.filter((x) => x !== inst.id)])
                pushToast(t('ui.team.leadsNow', { name: monName(inst, data) }), 'good')
                onClose()
              }}
            >
              <PixelIcon name="crown" size={28} />
            </PixelButton>
          ) : (
            <span className="grid min-w-0 flex-1 place-items-center text-center font-pixel-sm text-[16px] text-muted">
              {t('ui.sheet.leadsTeam')}
            </span>
          )}
          {useItem}
        </div>
      ) : swaps ? (
        // The team can change here: the sheet's body has the moves (instExtra), so no rule to point at.
        useItem && <div className="flex">{useItem}</div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-muted">
            <PixelIcon name="lock" size={16} className="shrink-0" />
            {t('ui.team.boxAtCenter', { name: monName(inst, data) })}
          </p>
          {useItem && <div className="flex">{useItem}</div>}
        </div>
      )
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={title} sub={sub} footer={footer}>
        <div className="flex flex-col gap-3">
          {stack.length > 1 && top.kind !== 'items' && (
            <button type="button" className="min-h-[44px] self-start text-[20px] underline" onClick={back}>
              {t('ui.sheet.backStack')}
            </button>
          )}
          {top.kind === 'area' ? (
            <AreaDex areaId={top.areaId} onOpenDex={openDex} />
          ) : top.kind === 'dex' ? (
            <DexEntry key={top.dex} dex={top.dex} shiny={top.shiny} onOpenDex={openDex} onTravel={onClose} />
          ) : top.kind === 'items' && inst ? (
            <ItemPanel inst={inst} onUsed={back} />
          ) : homer ? (
            <PokemonSheet dex={homer.inst.dex} inst={homer.inst} onOpenDex={openDex}>
              <HomerLock homer={homer} />
            </PokemonSheet>
          ) : inst ? (
            // The team's moves (instExtra) above Strengths and weaknesses, always (the user's call, 2026-10-15).
            <PokemonSheet dex={inst.dex} inst={inst} onOpenDex={openDex} beforeMatchups={instExtra?.(inst)}>
              <SendOnPanel inst={inst} onSent={onClose} />
              <LevelCapEvolvePanel inst={inst} />
            </PokemonSheet>
          ) : null}
        </div>
      </Sheet>
      <NicknameModal
        inst={open && naming ? (top.kind === 'inst' && inst ? inst : (homer?.inst ?? null)) : null}
        onClose={() => setNaming(false)}
      />
    </>
  )
}

/** "Let it go", then "Sure? Tap again": a waiting Pokémon's only action besides its nickname. */
function LetGoButton({ id, name, onGone }: { id: string; name: string; onGone: () => void }) {
  const { t } = useT()
  const [asked, setAsked] = useState(false)
  return (
    <PixelButton
      variant="danger"
      size="lg"
      className="w-full"
      onClick={() => {
        if (!asked) return setAsked(true)
        if (letHomerGo(id)) {
          pushToast(t('ui.sheet.letGone', { name }), 'info')
          onGone()
        }
      }}
    >
      {asked ? t('ui.sheet.sendOnConfirm') : t('ui.sheet.letGo')}
    </PixelButton>
  )
}

/**
 * "Send to Kanto", "Send to Johto"…: one button per region started whose Pokédex lists this Pokémon — the regions it
 * could follow the player to. It is the only thing that ever crosses between regions, so the reason it can't is always
 * spelled out rather than the buttons just vanishing, and so is the lock it would wait behind there.
 */
function SendOnPanel({ inst, onSent }: { inst: PokemonInstance; onSent: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [asked, setAsked] = useState<RegionId | null>(null)
  // Not one of a region's own Pokémon: it has no business there, and offering it would only be noise.
  const targets = save ? sendTargets(save, data).filter((r) => regionSpecies(data, r.id).has(inst.dex)) : []
  // TRADE (docs/23) sits beside the Send buttons: the main button when there's nowhere to send it.
  const trade = useTradeThis(inst, !targets.length, onSent)
  if (!save || (!targets.length && !trade)) return null
  // With the species settled, what is left ('last', 'reviving') is about this Pokémon, the same for every region.
  const why = targets.length ? sendOnBlocked(save, data, inst, targets[0]!) : null
  const hinted = targets.find((r) => r.id === asked) ?? (targets.length === 1 ? targets[0] : undefined)

  const name = monName(inst, data)
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
        {trade?.button}
      </div>
      {targets.length > 0 && (
        <p className="copy text-base text-muted">
          {why === 'last'
            ? t('ui.sheet.sendOnLast')
            : why === 'reviving'
              ? t('ui.sheet.sendOnReviving')
              : hinted
                ? sendArrivesLocked(save, data, inst, hinted.id)
                  ? t('ui.sheet.sendOnHintLocked', {
                      name,
                      region: hinted.name,
                      n: inst.level,
                      best: regionBestLevel(save, data, hinted.id),
                    })
                  : t('ui.sheet.sendOnHint', { name, region: hinted.name })
                : t('ui.sheet.sendOnPick', { name, n: inst.level })}
        </p>
      )}
      {trade && <p className="copy text-base text-muted">{trade.note}</p>}
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

  const name = monName(inst, data)
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
