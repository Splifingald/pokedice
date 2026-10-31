// Dev only (/kitchen-sink/fx): every timeline on its stage, with replay, ¼ speed, a single-frame step and the cue log,
// like the Visual Lab's Animations tab. Not translated: a tool for whoever works on the animations.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PixelButton } from '@/components/PixelButton'
import { Seg } from '@/components/Segmented'
import { StageCanvas, type StageHandle } from '@/components/StageCanvas'
import { Toggle } from '@/components/Toggle'
import type { DieType, PokeType, StatusKind } from '@/engine/types'
import { hitPower, type HitPower } from '@/engine/hitPower'
import { loadItemSprite, loadPicture, loadSprite, spriteKey } from '@/fx/sprites'
import { H, Stage, W, type Hud, type Timeline } from '@/fx/timeline'
import { attackTimeline } from '@/fx/timelines/attacks'
import { shinyTimeline } from '@/fx/timelines/shiny'
import { background } from '@/fx/scenes'
import { catchTimeline } from '@/fx/timelines/catch'
import { TREAT_URL, treatTimeline } from '@/fx/timelines/trick'
import { loadTrickBall } from '@/fx/scenes'
import { centerTimeline } from '@/fx/timelines/center'
import { gmaxEndTimeline, gmaxFor, megaFor, unleashTimeline } from '@/fx/timelines/forms'
import { zAwayTimeline, zMoveTimeline, zStrikeTimeline } from '@/fx/timelines/zmove'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { breachTimeline, closeTimeline, victoryTimeline, wildGlitchTimeline } from '@/fx/timelines/portal'
import { legendRaidEntranceTimeline } from '@/fx/timelines/legendRaid'
import { LEGEND_RAID_SCENES } from '@/fx/timelines/legendRaidScenes'
import { BOSS_CINEMAS, RAID_CINEMAS } from '@/fx/timelines/cinema'
import { CHAMPION_CINEMAS } from '@/fx/timelines/cinema/champions'
import { sampleParams } from '@/fx/timelines/cinema/champion'
import { raidEntranceTimeline } from '@/fx/timelines/portalRaid'
import {
  nightmareIntroTimeline,
  nightmareStrikeTimeline,
  nightmareWakeTimeline,
} from '@/fx/timelines/nightmare'
import { nightRaidEntranceTimeline } from '@/fx/timelines/nightmareRaid'
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
  /** The game-feel pass (docs/38): how hard the hit lands, and the battle's settle. */
  power: keyof typeof POWERS
  trim: boolean
}

/** A hit of each weight, as the battle reads one from the log (engine/hitPower). */
const POWERS: Record<'off' | 'resisted' | 'plain' | 'super' | 'huge' | 'ko', HitPower | undefined> = {
  off: undefined,
  resisted: hitPower({ effectiveness: 0.5, damage: 3, maxHp: 100 }),
  plain: hitPower({ effectiveness: 1, damage: 12, maxHp: 100 }),
  super: hitPower({ effectiveness: 2, damage: 20, maxHp: 100 }),
  huge: hitPower({ effectiveness: 2, combo: 'full_house', damage: 70, maxHp: 100 }),
  ko: hitPower({ effectiveness: 2, damage: 40, maxHp: 100, ko: true }),
}

const own = (dex: number) => spriteKey(dex, true)
const foe = (dex: number) => spriteKey(dex, false)

/** A timeline that draws only its own layer (the shiny's stars), shown here over the stage and both Pokémon. */
function onStage<S>(tl: Timeline<S>, ownKey: string, foeKey: string): Timeline<{ st: Stage; s: S }> {
  return {
    id: tl.id,
    dur: tl.dur,
    setup: () => ({ st: new Stage({ own: ownKey, foe: foeKey }, 1), s: tl.setup() }),
    step: (x, t, dt) => tl.step(x.s, t, dt),
    draw(g, x, t) {
      x.st.begin(g, t)
      x.st.drawBoth(g, t)
      x.st.end(g)
      tl.draw(g, x.s, t)
    },
    cues: (x) => tl.cues(x.s).map(([t0, fire]) => [t0, (hud: Hud) => fire(hud, x.s)] as const),
  }
}
const STONE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/thunder-stone.png'
const CANDY = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png'
/** Distortion World's picture (Haunted Hollow), cracked open by the breach. */
const RIFT = artUrl('a123')
// Newmoon Island's picture (docs/30): what the nightmare's intro sinks into the night.
const NEWMOON = artUrl('a127')

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
      power: POWERS[o.power],
      trim: o.trim,
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

