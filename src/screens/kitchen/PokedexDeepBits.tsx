// Kitchen sink (dev only): the Pokédex's pieces from the deep pass (docs/43 §5.6) — the head's gauge (empty, under
// way, full), every tile (never caught, never caught nearby, caught, caught NEW, picked on a PC, an Unown letter found
// and not), a live grid the arrow keys walk, a fold closed and open, and the entry itself (caught, never caught, and
// one that evolves with a stone), each as the sheet a phone opens and as a PC's docked pane.
import { useState, type ReactNode } from 'react'
import { DexGauge, DexGridList, DexTile } from '@/components/DexGrid'
import { DexSheet, Fold } from '@/components/DexEntry'
import { PixelButton } from '@/components/PixelButton'
import { SheetDock } from '@/components/Sheet'
import { UnownSprite } from '@/components/UnownDex'
import { useT } from '@/i18n/react'

function Frame({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={
        wide ? 'flex w-[440px] max-w-full flex-col gap-1' : 'flex w-[340px] max-w-full flex-col gap-1'
      }
    >
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const LIVE = [1, 4, 7, 16, 19, 25, 35, 39, 52, 54, 63, 66, 74, 92, 133]

export function PokedexDeepBits() {
  const { t } = useT()
  const tag = { nearLabel: t('ui.dex.fNearby'), newLabel: t('ui.common.new') }
  const [focus, setFocus] = useState(LIVE[0]!)
  const [sheet, setSheet] = useState<number | null>(null)
  return (
    <>
      <Frame name="DexGauge · none, under way, full">
        <DexGauge n={0} total={151} label="0 of 151 caught" />
        <DexGauge n={32} total={151} label="32 of 151 caught" />
        <DexGauge n={151} total={151} label="151 of 151 caught" />
      </Frame>
      <Frame name="DexTile · never caught, nearby, caught, caught NEW, picked (PC), a letter found, a letter missing">
        <DexGridList label="Tiles">
          <li>
            <DexTile
              {...tag}
              dex={1}
              name={null}
              missing
              label="#001, Not caught yet"
              tabIndex={0}
              onClick={() => {}}
            />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={16}
              name={null}
              missing
              near
              label="#016, Not caught yet, Nearby"
              tabIndex={-1}
              onClick={() => {}}
            />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={4}
              name="Charmander"
              missing={false}
              label="Charmander, #004"
              tabIndex={-1}
              onClick={() => {}}
            />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={25}
              name="Pikachu"
              missing={false}
              isNew
              label="Pikachu, #025, NEW"
              tabIndex={-1}
              onClick={() => {}}
            />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={7}
              name="Squirtle"
              missing={false}
              selected
              label="Squirtle, #007"
              tabIndex={-1}
              onClick={() => {}}
            />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={201}
              icon={<UnownSprite letter="k" size={48} />}
              name="K"
              missing={false}
              label="Unown K, found"
              tabIndex={-1}
              onClick={() => {}}
            />
          </li>
          <li>
            <DexTile
              {...tag}
              dex={201}
              icon={<UnownSprite letter="?" size={48} silhouette />}
              name="?"
              missing
              label="Unown ?, not found yet"
              tabIndex={-1}
              onClick={() => {}}
            />
          </li>
        </DexGridList>
      </Frame>
      <Frame name={`DexGridList · live: arrows, Home, End (#${focus} picked; a PC's pane follows the focus)`}>
        <DexGridList label="Live grid">
          {LIVE.map((dex, i) => (
            <li key={dex}>
              <DexTile
                {...tag}
                dex={dex}
                name={i % 3 ? `#${dex}` : null}
                missing={!(i % 3)}
                selected={focus === dex}
                label={`#${dex}`}
                tabIndex={focus === dex ? 0 : -1}
                onFocus={() => setFocus(dex)}
                onClick={() => setFocus(dex)}
              />
            </li>
          ))}
        </DexGridList>
      </Frame>
      <Frame name="Fold · closed, open">
        <Fold summary={t('ui.dex.diceStats')}>
          <p className="copy">…</p>
        </Fold>
        <Fold summary={t('ui.dex.diceStats')} open>
          <p className="copy">The dice, the stats and what comes next.</p>
        </Fold>
      </Frame>
      <Frame name="DexSheet · a phone's sheet (Pikachu caught or not, Charmander, Eevee's stones, Mew)">
        <div className="flex flex-wrap gap-2">
          {[25, 4, 133, 151].map((dex) => (
            <PixelButton key={dex} size="sm" onClick={() => setSheet(dex)}>
              #{dex}
            </PixelButton>
          ))}
        </div>
        <DexSheet
          dex={sheet ?? 25}
          open={sheet != null}
          onClose={() => setSheet(null)}
          onOpenDex={(dex) => setSheet(dex)}
        />
      </Frame>
      {[4, 133, 151].map((dex) => (
        <Frame key={dex} wide name={`DexSheet · docked on a PC (#${dex}, as this save holds it)`}>
          <div className="pixel-panel flex h-[520px] flex-col overflow-hidden p-0">
            <SheetDock.Provider value={true}>
              <DexSheet dex={dex} open onClose={() => {}} onOpenDex={() => {}} />
            </SheetDock.Provider>
          </div>
        </Frame>
      ))}
    </>
  )
}
