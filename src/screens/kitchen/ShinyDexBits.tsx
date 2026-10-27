// Kitchen sink (dev only): the shiny Pokédex (docs/39) — the Pokédex / Shiny switch on each page, the shiny page's
// tiles (owned shiny with the Box's star, caught but not shiny, never caught, nearby), its complete card, and the
// rules: the unlock pop-up (Later / Let's go!) and the INFO copy (OK).
import { useState, type ReactNode } from 'react'
import { DexCompleteCard, DexGridList, DexTile } from '@/components/DexGrid'
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

export function ShinyDexBits() {
  const { t } = useT()
  const [view, setView] = useState<DexView>('shiny')
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const tag = { nearLabel: t('ui.dex.fNearby'), newLabel: t('ui.common.new'), onClick: () => {} }
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
      <Frame name="Shiny view tiles · owned shiny, caught not shiny, caught not shiny nearby, never caught, never caught nearby">
        <DexGridList label="Shiny tiles">
          <li>
            <DexTile
              {...tag}
              dex={25}
              name="Pikachu"
              missing={false}
              star
              label="Pikachu, #025, Shiny"
              tabIndex={0}
            />
          </li>
          <li>
            <DexTile {...tag} dex={4} name="Charmander" missing label="Charmander, #004" tabIndex={-1} />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={16}
              name="Pidgey"
              missing
              near
              label="Pidgey, #016, Nearby"
              tabIndex={-1}
            />
          </li>
          <li>
            <DexTile {...tag} dex={1} name={null} missing label="#001, Not caught yet" tabIndex={-1} />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={19}
              name={null}
              missing
              near
              label="#019, Not caught yet, Nearby"
              tabIndex={-1}
            />
          </li>
        </DexGridList>
      </Frame>
      <Frame name="Shiny Pokédex complete">
        <DexCompleteCard
          title={t('ui.dex.shinyComplete')}
          body={t('ui.dex.shinyCompleteBody', {
            total: 151,
            where: t('ui.dex.completeIn', { region: 'Kanto' }),
          })}
        />
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
