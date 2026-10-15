// Kitchen sink (dev only): Trick or Treat (docs/29) — the gauge of each tier, the screen in every state (idle, after a
// Treat, a Treat and a throw playing on the stage, a miss, a flee, caught), the recaps as cards and as the risen result
// card, the pieces (the two pictures, the dice a section needs, the rarity chips, the plate), the preview cards and the
// rules (unlock and INFO). The timelines loop; /kitchen-sink/fx has them frame by frame.
import { useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CONFIG, TRICK_TIERS, trickBand, type TrickTier } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import {
  NeedDie,
  TierChip,
  TRICK_AT,
  TRICK_GROUND,
  TrickCard,
  TrickGauge,
  TrickRulesModal,
  TrickSprite,
  type TrickOverlay,
} from '@/components/TrickOrTreat'
import { loadTrickBall } from '@/fx/scenes'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { TREAT_URL, treatTimeline } from '@/fx/timelines/trick'
import { TrickRecap, TrickRecapBody, TrickScreen, type TrickScreenProps } from '@/screens/area/TrickView'

const CFG = DEFAULT_CONFIG.trickOrTreat
const DEX = 92
const noop = () => {}

/** A timeline that plays again a moment after it ends. */
function useLoop(make: () => Omit<TrickOverlay, 'onEnd'>): TrickOverlay {
  const [n, setN] = useState(0)
  return useMemo(
    () => ({ ...make(), onEnd: () => setTimeout(() => setN((k) => k + 1), 900) }),
    // A new timeline each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n],
  )
}

/** One state of the screen, phone-wide, in a frame. */
function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
      <div className="w-full max-w-[390px] overflow-hidden bg-parchment shadow-ring">{children}</div>
    </div>
  )
}

