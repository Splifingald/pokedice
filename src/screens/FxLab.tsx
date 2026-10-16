// Dev only (/kitchen-sink/fx): every timeline on its stage, with replay, ¼ speed, a single-frame step and the cue log,
// like the Visual Lab's Animations tab. Not translated: a tool for whoever works on the animations.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PixelButton } from '@/components/PixelButton'
import { Seg } from '@/components/Segmented'
import { StageCanvas, type StageHandle } from '@/components/StageCanvas'
import { Toggle } from '@/components/Toggle'
import type { DieType, PokeType, StatusKind } from '@/engine/types'
import { loadItemSprite, loadSprite, spriteKey } from '@/fx/sprites'
import type { Hud, Timeline } from '@/fx/timeline'
import { attackTimeline } from '@/fx/timelines/attacks'
import { catchTimeline } from '@/fx/timelines/catch'
import { TREAT_URL, treatTimeline } from '@/fx/timelines/trick'
import { loadTrickBall } from '@/fx/scenes'
import { centerTimeline } from '@/fx/timelines/center'
import { gmaxEndTimeline, gmaxFor, megaFor, unleashTimeline } from '@/fx/timelines/forms'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { breachTimeline, closeTimeline, victoryTimeline, wildGlitchTimeline } from '@/fx/timelines/portal'
import { raidEntranceTimeline } from '@/fx/timelines/portalRaid'
import { artUrl } from '@/fx/areaArt'
import { evolveTimeline, hatchTimeline } from '@/fx/timelines/moments'
import { tradeTimeline } from '@/fx/timelines/trade'
import { giftTimeline } from '@/fx/timelines/gift'
import { labColors, starterTimeline } from '@/fx/timelines/starter'

interface Preset {
  name: string
  /** [dex, back, shiny] sprites to load first. */
  /** Dex, back view, and shiny. */
  sprites: [number, boolean, boolean?][]
  item?: string
  /** Anything else to load first (Trick or Treat's ball picture). */
  load?: () => Promise<unknown>
  make: (o: Opts) => Timeline<unknown>
}
interface Opts {
  short: boolean
  foeAttacks: boolean
  status: boolean
  caught: boolean
}

const own = (dex: number) => spriteKey(dex, true)
const foe = (dex: number) => spriteKey(dex, false)
const STONE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/thunder-stone.png'
const CANDY = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png'
/** Distortion World's picture (Haunted Hollow), cracked open by the breach. */
const RIFT = artUrl('a123')

const attack = (
  name: string,
  atk: number,
  def: number,
  type: DieType,
  status: StatusKind | null,
): Preset => ({
  name,
  sprites: [
    [atk, true],
    [def, false],
  ],
  make: (o) =>
    attackTimeline({
      own: own(atk),
      foe: foe(def),
      by: o.foeAttacks ? 'foe' : 'own',
      type,
      damage: 38,
      status: o.status ? status : null,
      short: o.short,
    }),
})

const legend = (dex: number, name: string, type: PokeType): Preset => ({
  name: `Legend: ${name}`,
  sprites: [
    [6, true],
    [dex, false],
  ],
  make: () =>
    legendTimeline({
      own: own(6),
      foe: foe(dex),
      look: legendLook(dex, type),
      name,
      level: 'LV70',
      types: type.toUpperCase(),
    }),
})

