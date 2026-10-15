// Admin → Areas: an area's special mode (docs/28). Only the portal run exists: Distortion World's. Its switch (the
// game_config row `portalRun`, which the server reads too) and every number of the area's run.
import type { Row } from '@/config/mapping'
import { DEFAULT_PORTAL_RUN, normalisePortal, type PortalRunMode } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { updateRow, rowKey, useAdminData } from '../store'
import { AccessSwitch, Box, Field, NumInput, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

export function PortalModeBox({ area }: { area: Row }) {
  const data = useAdminData()
  const [sw, setSw] = useConfigRow('portalRun')
  const access = sw?.access ?? 'off'
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
      hint="Distortion World's mode (docs/28): no rounds and no Pokémon Center; the team is healed going in and can't leave until it wins or is K.O. An endless deck of wild Pokémon (never caught) and finds, each cycle ending on a distortion that offers boons; the last one wins for good and opens the area's raid at the numbers below. A wipe keeps XP, ₽ and items but closes the portals back to 0."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Portal runs (every area)</span>
        <AccessSwitch
          value={access}
          onChange={(a) => setSw({ access: a })}
          label="Portal runs: who plays them"
        />
        <span className="text-base text-muted">
          {access === 'all'
            ? 'Every player: portal areas play their run; their raid opens once it is won.'
            : access === 'admin'
              ? 'Only you (signed in) play the runs; other players see the areas as before.'
              : 'Off: portal areas play as before (rounds, Centers, their raid once cleared). Runs in saves are kept.'}
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
        </>
      )}
    </Box>
  )
}