export function TrickBits() {
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const [recap, setRecap] = useState<'caught' | 'fled' | null>(null)
  // Dusk Road, Haunted Hollow's first area: its picture is the evening scene.
  const areaId = 'c3da0041-6de3-5997-8243-ab9b3559f166'
  const common = trickBand(CFG, 'common')
  const foe = spriteKey(DEX, false)
  const treating = useLoop(() => ({
    timeline: treatTimeline({ own: '', foe, at: TRICK_AT, fled: false }),
    ready: Promise.all([loadSprite(DEX, false), loadItemSprite(TREAT_URL)]),
    label: 'A Treat',
  }))
  const throwing = useLoop(() => ({
    timeline: catchTimeline({
      own: '',
      foe,
      ball: 'trick',
      caught: true,
      awake: true,
      ghost: true,
      at: TRICK_AT,
      ground: TRICK_GROUND,
    }),
    ready: Promise.all([loadSprite(DEX, false), loadTrickBall()]),
    label: 'A Trick Ball',
  }))
  const missing = useLoop(() => ({
    timeline: catchTimeline({
      own: '',
      foe,
      ball: 'trick',
      caught: false,
      stays: true,
      awake: true,
      ghost: true,
      at: TRICK_AT,
      ground: TRICK_GROUND,
    }),
    ready: Promise.all([loadSprite(DEX, false), loadTrickBall()]),
    label: 'A Trick Ball, missed',
  }))
  const fleeing = useLoop(() => ({
    timeline: treatTimeline({ own: '', foe, at: TRICK_AT, fled: true }),
    ready: Promise.all([loadSprite(DEX, false), loadItemSprite(TREAT_URL)]),
    label: 'Too many Treats',
  }))

  const base: TrickScreenProps = {
    areaId,
    dex: DEX,
    level: 6,
    tier: 'common',
    band: common,
    gauge: 0,
    delta: null,
    readout: null,
    message: 'Gastly floats out of the dark!',
    busy: false,
    ended: false,
    overlay: null,
    rest: 'float',
    onTreat: noop,
    onBall: noop,
    onInfo: () => setRules('info'),
  }
  const screens: [string, TrickScreenProps][] = [
    ['Idle', base],
    [
      'After a Treat (+23)',
      {
        ...base,
        gauge: 23,
        delta: { n: 23, key: 1 },
        readout: { kind: 'treat', key: 1, roll: false },
        message: 'Gastly gobbled the Treat! The gauge rises by 23.',
      },
    ],
    [
      'A Treat playing (loops)',
      { ...base, gauge: 23, busy: true, overlay: treating, message: 'Gastly gobbled the Treat!' },
    ],
    [
      'A throw playing: wobbles, Gotcha! (loops)',
      { ...base, gauge: 45, busy: true, overlay: throwing, message: 'You threw a Trick Ball…' },
    ],
    [
      'A miss: broke free, restless (loops)',
      {
        ...base,
        gauge: 80,
        delta: { n: 35, key: 2 },
        readout: { kind: 'ball', die: 3, need: 5, key: 2, roll: true },
        busy: true,
        overlay: missing,
        message: 'Rolled 3, needed 5+: Gastly broke free and got restless. The gauge rises by 35!',
      },
    ],
    [
      'Too many Treats: it flees (loops)',
      {
        ...base,
        gauge: 95,
        busy: true,
        overlay: fleeing,
        message: 'Too many Treats! Gastly vanished into the night…',
      },
    ],
    [
      'Caught (the ball at rest)',
      {
        ...base,
        gauge: 45,
        ended: true,
        rest: 'caught',
        readout: { kind: 'ball', die: 6, need: 5, key: 3, roll: false },
        message: 'Gotcha! Gastly was caught!',
      },
    ],
    [
      'Fled after a miss',
      {
        ...base,
        gauge: 100,
        delta: { n: 35, key: 4 },
        ended: true,
        rest: 'fled',
        readout: { kind: 'ball', die: 2, need: 4, key: 4, roll: false },
        message: 'Rolled 2, needed 4+: Gastly got too restless and vanished into the night…',
      },
    ],
    [
      'Very rare, shiny, still (reduced motion)',
      {
        ...base,
        dex: 200,
        level: 18,
        tier: 'veryRare',
        shiny: true,
        still: true,
        band: trickBand(CFG, 'veryRare'),
        gauge: 30,
      },
    ],
    [
      'No area picture (the night)',
      { ...base, areaId: null, dex: 353, level: 27, tier: 'rare', band: trickBand(CFG, 'rare') },
    ],
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <TrickSprite kind="treat" size={30} />
        <TrickSprite kind="ball" size={30} />
        <TrickSprite kind="treat" size={60} />
        <TrickSprite kind="ball" size={60} />
        {TRICK_TIERS.map((t) => (
          <TierChip key={t} tier={t} />
        ))}
        {[6, 5, 4, 3, 2, 1, 7].map((n) => (
          <NeedDie key={n} need={n} size={22} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TRICK_TIERS.flatMap((tier: TrickTier) =>
          [0, 45, 78, 100].map((v, i) => (
            <div key={`${tier}-${v}`} className="flex flex-col gap-1">
              <span className="font-pixel-sm text-[13px] text-muted">
                {tier} · gauge {v}
              </span>
              <TrickGauge
                band={trickBand(CFG, tier)}
                value={v}
                delta={i === 1 ? { n: 25, key: 1 } : i === 2 ? { n: 35, key: 2 } : null}
                instant
              />
            </div>
          )),
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {screens.map(([name, p]) => (
          <Frame key={name} name={name}>
            <TrickScreen {...p} />
          </Frame>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TrickRecapBody dex={92} level={6} end="caught" placed="team" isNew />
        <TrickRecapBody dex={92} level={6} end="caught" placed="box" />
        <TrickRecapBody dex={200} level={18} end="caught" placed="replaced" replacedLevel={12} shiny />
        <TrickRecapBody dex={353} level={27} end="caught" placed="merged" secrets={['Cemetery']} />
        <TrickRecapBody dex={478} level={30} end="fled" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PixelButton onClick={() => setRecap('caught')}>The caught result card</PixelButton>
        <PixelButton onClick={() => setRecap('fled')}>The fled result card</PixelButton>
      </div>
      {recap && (
        <TrickRecap
          name="Gastly"
          dex={92}
          level={6}
          end={recap}
          placed="team"
          isNew
          onContinue={() => setRecap(null)}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="pixel-panel p-3">
          <TrickCard dex={92} level={6} tier="common" isNew />
        </div>
        <div className="pixel-panel p-3">
          <TrickCard dex={426} level={47} tier="rare" isNew={false} />
        </div>
        <div className="pixel-panel p-3">
          <TrickCard dex={478} level={30} tier="veryRare" isNew shiny />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PixelButton onClick={() => setRules('unlock')}>Rules (first time)</PixelButton>
        <div className="w-64">
          <InfoButton name="Trick or Treat" onClick={() => setRules('info')} />
        </div>
      </div>
      <TrickRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </div>
  )
}
