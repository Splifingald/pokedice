import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamOf, type Area } from '@/engine'
import { useT } from '@/i18n/react'
import { RestingPanel } from '@/components/Extreme'
import { PixelIcon } from '@/components/icons'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { useContinue } from '@/screens/home/ContinueBar'
import { useGame } from '@/store/game'

/**
 * Between two encounters, the player stays in the area (only a full K.O. sends them Home): the team, each card opening
 * its sheet (lead, items), and the action bar — HOME, or what Home's CONTINUE would start next.
 */
export function AreaIdle({ area }: { area: Area }) {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const max = useGame((s) => s.data.config.maxTeamSize)
  const { label, sub, go, explore, off, gym, boss, raid, closed, empty, resting } = useContinue(area)
  const [view, setView] = useState<SheetView | null>(null)
  if (!save) return null
  const team = teamOf(save)

  return (
    // Phones: room at the bottom for the action bar, which is pinned over the tab bar.
    <div className="flex flex-col gap-4 pb-[128px] md:pb-0">
      <p className="pixel-dialogue m-0 flex items-center gap-3 px-3 py-2.5 text-[20px] leading-[1.15]" aria-live="polite">
        <PixelIcon name="map" size={24} className="shrink-0" />
        <span>{t('ui.area.between')}</span>
      </p>

      {resting && <RestingPanel />}
      {/* A gym, a legendary or a raid waits: the bar challenges it; this explores on instead, as on Home. */}
      {(gym || boss || raid) && !closed && !resting && (
        <div className="flex justify-end">
          <PixelButton size="sm" onClick={explore} disabled={empty}>
            {t('ui.home.keepExploring')}
          </PixelButton>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-3xl">{t('ui.center.teamCount', { count: team.length, max })}</h2>
        <ol className="grid gap-2 md:grid-cols-3">
          {team.map((p, i) => (
            <li key={p.id}>
              <MonCard
                inst={p}
                onClick={() => setView({ kind: 'inst', id: p.id })}
                badge={i === 0 ? <PixelIcon name="crown" size={20} title={t('ui.team.lead')} /> : null}
              />
            </li>
          ))}
        </ol>
      </section>

      {/* Always on screen: phones pin it right above the tab bar; from 768px it sticks to the content column. */}
      <div
        className="fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3"
        style={{ bottom: 'var(--bottom-nav)' }}
      >
        <div className="flex flex-col gap-1.5 md:mx-auto md:max-w-md">
          {/* Where the round stands, over the buttons that carry it on. */}
          <RunRoundGauge />
          {/* Why the next encounter can't start (no energy, the area closed, everyone resting): said next to it. */}
          {off && <p className="m-0 truncate text-center font-pixel-sm text-[15px] leading-none text-muted">{sub}</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <PixelButton size="lg" className="px-2" onClick={() => navigate('/home')}>
              {t('ui.nav.home')}
            </PixelButton>
            <PixelButton variant="primary" size="lg" className="px-2" disabled={off} onClick={go}>
              {(gym || boss || raid) && <PixelIcon name="sword" size={22} />}
              {gym || boss || raid ? label : t('ui.common.continue')}
            </PixelButton>
          </div>
        </div>
      </div>

      <SheetModal view={view} onClose={() => setView(null)} manage />
    </div>
  )
}
