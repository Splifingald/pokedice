// Admin → Live events → a Hatching Day (docs/71 §2): its own switch (game_config `hatchingDay`, Off by default) over
// the live events' one, and its two numbers: how much faster the Day Care's Egg clocks run and how much more often an
// Egg cracked meanwhile is shiny.
import type { GameData, LiveEvent } from '@/engine'
import { AccessSwitch, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

/** "12 h", "4 h", "1.5 h", "40 min". */
function hoursText(h: number): string {
  if (!(h > 0)) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${Math.round(h * 10) / 10} h`
}

/** Hatching Day's switch, over the live events' own: Off, no Hatching Day runs, whatever the list says. */
export function HatchingDaySwitch() {
  const [cfg, setCfg] = useConfigRow('hatchingDay')
  const access = cfg?.access ?? 'off'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg">Hatching Days</span>
      <AccessSwitch
        value={access}
        onChange={(a) => setCfg({ ...cfg, access: a })}
        label="Hatching Days: who gets them"
      />
      <span className="text-base text-muted">
        {access === 'all'
          ? 'Every player gets a Hatching Day while it runs.'
          : access === 'admin'
            ? 'Only you, signed in as admin, get them (to try one first).'
            : 'Off: no Hatching Day runs, whatever the list says.'}
      </span>
    </div>
  )
}

/** Its numbers, with what they mean for one pair at today's Day Care settings. */
export function HatchingDayEditor({
  e,
  set,
  data,
}: {
  e: LiveEvent
  set: (hatch: LiveEvent['hatch']) => void
  data: GameData | null
}) {
  const h = e.hatch
  const dc = data?.config.dayCare
  const shiny = Math.max(0, dc?.shinyChance ?? 0)
  return (
    <div className="grid gap-3">
      <HatchingDaySwitch />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field
          label="Egg speed ×"
          hint={
            dc
              ? `A pair leaves an Egg every ${hoursText(dc.breedHours / h.speed)} instead of ${hoursText(dc.breedHours)} (with Ditto: ${hoursText(dc.breedDittoHours / h.speed)}). Flame Body's ×2 comes on top.`
              : 'The Day Care’s Egg clocks run this many times as fast.'
          }
        >
          <NumInput
            value={h.speed}
            min={1}
            max={10}
            step={0.5}
            onChange={(v) => set({ ...h, speed: Math.max(1, v ?? 1) })}
          />
        </Field>
        <Field
          label="Shiny odds ×"
          hint={
            dc
              ? `An Egg cracked while it runs is shiny 1 in ${shiny > 0 ? Math.round(1 / Math.min(1, shiny * h.shiny)) : '∞'} (usually 1 in ${shiny > 0 ? Math.round(1 / shiny) : '∞'}).`
              : 'The Day Care’s shiny odds, × this for an Egg cracked while it runs.'
          }
        >
          <NumInput
            value={h.shiny}
            min={1}
            max={20}
            step={0.5}
            onChange={(v) => set({ ...h, shiny: Math.max(1, v ?? 1) })}
          />
        </Field>
      </div>
    </div>
  )
}
