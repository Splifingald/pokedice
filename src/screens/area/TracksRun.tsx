// Tracks in the Snow on the area's page (docs/61 §4.1, docs/15 §46): its INFO, and the area's own steps: the way in
// (the intro full screen, then its pop-up), the glade between bushes (and the bush just opened, before what it held
// comes), and the outro once the shiny Stantler is caught. The engine (engine/tracks.ts) decides every bush, print and
// outcome; these only show it and pass the taps on.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tracksField, tracksModeOf, tracksPrintAt, tracksStateOf, type Area, type TracksMode } from '@/engine'
import { fxSound } from '@/audio/sfx'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { InfoButton } from '@/components/RulesModal'
import {
  STANTLER,
  TracksEntry,
  TracksGlade,
  TracksOutroView,
  TracksPanel,
  TracksRulesModal,
  type GladeBush,
} from '@/components/Tracks'
import { mutateSave, useGame } from '@/store/game'
import {
  arriveAtTracksWayIn,
  beginTracks,
  finishTracksOutro,
  leaveArea,
  markTracksPopup,
  meetBush,
  tapBush,
} from '@/store/run'

const markSeen = () => mutateSave((s) => (s.tracksRulesSeen ? null : { ...s, tracksRulesSeen: true }))

/** How long a bush's moment holds before what it held comes (none with motion off). */
const REVEAL_MS = { full: 700, short: 350, off: 0 } as const

/** Stantler's name in the player's language. */
const useStantler = () => useGame((s) => s.data.species[STANTLER]?.name ?? 'Stantler')

/** INFO at the bottom of the area's page: its rules again. */
export function TracksInfo({ mode }: { mode: TracksMode }) {
  const { t } = useT()
  const name = useStantler()
  const [open, setOpen] = useState(false)
  return (
    <>
      <InfoButton name={t('ui.tracks.title')} onClick={() => setOpen(true)} />
      <TracksRulesModal open={open} onClose={() => setOpen(false)} mode={mode} name={name} />
    </>
  )
}

/**
 * The area's own step is due now, in place of the usual page between encounters: the way in (not begun), the glade
 * (begun: between bushes, or a bush just opened before what it held comes), the outro (caught, not yet seen).
 */
export function tracksStepDue(
  area: Area,
  s: { save: Parameters<typeof tracksStateOf>[0]; data: Parameters<typeof tracksModeOf>[1] },
  run: { phase: string; tracksBush?: unknown },
): boolean {
  if (!tracksModeOf(area, s.data)) return false
  const st = tracksStateOf(s.save, area.id)
  const between = run.phase === 'idle' || (run.phase === 'preview' && !!run.tracksBush)
  return between && ((!!st.won && !st.wonSeen) || !st.won)
}

/** The area's own step: the outro once due, the way in while not begun, the glade while it is searched. */
export function TracksStep({ area }: { area: Area }) {
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const name = useStantler()
  const mode = tracksModeOf(area, data)
  if (!mode) return null
  const st = tracksStateOf(save, area.id)
  if (st.won && !st.wonSeen)
    return (
      <TracksOutroView
        name={name}
        onDone={() => {
          finishTracksOutro()
          navigate('/home')
        }}
      />
    )
  if (!st.active && !st.won) return <WayIn area={area} mode={mode} />
  if (st.active) return <Glade area={area} mode={mode} />
  return null
}

/**
 * The way in (as the nightmare's): arriving heals the team and the Box as a Pokémon Center does; the intro plays full
 * screen and waits for a tap, then its pop-up: TEAM (the team can change until BEGIN), NOT NOW (Home), BEGIN THE SEARCH
 * (the server says yes first for a signed-in player).
 */
function WayIn({ area, mode }: { area: Area; mode: TracksMode }) {
  const navigate = useNavigate()
  const name = useStantler()
  const popup = useGame((s) => !!s.run.tracksPopup)
  useEffect(() => arriveAtTracksWayIn(area.id), [area.id])
  return (
    <TracksEntry
      mode={mode}
      name={name}
      popup={popup}
      onPopup={markTracksPopup}
      onTeam={() => navigate('/team')}
      onBegin={() => {
        markSeen()
        void beginTracks(area.id)
      }}
      onNotNow={() => {
        markSeen()
        leaveArea()
        navigate('/home')
      }}
    />
  )
}

/**
 * The glade being searched: its round, the taps left, the bushes. A tap opens a bush (the engine's); its moment holds
 * a beat (the bush parting, what it held, its prints), then what it held comes (a fight, a find, the cabin). After the
 * last tap the snow falls over the glade, and a fresh one is under it.
 */
function Glade({ area, mode }: { area: Area; mode: TracksMode }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const name = useStantler()
  const { level } = useMotion()
  const at = tracksField(save, data, area.id)
  const field = at?.field
  // Back on a glade the snow just fell on (after a fight): it falls once as the page opens.
  const [snowOnArrival] = useState(() => !!field?.snowed && !field.opened.length && !run.tracksBush)
  const [snowed, setSnowed] = useState(false)
  const reveal = run.tracksBush
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A bush's moment: its sound, then what it held (after the snow has fallen, for the last tap's empty bush).
  useEffect(() => {
    if (!reveal) return
    fxSound(reveal.bush === 'stantler' ? 'tracks.found' : 'tracks.rustle')
    if (reveal.snowfall && run.phase === 'idle') return
    timer.current = setTimeout(meetBush, REVEAL_MS[level])
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // One moment per bush opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.id])
  useEffect(() => {
    if (field?.bolted) fxSound('tracks.bolt')
    // Said once as the fresh glade shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!at || !field) return null
  const { spec } = at
  const n = spec.size * spec.size
  const bushes: GladeBush[] = Array.from({ length: n }, (_, i) =>
    field.opened.includes(i) && field.bushes
      ? { held: field.bushes[i] ?? null, print: tracksPrintAt(mode, field, spec.size, i) }
      : { held: null, print: null },
  )
  const snowing = (!!reveal?.snowfall && run.phase === 'idle') || (snowOnArrival && !snowed)
  const note = reveal
    ? reveal.bush === 'stantler'
      ? t('ui.tracks.held.stantler', { name })
      : reveal.snowfall && run.phase === 'idle'
        ? t('ui.tracks.snowfall', { name })
        : t(`ui.tracks.held.${reveal.bush}`, { name })
    : field.bolted
      ? t('ui.tracks.bolted', { name })
      : field.snowed
        ? t('ui.tracks.snowfall', { name })
        : null
  return (
    <TracksPanel
      round={at.index}
      total={at.total}
      last={at.last}
      taps={field.taps}
      maxTaps={spec.taps}
      name={name}
      note={note}
    >
      <TracksGlade
        // A fresh glade (a snowfall, a bolt, the next round) is a new one: its moment state starts over.
        key={`${at.index}-${field.bushes ? 'hidden' : 'fresh'}-${snowing}`}
        size={spec.size}
        name={name}
        bushes={bushes}
        reveal={reveal ? { index: reveal.index, held: reveal.bush, print: reveal.print } : null}
        shiny={at.last}
        snowfall={snowing}
        onSnowed={() => {
          setSnowed(true)
          if (reveal) meetBush()
        }}
        onTap={(i) => void tapBush(i)}
        disabled={run.phase !== 'idle' || !!reveal || field.found}
      />
    </TracksPanel>
  )
}
