// Admin → Live events → a Gift calendar (docs/55): its own switch (game_config `giftCalendar`, Off by default), how
// many days, and each day's one reward: an item and how many, Pokédollars, or a Pokémon (its level, shiny or not, and
// how many). Shown under the live event's start when its type is Gift calendar; the start and the days set its end
// (the day after the last, the last door's catch-up). "Fill with the Advent proposal" puts in 24 winter days.
import { ItemSprite } from '@/components/ItemSprite'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import {
  CALENDAR_MAX_DAYS,
  CALENDAR_MON_MAX,
  GIFT_GOLD_MAX,
  GIFT_QTY_MAX,
  resizeCalendar,
  type CalendarReward,
  type GameData,
  type ItemDef,
  type LiveEvent,
  hasOutfit,
} from '@/engine'
import { AccessSwitch, Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { useConfigRow } from './ConfigSection'
import { OutfitSelect } from '../OutfitSelect'

const DAY = 24 * 3_600_000

/**
 * Advent, 1 to 24 December (the user's ask, 2026-10-31; toned down the same day, "way too generous"): small things a
 * day, as a trainer's ₽ goes (a whole region pays about ₽6,000). Balls, potions and heals, ₽1,000 over the month, one
 * Rare Candy, one Ice Stone (for Day 23's Eevee, Glaceon), winter Pokémon at Lv.5, and Santa Pikachu on the 24th (in
 * its hat while the outfits' switch is on, docs/59; a plain Pikachu while it's off).
 */
export const ADVENT_PROPOSAL: CalendarReward[] = [
  { kind: 'item', key: 'poke-ball', qty: 5 },
  { kind: 'gold', amount: 100 },
  { kind: 'item', key: 'potion', qty: 5 },
  { kind: 'pokemon', dex: 220, level: 5, qty: 1 },
  { kind: 'item', key: 'great-ball', qty: 3 },
  { kind: 'gold', amount: 150 },
  { kind: 'item', key: 'super-potion', qty: 3 },
  { kind: 'pokemon', dex: 361, level: 5, qty: 1 },
  { kind: 'item', key: 'ice-heal', qty: 3 },
  { kind: 'gold', amount: 200 },
  { kind: 'item', key: 'ether', qty: 2 },
  { kind: 'pokemon', dex: 363, level: 5, qty: 1 },
  { kind: 'item', key: 'great-ball', qty: 5 },
  { kind: 'item', key: 'rare-candy', qty: 1 },
  { kind: 'gold', amount: 250 },
  { kind: 'pokemon', dex: 613, level: 5, qty: 1 },
  { kind: 'item', key: 'hyper-potion', qty: 2 },
  { kind: 'item', key: 'ultra-ball', qty: 2 },
  { kind: 'pokemon', dex: 459, level: 5, qty: 1 },
  { kind: 'gold', amount: 300 },
  { kind: 'item', key: 'revive', qty: 2 },
  { kind: 'item', key: 'ice-stone', qty: 1 },
  { kind: 'pokemon', dex: 133, level: 5, qty: 1 },
  { kind: 'pokemon', dex: 25, level: 10, outfit: 'santa', qty: 1 },
]

/** The gift calendar's switch, over the live events' own: Off, no calendar shows, whatever the list says. */
export function GiftCalendarSwitch() {
  const [cfg, setCfg] = useConfigRow('giftCalendar')
  const access = cfg?.access ?? 'off'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg">Gift calendars</span>
      <AccessSwitch
        value={access}
        onChange={(a) => setCfg({ ...cfg, access: a })}
        label="Gift calendars: who sees them"
      />
      <span className="text-base text-muted">
        {access === 'all'
          ? 'Every player sees a calendar while it runs.'
          : access === 'admin'
            ? 'Only you, signed in as admin, see them (to try one first).'
            : 'Off: no calendar shows, whatever the list says.'}
      </span>
    </div>
  )
}

const KIND_NAME: Record<CalendarReward['kind'], string> = {
  item: 'Item',
  gold: 'Pokédollars',
  pokemon: 'Pokémon',
}

/** A reward of another kind, from what the admin picked before where it fits. */
function switchKind(r: CalendarReward, kind: CalendarReward['kind']): CalendarReward {
  if (kind === r.kind) return r
  if (kind === 'gold') return { kind, amount: 1000 }
  if (kind === 'item') return { kind, key: 'rare-candy', qty: r.kind === 'pokemon' ? r.qty : 1 }
  return { kind, dex: 25, level: 10, qty: 1 }
}

const clamp = (v: number | null, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v ?? lo)))

