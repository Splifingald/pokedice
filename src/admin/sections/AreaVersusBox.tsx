// Admin → Config: real-player battles in areas (docs/53). Its numbers (game_config `areaVersus`, which the server reads
// too: migration 0098; its switch is on the Switches tab), and the fill: every save of the recent days through the
// writer, as the migration did once.
import { useState } from 'react'
import { AREA_VERSUS_DEFAULTS, type AreaVersusConfig } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'
import { Box, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

export function AreaVersusBox() {
  const [raw, setRaw] = useConfigRow('areaVersus')
  const cfg: AreaVersusConfig = { ...AREA_VERSUS_DEFAULTS, ...(raw ?? {}) }
  const set = (patch: Partial<AreaVersusConfig>) => setRaw({ ...cfg, ...patch })
  const whole = (v: number | null, min = 1) => Math.max(min, Math.floor(v ?? 0))
  const [note, setNote] = useState<string | null>(null)
  const fill = async () => {
    setNote('…')
    try {
      const client = await getSupabase()
      if (!client) throw new Error('no database')
      const { data, error } = await client.rpc('area_versus_fill')
      if (error) throw error
      setNote(`The pool holds ${Number(data) || 0} team(s).`)
    } catch (err) {
      const e = err as { code?: string; message?: string }
      setNote(
        e.code === 'PGRST202' || e.code === '42883'
          ? 'The database has no real-player battles yet: run supabase/migrations/0098_area_versus.sql.'
          : `Refused: ${e.message ?? String(err)}`,
      )
    }
  }
  return (
    <Box
      title="Real-player battles"
      icon="user"
      hint="A card in the decks of the areas set in Admin → Areas (the Real player weight: 1 after each region's first gym where there are trainers and no gym leader, 2 in each Victory Road), among each round's last cards. It brings a real player's team, as it was when that area was their newest one (main game, signed in, played there in the recent days; any level). The card shows it: FIGHT (the team healed before and after, the Bag, XP, ₽ for each K.O. at the multiplier below; a loss costs only the ₽) or SKIP (no ₽). Afterwards, a friend request; theirs to accept on the Friends page. Never in Extreme mode. Nobody fits: no card that round."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="₽ multiplier" hint="× a trainer's ₽ for each K.O. of their team">
          <NumInput
            min={0}
            step={0.1}
            value={cfg.prizeMultiplier}
            onChange={(v) => set({ prizeMultiplier: Math.max(0, v ?? 0) })}
          />
        </Field>
        <Field label="Recent days" hint="a team is met for this many days after its owner last played there">
          <NumInput min={1} value={cfg.recentDays} onChange={(v) => set({ recentDays: whole(v) })} />
        </Field>
        <Field
          label="Request days"
          hint="an unanswered friend request goes after this many days; one can be sent this long after a meet"
        >
          <NumInput min={1} value={cfg.requestDays} onChange={(v) => set({ requestDays: whole(v) })} />
        </Field>
        <Field label="Round's last cards" hint="the card goes among the round's last this many">
          <NumInput min={1} value={cfg.lastCards} onChange={(v) => set({ lastCards: whole(v) })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PixelButton size="sm" onClick={() => void fill()}>
          Fill from recent saves
        </PixelButton>
        {note && <span className="text-base text-muted">{note}</span>}
      </div>
    </Box>
  )
}
