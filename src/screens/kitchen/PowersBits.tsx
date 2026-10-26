// Kitchen sink (dev only): the battle powers (docs/35) — the plates of a Mega with its turns left, a Mega of the older
// rules and a Gigantamax; Z-MOVE with each type's hint (and disabled); the Mart's Mega Gems open (held, affordable, too
// dear), shut until the League, and with nothing for the region; each power's rules, the first time and from INFO.
import { useMemo, useState } from 'react'
import { gemItems, makeBattler, zEffectOf, type GemShelfRow, type PokeType, type PowerKind } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { PowerInfo, PowerRulesModal } from '@/components/PowersRules'
import { zMoveText } from '@/i18n/text'
import { typeName } from '@/lib/format'
import { useGame } from '@/store/game'
import { ZMoveButton } from '../battle/BattlePanel'
import { FoePlate, OwnPlate } from '../battle/Plates'
import { GemShelfView } from '../Shop'

const Z_SAMPLES: (PokeType | null)[] = [
  'ice',
  'electric',
  'fire',
  'grass',
  'psychic',
  'poison',
  'flying',
  'ground',
  'water',
  'fighting',
  'steel',
  'dragon',
  null,
]

export function PowersBits() {
  const data = useGame((s) => s.data)
  const [open, setOpen] = useState<null | { kind: PowerKind; first: boolean }>(null)
  const { megaTimed, megaLast, megaOld, gmax } = useMemo(() => {
    const lucario = makeBattler({ uid: 'p-1', dex: 448, level: 40, hp: 90 }, data)
    const pre = { dex: 448, name: lucario.name, types: lucario.types, dice: lucario.dice }
    const asMega = (turns?: number) => ({
      ...lucario,
      dex: 10059,
      name: data.species[10059]?.name ?? 'Mega Lucario',
      mega: true,
      powered: 'mega' as const,
      ...(turns != null && { megaTimer: { turns, pre } }),
    })
    const lapras = makeBattler({ uid: 'p-2', dex: 131, level: 45, hp: 120 }, data)
    return {
      megaTimed: asMega(3),
      megaLast: asMega(1),
      megaOld: asMega(),
      gmax: {
        ...lapras,
        dex: 10204,
        gmax: { turns: 1, pre: { dex: 131, name: lapras.name, types: lapras.types, dice: lapras.dice } },
      },
    }
  }, [data])
  const rows = useMemo<GemShelfRow[]>(
    () =>
      gemItems(data)
        .filter((g) =>
          ['gengarite', 'kangaskhanite', 'pinsirite', 'clefablite', 'dragoninite'].includes(g.key),
        )
        .flatMap((item, i) => {
          const mega = data.species[item.effect.mega]
          return mega ? [{ item, mega, owned: i === 0 }] : []
        }),
    [data],
  )
  return (
    <div className="grid w-full gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ['Mega, gem rules: 3 turns left', megaTimed],
          ['Mega, gem rules: its last turn', megaLast],
          ['Mega, older rules: to the end', megaOld],
          ['Gigantamax', gmax],
        ].map(([label, b]) => (
          <div key={label as string} className="relative h-[86px] bg-night">
            <OwnPlate b={b as typeof megaTimed} hp={(b as typeof megaTimed).hp} />
            <span className="absolute left-1 top-1 font-pixel-sm text-[16px] text-white">
              {label as string}
            </span>
          </div>
        ))}
        <div className="relative h-[86px] bg-night">
          <FoePlate b={megaTimed} hp={megaTimed.hp} party={{ count: 3, index: 2 }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Z_SAMPLES.map((ty) => (
          <ZMoveButton
            key={ty ?? 'untyped'}
            hint={zMoveText(zEffectOf(ty), ty ? typeName(ty) : null, data)}
            onClick={() => {}}
          />
        ))}
        <ZMoveButton hint={zMoveText('power', typeName('water'), data)} disabled onClick={() => {}} />
      </div>
      <p className="m-0 font-pixel-sm text-[16px] text-muted">
        {Z_SAMPLES.map((ty) => zMoveText(zEffectOf(ty), ty ? typeName(ty) : null, data)).join(' · ')}
      </p>
      <div className="grid gap-3">
        <GemShelfView rows={rows} gold={1500} onBuy={() => true} />
        <GemShelfView rows={rows} gold={200} onBuy={() => false} />
        <GemShelfView rows={null} gold={5000} onBuy={() => false} />
        <GemShelfView rows={[]} gold={5000} onBuy={() => false} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(['mega', 'gmax', 'z'] as const).map((kind) => (
          <PixelButton key={kind} size="sm" onClick={() => setOpen({ kind, first: true })}>
            Unlock pop-up: {kind}
          </PixelButton>
        ))}
      </div>
      <div className="grid max-w-md gap-2">
        <PowerInfo kind="mega" />
        <PowerInfo kind="gmax" />
        <PowerInfo kind="z" />
      </div>
      {open && (
        <PowerRulesModal
          kind={open.kind}
          open
          onClose={() => setOpen(null)}
          onGo={open.first ? () => setOpen(null) : undefined}
        />
      )}
    </div>
  )
}
