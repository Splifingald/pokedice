// Kitchen sink (dev only): the Gift card (docs/61 §4.0, §4.2; docs/15 §45) — the present at every level in both looks,
// the level gauge, the reward lines, the plate and Delibird's chip, the screen in every state (it lands, a grow
// playing, with Delibird, at the top, a break playing and what came out, opening, opened), Delibird's present (idle,
// growing, bursting, shiny Delibird out), the result cards, the preview card and the rules (unlock and INFO). The
// timelines loop; /kitchen-sink/fx has them frame by frame.
import { useMemo, useState, type ReactNode } from 'react'
import { MONEY, type GiftItem } from '@/engine'
import {
  GiftCardPreview,
  GiftGauge,
  GiftPlate,
  GiftRulesModal,
  HelperChip,
  PresentImg,
  RewardLine,
  RewardList,
  type PresentTake,
} from '@/components/GiftCard'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { presentTimeline, type PresentParams } from '@/fx/timelines/present'
import { useGame } from '@/store/game'
import {
  GiftEmpty,
  GiftRecap,
  GiftScreen,
  presentContents,
  type GiftScreenProps,
} from '@/screens/area/GiftView'

const noop = () => {}
const SNORUNT = 361
const DELIBIRD = 225

/** A present's take that plays again a moment after it ends. */
function useLoop(params: PresentParams, ready?: () => Promise<unknown>): PresentTake {
  const [n, setN] = useState(0)
  return useMemo(
    () => ({
      timeline: presentTimeline(params),
      ready: ready?.(),
      onEnd: () => setTimeout(() => setN((k) => k + 1), 1200),
    }),
    // A new timeline each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n],
  )
}

const stills = new Map<string, PresentTake>()
/**
 * A take that plays once and stays (holds its last frame). Kept by its params: the page re-renders as the looping
 * takes go round, and a new timeline object would start the still ones over each time.
 */
function still(params: PresentParams, ready?: Promise<unknown>): PresentTake {
  const key = JSON.stringify(params)
  let take = stills.get(key)
  if (!take) stills.set(key, (take = { timeline: presentTimeline(params), ready }))
  return take
}

/** One state of the screen, phone-wide, in a frame. */
function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className="w-full max-w-[390px] overflow-hidden bg-parchment shadow-ring">{children}</div>
    </div>
  )
}

