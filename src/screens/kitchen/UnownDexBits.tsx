// Kitchen sink (dev only): the Unown Pokédex (docs/41) — the Pokédex's switch with its Unown page, Home's banner
// (none found, under way, complete and paid, complete with no prize), the page's 28 tiles, its complete card, the
// result card's line (a new letter, one already found, the last with the prize), and the rules: the unlock pop-up
// (Later / Let's go!) and the INFO copy (OK).
import { useState, type ReactNode } from 'react'
import { UNOWN_LETTERS, type UnownLetter } from '@/engine'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { DexViewSwitch, type DexView } from '@/components/ShinyDexRules'
import {
  UnownDexGrid,
  UnownDexRulesModal,
  UnownLetterCard,
  UnownSprite,
  UnownStripView,
} from '@/components/UnownDex'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const SOME: UnownLetter[] = ['a', 'b', 'k', 'n', 'o', 'w', 'n', '!']
const ALL = [...UNOWN_LETTERS]

export function UnownDexBits() {
  const { t } = useT()
  const [view, setView] = useState<DexView>('unown')
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const noop = () => {}
  return (
    <>
      <Frame name={`DexViewSwitch · Pokédex, Shiny and Unown (${view})`}>
        <DexViewSwitch value={view} onChange={setView} views={['shiny', 'unown']} />
      </Frame>
      <Frame name="DexViewSwitch · Pokédex and Unown (no shiny page yet)">
        <DexViewSwitch value="unown" onChange={noop} views={['unown']} />
      </Frame>
      <Frame name="Home banner · no letter yet">
        <UnownStripView found={[]} paid={false} reward={1000} onOpen={noop} />
      </Frame>
      <Frame name="Home banner · 7 of 28">
        <UnownStripView found={[...new Set(SOME)]} paid={false} reward={1000} onOpen={noop} />
      </Frame>
      <Frame name="Home banner · 27 of 28">
        <UnownStripView found={ALL.slice(0, 27)} paid={false} reward={1000} onOpen={noop} />
      </Frame>
      <Frame name="Home banner · complete, prize paid">
        <UnownStripView found={ALL} paid reward={1000} onOpen={noop} />
      </Frame>
      <Frame name="Home banner · complete, no prize (the admin's 0)">
        <UnownStripView found={ALL} paid={false} reward={0} onOpen={noop} />
      </Frame>
      <Frame name="Every letter's sprite · found, then a silhouette">
        <span className="flex flex-wrap gap-1">
          {UNOWN_LETTERS.map((l) => (
            <UnownSprite key={l} letter={l} size={40} />
          ))}
          <UnownSprite letter="q" size={40} silhouette />
        </span>
      </Frame>
      <Frame name="The page · 7 found, the rest silhouettes">
        <UnownDexGrid found={[...new Set(SOME)]} onOpen={noop} />
      </Frame>
      <Frame name="Unown Pokédex complete (the prize paid)">
        <div className="pixel-panel-dark flex flex-col items-center gap-2 p-5 text-center">
          <PixelIcon name="star" size={40} />
          <div className="text-[40px] leading-none text-gold">{t('ui.unown.complete')}</div>
          <div className="text-2xl">{t('ui.unown.completePaid', { total: 28, amount: money(1000) })}</div>
        </div>
      </Frame>
      <Frame name="Result card · a new letter, one already found, the last with the prize">
        <UnownLetterCard letter="k" isNew found={12} total={28} />
        <UnownLetterCard letter="a" isNew={false} found={28} total={28} />
        <UnownLetterCard letter="?" isNew found={28} total={28} reward={1000} />
      </Frame>
      <Frame name="Rules · the unlock pop-up (Later / Let's go!), INFO (OK)">
        <PixelButton onClick={() => setRules('unlock')}>Unown Pokédex: its pop-up, once</PixelButton>
        <InfoButton name={t('ui.unown.title')} onClick={() => setRules('info')} />
      </Frame>
      <UnownDexRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </>
  )
}
