import { useEffect, useState } from 'react'
import { cx } from '@/theme/util'
import { Navigate, useNavigate } from 'react-router-dom'
import { heldWorld, linearAreas, regionOf, teamOf, type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { RegionBar } from '@/components/RegionBar'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { useGame } from '@/store/game'
import { enterArea } from '@/store/run'
import { takeResumeLanding } from '@/store/resume'
import { regionOnOffer } from '@/store/regions'
import { AreaDetails } from './home/AreaDetails'
import { AreaPlate } from './home/AreaPlate'
import { AreasSheet, type AreasFilter } from './home/AreasSheet'
import { ContinueBar, useContinue } from './home/ContinueBar'
import { hasNewSecret, playable } from './home/areas'
import { SceneStage } from './home/SceneStage'
import { travelTo } from '@/store/travel'
import { Widgets } from './home/Widgets'
import { useInWorld, WorldStrip, WorldWaiting } from '@/screens/events/world'

/**
 * Home: the area hub and the landing screen. The current area's scenery with the team roaming it, the area plate (its
 * details), CONTINUE (the next encounter, or the challenge waiting), the Areas sheet, and the widgets two by two.
 */
export function HomeScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const area =
    (save && data.areas.find((a) => a.id === save.currentAreaId)) ||
    (save ? linearAreas(data, regionOf(save))[0] : undefined)
  // Inside a small world whose content hasn't come in yet (the game boots on its own bundle, which never has the
  // admin's worlds): its strip and the way back, until it does.
  if (save && !area && heldWorld(save)?.regionId === regionOf(save)) return <WorldWaiting />
  if (!save || !area) return <Navigate to="/" replace />
  return <HomeView area={area} />
}

function HomeView({ area }: { area: Area }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const runArea = useGame((s) => s.run.areaId)
  const [details, setDetails] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ view: 'areas' | 'regions'; filter: AreasFilter; key: number } | null>(
    null,
  )
  const [mon, setMon] = useState<SheetView | null>(null)
  const { go, latest, keepExploring } = useContinue(area)
  // What sits under CONTINUE takes its height off the scene on wide screens, so the whole bar stays on screen: the
  // green GO TO (a 56px button and its gap) and "keep exploring" (36px and its gap).
  // Inside a small world only its own things show (docs/21): its strip (about 60px and the gap) above the scene, no
  // other region on offer, no region switcher.
  const inside = useInWorld().inside
  const strip = inside ? 72 : 0
  const below = (latest ? 64 : 0) + (keepExploring ? 44 : 0) + strip

  // Opened on an encounter left under way (store/resume.ts; the installed app starts on Home): straight back into it.
  const navigate = useNavigate()
  useEffect(() => {
    if (takeResumeLanding(useGame.getState().run)) navigate('/area', { replace: true })
  }, [navigate])

  // Arriving with no run (a reload, the first visit): start the save's current area, so CONTINUE plays right there.
  useEffect(() => {
    if (!runArea && playable(save, data, area)) enterArea(area.id)
  }, [save, data, area, runArea])

  const offer = inside ? null : regionOnOffer()
  const areasState = offer ? 'region' : hasNewSecret(save, data) ? 'new' : 'plain'

  // GO / CONTINUE HERE: close the sheets and play the area you're in.
  const play = () => {
    setSheet(null)
    setDetails(null)
    go()
  }
  const travel = (a: Area) => {
    if (!travelTo(a)) return
    setSheet(null)
    setDetails(null)
  }
  const detailArea = details ? (data.areas.find((a) => a.id === details) ?? null) : null

  return (
    // Wide screens: the scene takes all the room it can (same shape, never resized out of it) while the widgets keep
    // their two columns and CONTINUE stays above the fold: its height is the viewport less the top bar, the page's
    // padding and the Continue bar (≈184px, plus what sits under it: --below), its width follows from the scene's
    // 288:276 shape, and it never takes more than 58% of the row (on a 1024px screen the widgets would be squeezed out).
    <div
      className="flex flex-col gap-3 md:gap-4 lg:grid lg:grid-cols-[minmax(320px,min(calc((100dvh-184px-var(--below))*288/276),58%))_minmax(0,1fr)] lg:items-start lg:gap-5"
      style={{ ['--below' as string]: `${below}px` }}
    >
      <h1 className="sr-only">{t('ui.home.heading', { area: area.name })}</h1>
      {inside && (
        <div className="-mx-3 -mt-4 md:m-0 lg:col-span-2">
          <WorldStrip />
        </div>
      )}
      <section className="flex flex-col gap-3" aria-label={area.name}>
        <div className={cx('-mx-3 overflow-hidden shadow-ledge md:pixel-panel md:m-0 md:p-0 md:shadow-none', !inside && '-mt-4')}>
          <SceneStage area={area} team={teamOf(save)} onOpen={(id) => setMon({ kind: 'inst', id })}>
            <AreaPlate area={area} onOpen={() => setDetails(area.id)} />
          </SceneStage>
        </div>
        <ContinueBar
          area={area}
          areasState={areasState}
          onAreas={() =>
            setSheet({ view: areasState === 'region' ? 'regions' : 'areas', filter: 'all', key: Date.now() })
          }
        />
      </section>
      <section aria-label={t('ui.home.widgets')}>
        <Widgets onSecrets={() => setSheet({ view: 'areas', filter: 'secret', key: Date.now() })} />
      </section>

      <AreasSheet
        key={sheet?.key ?? 0}
        open={!!sheet}
        onClose={() => setSheet(null)}
        view={sheet?.view ?? 'areas'}
        filter={sheet?.filter ?? 'all'}
        onDetails={(id) => setDetails(id)}
        onPlay={play}
        onTravel={travel}
      />
      <AreaDetails area={detailArea} onClose={() => setDetails(null)} onPlay={play} onTravel={travel} />
      <SheetModal view={mon} onClose={() => setMon(null)} manage />
      {/* The next region's offer opens by itself once, when a league is won. */}
      {!inside && <RegionBar modalOnly />}
    </div>
  )
}
