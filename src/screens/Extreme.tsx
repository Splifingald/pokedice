// The Extreme page (docs/48): Extreme mode as a speedrun. Every region whose League the main save has beaten is a run,
// from its starter to its League on a clock that never stops: each card shows its team, badges, clock and best time,
// and starts, plays or restarts it. Under them, the best times of every player. Reached from the trainer menu, in
// either save; from the main save, a choice switches to the Extreme save first (store/extremeRuns.ts).
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  extremeOpen,
  extremeRegionList,
  extremeRegions,
  getRegion,
  isExtreme,
  regionOf,
  type Region,
} from '@/engine'
import { useExtremeRules, ExtremeRulesModal } from '@/components/Extreme'
import { RestartRunModal, RunCard } from '@/components/ExtremeRuns'
import { ExtremeBoard } from '@/components/ExtremeBoard'
import { PageHead } from '@/components/PageHead'
import { PartnerMoment } from '@/components/PartnerMoment'
import { RulesCard } from '@/components/RulesCard'
import { InfoButton } from '@/components/RulesModal'
import { useT } from '@/i18n/react'
import { extremeSaveNow, goToRun, mainSaveNow } from '@/store/extremeRuns'
import { mutateSave, useGame } from '@/store/game'
import { useServerNow } from '@/store/serverTime'

export function ExtremeScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const now = useServerNow(1000) ?? Date.now()
  const rules = useExtremeRules()
  const [info, setInfo] = useState(false)
  const [picking, setPicking] = useState<Region | null>(null)
  const [restarting, setRestarting] = useState<Region | null>(null)
  const main = mainSaveNow()
  const x = extremeSaveNow()
  const playing = isExtreme(save)
  // Opened by Kanto's League (or the admin's region), on while the admin has it on.
  if (!save || !extremeOpen(main, data)) return <Navigate to="/home" replace />
  const open = new Set(extremeRegions(main, data).map((r) => r.id))
  const go = (region: string, starter?: number) => {
    if (goToRun({ region, ...(starter != null && { starter }) })) navigate('/area')
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHead icon="skull" title={t('ui.extreme.name')} />
      <p className="copy m-0 text-lg">{t('ui.xrun.intro')}</p>
      {!save.extremePageSeen && (
        <RulesCard
          title={t('ui.extreme.name')}
          icon="skull"
          rules={rules}
          onDone={() => mutateSave((s) => (s.extremePageSeen ? null : { ...s, extremePageSeen: true }))}
        />
      )}
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {extremeRegionList(data).map((region) => (
          <RunCard
            key={region.id}
            region={region}
            x={x}
            open={open.has(region.id)}
            playing={playing && regionOf(save) === region.id}
            now={now}
            onStart={() => setPicking(region)}
            onPlay={() => go(region.id)}
            onRestart={() => setRestarting(region)}
          />
        ))}
      </ul>
      <ExtremeBoard regions={extremeRegionList(data).filter((r) => open.has(r.id))} />
      <InfoButton name={t('ui.extreme.name')} onClick={() => setInfo(true)} />
      <ExtremeRulesModal open={info} onClose={() => setInfo(false)} />
      <RestartRunModal
        region={restarting}
        onClose={() => setRestarting(null)}
        onConfirm={() => {
          setPicking(restarting)
          setRestarting(null)
        }}
      />
      {picking && (
        <PartnerMoment
          starters={(getRegion(data, picking.id)?.starters ?? []).filter((d) => data.species[d])}
          regionId={picking.id}
          regionName={picking.name}
          level={picking.starterLevel}
          onLeave={() => setPicking(null)}
          onPick={(dex) => {
            const region = picking.id
            setPicking(null)
            go(region, dex)
          }}
        />
      )}
    </div>
  )
}
