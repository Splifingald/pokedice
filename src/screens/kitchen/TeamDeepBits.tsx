// Kitchen sink: the Team's deep pass (docs/43 §5.4). The one Pokémon card in every state (lead, picked, fainted,
// resting after a K.O., a fossil reviving, shiny, with its XP line, a drop target), the Box's tile with its level tag
// (picked, locked, reviving), the Box's one Sort & filter control (nothing set, two set), the sheet's footer at a
// Center (a team member, the lead, one from the Box with room, the team full) with the save this browser holds, and the
// Team screen's top line on team changes in its four places.
import { useState } from 'react'
import { BoxFilter, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { MonTile, TILE_GRID } from '@/components/MonTile'
import { PixelButton } from '@/components/PixelButton'
import { PokeCard } from '@/components/PokeCard'
import { TeamSwapDock, TeamSwapsNote, type TeamSwapPlace } from '@/components/TeamSwapActions'
import { teamOf, type PokemonInstance, type PokeType } from '@/engine'
import { useGame } from '@/store/game'

const mon = (over: Partial<PokemonInstance>): PokemonInstance => ({
  id: 'ks-team',
  dex: 4,
  level: 24,
  xp: 40,
  currentHp: 60,
  caughtAt: 0,
  ...over,
})

const CARDS: { label: string; inst: PokemonInstance; lead?: boolean; selected?: boolean; drop?: boolean }[] = [
  { label: 'Lead', inst: mon({ id: 'ks-t1' }), lead: true },
  { label: 'Picked (docked sheet)', inst: mon({ id: 'ks-t2', dex: 25, level: 9, currentHp: 12 }), selected: true },
  { label: 'Fainted', inst: mon({ id: 'ks-t3', dex: 16, level: 7, currentHp: 0 }) },
  { label: 'Resting (Extreme)', inst: mon({ id: 'ks-t4', dex: 74, currentHp: 0, koAt: Date.now() - 3_600_000 }) },
  {
    label: 'Fossil reviving',
    inst: mon({ id: 'ks-t5', dex: 138, level: 20, fossil: 'helix-fossil', revivesAt: Date.now() + 3_600_000 }),
  },
  { label: 'Shiny', inst: mon({ id: 'ks-t6', dex: 6, level: 52, shiny: true }) },
  { label: 'Drop target (drag)', inst: mon({ id: 'ks-t7', dex: 7, level: 18 }), drop: true },
]

const TYPES: PokeType[] = ['normal', 'fire', 'water', 'grass', 'electric', 'rock']
const PLACES: TeamSwapPlace[] = ['center', 'portal', 'nightmare', 'closed']

export function TeamDeepBits() {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const [picked, setPicked] = useState('ks-tile-2')
  const [sort, setSort] = useState<Exclude<BoxSort, 'type'>>('dex')
  const [type, setType] = useState<PokeType | 'all'>('all')
  const [sort2, setSort2] = useState<Exclude<BoxSort, 'type'>>('level')
  const [type2, setType2] = useState<PokeType | 'all'>('fire')
  const team = save ? teamOf(save) : []
  const boxed = save?.box.find((p) => !save.team.includes(p.id) && p.revivesAt == null)
  const useItem = (
    <PixelButton size="lg" className="min-w-0">
      <PixelIcon name="potion" size={20} />
      Use an item
    </PixelButton>
  )
  return (
    <div className="grid w-full gap-4">
      <b className="text-lg">PokeCard: the one card (Team, Center, send-out, between encounters)</b>
      <ul className="grid max-w-xl grid-cols-3 gap-2">
        {CARDS.map((c) => (
          <PokeCard
            key={c.inst.id}
            inst={c.inst}
            lead={c.lead}
            xp
            selected={c.selected}
            onOpen={() => {}}
            className={c.drop ? 'outline-dashed outline-[3px] outline-offset-2 outline-danger' : undefined}
          >
            <small className="font-pixel-sm text-[16px] text-muted">{c.label}</small>
          </PokeCard>
        ))}
      </ul>

      <b className="text-lg">MonTile with its level tag: plain, picked, locked, reviving, shiny</b>
      <ul className={`${TILE_GRID} max-w-xl`}>
        {[
          { id: 'ks-tile-1', dex: 1, level: 12 },
          { id: 'ks-tile-2', dex: 25, level: 30 },
          { id: 'ks-tile-3', dex: 92, level: 40, locked: true },
          { id: 'ks-tile-4', dex: 138, level: 20, reviving: true },
          { id: 'ks-tile-5', dex: 133, level: 9, shiny: true },
        ].map((m) => (
          <li key={m.id}>
            <MonTile
              dex={m.dex}
              name={data.species[m.dex]?.name ?? '?'}
              level={m.reviving ? undefined : `Lv.${m.level}`}
              sub={m.reviving ? '0:59' : undefined}
              icon={m.reviving ? <ItemSprite item={data.items['helix-fossil']} size={40} /> : undefined}
              locked={m.locked}
              selected={picked === m.id}
              label={data.species[m.dex]?.name ?? '?'}
              onClick={() => setPicked(m.id)}
              tags={m.shiny && <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />}
            />
          </li>
        ))}
      </ul>

      <b className="text-lg">BoxFilter: nothing set; two set (Level, Fire)</b>
      <div className="flex flex-wrap gap-3">
        <BoxFilter
          sort={sort}
          onSort={setSort}
          sorts={['dex', 'level', 'newest']}
          type={type}
          onType={setType}
          types={TYPES}
          shown={28}
        />
        <BoxFilter
          sort={sort2}
          onSort={setSort2}
          sorts={['dex', 'level', 'newest']}
          type={type2}
          onType={setType2}
          types={TYPES}
          shown={3}
        />
      </div>

      <b className="text-lg">TeamSwapDock: the sheet's footer at a Center (with this browser's save)</b>
      {save ? (
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          {[team[1], team[0], boxed].map(
            (inst, i) =>
              inst && (
                <div key={`${inst.id}-${i}`} className="pixel-panel p-3">
                  <TeamSwapDock inst={inst} useItem={useItem} onDone={() => {}} />
                </div>
              ),
          )}
          <div className="pixel-panel p-3">
            <TeamSwapDock
              inst={mon({ id: 'ks-reviving', dex: 138, revivesAt: Date.now() + 60_000 })}
              useItem={null}
              onDone={() => {}}
            />
          </div>
        </div>
      ) : (
        <p className="copy text-muted">Start a game to see the dock with a team.</p>
      )}

      <b className="text-lg">
        TeamSwapsNote: the Team screen&apos;s top at a Center, at a portal&apos;s and the nightmare&apos;s way
        in, and elsewhere (changes wait for a Center)
      </b>
      <div className="grid max-w-3xl gap-3">
        {PLACES.map((at) => (
          <TeamSwapsNote key={at} at={at} onBack={() => {}} />
        ))}
      </div>
    </div>
  )
}
