// Admin → Events → Trick or Treat (docs/29): the switch (Off / On for admin / On for everyone, docs/15 §20), the
// Treat's range and a miss's push, each rarity tier's gauge (its weight, sections and flee zone) with the exact catch
// rates it gives, and each area's ghost list with its tiers. One game_config row, `trickOrTreat`, saved with the rest
// of the config (Publish); the server reads its switch. An area's number of cards is its encounter deck's (Areas).
import { useState } from 'react'
import {
  DEFAULT_CONFIG,
  TRICK_TIERS,
  ghostsFromWildPool,
  trickBand,
  trickBestPlay,
  type TrickGhost,
  type TrickOrTreatConfig,
  type TrickTier,
  type TrickTierConfig,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TrickGauge, TrickSprite } from '@/components/TrickOrTreat'
import { configProblems } from '../../schemas'
import { useAdminData } from '../../store'
import { AccessSwitch, Box, Field, NumInput, PokemonPicker, inputCls } from '../../widgets'
import { useConfigRow } from '../ConfigSection'

const TIER_NAME: Record<TrickTier, string> = { common: 'Common', rare: 'Rare', veryRare: 'Very rare' }
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`

/** The row over the defaults, one level deep per tier, so an older row missing a field still works. */
function useTrickConfig(): [TrickOrTreatConfig, (patch: Partial<TrickOrTreatConfig>) => void] {
  const [raw, setRaw] = useConfigRow('trickOrTreat')
  const d = DEFAULT_CONFIG.trickOrTreat
  const r = (raw ?? {}) as Partial<TrickOrTreatConfig>
  const cfg: TrickOrTreatConfig = {
    ...d,
    ...r,
    tiers: Object.fromEntries(
      TRICK_TIERS.map((k) => [k, { ...d.tiers[k], ...r.tiers?.[k] }]),
    ) as TrickOrTreatConfig['tiers'],
    areas: r.areas ?? d.areas,
  }
  return [cfg, (patch) => setRaw({ ...cfg, ...patch })]
}

function TierBox({
  tier,
  cfg,
  set,
}: {
  tier: TrickTier
  cfg: TrickOrTreatConfig
  set: (t: TrickTierConfig) => void
}) {
  const t = cfg.tiers[tier]
  const play = trickBestPlay(cfg, tier)
  const setSection = (i: number, patch: Partial<{ from: number; need: number }>) =>
    set({ ...t, sections: t.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  return (
    <div className="flex flex-col gap-2 border-t-2 border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xl">{TIER_NAME[tier]}</span>
        <span className="text-base text-muted" data-testid={`trick-rates-${tier}`}>
          Best play <b className="text-ink">{pct(play.best)}</b> · Trick Balls only {pct(play.ballsOnly)} ·
          Treats to the best section, then Balls {pct(play.treatsThenBalls)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Field label="Weight" hint="How often the card picks a ghost of this tier.">
          <NumInput value={t.weight} min={0} onChange={(v) => set({ ...t, weight: v ?? 0 })} />
        </Field>
        <Field label="Flees from" hint="The gauge reaching this (0–100) makes it flee.">
          <NumInput value={t.flee} min={1} max={100} onChange={(v) => set({ ...t, flee: v ?? 100 })} />
        </Field>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-lg leading-none">
          Sections (from · the d6 a Trick Ball needs; 7 = no catch there)
        </span>
        {t.sections.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <NumInput
              className="w-24"
              value={s.from}
              min={0}
              max={99}
              onChange={(v) => setSection(i, { from: v ?? 0 })}
            />
            <NumInput
              className="w-20"
              value={s.need}
              min={1}
              max={7}
              onChange={(v) => setSection(i, { need: v ?? 6 })}
            />
            <PixelButton
              size="sm"
              disabled={t.sections.length <= 1}
              onClick={() => set({ ...t, sections: t.sections.filter((_, j) => j !== i) })}
            >
              Remove
            </PixelButton>
          </div>
        ))}
        <div>
          <PixelButton
            size="sm"
            disabled={t.sections.length >= 6}
            onClick={() => {
              const last = t.sections[t.sections.length - 1]
              set({
                ...t,
                sections: [
                  ...t.sections,
                  {
                    from: Math.min(t.flee - 1, (last?.from ?? 0) + 10),
                    need: Math.max(1, (last?.need ?? 6) - 1),
                  },
                ],
              })
            }}
          >
            + Section
          </PixelButton>
        </div>
      </div>
      <TrickGauge band={trickBand(cfg, tier)} value={0} instant />
    </div>
  )
}

/** One area's ghosts: each with its tier, Prefill from its ghost-type wild Pokémon, and how many cards its deck holds. */
function AreaGhosts({
  cfg,
  set,
}: {
  cfg: TrickOrTreatConfig
  set: (areas: TrickOrTreatConfig['areas']) => void
}) {
  const data = useAdminData()
  const listed = Object.keys(cfg.areas)
  const areas = (data?.areas ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex)
  const withCard = areas.filter((a) => (a.encounterWeights.trick ?? 0) > 0 || listed.includes(a.id))
  const [areaId, setAreaId] = useState<string>(() => withCard[0]?.id ?? areas[0]?.id ?? '')
  if (!data) return null
  const area = data.areas.find((a) => a.id === areaId)
  const list: TrickGhost[] = cfg.areas[areaId] ?? []
  const setList = (next: TrickGhost[]) => set({ ...cfg.areas, [areaId]: next })
  return (
    <Box
      title="Each area's ghosts"
      icon="map"
      hint="The Trick or Treat card brings one of these, picked by its tier's weight, at a level of the area's range. An area deals the card only with a list here and copies in its encounter deck (Areas → Encounter deck). Prefill takes the area's ghost-type wild Pokémon, the tier from their weight."
    >
      <Field label="Area">
        <select className={inputCls} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {[...withCard, ...areas.filter((a) => !withCard.includes(a))].map((a) => (
            <option key={a.id} value={a.id}>
              {(a.regionId ?? 'kanto').toUpperCase()} · {a.name} ·{' '}
              {(a.encounterWeights.trick ?? 0) > 0 ? `${a.encounterWeights.trick} card` : 'no card'}
              {cfg.areas[a.id]?.length ? ` · ${cfg.areas[a.id]!.length} ghosts` : ''}
            </option>
          ))}
        </select>
      </Field>
      {area && (area.encounterWeights.trick ?? 0) === 0 && (
        <p className="text-base text-danger">
          This area's deck has no Trick or Treat card: set its copies in Areas → Encounter deck.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {list.map((g, i) => (
          <li key={`${g.dex}-${i}`} className="flex flex-wrap items-center gap-2">
            <SpriteImg dex={g.dex} size={40} />
            <PokemonPicker
              className="min-w-[14rem] flex-1"
              data={data}
              value={g.dex}
              onChange={(dex) => setList(list.map((x, j) => (j === i ? { ...x, dex } : x)))}
            />
            <select
              className={`${inputCls} w-36`}
              value={g.tier}
              aria-label="Tier"
              onChange={(e) =>
                setList(list.map((x, j) => (j === i ? { ...x, tier: e.target.value as TrickTier } : x)))
              }
            >
              {TRICK_TIERS.map((k) => (
                <option key={k} value={k}>
                  {TIER_NAME[k]}
                </option>
              ))}
            </select>
            {data.species[g.dex] &&
              data.species[g.dex]!.type1 !== 'ghost' &&
              data.species[g.dex]!.type2 !== 'ghost' && (
                <span className="text-sm text-danger">not a ghost type</span>
              )}
            <PixelButton size="sm" onClick={() => setList(list.filter((_, j) => j !== i))}>
              Remove
            </PixelButton>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setList([...list, { dex: 92, tier: 'common' }])}>
          + Ghost
        </PixelButton>
        <PixelButton
          size="sm"
          disabled={!area}
          onClick={() => area && setList(ghostsFromWildPool(area, data))}
        >
          Prefill from the wild pool
        </PixelButton>
        <PixelButton
          size="sm"
          disabled={!(areaId in cfg.areas)}
          onClick={() => {
            const { [areaId]: _gone, ...rest } = cfg.areas
            set(rest)
          }}
        >
          Clear the list
        </PixelButton>
      </div>
    </Box>
  )
}

export function TrickOrTreatTab() {
  const [cfg, set] = useTrickConfig()
  const problems = configProblems('trickOrTreat', cfg)
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Trick or Treat"
        icon="star"
        hint="A card in an area's deck: a ghost floats in, Treats fill its gauge by a random amount, a Trick Ball rolls a d6 against the section the gauge is in, a miss pushes the gauge up, and the flee zone ends it. Off: the card is never dealt (and the server says so to signed-in players). Saved with the rest of the config (Publish)."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">Who sees it</span>
          <AccessSwitch
            value={cfg.access ?? 'off'}
            onChange={(access) => set({ access })}
            label="Trick or Treat: who sees it"
          />
          <TrickSprite kind="treat" size={30} />
          <TrickSprite kind="ball" size={30} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Treat: least" hint="A Treat fills the gauge by a whole number from…">
            <NumInput value={cfg.treatMin} min={1} max={100} onChange={(v) => set({ treatMin: v ?? 1 })} />
          </Field>
          <Field label="Treat: most" hint="…to this.">
            <NumInput value={cfg.treatMax} min={1} max={100} onChange={(v) => set({ treatMax: v ?? 1 })} />
          </Field>
          <Field label="A missed Trick Ball" hint="Pushes the gauge by this. Too low and Balls alone win.">
            <NumInput value={cfg.failPush} min={1} max={100} onChange={(v) => set({ failPush: v ?? 1 })} />
          </Field>
        </div>
        {problems.length > 0 && (
          <ul className="text-base text-danger">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {TRICK_TIERS.map((tier) => (
          <TierBox
            key={tier}
            tier={tier}
            cfg={cfg}
            set={(t) => set({ tiers: { ...cfg.tiers, [tier]: t } })}
          />
        ))}
      </Box>
      <AreaGhosts cfg={cfg} set={(areas) => set({ areas })} />
    </div>
  )
}
