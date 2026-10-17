// Admin → Live events → an Underground event (docs/31): the Underground's switch and every number, in their own
// game_config row `underground` (every Underground event uses it; the server reads its switch). Shown under the live
// event's dates when its type is Underground. The yield table digs a few hundred walls the plain way at each pickaxe
// level, so the prices can be set knowing what a kit is worth.
import { useMemo } from 'react'
import {
  DEFAULT_CONFIG,
  ORB_COLOURS,
  ORB_SIZES,
  UG_LOOT,
  createRng,
  wallYield,
  type OrbColour,
  type UgLoot,
  type UndergroundConfig,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { money } from '@/lib/format'
import { AccessSwitch, Box, Field, NumInput, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'

const LOOT_NAME: Record<UgLoot, string> = {
  orbS: 'Small orb',
  orbM: 'Medium orb',
  orbL: 'Large orb',
  fossil: 'Fossil (regions opened)',
  plate: 'Plate (one not held)',
}
const COLOUR_NAME: Record<OrbColour, string> = { red: 'Red', blue: 'Blue', green: 'Green' }
const SIZE_NAME = { s: 'Small', m: 'Medium', l: 'Large' } as const
const SIM_WALLS = 300

/** The row over the defaults, one level deep, so a row missing a field still works. */
export function useUndergroundConfig(): [UndergroundConfig, (patch: Partial<UndergroundConfig>) => void] {
  const [raw, setRaw] = useConfigRow('underground')
  const d = DEFAULT_CONFIG.underground
  const r = (raw ?? {}) as Partial<UndergroundConfig>
  const cfg: UndergroundConfig = {
    ...d,
    ...r,
    kits: { ...d.kits, ...r.kits },
    wall: { ...d.wall, ...r.wall },
    loot: {
      weights: { ...d.loot.weights, ...r.loot?.weights },
      shapes: { ...d.loot.shapes, ...r.loot?.shapes },
      colours: { ...d.loot.colours, ...r.loot?.colours },
    },
    prices: Object.fromEntries(
      ORB_COLOURS.map((c) => [c, { ...d.prices[c], ...r.prices?.[c] }]),
    ) as UndergroundConfig['prices'],
    pickaxe: r.pickaxe?.length ? r.pickaxe : d.pickaxe,
  }
  return [cfg, (patch) => setRaw({ ...cfg, ...patch })]
}

/** What stops the numbers from making sense (shown, not blocking: the engine cleans them anyway). */
export function undergroundProblems(cfg: UndergroundConfig): string[] {
  const out: string[] = []
  const { cols, rows, itemsMin, itemsMax, layers } = cfg.wall
  if (itemsMax < itemsMin) out.push('Things buried: the max is below the min.')
  if (layers.every((l) => !(l > 0))) out.push('Every layer share is 0: tiles get 1 to 3 layers at random.')
  for (const k of UG_LOOT) {
    const s = cfg.loot.shapes[k]
    if (s.w > cols || s.h > rows)
      out.push(`${LOOT_NAME[k]} (${s.w}×${s.h}) is larger than the wall: it never fits.`)
  }
  cfg.pickaxe.forEach((l, i) => {
    if (l.faces.length !== 6 || l.faces.some((f) => !(f >= 1 && f <= 3)))
      out.push(`Pickaxe level ${i}: six faces from 1 to 3.`)
  })
  return out
}

export function UndergroundBox() {
  const [cfg, set] = useUndergroundConfig()
  const problems = undergroundProblems(cfg)
  const yields = useMemo(
    () => cfg.pickaxe.map((_, level) => wallYield(cfg, level, SIM_WALLS, createRng(31 + level))),
    [cfg],
  )
  const kits = (patch: Partial<UndergroundConfig['kits']>) => set({ kits: { ...cfg.kits, ...patch } })
  const wall = (patch: Partial<UndergroundConfig['wall']>) => set({ wall: { ...cfg.wall, ...patch } })
  const loot = (patch: Partial<UndergroundConfig['loot']>) => set({ loot: { ...cfg.loot, ...patch } })
  const setLevel = (i: number, patch: Partial<UndergroundConfig['pickaxe'][number]>) =>
    set({ pickaxe: cfg.pickaxe.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  return (
    <div className="flex flex-col gap-3" data-testid="underground-box">
      <Box
        title="The Underground (switch)"
        hint="Off by default. Off: no Underground anywhere, even with an event scheduled, and Arceus changes type freely. On: Arceus takes only the types of its plates. The server checks it too. Turning it off keeps every player's data."
      >
        <AccessSwitch
          value={cfg.access}
          onChange={(access) => set({ access })}
          label="Who sees the Underground"
        />
      </Box>

      <Box
        title="Explorakits"
        hint="One kit opens one wall. Sold in every region's Poké Mart while the event runs, never in a small world's. Unused kits are lost when the event ends."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Field label="Mart price (₽)">
            <NumInput value={cfg.kits.price} min={1} onChange={(v) => kits({ price: v ?? 1 })} />
          </Field>
          <Field label="Limit per player" hint="0 = no limit.">
            <NumInput value={cfg.kits.limit} min={0} onChange={(v) => kits({ limit: v ?? 0 })} />
          </Field>
          <Field
            label="Free kits"
            hint={`One every ${cfg.kits.freeAmount > 0 ? Math.round((cfg.kits.freePeriodHours / cfg.kits.freeAmount) * 10) / 10 : '—'} h.`}
          >
            <NumInput value={cfg.kits.freeAmount} min={0} onChange={(v) => kits({ freeAmount: v ?? 0 })} />
          </Field>
          <Field label="…every (hours)">
            <NumInput
              value={cfg.kits.freePeriodHours}
              min={1}
              onChange={(v) => kits({ freePeriodHours: v ?? 24 })}
            />
          </Field>
          <Field label="Free kits waiting, max">
            <NumInput value={cfg.kits.freeCap} min={0} onChange={(v) => kits({ freeCap: v ?? 0 })} />
          </Field>
        </div>
      </Box>

      <Box
        title="The wall"
        hint="A strike takes the roll off the tile and the roll minus the neighbours' loss off each of its 4 neighbours."
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Field label="Columns">
            <NumInput value={cfg.wall.cols} min={3} max={12} onChange={(v) => wall({ cols: v ?? 6 })} />
          </Field>
          <Field label="Rows">
            <NumInput value={cfg.wall.rows} min={3} max={12} onChange={(v) => wall({ rows: v ?? 6 })} />
          </Field>
          <Field label="Strikes before it collapses">
            <NumInput
              value={cfg.wall.strikes}
              min={1}
              max={200}
              onChange={(v) => wall({ strikes: v ?? 15 })}
            />
          </Field>
          <Field label="Things buried, min">
            <NumInput
              value={cfg.wall.itemsMin}
              min={1}
              max={12}
              onChange={(v) => wall({ itemsMin: v ?? 1 })}
            />
          </Field>
          <Field label="Things buried, max">
            <NumInput
              value={cfg.wall.itemsMax}
              min={1}
              max={12}
              onChange={(v) => wall({ itemsMax: v ?? 1 })}
            />
          </Field>
          <Field label="Neighbours' loss" hint="0 = as much as the tile.">
            <NumInput
              value={cfg.wall.neighbourLoss}
              min={0}
              max={3}
              onChange={(v) => wall({ neighbourLoss: v ?? 1 })}
            />
          </Field>
          {[0, 1, 2].map((i) => (
            <Field key={i} label={`${i + 1} layer${i ? 's' : ''} (share)`}>
              <NumInput
                value={cfg.wall.layers[i]}
                min={0}
                onChange={(v) =>
                  wall({
                    layers: cfg.wall.layers.map((l, j) => (j === i ? (v ?? 0) : l)) as [
                      number,
                      number,
                      number,
                    ],
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Box>

      <Box
        title="What's buried"
        hint="Each thing of a wall is drawn by weight. A plate the player holds is never buried again; with all 17, or no fossil to find, those weights go to the orbs."
      >
        <table className="w-full text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal">Thing</th>
              <th className="font-normal">Weight</th>
              <th className="font-normal">Width</th>
              <th className="font-normal">Height</th>
            </tr>
          </thead>
          <tbody>
            {UG_LOOT.map((k) => (
              <tr key={k}>
                <td>{LOOT_NAME[k]}</td>
                <td>
                  <NumInput
                    className="w-20"
                    value={cfg.loot.weights[k]}
                    min={0}
                    onChange={(v) => loot({ weights: { ...cfg.loot.weights, [k]: v ?? 0 } })}
                  />
                </td>
                <td>
                  <NumInput
                    className="w-16"
                    value={cfg.loot.shapes[k].w}
                    min={1}
                    max={12}
                    onChange={(v) =>
                      loot({ shapes: { ...cfg.loot.shapes, [k]: { ...cfg.loot.shapes[k], w: v ?? 1 } } })
                    }
                  />
                </td>
                <td>
                  <NumInput
                    className="w-16"
                    value={cfg.loot.shapes[k].h}
                    min={1}
                    max={12}
                    onChange={(v) =>
                      loot({ shapes: { ...cfg.loot.shapes, [k]: { ...cfg.loot.shapes[k], h: v ?? 1 } } })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-3 gap-2">
          {ORB_COLOURS.map((c) => (
            <Field key={c} label={`${COLOUR_NAME[c]} orbs (odds)`}>
              <NumInput
                value={cfg.loot.colours[c]}
                min={0}
                onChange={(v) => loot({ colours: { ...cfg.loot.colours, [c]: v ?? 0 } })}
              />
            </Field>
          ))}
        </div>
      </Box>

      <Box
        title="Teams and orb prices"
        hint="Teams of 3 friends, one colour each (dealt at random). Every orb goes to whoever holds its colour; orbs sell for the ₽ of the region being played. Unsold orbs are lost when the event ends."
      >
        <label className="flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            checked={cfg.sellNeedsFull}
            onChange={(e) => set({ sellNeedsFull: e.target.checked })}
          />
          Orbs sell only in a full team of 3
        </label>
        <table className="w-full text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal">Colour</th>
              {ORB_SIZES.map((sz) => (
                <th key={sz} className="font-normal">
                  {SIZE_NAME[sz]} (₽)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORB_COLOURS.map((c) => (
              <tr key={c}>
                <td>{COLOUR_NAME[c]}</td>
                {ORB_SIZES.map((sz) => (
                  <td key={sz}>
                    <NumInput
                      className="w-24"
                      value={cfg.prices[c][sz]}
                      min={0}
                      onChange={(v) =>
                        set({ prices: { ...cfg.prices, [c]: { ...cfg.prices[c], [sz]: v ?? 0 } } })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box
        title="Pickaxe"
        hint={`Back to level 0 each event. A wall's yield: ${SIM_WALLS} walls dug the plain way at each level (half-uncovered things first, else the most layers), orbs at the prices above.`}
      >
        <table className="w-full text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal">Level</th>
              <th className="font-normal">Die faces</th>
              <th className="font-normal">Price (₽)</th>
              <th className="font-normal">A wall gives</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cfg.pickaxe.map((l, i) => {
              const y = yields[i]
              return (
                <tr key={i}>
                  <td>{i}</td>
                  <td>
                    <input
                      className={inputCls}
                      aria-label={`Level ${i} faces`}
                      defaultValue={l.faces.join(' ')}
                      onBlur={(e) => {
                        const faces = e.target.value
                          .trim()
                          .split(/[\s,]+/)
                          .map(Number)
                        if (faces.length === 6 && faces.every((f) => f >= 1 && f <= 3)) setLevel(i, { faces })
                        else e.target.value = l.faces.join(' ')
                      }}
                    />
                  </td>
                  <td>
                    {i === 0 ? (
                      'start'
                    ) : (
                      <NumInput
                        className="w-28"
                        value={l.price}
                        min={0}
                        onChange={(v) => setLevel(i, { price: v ?? 0 })}
                      />
                    )}
                  </td>
                  <td className="text-base text-muted">
                    {y &&
                      `${y.won.toFixed(1)} of ${y.hidden.toFixed(1)} things · ${money(Math.round(y.orbGold))} in orbs · ${Math.round(y.cleared * 100)} % cleared`}
                  </td>
                  <td>
                    {i > 0 && i === cfg.pickaxe.length - 1 && (
                      <PixelButton size="sm" onClick={() => set({ pickaxe: cfg.pickaxe.slice(0, -1) })}>
                        Remove
                      </PixelButton>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div>
          <PixelButton
            size="sm"
            disabled={cfg.pickaxe.length >= 16}
            onClick={() => {
              const last = cfg.pickaxe[cfg.pickaxe.length - 1]!
              set({ pickaxe: [...cfg.pickaxe, { faces: [...last.faces], price: last.price }] })
            }}
          >
            Add a level
          </PixelButton>
        </div>
      </Box>

      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-lg text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
