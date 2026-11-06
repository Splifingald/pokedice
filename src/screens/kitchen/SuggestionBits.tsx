// Kitchen sink (dev only): the players' suggestions (docs/67) in every state — the favourite toggle (off, on) and the
// raid card's heart, Box tiles plain and shiny (and shiny picked), the area grid's shiny star, the catch panel's PASS,
// and auto-mode's HEAL offer (running, held by a dialog).
import { useState, type ReactNode } from 'react'
import { AutoCureOffer, StunCureActions } from '@/components/AutoCure'
import { FavouriteHeart, FavouriteRow } from '@/components/Favourite'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { MonTile } from '@/components/MonTile'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { CatchPanel } from '../battle/CatchPanel'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-[340px] max-w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

export function SuggestionBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [fav, setFav] = useState(false)
  const [heart, setHeart] = useState(true)
  const [round, setRound] = useState(0)
  const cure = data.items['paralyze-heal'] ?? Object.values(data.items).find((i) => i.effect.kind === 'cure')
  return (
    <>
      <Frame name={`FavouriteRow · live (${fav ? 'on' : 'off'})`}>
        <FavouriteRow on={fav} onToggle={() => setFav((v) => !v)} />
      </Frame>
      <Frame name="FavouriteRow · on">
        <FavouriteRow on onToggle={() => {}} />
      </Frame>
      <Frame name="FavouriteHeart · on (live), off">
        <div className="flex gap-2 bg-panel p-2 shadow-ring">
          <span className="relative h-9 w-9 bg-paper shadow-card">
            <FavouriteHeart on={heart} onToggle={() => setHeart((v) => !v)} label="Lapras: favourite" />
          </span>
          <span className="relative h-9 w-9 bg-paper shadow-card">
            <FavouriteHeart on={false} onToggle={() => {}} label="Fearow: favourite" />
          </span>
        </div>
      </Frame>
      <Frame name="MonTile · plain, shiny, shiny shown beside (selected)">
        <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
          {[
            { shiny: false, selected: false },
            { shiny: true, selected: false },
            { shiny: true, selected: true },
          ].map((v, i) => (
            <li key={i}>
              <MonTile
                dex={131}
                name="Lapras"
                level="Lv.52"
                label="Lapras"
                shiny={v.shiny}
                selected={v.selected}
                onClick={() => {}}
                tags={
                  v.shiny && <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />
                }
              />
            </li>
          ))}
        </ul>
      </Frame>
      <Frame name="Area grid · caught, caught and in the shiny Pokédex">
        <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0">
          {[false, true].map((shiny) => (
            <li
              key={String(shiny)}
              className="relative grid justify-items-center gap-[3px] bg-well px-1 pb-2 pt-1 shadow-ring-line"
            >
              <MiniSprite dex={21} size={40} className="opacity-50" />
              <b className="text-[17px] font-normal leading-none opacity-60">Spearow</b>
              <PixelIcon
                name="ball"
                size={12}
                title={t('ui.enc.caught')}
                className="absolute right-1.5 top-1.5"
              />
              {shiny && (
                <PixelIcon
                  name="star"
                  size={12}
                  title={t('ui.home.shinyOwned')}
                  className="absolute right-1.5 top-[24px]"
                />
              )}
            </li>
          ))}
        </ul>
      </Frame>
      <Frame name="CatchPanel · owned already: PASS (the bag's balls decide one button or a choice)">
        <CatchPanel
          c={{ dex: 130, level: 30, kind: 'wild', target: { mode: 'new' }, result: null }}
          onThrow={() => {}}
          revealed={false}
          onPass={() => {}}
        />
      </Frame>
      {cure && (
        <>
          <Frame name="AutoCureOffer · running (restarts when it runs out)">
            <AutoCureOffer
              key={round}
              name="Pikachu"
              item={cure}
              ms={3000}
              onUse={() => setRound((n) => n + 1)}
              onTimeout={() => setRound((n) => n + 1)}
            />
          </Frame>
          <Frame name="AutoCureOffer · held by a dialog (no gauge)">
            <AutoCureOffer name="Pikachu" item={cure} ms={3000} hold onUse={() => {}} onTimeout={() => {}} />
          </Frame>
          <Frame name="StunCureActions · stunned by hand, its cure in the Bag: SKIP TURN and the cure">
            <StunCureActions item={cure} onUse={() => {}} onPass={() => {}} />
          </Frame>
        </>
      )}
    </>
  )
}
