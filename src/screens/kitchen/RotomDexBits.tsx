// Kitchen sink (dev only): the Rotom Room and the Rotom Pokédex (docs/73) — the Pokédex's switch with its Rotom page,
// the week's card (to catch, caught), the form bar, Home's banner (this week's form, caught and back on Monday, complete
// and paid), the page's five tiles, its complete card, the result card's line (a form, the last with the shiny Rotom),
// every form's sprite, and the rules behind INFO (OK).
import { useState, type ReactNode } from 'react'
import { ROTOM_DEX, ROTOM_FORMS } from '@/engine'
import { DexCompleteCard, DexGridList, DexTile } from '@/components/DexGrid'
import { InfoButton } from '@/components/RulesModal'
import { DexViewSwitch, type DexView } from '@/components/ShinyDexRules'
import { SpriteImg } from '@/components/SpriteImg'
import {
  RotomDexRulesModal,
  RotomFormBar,
  RotomFormCard,
  RotomStripView,
  RotomWeekCard,
} from '@/components/RotomDex'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const ALL = ROTOM_FORMS.map((f) => f.dex)
const TWO = [10008, 10010]
const MONDAY = Date.parse('2026-11-30T00:00:00Z')

export function RotomDexBits() {
  const { t } = useT()
  const species = useGame((s) => s.data.species)
  const [view, setView] = useState<DexView>('rotom')
  const [info, setInfo] = useState(false)
  const noop = () => {}
  return (
    <>
      <Frame name={`DexViewSwitch · Pokédex, Shiny and Rotom (${view})`}>
        <DexViewSwitch value={view} onChange={setView} views={['shiny', 'rotom']} />
      </Frame>
      <Frame name="The week's card · Wash Rotom to catch, then caught">
        <RotomWeekCard dex={10009} caught={false} />
        <RotomWeekCard dex={10009} caught />
      </Frame>
      <Frame name="Form bar · none, 2 of 5 (the week's ringed), all">
        <RotomFormBar found={[]} week={10009} />
        <RotomFormBar found={TWO} week={10009} />
        <RotomFormBar found={ALL} />
      </Frame>
      <Frame name="Home banner · no form yet, this week Heat Rotom">
        <RotomStripView found={[]} week={10008} reopensAt={null} paid={false} prizeLevel={60} onOpen={noop} />
      </Frame>
      <Frame name="Home banner · 2 of 5, this week Wash Rotom">
        <RotomStripView
          found={TWO}
          week={10009}
          reopensAt={null}
          paid={false}
          prizeLevel={60}
          onOpen={noop}
        />
      </Frame>
      <Frame name="Home banner · this week's caught, back on Monday">
        <RotomStripView
          found={[...TWO, 10009]}
          week={10009}
          reopensAt={MONDAY}
          paid={false}
          prizeLevel={60}
          onOpen={noop}
        />
      </Frame>
      <Frame name="Home banner · complete, the shiny Rotom given">
        <RotomStripView found={ALL} week={null} reopensAt={null} paid prizeLevel={60} onOpen={noop} />
      </Frame>
      <Frame name="The page · 2 caught, Wash Rotom this week (map pin), the rest silhouettes">
        <DexGridList label={t('ui.rotom.title')}>
          {ROTOM_FORMS.map((f, i) => {
            const got = TWO.includes(f.dex)
            return (
              <li key={f.dex}>
                <DexTile
                  dex={f.dex}
                  name={got ? (species[f.dex]?.name ?? '') : null}
                  missing={!got}
                  near={f.dex === 10009}
                  label={species[f.dex]?.name ?? ''}
                  nearLabel={t('ui.dex.fNearby')}
                  newLabel={t('ui.common.new')}
                  tabIndex={i === 0 ? 0 : -1}
                  onClick={noop}
                />
              </li>
            )
          })}
        </DexGridList>
      </Frame>
      <Frame name="Every form's sprite, then the shiny Rotom (the prize)">
        <span className="flex flex-wrap items-end gap-1">
          {ALL.map((d) => (
            <SpriteImg key={d} dex={d} size={64} />
          ))}
          <SpriteImg dex={ROTOM_DEX} size={64} shiny />
        </span>
      </Frame>
      <Frame name="Rotom Pokédex complete (the shiny Rotom given)">
        <DexCompleteCard
          title={t('ui.rotom.complete')}
          body={t('ui.rotom.completePaid', { total: 5, level: 60 })}
        />
      </Frame>
      <Frame name="Result card · a form, the last with the shiny Rotom">
        <RotomFormCard dex={10011} found={3} total={5} />
        <RotomFormCard dex={10012} found={5} total={5} prizeLevel={60} />
      </Frame>
      <Frame name="Rules · INFO at the foot of the Rotom page (OK)">
        <InfoButton name={t('ui.rotom.title')} onClick={() => setInfo(true)} />
      </Frame>
      <RotomDexRulesModal open={info} onClose={() => setInfo(false)} />
    </>
  )
}