/** Every typed move (and the typeless impact): its name, attacker, target, type and the status it can cause. */
const ATTACKS: [string, number, number, DieType, StatusKind | null][] = [
  ['Flamethrower', 6, 123, 'fire', 'burn'],
  ['Hydro Pump', 9, 59, 'water', null],
  ['Razor Leaf', 3, 76, 'grass', 'poison'],
  ['Thunderbolt', 25, 130, 'electric', 'paralyze'],
  ['Psychic', 65, 68, 'psychic', 'confuse'],
  ['Tackle (Normal)', 19, 74, 'normal', null],
  ['Punches and a big fist (Fighting)', 68, 143, 'fighting', null],
  ['Gust and a wing slash (Flying)', 18, 46, 'flying', null],
  ['Sludge Bomb', 89, 35, 'poison', 'poison'],
  ['Stomp and eruption (Ground)', 51, 25, 'ground', null],
  ['Rock Slide', 76, 6, 'rock', null],
  ['Swarm and X-Scissor (Bug)', 123, 1, 'bug', null],
  ['Shadow Ball', 94, 65, 'ghost', null],
  ['Metal Claw', 208, 131, 'steel', null],
  ['Ice Beam', 131, 149, 'ice', 'frozen'],
  ['Dragon Breath', 149, 143, 'dragon', null],
  ['Dark Pulse and Crunch', 197, 65, 'dark', null],
  ['Moonblast', 36, 149, 'fairy', null],
  ['Generic impact (typeless die)', 133, 19, 'base', null],
]

