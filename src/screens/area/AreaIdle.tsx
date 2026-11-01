import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { autoAvailable, heldIn, portalLock, teamOf, type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { AutoModeToggle } from '@/components/AutoModeToggle'
import { RestingPanel } from '@/components/Extreme'
import { PixelIcon } from '@/components/icons'
import { PokeCard } from '@/components/PokeCard'
import { skinKey, skinOfArea } from '@/components/portalSkin'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { useContinue } from '@/screens/home/ContinueBar'
import { useGame } from '@/store/game'
import { AreaDetails } from '@/screens/home/AreaDetails'
import { AreaPlate } from '@/screens/home/AreaPlate'
import { H as SCENE_H } from '@/screens/home/scene'
import { SceneStage } from '@/screens/home/SceneStage'
import { pictureOf } from '@/fx/areaArt'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cx } from '@/theme/util'
import { RunRoundGauge } from './RoundGauge'
import { StagePanel } from './StagePanel'

/**
 * Between two encounters, the player stays in the area (only a full K.O. sends them Home): the team, each card opening
 * its sheet (lead, items), and the action bar — HOME, or what Home's CONTINUE would start next.
 */
export function AreaIdle({ area, scene = false }: { area: Area; scene?: boolean }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const { label, sub, go, explore, off, gym, boss, raid, closed, resting } = useContinue(area)
  // Inside a portal run (docs/28) there is no way Home: CONTINUE alone.
  const locked = useGame((s) => !!portalLock(s.save, s.data))
  const data = useGame((s) => s.data)
  // The nightmare (docs/30) and the whiteout (docs/61 §4.3) shut travel only: HOME stays, the reason is said over the bar.
  const held = useGame((s) => heldIn(s.save, s.data)?.area ?? null)
  const heldBy = useGame((s) => heldIn(s.save, s.data)?.by ?? 'nightmare')
  const autoHere = useGame((s) => !!s.save && autoAvailable(s.save, s.data, s.settings, area.id))
  if (!save) return null

  const bar = (
    <>
      {/* Why the next encounter can't start (the area closed, everyone resting): said next to it. */}
      {off && <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-ink">{sub}</p>}
      {locked && (
        <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-ink">
          {t(skinKey(skinOfArea(area, data), 'ui.portal.locked'))}
        </p>
      )}
      {held && (
        <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-ink">
          {t(`ui.${heldBy}.locked`, { area: held.name })}
        </p>
      )}
      <div className={locked ? 'grid' : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5'}>
        {!locked && (
          <PixelButton size="lg" className="px-2" onClick={() => navigate('/home')}>
            {t('ui.nav.home')}
          </PixelButton>
        )}
        <PixelButton variant="primary" size="lg" className="px-2" disabled={off} onClick={go}>
          {(gym || boss || raid) && <PixelIcon name="sword" size={22} />}
          {gym || boss || raid ? label : t('ui.common.continue')}
        </PixelButton>
      </div>
    </>
  )
  return (
    // The scene and its panel (docs/43 §5.3): the area and its team on top (PC too), the round's strip on its top edge
    // as in a fight, its plate naming the area once; the panel under it holds the team's cards and the bar.
    <StagePanel scene={scene ? <AreaSceneBox area={area} /> : null} bar={bar}>
      {/* The area's banner held it before the scene took its place: a cleared area (any, with Idle) plays itself. */}
      {scene && autoHere && (
        <div className="flex justify-end">
          <AutoModeToggle />
        </div>
      )}
      {resting && <RestingPanel />}
      {/* A gym, a legendary or a raid waits: the bar challenges it; this explores on instead, as on Home. */}
      {(gym || boss || raid) && !closed && !resting && (
        <div className="flex justify-end">
          <PixelButton size="sm" onClick={explore}>
            {t('ui.home.keepExploring')}
          </PixelButton>
        </div>
      )}
      <AreaTeam />
    </StagePanel>
  )
}

/**
 * The area with the team roaming it (docs/42: the action on top), as on Home: its plate opens the area's details, a
 * Pokémon its sheet. Under the top bar on phones; on wide screens a 3:2 box over the panel, as a fight's stage.
 */
export function AreaSceneBox({ area }: { area: Area }) {
  const save = useGame((s) => s.save)
  const [details, setDetails] = useState(false)
  const [mon, setMon] = useState<SheetView | null>(null)
  // Wide screens: the fight's 3:2 box, the scene filling it around where the team walks, so it fits the window with the
  // panel under it (the square scene, a column wide, ran past the window's foot: the user's report, 2026-10-28).
  const wide = useMediaQuery('(min-width: 1024px)')
  const walk = pictureOf(area.id)?.walk
  const walkMid = walk ? (walk[1] + walk[3]) / 2 / SCENE_H : 0.62
  if (!save) return null
  return (
    <div className={cx('relative min-w-0 overflow-hidden shadow-ledge', wide && 'aspect-[3/2]')}>
      <SceneStage
        area={area}
        team={teamOf(save)}
        onOpen={(id) => setMon({ kind: 'inst', id })}
        fill={wide}
        focus={walkMid}
      />
      {/* Over the box, not the scene (which a wide box crops at its sides): the round's encounters as the fight's strip,
          and the plate under it counting the rounds (no second gauge). */}
      <RunRoundGauge strip className="absolute inset-x-0 top-0 z-[480]" />
      <AreaPlate area={area} onOpen={() => setDetails(true)} />
      <AreaDetails area={details ? area : null} onClose={() => setDetails(false)} />
      <SheetModal view={mon} onClose={() => setMon(null)} manage />
    </div>
  )
}

/**
 * The team between encounters: each Pokémon's card (HP, K.O.), the lead crowned, a tap opens its sheet. On the area's
 * page, and under a distortion's boons (docs/28), so who is K.O. and how much HP is left show where the boon is picked.
 */
export function AreaTeam() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const max = data.config.maxTeamSize
  const [view, setView] = useState<SheetView | null>(null)
  if (!save) return null
  const team = teamOf(save)
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-3xl">{t('ui.center.teamCount', { count: team.length, max })}</h2>
      {/* Cards three to a row, as at the Center and the send-out step (the rework), under the scene on every screen. */}
      <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {team.map((p, i) => (
          <PokeCard
            key={p.id}
            inst={p}
            onOpen={() => setView({ kind: 'inst', id: p.id })}
            openLabel={t('ui.newGame.monInfo', { name: p.nickname || data.species[p.dex]?.name || '' })}
            lead={i === 0}
          />
        ))}
      </ol>
      <SheetModal view={view} onClose={() => setView(null)} manage />
    </section>
  )
}
