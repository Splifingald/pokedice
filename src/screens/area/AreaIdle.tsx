import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { autoAvailable, nightmareLock, portalLock, teamOf, type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { AutoModeToggle } from '@/components/AutoModeToggle'
import { RestingPanel } from '@/components/Extreme'
import { PixelIcon } from '@/components/icons'
import { PokeCard } from '@/components/PokeCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { useContinue } from '@/screens/home/ContinueBar'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { AreaDetails } from '@/screens/home/AreaDetails'
import { AreaPlate } from '@/screens/home/AreaPlate'
import { SceneStage } from '@/screens/home/SceneStage'
import { RunRoundGauge } from './RoundGauge'

/**
 * Between two encounters, the player stays in the area (only a full K.O. sends them Home): the team, each card opening
 * its sheet (lead, items), and the action bar — HOME, or what Home's CONTINUE would start next.
 */
export function AreaIdle({ area, scene = false }: { area: Area; scene?: boolean }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const { label, sub, go, explore, off, gym, boss, raid, closed, empty, resting } = useContinue(area)
  // Inside a portal run (docs/28) there is no way Home: CONTINUE alone.
  const locked = useGame((s) => !!portalLock(s.save, s.data))
  // The nightmare (docs/30) shuts travel only: HOME stays, the reason is said over the bar.
  const held = useGame((s) => nightmareLock(s.save, s.data))
  const autoHere = useGame((s) => !!s.save && autoAvailable(s.save, s.data, s.settings, area.id))
  if (!save) return null

  return (
    // Phones: room at the bottom for the action bar, which is pinned over the tab bar. With the scene (docs/42): the
    // area and its team on top, as on Home; wide screens put it on the left, the team and the bar beside it.
    <div
      className={cx(
        'flex flex-col gap-4 pb-[128px] md:pb-0',
        scene && 'lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-5',
      )}
    >
      {scene && <AreaSceneBox area={area} />}
      <div className="flex min-w-0 flex-col gap-4">
      {/* The round, once, over the panel (the scene's plate counts the rounds won, not this round's encounters). */}
      {scene && <RunRoundGauge />}
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
          <PixelButton size="sm" onClick={explore} disabled={empty}>
            {t('ui.home.keepExploring')}
          </PixelButton>
        </div>
      )}

      <AreaTeam />

      {/* Always on screen: phones pin it right above the tab bar; from 768px it sticks to the content column. */}
      <div
        className="fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3"
        style={{ bottom: 'var(--bottom-nav)', paddingBottom: 'calc(0.5rem + var(--bottom-safe))' }}
      >
        <div className="flex flex-col gap-1.5 md:mx-auto md:max-w-md">
          {/* Why the next encounter can't start (no energy, the area closed, everyone resting): said next to it. */}
          {off && <p className="m-0 truncate text-center font-pixel-sm text-[16px] leading-none text-muted">{sub}</p>}
          {locked && <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.portal.locked')}</p>}
          {held && (
            <p className="m-0 text-center font-pixel-sm text-[16px] leading-tight text-muted">
              {t('ui.nightmare.locked', { area: held.name })}
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
        </div>
      </div>
      </div>
    </div>
  )
}

/**
 * The area with the team roaming it (docs/42: the action on top), as on Home: its plate opens the area's details, a
 * Pokémon its sheet. Under the top bar on phones; on wide screens the left column, held in view as the page scrolls.
 */
export function AreaSceneBox({ area }: { area: Area }) {
  const save = useGame((s) => s.save)
  const [details, setDetails] = useState(false)
  const [mon, setMon] = useState<SheetView | null>(null)
  if (!save) return null
  return (
    <div className="-mx-3 -mt-4 min-w-0 overflow-hidden shadow-ledge md:m-0 lg:sticky lg:top-[calc(var(--top-bar,0px)_+_1rem)]">
      <SceneStage area={area} team={teamOf(save)} onOpen={(id) => setMon({ kind: 'inst', id })}>
        <AreaPlate area={area} onOpen={() => setDetails(true)} />
      </SceneStage>
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
      {/* Cards three to a row, as at the Center and the send-out step (the rework); a wide screen keeps them in the
          panel beside the scene (docs/42). */}
      <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {team.map((p, i) => (
          <PokeCard
            key={p.id}
            inst={p}
            onOpen={() => setView({ kind: 'inst', id: p.id })}
            openLabel={t('ui.newGame.monInfo', { name: p.nickname || data.species[p.dex]?.name || '' })}
            badge={i === 0 ? <PixelIcon name="crown" size={16} title={t('ui.team.lead')} /> : null}
          />
        ))}
      </ol>
      <SheetModal view={view} onClose={() => setView(null)} manage />
    </section>
  )
}
