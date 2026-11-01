// Admin → Areas: an area's special mode (docs/28). The portal run: Distortion World's, and the Hall of Origin's dressed
// as the Stairway of Plates (docs/64 §4.5). Their two switches (the game_config rows `portalRun` and `platesRun`, which
// the server reads too: a run dressed as the Stairway answers to its own), its look, every number of the area's run
// and its raid's, the raid Pokémon's type on each bar among them.
import type { Row } from '@/config/mapping'
import {
  DEFAULT_PORTAL_RUN,
  normalisePortal,
  PLATE_BARS,
  POKE_TYPES,
  portalSkin,
  type PokeType,
  type PortalRunMode,
  type PortalSkin,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { updateRow, rowKey, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

/**
 * The raid Pokémon's type as each bar starts (Arceus changing its Plate: Normal → Ice → Steel → Dragon in the Hall of
 * Origin). Bar by bar; "—" ends the list there (it keeps its type from then on). Only a Pokémon with type forms
 * (Arceus) changes; any other ignores it.
 */
function BarTypes({
  mode,
  onChange,
}: {
  mode: PortalRunMode
  onChange: (barTypes: PokeType[] | undefined) => void
}) {
  const list = mode.raid.barTypes ?? []
  const set = (next: PokeType[]) => onChange(next.length ? next : undefined)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-lg">
        Raid Pokémon’s type on each bar{' '}
        <span className="text-base text-muted">
          (its type form, announced as it takes the bar’s Plate; Arceus only)
        </span>
      </span>
      <div className="flex flex-wrap items-end gap-2">
        {Array.from({ length: mode.raid.bars }, (_, i) => (
          <Field key={i} label={`Bar ${i + 1}`}>
            <select
              className={inputCls}
              aria-label={`Raid bar ${i + 1}: its type`}
              value={list[i] ?? ''}
              disabled={i > list.length}
              onChange={(e) => {
                const v = e.target.value as PokeType | ''
                set(v ? [...list.slice(0, i), v, ...list.slice(i + 1)] : list.slice(0, i))
              }}
            >
              <option value="">— (keeps its type)</option>
              {POKE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        ))}
        <PixelButton size="sm" onClick={() => set([...PLATE_BARS])}>
          The Hall of Origin’s Plates
        </PixelButton>
        <PixelButton size="sm" variant="danger" onClick={() => set([])}>
          None
        </PixelButton>
      </div>
    </div>
  )
}

export function PortalModeBox({ area }: { area: Row }) {
  const data = useAdminData()
  const [sw, setSw] = useConfigRow('portalRun')
  const [platesSw, setPlatesSw] = useConfigRow('platesRun')
  const access = sw?.access ?? 'off'
  const platesAccess = platesSw?.access ?? 'off'
  const mode = normalisePortal(area.mode)
  const set = (next: PortalRunMode | null) => updateRow('areas', rowKey('areas', area), { mode: next })
  const patch = (p: Partial<PortalRunMode>) => mode && set({ ...mode, ...p })
  const num = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    opts: { min?: number; max?: number; hint?: string } = {},
  ) => (
    <Field label={label} hint={opts.hint}>
      <NumInput min={opts.min ?? 0} max={opts.max} value={value} onChange={(v) => onChange(v ?? 0)} />
    </Field>
  )
  return (
    <Box
      title="Special mode: portal run"
      icon="star"
      hint="Distortion World's mode (docs/28), also the Hall of Origin's Stairway of Plates (docs/64 §4.5): no rounds and no Pokémon Center; the team is healed going in and can't leave until it wins or is K.O. An endless deck of wild Pokémon (never caught) and finds, each cycle ending on a distortion that offers boons; the last one wins for good and opens the area's raid at the numbers below. A wipe keeps XP, ₽ and items but closes the portals back to 0."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Distortion World runs (every area)</span>
        <AccessSwitch
          value={access}
          onChange={(a) => setSw({ access: a })}
          label="Distortion World runs: who plays them"
        />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: portal areas in the Distortion World look play their run; their raid opens once it is won.'
            : access === 'admin'
              ? 'Only you (signed in) play them; other players see the areas as before.'
              : 'Off: those areas play as before (rounds, Centers, their raid once cleared). Runs in saves are kept.'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Stairway of Plates (every area)</span>
        <AccessSwitch
          value={platesAccess}
          onChange={(a) => setPlatesSw({ access: a })}
          label="Stairway of Plates: who climbs it"
        />
        <span className="text-base text-muted">
          {platesAccess === 'all'
            ? 'Every player: portal areas in the Stairway of Plates look play their climb; their raid opens once it is won.'
            : platesAccess === 'admin'
              ? 'Only you (signed in) climb it; other players see the areas as before.'
              : 'Off: those areas play as before (rounds, Centers, their raid once cleared). Climbs in saves are kept.'}
        </span>
      </div>
      <label className="flex items-center gap-2 text-lg">
        <input
          type="checkbox"
          checked={!!mode}
          onChange={(e) => set(e.target.checked ? DEFAULT_PORTAL_RUN : null)}
        />{' '}
        This area is a portal run
      </label>
      {mode && (
        <>
          <Field
            label="Its look"
            hint="The same rules and numbers either way; only the words and the effects change (docs/64 §4.5)."
          >
            <select
              className={inputCls}
              value={portalSkin(mode)}
              onChange={(e) => {
                const skin = e.target.value as PortalSkin
                // Distortion World's look is the default: no `skin` written for it, so its mode reads as before.
                const { skin: _old, ...rest } = mode
                set(skin === 'plates' ? { ...rest, skin } : rest)
              }}
            >
              <option value="distortion">Distortion World: portals, distortions, Giratina</option>
              <option value="plates">Stairway of Plates: landings, altars, Plates, Arceus</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num('Portals to close', mode.portals, (v) => patch({ portals: v }), {
              min: 1,
              max: 99,
              hint: 'the gauge, 0/10',
            })}
            {num('Wild cards per cycle', mode.wild, (v) => patch({ wild: v }), { max: 30 })}
            {num('Find cards per cycle', mode.items, (v) => patch({ items: v }), {
              max: 30,
              hint: 'from the area’s loot',
            })}
            {num('Boons offered', mode.offers, (v) => patch({ offers: v }), {
              min: 1,
              max: 5,
              hint: 'distinct kinds',
            })}
          </div>
          <table className="w-full text-lg">
            <thead>
              <tr className="text-left">
                <th className="font-normal">Boon</th>
                <th className="font-normal">Weight</th>
                <th className="font-normal">Its number</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Heal those standing (% of max HP)</td>
                <td>
                  <NumInput
                    min={0}
                    value={mode.heal.weight}
                    onChange={(v) => patch({ heal: { ...mode.heal, weight: v ?? 0 } })}
                  />
                </td>
                <td>
                  <NumInput
                    min={0}
                    max={100}
                    value={mode.heal.percent}
                    onChange={(v) => patch({ heal: { ...mode.heal, percent: v ?? 0 } })}
                  />
                </td>
              </tr>
              <tr>
                <td>Revive one K.O. (a Revive’s HP)</td>
                <td>
                  <NumInput
                    min={0}
                    value={mode.revive.weight}
                    onChange={(v) => patch({ revive: { weight: v ?? 0 } })}
                  />
                </td>
                <td />
              </tr>
              <tr>
                <td>+ damage on a team type’s attacks</td>
                <td>
                  <NumInput
                    min={0}
                    value={mode.boost.weight}
                    onChange={(v) => patch({ boost: { ...mode.boost, weight: v ?? 0 } })}
                  />
                </td>
                <td>
                  <NumInput
                    min={0}
                    max={999}
                    value={mode.boost.amount}
                    onChange={(v) => patch({ boost: { ...mode.boost, amount: v ?? 0 } })}
                  />
                </td>
              </tr>
              <tr>
                <td>An extra die (max dice per Pokémon)</td>
                <td>
                  <NumInput
                    min={0}
                    value={mode.die.weight}
                    onChange={(v) => patch({ die: { ...mode.die, weight: v ?? 0 } })}
                  />
                </td>
                <td>
                  <NumInput
                    min={1}
                    max={12}
                    value={mode.die.maxDice}
                    onChange={(v) => patch({ die: { ...mode.die, maxDice: v ?? 8 } })}
                  />
                </td>
              </tr>
              <tr>
                <td>A rare item (odds below)</td>
                <td>
                  <NumInput
                    min={0}
                    value={mode.item.weight}
                    onChange={(v) => patch({ item: { ...mode.item, weight: v ?? 0 } })}
                  />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <div className="flex flex-col gap-2">
            {mode.item.items.map((it, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="Item">
                  <select
                    className={inputCls}
                    value={it.key}
                    onChange={(e) =>
                      patch({
                        item: {
                          ...mode.item,
                          items: mode.item.items.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                        },
                      })
                    }
                  >
                    {Object.values(data?.items ?? {}).map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Weight">
                  <NumInput
                    min={0}
                    value={it.weight}
                    onChange={(v) =>
                      patch({
                        item: {
                          ...mode.item,
                          items: mode.item.items.map((x, j) => (j === i ? { ...x, weight: v ?? 0 } : x)),
                        },
                      })
                    }
                  />
                </Field>
                <PixelButton
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    patch({ item: { ...mode.item, items: mode.item.items.filter((_, j) => j !== i) } })
                  }
                >
                  Remove
                </PixelButton>
              </div>
            ))}
            <PixelButton
              size="sm"
              onClick={() =>
                patch({ item: { ...mode.item, items: [...mode.item.items, { key: 'revive', weight: 10 }] } })
              }
            >
              Add an item
            </PixelButton>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {num('Raid level', mode.raid.level, (v) => patch({ raid: { ...mode.raid, level: v } }), {
              min: 1,
              max: 100,
              hint: 'its boss, once the run is won',
            })}
            {num(
              'Raid foe dice level',
              mode.raid.upgradeLevel,
              (v) => patch({ raid: { ...mode.raid, upgradeLevel: v } }),
              { min: 1, max: 10 },
            )}
            {num('Raid HP bars', mode.raid.bars, (v) => patch({ raid: { ...mode.raid, bars: v } }), {
              min: 1,
              max: 10,
            })}
            {num(
              'Raid team level cap',
              mode.raid.teamCap,
              (v) => patch({ raid: { ...mode.raid, teamCap: v } }),
              { min: 1, max: 100, hint: 'teams from the world’s Box' },
            )}
          </div>
          <BarTypes mode={mode} onChange={(barTypes) => patch({ raid: { ...mode.raid, barTypes } })} />
        </>
      )}
    </Box>
  )
}
