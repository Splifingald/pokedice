// Admin → Config → Rivals: how a rival's set meeting is fitted to the player (docs/61 §5.5). Its switch is on the
// Switches tab; here, the two choices and the margin, with what each does to an example team. Only the player's device
// reads them (the rival's team is dealt there, as a trainer's is), so no server function does.
import { matchLevels, RIVAL_LEVEL_MODES, RIVAL_MATCH_DEFAULTS, RIVAL_STAGE_MODES } from '@/engine'
import type { RivalLevelMode, RivalMatchConfig, RivalStageMode } from '@/engine'
import { Box, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

const LEVELS: Record<RivalLevelMode, { name: string; hint: string }> = {
  asWritten: { name: 'As written', hint: 'the levels of the content, whatever the player brings' },
  cap: {
    name: 'Never stronger',
    hint: "a team whose best stands above the player's best + margin is scaled down by one ratio, its best on that cap; a team within reach is as written",
  },
  mirror: {
    name: 'Always level',
    hint: "the team scaled, up or down, so its best is the player's best + margin: a player ahead of the path meets a rival ahead too",
  },
  pairs: {
    name: 'Pokémon for Pokémon',
    hint: "the rival's strongest at the player's strongest + margin, its second at the player's second, and so on (extra ones at the player's weakest)",
  },
}

const STAGES: Record<RivalStageMode, { name: string; hint: string }> = {
  asWritten: {
    name: 'As written',
    hint: 'the species of the content, at any level (a Charizard brought down to Lv.12 can happen)',
  },
  byLevel: {
    name: 'By level',
    hint: "each follows its new level as the player's would: a Lv.40 Charizard brought down to 20 is a Charmeleon, a Charmander raised to 40 a Charizard (stones and trades stay as written)",
  },
  player: {
    name: "No further than the player's",
    hint: "by level, then never further evolved than the player's most evolved team member: a team of first forms meets first forms",
  },
}

/** The example: a rival written at 20 / 18 / 17 against a player's team at 14 / 11 / 9 (or 26 / 25 / 24 when ahead). */
const EXAMPLE = [20, 18, 17].map((level, i) => ({ dex: i, level }))
const BEHIND = [14, 11, 9]
const AHEAD = [26, 25, 24]

export function RivalMatchBox() {
  const [raw, setRaw] = useConfigRow('rivalMatch')
  const cfg: RivalMatchConfig = { ...RIVAL_MATCH_DEFAULTS, ...(raw ?? {}) }
  const set = (patch: Partial<RivalMatchConfig>) => setRaw({ ...cfg, ...patch })
  const show = (own: number[]) =>
    matchLevels(EXAMPLE, own, cfg, 100)
      .map((m) => m.level)
      .join(' / ')
  return (
    <Box
      title="Rival teams matched to the player"
      icon="vs"
      hint="A rival's set meeting (Rivals on the road) with its team fitted to the team the player brings (not the Box). The rival's first line says so: “I trained my team to match yours”. Never a rival in a trainer pool, a gym or the League. Switch: Switches → Rival teams matched to the player."
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-lg leading-none">Levels</legend>
        {RIVAL_LEVEL_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2 text-lg leading-tight">
            <input
              type="radio"
              name="rival-levels"
              checked={cfg.levels === m}
              onChange={() => set({ levels: m })}
            />
            <span>
              {LEVELS[m].name} <span className="text-sm text-muted">— {LEVELS[m].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Margin (levels)" hint="above the player's; below with a negative number (−20 to 20)">
          <NumInput
            min={-20}
            max={20}
            value={cfg.margin}
            onChange={(v) => set({ margin: Math.max(-20, Math.min(20, Math.round(v ?? 0))) })}
          />
        </Field>
        <div className="text-lg leading-tight">
          <p>Example, a rival written at Lv.20 / 18 / 17:</p>
          <p>player at 14 / 11 / 9 → {show(BEHIND)}</p>
          <p>player at 26 / 25 / 24 → {show(AHEAD)}</p>
        </div>
      </div>
      <fieldset className="mt-3 flex flex-col gap-1.5">
        <legend className="mb-1 text-lg leading-none">Evolution stages</legend>
        {RIVAL_STAGE_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2 text-lg leading-tight">
            <input
              type="radio"
              name="rival-stages"
              checked={cfg.stages === m}
              onChange={() => set({ stages: m })}
            />
            <span>
              {STAGES[m].name} <span className="text-sm text-muted">— {STAGES[m].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Box>
  )
}