/** A typed move as a Z-Move's strike; "Foe attacks" plays it as a trainer's. */
const zStrike = (name: string, atk: number, def: number, type: DieType): Preset => ({
  name: `Z-Move strike: ${name}`,
  sprites: [
    [atk, true],
    [def, false],
  ],
  make: (o) =>
    zStrikeTimeline({
      own: own(atk),
      foe: foe(def),
      side: o.foeAttacks ? 'foe' : 'own',
      type,
      damage: 76,
      short: o.short,
      power: POWERS[o.power],
      trim: o.trim,
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
  // A miss wobbles fewer times the further it fell short (the engine's catchShakes): 3, 2, 1, then none.
  ...[1, 2, 3, 4].map((by): Preset => ({
    name: `Catch: a miss ${by} short`,
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
        roll: { total: 7 - by, need: 7, caught: false },
        short: o.short,
      }),
  })),
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
  ...ATTACKS.map(([name, atk, def, type, status]) => attack(name, atk, def, type, status)),
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
  // The raid overhaul's legendary entrances (docs/40): one per scene, the raid intro's words being the page's.
  ...Object.entries(LEGEND_RAID_SCENES).map(
    ([dex, scene]): Preset => ({
      name: `Raid entrance: #${dex} (${scene.omen}, ${scene.weather})`,
      sprites: [[Number(dex), false]],
      make: (o) => legendRaidEntranceTimeline({ scene, mon: spriteKey(Number(dex), false), short: o.short }),
    }),
  ),
  // The legends' own cinematics (docs/53): the raids' (their words are the raid intro's), the bosses' with their card.
  ...Object.entries(RAID_CINEMAS).map(
    ([dex, c]): Preset => ({
      name: `Cinematic: #${dex}'s raid entrance`,
      sprites: [[Number(dex), false], ...(c.sprites ?? []).map(([d, sh]): [number, boolean, boolean] => [d, false, sh])],
      make: (o) => c.make({ mon: foe(Number(dex)), short: o.short }),
    }),
  ),
  ...Object.entries(BOSS_CINEMAS).map(
    ([dex, c]): Preset => ({
      name: `Cinematic: #${dex}'s boss entrance`,
      sprites: [
        [6, true],
        [Number(dex), false],
      ],
      make: () =>
        c.makeBattle({
          own: own(6),
          foe: foe(Number(dex)),
          look: legendLook(Number(dex), 'psychic'),
          name: `#${dex}`,
          level: 'LV65',
          types: 'PSYCHIC',
        }),
    }),
  ),
  // The champions' own cinematics (docs/56): each with its sample picture, team and card.
  ...Object.values(CHAMPION_CINEMAS).map(
    (c): Preset => ({
      name: `Cinematic: ${c.sample.name}'s entrance`,
      sprites: [[6, true], ...[c.sample.lead, c.sample.ace, ...c.extras].map((d): [number, boolean] => [d, false])],
      load: () => loadPicture(c.sample.trainer),
      make: () => c.makeBattle(sampleParams(c.sample)),
    }),
  ),
  // Darkrai's nightmare (docs/30): the intro, the strike after a round, the waking, the raid's entrance.
  {
    name: 'Nightmare: the intro (drawn field)',
    sprites: [[491, false]],
    make: (o) =>
      nightmareIntroTimeline({ title: "Darkrai's nightmare", mon: spriteKey(491, false), short: o.short }),
  },
  {
    name: "Nightmare: the intro (Newmoon Island's picture)",
    sprites: [[491, false]],
    item: NEWMOON,
    make: (o) =>
      nightmareIntroTimeline({
        title: "Darkrai's nightmare",
        mon: spriteKey(491, false),
        picture: `item|${NEWMOON}`,
        short: o.short,
      }),
  },
  {
    name: "Nightmare: Darkrai's strike after a round (three on the team)",
    sprites: [
      [491, false],
      [94, true],
      [448, true],
      [609, true],
    ],
    make: (o) =>
      nightmareStrikeTimeline({
        mon: spriteKey(491, false),
        team: [94, 448, 609].map((d) => spriteKey(d, true)),
        // The lab's stage is 240 × 160 (the game's strike panel is 2:1, 240 × 120).
        h: 160,
        short: o.short,
      }),
  },
  {
    name: 'Nightmare: the waking (shiny Darkrai)',
    sprites: [[491, false, true]],
    make: (o) =>
      nightmareWakeTimeline({
        mon: spriteKey(491, false, true),
        name: 'Darkrai',
        subs: ['SHINY', 'Lv.80'],
        short: o.short,
      }),
  },
  {
    name: "Nightmare: Darkrai's raid entrance (out of the smoke, before the moon)",
    sprites: [[491, false, true]],
    make: (o) => nightRaidEntranceTimeline({ mon: spriteKey(491, false, true), short: o.short }),
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
  {
    name: 'Z-Move (Pikachu, Electric)',
    sprites: [
      [25, true],
      [130, false],
    ],
    make: (o) =>
      zMoveTimeline({ own: own(25), foe: foe(130), side: 'own', type: 'electric', short: o.short }),
  },
  {
    name: "Z-Move (a trainer's Decidueye, Grass)",
    sprites: [
      [258, true],
      [724, false],
    ],
    make: (o) => zMoveTimeline({ own: own(258), foe: foe(724), side: 'foe', type: 'grass', short: o.short }),
  },
  // Each type's move as a Z-Move: the same move, more powerful, with the Z's mark on its last hit.
  ...ATTACKS.map(([name, atk, def, type]) => zStrike(name, atk, def, type)),
  ...(['fly', 'dig', 'dive'] as const).flatMap((how) => {
    const [dex, type] =
      how === 'fly'
        ? ([6, 'flying'] as const)
        : how === 'dig'
          ? ([51, 'ground'] as const)
          : ([9, 'water'] as const)
    const sprites: [number, boolean][] = [
      [dex, true],
      [143, false],
    ]
    return [
      {
        name: `Z-Move away: ${how}`,
        sprites,
        make: (o: Opts) => zAwayTimeline({ own: own(dex), foe: foe(143), side: 'own', how, short: o.short }),
      },
      {
        name: `Z-Move strike, back from ${how}`,
        sprites,
        make: (o: Opts) =>
          zStrikeTimeline({ own: own(dex), foe: foe(143), side: 'own', type, from: how, short: o.short }),
      },
    ]
  }),
  // The game-feel pass (docs/38 F10b): a shiny lands on its platform in the hatching's rings of stars.
  {
    name: 'Shiny entrance (Gyarados)',
    sprites: [
      [25, true],
      [130, false, true],
    ],
    make: () =>
      onStage(
        shinyTimeline({ key: spriteKey(130, false, true), at: background(W, H).layout.foe, delay: 0.3 }),
        own(25),
        spriteKey(130, false, true),
      ) as Timeline<unknown>,
  },
]

export function FxLab() {
  const [i, setI] = useState(0)
  const [opts, setOpts] = useState<Opts>({
    short: false,
    foeAttacks: false,
    status: true,
    caught: true,
    power: 'off',
    trim: false,
  })
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
    settle: () => note('settle: the battle moves on, only particles from here'),
    ko: () => note('ko: the boss stop'),
    status: (side) => note(`status → ${side}`),
    show: (side, on) => note(`show ${side} ${on}`),
    heal: () => note('heal'),
    form: (side, m) => note(`form ${side} ${m}`),
    formEnd: (side) => note(`form end ${side}`),
    catchResult: (c) => note(`catch ${c ? 'caught' : 'broke free'}`),
    beat: (n) => note(`beat ${n}`),
  }
  const set = (k: 'short' | 'foeAttacks' | 'status' | 'caught' | 'trim') => (v: boolean) =>
    setOpts((o) => ({ ...o, [k]: v }))

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
        <Toggle label="Battle's settle (game feel)" on={opts.trim} onChange={set('trim')} />
      </div>
      <Seg
        label="Hit power (game feel)"
        value={opts.power}
        onChange={(v) => setOpts((o) => ({ ...o, power: v }))}
        options={(Object.keys(POWERS) as Opts['power'][]).map((id) => ({ id, label: id }))}
      />
      <pre className="pixel-panel min-h-[120px] whitespace-pre-wrap p-2 font-pixel-sm text-[16px]">
        {log.join('\n')}
      </pre>
    </div>
  )
}