const PRESETS: Preset[] = [
  {
    name: 'Pokémon Center',
    sprites: [[113, false]],
    make: (o) => centerTimeline({ balls: 3, nurse: foe(113), short: o.short }),
  },
  {
    name: 'Catch (Great Ball)',
    sprites: [
      [25, true],
      [133, false],
    ],
    make: (o) =>
      catchTimeline({ own: own(25), foe: foe(133), ball: 'great', caught: o.caught, short: o.short }),
  },
  // The Bait (docs/25): the throw stops on the ground while the player is asked, then plays on from there.
  {
    name: 'Catch: short, held for the Bait',
    sprites: [
      [25, true],
      [133, false],
    ],
    make: (o) =>
      catchTimeline({
        own: own(25),
        foe: foe(133),
        ball: 'great',
        caught: false,
        short: o.short,
        hold: true,
      }),
  },
  {
    name: 'Catch: the Bait thrown, from the ground',
    sprites: [
      [25, true],
      [133, false],
    ],
    make: (o) =>
      catchTimeline({
        own: own(25),
        foe: foe(133),
        ball: 'great',
        caught: o.caught,
        short: o.short,
        from: 'ground',
        bait: true,
      }),
  },
  {
    name: 'Catch: the Bait kept, from the ground',
    sprites: [
      [25, true],
      [133, false],
    ],
    make: (o) =>
      catchTimeline({
        own: own(25),
        foe: foe(133),
        ball: 'great',
        caught: false,
        short: o.short,
        from: 'ground',
      }),
  },
  // Capture Luck (docs/25): it breaks free but stays put for one more throw.
  {
    name: 'Catch: broke free but stayed (Capture Luck)',
    sprites: [
      [25, true],
      [133, false],
    ],
    make: (o) =>
      catchTimeline({
        own: own(25),
        foe: foe(133),
        ball: 'great',
        caught: false,
        short: o.short,
        stays: true,
      }),
  },
  // Trick or Treat (docs/29): the ghost at the stage's centre, nobody of yours on it.
  {
    name: 'Trick or Treat: a Treat (flees with "status")',
    sprites: [[92, false]],
    item: TREAT_URL,
    make: (o) =>
      treatTimeline({ own: '', foe: foe(92), at: { x: 120, y: 108 }, fled: o.status, short: o.short }),
  },
  {
    name: 'Trick or Treat: a Trick Ball (missed: restless, stays)',
    sprites: [[92, false]],
    load: loadTrickBall,
    make: (o) =>
      catchTimeline({
        own: '',
        foe: foe(92),
        ball: 'trick',
        caught: o.caught,
        stays: !o.caught,
        short: o.short,
        awake: true,
        ghost: true,
        at: { x: 120, y: 108 },
        ground: 126,
      }),
  },
  {
    name: 'Trick or Treat: a Trick Ball missed, and it flees',
    sprites: [[92, false]],
    load: loadTrickBall,
    make: (o) =>
      catchTimeline({
        own: '',
        foe: foe(92),
        ball: 'trick',
        caught: false,
        short: o.short,
        awake: true,
        ghost: true,
        at: { x: 120, y: 108 },
        ground: 126,
      }),
  },
  attack('Flamethrower', 6, 123, 'fire', 'burn'),
  attack('Hydro Pump', 9, 59, 'water', null),
  attack('Razor Leaf', 3, 76, 'grass', 'poison'),
  attack('Thunderbolt', 25, 130, 'electric', 'paralyze'),
  attack('Psychic', 65, 68, 'psychic', 'confuse'),
  attack('Tackle (Normal)', 19, 74, 'normal', null),
  attack('Punches and a big fist (Fighting)', 68, 143, 'fighting', null),
  attack('Gust and a wing slash (Flying)', 18, 46, 'flying', null),
  attack('Sludge Bomb', 89, 35, 'poison', 'poison'),
  attack('Stomp and eruption (Ground)', 51, 25, 'ground', null),
  attack('Rock Slide', 76, 6, 'rock', null),
  attack('Swarm and X-Scissor (Bug)', 123, 1, 'bug', null),
  attack('Shadow Ball', 94, 65, 'ghost', null),
  attack('Metal Claw', 208, 131, 'steel', null),
  attack('Ice Beam', 131, 149, 'ice', 'frozen'),
  attack('Dragon Breath', 149, 143, 'dragon', null),
  attack('Dark Pulse and Crunch', 197, 65, 'dark', null),
  attack('Moonblast', 36, 149, 'fairy', null),
  attack('Generic impact (typeless die)', 133, 19, 'base', null),
  legend(150, 'Mewtwo', 'psychic'),
  legend(144, 'Articuno', 'ice'),
  legend(145, 'Zapdos', 'electric'),
  legend(146, 'Moltres', 'fire'),
  legend(249, 'Lugia', 'psychic'),
  // Distortion World's portal run (docs/28): the breach, a portal closing, a wild Pokémon distorted, the victory.
  {
    name: 'Portal run: the breach (drawn field)',
    sprites: [],
    make: (o) => breachTimeline({ title: 'Distortion portals', short: o.short }),
  },
  {
    name: "Portal run: the breach (Distortion World's picture)",
    sprites: [],
    item: RIFT,
    make: (o) => breachTimeline({ title: 'Distortion portals', picture: `item|${RIFT}`, short: o.short }),
  },
  {
    name: 'Portal run: a portal closing (a boon picked)',
    sprites: [],
    make: (o) => closeTimeline({ short: o.short }),
  },
  {
    name: 'Portal run: a wild Pokémon distorted (Gengar)',
    sprites: [
      [609, true],
      [94, false],
    ],
    make: (o) => wildGlitchTimeline({ own: own(609), foe: foe(94), short: o.short }),
  },
  {
    name: 'Portal run: the victory (shiny Giratina)',
    sprites: [[487, false, true]],
    make: (o) =>
      victoryTimeline({
        mon: spriteKey(487, false, true),
        name: 'Giratina',
        subs: ['SHINY', 'Lv.100'],
        short: o.short,
      }),
  },
  {
    // Giratina's area raid (docs/28 §6): the raid intro's scene in portal mode; its words are the page's.
    name: "Portal run: Giratina's raid entrance (shiny Giratina out of the portal)",
    sprites: [[487, false, true]],
    make: (o) => raidEntranceTimeline({ mon: spriteKey(487, false, true), short: o.short }),
  },
  {
    name: 'Evolution (Charmeleon)',
    sprites: [
      [5, false],
      [6, false],
    ],
    make: () => evolveTimeline({ from: foe(5), to: foe(6), type: 'fire' }),
  },
  {
    name: 'Evolution (Eevee, Thunder Stone)',
    sprites: [
      [133, false],
      [135, false],
    ],
    item: STONE,
    make: () => evolveTimeline({ from: foe(133), to: foe(135), type: 'electric', stone: `item|${STONE}` }),
  },
  { name: 'Egg hatching (Dratini)', sprites: [[147, false]], make: () => hatchTimeline({ baby: foe(147) }) },
  {
    name: 'Egg hatching, shiny (Eevee)',
    sprites: [[133, false, true]],
    make: () => hatchTimeline({ baby: spriteKey(133, false, true), shiny: true }),
  },
  {
    name: 'Trade (Pidgey for Wartortle)',
    sprites: [
      [16, false],
      [8, false],
    ],
    make: () => tradeTimeline({ give: foe(16), get: foe(8), giveBall: 'poke', getBall: 'great' }),
  },
  {
    name: 'Trade, shiny (Charizard for Gengar)',
    sprites: [
      [6, false],
      [94, false, true],
    ],
    make: () =>
      tradeTimeline({
        give: foe(6),
        get: spriteKey(94, false, true),
        giveBall: 'ultra',
        getBall: 'poke',
        shiny: true,
      }),
  },
  {
    name: 'Gift opening (one item)',
    sprites: [],
    item: CANDY,
    make: () => giftTimeline({ contents: [{ kind: 'item', key: `item|${CANDY}` }] }),
  },
  {
    name: 'Gift opening, shiny (Pikachu)',
    sprites: [[25, false, true]],
    make: () => giftTimeline({ contents: [{ kind: 'mon', key: spriteKey(25, false, true), shiny: true }] }),
  },
  {
    name: 'Gift opening (five things, ₽ among them)',
    sprites: [
      [147, false],
      [133, false, true],
    ],
    item: CANDY,
    make: () =>
      giftTimeline({
        contents: [
          { kind: 'item', key: `item|${CANDY}` },
          { kind: 'mon', key: foe(147) },
          { kind: 'mon', key: spriteKey(133, false, true), shiny: true },
          { kind: 'gold', key: 'gold' },
          { kind: 'item', key: `item|${CANDY}` },
        ],
      }),
  },
  {
    name: 'Gift opening (nine things: "+4")',
    sprites: [[1, false]],
    item: CANDY,
    make: () =>
      giftTimeline({
        contents: Array.from({ length: 9 }, (_, i) =>
          i % 2 ? { kind: 'mon' as const, key: foe(1) } : { kind: 'item' as const, key: `item|${CANDY}` },
        ),
      }),
  },
  {
    name: 'Starter choice (Johto lab)',
    sprites: [
      [152, false],
      [155, false],
      [158, false],
    ],
    make: () =>
      starterTimeline({
        lab: labColors('johto'),
        mons: [foe(152), foe(155), foe(158)],
        ribbon: { welcome: 'Welcome to', region: 'Johto' },
        pick: 1,
      }),
  },
  {
    name: 'Mega Evolution (Charizard X)',
    sprites: [
      [6, true],
      [10034, true],
      [149, false],
    ],
    make: (o) =>
      megaFor({
        own: own(6),
        foe: foe(149),
        side: 'own',
        from: own(6),
        to: own(10034),
        die: 'dragon',
        short: o.short,
      }),
  },
  {
    name: "Mega Evolution (a trainer's Charizard Y)",
    sprites: [
      [149, true],
      [6, false],
      [10035, false],
    ],
    make: (o) =>
      megaFor({
        own: own(149),
        foe: foe(6),
        side: 'foe',
        from: foe(6),
        to: foe(10035),
        die: 'fire',
        short: o.short,
      }),
  },
  {
    name: 'Gigantamax (Pikachu)',
    sprites: [
      [25, true],
      [10199, true],
      [143, false],
    ],
    make: (o) =>
      gmaxFor({
        own: own(25),
        foe: foe(143),
        side: 'own',
        from: own(25),
        to: own(10199),
        die: 'electric',
        short: o.short,
      }),
  },
  {
    name: "A raid's last bar: Giratina's Origin Forme unleashed",
    sprites: [
      [150, true],
      [487, false, true],
      [10007, false, true],
    ],
    make: (o) =>
      unleashTimeline({
        own: own(150),
        foe: spriteKey(487, false, true),
        side: 'foe',
        from: spriteKey(487, false, true),
        to: spriteKey(10007, false, true),
        die: 'dragon',
        short: o.short,
      }),
  },
  {
    name: 'Gigantamax ends (Lapras)',
    sprites: [
      [131, true],
      [10204, true],
      [68, false],
    ],
    make: (o) =>
      gmaxEndTimeline({
        own: own(131),
        foe: foe(68),
        side: 'own',
        from: own(10204),
        to: own(131),
        die: 'water',
        short: o.short,
      }),
  },
]

