// Kitchen sink (dev only): the General upgrades (docs/25) — the tab's cards in each state, its rules pop-up and INFO,
// the offline earnings' card, and golden names wherever a trainer's name shows.
import { useState } from 'react'
import { BoardRow } from '@/components/BoardRow'
import { GeneralRulesModal, OfflineReportModal } from '@/components/GeneralRules'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { InfoButton } from '@/components/RulesModal'
import { NameIn, TrainerName } from '@/components/TrainerName'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { useOfflineReport } from '@/store/general'
import { UpCard, type Up } from '../Upgrades'

const card = (
  id: string,
  level: number,
  max: number,
  now: string,
  then: string | null,
  cost: number | null,
): Up => ({
  id,
  kind: 'general',
  name: id,
  level,
  max,
  bonus: 0,
  next: null,
  now,
  then,
  cost,
  locked: null,
  visual: <PixelIcon name="ball" size={24} />,
  buy: () => false,
})

export function GeneralBits() {
  const { t } = useT()
  const gold = useGame((s) => s.save?.gold ?? 0)
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const cards: [string, Up][] = [
    [
      'Nothing bought, affordable',
      {
        ...card('Capture Luck', 0, 10, 'None', '10 %', 0),
        name: t('ui.general.luck.name'),
        desc: t('ui.general.luck.desc'),
      },
    ],
    [
      'Half way, too dear',
      {
        ...card('Offline earnings', 5, 10, '₽6 / h', '₽7 / h', 1_000_000),
        name: t('ui.general.offline.name'),
      },
    ],
    ['Maxed', { ...card('Capture Luck', 10, 10, '100 %', null, null), name: t('ui.general.luck.name') }],
    [
      'I am just rich, its own name as the picture',
      {
        ...card('rich', 0, 1, t('ui.general.rich.off'), t('ui.general.rich.on'), 99999),
        name: t('ui.general.rich.name'),
        desc: t('ui.general.rich.desc'),
        visual: <TrainerName name="Erika" rich className="max-w-[45%] truncate text-[20px] leading-none" />,
      },
    ],
  ]
  return (
    <div className="grid w-full max-w-md gap-3">
      {cards.map(([label, u]) => (
        <div key={label} className="grid gap-0.5">
          <ul className="m-0 grid list-none p-0">
            <UpCard u={u} gold={gold} />
          </ul>
          <small className="font-pixel-sm text-[14px] text-muted">{label}</small>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules('unlock')}>
          General opens
        </PixelButton>
        <PixelButton
          size="sm"
          onClick={() =>
            useOfflineReport.setState({
              report: { gold: 132, ms: 12 * 3_600_000 + 25 * 60_000, perHour: 11 },
            })
          }
        >
          While you were away
        </PixelButton>
      </div>
      <InfoButton name={t('ui.upgrades.tabGeneral')} onClick={() => setRules('info')} />
      <GeneralRulesModal
        open={!!rules}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
      <OfflineReportModal />

      {/* Golden names: plain, golden, cut short, on a warm card, on a light chip (dusk too), inside a sentence. */}
      <div className="grid gap-1.5 bg-paper p-2 text-[20px] shadow-card">
        <span>
          <TrainerName name="Brock" />
        </span>
        <span>
          <TrainerName name="Erika" rich />
        </span>
        <span className="block w-[110px] truncate">
          <TrainerName name="Lt.Surge1234" rich />
        </span>
        <span className="bg-gold-pale px-1.5">
          <TrainerName name="Sabrina" rich />
        </span>
        <span className="light-scope w-fit bg-[#dde5f0] px-[5px] font-pixel-sm text-[12px] text-ink">
          <TrainerName name="Koga" rich />
        </span>
        <span className="font-pixel-sm text-[15px] text-muted">
          <NameIn name="Misty" rich text={(name) => t('ui.trades.whose', { name })} />
        </span>
      </div>
      <ol className="m-0 grid list-none gap-1.5 p-0">
        <BoardRow
          rank={1}
          look="/characters/green.png"
          name="Erika"
          rich
          team={[{ dex: 45, level: 72 }]}
          value="Lv.72"
        />
        <BoardRow
          rank={2}
          look="/characters/red.png"
          name="Red"
          rich
          isMe
          team={[{ dex: 25, level: 70 }]}
          value="Lv.70"
        />
        <BoardRow
          rank={3}
          look="/characters/red.png"
          name="Blue"
          isFriend
          rich
          team={[{ dex: 9, level: 66 }]}
          value="Lv.66"
        />
      </ol>
    </div>
  )
}