export function GiftCardBits() {
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const [recap, setRecap] = useState<'opened' | 'empty' | null>(null)
  // Snowglobe Valley's first area and its hill when the content has them, else the first area's picture.
  const areaId = data.areas.find((a) => a.name === 'Snowy Trail')?.id ?? data.areas[0]?.id ?? null
  const hill = data.areas.find((a) => a.name === 'Evergreen Hill')?.id ?? areaId
  const ball = (key: string, qty: number): GiftItem => ({ key, qty })
  const L: GiftItem[][] = [
    [ball('poke-ball', 2)],
    [ball('great-ball', 3)],
    [ball('hyper-potion', 2)],
    [ball('revive', 1)],
    [ball('rare-candy', 3)],
    [ball('rare-candy', 3), ball('revive', 1)],
  ]
  const candy = presentContents([ball('rare-candy', 3)], data)
  const coins = presentContents([{ key: MONEY, qty: 105 }, ball('hyper-potion', 2)], data)
  const growing = useLoop({ mode: 'grow', level: 2, to: 3 })
  const breaking = useLoop({ mode: 'break', level: 3, mon: spriteKey(SNORUNT, false) }, () =>
    loadSprite(SNORUNT, false),
  )
  const opening = useLoop({ mode: 'open', level: 5, contents: candy.contents }, () => candy.ready)
  const bossGrowing = useLoop({ mode: 'grow', level: 3, to: 4, look: 'silver' })
  const bursting = useLoop(
    { mode: 'burst', level: 5, look: 'silver', mon: spriteKey(DELIBIRD, false, true), shiny: true },
    () => loadSprite(DELIBIRD, false, true),
  )

  const base: GiftScreenProps = {
    areaId,
    take: still({ mode: 'appear', level: 1 }),
    level: 1,
    top: 5,
    message: 'A gift! Open it now, or make it bigger?',
    reward: L[0]!,
    next: L[1]!,
    chance: 20,
    busy: false,
    ended: null,
    onOpen: noop,
    onGrow: noop,
    onFight: noop,
    onInfo: () => setRules('info'),
  }
  const boss: GiftScreenProps = {
    ...base,
    areaId: hill,
    take: still({ mode: 'appear', level: 1, look: 'silver' }),
    boss: true,
    reward: [],
    next: null,
    chance: null,
    message: 'A shining present sits under the tree…',
  }
  const screens: [string, GiftScreenProps][] = [
    ['It lands (level 1)', base],
    [
      'MAKE IT BIGGER: it holds, 2 → 3 (loops)',
      {
        ...base,
        take: growing,
        level: 3,
        reward: L[2]!,
        next: L[3]!,
        chance: 60,
        busy: true,
        message: 'It grew to level 3!',
      },
    ],
    [
      'With a Delibird: level 1 is safe, a level 6',
      { ...base, take: still({ mode: 'idle', level: 1 }), top: 6, helper: true, chance: 0 },
    ],
    [
      'Level 4, the next tap 80%',
      {
        ...base,
        take: still({ mode: 'idle', level: 4 }),
        level: 4,
        reward: L[3]!,
        next: L[4]!,
        chance: 80,
        message: 'It grew to level 4!',
      },
    ],
    [
      'At the top (level 5): OPEN only',
      {
        ...base,
        take: still({ mode: 'idle', level: 5 }),
        level: 5,
        reward: L[4]!,
        next: null,
        chance: null,
        message: "Level 5: it can't get any bigger!",
      },
    ],
    [
      'At the top with a Delibird (level 6)',
      {
        ...base,
        take: still({ mode: 'idle', level: 6 }),
        level: 6,
        top: 6,
        helper: true,
        reward: L[5]!,
        next: null,
        chance: null,
        message: "Level 6: it can't get any bigger!",
      },
    ],
    [
      'It breaks: a wild Snorunt jumps out (loops)',
      { ...base, take: breaking, level: 3, busy: true, message: 'Oh no! The gift broke!' },
    ],
    [
      'Broken: FIGHT!',
      {
        ...base,
        take: still({ mode: 'break', level: 3, mon: spriteKey(SNORUNT, false) }, loadSprite(SNORUNT, false)),
        level: 3,
        ended: 'broken',
        message: 'A wild Snorunt jumped out of the gift!',
      },
    ],
    [
      'OPEN at level 5: three Rare Candies (loops)',
      {
        ...base,
        take: opening,
        level: 5,
        top: 5,
        reward: L[4]!,
        next: null,
        chance: null,
        busy: true,
        message: 'You open the gift…',
      },
    ],
    [
      'Opened at level 3: ₽ and Hyper Potions (the stage at rest)',
      {
        ...base,
        take: still({ mode: 'open', level: 3, contents: coins.contents }, coins.ready),
        level: 3,
        reward: L[2]!,
        next: L[3]!,
        chance: 60,
        ended: 'opened',
        message: 'Inside: ₽105 + Hyper Potion ×2!',
      },
    ],
    ["Delibird's present (Evergreen Hill)", boss],
    [
      "Delibird's present grows, 3 → 4 (loops)",
      { ...boss, take: bossGrowing, level: 4, busy: true, message: 'It grew! Something stirs inside…' },
    ],
    [
      "Delibird's present bursts: shiny Delibird (loops)",
      { ...boss, take: bursting, level: 5, busy: true, message: "It's going to burst…!" },
    ],
    [
      'Shiny Delibird out: FIGHT!',
      {
        ...boss,
        take: still(
          { mode: 'burst', level: 5, look: 'silver', mon: spriteKey(DELIBIRD, false, true), shiny: true },
          loadSprite(DELIBIRD, false, true),
        ),
        level: 5,
        ended: 'burst',
        message: 'Delibird popped out of the present!',
      },
    ],
    [
      'No area picture (the winter night)',
      { ...base, areaId: null, take: still({ mode: 'idle', level: 2 }), level: 2 },
    ],
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <PresentImg key={`r${l}`} level={l} scale={2} />
        ))}
        {[1, 3, 5].map((l) => (
          <PresentImg key={`s${l}`} look="silver" level={l} scale={2} />
        ))}
      </div>

      <div className="grid max-w-xl gap-2">
        <GiftGauge level={1} top={5} />
        <GiftGauge level={3} top={5} />
        <GiftGauge level={5} top={5} />
        <GiftGauge level={4} top={6} />
        <GiftGauge level={2} top={5} boss />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {L.map((r, i) => (
          <RewardLine key={i} items={r} className="bg-paper px-2 py-1 shadow-ring" />
        ))}
        <RewardLine items={[{ key: MONEY, qty: 840 }]} className="bg-paper px-2 py-1 shadow-ring" />
        <HelperChip />
      </div>

      <div className="flex flex-wrap gap-3">
        {(
          [
            [1, 5, false, false],
            [3, 6, false, true],
            [4, 5, true, false],
          ] as const
        ).map(([level, top, b, helper]) => (
          <div key={`${level}-${top}`} className="relative h-24 w-80 bg-night">
            <GiftPlate level={level} top={top} boss={b} helper={helper} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {screens.map(([name, p]) => (
          <Frame key={name} name={name}>
            <GiftScreen {...p} />
          </Frame>
        ))}
      </div>

      <div className="grid max-w-md gap-3">
        <RewardList items={L[5]!} />
        <RewardList items={[{ key: MONEY, qty: 105 }, ball('hyper-potion', 2)]} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PixelButton onClick={() => setRecap('opened')}>The opened result card</PixelButton>
        <PixelButton onClick={() => setRecap('empty')}>An empty gift</PixelButton>
      </div>
      {recap === 'opened' && <GiftRecap items={L[4]!} onContinue={() => setRecap(null)} />}
      {recap === 'empty' && <GiftEmpty onContinue={() => setRecap(null)} />}

      <div className="pixel-panel max-w-xl p-3">
        <GiftCardPreview />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PixelButton onClick={() => setRules('unlock')}>Gift card rules (first time)</PixelButton>
        <div className="w-64">
          <InfoButton name="Gift" onClick={() => setRules('info')} />
        </div>
      </div>
      <GiftRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </div>
  )
}
