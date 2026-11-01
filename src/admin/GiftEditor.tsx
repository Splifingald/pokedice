// Admin: the gifts a message carries (docs/15 §23), in Messages (an answer) and on a player's profile (a message you
// start). Items with a quantity, Pokémon with a level and shininess, Pokédollars; each to a region, or to the player's
// latest one. A message to an account can carry Heart Scales too (docs/60), straight to the player's wallet.
// The same editor in both places, and the same line to read them back.
import { useState } from 'react'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { SpriteImg } from '@/components/SpriteImg'
import {
  GIFT_CURRENT,
  GIFT_GOLD_MAX,
  GIFT_LATEST,
  GIFT_MAX,
  GIFT_QTY_MAX,
  GIFT_SCALES_MAX,
  giftLanding,
  realRegions,
  type GameData,
  type Gift,
  type GiftRegion,
  type ItemDef,
  type SaveData,
  hasOutfit
} from '@/engine'
import { cx } from '@/theme/util'
import { useConfigRow } from './sections/ConfigSection'
import { AccessSwitch, inputCls, NumInput, PokemonPicker } from './widgets'
import { OutfitSelect } from './OutfitSelect'

export const regionLabel = (data: GameData, r: GiftRegion) =>
  r === GIFT_LATEST
    ? 'their latest region'
    : r === GIFT_CURRENT
      ? 'the region they play when they open it'
      : (data.regions.find((x) => x.id === r)?.name ?? r)

/** "Rare Candy ×5" / "Pikachu Lv.20 ✦ shiny" / "₽5,000" / "20 Heart Scales". */
export const giftName = (data: GameData, g: Gift) =>
  g.kind === 'item'
    ? `${data.items[g.key]?.name ?? g.key} ×${g.qty}`
    : g.kind === 'gold'
      ? `₽${g.amount.toLocaleString()}`
      : g.kind === 'heartScales'
        ? `${g.amount.toLocaleString()} Heart Scales`
        : `${data.species[g.dex]?.name ?? `#${g.dex}`} Lv.${g.level}${g.shiny ? ' ✦ shiny' : ''}`

function GiftIcon({ data, g }: { data: GameData; g: Gift }) {
  return g.kind === 'item' ? (
    <ItemSprite item={data.items[g.key]} size={28} />
  ) : g.kind === 'gold' ? (
    <PixelIcon name="coin" size={24} className="mx-0.5" />
  ) : g.kind === 'heartScales' ? (
    <PixelIcon name="heartScale" size={24} className="mx-0.5" />
  ) : (
    <SpriteImg dex={g.dex} size={32} shiny={g.shiny} />
  )
}

/**
 * The gifts as a list: icon, name, where it goes. With `save` (a player's profile), "where it goes" is where it would
 * land in their save as it is now.
 */
