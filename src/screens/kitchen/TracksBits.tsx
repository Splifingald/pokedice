// Kitchen sink: Tracks in the Snow (docs/61 §4.1, docs/15 §46) in every state — the glade on the pixel engine (moving
// and still), the gauge of rounds (fresh, under way, won), the bushes (closed, open with each content, the prints in
// all 8 directions), the glade's panel on a 3 × 3 (fresh, searched, a bush just opened rustling, the snow falling,
// Stantler bolted, out of taps) and on a 4 × 4 at a phone's 360 px, a playable glade, the way in (the intro held for
// a tap, then its pop-up; the pop-up at once; on its own), the rules pop-up (INFO), the result card and the wipe line,
// and the outro. Every scene is also on /kitchen-sink/fx.
import { useMemo, useState } from 'react'
import {
  createRng,
  DEFAULT_TRACKS,
  hideStantler,
  tracksPrintAt,
  type TracksBush,
  type TracksField,
  type TracksPrint,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import {
  BushArt,
  GladeScene,
  Hoofprints,
  HoofIcon,
  STANTLER,
  TracksEntry,
  TracksEntryDialog,
  TracksGauge,
  TracksGlade,
  TracksOutroView,
  TracksPanel,
  TracksRulesModal,
  type GladeBush,
} from '@/components/Tracks'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

const DIRS: TracksPrint[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const HELD: TracksBush[] = ['empty', 'wild', 'find', 'cabin', 'stantler']

/** A glade as the engine leaves it after `opened` (its first bush first), seeded so the page is the same each time. */
function sample(round: number, opened: number[], seed = 3): { field: TracksField; bushes: GladeBush[] } {
  const mode = DEFAULT_TRACKS
  const spec = mode.rounds[round]!
  const all = hideStantler(spec, opened[0] ?? 0, createRng(seed))
  const field: TracksField = { taps: spec.taps - opened.length, bushes: all, opened }
  return {
    field,
    bushes: all.map((_, i) =>
      opened.includes(i)
        ? { held: all[i]!, print: tracksPrintAt(mode, field, spec.size, i) }
        : { held: null, print: null },
    ),
  }
}

/** A glade to play here: the engine's own rules, nothing saved. */
function PlayGlade({ name }: { name: string }) {
  const spec = DEFAULT_TRACKS.rounds[0]!
  const [seed, setSeed] = useState(11)
  const [opened, setOpened] = useState<number[]>([])
  const glade = useMemo(() => (opened.length ? sample(0, opened, seed) : null), [opened, seed])
  const bushes = glade?.bushes ?? Array.from({ length: 9 }, () => ({ held: null, print: null }))
  const found = glade?.field.bushes?.[opened.at(-1) ?? -1] === 'stantler'
  const out = opened.length >= spec.taps && !found
  return (
    <TracksPanel
      round={0}
      total={3}
      last={false}
      taps={spec.taps - opened.length}
      maxTaps={spec.taps}
      name={name}
    >
      <TracksGlade
        size={3}
        name={name}
        bushes={bushes}
        onTap={(i) => setOpened((o) => [...o, i])}
        disabled={found || out}
      />
      {(found || out) && (
        <PixelButton
          size="sm"
          onClick={() => {
            setOpened([])
            setSeed((s) => s + 1)
          }}
        >
          Again
        </PixelButton>
      )}
    </TracksPanel>
  )
}

export function TracksBits() {
  const { t } = useT()
  const name = useGame((s) => s.data.species[STANTLER]?.name ?? 'Stantler')
  const mode = DEFAULT_TRACKS
  const [open, setOpen] = useState<null | 'intro' | 'held' | 'entry' | 'info' | 'outro'>(null)
  const [snow, setSnow] = useState(0)
  const close = () => setOpen(null)
  const searched = sample(0, [4, 0, 2])
  const big = sample(2, [5, 0, 15, 12])
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap gap-2 [&>*]:max-w-full [&>*]:whitespace-normal">
        <PixelButton size="sm" onClick={() => setOpen('intro')}>
          The way in (the moon, a reindeer leaping into the bushes, tap to continue, then its pop-up)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('held')}>
          The pop-up over the intro&apos;s end (back from TEAM)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('entry')}>
          Its pop-up on its own (TEAM / NOT NOW / BEGIN THE SEARCH)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('info')}>
          Rules pop-up (INFO)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setSnow((n) => n + 1)}>
          The snow falling again
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen('outro')}>
          The outro (fresh snow over the prints)
        </PixelButton>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative h-[150px] overflow-hidden">
          <GladeScene />
        </div>
        <div className="relative h-[150px] overflow-hidden">
          <GladeScene still />
        </div>
      </div>
      <div className="grid max-w-xl gap-2">
        <TracksGauge round={0} total={3} />
        <TracksGauge round={2} total={3} />
        <TracksGauge round={3} total={3} />
      </div>
      {/* The bushes: closed, searched, what each held, and the prints in every direction. */}
      <div className="flex flex-wrap items-end gap-3">
        <BushArt px={3} />
        <BushArt open px={3} />
        {DIRS.map((d) => (
          <span key={d} className="grid justify-items-center gap-1 bg-[#14224a] p-1">
            <Hoofprints dir={d} size={24} />
            <span className="font-pixel-sm text-[14px] text-[#f4f8ff]">{d}</span>
          </span>
        ))}
      </div>
      <div className="max-w-sm">
        <TracksGlade
          size={5}
          name={name}
          bushes={HELD.map((held, i): GladeBush => ({
            held,
            print: held === 'stantler' ? null : DIRS[i * 2]!,
          })).concat(Array.from({ length: 20 }, () => ({ held: null, print: null })))}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {/* A fresh 3 × 3, every tap left. */}
        <TracksPanel round={0} total={3} last={false} taps={5} maxTaps={5} name={name}>
          <TracksGlade size={3} name={name} bushes={sample(0, []).bushes} />
        </TracksPanel>
        {/* Three bushes searched, the last rustling; their prints. */}
        <TracksPanel
          round={1}
          total={3}
          last={false}
          taps={searched.field.taps}
          maxTaps={5}
          name={name}
          note={t('ui.tracks.held.cabin')}
        >
          <TracksGlade
            size={3}
            name={name}
            bushes={searched.bushes}
            reveal={{ index: 2, held: searched.field.bushes![2]!, print: searched.bushes[2]!.print }}
            disabled
          />
        </TracksPanel>
        {/* The last tap spent: the snow falls over it, a fresh glade under it. */}
        <TracksPanel
          round={0}
          total={3}
          last={false}
          taps={5}
          maxTaps={5}
          name={name}
          note={t('ui.tracks.snowfall', { name })}
        >
          <TracksGlade
            key={snow}
            size={3}
            name={name}
            bushes={sample(0, []).bushes}
            reveal={{ index: 4, held: 'empty', print: 'ne' }}
            snowfall
            disabled
          />
        </TracksPanel>
        {/* Stantler bolted: a fresh glade, the line says so. */}
        <TracksPanel
          round={0}
          total={3}
          last={false}
          taps={5}
          maxTaps={5}
          name={name}
          note={t('ui.tracks.bolted', { name })}
        >
          <TracksGlade size={3} name={name} bushes={sample(0, []).bushes} />
        </TracksPanel>
        {/* Found: Stantler in its bush, the rest shut. */}
        <TracksPanel
          round={0}
          total={3}
          last={false}
          taps={2}
          maxTaps={5}
          name={name}
          note={t('ui.tracks.held.stantler', { name })}
        >
          <TracksGlade
            size={3}
            name={name}
            bushes={sample(0, [0, 1, 2]).bushes.map((b, i) =>
              i === 8 ? { held: 'stantler', print: null } : b,
            )}
            disabled
          />
        </TracksPanel>
      </div>
      {/* The last round's 4 × 4 at a phone's width: 360 px, 16 px each side. */}
      <div className="w-[328px] max-w-full">
        <TracksPanel round={2} total={3} last taps={big.field.taps} maxTaps={7} name={name}>
          <TracksGlade size={4} name={name} bushes={big.bushes} shiny />
        </TracksPanel>
      </div>
      <div className="max-w-sm">
        <PlayGlade name={name} />
      </div>
      {/* The result card after a round's Stantler, as VictoryView shows it; the wipe card's line. */}
      <div className="grid max-w-xl gap-2">
        <div className="light-scope flex items-center justify-center gap-2 bg-[#0b1530] p-2 text-center text-[#f4f8ff] shadow-[inset_0_3px_0_#f3efd6,0_0_0_2px_#24304f]">
          <HoofIcon size={22} />
          <span className="text-xl leading-tight">{t('ui.tracks.roundWon', { n: 1, total: 3, name })}</span>
        </div>
        <p className="copy m-0 text-lg">{t('ui.tracks.wipeBody')}</p>
      </div>
      <InfoButton name={t('ui.tracks.title')} onClick={() => setOpen('info')} />
      {open === 'intro' && (
        <TracksEntry mode={mode} name={name} onBegin={close} onNotNow={close} onTeam={close} />
      )}
      {open === 'held' && (
        <TracksEntry mode={mode} name={name} popup onBegin={close} onNotNow={close} onTeam={close} />
      )}
      <TracksEntryDialog
        open={open === 'entry'}
        mode={mode}
        name={name}
        onBegin={close}
        onNotNow={close}
        onTeam={close}
      />
      <TracksRulesModal open={open === 'info'} onClose={close} mode={mode} name={name} />
      {open === 'outro' && <TracksOutroView name={name} onDone={close} />}
    </div>
  )
}