/** One day's reward: its kind, then what it is and how many. */
function DayRow({
  day,
  date,
  r,
  set,
  data,
  items,
}: {
  day: number
  date: string
  r: CalendarReward
  set: (r: CalendarReward) => void
  data: GameData
  items: ItemDef[]
}) {
  return (
    <tr className="border-t-2 border-line align-top">
      <td className="whitespace-nowrap px-1 py-1">
        <div className="leading-none">Day {day}</div>
        <div className="text-sm text-muted">{date}</div>
      </td>
      <td className="w-36 px-1 py-1">
        <select
          className={inputCls}
          value={r.kind}
          aria-label={`Day ${day}: kind of gift`}
          onChange={(e) => set(switchKind(r, e.target.value as CalendarReward['kind']))}
        >
          {(Object.keys(KIND_NAME) as CalendarReward['kind'][]).map((k) => (
            <option key={k} value={k}>
              {KIND_NAME[k]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        {r.kind === 'gold' && (
          <label className="flex w-40 flex-col text-base">
            ₽
            <NumInput
              value={r.amount}
              min={1}
              max={GIFT_GOLD_MAX}
              onChange={(v) => set({ ...r, amount: clamp(v, 1, GIFT_GOLD_MAX) })}
            />
          </label>
        )}
        {r.kind === 'item' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[200px] flex-1 flex-col text-base">
              Item
              <SearchSelect
                options={items}
                value={data.items[r.key] ?? null}
                onChange={(i) => i && set({ ...r, key: i.key })}
                getKey={(i) => i.key}
                getLabel={(i) => `${i.name} ${i.key}`}
                renderOption={(i) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <ItemSprite item={i} size={24} />
                    <span className="truncate">{i.name}</span>
                  </span>
                )}
                placeholder={data.items[r.key] ? 'Pick an item…' : `Unknown: ${r.key}`}
              />
            </label>
            <label className="flex w-24 flex-col text-base">
              How many
              <NumInput
                value={r.qty}
                min={1}
                max={GIFT_QTY_MAX}
                onChange={(v) => set({ ...r, qty: clamp(v, 1, GIFT_QTY_MAX) })}
              />
            </label>
          </div>
        )}
        {r.kind === 'pokemon' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[200px] flex-1 flex-col text-base">
              Pokémon
              <PokemonPicker
                data={data}
                value={r.dex}
                // An outfit stays only on a species that wears it (docs/59).
                onChange={(dex) => {
                  const { outfit, ...rest } = r
                  set({ ...rest, dex, ...(outfit && hasOutfit(outfit, dex) && { outfit }) })
                }}
              />
            </label>
            <label className="flex w-20 flex-col text-base">
              Level
              <NumInput
                value={r.level}
                min={1}
                max={data.config.maxLevel}
                onChange={(v) => set({ ...r, level: clamp(v, 1, data.config.maxLevel) })}
              />
            </label>
            <label className="flex min-h-[34px] items-center gap-1.5 text-lg">
              <input
                type="checkbox"
                checked={!!r.shiny}
                onChange={(e) => set(e.target.checked ? { ...r, shiny: true } : { ...r, shiny: undefined })}
              />
              Shiny
            </label>
            <OutfitSelect
              dex={r.dex}
              value={r.outfit}
              onChange={(outfit) => {
                const { outfit: _old, ...rest } = r
                set({ ...rest, ...(outfit && { outfit }) })
              }}
            />
            <label className="flex w-20 flex-col text-base">
              How many
              <NumInput
                value={r.qty}
                min={1}
                max={CALENDAR_MON_MAX}
                onChange={(v) => set({ ...r, qty: clamp(v, 1, CALENDAR_MON_MAX) })}
              />
            </label>
          </div>
        )}
      </td>
    </tr>
  )
}

/** The days and their rewards (the start is the live event's own field, above). */
export function CalendarEditor({
  e,
  set,
  data,
}: {
  e: LiveEvent
  set: (days: CalendarReward[]) => void
  data: GameData
}) {
  const days = e.calendar.days
  const items = Object.values(data.items).sort((a, b) => a.name.localeCompare(b.name))
  const start = Date.parse(e.start)
  const dateOf = (day: number) =>
    Number.isFinite(start)
      ? new Date(start + (day - 1) * DAY).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        })
      : ''
  return (
    <div className="grid gap-2">
      <GiftCalendarSwitch />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Days" hint={`1 to ${CALENDAR_MAX_DAYS}. New days copy the last one.`} className="w-32">
          <NumInput
            value={days.length}
            min={1}
            max={CALENDAR_MAX_DAYS}
            onChange={(v) => set(resizeCalendar(days, v ?? 1))}
          />
        </Field>
        <PixelButton
          size="sm"
          onClick={() => {
            if (!days.length || window.confirm('Replace every day with the Advent proposal (24 days)?'))
              set([...ADVENT_PROPOSAL])
          }}
        >
          Fill with the Advent proposal (24 days)
        </PixelButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-lg">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-1 font-normal">Day (UTC)</th>
              <th className="px-1 font-normal">Gift</th>
              <th className="px-1 font-normal">What, and how many</th>
            </tr>
          </thead>
          <tbody>
            {days.map((r, i) => (
              <DayRow
                key={i}
                day={i + 1}
                date={dateOf(i + 1)}
                r={r}
                data={data}
                items={items}
                set={(next) => set(days.map((x, j) => (j === i ? next : x)))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-base text-muted">
        One gift a day, in a quantity. A door opens at the start's time each day; a player can still open it
        the next day, then it's missed. Gifts land in the region the player is playing (its Bag, ₽, Box or
        team). Not in Extreme mode, nor inside a small world.
      </p>
    </div>
  )
}
