import { useState } from 'react'
import { teamOf, type PokemonInstance, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { PokeCard } from './PokeCard'
import { SheetModal, type SheetView } from './SheetModal'

/**
 * "Before each fight the player picks which one to send." The team side by side, each with its essentials (mini, level,
 * its whole name, types, HP) and two buttons: SWITCH picks it (the one picked says SENT OUT, white: the red is FIGHT's),
 * INFO opens its details (in the rework's send-out step the card itself does, and GO! sends it). With the type hint on and the foe known, a thumb marks the ones whose dice hit it super
 * effectively (up) or not very effectively (down). A team of one has nothing to pick: nothing shows (docs/38 U5c).
 */
export function LeadPicker({
  value,
  onChange,
  foe,
  pair,
  go = false,
  members,
}: {
  value: string | null
  onChange: (uid: string) => void
  /** The types of the Pokémon about to be faced, when the player can see it. */
  foe?: readonly PokeType[]
  /** A double battle (docs/33): two go out. SWITCH picks one, the earlier pick making way when two are picked. */
  pair?: { value: string[]; onChange: (uids: string[]) => void }
  /** The rework's send-out step: no heading; a tap on a card picks it, its INFO opens it, the caller's GO! sends it. */
  go?: boolean
  /**
   * Who to show instead of the team: a fight's switch after a K.O. (docs/42) offers those able to come in, at the fight's
   * HP. Even one is shown (it is what GO! sends).
   */
  members?: PokemonInstance[]
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [info, setInfo] = useState<string | null>(null)
  if (!save) return null
  const team = members ?? teamOf(save)
  if (team.length < (members ? 1 : 2)) return null
  const current = value && team.some((p) => p.id === value && p.currentHp > 0) ? value : team.find((p) => p.currentHp > 0)?.id
  const picked = pair ? pickedPair(pair.value) : []
  // A Versus clone (a league match's switch) is in no Box: its INFO is its species' entry.
  const infoView = (id: string): SheetView | null => {
    if (save.box.some((p) => p.id === id)) return { kind: 'inst', id }
    const p = team.find((m) => m.id === id)
    return p ? { kind: 'dex', dex: p.dex, shiny: !!p.shiny, known: true } : null
  }
  const pick = (id: string) => {
    if (!pair) return onChange(id)
    if (picked.includes(id)) return
    pair.onChange([...picked, id].slice(-2))
  }
  return (
    <div>
      {/* A pair is two picks: said, even on the send-out's cards. */}
      {(!go || pair) && (
        <div className="mb-1 text-lg text-ink">{t(pair ? 'ui.lead.sendOutTwo' : 'ui.lead.sendOut')}</div>
      )}
      <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {team.map((p) => {
          const species = data.species[p.dex]
          if (!species) return null
          const fainted = p.currentHp <= 0
          const selected = pair ? picked.includes(p.id) : p.id === current
          // The rework's send-out step: a tap on the card picks it (outlined; the first able one to begin with), its
          // white INFO opens its details, and one GO! under the cards sends the one picked (the user's call).
          if (go)
            return (
              <PokeCard
                key={p.id}
                inst={p}
                foe={foe}
                brief
                selected={selected}
                pressed={selected}
                onOpen={() => pick(p.id)}
              >
                <PixelButton
                  size="sm"
                  className="w-full px-1"
                  aria-label={t('ui.newGame.monInfo', { name: species.name })}
                  onClick={() => setInfo(p.id)}
                >
                  {t('ui.lead.info')}
                </PixelButton>
              </PokeCard>
            )
          return (
            <PokeCard key={p.id} inst={p} foe={foe} selected={selected}>
              <PixelButton
                size="sm"
                className="w-full px-1"
                disabled={fainted}
                aria-pressed={selected}
                aria-label={t('ui.lead.sendOutName', { name: species.name })}
                onClick={() => pick(p.id)}
              >
                {selected && <PixelIcon name="check" size={14} />}
                {t(selected ? 'ui.lead.sentOut' : 'ui.lead.switch')}
              </PixelButton>
              <PixelButton
                size="sm"
                variant="ghost"
                className="w-full px-1"
                aria-label={t('ui.newGame.monInfo', { name: species.name })}
                onClick={() => setInfo(p.id)}
              >
                {t('ui.lead.info')}
              </PixelButton>
            </PokeCard>
          )
        })}
      </ul>
      <SheetModal view={info ? infoView(info) : null} onClose={() => setInfo(null)} />
    </div>
  )
}

/** A double battle's two leads: those picked still able, filled up with the first able ones, in team order. */
export function pickedPair(value: readonly string[]): string[] {
  const save = useGame.getState().save
  if (!save) return []
  const able = teamOf(save).filter((p) => p.currentHp > 0).map((p) => p.id)
  const kept = value.filter((id) => able.includes(id))
  return [...kept, ...able.filter((id) => !kept.includes(id))].slice(0, 2)
}

export function defaultLead(): string | undefined {
  const save = useGame.getState().save
  return save ? teamOf(save).find((p) => p.currentHp > 0)?.id : undefined
}
