import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cx } from '@/theme/util'
import { Navigate, useNavigate } from 'react-router-dom'
import { heldWorld, linearAreas, regionOf, teamOf, type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { RegionBar } from '@/components/RegionBar'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { UnownStrip, useUnownStrip } from '@/components/UnownDex'
import { useGame } from '@/store/game'
import { closeVictoryLeftOpen, enterArea } from '@/store/run'
import { takeResumeLanding } from '@/store/resume'
import { regionOnOffer } from '@/store/regions'
import { AreasSheet, type AreasView } from './home/AreasSheet'
import { AreaButton, PlayDock, useContinue, type AreasState } from './home/ContinueBar'
import { hasNewSecret, playable } from './home/areas'
import { HereCard } from './home/HereCard'
import { HomeNotices } from './home/Notices'
import { H as SCENE_H, W as SCENE_W } from './home/scene'
import { SceneStage } from './home/SceneStage'
import { pictureOf } from '@/fx/areaArt'
import { nightmareLock } from '@/engine'
import { travelTo } from '@/store/travel'
import { Widgets } from './home/Widgets'
import { useInWorld, WorldStrip, WorldWaiting } from '@/screens/events/world'

/**
 * Home (docs/43 §5.2): the area's scene with the team roaming it on top, then the notices and what's open (Events,
 * Secret areas, Features) as one list of cards; the PLAY dock — the area button (its name and rounds, opening the Areas
 * sheet) and CONTINUE — pinned at the bottom on phones. On PC the scene stands as tall as the window on the left and
 * the dock heads the column beside it.
 */
/** How much of the scene's height a phone shows (the user's call, 2026-10-27: about 70 %). */
const SCENE_SHOWN = 0.7

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

/** An element's height, kept up to date: the room the pinned dock covers, given back under the page. */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [h, setH] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, h] as const
}

