// Kitchen sink (dev only): the side quests (docs/61) — a roadblock boss's words, a Pokémon posing as a find (on the
// find's screen before it's picked up, then springing out), and further down the Safari's and the set moments' pieces.
import { useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CONFIG, ROADBLOCK_KINDS, trickBand } from '@/engine'
import { TRICK_AT, TrickCard, TrickRulesModal, type TrickOverlay } from '@/components/TrickOrTreat'
import { loadSafariBall, SAFARI_BAIT_URL } from '@/fx/scenes'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { treatTimeline } from '@/fx/timelines/trick'
import { TrickRecapBody, TrickScreen, type TrickScreenProps } from '@/screens/area/TrickView'
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
/** Kanto's Safari Zone (docs/61 §4) and its Chansey. */
const SAFARI = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2'
const CHANSEY = 113
const noop = () => {}

/** A Safari timeline that plays again a moment after it ends. */
function useLoop(make: () => Omit<TrickOverlay, 'onEnd'>): TrickOverlay {
  const [n, setN] = useState(0)
  return useMemo(
    () => ({ ...make(), onEnd: () => setTimeout(() => setN((k) => k + 1), 900) }),
    // A new timeline each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n],
  )
}

/** The Safari's screen in its states: idle, the Bait, a throw, a run-off, and its card, recap and rules. */
function SafariBits() {
  const [rules, setRules] = useState(false)
  const foe = spriteKey(CHANSEY, false)
  const band = trickBand(DEFAULT_CONFIG.safari, 'veryRare')
  const baiting = useLoop(() => ({
    timeline: treatTimeline({ own: '', foe, at: TRICK_AT, fled: false, treatKey: `item|${SAFARI_BAIT_URL}`, runs: true }),
    ready: Promise.all([loadSprite(CHANSEY, false), loadItemSprite(SAFARI_BAIT_URL)]),
    label: 'Bait',
  }))
  const throwing = useLoop(() => ({
    timeline: catchTimeline({ own: '', foe, ball: 'safari', caught: true, awake: true, ghost: false, at: TRICK_AT, ground: 126 }),
    ready: Promise.all([loadSprite(CHANSEY, false), loadSafariBall()]),
    label: 'A Safari Ball',
  }))
  const running = useLoop(() => ({
    timeline: treatTimeline({ own: '', foe, at: TRICK_AT, fled: true, treatKey: `item|${SAFARI_BAIT_URL}`, runs: true }),
    ready: Promise.all([loadSprite(CHANSEY, false), loadItemSprite(SAFARI_BAIT_URL)]),
    label: 'Too much Bait',
  }))
  const base: TrickScreenProps = {
    theme: 'safari',
    areaId: SAFARI,
    dex: CHANSEY,
    level: 26,
    tier: 'veryRare',
    band,
    gauge: 8,
    delta: null,
    readout: null,
    message: 'A wild Chansey appeared in the grass!',
    busy: false,
    ended: false,
    overlay: null,
    rest: 'float',
    onTreat: noop,
    onBall: noop,
    onInfo: () => setRules(true),
    onFlee: noop,
  }
  const screens: [string, TrickScreenProps][] = [
    ['Idle', base],
    ['Bait playing (loops)', { ...base, gauge: 30, busy: true, overlay: baiting, message: 'Chansey is eating the Bait!' }],
    ['A throw: Gotcha! (loops)', { ...base, gauge: 50, busy: true, overlay: throwing, message: 'You threw a Safari Ball…' }],
    ['Too much Bait: it runs off (loops)', { ...base, gauge: 70, busy: true, overlay: running, message: 'Too much Bait!' }],
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="pixel-panel max-w-2xl p-3">
        <TrickCard theme="safari" dex={CHANSEY} level={26} tier="veryRare" isNew />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {screens.map(([name, props]) => (
          <div key={name} className="flex flex-col gap-1">
            <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
            <div className="w-full max-w-[390px] overflow-hidden bg-parchment shadow-ring">
              <TrickScreen {...props} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="pixel-panel p-3">
          <TrickRecapBody theme="safari" dex={CHANSEY} level={26} end="caught" placed="team" isNew />
        </div>
        <div className="pixel-panel p-3">
          <TrickRecapBody theme="safari" dex={CHANSEY} level={26} end="fled" />
        </div>
      </div>
      <PixelButton size="sm" className="self-start" onClick={() => setRules(true)}>
        The Safari's rules
      </PixelButton>
      <TrickRulesModal theme="safari" open={rules} onClose={() => setRules(false)} />
    </div>
  )
}

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
      <SafariBits />
    </div>
  )
}