export function GiftList({
  data,
  gifts,
  save,
  onRemove,
}: {
  data: GameData
  gifts: Gift[]
  save?: SaveData | null
  onRemove?: (i: number) => void
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {gifts.map((g, i) => {
        const lands = save && g.kind !== 'heartScales' ? giftLanding(save, data, g.region) : null
        return (
          <li key={i} className="flex min-h-[36px] items-center gap-2 bg-paper px-2 py-0.5 shadow-ring-line">
            <GiftIcon data={data} g={g} />
            <span className="min-w-0 flex-1 truncate text-lg">{giftName(data, g)}</span>
            <span className="text-base text-muted">
              → {g.kind === 'heartScales' ? 'their Heart Scales (every region)' : regionLabel(data, g.region)}
              {lands && (g.region === GIFT_LATEST || lands !== g.region) && (
                <>
                  {' '}
                  ({g.region === GIFT_LATEST ? '' : 'not started: '}
                  {regionLabel(data, lands)})
                </>
              )}
            </span>
            {onRemove && (
              <button
                type="button"
                className="grid h-8 w-8 place-items-center text-lg"
                aria-label={`Remove ${giftName(data, g)}`}
                onClick={() => onRemove(i)}
              >
                ✕
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RegionSelect({
  data,
  value,
  onChange,
  save,
}: {
  data: GameData
  value: GiftRegion
  onChange: (r: GiftRegion) => void
  save?: SaveData | null
}) {
  const started = (id: string) => !save || id === (save.region ?? 'kanto') || !!save.parked?.[id]
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={GIFT_LATEST}>Their latest region</option>
      <option value={GIFT_CURRENT}>The region they play</option>
      {realRegions(data).map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
          {!started(r.id) ? ' (not started: goes to their latest)' : ''}
        </option>
      ))}
    </select>
  )
}

/** The gifts switch, where the gifts are written: off by default, saved with Save changes. */
export function GiftsSwitch() {
  const [cfg, setCfg] = useConfigRow('gifts')
  const access = cfg?.access ?? 'off'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg">Gifts</span>
      <AccessSwitch
        value={access}
        onChange={(a) => setCfg({ ...cfg, access: a })}
        label="Gifts: who gets them"
      />
      <span className="text-base text-muted">
        {access === 'all'
          ? 'Every player opens the gifts you send.'
          : access === 'admin'
            ? 'Only you can open them (to try it first). Players see the words, the gifts wait.'
            : 'Off: players see the words only; the gifts wait on the message until you switch this on.'}
      </span>
    </div>
  )
}

/** Adds and removes gifts: an item and how many, or a Pokémon, its level and shiny; each to a region. */
export function GiftEditor({
  data,
  gifts,
  onChange,
  save,
  hint = 'the player opens them when they close the message',
  messages = true,
  scales,
}: {
  data: GameData
  gifts: Gift[]
  onChange: (g: Gift[]) => void
  /** The player's save when known (their profile): the regions say which ones they've started. */
  save?: SaveData | null
  /** When the player opens them, after the count. */
  hint?: string
  /** A message's gifts, under the Gifts switch (its warning shows here). Invite rewards have a switch of their own. */
  messages?: boolean
  /**
   * Heart Scales can be added (a message: the claim pays them into the wallet, 0108): `account` for a signed-in
   * player, `guest` for a device (no wallet: the row says why it's shut). Unset: not offered (rewards, calendars).
   */
  scales?: 'account' | 'guest'
}) {
  const items = Object.values(data.items).sort((a, b) => a.name.localeCompare(b.name))
  const [item, setItem] = useState<ItemDef | null>(data.items['rare-candy'] ?? items[0] ?? null)
  const [qty, setQty] = useState(1)
  const [itemRegion, setItemRegion] = useState<GiftRegion>(GIFT_LATEST)
  const [dex, setDex] = useState<number | null>(null)
  const [level, setLevel] = useState(5)
  const [shiny, setShiny] = useState(false)
  const [outfit, setOutfit] = useState<string | undefined>()
  const [monRegion, setMonRegion] = useState<GiftRegion>(GIFT_LATEST)
  const [gold, setGold] = useState(1000)
  const [goldRegion, setGoldRegion] = useState<GiftRegion>(GIFT_LATEST)
  const [scaleQty, setScaleQty] = useState(20)
  // Friendship's switch as it stands (docs/60): off, players have no Friend Market to spend them in.
  const fship = useConfigRow('friendship')[0]?.access ?? 'off'
  const full = gifts.length >= GIFT_MAX
  // The switch as it stands in the admin, saved or not.
  const access = useConfigRow('gifts')[0]?.access ?? 'off'
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

  return (
    <div className={cx('flex flex-col gap-2 border-2 border-dashed border-shadow p-2')}>
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-lg leading-none">
        <b className="font-normal">Gifts</b>
        <span className="text-base text-muted">
          {gifts.length}/{GIFT_MAX} · {hint}
        </span>
      </p>
      {messages && access !== 'all' && (
        <p className="text-base text-danger">
          {access === 'admin'
            ? "Gifts are on for you only (the Gifts switch in Messages): players will see the words, and the gifts wait until they're on for everyone."
            : "Gifts are off (the Gifts switch in Messages): players will see the words, and the gifts wait until they're on."}
        </p>
      )}
      {gifts.length > 0 && (
        <GiftList
          data={data}
          gifts={gifts}
          save={save}
          onRemove={(i) => onChange(gifts.filter((_, j) => j !== i))}
        />
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col text-base">
          Item
          <SearchSelect
            options={items}
            value={item}
            onChange={setItem}
            getKey={(i) => i.key}
            getLabel={(i) => `${i.name} ${i.key}`}
            renderOption={(i) => (
              <span className="flex min-w-0 items-center gap-2">
                <ItemSprite item={i} size={24} />
                <span className="truncate">{i.name}</span>
              </span>
            )}
            placeholder="Pick an item…"
          />
        </label>
        <label className="flex w-24 flex-col text-base">
          Quantity
          <NumInput
            value={qty}
            min={1}
            max={GIFT_QTY_MAX}
            onChange={(v) => setQty(clamp(v ?? 1, 1, GIFT_QTY_MAX))}
          />
        </label>
        <label className="flex w-56 flex-col text-base">
          To the Bag of
          <RegionSelect data={data} value={itemRegion} onChange={setItemRegion} save={save} />
        </label>
        <PixelButton
          size="sm"
          disabled={!item || full}
          onClick={() =>
            item && onChange([...gifts, { kind: 'item', key: item.key, qty, region: itemRegion }])
          }
        >
          Add item
        </PixelButton>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[200px] flex-1 flex-col text-base">
          Pokémon
          <PokemonPicker data={data} value={dex} onChange={setDex} />
        </label>
        <label className="flex w-24 flex-col text-base">
          Level
          <NumInput
            value={level}
            min={1}
            max={data.config.maxLevel}
            onChange={(v) => setLevel(clamp(v ?? 1, 1, data.config.maxLevel))}
          />
        </label>
        <label className="flex min-h-[34px] items-center gap-1.5 text-lg">
          <input type="checkbox" checked={shiny} onChange={(e) => setShiny(e.target.checked)} />
          Shiny
        </label>
        {dex != null && <OutfitSelect dex={dex} value={outfit} onChange={setOutfit} />}
        <label className="flex w-56 flex-col text-base">
          To the Box of
          <RegionSelect data={data} value={monRegion} onChange={setMonRegion} save={save} />
        </label>
        <PixelButton
          size="sm"
          disabled={!dex || full}
          onClick={() =>
            dex &&
            onChange([
              ...gifts,
              {
                kind: 'pokemon',
                dex,
                level,
                ...(shiny && { shiny: true }),
                // Only one the species wears (docs/59): a Pokémon picked after the outfit drops it.
                ...(outfit && hasOutfit(outfit, dex) && { outfit }),
                region: monRegion,
              },
            ])
          }
        >
          Add Pokémon
        </PixelButton>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-40 flex-col text-base">
          Pokédollars (₽)
          <NumInput
            value={gold}
            min={1}
            max={GIFT_GOLD_MAX}
            onChange={(v) => setGold(clamp(v ?? 1, 1, GIFT_GOLD_MAX))}
          />
        </label>
        <label className="flex w-56 flex-col text-base">
          To the ₽ of
          <RegionSelect data={data} value={goldRegion} onChange={setGoldRegion} save={save} />
        </label>
        <PixelButton
          size="sm"
          disabled={full}
          onClick={() => onChange([...gifts, { kind: 'gold', amount: gold, region: goldRegion }])}
        >
          Add ₽
        </PixelButton>
      </div>
      {scales && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex w-40 flex-col text-base">
            <span className="flex items-center gap-1">
              <PixelIcon name="heartScale" size={18} /> Heart Scales
            </span>
            <NumInput
              value={scaleQty}
              min={1}
              max={GIFT_SCALES_MAX}
              onChange={(v) => setScaleQty(clamp(v ?? 1, 1, GIFT_SCALES_MAX))}
            />
          </label>
          <span className="flex min-h-[34px] flex-1 items-center text-base text-muted">
            {scales === 'guest'
              ? 'A guest has no Heart Scale wallet: only a signed-in player can get them.'
              : fship === 'off'
                ? 'Friendship is off (Config → Switches): switch it on to send Heart Scales.'
                : fship === 'admin'
                  ? "To the player's wallet. Friendship is on for you only: players won't see them until it's on."
                  : "Straight to the player's wallet, for the Friend Market (every region)."}
          </span>
          <PixelButton
            size="sm"
            disabled={full || scales === 'guest' || fship === 'off'}
            onClick={() =>
              onChange([...gifts, { kind: 'heartScales', amount: scaleQty, region: GIFT_LATEST }])
            }
          >
            Add Heart Scales
          </PixelButton>
        </div>
      )}
      {full && <p className="text-base text-muted">{GIFT_MAX} gifts at most on one message.</p>}
    </div>
  )
}
