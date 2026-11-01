// Admin → Events → Gift card (docs/61 §4.0): the switch (Off / On for admin / On for everyone, docs/15 §20), each
// level's break chance with the odds of reaching each level by always tapping (with and without Delibird), Delibird's
// help, each level's reward options, the balls from worst to best and the taps a boss's present takes. One game_config
// row, `giftCard`, saved with the rest of the config (Publish); the server reads its switch. An area's number of cards
// is its encounter deck's (Areas → Encounter deck: Gift card), a boss out of a present its boss's "Out of a present".
import {
  DEFAULT_CONFIG,
  GIFT_REWARD_KINDS,
  giftReachOdds,
  giftTop,
  type GiftCardConfig,
  type GiftRewardKind,
  type GiftRewardPart,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { PresentImg } from '@/components/GiftCard'
import { configProblems } from '../../schemas'
import { useAdminData } from '../../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../../widgets'
import { useConfigRow } from '../ConfigSection'

const KIND_NAME: Record<GiftRewardKind, string> = {
  ball: "The area's ball",
  betterBall: 'The ball above it',
  item: 'An item',
  money: '₽ × the area’s level',
  evolution: 'An evolution item its Mart sells',
}
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`

/** The row over the defaults, so an older row missing a field still works. */
function useGiftConfig(): [GiftCardConfig, (patch: Partial<GiftCardConfig>) => void] {
  const [raw, setRaw] = useConfigRow('giftCard')
  const d = DEFAULT_CONFIG.giftCard
  const r = (raw ?? {}) as Partial<GiftCardConfig>
  const cfg: GiftCardConfig = { ...d, ...r, helper: { ...d.helper, ...r.helper } }
  return [cfg, (patch) => setRaw({ ...cfg, ...patch })]
}

/** One part of a reward: what it is, which item, how many. */
function PartRow({
  part,
  items,
  set,
  remove,
}: {
  part: GiftRewardPart
  items: { key: string; name: string }[]
  set: (p: GiftRewardPart) => void
  remove?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={inputCls}
        aria-label="What it gives"
        value={part.kind}
        onChange={(e) => {
          const kind = e.target.value as GiftRewardKind
          set(kind === 'item' ? { kind, key: part.key ?? 'potion', qty: part.qty } : { kind, qty: part.qty })
        }}
      >
        {GIFT_REWARD_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_NAME[k]}
          </option>
        ))}
      </select>
      {part.kind === 'item' && (
        <select
          className={inputCls}
          aria-label="Which item"
          value={part.key ?? ''}
          onChange={(e) => set({ ...part, key: e.target.value })}
        >
          {items.map((i) => (
            <option key={i.key} value={i.key}>
              {i.name}
            </option>
          ))}
        </select>
      )}
      <span className="text-lg">{part.kind === 'money' ? '₽ per level' : '×'}</span>
      <NumInput
        className="w-20"
        value={part.qty}
        min={1}
        max={999}
        onChange={(v) => set({ ...part, qty: v ?? 1 })}
      />
      {remove && (
        <PixelButton size="sm" onClick={remove}>
          Remove
        </PixelButton>
      )}
    </div>
  )
}

/** Each level's reward options: one is drawn per level as a gift appears; a level past the list takes the last. */
function RewardsBox({
  cfg,
  set,
}: {
  cfg: GiftCardConfig
  set: (rewards: GiftCardConfig['rewards']) => void
}) {
  const data = useAdminData()
  const items = Object.values(data?.items ?? {})
    .map((i) => ({ key: i.key, name: i.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const levels = cfg.rewards
  const setLevel = (i: number, options: GiftRewardPart[][]) =>
    set(levels.map((l, j) => (j === i ? options : l)))
  return (
    <Box
      title="Rewards by level"
      icon="star"
      hint="OPEN gives its level's reward. Each level may have several options: one is drawn as the gift appears, and the player sees it before choosing. A level past this list takes the last one. The area's ball is the best of the balls list in its loot (a Poké Ball when none)."
    >
      {levels.map((options, i) => (
        <div key={i} className="flex flex-col gap-2 border-t-2 border-line pt-3">
          <span className="text-xl">Level {i + 1}</span>
          {options.map((option, o) => (
            <div key={o} className="flex flex-col gap-1.5 border-l-4 border-line pl-2">
              <span className="text-base text-muted">
                {options.length > 1 ? `Option ${o + 1} (one in ${options.length})` : 'Gives'}
              </span>
              {option.map((part, k) => (
                <PartRow
                  key={k}
                  part={part}
                  items={items}
                  set={(p) =>
                    setLevel(
                      i,
                      options.map((x, y) => (y === o ? x.map((q, z) => (z === k ? p : q)) : x)),
                    )
                  }
                  remove={
                    option.length > 1
                      ? () =>
                          setLevel(
                            i,
                            options.map((x, y) => (y === o ? x.filter((_, z) => z !== k) : x)),
                          )
                      : undefined
                  }
                />
              ))}
              <div className="flex flex-wrap gap-2">
                <PixelButton
                  size="sm"
                  onClick={() =>
                    setLevel(
                      i,
                      options.map((x, y) => (y === o ? [...x, { kind: 'item', key: 'potion', qty: 1 }] : x)),
                    )
                  }
                >
                  Add a part
                </PixelButton>
                <PixelButton
                  size="sm"
                  disabled={options.length <= 1}
                  onClick={() =>
                    setLevel(
                      i,
                      options.filter((_, y) => y !== o),
                    )
                  }
                >
                  Remove this option
                </PixelButton>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <PixelButton size="sm" onClick={() => setLevel(i, [...options, [{ kind: 'ball', qty: 1 }]])}>
              Add an option
            </PixelButton>
            <PixelButton
              size="sm"
              disabled={levels.length <= 1}
              onClick={() => set(levels.filter((_, j) => j !== i))}
            >
              Remove level {i + 1}
            </PixelButton>
          </div>
        </div>
      ))}
      <div>
        <PixelButton
          size="sm"
          onClick={() => set([...levels, levels[levels.length - 1] ?? [[{ kind: 'ball', qty: 1 }]]])}
        >
          Add a level
        </PixelButton>
      </div>
    </Box>
  )
}

export function GiftCardTab() {
  const [cfg, set] = useGiftConfig()
  const data = useAdminData()
  const problems = configProblems('giftCard', cfg)
  const plain = giftReachOdds(cfg, false)
  const helped = giftReachOdds(cfg, true)
  const helperName = data?.species[cfg.helper.dex]?.name ?? `#${cfg.helper.dex}`
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Gift card"
        icon="gift"
        hint="In place of an area's item cards (Areas → Encounter deck: Gift card), a present at level 1: OPEN gives the level's reward, MAKE IT BIGGER grows it a level but may break it, and a broken gift is a wild Pokémon of the area. Off: the item cards as before (and the server says so to signed-in players). Saved with the rest of the config (Publish)."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">Who sees it</span>
          <AccessSwitch
            value={cfg.access ?? 'off'}
            onChange={(access) => set({ access })}
            label="Gift card: who sees it"
          />
          <PresentImg level={2} scale={1} />
          <PresentImg level={4} scale={1} />
        </div>
        {problems.length > 0 && (
          <ul className="text-base text-danger">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-lg leading-none">
            Break chance of a tap, by level (%). Level {giftTop(cfg, false)} is the top.
          </span>
          <div className="flex flex-wrap items-end gap-2">
            {cfg.breakChances.map((c, i) => (
              <Field key={i} label={`Level ${i + 1}`}>
                <NumInput
                  className="w-20"
                  value={c}
                  min={0}
                  max={100}
                  onChange={(v) =>
                    set({ breakChances: cfg.breakChances.map((x, j) => (j === i ? (v ?? 0) : x)) })
                  }
                />
              </Field>
            ))}
            <PixelButton
              size="sm"
              disabled={cfg.breakChances.length >= 8}
              onClick={() =>
                set({
                  breakChances: [...cfg.breakChances, Math.min(100, (cfg.breakChances.at(-1) ?? 0) + 20)],
                })
              }
            >
              Add a level
            </PixelButton>
            <PixelButton
              size="sm"
              disabled={cfg.breakChances.length <= 1}
              onClick={() => set({ breakChances: cfg.breakChances.slice(0, -1) })}
            >
              Remove the last
            </PixelButton>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Field label="Helper" hint="Owning one (team or Box) makes every tap safer and adds levels on top.">
            <div className="flex items-center gap-2">
              <SpriteImg dex={cfg.helper.dex} size={40} />
              {data && (
                <PokemonPicker
                  data={data}
                  value={cfg.helper.dex}
                  onChange={(dex) => set({ helper: { ...cfg.helper, dex } })}
                />
              )}
            </div>
          </Field>
          <Field label="Safer by (%)" hint="Taken off every level's break chance.">
            <NumInput
              value={cfg.helper.safer}
              min={0}
              max={100}
              onChange={(v) => set({ helper: { ...cfg.helper, safer: v ?? 0 } })}
            />
          </Field>
          <Field label="Extra levels" hint="On top, past the last level that can grow.">
            <NumInput
              value={cfg.helper.extraLevels}
              min={0}
              max={5}
              onChange={(v) => set({ helper: { ...cfg.helper, extraLevels: v ?? 0 } })}
            />
          </Field>
        </div>
        <table className="w-full max-w-xl text-lg" data-testid="gift-reach">
          <caption className="text-left text-base text-muted">Reaching each level by always tapping</caption>
          <thead>
            <tr className="text-left">
              <th className="font-normal">Level</th>
              <th className="font-normal">Without {helperName}</th>
              <th className="font-normal">With {helperName}</th>
            </tr>
          </thead>
          <tbody>
            {helped.map((h, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{plain[i] != null ? pct(plain[i]!) : '—'}</td>
                <td>{pct(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field
            label="Balls, worst to best"
            hint="Item keys, comma-separated. An area's ball is the best of these in its loot."
          >
            <input
              className={inputCls}
              value={cfg.balls.join(', ')}
              onChange={(e) =>
                set({
                  balls: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field
            label="A boss's present: taps to burst"
            hint="Evergreen Hill's Delibird (a boss marked Out of a present)."
          >
            <NumInput value={cfg.bossTaps} min={1} max={10} onChange={(v) => set({ bossTaps: v ?? 1 })} />
          </Field>
        </div>
      </Box>
      <RewardsBox cfg={cfg} set={(rewards) => set({ rewards })} />
    </div>
  )
}