function HomeView({ area }: { area: Area }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const runArea = useGame((s) => s.run.areaId)
  const runPhase = useGame((s) => s.run.phase)
  const [sheet, setSheet] = useState<{ view: AreasView; key: number } | null>(null)
  const [mon, setMon] = useState<SheetView | null>(null)
  // The region notice's GO: the professor's lab for the new region (RegionBar holds it).
  const [regionGo, setRegionGo] = useState(0)
  const { go, goTo } = useContinue(area)
  // Inside a small world only its own things show (docs/21): its strip above the scene, no other region on offer, no
  // region switcher. Where Unown live (docs/41) the Unown Pokédex's banner sits there the same way. Wide screens take
  // its room off the scene, so the scene stays in view.
  const inside = useInWorld().inside
  const unown = useUnownStrip()
  const strip = inside || unown ? 72 : 0

  // Opened on an encounter left under way (store/resume.ts; the installed app starts on Home): straight back into it.
  const navigate = useNavigate()
  useEffect(() => {
    if (takeResumeLanding(useGame.getState().run)) navigate('/area', { replace: true })
  }, [navigate])

  // Arriving with no run (a reload, the first visit): start the save's current area, so CONTINUE plays right there.
  useEffect(() => {
    if (!runArea && playable(save, data, area)) enterArea(area.id)
  }, [save, data, area, runArea])

  // Back Home from under a won fight's result card (the back gesture): it closes as its HOME would, so the menus open
  // again and the area the fight opened can be travelled to, rather than waiting on a card nobody sees.
  useEffect(() => {
    if (runPhase === 'victory') closeVictoryLeftOpen()
  }, [runPhase])

  const offer = inside ? null : regionOnOffer()
  const areasState: AreasState = offer ? 'region' : hasNewSecret(save, data) ? 'new' : 'plain'

  // CONTINUE HERE / GO in the sheet: close it and play the area you're in.
  const play = () => {
    setSheet(null)
    go()
  }
  const travel = (a: Area) => {
    if (!travelTo(a)) return
    setSheet(null)
  }
  const openSheet = (view: AreasView) => setSheet({ view, key: Date.now() })
  const wide = useMediaQuery('(min-width: 1024px)')
  // Darkrai's nightmare holds the player in its area (docs/30): the banner is shut, and says why.
  const held = useGame((s) => nightmareLock(s.save, s.data))
  const heldWhy = held ? t('ui.nightmare.locked', { area: held.name }) : null
  // What the phone's shorter scene keeps: a window of SCENE_SHOWN of its height, centred on where the team walks.
  const walk = pictureOf(area.id)?.walk
  const walkMid = walk ? (walk[1] + walk[3]) / 2 / SCENE_H : 0.62
  const cropTop = Math.min(1 - SCENE_SHOWN, Math.max(0, walkMid - SCENE_SHOWN / 2))
  const dock = <PlayDock area={area} />
  const [dockRef, dockH] = useHeight<HTMLDivElement>()
  // PC: CONTINUE under the scene, in the pinned column, always in sight (the user's call, 2026-10-27); the scene gives it
  // its room in the window's height.
  const [wideDockRef, wideDockH] = useHeight<HTMLDivElement>()
  const below = strip + (wide && wideDockH ? wideDockH + 12 : 0)

  return (
    <div
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(380px,34%,520px)] lg:items-start lg:gap-5"
      style={{ ['--below' as string]: `${below}px` }}
    >
      <h1 className="sr-only">{t('ui.home.heading', { area: area.name })}</h1>
      {/* The scene: full width on a phone, bleeding to the edges; on PC as tall as the window (less the top bar and
          the page's padding), kept close to its own shape (at most 1.15 times as tall as wide) and pinned while the
          column beside it scrolls. */}
      <section
        aria-label={area.name}
        className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--top-bar,56px)+1rem)]"
        style={{ containerType: 'inline-size' }}
      >
        {inside && (
          <div className="-mx-3 -mt-4 md:m-0">
            <WorldStrip />
          </div>
        )}
        {!inside && unown && (
          <div className="-mx-3 -mt-4 md:m-0">
            <UnownStrip />
          </div>
        )}
        <div
          className={cx(
            'relative -mx-3 overflow-hidden shadow-ledge md:pixel-panel md:m-0 md:p-0 md:shadow-none',
            !inside && !unown && '-mt-4 md:mt-0',
          )}
          style={
            wide
              ? { height: 'min(calc(100dvh - var(--top-bar, 56px) - 3.5rem - var(--below)), 115cqw)' }
              : { height: `calc(100cqw * ${(SCENE_H / SCENE_W).toFixed(4)} * ${SCENE_SHOWN})` }
          }
        >
          {/* The area's banner on top of the scene, as before (the user's call, 2026-10-27): it opens the areas. */}
          <div className="absolute inset-x-3 top-3 z-10">
            <AreaButton area={area} areasState={areasState} heldWhy={heldWhy} onOpen={() => openSheet('details')} />
          </div>
          {wide ? (
            <SceneStage area={area} team={teamOf(save)} onOpen={(id) => setMon({ kind: 'inst', id })} fill focus={walkMid} />
          ) : (
            // Phones: the scene at about 70 % of its height (the user's call), the window kept on where the team walks.
            <div style={{ marginTop: `calc(-100cqw * ${(SCENE_H / SCENE_W).toFixed(4)} * ${cropTop.toFixed(3)})` }}>
              <SceneStage area={area} team={teamOf(save)} onOpen={(id) => setMon({ kind: 'inst', id })} />
            </div>
          )}
        </div>
        {wide && <div ref={wideDockRef}>{dock}</div>}
      </section>
      <div className="flex min-w-0 flex-col gap-4">
        {wide && <HereCard area={area} onOpen={() => openSheet('details')} />}
        <HomeNotices onRegionGo={() => setRegionGo((n) => n + 1)} />
        <section aria-label={t('ui.home.widgets')}>
          <Widgets />
        </section>
      </div>
      {!wide && (
        <>
          {/* Phones: pinned over the tab bar, in the thumb's reach, the page scrolling behind it; from 768 px (no tab
              bar) it sticks to the foot of the column. The spacer gives its room back under the page. */}
          <div aria-hidden className="md:hidden" style={{ height: Math.max(0, dockH - 28) }} />
          <div
            ref={dockRef}
            className="fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 pb-2.5 pt-2 md:sticky md:inset-x-auto md:-mx-3 md:mt-auto md:border-t-0"
            style={{ bottom: 'var(--bottom-nav)' }}
          >
            {dock}
          </div>
        </>
      )}

      <AreasSheet
        key={sheet?.key ?? 0}
        open={!!sheet}
        onClose={() => setSheet(null)}
        view={sheet?.view ?? 'details'}
        filter="all"
        area={area.id}
        lead={goTo?.area.id ?? area.id}
        onPlay={play}
        onTravel={travel}
      />
      <SheetModal view={mon} onClose={() => setMon(null)} manage />
      {/* The next region's offer opens by itself once, when a league is won. */}
      {!inside && <RegionBar go={regionGo} />}
    </div>
  )
}
