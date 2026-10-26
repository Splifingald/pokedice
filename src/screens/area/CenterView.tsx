import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { teamOf, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { BoxSortPicker, sortBox, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { PokeCard } from '@/components/PokeCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { StageCanvas } from '@/components/StageCanvas'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { loadCenterArt } from '@/fx/scenes'
import { centerTimeline } from '@/fx/timelines/center'
import { useMotion } from '@/lib/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { AreaSceneBox } from '@/screens/area/AreaIdle'
import { TeamSwapActions } from '@/components/TeamSwapActions'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { StagePanel } from '@/screens/area/StagePanel'
import { useGame } from '@/store/game'
import { continueExploring, finishCenter, markHealShown } from '@/store/run'

/** Chansey, behind the healing machine's counter. */
const NURSE = 113

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
  const teamSize = useGame((s) => s.save?.team.length ?? 1)
  const wide = useMediaQuery('(min-width: 1024px)')
  const area = useGame((s) => s.data.areas.find((a) => a.id === s.run.areaId))
  // The machine plays once, on arrival, and quickly: always the short version (one flash, healed), on the page.
  const [machine] = useState(() => ({
    ready: Promise.all([loadSprite(NURSE, false), loadCenterArt()]),
    timeline: centerTimeline({ balls: teamSize, nurse: spriteKey(NURSE, false), short: true }),
  }))
  // The team is healed already (engage): once the jingle has started, leaving and coming back doesn't play it again.
  useEffect(() => markHealShown(), [])

  if (!save) return null
  const team = teamOf(save)
  const box = sortBox(
    save.box.filter((p) => !save.team.includes(p.id)),
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
  // The scene (docs/43 §5.3, as a fight): wide screens keep it on the left — the healing, then the area with the team,
  // healed; phones play the healing at the top, then fold it away so the team and the Box get the screen (the user's
  // rule), the round's strip staying under the top bar.
  const stage = wide ? (
    healing ? (
      <div className="relative overflow-hidden shadow-ledge">
        <RunRoundGauge strip className="absolute inset-x-0 top-0 z-30" />
        {heal}
      </div>
    ) : (
      area && <AreaSceneBox area={area} />
    )
  ) : (
    <div className="relative">
      <RunRoundGauge strip className="absolute inset-x-0 top-0 z-30" />
      {/* Its height kept by the strip when the healing has gone. */}
      <div aria-hidden className="h-[6px]" />
      <AnimatePresence initial={false}>
        {healing && (
          <motion.div
            key="heal"
            className="-mt-[6px] overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="shadow-ledge">{heal}</div>
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
      <StagePanel scene={stage} bar={bar}>
        <section className="flex flex-col gap-2">
          <h2 className="text-3xl">
            {t('ui.center.teamCount', { count: team.length, max: data.config.maxTeamSize })}
          </h2>
          <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {team.map((p, i) => (
              <PokeCard
                key={p.id}
                inst={p}
                onOpen={() => open(p)}
                openLabel={t('ui.newGame.monInfo', { name: p.nickname || data.species[p.dex]?.name || '' })}
                badge={i === 0 ? <PixelIcon name="crown" size={16} title={t('ui.team.lead')} /> : null}
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
            {box.length > 1 && <BoxSortPicker sort={sort} onChange={setSort} />}
          </div>
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
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
      <SheetModal
        view={view}
        onClose={done}
        instExtra={(inst) => <TeamSwapActions inst={inst} onDone={done} />}
      />
    </>
  )
}
