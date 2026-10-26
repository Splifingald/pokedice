// Kitchen sink (dev only): the shiny Pokédex (docs/39) — the Pokédex / Shiny switch on each page, the shiny page's
// tiles (owned shiny with the Box's star, caught but not shiny, never caught, nearby), its complete card, and the
// rules: the unlock pop-up (Later / Let's go!) and the INFO copy (OK).
import { useState, type ReactNode } from 'react'
import { PixelIcon } from '@/components/icons'
import { MonTile, TILE_GRID, TileTag } from '@/components/MonTile'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { DexViewSwitch, ShinyDexRulesModal, type DexView } from '@/components/ShinyDexRules'
import { useT } from '@/i18n/react'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const STAR = <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />

export function ShinyDexBits() {
  const { t } = useT()
  const [view, setView] = useState<DexView>('shiny')
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  return (
    <>
      <Frame name={`DexViewSwitch · live (${view})`}>
        <DexViewSwitch value={view} onChange={setView} />
      </Frame>
      <Frame name="DexViewSwitch · Pokédex">
        <DexViewSwitch value="all" onChange={() => {}} />
      </Frame>
      <Frame name="DexViewSwitch · Shiny">
        <DexViewSwitch value="shiny" onChange={() => {}} />
      </Frame>
      <Frame name="Shiny page tiles · owned shiny, caught not shiny, never caught, nearby">
        <ul className={TILE_GRID}>
          <li>
            <MonTile
              dex={25}
              number="#025"
              name="Pikachu"
              label="Pikachu, Shiny"
              onClick={() => {}}
              tags={STAR}
            />
          </li>
          <li>
            <MonTile dex={4} number="#004" name="Charmander" missing label="Charmander" onClick={() => {}} />
          </li>
          <li>
            <MonTile dex={1} number="#001" name="???" missing label="???" onClick={() => {}} />
          </li>
          <li>
            <MonTile
              dex={16}
              number="#016"
              name="Pidgey"
              missing
              label="Pidgey, Nearby"
              onClick={() => {}}
              tags={<TileTag tone="near">{t('ui.dex.fNearby')}</TileTag>}
            />
          </li>
        </ul>
      </Frame>
      <Frame name="Shiny Pokédex complete">
        <div className="pixel-panel-dark flex flex-col items-center gap-2 p-5 text-center">
          <PixelIcon name="star" size={40} />
          <div className="text-[40px] leading-none text-gold">{t('ui.dex.shinyComplete')}</div>
          <div className="text-2xl">
            {t('ui.dex.shinyCompleteBody', {
              total: 151,
              where: t('ui.dex.completeIn', { region: 'Kanto' }),
            })}
          </div>
        </div>
      </Frame>
      <Frame name="Rules · the unlock pop-up (Later / Let's go!), INFO (OK)">
        <PixelButton onClick={() => setRules('unlock')}>Shiny Pokédex: its pop-up, once</PixelButton>
        <InfoButton name={t('ui.dex.shinyTitle')} onClick={() => setRules('info')} />
      </Frame>
      <ShinyDexRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </>
  )
}
