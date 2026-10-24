// Kitchen sink: Extreme mode's pieces (docs/22) in every state — the rules (unlock and INFO), the band and the mark, the
// title card (no save yet, playing, someone resting), a resting Pokémon's tag and panel, the resting team, the
// welcome-back card and the switch.
import { useMemo, useState } from 'react'
import {
  AwayReportModal,
  ExtremeBand,
  ExtremeMark,
  ExtremeRulesModal,
  ExtremeTitleCard,
  KoPanel,
  KoTag,
  RestingPanel,
  SwitchSaveModal,
} from '@/components/Extreme'
import { PixelButton } from '@/components/PixelButton'
import { HOUR_MS, instanceMaxHp, newSave, type SaveData, type SaveMode } from '@/engine'
import { useAwayReport } from '@/store/extreme'
import { useGame } from '@/store/game'

export function ExtremeBits() {
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState<null | 'unlock' | 'info'>(null)
  const [switching, setSwitching] = useState<SaveMode | null>(null)
  const saves = useMemo(() => {
    let n = 0
    const base: SaveData = { ...newSave(6, data, 0, () => `x-${++n}`), mode: 'extreme', player: { name: 'Sam', character: 'red' } }
    const now = Date.now()
    // The whole team down: one back in 3 h, one just fainted.
    const resting: SaveData = {
      ...base,
      box: base.box.map((p, i) => ({ ...p, currentHp: 0, koAt: now - (i === 0 ? 9 : 0) * HOUR_MS })),
    }
    return { base, resting, now }
  }, [data])
  const lead = saves.resting.box[0]!
  const openReport = () =>
    useAwayReport.setState({
      report: {
        minutes: 320,
        changes: [
          { id: 'a', dex: 149, from: 0, to: 22, max: 100, back: true, resting: false },
          { id: 'b', dex: 131, from: 40, to: 93, max: 100, back: false, resting: false },
          { id: 'c', dex: 59, from: 53, to: 100, max: 100, back: false, resting: false },
          { id: lead.id, dex: lead.dex, from: 0, to: 0, max: instanceMaxHp(lead, data), back: false, resting: true },
        ],
      },
    })
  return (
    <div className="grid w-full max-w-md gap-3">
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules('unlock')}>Extreme opens</PixelButton>
        <PixelButton size="sm" onClick={() => setRules('info')}>Rules (INFO)</PixelButton>
        <PixelButton size="sm" onClick={openReport}>While you were away</PixelButton>
        <PixelButton size="sm" onClick={() => setSwitching('extreme')}>Switch to Extreme</PixelButton>
        <PixelButton size="sm" onClick={() => setSwitching('main')}>Back to main</PixelButton>
      </div>
      <ExtremeBand show />
      <span className="flex items-center gap-2 text-lg">
        <ExtremeMark /> the avatar's mark
      </span>
      <ExtremeTitleCard save={null} />
      <ExtremeTitleCard save={saves.base} />
      <ExtremeTitleCard save={saves.resting} />
      <span className="flex items-center gap-2 text-lg">
        Pip: <KoTag inst={lead} />
      </span>
      <KoPanel inst={lead} />
      <RestingPanel demo={saves.resting} />
      <ExtremeRulesModal open={rules != null} onClose={() => setRules(null)} onGo={rules === 'unlock' ? () => setRules(null) : undefined} />
      <SwitchSaveModal to={switching ?? 'extreme'} open={switching != null} onClose={() => setSwitching(null)} />
      <AwayReportModal show />
    </div>
  )
}
