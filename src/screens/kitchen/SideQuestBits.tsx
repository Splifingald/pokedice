// Kitchen sink (dev only): the side quests (docs/61) — a roadblock boss's words, a Pokémon posing as a find (on the
// find's screen before it's picked up, then springing out), and further down the Safari's and the set moments' pieces.
import { useState, type ReactNode } from 'react'
import { ROADBLOCK_KINDS } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { FoundThing, SprungThing } from '@/screens/area/FindView'
import { StageBackground } from '@/screens/battle/BattleStage'

/** One state, phone-wide, in a frame. */
function Frame({ name, children, dark }: { name: string; children: ReactNode; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className={dark ? 'pixel-panel-dark w-full max-w-[390px] p-3' : 'pixel-panel w-full max-w-[390px] p-3'}>
        {children}
      </div>
    </div>
  )
}

/** A stage box as the find's screen draws it. */
function Stage({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className="relative isolate aspect-[3/2] overflow-hidden shadow-ledge">
        <StageBackground art={null} zones={false} />
        {children}
      </div>
    </div>
  )
}

const ROADBLOCK_DEX = { sleeping: 143, tree: 185, invisible: 352 } as const

export function SideQuestBits() {
  const { t } = useT()
  const [replay, setReplay] = useState(0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {ROADBLOCK_KINDS.map((k) => (
          <Frame key={k} name={`Roadblock: ${k}`} dark>
            <div className="text-center text-lg leading-none tracking-[0.35em] text-gold">{t('ui.enc.roadblockTag')}</div>
            <div className="flex justify-center">
              <SpriteImg dex={ROADBLOCK_DEX[k]} size={96} />
            </div>
            <div className="text-center text-2xl leading-tight text-gold">{t(`ui.enc.roadblock.${k}`)}</div>
          </Frame>
        ))}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Stage name="A disguise on the find's screen, before PICK IT UP">
          <FoundThing
            key={`f${replay}`}
            enc={{ kind: 'item', entryId: 'disguise:100', itemKey: 'poke-ball', qty: 1 }}
            isMoney={false}
            rarity="common"
          />
        </Stage>
        <Stage name={`It springs out: ${t('ui.disguise.reveal', { name: 'Voltorb' })}`}>
          <SprungThing key={`s${replay}`} itemKey="poke-ball" dex={100} />
        </Stage>
      </div>
      <PixelButton size="sm" className="self-start" onClick={() => setReplay((n) => n + 1)}>
        Play them again
      </PixelButton>
    </div>
  )
}
