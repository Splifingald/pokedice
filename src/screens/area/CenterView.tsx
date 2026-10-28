import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { POKE_TYPES, teamOf, type PokemonInstance, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { BoxFilter, sortBox, type BoxSort } from '@/components/BoxSort'
import { PokeCard } from '@/components/PokeCard'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { StageCanvas } from '@/components/StageCanvas'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { loadCenterArt } from '@/fx/scenes'
import { quicken } from '@/fx/timeline'
import { centerTimeline } from '@/fx/timelines/center'
import { useMotion } from '@/lib/motion'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { StagePanel } from '@/screens/area/StagePanel'
import { useGame } from '@/store/game'
import { continueExploring, finishCenter, markHealShown } from '@/store/run'

const BOX_SORTS: readonly BoxSort[] = ['dex', 'level', 'type', 'newest']

/** Chansey, behind the healing machine's counter. */
const NURSE = 113
/** How much faster than the full scene (6.4 s) the Center's healing plays. */
const CENTER_PACE = 2.4

/** Pokémon Center: heal jingle, then team management — tap any Pokémon for its sheet and team actions. */
export function CenterView() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { level } = useMotion()
  // Already played (back from Home), or animations off: no scene, the team and the Box at once.
  const [healing, setHealing] = useState(() => level !== 'off' && !useGame.getState().run.healShown)
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<BoxSort>('dex')
  const [type, setType] = useState<PokeType | 'all'>('all')
  const teamSize = useGame((s) => s.save?.team.length ?? 1)
  // The machine plays once, on arrival: the full scene (the balls set down, the jingle) at a brisk pace, a little longer
  // than the one flash it was (the user's call, 2026-10-27: about 2.7 s).
  const [machine] = useState(() => ({
    ready: Promise.all([loadSprite(NURSE, false), loadCenterArt()]),
    timeline: quicken(centerTimeline({ balls: teamSize, nurse: spriteKey(NURSE, false) }), CENTER_PACE),
  }))
  // The team is healed already (engage): once the jingle has started, leaving and coming back doesn't play it again.
  useEffect(() => markHealShown(), [])

  if (!save) return null
  const team = teamOf(save)
  // The Box under the Team screen's one filter control (its order and a type), so the two never disagree.
  const typesOf = (p: PokemonInstance) => {
    const sp = data.species[p.dex]
    return sp ? [sp.type1, ...(sp.type2 ? [sp.type2] : [])] : []
  }
  const boxAll = save.box.filter((p) => !save.team.includes(p.id))
  const boxTypes = POKE_TYPES.filter((ty) => boxAll.some((p) => typesOf(p).includes(ty)))
  const box = sortBox(
    boxAll.filter((p) => type === 'all' || typesOf(p).includes(type)),
    sort,
    data,
  )
  const open = (p: PokemonInstance) => setView({ kind: 'inst', id: p.id })
  const done = () => setView(null)

  const heal = (
    <StageCanvas
      timeline={machine.timeline}
      ready={machine.ready}
      onEnd={() => setTimeout(() => setHealing(false), 250)}
      label={t('ui.center.healing')}
    />
  )
  // The healing plays at the top, then folds away so the team and the Box get the screen (the user's rule), the round's
  // strip staying under the top bar. On every screen: a wide one keeps no picture beside the panel once healed (the
  // user's call, 2026-10-28: the area with the team behind the Center was "completely unnecessary", and taller than the
  // window). Inside, a small banner says where you are, under the round's strip, for as long as you stay (2026-10-27).
  const sign = <CenterSign />
  const stage = (
    <div className="relative">
      <RunRoundGauge strip className="absolute inset-x-0 top-0 z-30" />
      {/* Its height kept by the strip when the healing has gone. */}
      <div aria-hidden className="h-[14px]" />
      {!healing && sign}
      <AnimatePresence initial={false}>
        {healing && (
          <motion.div
            key="heal"
            className="-mt-[14px] overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* A wide screen: the machine at a size the window holds, centred over the cards. */}
            <div className="shadow-ledge lg:mx-auto lg:max-w-[min(720px,calc((100dvh-var(--top-bar,0px)-12rem)*1.5))]">
              {heal}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
  const bar = (
    // Healed: back Home, or straight on to this area's next encounter. Never by itself: the Center waits for the Box.
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
      <PixelButton
        size="lg"
        className="whitespace-nowrap px-2"
        onClick={() => {
          finishCenter()
          navigate('/home')
        }}
      >
        {t('ui.nav.home')}
      </PixelButton>
      <PixelButton
        variant="primary"
        size="lg"
        className="whitespace-nowrap px-2"
        onClick={() => {
          finishCenter()
          continueExploring()
        }}
      >
        {t('ui.common.continue')}
      </PixelButton>
    </div>
  )
  return (
    <>
      <StagePanel scene={stage} bar={bar} room={null}>
        <section className="flex flex-col gap-2">
          <h2 className="text-3xl">
            {t('ui.center.teamCount', { count: team.length, max: data.config.maxTeamSize })}
          </h2>
          {/* Three to a row on a phone; a wide screen's whole width, six to a row, the team's cards the Box's size. */}
          <ol className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:grid-cols-6">
            {team.map((p, i) => (
              <PokeCard
                key={p.id}
                inst={p}
                onOpen={() => open(p)}
                openLabel={t('ui.newGame.monInfo', { name: p.nickname || data.species[p.dex]?.name || '' })}
                lead={i === 0}
              />
            ))}
            {Array.from({ length: Math.max(0, data.config.maxTeamSize - team.length) }, (_, i) => (
              <li
                key={`empty-${i}`}
                className="flex min-h-[96px] items-center justify-center border-[3px] border-dashed border-shadow p-1 text-center text-base text-muted"
              >
                {t('ui.center.emptySlot')}
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
            <h2 className="text-3xl">{t('ui.team.box', { count: box.length })}</h2>
            {boxAll.length > 1 && (
            <BoxFilter
              sort={sort}
              onSort={setSort}
              sorts={BOX_SORTS}
              type={type}
              onType={setType}
              types={boxTypes}
              shown={box.length}
            />
          )}
          </div>
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:grid-cols-6">
            {box.map((p) => (
              <PokeCard
                key={p.id}
                inst={p}
                onOpen={() => open(p)}
                openLabel={t('ui.newGame.monInfo', { name: p.nickname || data.species[p.dex]?.name || '' })}
              />
            ))}
          </ul>
        </section>
      </StagePanel>
      {/* The Center is where the team changes: the sheet's swap dock (one tap swaps one in). */}
      <SheetModal view={view} onClose={done} manage swaps />
    </>
  )
}

/** The Pokémon Center's sign while you're inside: its heart and its name. */
export function CenterSign() {
  const { t } = useT()
  return (
    // The panel's colours (both themes), a Center's pink rule under it.
    <p className="m-0 flex min-h-[40px] items-center justify-center gap-2 bg-panel px-3 text-[20px] leading-none text-ink shadow-[inset_0_-3px_0_#f2829f]">
      <PixelIcon name="heart" size={18} />
      {t('ui.home.kind.center')}
    </p>
  )
}
