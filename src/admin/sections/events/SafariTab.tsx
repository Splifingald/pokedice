// Admin → Events → Safari (docs/61 §4): the switch (Off / On for admin / On for everyone, docs/15 §20), a round's price
// (the free rounds first), the Bait's range and a miss's push, each rarity tier's gauge with the exact catch rates it
// gives (Trick or Treat's tier editor), and each Safari's tier overrides. One game_config row, `safari`, saved with the
// rest of the config (Publish); the server reads its switch. Which areas are Safaris is their mode (Areas).
import { useState } from 'react'
import {
  DEFAULT_CONFIG,
  TRICK_TIERS,
  isSafariArea,
  tierFromCatchValue,
  type SafariConfig,
  type TrickGhost,
  type TrickTier,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TrickSprite } from '@/components/TrickOrTreat'
import { configProblems } from '../../schemas'
import { useAdminData } from '../../store'
import { AccessSwitch, Box, Field, NumInput, inputCls } from '../../widgets'
import { useConfigRow } from '../ConfigSection'
import { TIER_NAME, TierBox } from './TrickOrTreatTab'

/** The row over the defaults, one level deep per tier, so an older row missing a field still works. */
function useSafariConfig(): [SafariConfig, (patch: Partial<SafariConfig>) => void] {
  const [raw, setRaw] = useConfigRow('safari')
  const d = DEFAULT_CONFIG.safari
  const r = (raw ?? {}) as Partial<SafariConfig>
  const cfg: SafariConfig = {
    ...d,
    ...r,
    tiers: Object.fromEntries(TRICK_TIERS.map((k) => [k, { ...d.tiers[k], ...r.tiers?.[k] }])) as SafariConfig['tiers'],
    areas: r.areas ?? d.areas,
  }
  return [cfg, (patch) => setRaw({ ...cfg, ...patch })]
}

/** One Safari's tiers: a Pokémon listed takes the tier set here, any other its catch value's. */
function SafariTiers({ cfg, set }: { cfg: SafariConfig; set: (areas: SafariConfig['areas']) => void }) {
  const data = useAdminData()
  const safaris = (data?.areas ?? []).filter((a) => isSafariArea(a)).sort((a, b) => a.orderIndex - b.orderIndex)
  const [areaId, setAreaId] = useState<string>(() => safaris[0]?.id ?? '')
  if (!data) return null
  const area = data.areas.find((a) => a.id === areaId)
  const list: TrickGhost[] = cfg.areas[areaId] ?? []
  const setList = (next: TrickGhost[]) => set({ ...cfg.areas, [areaId]: next })
  const byCatch = (dex: number) => tierFromCatchValue(data.species[dex]?.catchValue ?? 1)
  return (
    <Box
      title="Each Safari's tiers"
      icon="map"
      hint="A Safari encounter brings one of the area's wild Pokémon (its wild pool, by weight). Its tier sets its gauge: the one set here, else its catch value's (1–3 common, 4–5 rare, 6 and up very rare)."
    >
      <Field label="Safari">
        <select className={inputCls} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {safaris.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.regionId ?? 'kanto').toUpperCase()} · {a.name}
              {cfg.areas[a.id]?.length ? ` · ${cfg.areas[a.id]!.length} set` : ''}
            </option>
          ))}
        </select>
      </Field>
      {area && (
        <ul className="flex flex-col gap-1.5">
          {area.wildPool.map((w) => {
            const set1 = list.find((g) => g.dex === w.dex)
            return (
              <li key={w.id} className="flex flex-wrap items-center gap-2">
                <SpriteImg dex={w.dex} size={36} />
                <span className="min-w-[10rem] text-lg">{data.species[w.dex]?.name ?? `#${w.dex}`}</span>
                <select
                  className={`${inputCls} w-52`}
                  value={set1?.tier ?? ''}
                  aria-label="Tier"
                  onChange={(e) => {
                    const v = e.target.value as TrickTier | ''
                    const rest = list.filter((g) => g.dex !== w.dex)
                    setList(v ? [...rest, { dex: w.dex, tier: v }] : rest)
                  }}
                >
                  <option value="">by catch value: {TIER_NAME[byCatch(w.dex)]}</option>
                  {TRICK_TIERS.map((k) => (
                    <option key={k} value={k}>
                      {TIER_NAME[k]}
                    </option>
                  ))}
                </select>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" disabled={!list.length} onClick={() => setList([])}>
          All by catch value
        </PixelButton>
        {list.some((g) => !area?.wildPool.some((w) => w.dex === g.dex)) && (
          <span className="text-sm text-danger">Some set tiers are for Pokémon no longer in this Safari's pool.</span>
        )}
      </div>
    </Box>
  )
}

export function SafariTab() {
  const [cfg, set] = useSafariConfig()
  const problems = configProblems('safari', cfg)
  return (
    <div className="flex flex-col gap-4">
      <Box
        title="Safari Zones"
        icon="ball"
        hint="In a Safari area (Areas: its mode), each wild card is a Safari encounter: Bait fills the Pokémon's gauge by a random amount, a Safari Ball rolls a d6 against the section the gauge is in, a miss pushes the gauge up, and the flee zone ends it. No battles, no XP, no Pokémon Center. Its rounds are paid as they're dealt. Off: the cards are fought as wild Pokémon (and the server says so to signed-in players). Saved with the rest of the config (Publish)."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl">Who sees it</span>
          <AccessSwitch value={cfg.access ?? 'off'} onChange={(access) => set({ access })} label="Safari: who sees it" />
          <TrickSprite kind="treat" size={30} theme="safari" />
          <TrickSprite kind="ball" size={30} theme="safari" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label="Free rounds" hint="Rounds free in each Safari area, per save.">
            <NumInput value={cfg.freeRounds} min={0} max={100} onChange={(v) => set({ freeRounds: v ?? 0 })} />
          </Field>
          <Field label="₽ a round" hint="Each round after the free ones, paid as it's dealt.">
            <NumInput value={cfg.roundPrice} min={0} onChange={(v) => set({ roundPrice: v ?? 0 })} />
          </Field>
          <Field label="Bait: least" hint="Bait fills the gauge by a whole number from…">
            <NumInput value={cfg.treatMin} min={1} max={100} onChange={(v) => set({ treatMin: v ?? 1 })} />
          </Field>
          <Field label="Bait: most" hint="…to this.">
            <NumInput value={cfg.treatMax} min={1} max={100} onChange={(v) => set({ treatMax: v ?? 1 })} />
          </Field>
          <Field label="A missed Safari Ball" hint="Pushes the gauge by this. Too low and Balls alone win.">
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
          <TierBox key={tier} tier={tier} cfg={cfg} set={(t) => set({ tiers: { ...cfg.tiers, [tier]: t } })} />
        ))}
      </Box>
      <SafariTiers cfg={cfg} set={(areas) => set({ areas })} />
    </div>
  )
}
