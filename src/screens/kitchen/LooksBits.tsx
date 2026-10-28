// Kitchen sink (dev only): trainer looks (docs/31) — the row under the trainer card with and without its red dot,
// the menu in each state (a new game, some new looks, its list on the unlocked looks, an event's look won, every look
// unlocked), a locked look of each kind, an unlocked one with how it was won, and the rules pop-up (the unlock and INFO).
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import {
  LockedLook,
  LooksDot,
  LooksMenu,
  LooksRow,
  LooksRulesModal,
  OwnedLook,
  type LooksListView,
} from '@/components/TrainerLooks'
import { LOOKS, type LookState } from '@/engine'
import { useT } from '@/i18n/react'

const kantoOnly = (l: LookState['def']) => l.region === 'kanto'

const HALLOWEEN = 'events/halloween-2026-pokemaniac'

/**
 * Made-up progress: Kanto played to `kanto` (open or locked at 112 caught), Johto started or not, the event's look won
 * or not (as the engine, an event's look not won isn't listed).
 */
function states(kanto: boolean, johto: boolean, all = false, event = false): LookState[] {
  return LOOKS.map((def): LookState => {
    if (all || def.unlock.kind === 'start') return { def, open: true, started: true }
    if (def.unlock.kind === 'event') return { def, open: event, started: true }
    if (kantoOnly(def)) {
      if (kanto && def.unlock.kind !== 'complete') return { def, open: true, started: true }
      if (def.unlock.kind === 'catch' || def.unlock.kind === 'complete')
        return {
          def,
          open: false,
          started: true,
          have: kanto ? 112 : 1,
          need: def.unlock.kind === 'catch' ? def.unlock.count : 151,
        }
      return { def, open: false, started: true, areasAway: def.unlock.kind === 'reach' ? 3 : undefined }
    }
    if (def.region === 'johto' && johto) {
      const open = [
        'johto/youngster',
        'johto/sage',
        'johto/guitarist',
        'johto/bug-catcher',
        'johto/firebreather',
        'johto/schoolgirl',
      ].includes(def.id)
      if (open) return { def, open, started: true }
      if (def.unlock.kind === 'catch') return { def, open, started: true, have: 27, need: def.unlock.count }
      if (def.unlock.kind === 'complete') return { def, open, started: true, have: 27, need: 217 }
      if (def.unlock.kind === 'reach')
        return { def, open, started: true, areasAway: def.id === 'johto/black-belt' ? 1 : 9 }
      return { def, open, started: true }
    }
    return { def, open: false, started: false }
  }).filter((s) => s.def.unlock.kind !== 'event' || s.open)
}

const MENUS: [string, LookState[], string, Set<string>, LooksListView?][] = [
  ['A new game', states(false, false), 'red', new Set()],
  [
    'Kanto done, two new in Johto',
    states(true, true),
    'johto/firebreather',
    new Set(['johto/firebreather', 'johto/schoolgirl']),
  ],
  ['Its list on the unlocked looks', states(true, true), 'johto/firebreather', new Set(), 'unlocked'],
  [
    "Halloween 2026's look won (new), on the unlocked looks",
    states(true, true, false, true),
    HALLOWEEN,
    new Set([HALLOWEEN]),
    'unlocked',
  ],
  ['Every look unlocked', states(true, true, true), 'paldea/juliana-bb', new Set()],
]

export function LooksBits() {
  const { t } = useT()
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const [wearing, setWearing] = useState<Record<string, string>>({})
  const sample = states(true, true, false, true)
  const one = (id: string) => sample.find((s) => s.def.id === id)!
  return (
    <div className="grid w-full gap-4">
      <div className="grid max-w-md gap-2">
        <small className="font-pixel-sm text-[16px] text-muted">
          The row under the trainer card (live save)
        </small>
        <LooksRow onOpen={() => setRules('info')} />
        <div className="flex items-center gap-3">
          <small className="font-pixel-sm text-[16px] text-muted">The red dot:</small>
          <LooksDot n={2} />
          <LooksDot n={14} />
        </div>
      </div>

      <div className="grid max-w-md gap-1.5">
        <small className="font-pixel-sm text-[16px] text-muted">A locked look of each kind</small>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          <LockedLook s={one('johto/pokefan')} />
          <LockedLook s={one('johto/black-belt')} />
          <LockedLook s={one('johto/silver')} />
          <LockedLook s={one('johto/ethan')} />
          <LockedLook s={one('johto/kris')} />
        </ul>
      </div>

      <div className="grid max-w-md gap-1.5">
        <small className="font-pixel-sm text-[16px] text-muted">An unlocked look, with how it was won</small>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          <OwnedLook s={one('red')} />
          <OwnedLook s={one('kanto/lass')} />
          <OwnedLook s={one('kanto/cooltrainer-f')} />
          <OwnedLook s={one('johto/firebreather')} />
          <OwnedLook s={one('kanto/chase')} />
          <OwnedLook s={one(HALLOWEEN)} />
        </ul>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {MENUS.map(([label, list, worn, fresh, view]) => (
          <div key={label} className="grid w-full max-w-[380px] gap-1 bg-panel p-3 shadow-card">
            <small className="font-pixel-sm text-[16px] text-muted">{label}</small>
            <LooksMenu
              states={list}
              liveRegion="johto"
              wearing={wearing[label] ?? worn}
              fresh={fresh}
              initialView={view}
              onWear={(id) => setWearing((w) => ({ ...w, [label]: id }))}
              onInfo={() => setRules('info')}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules('unlock')}>
          {t('ui.looks.title')}: first open
        </PixelButton>
      </div>
      <LooksRulesModal
        open={!!rules}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </div>
  )
}
