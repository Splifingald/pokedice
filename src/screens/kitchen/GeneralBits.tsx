// Kitchen sink (dev only): the General upgrades (docs/25) — the tab's cards in each state, its rules pop-up and INFO,
// the Shiny Charm's own pop-up, the offline earnings' card, and golden names wherever a trainer's name shows.
import { useState } from 'react'
import { BoardGap, BoardRow } from '@/components/BoardRow'
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
  const [rules, setRules] = useState<'unlock' | 'info' | 'charm' | null>(null)
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
        ...card('Offline earnings', 5, 10, '₽10/h', '₽12/h', 1_000_000),
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
    [
      'Shiny Charm, nothing bought',
      {
        ...card('charm', 0, 10, t('ui.general.charm.odds', { n: '1,000' }), t('ui.general.charm.odds', { n: 950 }), 1000),
        name: t('ui.general.charm.name'),
        desc: t('ui.general.charm.desc'),
        visual: <PixelIcon name="sparkle" size={24} />,
      },
    ],
    [
      'Shiny Charm, maxed',
      {
        ...card('charm', 10, 10, t('ui.general.charm.odds', { n: 333 }), null, null),
        name: t('ui.general.charm.name'),
        visual: <PixelIcon name="sparkle" size={24} />,
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
        <PixelButton size="sm" onClick={() => setRules('charm')}>
          Shiny Charm opens (tab read)
        </PixelButton>
        <PixelButton
          size="sm"
          onClick={() =>
            useOfflineReport.setState({
              report: { gold: 248, ms: 12 * 3_600_000 + 25 * 60_000, perHour: 20 },
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
        onGo={rules === 'unlock' || rules === 'charm' ? () => setRules(null) : undefined}
        charmOnly={rules === 'charm'}
      />
      <OfflineReportModal show />

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
        {/* Rows a long board leaves out (past its top 100, away from you and your friends): one and many. */}
        <BoardGap count={1} />
        <BoardRow rank={120} look="/characters/red.png" name="Gold" team={[{ dex: 155, level: 40 }]} value="Lv.40" />
        <BoardGap count={1342} />
      </ol>
    </div>
  )
}