export function FxLab() {
  const [i, setI] = useState(0)
  const [opts, setOpts] = useState<Opts>({ short: false, foeAttacks: false, status: true, caught: true })
  const [speed, setSpeed] = useState<'1' | '0.25'>('1')
  const [log, setLog] = useState<string[]>([])
  const [t, setT] = useState(0)
  const stage = useRef<StageHandle>(null)
  const preset = PRESETS[i]!
  const ready = useMemo(
    () =>
      Promise.all([
        ...preset.sprites.map(([dex, back, shiny]) => loadSprite(dex, back, shiny)),
        ...(preset.item ? [loadItemSprite(preset.item)] : []),
        ...(preset.load ? [preset.load()] : []),
      ]),
    [preset],
  )
  const timeline = useMemo(() => {
    setLog([])
    return preset.make(opts)
  }, [preset, opts])
  const note = (s: string) => setLog((l) => [...l, `${t.toFixed(2)}s  ${s}`].slice(-14))
  const hud: Hud = {
    contact: () => note('contact'),
    status: (side) => note(`status → ${side}`),
    show: (side, on) => note(`show ${side} ${on}`),
    heal: () => note('heal'),
    form: (side, m) => note(`form ${side} ${m}`),
    formEnd: (side) => note(`form end ${side}`),
    catchResult: (c) => note(`catch ${c ? 'caught' : 'broke free'}`),
    beat: (n) => note(`beat ${n}`),
  }
  const set = (k: keyof Opts) => (v: boolean) => setOpts((o) => ({ ...o, [k]: v }))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <h1 className="text-display">FX lab</h1>
        <Link to="/kitchen-sink" className="ml-auto underline">
          ◀ Kitchen sink
        </Link>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-pixel-sm text-muted">Timeline</span>
        <select
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          className="min-h-[44px] bg-paper px-2 text-xl shadow-ring"
        >
          {PRESETS.map((p, k) => (
            <option key={p.name} value={k}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="pixel-panel overflow-hidden p-0">
        <StageCanvas
          ref={stage}
          timeline={timeline}
          ready={ready}
          hud={hud}
          onTick={setT}
          label={preset.name}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PixelButton size="sm" variant="primary" onClick={() => stage.current?.replay()}>
          Replay
        </PixelButton>
        <PixelButton size="sm" onClick={() => stage.current?.play()}>
          Play
        </PixelButton>
        <PixelButton size="sm" onClick={() => stage.current?.pause()}>
          Pause
        </PixelButton>
        <PixelButton size="sm" onClick={() => stage.current?.step()}>
          Step 1 frame
        </PixelButton>
        <PixelButton size="sm" onClick={() => stage.current?.skip()}>
          End state
        </PixelButton>
        <Seg
          label="Speed"
          value={speed}
          onChange={(v) => {
            setSpeed(v)
            stage.current?.setSpeed(Number(v))
          }}
          options={[
            { id: '1', label: '1×' },
            { id: '0.25', label: '¼×' },
          ]}
        />
        <span className="font-pixel-sm tabular-nums text-muted">
          {t.toFixed(2)} / {timeline.dur.toFixed(2)} s
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle label="Short motion" on={opts.short} onChange={set('short')} />
        <Toggle label="Foe attacks" on={opts.foeAttacks} onChange={set('foeAttacks')} />
        <Toggle label="Status lands" on={opts.status} onChange={set('status')} />
        <Toggle label="Catch succeeds" on={opts.caught} onChange={set('caught')} />
      </div>
      <pre className="pixel-panel min-h-[120px] whitespace-pre-wrap p-2 font-pixel-sm text-[15px]">
        {log.join('\n')}
      </pre>
    </div>
  )
}
