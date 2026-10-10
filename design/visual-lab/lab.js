/* Pokédice Visual Lab: the page. Styles, mock screens, the animation player's HUD and the moodboards. */
;(function () {
  'use strict'
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const store = {
    get(k, d) {
      try {
        return localStorage.getItem('pdlab.' + k) ?? d
      } catch {
        return d
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('pdlab.' + k, v)
      } catch {
        /* private mode */
      }
    },
  }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  // ================================================================== data
  const TYPE_CUR = {
    base: '#f7f2e0',
    normal: '#c8b88a',
    fire: '#ca6e29',
    water: '#547acc',
    electric: '#d2b125',
    grass: '#68a941',
    ice: '#80b8b6',
    fighting: '#a52722',
    poison: '#8b3589',
    ground: '#c0a256',
    flying: '#907acf',
    psychic: '#d44873',
    bug: '#8d9d16',
    rock: '#9b892e',
    ghost: '#624a80',
    dragon: '#5e2dd6',
    dark: '#5f4a3c',
    steel: '#9c9caf',
    fairy: '#b67193',
  }
  const TYPE_MOD = {
    base: '#f4f6fb',
    normal: '#a8a77a',
    fire: '#ee8130',
    water: '#6390f0',
    electric: '#f7d02c',
    grass: '#7ac74c',
    ice: '#96d9d6',
    fighting: '#c22e28',
    poison: '#a33ea1',
    ground: '#e2bf65',
    flying: '#a98ff3',
    psychic: '#f95587',
    bug: '#a6b91a',
    rock: '#b6a136',
    ghost: '#735797',
    dragon: '#6f35fc',
    dark: '#705746',
    steel: '#b7b7ce',
    fairy: '#d685ad',
  }
  const TYPES = Object.keys(TYPE_CUR).filter((t) => t !== 'base')
  const STATUS = {
    burn: '#f07a2a',
    poison: '#b04db0',
    frozen: '#5fc0e0',
    paralyze: '#f0cc28',
    confuse: '#ec5f9e',
    heal: '#52c052',
  }
  const STATUS_CODE = {
    BRN: ['burn', '#f07a2a'],
    PAR: ['paralyze', '#f0cc28'],
    CNF: ['confuse', '#ec5f9e'],
    PSN: ['poison', '#b04db0'],
    FNT: ['faint', '#8a8396'],
  }
  const ICON_IDX = { 6: 0, 25: 1, 131: 2, 143: 3, 65: 4, 135: 5, 94: 6, 133: 7, 150: 8, 9: 9, 3: 10, 113: 11 }

  /** The game's own pixel icons (src/components/icons.tsx), recoloured per style. */
  const ICONS = {
    coin: ['..kkkk..', '.kyyyyk.', 'kyYyyyyk', 'kyYyyyyk', 'kyyyyyok', 'kyyyyyok', '.kyooyk.', '..kkkk..'],
    burn: ['....k...', '...kok..', '..koYok.', '.kooYyok', '.koyYyok', '.kooyyok', '..koook.', '...kkk..'],
    paralyze: [
      '....kkk.',
      '...keek.',
      '..keek..',
      '.keeeek.',
      '.kkeek..',
      '..kek...',
      '..kk....',
      '.k......',
    ],
    frozen: ['...kk...', '..kCck..', '.kCccck.', 'kCcCccck', 'kcccCcck', '.kcccck.', '..kcck..', '...kk...'],
    confuse: ['.kkkkk..', 'km....k.', 'k.kkk.k.', 'k.k.k.k.', 'k.k...k.', 'k.kkkk..', 'k.......', '.kkkkkk.'],
    poison: ['......k.', '.kk..kPk', 'kppk..k.', 'kpPpk...', 'kpppk.kk', '.kkk.kPk', '.....kpk', '......k.'],
    heal: ['..kkkk..', '..kggk..', 'kkkggkkk', 'kgggwggk', 'kggggggk', 'kkkggkkk', '..kggk..', '..kkkk..'],
    potion: ['..kkkk..', '...kk...', '..kwwk..', '.kwbbwk.', 'kbbbbbbk', 'kbwbbbbk', 'kbbbbbbk', '.kkkkkk.'],
    up: ['...kk...', '..kggk..', '.kggggk.', 'kkkggkkk', '..kggk..', '..kggk..', '..kggk..', '..kkkk..'],
    dex: ['kkkkkkk.', 'krrrrrrk', 'krwwrrrk', 'krrrrrrk', 'kkkkkkkk', 'kwwwwwwk', 'kwsswwwk', 'kkkkkkkk'],
    map: ['kkkkkkkk', 'kgggbbbk', 'kgyggbbk', 'kggggbbk', 'kbbgrggk', 'kbbggggk', 'kbbbgggk', 'kkkkkkkk'],
    lock: ['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kyyyyyyk', 'kyyykyyk', 'kyyyyyyk', 'kkkkkkkk'],
    star: ['...kk...', '...yy...', 'kkyYyykk', '.kyyyyk.', '..kyyk..', '.kykkyk.', '.kk..kk.', '........'],
    ball: [
      '....kkkk....',
      '..kkrrrrkk..',
      '.krrwrrrrrk.',
      '.krwwrrrrrk.',
      'krrrkkkkrrrk',
      'kkkkkwwkkkkk',
      'kwwwkwwkwwwk',
      'kwwwkkkkwwwk',
      '.kwwwwwwwwk.',
      '.kwwwwwwwwk.',
      '..kkwwwwkk..',
      '....kkkk....',
    ],
    sword: [
      '..........kk',
      '.........kwk',
      '........kwk.',
      '.......kwk..',
      '......kwk...',
      '.k...kwk....',
      '.kk.kwk.....',
      '..kkwk......',
      '..kkk.......',
      '.kkkkk......',
      'kkk.kk......',
      'kk..........',
    ],
    reroll: [
      '....kkkk....',
      '..kkwwwwkk.k',
      '.kww....wwkk',
      '.kw......kwk',
      'kw......kwwk',
      'kw.......kkk',
      'kkk.......wk',
      'kwwk......wk',
      'kwk......wk.',
      'kkww....wwk.',
      'k.kkwwwwkk..',
      '....kkkk....',
    ],
    trophy: [
      '..kkkkkkkk..',
      'kkkyyyyyYkkk',
      'k.kyyyyyYk.k',
      'k.kyyyyyYk.k',
      '.kkyyyyyykk.',
      '...kyyyyk...',
      '....kyyk....',
      '.....kk.....',
      '.....kk.....',
      '....kyyk....',
      '...kkkkkk...',
      '...kkkkkk...',
    ],
    history: [
      'kkkkkkkkkk.',
      'kwwwwwwwwk.',
      'kwkkkkkkwk.',
      'kwwwwwwwwk.',
      'kwkkkkkwwk.',
      'kwwwwwwwwk.',
      'kwkkkkkkwk.',
      'kwwwwwwwwk.',
      'kwkkkkwwwk.',
      'kwwwwwwwwk.',
      'kkkkkkkkkk.',
      '...........',
    ],
  }
  const ICON_PAL = {
    current: {
      k: '#2a2438',
      w: '#f7f2e0',
      y: '#e8b44a',
      Y: '#fbeeb0',
      o: '#ca6e29',
      r: '#c2452d',
      b: '#547acc',
      c: '#80b8b6',
      C: '#c6e7ef',
      p: '#8b3589',
      P: '#c77ac5',
      g: '#4aa84a',
      s: '#6b6480',
      e: '#d2b125',
      m: '#d44873',
    },
    daybreak: {
      k: '#24304f',
      w: '#ffffff',
      y: '#ffbe2e',
      Y: '#ffe7a8',
      o: '#ff8a3d',
      r: '#f2553f',
      b: '#5b8def',
      c: '#7fd6d0',
      C: '#d4f3f0',
      p: '#a24bc4',
      P: '#e3a6f2',
      g: '#34c97a',
      s: '#8592ad',
      e: '#ffd23a',
      m: '#ff6f9c',
    },
    night: {
      k: '#c9d0ff',
      w: '#20285a',
      y: '#ffd23a',
      Y: '#fff2a8',
      o: '#ff8a3d',
      r: '#ff2e6e',
      b: '#3ea0ff',
      c: '#3ef0ff',
      C: '#a9fbff',
      p: '#c45cff',
      P: '#e8b0ff',
      g: '#3ef0a0',
      s: '#6a74b8',
      e: '#ffd23a',
      m: '#ff4f9a',
    },
    pop: {
      k: '#1a1423',
      w: '#ffffff',
      y: '#ffd84d',
      Y: '#fff2b0',
      o: '#ff6b1a',
      r: '#ff3b4f',
      b: '#3a7bff',
      c: '#00c2a8',
      C: '#b8fff2',
      p: '#7b4dff',
      P: '#c4adff',
      g: '#22c96e',
      s: '#8a7f9c',
      e: '#ffd84d',
      m: '#ff4f9a',
    },
  }
  const iconURL = (name, style, scale = 3) =>
    PX.cached(`iconurl|${name}|${style}|${scale}`, () =>
      PX.icon(ICONS[name], ICON_PAL[style], scale).toDataURL(),
    )

  const STYLES = [
    {
      id: 'current',
      name: 'Kanto Parchment',
      short: 'Current',
      sw: ['#e8e0c8', '#2a2438', '#e8b44a'],
      thesis:
        'The game as it ships: Game Boy Color framing on parchment, 3 px ink borders with a white inner line, hard 4 px shadows, gold for the main action, Jersey 25 everywhere. Honest and readable, but every surface is drawn the same way, so nothing leads.',
      chips: [
        'Jersey 25 / 15',
        '3 px ink borders',
        '4 px hard shadow',
        'radius ≤ 2 px',
        'hatched = disabled',
      ],
      palette: [
        ['Parchment', '#e8e0c8', 'Ground'],
        ['Panel', '#f7f2e0', 'Cards and boxes'],
        ['Ink', '#2a2438', 'Borders, text'],
        ['Shadow', '#6b6480', 'Shadows only'],
        ['Gold', '#e8b44a', 'Main action'],
        ['Danger', '#a8341f', 'Damage text'],
        ['HP green', '#4aa84a', 'HP over 50 %'],
        ['Muted', '#554d6a', 'Secondary text'],
      ],
      fonts: [
        ['Display', 'Jersey 25', "'Jersey 25'"],
        ['Body', 'Jersey 25 · 20 px', "'Jersey 25'"],
        ['Small', 'Jersey 15', "'Jersey 15'"],
      ],
      rules: [
        ['Frames', 'One recipe for every surface: 3 px ink border, 2 px white inner line, 2 px radius.'],
        ['Depth', 'A hard 4 px drop shadow to the bottom right. Buttons press 2 px into it.'],
        ['Disabled', 'Hatched and dashed, never faded: it keeps 5.9:1 contrast.'],
        ['Colour', 'GBC palette; type colours darkened about 15 % to sit on parchment.'],
        [
          'Scene',
          'A 240 × 112 background, sprites on flat grass; the info boxes are the same panels as menus.',
        ],
      ],
      build:
        'This is <code>src/styles/pixel.css</code> and <code>src/theme/colors.ts</code> as they are today.',
    },
    {
      id: 'daybreak',
      name: 'Johto Daybreak',
      short: 'Daybreak',
      sw: ['#e9f0f8', '#24304f', '#f2553f'],
      thesis:
        'HeartGold’s morning light with a modern UI’s calm. Panels are paper-white with drawn, stepped corners and a dithered drop shadow instead of a hard one. Skies are ordered-dither gradients, greens shift hue toward yellow in the light, and Poké-ball red is kept for the one action that matters.',
      chips: [
        'Jersey 20 + 15',
        '1 px navy line',
        'dithered 2 px shadow',
        'hue-shifted pastels',
        '9-slice frames',
      ],
      palette: [
        ['Mist', '#e9f0f8', 'Ground'],
        ['Paper', '#fbfdff', 'Panels'],
        ['Navy ink', '#24304f', 'Lines, text'],
        ['Fog', '#dfe7f2', 'Panel shade'],
        ['Poké red', '#f2553f', 'Main action'],
        ['Sky', '#8ccbf6', 'Scenery'],
        ['Meadow', '#92d08a', 'Scenery'],
        ['Sunrise', '#ffbe2e', 'Progress, rewards'],
      ],
      fonts: [
        ['Display', 'Jersey 20 · 40 px', "'Jersey 20'"],
        ['Body', 'Jersey 20 · 20 px', "'Jersey 20'"],
        ['Labels, numbers', 'Jersey 15 · 15 px', "'Jersey 15'"],
      ],
      rules: [
        [
          'Frames',
          'Drawn 9-slice: 1 px navy line, radius-3 stepped corners, white top line, fog bottom line.',
        ],
        [
          'Depth',
          'Shadows fall straight down, 2 px, as a 50 % checker dither: soft without a single blurred pixel.',
        ],
        ['Colour', 'Pastel type badges: tinted fill, line and text from the same hue, darker.'],
        [
          'Light',
          'Scenery is lit from the top right: sun bloom on the sky, lit edges on ridges, darker feet.',
        ],
        ['Motion', 'Buttons press 2 px into their own shadow; HP drains with a coral trail.'],
        [
          'Type',
          'Jersey 20 for text, Jersey 15 for labels and numbers, only at sizes on their pixel grid (15, 20, 40 px): the same family the game ships, one step crisper.',
        ],
      ],
      build:
        'Swap <code>.pixel-panel</code> / <code>.pixel-btn</code> for <code>border-image</code> frames generated from small pixel maps (this page builds them in <code>lab.js → makeFrame</code>). Type: add Jersey 20 next to the Jersey 25/15 the game already bundles, and keep the Fusion Pixel CJK fallback.',
    },
    {
      id: 'night',
      name: 'Unova Night',
      short: 'Night',
      sw: ['#0a0d1c', '#3ef0ff', '#ff2e6e'],
      thesis:
        'Black 2/White 2 after dark. Chamfered glass panels with neon corner ticks, the BW2 red for the main action, cyan for everything interactive. HP becomes LED segments, numbers are dot-matrix, and the battle platforms glow like the Pokémon World Tournament.',
      chips: ['Handjet + Doto', 'chamfered corners', 'neon ticks', 'LED HP', 'dithered glow'],
      palette: [
        ['Night', '#0a0d1c', 'Ground'],
        ['Glass', '#141a33', 'Panels'],
        ['Edge', '#3a4580', 'Panel line'],
        ['Neon cyan', '#3ef0ff', 'Interactive, focus'],
        ['BW2 red', '#ff2e6e', 'Main action'],
        ['Gold', '#ffd23a', 'Money, rewards'],
        ['Violet', '#4f2f76', 'Horizon'],
        ['Text', '#e9ecff', 'Body text'],
      ],
      fonts: [
        ['Display', 'Handjet 700', "'Handjet'"],
        ['Body', 'Handjet 500 · 19 px', "'Handjet'"],
        ['Numbers', 'Doto 800', "'Doto'"],
      ],
      rules: [
        [
          'Frames',
          'Top-left and bottom-right corners chamfered 4 px; the other two stepped by 1. Cyan ticks ride the chamfers.',
        ],
        ['Light', 'Glow is a 1–2 px checker dither around the line, never a blur. Only actions glow.'],
        ['HP', 'Segments of 4 px with 2 px gaps: the bar reads like a device.'],
        ['Colour', 'Type chips are dark glass with a coloured left edge and a neon label.'],
        ['Scene', 'Twilight skyline, star twinkles, circular platforms with breathing neon rims.'],
      ],
      build:
        'Dark tokens in <code>colors.ts</code>; the frames come from the same generator with a chamfer profile. Check contrast: body text #e9ecff on #141a33 is 14:1, muted #9aa3d6 is 7:1.',
    },
    {
      id: 'pop',
      name: 'Paldea Pop',
      short: 'Pop',
      sw: ['#fff4de', '#1a1423', '#ff6b1a'],
      thesis:
        'Scarlet and Violet’s orange and violet as stickers. A 2 px ink line, chunky buttons with a 3 px underlip, violet offset shadows, halftone and sunbursts behind the battle. Loud on purpose: this is the style for a game that wants to feel like a toy.',
      chips: [
        'Silkscreen + DotGothic16',
        '2 px ink line',
        '3 px button lip',
        'violet offset shadow',
        'halftone',
      ],
      palette: [
        ['Cream', '#fff4de', 'Ground'],
        ['White', '#ffffff', 'Panels'],
        ['Ink', '#1a1423', 'Lines, text'],
        ['Scarlet', '#ff6b1a', 'Main action'],
        ['Violet', '#7b4dff', 'Shadows, progress'],
        ['Sunshine', '#ffd84d', 'Header, sunburst'],
        ['Mint', '#00c2a8', 'Accents'],
        ['Bubblegum', '#ff4f9a', 'Alerts'],
      ],
      fonts: [
        ['Display', 'Silkscreen 700', "'Silkscreen'"],
        ['Body', 'DotGothic16 · 16 px', "'DotGothic16'"],
        ['Numbers', 'Silkscreen', "'Silkscreen'"],
      ],
      rules: [
        ['Frames', '2 px ink line, radius-2 stepped corners, a white inside and a lavender bottom row.'],
        [
          'Depth',
          'Panels cast a solid violet 2 px shadow; buttons carry a 3 px darker underlip that disappears when pressed.',
        ],
        ['Colour', 'Type badges are full-strength colour with white outlined text.'],
        ['Pattern', 'Halftone dots for ground, a sunburst behind the foe: flat colour, no gradients.'],
        ['Motion', 'Bigger squash on press, bouncier HP drains, sparkles that pop in and out.'],
      ],
      build:
        'Same frame generator with a 2 px outline. DotGothic16 brings Japanese glyphs of its own, which suits the CJK locales. Keep the halftone texture under 10 % contrast so body text stays clean.',
    },
  ]
  const STYLE = Object.fromEntries(STYLES.map((s) => [s.id, s]))

  // ================================================================== pixel frames (9-slice)
  const S = 6
  const FRAME_SPECS = {
    daybreak: {
      panel: {
        prof: [3, 1, 1],
        ow: 1,
        out: '#24304f',
        fill: '#fbfdff',
        hi: '#ffffff',
        lo: '#dfe7f2',
        shadow: { dx: 0, dy: 2, color: '#24304f66', dither: true },
      },
      dialog: {
        prof: [3, 1, 1],
        ow: 1,
        out: '#24304f',
        fill: '#ffffff',
        inner: '#cfe0f4',
        shadow: { dx: 0, dy: 2, color: '#24304f66', dither: true },
      },
      btn: {
        prof: [2, 1],
        ow: 1,
        out: '#24304f',
        fill: '#ffffff',
        hi: '#ffffff',
        lo: '#d3dcea',
        loRows: 2,
        shadow: { dx: 0, dy: 2, color: '#24304f66', dither: true },
      },
      primary: {
        prof: [2, 1],
        ow: 1,
        out: '#6e1d16',
        fill: '#f2553f',
        hi: '#ff9a85',
        lo: '#c4382a',
        loRows: 2,
        shadow: { dx: 0, dy: 2, color: '#24304f66', dither: true },
      },
      // Something new to open (a new region): the one gold button on the screen.
      gold: {
        prof: [2, 1],
        ow: 1,
        out: '#6b4300',
        fill: '#ffbe2e',
        hi: '#fff0b8',
        lo: '#e08e00',
        loRows: 2,
        shadow: { dx: 0, dy: 2, color: '#24304f66', dither: true },
      },
      off: { prof: [2, 1], ow: 1, out: '#a9b5cc', fill: '#eef2f8', dots: true },
    },
    night: {
      panel: {
        prof: { tl: [4, 3, 2, 1], br: [4, 3, 2, 1], tr: [1], bl: [1] },
        ow: 1,
        out: '#3a4580',
        fill: '#121731',
        hi: '#262f62',
        lo: '#0b0f22',
        ticks: '#3ef0ff',
        m: 1,
      },
      dialog: {
        prof: { tl: [4, 3, 2, 1], br: [4, 3, 2, 1], tr: [1], bl: [1] },
        ow: 1,
        out: '#3a4580',
        fill: '#0f1430',
        inner: '#1d2550',
        ticks: '#ff2e6e',
        m: 1,
      },
      btn: {
        prof: { tl: [3, 2, 1], br: [3, 2, 1], tr: [1], bl: [1] },
        ow: 1,
        out: '#3ef0ff',
        fill: '#161c3c',
        hi: '#28337a',
        lo: '#0d1129',
        glow: { color: '#3ef0ff', r: 1 },
        m: 1,
      },
      primary: {
        prof: { tl: [3, 2, 1], br: [3, 2, 1], tr: [1], bl: [1] },
        ow: 1,
        out: '#ffd0e0',
        fill: '#ff2e6e',
        hi: '#ff86ab',
        lo: '#c4134c',
        loRows: 2,
        glow: { color: '#ff2e6e', r: 2 },
        m: 2,
      },
      off: {
        prof: { tl: [3, 2, 1], br: [3, 2, 1], tr: [1], bl: [1] },
        ow: 1,
        out: '#2a3366',
        fill: '#0d1128',
        dots: true,
        m: 1,
      },
    },
    pop: {
      panel: {
        prof: [2, 1],
        ow: 2,
        out: '#1a1423',
        fill: '#ffffff',
        hi: '#ffffff',
        lo: '#efe6ff',
        shadow: { dx: 2, dy: 2, color: '#7b4dff' },
      },
      dialog: {
        prof: [2, 1],
        ow: 2,
        out: '#1a1423',
        fill: '#ffffff',
        inner: '#ffd84d',
        shadow: { dx: 2, dy: 2, color: '#1a1423' },
      },
      btn: {
        prof: [2, 1],
        ow: 2,
        out: '#1a1423',
        fill: '#ffffff',
        hi: '#ffffff',
        lo: '#d9c9ff',
        loRows: 3,
        shadow: { dx: 0, dy: 2, color: '#1a1423' },
      },
      primary: {
        prof: [2, 1],
        ow: 2,
        out: '#1a1423',
        fill: '#ff6b1a',
        hi: '#ffa25e',
        lo: '#c7460a',
        loRows: 3,
        shadow: { dx: 0, dy: 2, color: '#1a1423' },
      },
      off: { prof: [2, 1], ow: 2, out: '#8a7f9c', fill: '#f3ece0', dots: true },
    },
  }

  /** Draw one frame as pixel art (a (2S+2)² map), then scale it by k for crisp device pixels. */
  function makeFrame(sp, k, press = false) {
    const N = 2 * S + 2,
      m = sp.m || 0
    const sh = sp.shadow || { dx: 0, dy: 0 }
    const off = press ? [sh.dx, sh.dy] : [0, 0]
    const x0 = m + off[0],
      y0 = m + off[1],
      x1 = N - 1 - m - sh.dx + off[0],
      y1 = N - 1 - m - sh.dy + off[1]
    const P = Array.isArray(sp.prof) ? { tl: sp.prof, tr: sp.prof, bl: sp.prof, br: sp.prof } : sp.prof
    const inside = (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return false
      const t = y - y0,
        b = y1 - y,
        l = x - x0,
        r = x1 - x
      if (t < P.tl.length && l < P.tl[t]) return false
      if (t < P.tr.length && r < P.tr[t]) return false
      if (b < P.bl.length && l < P.bl[b]) return false
      if (b < P.br.length && r < P.br[b]) return false
      return true
    }
    const ow = sp.ow || 1
    const edge = (x, y, d) => !inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || !inside(x, y + d)
    const isLine = (x, y) => {
      for (let d = 1; d <= ow; d++) if (edge(x, y, d)) return true
      return (
        ow >= 2 &&
        (!inside(x - 1, y - 1) || !inside(x + 1, y - 1) || !inside(x - 1, y + 1) || !inside(x + 1, y + 1))
      )
    }
    const near = (x, y, r) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy)) return true
      return false
    }
    const art = PX.shade(N, N, (x, y) => {
      if (inside(x, y)) {
        if (isLine(x, y)) {
          if (sp.dots && (x + y) % 2) return sp.fill
          if (sp.ticks && (x - x0 + (y - y0) < 7 || x1 - x + (y1 - y) < 7)) return sp.ticks
          return sp.out
        }
        if (sp.inner && edge(x, y, ow + 2) && !edge(x, y, ow + 1)) return sp.inner
        if (sp.hi && !inside(x, y - ow - 1)) return sp.hi
        if (sp.lo) for (let r = 1; r <= (sp.loRows || 1); r++) if (!inside(x, y + ow + r)) return sp.lo
        return sp.fill
      }
      if (!press && sp.shadow && inside(x - sh.dx, y - sh.dy) && (!sh.dither || (x + y) % 2 === 0))
        return sh.color
      if (sp.glow) {
        if (near(x, y, 1)) return (x + y) % 2 === 0 ? sp.glow.color : null
        if (sp.glow.r >= 2 && near(x, y, 2)) return x % 2 === 0 && y % 2 === 0 ? sp.glow.color : null
      }
      return null
    })
    const c = PX.canvas(N * k, N * k)
    c.g.drawImage(art, 0, 0, N * k, N * k)
    return c.toDataURL()
  }

  /** A tiling ground texture for each style's screens (8×8 art pixels). */
  const TEX = {
    daybreak: (x, y) => ((x + y) % 8 === 0 && x % 4 === 0 ? '#dde7f3' : '#e9f0f8'),
    night: (x, y) => (x % 8 === 0 && y % 8 === 0 ? '#1a2148' : y % 4 === 0 ? '#0c1022' : '#0a0d1c'),
    pop: (x, y) => {
      const a = (x - 2) * (x - 2) + (y - 2) * (y - 2) < 2,
        b = (x - 6) * (x - 6) + (y - 6) * (y - 6) < 2
      return a || b ? '#ffe5b0' : '#fff4de'
    },
  }

  function injectFrames() {
    const k = Math.max(1, Math.round(2 * (window.devicePixelRatio || 1)))
    let css = ''
    for (const [style, F] of Object.entries(FRAME_SPECS)) {
      const url = (spec, press) => `url(${makeFrame(spec, k, press)})`
      const tex = PX.shade(8, 8, TEX[style])
      const sh = F.btn.shadow || { dy: 0 }
      css += `.ui-root[data-style="${style}"]{--fr-w:${S * 2}px;--fr-s:${S * k};--press:${sh.dy * 2 - 1}px;--lift:${sh.dy ? -1 : 0}px;`
      css += `--fr-panel:${url(F.panel)};--fr-dialog:${url(F.dialog)};--fr-btn:${url(F.btn)};--fr-btn-down:${url(F.btn, true)};--fr-primary:${url(F.primary)};--fr-primary-down:${url(F.primary, true)};--fr-off:${url(F.off)};`
      if (F.gold) css += `--fr-gold:${url(F.gold)};--fr-gold-down:${url(F.gold, true)};`
      css += `--tex:url(${tex.toDataURL()});--texw:8}\n`
    }
    const st = document.createElement('style')
    st.textContent = css
    document.head.appendChild(st)
  }

  // ================================================================== components (HTML)
  const typeColor = (style, t) => (style === 'current' ? TYPE_CUR : TYPE_MOD)[t] || '#999'
  const lum = (hex) => {
    const [r, g, b] = PX.rgba(hex)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  const hpVar = (p) => (p > 0.5 ? 'var(--hp-hi)' : p > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)')
  const typeBadge = (style, t) => `<span class="ui-type" style="--c:${typeColor(style, t)}">${t}</span>`
  // 0 is a blank face; some typed dice go up to 7 and 8.
  const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
    7: [0, 2, 3, 4, 5, 6, 8],
    8: [0, 1, 2, 3, 5, 6, 7, 8],
  }
  function die(style, type, value, o = {}) {
    const c =
      type === 'base' && style === 'pop' ? '#ffffff' : typeColor(style, type === 'base' ? 'base' : type)
    const pip =
      style === 'night'
        ? '#fff'
        : type === 'base' && style === 'current'
          ? '#554d6a'
          : lum(c) > 0.6
            ? style === 'current'
              ? '#2a2438'
              : '#24304f'
            : '#ffffff'
    const on = PIPS[value] || []
    const cells = Array.from({ length: 9 }, (_, i) => `<i class="${on.includes(i) ? 'on' : ''}"></i>`).join(
      '',
    )
    const st = o.status ? STATUS[o.status] : null
    const tag = st
      ? `<span class="tag"><img class="px" alt="" src="${iconURL(o.status, style, 2)}" /></span>`
      : ''
    const label = `${type === 'base' ? 'Base' : type[0].toUpperCase() + type.slice(1)} die showing ${value}${o.status ? ', ' + o.status + ' face' : ''}`
    return `<span class="die-wrap${o.sel ? ' sel' : ''}${o.combo ? ' combo' : ''}"><span class="ui-die${o.sel ? ' sel' : ''}${st ? ' st' : ''}" role="img" aria-label="${label}" style="--c:${c};--pip:${pip};${st ? `--stc:${st};` : ''}${o.size ? `--s:${o.size}px` : ''}">${cells}${tag}</span></span>`
  }
  function hp(pct, numbers, o = {}) {
    const num = numbers ? `<span class="num">${numbers}</span>` : ''
    return `<div class="ui-hp" ${o.id ? `data-hp="${o.id}"` : ''}><span class="lbl">HP</span><span class="track"><span class="trail" style="width:${pct * 100}%"></span><span class="fill" style="width:${pct * 100}%;--hp:${hpVar(pct)}"></span></span>${num}</div>`
  }
  const btn = (label, o = {}) =>
    `<button type="button" class="ui-btn${o.primary ? ' primary' : ''}${o.wide ? ' wide' : ''}" ${o.disabled ? 'disabled' : ''}><span>${o.icon || ''}${label}</span></button>`
  const ico = (name, style, scale = 3, size) =>
    `<img class="px" alt="" src="${iconURL(name, style, scale)}" ${size ? `style="width:${size}px;height:${size}px"` : ''} />`
  // Shared with the Home pages (pages.js): Daybreak dice, HP bars, type badges and status icons.
  window.PDUI = {
    die: (type, value, o) => die('daybreak', type, value, o),
    hp,
    typeBadge: (t) => typeBadge('daybreak', t),
    TYPE: TYPE_MOD,
    STATUS,
    statusIcon: (s, scale = 2) => iconURL(s, 'daybreak', scale),
  }
  const monIcon = (dex) =>
    `<span class="ico" style="background-position:-${(ICON_IDX[dex] ?? 0) * 40}px 0"></span>`

  function topBar(style) {
    const framed = style === 'daybreak' || style === 'night'
    return `<header class="ui-top"><span class="ui-logo">POKÉ<b>DICE</b></span><span class="sp"></span>
      <span class="ui-gold${framed ? ' framed' : ''}">${ico('coin', style, 2, 16)}₽ 1,240</span>
      <span class="ui-iconbtn" aria-label="Leaderboard">${ico('trophy', style, 2, 24)}</span>
      <span class="ui-avatar" aria-label="Your trainer menu">S</span></header>`
  }
  function nav(style, on) {
    const items = [
      ['potion', 'Shop'],
      ['up', 'Upgrades'],
      ['map', 'Map'],
      ['ball', 'Team'],
      ['dex', 'Pokédex'],
    ]
    return `<nav class="ui-nav" aria-label="Game menu">${items.map(([i, l]) => `<span class="${l === on ? 'on' : ''}">${ico(i, style, i === 'ball' ? 2 : 3)}${l}</span>`).join('')}</nav>`
  }

  function mapScreen(style) {
    const badges = [
      ['#9c9caf', 1],
      ['#547acc', 1],
      ['#e8c44a', 0],
      ['#4aa84a', 0],
      ['#d44873', 0],
      ['#e8b44a', 0],
      ['#ca6e29', 0],
      ['#5e2dd6', 0],
    ]
    return `<div class="ui-screen">${topBar(style)}<div class="ui-main">
      <h2 class="ui-h1">Kanto</h2>
      <div class="ui-panel ui-badges"><span>Badges <span class="ui-num">2/8</span></span><span class="slots">${badges.map(([c, g]) => `<i class="${g ? 'got' : ''}" style="--b:${c}"></i>`).join('')}</span></div>
      <p class="ui-sub">Areas 4–6 of 24 · your next stages</p>
      <article class="ui-panel ui-area">
        <div class="ui-banner"><canvas data-banner width="118" height="30"></canvas><span class="ui-types">${typeBadge(style, 'water')}${typeBadge(style, 'normal')}</span></div>
        <div class="ui-row"><h3 class="ui-grow">Route 24</h3><span class="ui-num">Lv.12–14</span></div>
        <div class="ui-row" style="margin:6px 0 10px"><span class="here">◀ you are here</span><span class="ui-sub ui-trunc">3/6 species caught</span></div>
        ${btn('Enter', { primary: true, wide: true })}
        <div class="ui-gauge" style="margin-top:10px"><span>ROUNDS</span><span class="segs"><i class="got"></i><i class="got"></i><i></i></span><span class="ui-num">2/3</span></div>
      </article>
      <article class="ui-panel ui-area locked"><div class="ui-row"><h3 class="ui-grow">Route 25</h3><span class="ui-num">Lv.13–16</span></div><p class="ui-sub" style="margin:6px 0 0">${ico('lock', style, 2, 16)} Clear Route 24</p></article>
      <article class="ui-panel ui-area locked"><div class="ui-row"><h3 class="ui-grow">Cerulean Gym</h3><span class="ui-num">Lv.18–21</span></div><p class="ui-sub" style="margin:6px 0 0">${ico('lock', style, 2, 16)} Misty waits at the end of Route 25</p></article>
    </div>${nav(style, 'Map')}</div>`
  }

  function battleScreen(style) {
    return `<div class="ui-screen">${topBar(style)}<div class="ui-main" style="gap:10px">
      <div class="ui-scene">
        <canvas data-scene width="240" height="140"></canvas>
        <div class="ui-plate foe"><div class="ui-row"><span class="name ui-trunc">Gengar</span><span class="lv">Lv.34</span><span class="ui-grow"></span><span class="pips" aria-label="Trainer has 2 of 3 Pokémon left"><i class="on"></i><i class="on"></i><i></i></span></div>
          <div class="ui-row pl2"><span class="ui-types">${typeBadge(style, 'ghost')}${typeBadge(style, 'poison')}</span>${hp(0.58, '')}</div></div>
        <div class="ui-plate own" aria-label="Charizard"><div class="ui-row"><span class="lv">Lv.36</span>${hp(0.78, '98/126')}</div></div>
      </div>
      <section class="ui-panel">
        <p class="ui-prompt">What will Charizard do?</p>
        <div class="ui-dice">${die(style, 'fire', 6, { combo: true })}${die(style, 'flying', 6, { combo: true })}${die(style, 'fire', 1, { status: 'burn' })}${die(style, 'base', 3, { sel: true })}</div>
        <div class="ui-combo"><span class="combo-chip">PAIR +3</span><span class="ui-row" style="gap:4px">${ico('sword', style, 2, 18)}<span class="ui-num">31</span></span><span class="ui-chip" style="--chip:#f07a2a">${ico('burn', style, 2, 14)} BURN 1/1</span></div>
        <div class="ui-btns" style="margin-top:12px">${btn('Reroll (2)', { icon: ico('reroll', style, 2, 20) })}${btn('Attack', { primary: true, icon: ico('sword', style, 2, 20) })}</div>
        <p class="ui-hint">Tap the dice you want to reroll</p>
      </section>
      <section class="ui-panel ui-hist">${ico('history', style, 2, 20)}<span class="ui-grow ui-trunc">Gengar used Shadow Ball</span><span class="ui-num">−12</span></section>
    </div></div>`
  }

  const TEAM = [
    { dex: 6, name: 'Charizard', lv: 36, types: ['fire', 'flying'], hp: [126, 126], dice: 4 },
    { dex: 25, name: 'Pikachu', lv: 32, types: ['electric'], hp: [71, 71], dice: 3 },
    { dex: 131, name: 'Lapras', lv: 30, types: ['water', 'ice'], hp: [140, 140], dice: 3 },
  ]
  // A team is three Pokémon at most (maxTeamSize); everyone else waits in the Box.
  function centerScreen(style) {
    return `<div class="ui-screen">${topBar(style)}<div class="ui-main">
      <h2 class="ui-h1">Pokémon Center</h2>
      <div class="ui-dialog">Your Pokémon are fighting fit! Tap one to check it, or swap it with the Box.</div>
      <ul class="ui-team">${TEAM.map((m) => `<li class="ui-panel ui-mon">${monIcon(m.dex)}<span class="ui-row"><span class="nm ui-trunc">${m.name}</span><span class="lv">Lv.${m.lv}</span></span><span class="ui-types">${m.types.map((t) => typeBadge(style, t)).join('')}</span>${hp(m.hp[0] / m.hp[1], `${m.hp[0]}/${m.hp[1]}`)}</li>`).join('')}</ul>
      ${btn('Box · 58 Pokémon', { wide: true })}
      ${btn('Continue', { primary: true, wide: true })}
    </div>${nav(style, 'Team')}</div>`
  }

  // ================================================================== live canvases
  const LIVE = new Set()
  const visible = new WeakMap()
  const io = new IntersectionObserver((es) => es.forEach((e) => visible.set(e.target, e.isIntersecting)), {
    rootMargin: '80px',
  })
  function live(cv, draw) {
    const item = { cv, draw }
    LIVE.add(item)
    io.observe(cv)
    draw(0)
    return item
  }
  let t0 = performance.now()
  function tick(now) {
    const t = (now - t0) / 1000
    for (const it of LIVE) {
      if (!it.cv.isConnected) {
        LIVE.delete(it)
        continue
      }
      if (visible.get(it.cv) && !REDUCED) it.draw(t)
    }
    requestAnimationFrame(tick)
  }

  function battleScene(cv, style) {
    const W = cv.width,
      H = cv.height
    const g = cv.getContext('2d')
    g.imageSmoothingEnabled = false
    return (t) => {
      const bg = SCN.background(style, W, H)
      const L = bg.layout
      g.clearRect(0, 0, W, H)
      g.drawImage(bg.cv, 0, 0)
      bg.dyn(g, t)
      PX.softEllipse(g, L.foe.x, L.foe.y, 20, 4, style === 'night' ? '#000000' : '#00000055', 0.35)
      PX.sprite(g, 'front-gengar', L.foe.x, L.foe.y, t * 1000)
      PX.sprite(g, 'back-charizard', L.own.x - (style === 'current' ? 22 : 0), L.own.y, t * 1000 + 300)
    }
  }
  function bannerScene(cv, style) {
    const g = cv.getContext('2d')
    g.imageSmoothingEnabled = false
    const b = SCN.banner(style, 118, 30)
    if (style === 'current') {
      cv.width = 118
      cv.height = 16
      cv.style.aspectRatio = '118 / 16'
      g.imageSmoothingEnabled = false
    }
    g.drawImage(b, 0, 0)
  }

  // ================================================================== styles tab
  /** The direction picked after review: Johto Daybreak with Jersey 20. Home, the battle HUD and the stage use it. */
  const CHOSEN = 'daybreak'
  let style = store.get('style', 'daybreak')
  if (!STYLE[style]) style = 'daybreak'
  let comparing = false
  const SCREENS = [
    ['map', 'Map', mapScreen],
    ['battle', 'Battle', battleScreen],
    ['center', 'Pokémon Center', centerScreen],
  ]

  function setRoot(el, s) {
    el.dataset.style = s
    if (s === 'current') el.removeAttribute('data-framed')
    else el.setAttribute('data-framed', '')
  }

  function renderScreens() {
    const s = comparing ? 'current' : style
    const host = $('#screens')
    host.innerHTML = SCREENS.map(
      ([id, label]) =>
        `<div class="phone" id="ph-${id}"><p class="phone-label"><span>${label.toUpperCase()}</span><span>${STYLE[s].short.toUpperCase()}</span></p><div class="bezel"><div class="ui-root" data-screen="${id}"></div></div></div>`,
    ).join('')
    SCREENS.forEach(([id, , make]) => {
      const root = $(`[data-screen="${id}"]`, host)
      setRoot(root, s)
      root.innerHTML = make(s)
    })
    $$('canvas[data-scene]', host).forEach((cv) => live(cv, battleScene(cv, s)))
    $$('canvas[data-banner]', host).forEach((cv) => bannerScene(cv, s))
    // Dice in the mock toggle like the game's: tap to mark for reroll.
    $$('.ui-dice .die-wrap', host).forEach((d) =>
      d.addEventListener('click', () => {
        d.classList.toggle('sel')
        d.firstElementChild.classList.toggle('sel')
      }),
    )
  }

  function renderIntro() {
    const st = STYLE[style]
    const i = STYLES.indexOf(st)
    $('#st-eyebrow').textContent = i === 0 ? 'THE CURRENT GAME · REFERENCE' : `PROPOSAL ${i} OF 3`
    $('#st-name').textContent = st.name
    $('#st-thesis').textContent = st.thesis
    $('#st-chips').innerHTML = st.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')
    $('#hold').hidden = style === 'current'
  }

  function renderSheet() {
    const st = STYLE[style]
    const s = style
    const comps = `<div class="ui-root comp-stage" data-style="${s}" ${s !== 'current' ? 'data-framed' : ''} style="background:var(--u-bg)">
      <div class="comp-row">${btn('Attack', { primary: true, icon: ico('sword', s, 2, 20) })}${btn('Reroll (2)', { icon: ico('reroll', s, 2, 20) })}${btn('Run', { disabled: true })}</div>
      <div class="comp-row">${TYPES.map((t) => typeBadge(s, t)).join('')}</div>
      <div style="display:grid;gap:8px;max-width:340px">${hp(0.82, '103/126')}${hp(0.4, '50/126')}${hp(0.12, '15/126')}</div>
      <div class="comp-row" style="gap:14px">${die(s, 'fire', 5)}${die(s, 'water', 4)}${die(s, 'grass', 3, { status: 'heal' })}${die(s, 'electric', 4, { status: 'paralyze' })}${die(s, 'psychic', 6, { sel: true })}${die(s, 'base', 2)}</div>
      <div class="ui-dialog" style="max-width:420px">Professor Oak: Two Heal faces in one roll heal you by the total of your dice.</div>
    </div>`
    const spec = `<div class="ui-root specimen" data-style="${s}" style="background:var(--u-bg);color:var(--u-text)">
      ${st.fonts.map(([role, name, fam]) => `<div class="spec-row"><span>${esc(role)}<br>${esc(name)}</span><span style="font-family:${fam},sans-serif;font-size:${role === 'Display' ? 'var(--u-h1)' : role === 'Body' ? 'var(--u-fs)' : 'var(--u-fs-btn)'};font-weight:${role === 'Display' ? 'var(--u-display-w, 400)' : 'inherit'};line-height:1.15">${role === 'Display' ? 'Cerulean Gym' : role === 'Body' ? 'A wild Eevee appeared! Throw the catch die: d6 + ball bonus against its catch value.' : '₽ 1,240 · Lv.36 · 98/126'}</span></div>`).join('')}
    </div>`
    $('#sheet').innerHTML = `
      <div class="card c-pal"><h3>Palette <small>${st.palette.length} tokens</small></h3><div class="swatches">${st.palette.map(([n, hex, role]) => `<div class="swatch"><b style="background:${hex}"></b><span>${esc(n)}<code>${hex}</code>${esc(role)}</span></div>`).join('')}</div></div>
      <div class="card c-type"><h3>Type <small>${st.fonts
        .map((f) => f[1].split(' ·')[0])
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(' · ')}</small></h3>${spec}</div>
      <div class="card c-comp"><h3>Components <small>buttons press, dice toggle</small></h3>${comps}</div>
      <div class="card c-rules"><h3>Rules</h3><ul class="rules">${st.rules.map(([k, v]) => `<li><b>${esc(k.toUpperCase())}</b><span>${esc(v)}</span></li>`).join('')}</ul><p class="build">${st.build}</p></div>`
    $$('#sheet .die-wrap').forEach((d) =>
      d.addEventListener('click', () => {
        d.classList.toggle('sel')
        d.firstElementChild.classList.toggle('sel')
      }),
    )
  }

  function renderSwitch() {
    $('#switch').innerHTML = STYLES.map(
      (s) =>
        `<button type="button" class="opt" role="radio" aria-checked="${s.id === style}" data-style="${s.id}"><span class="sw">${s.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${esc(s.name)}${s.id === 'current' ? ' <span style="opacity:.6">(now)</span>' : ''}</button>`,
    ).join('')
    $$('#switch .opt').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)))
    $('#switch').addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const i = STYLES.findIndex((s) => s.id === style)
      const n = STYLES[(i + (e.key === 'ArrowRight' ? 1 : STYLES.length - 1)) % STYLES.length].id
      setStyle(n)
      $(`#switch [data-style="${n}"]`).focus()
    })
  }

  function setStyle(s) {
    style = s
    store.set('style', s)
    $$('#switch .opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === s)))
    renderIntro()
    renderScreens()
    renderSheet()
    renderMoodHeaders()
  }

  function setCompare(on) {
    if (style === 'current' || comparing === on) return
    comparing = on
    $('#hold').setAttribute('aria-pressed', String(on))
    renderScreens()
  }

  // ================================================================== animations tab
  const ANIMS = [
    ['center', 'Pokémon Center', '#ff8fa3'],
    ['catch', 'Catch', '#ec3b33'],
    ['attack', 'Typed attacks', '#ffb23a'],
    ['legend', 'Legendary', '#c26bf0'],
    ['evolve', 'Evolution', '#7fd6d0'],
    ['hatch', 'Egg hatching', '#9be3a0'],
    ['mega', 'Mega Evolution', '#c26bf0'],
    ['gmax', 'Gigantamax', '#e0245e'],
  ]
  const OPT = {
    anim: 'attack',
    ball: 'great',
    outcome: 'caught',
    type: 'fire',
    legend: 'mewtwo',
    evo: 'charmeleon',
    baby: 'dratini',
    mega: 'charizardx',
    gmax: 'pikachu',
  }
  let player = null

  const HUD = {
    root: null,
    foe: null,
    own: null,
    msgEl: null,
    dice: null,
    team: null,
    timer: 0,
    build() {
      const stage = $('#stage')
      stage.insertAdjacentHTML(
        'beforeend',
        `<div class="ui-plate foe" id="h-foe"></div><div class="ui-plate own" id="h-own"></div>`,
      )
      $('#stage-foot').innerHTML =
        `<div class="ui-dialog" aria-live="polite"><span class="msg" id="h-msg"></span><span class="caret" aria-hidden="true"></span></div><div class="dice-line" id="h-dice"></div><div class="team-line" id="h-team" hidden></div>`
      this.foe = $('#h-foe')
      this.own = $('#h-own')
      this.msgEl = $('#h-msg')
      this.dice = $('#h-dice')
      this.team = $('#h-team')
    },
    reset(cfg) {
      const s = CHOSEN
      clearInterval(this.timer)
      this.cfg = cfg
      if (cfg.bare) {
        // A moment outside battle (evolution, hatching): the dialogue alone.
        this.foe.hidden = this.own.hidden = this.team.hidden = this.dice.hidden = true
      } else if (cfg.team) {
        this.foe.hidden = this.own.hidden = true
        this.dice.hidden = true
        this.team.hidden = false
        this.team.innerHTML = this.teamRows(false)
      } else {
        this.foe.hidden = this.own.hidden = false
        this.team.hidden = true
        const f = cfg.foe,
          o = cfg.own
        this.foe.innerHTML = `<div class="ui-row"><span class="name ui-trunc">${f.name}</span><span class="lv">Lv.${f.lv}</span><span class="ui-grow"></span><span class="st-chip"></span></div><div class="ui-row pl2"><span class="ui-types">${f.types.map((t) => typeBadge(s, t)).join('')}</span>${hp(f.hp, '', { id: 'foe' })}</div>`
        const cur = Math.round(o.hp * o.max)
        // Your own box: no name (the prompt and the dialogue already say it), just level, HP and status.
        this.own.setAttribute('aria-label', o.name)
        this.own.innerHTML = `<div class="ui-row"><span class="lv">Lv.${o.lv}</span>${hp(o.hp, `${cur}/${o.max}`, { id: 'own' })}<span class="st-chip"></span></div>`
        this.foe.classList.toggle('gone', f.show === false)
        this.own.classList.toggle('gone', o.show === false)
      }
      this.say(cfg.msg || '', true)
    },
    teamRows(healed) {
      const hurt = [[34, 'BRN'], [0, 'FNT'], [88]]
      return TEAM.map((m, i) => {
        const [cur, st] = healed ? [m.hp[1]] : hurt[i]
        const p = cur / m.hp[1]
        const chip = st ? `<span class="ui-chip" style="--chip:${STATUS_CODE[st][1]}">${st}</span>` : ''
        return `<div class="ui-panel ui-mon" data-i="${i}">${monIcon(m.dex)}<span class="ui-row"><span class="nm ui-trunc">${m.name}</span>${chip}</span>${hp(p, `${cur}/${m.hp[1]}`, { id: 't' + i })}</div>`
      }).join('')
    },
    say(msg, instant) {
      clearInterval(this.timer)
      if (instant || REDUCED) {
        this.msgEl.textContent = msg
        return
      }
      let i = 0
      this.msgEl.textContent = ''
      const sp = Math.max(8, 22 / (player ? player.speed : 1))
      this.timer = setInterval(() => {
        i += 1
        this.msgEl.textContent = msg.slice(0, i)
        if (i >= msg.length) clearInterval(this.timer)
      }, sp)
    },
    setHp(el, p, numbers) {
      const fill = $('.fill', el),
        trail = $('.trail', el)
      const k = player ? 1 / player.speed : 1
      fill.style.transitionDuration = `${700 * k}ms, ${300 * k}ms`
      trail.style.transitionDuration = `${900 * k}ms`
      trail.style.transitionDelay = `${280 * k}ms`
      fill.style.width = `${p * 100}%`
      trail.style.width = `${p * 100}%`
      fill.style.setProperty('--hp', hpVar(p))
      if (numbers != null && $('.num', el)) $('.num', el).textContent = numbers
    },
    hp(side, p) {
      this.setHp($(`[data-hp="${side}"]`, this[side]), p)
    },
    status(side, code) {
      const [, color] = STATUS_CODE[code]
      $('.st-chip', this[side]).innerHTML = `<span class="ui-chip" style="--chip:${color}">${code}</span>`
    },
    show(side, on) {
      this[side].classList.toggle('gone', !on)
    },
    /** A battle form on the plate: MEGA until the battle ends, G-MAX for a turn. */
    form(side, label, color) {
      $('.st-chip', this[side]).innerHTML =
        `<span class="ui-chip" style="--chip:${color}">${esc(label)}</span>`
    },
    /** Build the roll for this animation; its look at any moment comes from tick(t). */
    setRoll(spec) {
      this.spec = spec
      this.rd = null
      this.lastFaces = []
      const box = this.dice
      box.innerHTML = ''
      box.hidden = !spec
      if (!spec) return
      const s = CHOSEN
      const tokens =
        spec.kind === 'attack'
          ? [
              [spec.sum, 'dice'],
              ['+' + spec.combo.bonus, spec.combo.name],
              ['×' + spec.mult, spec.mult > 1 ? 'super effective' : 'type'],
              ['= ' + spec.dmg, 'damage'],
            ]
          : [
              [spec.dice[0][1], 'catch die'],
              ['+' + spec.bonus, spec.ball],
              ['= ' + (spec.dice[0][1] + spec.bonus), `needs ${spec.need}`],
            ]
      const cap =
        spec.kind === 'attack'
          ? 'Damage = (dice + combo) × type'
          : `Catch: d6 + ball bonus against a catch value of ${spec.need}`
      const dice = spec.dice
        .map(
          ([type, v, st], i) =>
            `<span class="rd" data-i="${i}">${die(s, type, v, { status: st, size: 48 })}<span class="rd-st" style="color:${st ? STATUS[st] : 'inherit'}">${st ? st : ''}</span></span>`,
        )
        .join('')
      box.innerHTML = `<div class="roll"><div class="tray">${dice}${spec.combo ? `<span class="bracket"><b>${spec.combo.name} +${spec.combo.bonus}</b></span>` : ''}</div><div class="math">${tokens.map(([v, l], k) => `<span class="tok${k === tokens.length - 1 ? ' total' : ''}"><b>${esc(v)}</b><i>${esc(l)}</i></span>`).join('')}</div><div class="cap">${esc(cap)}</div><div class="extra"></div></div>`
      this.rd = $$('.rd', box)
      this.cells = this.rd.map((r) => $$('.ui-die i', r))
      this.tags = this.rd.map((r) => $('.tag', r))
      this.sts = this.rd.map((r) => $('.rd-st', r))
      this.toks = $$('.tok', box)
      this.bracket = $('.bracket', box)
      this.tray = $('.tray', box)
      this.tick(player ? player.t : 0)
    },
    /**
     * The roll as a function of time: dice drop in and hop three times while their faces flicker (slowing down),
     * land one after another with a squash, then the combo dice lift and ring, the rest step back, a bracket names
     * the combo and the math counts up to the damage.
     */
    tick(t) {
      const sp = this.spec
      if (!sp || !this.rd) return
      const lt = t - sp.t0
      const n = sp.dice.length
      const land = (i) => 0.38 + i * 0.1
      const RES = land(n - 1) + 0.16
      const verdict = sp.kind === 'catch' ? lt >= sp.verdictAt - sp.t0 : false
      const lifted = sp.kind === 'attack' ? sp.combo.idx : verdict && sp.success ? [0] : []
      const busted = sp.kind === 'catch' && verdict && !sp.success
      this.rd.forEach((el, i) => {
        const [, v] = sp.dice[i]
        if (lt < 0) {
          el.style.visibility = 'hidden'
          return
        }
        el.style.visibility = 'visible'
        let y = 0,
          rot = 0,
          sx = 1,
          sy = 1,
          face = v,
          pop = false,
          dim = false
        const L = land(i)
        if (lt < L) {
          const k = lt / L
          const drop = lt < 0.1 ? (1 - lt / 0.1) * -40 : 0
          y = drop - Math.abs(Math.sin(k * Math.PI * 3)) * (18 * (1 - k) + 3)
          rot = (Math.floor(lt * 16 + i * 2) % 2 ? 1 : -1) * Math.round(12 * (1 - k))
          face = 1 + ((Math.floor(lt * (26 - 16 * k)) * 7 + i * 3 + 5) % 6)
          if (face === v && k > 0.6) face = (v % 6) + 1
        } else {
          const p = lt - L
          if (p < 0.12) {
            const q = 1 - p / 0.12
            sx = 1 + 0.22 * q
            sy = 1 - 0.24 * q
          }
          if (lt >= RES && sp.kind === 'attack') {
            if (lifted.includes(i)) pop = true
            else if (!sp.dice[i][2]) dim = true
          }
          if (verdict && lifted.includes(i)) pop = true
          if (pop) {
            // A bounce that grows and settles back to 1×: the lift, the ring and the sparkles stay, and at rest
            // the die is unscaled so its pips stay on whole pixels.
            const k = Math.min(1, (lt - (verdict ? sp.verdictAt - sp.t0 : RES)) / 0.3)
            y = -12 * PX.ease.outBack(k, 2.6)
            sx = sy = 1 + 0.25 * Math.sin(Math.PI * k)
          }
          if (busted && lt - (sp.verdictAt - sp.t0) < 0.3) rot = Math.floor(lt * 40) % 2 ? 8 : -8
        }
        const wrap = el.firstElementChild
        wrap.style.transform = `translateY(${Math.round(y)}px) rotate(${rot}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
        el.classList.toggle('pop', pop)
        el.classList.toggle('dim', dim)
        el.classList.toggle('bust', busted)
        el.classList.toggle('stat', !!sp.dice[i][2] && lt >= RES && !pop)
        if (sp.dice[i][2]) el.style.setProperty('--stc', STATUS[sp.dice[i][2]])
        if (face !== this.lastFaces[i]) {
          const on = PIPS[face] || []
          this.cells[i].forEach((c, k) => c.classList.toggle('on', on.includes(k)))
          this.lastFaces[i] = face
        }
        const shown = lt >= L
        if (this.tags[i]) this.tags[i].style.visibility = shown ? 'visible' : 'hidden'
        if (this.sts[i]) {
          const q = PX.clamp((lt - RES) / 0.18)
          this.sts[i].style.opacity = q > 0 ? 1 : 0
          this.sts[i].style.transform = `scale(${(1 + 0.6 * (1 - PX.ease.outBack(q, 2))).toFixed(3)})`
        }
      })
      if (this.bracket) {
        const q = PX.clamp((lt - RES - 0.06) / 0.2)
        const box = this.tray.getBoundingClientRect()
        const xs = sp.combo.idx.map((i) => this.rd[i].getBoundingClientRect())
        const left = Math.min(...xs.map((r) => r.left)) - box.left
        const right = Math.max(...xs.map((r) => r.right)) - box.left
        Object.assign(this.bracket.style, {
          left: `${Math.round(left)}px`,
          width: `${Math.round(right - left)}px`,
          opacity: q > 0 ? 1 : 0,
          transform: `scaleX(${PX.ease.outBack(q, 2).toFixed(3)})`,
        })
      }
      this.toks.forEach((tk, k) => {
        const at = RES + 0.12 + k * 0.11
        const q = PX.clamp((lt - at) / 0.18)
        tk.style.opacity = q > 0 ? 1 : 0
        tk.style.transform = `scale(${(1 + 0.55 * (1 - PX.ease.outQ(q))).toFixed(3)})`
      })
      const total = this.toks[this.toks.length - 1]
      total.classList.toggle('ok', sp.kind === 'catch' && verdict && sp.success)
      total.classList.toggle('ko', busted)
    },
    chip(text) {
      this.dice.hidden = false
      const host = $('.roll .extra', this.dice) || this.dice
      host.innerHTML = `<span class="ui-chip">${esc(text)}</span>`
    },
    heal() {
      $$('.ui-mon', this.team).forEach((row, i) => {
        setTimeout(
          () => {
            const m = TEAM[i]
            this.setHp($('.ui-hp', row), 1, `${m.hp[1]}/${m.hp[1]}`)
            const chip = $('.ui-chip', row)
            if (chip) chip.remove()
          },
          (i * 90) / (player ? player.speed : 1),
        )
      })
    },
  }

  function animDef() {
    const M = ANIM.MAKE
    if (OPT.anim === 'attack') return M[OPT.type]()
    if (OPT.anim === 'catch') return M.catch({ ball: OPT.ball, outcome: OPT.outcome })
    if (OPT.anim === 'legend') return M.legend({ legend: OPT.legend })
    if (OPT.anim === 'evolve') return M.evolve({ evo: OPT.evo })
    if (OPT.anim === 'hatch') return M.hatch({ baby: OPT.baby })
    if (OPT.anim === 'mega') return M.mega({ mega: OPT.mega })
    if (OPT.anim === 'gmax') return M.gmax({ gmax: OPT.gmax })
    return M.center()
  }

  function renderAnimOpts() {
    const opts = $('#anim-opts')
    const seg = (key, label, items) =>
      `<div><label class="l">${label}</label><span class="seg small" role="radiogroup" aria-label="${label}">${items.map(([v, l, c]) => `<button type="button" role="radio" aria-checked="${OPT[key] === v}" data-k="${key}" data-v="${v}">${c ? `<span class="dot" style="background:${c}"></span>` : ''}${l}</button>`).join('')}</span></div>`
    if (OPT.anim === 'attack')
      opts.innerHTML = seg('type', 'TYPE', [
        ['water', 'Water', TYPE_MOD.water],
        ['grass', 'Grass', TYPE_MOD.grass],
        ['fire', 'Fire', TYPE_MOD.fire],
        ['electric', 'Electric', TYPE_MOD.electric],
        ['psychic', 'Psychic', TYPE_MOD.psychic],
      ])
    else if (OPT.anim === 'catch')
      opts.innerHTML =
        seg('ball', 'BALL', [
          ['poke', 'Poké Ball +1', '#ec3b33'],
          ['great', 'Great Ball +2', '#3474e0'],
          ['ultra', 'Ultra Ball +3', '#2d2d3a'],
          ['master', 'Master Ball +10', '#7d3fc4'],
        ]) +
        seg('outcome', 'OUTCOME', [
          ['caught', 'Caught'],
          ['fail', 'Breaks free'],
        ])
    else if (OPT.anim === 'legend')
      opts.innerHTML = seg('legend', 'LEGENDARY', [
        ['mewtwo', 'Mewtwo', '#c26bf0'],
        ['articuno', 'Articuno', '#5fc0e0'],
        ['zapdos', 'Zapdos', '#ffd23a'],
        ['moltres', 'Moltres', '#ff8a1e'],
      ])
    else if (OPT.anim === 'evolve')
      opts.innerHTML = seg('evo', 'EVOLUTION', [
        ['charmeleon', 'Charmeleon → Charizard · Lv.36', '#ff8a3d'],
        ['eevee', 'Eevee → Jolteon · Thunder Stone', '#ffd23a'],
      ])
    else if (OPT.anim === 'hatch')
      opts.innerHTML = seg('baby', 'HATCHES INTO', [
        ['dratini', 'Dratini', '#6f8cff'],
        ['eevee', 'Eevee', '#c8945a'],
      ])
    else if (OPT.anim === 'mega')
      opts.innerHTML = seg('mega', 'MEGA EVOLUTION', [
        ['charizardx', 'Charizard → Mega Charizard X · +1 Dragon die', '#3ab0ff'],
        ['charizardy', 'Charizard → Mega Charizard Y · +1 Fire die', '#ff8a3d'],
      ])
    else if (OPT.anim === 'gmax')
      opts.innerHTML = seg('gmax', 'GIGANTAMAX', [
        ['pikachu', 'Pikachu · +1 Electric die', '#ffd23a'],
        ['lapras', 'Lapras · +1 Water die', '#4aa8ff'],
      ])
    else
      opts.innerHTML = `<p class="note" style="margin:0">Three balls (a team is three at most), the jingle on six beats, the team list refilling under the stage.</p>`
    if (OPT.anim === 'catch' && OPT.ball === 'master')
      $$('[data-k="outcome"]', opts).forEach((b) => {
        b.disabled = b.dataset.v === 'fail'
        if (b.disabled) b.title = 'A Master Ball always catches (+10).'
      })
    $$('button[data-k]', opts).forEach((b) =>
      b.addEventListener('click', () => {
        if (b.disabled) return
        OPT[b.dataset.k] = b.dataset.v
        if (b.dataset.k === 'ball' && b.dataset.v === 'master') OPT.outcome = 'caught'
        renderAnimOpts()
        loadAnim(true)
      }),
    )
  }

  function renderPicker() {
    $('#anim-pick').innerHTML = ANIMS.map(
      ([id, l, c]) =>
        `<button type="button" role="radio" aria-checked="${OPT.anim === id}" data-a="${id}"><span class="dot" style="background:${c}"></span>${l}</button>`,
    ).join('')
    $$('#anim-pick button').forEach((b) =>
      b.addEventListener('click', () => {
        OPT.anim = b.dataset.a
        renderPicker()
        renderAnimOpts()
        loadAnim(true)
      }),
    )
  }

  const RULES_ANIM = `<div class="rules-anim"><b>House rules for every effect:</b> anticipation before release · 3–5 frame hit-stop on contact · two white silhouette frames on a hit, never an opacity blink · light and smoke are dithered, never blurred · particles step through a fixed colour ramp · no screen flash faster than 3 a second.</div>`
  function renderBeats() {
    const d = player.def
    const name =
      OPT.anim === 'attack'
        ? `${ANIM.ATTACKS[OPT.type].move}`
        : OPT.anim === 'legend'
          ? `Legendary: ${ANIM.LEGENDS[OPT.legend].name}`
          : OPT.anim === 'catch'
            ? `Catch with a ${SCN.BALLS[OPT.ball].name}`
            : OPT.anim === 'evolve'
              ? `Evolution: ${ANIM.EVOS[OPT.evo].fromName} → ${ANIM.EVOS[OPT.evo].toName}`
              : OPT.anim === 'hatch'
                ? `Egg hatching: ${ANIM.BABIES[OPT.baby].name}`
                : OPT.anim === 'mega'
                  ? `Mega Evolution: ${ANIM.MEGAS[OPT.mega].mega}`
                  : OPT.anim === 'gmax'
                    ? `Gigantamax: ${ANIM.GMAXES[OPT.gmax].name}`
                    : 'Pokémon Center'
    $('#beats').innerHTML =
      `<h3>${esc(name)}</h3><p class="sub">${d.dur.toFixed(1)} s · ${Math.round(d.dur * 60)} frames. Click a beat to jump to it.</p><ol>${d.beats.map(([t, l, txt], i) => `<li data-i="${i}" data-t="${t}" tabindex="0"><span class="ts">${t.toFixed(2)}s</span><span><b>${esc(l)}</b><span>${esc(txt)}</span></span></li>`).join('')}</ol>${RULES_ANIM}`
    $$('#beats li').forEach((li) => {
      const go = () => seek(Number(li.dataset.t) + 0.001)
      li.addEventListener('click', go)
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go()
        }
      })
    })
    $('#scrub').innerHTML =
      '<i></i>' + d.beats.map(([t]) => `<b style="left:${(t / d.dur) * 100}%"></b>`).join('')
  }

  function seek(t) {
    const was = player.playing
    player.pause()
    player.reset()
    player.advance(t)
    player.render()
    if (was) player.play()
    syncPlay()
  }

  function onTick(t) {
    const d = player.def
    $('#t-time').textContent = `${t.toFixed(2)} s · f${Math.round(t * 60)}`
    $('#scrub i').style.width = `${Math.min(100, (t / d.dur) * 100)}%`
    let cur = -1
    d.beats.forEach(([bt], i) => {
      if (t >= bt) cur = i
    })
    $$('#beats li').forEach((li, i) => {
      li.classList.toggle('on', i === cur)
      li.classList.toggle('done', i < cur)
    })
  }
  function syncPlay() {
    const b = $('#t-play')
    b.textContent = player.playing ? 'Pause' : 'Play'
    b.setAttribute('aria-pressed', String(player.playing))
  }

  function loadAnim(autoplay) {
    if (!player) return
    player.pause()
    player.load(animDef(), { style: CHOSEN })
    renderBeats()
    onTick(0)
    if (autoplay && !REDUCED) player.play()
    syncPlay()
  }

  function initAnims() {
    setRoot($('#stage-root'), CHOSEN)
    HUD.build()
    player = new ANIM.Player($('#stage-cv'), HUD)
    player.onTick = onTick
    player.onEnd = syncPlay
    renderPicker()
    renderAnimOpts()
    $('#t-speed').innerHTML = [
      [1, '1×'],
      [0.5, '½×'],
      [0.25, '¼×'],
    ]
      .map(
        ([v, l]) =>
          `<button type="button" role="radio" aria-checked="${v === 1}" data-s="${v}">${l}</button>`,
      )
      .join('')
    $$('#t-speed button').forEach((b) =>
      b.addEventListener('click', () => {
        player.speed = Number(b.dataset.s)
        $$('#t-speed button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
      }),
    )
    $('#t-replay').addEventListener('click', () => {
      player.reset()
      player.play()
      syncPlay()
    })
    $('#t-play').addEventListener('click', () => {
      if (player.playing) player.pause()
      else player.play()
      syncPlay()
    })
    $('#t-step').addEventListener('click', () => {
      player.stepFrame()
      syncPlay()
    })
    $('#t-loop').addEventListener('click', (e) => {
      player.loop = !player.loop
      e.currentTarget.setAttribute('aria-pressed', String(player.loop))
      if (player.loop && !player.playing) player.play()
      syncPlay()
    })
    $('#t-sound').addEventListener('click', (e) => {
      PX.Sound.on = !PX.Sound.on
      if (PX.Sound.on) PX.Sound.ensure()
      e.currentTarget.setAttribute('aria-pressed', String(PX.Sound.on))
      e.currentTarget.textContent = PX.Sound.on ? 'Sound on' : 'Sound off'
    })
    $('#scrub').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect()
      seek(((e.clientX - r.left) / r.width) * player.def.dur)
    })
    loadAnim(false)
  }

  // ================================================================== moodboards
  /** Tile painters: each returns a function (t) => void drawing into its canvas, or draws once. */
  const TILE = {
    scene(cv, { style: s, foe, own, foeX = 0 }) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      return (t) => {
        const bg = SCN.background(s, cv.width, cv.height)
        const L = bg.layout
        g.drawImage(bg.cv, 0, 0)
        bg.dyn(g, t)
        if (foe) PX.sprite(g, foe, L.foe.x + foeX, L.foe.y, t * 1000)
        if (own) PX.sprite(g, own, L.own.x, L.own.y, t * 1000 + 200)
      }
    },
    dither(cv) {
      // Left: banded steps. Right: the same five colours, ordered-dithered.
      const cols = SCN.LOOK.daybreak.sky
      const W = cv.width,
        H = cv.height
      const c = PX.shade(W, H, (x, y) => {
        const tt = (y / (H - 1)) * (cols.length - 1)
        const i = Math.floor(tt)
        if (x < W / 2 - 1) return cols[Math.min(cols.length - 1, Math.round(tt))]
        if (x < W / 2 + 1) return '#24304f'
        return tt - i > PX.bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)] : cols[i]
      })
      cv.getContext('2d').drawImage(c, 0, 0)
      label(cv, 'BANDED', 4, 4, '#24304f')
      label(cv, 'DITHERED', W / 2 + 4, 4, '#24304f')
    },
    ramps(cv) {
      // A sphere lit from the top left with a straight ramp, then with a hue-shifted one (Slynyrd).
      const straight = ['#1f5130', '#2d7344', '#3f9a5b', '#5cbd75', '#86d897', '#bdeec4']
      const shifted = ['#1b3b4f', '#1f6a52', '#3f9a4b', '#7cc04a', '#c3df5c', '#f4f3a8']
      const W = cv.width,
        H = cv.height
      const sphere = (cx, cy, r, ramp) => (x, y) => {
        const dx = x - cx,
          dy = y - cy
        if (dx * dx + dy * dy > r * r) return null
        const nz = Math.sqrt(Math.max(0, r * r - dx * dx - dy * dy)) / r
        const l = PX.clamp(((-dx * 0.55 - dy * 0.65) / r) * 0.7 + nz * 0.6)
        return ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))]
      }
      const a = sphere(W * 0.25, H * 0.48, H * 0.3, straight),
        b = sphere(W * 0.75, H * 0.48, H * 0.3, shifted)
      const c = PX.shade(W, H, (x, y) => {
        if (y > H - 12) {
          const ramp = x < W / 2 ? straight : shifted
          const i = Math.floor(((x % (W / 2)) / (W / 2)) * ramp.length)
          return x % (W / 2) < 3 || x % (W / 2) > W / 2 - 4 ? null : ramp[i]
        }
        return a(x, y) || b(x, y)
      })
      cv.getContext('2d').drawImage(c, 0, 0)
      label(cv, 'STRAIGHT', 4, 4, '#aaa3bf')
      label(cv, 'SHIFTED', W / 2 + 4, 4, '#aaa3bf')
    },
    frameZoom(cv, { style: s }) {
      const F = FRAME_SPECS[s]
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const im = new Image()
      const im2 = new Image()
      im.onload = () => g.drawImage(im, 4, 2)
      im2.onload = () => g.drawImage(im2, cv.width / 2 + 4, 2)
      im.src = makeFrame(F.panel, 6)
      im2.src = makeFrame(F.primary, 6)
      label(cv, 'PANEL 9-SLICE', 4, cv.height - 9, '#aaa3bf')
      label(cv, 'PRIMARY', cv.width / 2 + 4, cv.height - 9, '#aaa3bf')
    },
    led(cv) {
      const g = cv.getContext('2d')
      const W = cv.width,
        H = cv.height
      PX.rect(g, 0, 0, W, H, '#0a0d1c')
      const bars = [
        [0.85, '#3ef0a0'],
        [0.45, '#ffd23a'],
        [0.15, '#ff3d6e'],
      ]
      bars.forEach(([p, c], i) => {
        const y = 10 + i * 16,
          w = W - 24
        PX.rect(g, 11, y - 1, w + 2, 8, '#2a3366')
        PX.rect(g, 12, y, w, 6, '#070914')
        for (let x = 0; x < w * p - 3; x += 6) {
          PX.rect(g, 13 + x, y + 1, 4, 4, c)
          PX.rect(g, 13 + x, y + 1, 4, 1, PX.mix(c, '#ffffff', 0.5))
        }
      })
      label(cv, 'HP 103/126', 12, H - 10, '#e9ecff')
    },
    rim(cv) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      return (t) => {
        PX.rect(g, 0, 0, W, H, '#0a0d1c')
        g.drawImage(PX.glow(30, '#1d2a66', 1.2, 0.9), W * 0.75 - 30, H * 0.55 - 30)
        PX.sprite(g, 'front-mewtwo', W * 0.27, H - 6, t * 1000)
        // Rim: the silhouette offset 1 px toward the light, drawn behind.
        PX.sprite(g, 'front-mewtwo', W * 0.73 + 1, H - 6, t * 1000, { sil: '#3ef0ff' })
        PX.sprite(g, 'front-mewtwo', W * 0.73, H - 6, t * 1000)
        label(cv, 'FLAT', 4, 4, '#9aa3d6')
        label(cv, 'RIM LIGHT', W / 2 + 4, 4, '#9aa3d6')
      }
    },
    glowCmp(cv) {
      const g = cv.getContext('2d')
      const W = cv.width,
        H = cv.height
      PX.rect(g, 0, 0, W, H, '#0a0d1c')
      // Left: a blurred glow (what not to do). Right: the dithered one.
      const grd = g.createRadialGradient(W * 0.25, H / 2, 1, W * 0.25, H / 2, 22)
      grd.addColorStop(0, '#ff2e6e')
      grd.addColorStop(1, '#ff2e6e00')
      g.fillStyle = grd
      g.fillRect(0, 0, W / 2, H)
      g.drawImage(PX.glow(22, '#ff2e6e', 1.4), W * 0.75 - 22, H / 2 - 22)
      PX.rect(g, W * 0.25 - 3, H / 2 - 3, 6, 6, '#ffd0e0')
      PX.rect(g, W * 0.75 - 3, H / 2 - 3, 6, 6, '#ffd0e0')
      label(cv, 'BLUR', 4, 4, '#9aa3d6')
      label(cv, 'DITHER', W / 2 + 4, 4, '#9aa3d6')
    },
    halftone(cv) {
      const W = cv.width,
        H = cv.height
      const bg = SCN.background('pop', W, H)
      cv.getContext('2d').drawImage(bg.cv, 0, 0)
    },
    stickerBtn(cv) {
      const F = FRAME_SPECS.pop
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      PX.rect(g, 0, 0, cv.width, cv.height, '#fff4de')
      const a = new Image(),
        b = new Image()
      a.onload = () => g.drawImage(a, 8, 8)
      b.onload = () => g.drawImage(b, cv.width / 2 + 8, 8)
      a.src = makeFrame(F.primary, 5)
      b.src = makeFrame(F.primary, 5, true)
      label(cv, 'REST', 8, cv.height - 9, '#1a1423')
      label(cv, 'PRESSED', cv.width / 2 + 8, cv.height - 9, '#1a1423')
    },
    timing(cv) {
      // A hit read as frames: anticipation, release, 5-frame hit-stop, shake, recovery.
      const g = cv.getContext('2d')
      const W = cv.width,
        H = cv.height
      PX.rect(g, 0, 0, W, H, '#14111b')
      const segs = [
        ['WIND-UP', 27, '#5b64a8'],
        ['RELEASE', 26, '#ffb23a'],
        ['STOP', 5, '#ffffff'],
        ['SHAKE', 27, '#ff7a1e'],
        ['SETTLE', 40, '#3a3450'],
      ]
      const total = segs.reduce((a, s) => a + s[1], 0)
      let x = 6
      const w = W - 12
      segs.forEach(([l, f, c], i) => {
        const sw = Math.max(3, Math.round((f / total) * w))
        PX.rect(g, x, 22, sw - 1, 14, c)
        // Names alternate above and below the bar; the frame count sits inside it.
        PX.text(g, l, x, i % 2 ? 42 : 10, i === 2 ? '#ffffff' : '#cfc8df')
        PX.text(g, String(f), x + 2, 26, '#14111b')
        x += sw
      })
      for (let f = 0; f <= total; f += 5)
        PX.rect(g, 6 + Math.round((f / total) * w), 37, 1, f % 30 === 0 ? 3 : 1, '#5a5070')
    },
    smear(cv) {
      // Five frames of a ball throw: the in-between frames are stretched along the motion, not blurred.
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      PX.rect(g, 0, 0, W, H, '#14111b')
      const pts = [
        [14, 52],
        [46, 26],
        [86, 14],
        [126, 22],
        [160, 40],
      ]
      pts.forEach(([x, y], i) => {
        if (i > 0 && i < 4) {
          const [px0, py0] = pts[i - 1]
          for (let k = 1; k <= 3; k++) {
            const q = k / 4
            PX.disc(g, PX.lerp(px0, x, q), PX.lerp(py0, y, q), 3, k === 3 ? '#ffb3a8' : '#5a3a48')
          }
        }
        const im = SCN.ball('poke', -i * 0.9)
        g.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height / 2))
        PX.text(g, 'F' + (i + 1), x - 5, H - 10, '#8a8396')
      })
    },
    fireRamp(cv) {
      const g = cv.getContext('2d')
      const W = cv.width,
        H = cv.height
      PX.rect(g, 0, 0, W, H, '#14111b')
      const R = ['#ffffff', '#fff6b8', '#ffe066', '#ffb23a', '#ff7a1e', '#e8481c', '#b02a1a', '#5a3030']
      const sw = Math.floor((W - 12) / R.length)
      R.forEach((c, i) => {
        PX.rect(g, 6 + i * sw, 10, sw - 2, 16, c)
        PX.disc(g, 6 + i * sw + sw / 2 - 1, 42, Math.max(1, 4 - Math.floor(i / 2)), c)
      })
      PX.text(g, 'BIRTH', 6, H - 10, '#cfc8df')
      PX.text(g, 'DEATH', W - 36, H - 10, '#cfc8df')
    },
    flash(cv) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      return (t) => {
        PX.rect(g, 0, 0, W, H, '#e9f0f8')
        const f = Math.floor((t % 1.2) * 60)
        const hit = f < 3 || (f >= 6 && f < 8)
        PX.sprite(g, 'front-scyther', W * 0.27, H - 8, t * 1000, {
          alpha: f < 16 && Math.floor(f / 2) % 2 ? 0.3 : 1,
        })
        PX.sprite(
          g,
          'front-scyther',
          W * 0.73 + (f < 16 ? (f % 4 < 2 ? 2 : -2) : 0),
          H - 8,
          f < 5 ? 0 : t * 1000,
          { flash: hit ? 1 : 0, tint: !hit && f < 16 ? { color: '#ff7a1e', a: 0.4 } : null },
        )
        label(cv, 'BLINK', 4, 4, '#5c6a8a')
        label(cv, 'FLASH', W / 2 + 4, 4, '#5c6a8a')
      }
    },
    stars(cv) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      return (t) => {
        PX.rect(g, 0, 0, W, H, '#e9f0f8')
        const p = (t % 2) / 0.6
        const bx = W / 2,
          by = H - 12
        PX.softEllipse(g, bx, by + 7, 7, 2, '#24304f', 0.4)
        const im = SCN.ball('great', 0, { dim: p > 0 ? 1 : 0, button: p < 0.15 ? '#ffffff' : '#7a7090' })
        g.drawImage(im, Math.round(bx - im.width / 2), Math.round(by - im.height / 2))
        if (p < 2.6 && !(p > 2.1 && Math.floor(t * 20) % 2))
          for (const a of [-2.1, -1.57, -1.05]) {
            const d = 16 * PX.ease.outBack(Math.min(1, p), 2)
            const x = Math.round(bx + Math.cos(a) * d),
              y = Math.round(by + Math.sin(a) * d)
            PX.rect(g, x - 2, y, 5, 1, '#ffbe2e')
            PX.rect(g, x, y - 2, 1, 5, '#ffbe2e')
            PX.rect(g, x - 1, y - 1, 3, 3, '#ffbe2e')
            PX.rect(g, x, y, 1, 1, '#ffffff')
          }
      }
    },
    bgTest(cv) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      const grounds = ['#f4f1fb', '#8a8396', '#14111b']
      return (t) => {
        grounds.forEach((c, i) => PX.rect(g, (i * W) / 3, 0, W / 3 + 1, H, c))
        grounds.forEach((_, i) => PX.sprite(g, 'front-eevee', ((i + 0.5) * W) / 3, H - 6, t * 1000))
      }
    },
    paletteCount(cv, { key }) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      PX.rect(g, 0, 0, W, H, '#14111b')
      const m = PX.size(key)
      const fr = PX.cached(`pc|${key}`, () => {
        const c = PX.canvas(m.w, m.h)
        PX.sprite(c.g, key, m.w / 2, m.h, 0, { frame: 0 })
        return c
      })
      g.drawImage(fr, 6, Math.round((H - m.h) / 2))
      const d = fr.g.getImageData(0, 0, m.w, m.h).data
      const set = new Map()
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] > 0) {
          const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
          set.set(k, (set.get(k) || 0) + 1)
        }
      const cols = [...set.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => '#' + k.toString(16).padStart(6, '0'))
      const x0 = m.w + 16,
        cell = 9
      const per = Math.max(1, Math.floor((W - x0 - 4) / cell))
      cols.forEach((c, i) =>
        PX.rect(g, x0 + (i % per) * cell, 8 + Math.floor(i / per) * cell, cell - 1, cell - 1, c),
      )
      PX.text(g, `${cols.length} COLOURS`, x0, H - 12, '#efebf6')
    },
    catchBeam(cv) {
      const g = cv.getContext('2d')
      g.imageSmoothingEnabled = false
      const W = cv.width,
        H = cv.height
      return (t) => {
        PX.rect(g, 0, 0, W, H, '#fff4de')
        const p = (t % 1.4) / 1.4
        const k = p < 0.25 ? 1 : p < 0.7 ? 1 - PX.ease.inC((p - 0.25) / 0.45) : 0
        const bx = W * 0.25,
          by = 18
        if (k > 0.02)
          PX.sprite(g, 'front-eevee', PX.lerp(bx, W * 0.62, k), PX.lerp(by + 4, H - 6, k), t * 1000, {
            sx: k,
            sy: k,
            sil: Math.floor(t * 30) % 2 ? '#ff3b5c' : '#ffffff',
          })
        const im = SCN.ball('ultra', 0, { open: p < 0.72 ? 1 : 0 })
        g.drawImage(im, Math.round(bx - im.width / 2), Math.round(by - im.height / 2))
        if (p < 0.6)
          for (let i = 0; i < 3; i++)
            PX.line(g, bx, by - 2, W * 0.62 + (i - 1) * 10, H - 14 - i * 6, i % 2 ? '#ff3b5c' : '#ffd0d8')
      }
    },
  }
  function label(cv, str, x, y, color) {
    PX.text(cv.getContext('2d'), str, x, y, color)
  }

  const MOODS = [
    {
      id: 'mb-daybreak',
      style: 'daybreak',
      name: 'Sunlit DS',
      for: 'Johto Daybreak',
      thesis:
        'HeartGold and SoulSilver’s bright 2.5D Johto with today’s restraint: skies built from dither, greens that warm toward yellow in the light, soft shadows that never blur, and the UI on paper-white cards.',
      palette: [
        ['Sky', '#8ccbf6'],
        ['Horizon', '#fde4c8'],
        ['Meadow', '#92d08a'],
        ['Leaf shade', '#3c8457'],
        ['Paper', '#fbfdff'],
        ['Navy ink', '#24304f'],
        ['Poké red', '#f2553f'],
        ['Sunrise', '#ffbe2e'],
      ],
      tiles: [
        {
          span: 't-8',
          w: 240,
          h: 100,
          gen: 'scene',
          o: { style: 'daybreak', foe: 'front-eevee', own: 'back-venusaur' },
          title: 'The field at 9 a.m.',
          cap: 'Dithered sky, lit ridge tops, a tree line in three greens, grass pads with a lit rim. Eevee and Venusaur are the game’s own Black/White sprites.',
        },
        {
          span: 't-4',
          w: 120,
          h: 100,
          gen: 'dither',
          title: 'Dither, not banding',
          cap: 'Five sky colours. Left: hard bands. Right: the same five through a 4×4 Bayer matrix.',
        },
        {
          span: 't-4',
          w: 120,
          h: 72,
          gen: 'ramps',
          title: 'Hue-shifted greens',
          cap: 'Shadows lean blue, lights lean yellow. Straight ramps look plastic next to BW sprites.',
        },
        {
          span: 't-4',
          w: 180,
          h: 100,
          gen: 'frameZoom',
          o: { style: 'daybreak' },
          title: 'The frame, magnified',
          cap: 'Radius-3 stepped corners, a white top line, fog bottom line, and the shadow as a 50 % checker.',
        },
        {
          span: 't-4',
          w: 90,
          h: 54,
          gen: 'stars',
          title: 'Rewards in sunrise gold',
          cap: 'Gold is kept for things you earn: badges, gauges, the catch stars.',
        },
      ],
      refs: [
        {
          tag: 'Official',
          title: 'Pokémon HeartGold & SoulSilver',
          who: 'Game Freak · 2009',
          text: 'Seen by fans as the last and best of the 2.5D pixel era: Gold/Silver’s colours at DS fidelity, a top-down world with real depth.',
          take: 'Bright, saturated but soft colour; layered depth out of flat tiles.',
          links: [
            [
              'VGChartz review',
              'https://www.vgchartz.com/game/34267/pokemon-heart-gold-soul-silver/reviews/7976/',
            ],
          ],
        },
        {
          tag: 'Fan',
          title: 'Johto Redrawn & Kanto Redrawn',
          who: 'Retro Redrawn · 2021–2022',
          text: 'More than a hundred pixel artists rebuilt both regions as zoomable maps. For Kanto they limited themselves to the Gold/Silver/Crystal palette, with a few extra colours if needed.',
          take: 'A strict shared palette is what keeps a hundred hands coherent. Do the same for backgrounds, badges and banners.',
          links: [
            ['Kanto Redrawn', 'https://retroredrawn.com/kanto/'],
            [
              'Nintendo Life',
              'https://www.nintendolife.com/news/2021/05/pokemon_redrawn_is_a_pixel_art_project_thats_redesigning_johto_and_kanto',
            ],
          ],
        },
        {
          tag: 'Fan',
          title: 'Pokémon Phoenix Rising',
          who: 'Fan game',
          text: 'Brings back the HeartGold/SoulSilver art style; described as a mix of Gen 4 and Gen 5 DS graphics.',
          take: 'Proof the DS look still carries a new story.',
          links: [
            [
              'Prima Games',
              'https://primagames.com/news/gamefreak-could-learn-a-lot-from-fan-made-pokemon-game-phoenix-rising',
            ],
          ],
        },
        {
          tag: 'Indie',
          title: 'Coromon',
          who: 'TRAGsoft · 2022',
          text: 'Vivid colours, bold outlines and emoji-like emotion bubbles. Reviewers praise the creature art and call the UI layout cumbersome.',
          take: 'Take the outline weight and the emotion bubbles; don’t copy the menus.',
          links: [
            ['Nintendo World Report', 'https://www.nintendoworldreport.com/review/61024'],
            ['TapTap preview', 'https://www.taptap.io/post/6491840'],
          ],
        },
      ],
    },
    {
      id: 'mb-night',
      style: 'night',
      name: 'Neon Unova',
      for: 'Unova Night',
      thesis:
        'Black 2/White 2’s red-and-black menus and restless battle camera, lit the way modern pixel games light things: dark glass, neon edges, rim light on sprites, and ambient motion everywhere.',
      palette: [
        ['Night', '#0a0d1c'],
        ['Glass', '#141a33'],
        ['Horizon', '#4f2f76'],
        ['Neon cyan', '#3ef0ff'],
        ['BW2 red', '#ff2e6e'],
        ['Gold', '#ffd23a'],
        ['Moon', '#f4f0cf'],
        ['Text', '#e9ecff'],
      ],
      tiles: [
        {
          span: 't-8',
          w: 240,
          h: 100,
          gen: 'scene',
          o: { style: 'night', foe: 'front-gengar', own: 'back-charizard' },
          title: 'Castelia after dark',
          cap: 'Skyline with lit windows, a tournament grid, platforms whose neon rims breathe, motes rising.',
        },
        {
          span: 't-4',
          w: 120,
          h: 100,
          gen: 'rim',
          title: 'Rim light',
          cap: 'One extra pass: the silhouette in cyan, offset 1 px toward the light, behind the sprite.',
        },
        {
          span: 't-4',
          w: 120,
          h: 64,
          gen: 'led',
          title: 'LED segments',
          cap: '4 px cells, 2 px gaps, a lit top row. HP reads like a device.',
        },
        {
          span: 't-4',
          w: 120,
          h: 64,
          gen: 'glowCmp',
          title: 'Glow without blur',
          cap: 'A blurred gradient smears the pixel grid; a dithered glow keeps it.',
        },
        {
          span: 't-4',
          w: 180,
          h: 100,
          gen: 'frameZoom',
          o: { style: 'night' },
          title: 'Chamfer and ticks',
          cap: 'Two corners cut at 45°, cyan ticks riding them; the primary glows in a 2 px checker.',
        },
      ],
      refs: [
        {
          tag: 'Official',
          title: 'Pokémon Black & White, Black 2 & White 2',
          who: 'Game Freak · 2010–2012',
          text: 'Fully animated battle sprites, and a camera that moves to highlight the action. Back sprites show the whole body so the camera can swing around it.',
          take: 'A battle screen should never sit still: idle motion, camera nudges, platforms that live.',
          links: [
            ['Bulbapedia: Generation V', 'https://bulbapedia.bulbagarden.net/wiki/Generation_V'],
            ['Wikipedia', 'https://en.wikipedia.org/wiki/Pok%C3%A9mon_Black_and_White'],
          ],
        },
        {
          tag: 'Official',
          title: 'BW2 menus',
          who: 'Fan reaction, PokéCommunity',
          text: 'Players singled out the red-and-black fight menu and the neon start menu as the look of the sequel.',
          take: 'Two colours and one neon are enough identity.',
          links: [
            [
              'PokéCommunity thread',
              'https://www.pokecommunity.com/threads/does-anyone-else-like-the-new-look.293004/',
            ],
          ],
        },
        {
          tag: 'Indie',
          title: 'Sea of Stars',
          who: 'Sabotage Studio · 2023',
          text: 'A custom render pipeline over pixel art: bloom, colour correction, normal-mapped sprites, volumetric light, all pixel-perfect. Day and night are a mechanic.',
          take: 'Light can move across pixels without blurring them.',
          links: [
            [
              'Niche Gamer (feature list)',
              'https://nichegamer.com/2020/03/19/the-messenger-prequel-rpg-sea-of-stars-enters-kickstarter-launches-2022-for-pc/',
            ],
            [
              'Foro3D',
              'https://foro3d.com/2026/julio/sea-of-stars-pixel-art-de-16-bits-con-iluminacion-dinamica-en-unity.html',
            ],
          ],
        },
        {
          tag: 'Indie',
          title: 'Eastward',
          who: 'Pixpil · 2021',
          text: '“Retro-pixel + 3D lighting”, aiming for the feel of 90s Japanese animation, with lights that affect sprites and constant ambient animation.',
          take: 'Small loops (a flickering screen, a rising mote) make a still screen breathe.',
          links: [
            [
              'Game Developer',
              'https://www.gamedeveloper.com/disciplines/road-to-the-igf-pixpil-s-i-eastward-i-',
            ],
            [
              'Nintendo',
              'https://www.nintendo.com/us/whatsnew/how-the-developers-began-making-then-remaking-eastward',
            ],
          ],
        },
        {
          tag: 'Indie',
          title: 'Octopath Traveler, HD-2D',
          who: 'Square Enix / Acquire · 2018',
          text: 'Pixel sprites in a lit 3D world: depth of field, tilt-shift and shadow give a diorama look.',
          take: 'Blur what is out of focus, never the sprite itself.',
          links: [
            ['Wikipedia: HD-2D', 'https://en.wikipedia.org/wiki/HD-2D'],
            [
              'Unreal Engine interview',
              'https://www.unrealengine.com/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style',
            ],
          ],
        },
        {
          tag: 'Craft',
          title: 'Recreating BW’s 2.5D effect',
          who: 'Matthew Jakeman',
          text: 'A teardown of how Black & White’s world is real 3D designed not to look 3D.',
          take: 'The platforms and camera nudges in the night scene come from this idea.',
          links: [['Substack', 'https://mjakeman.substack.com/p/recreating-the-25d-effect-from-pokemon']],
        },
      ],
    },
    {
      id: 'mb-pop',
      style: 'pop',
      name: 'Sticker Pop',
      for: 'Paldea Pop',
      thesis:
        'Scarlet and Violet’s orange and violet squeezed back into pixels, the way fans keep demaking the newest games: thick ink, chunky button lips, halftone and sunbursts, sprites that emote.',
      palette: [
        ['Scarlet', '#ff6b1a'],
        ['Violet', '#7b4dff'],
        ['Sunshine', '#ffd84d'],
        ['Mint', '#00c2a8'],
        ['Bubblegum', '#ff4f9a'],
        ['Ink', '#1a1423'],
        ['Cream', '#fff4de'],
        ['White', '#ffffff'],
      ],
      tiles: [
        {
          span: 't-8',
          w: 240,
          h: 100,
          gen: 'scene',
          o: { style: 'pop', foe: 'front-eevee', own: 'back-pikachu' },
          title: 'Sunburst stage',
          cap: 'Eighteen wedges behind the foe, halftone that grows toward the corner, inked clouds, pads with a solid offset shadow.',
        },
        {
          span: 't-4',
          w: 120,
          h: 100,
          gen: 'catchBeam',
          title: 'Capture, as a toy',
          cap: 'The beam flickers red and white; the silhouette shrinks with an ease-in.',
        },
        {
          span: 't-4',
          w: 180,
          h: 96,
          gen: 'stickerBtn',
          title: 'The button lip',
          cap: '3 px underlip at rest; pressed, the face drops 2 px and the lip is gone.',
        },
        {
          span: 't-4',
          w: 120,
          h: 72,
          gen: 'halftone',
          title: 'Halftone ground',
          cap: 'Flat colour and dots only. No gradients anywhere in this style.',
        },
      ],
      refs: [
        {
          tag: 'Fan',
          title: 'Scarlet & Violet as a DS game',
          who: 'eyeudon · PixelJoint, 2022',
          text: 'An NDS-inspired mockup of scenes from Scarlet and Violet as they would look on a DS.',
          take: 'Modern Pokémon reads perfectly in DS pixels; the colours survive the trip.',
          links: [
            ['Game Rant', 'https://gamerant.com/pokemon-scarlet-violet-ds-graphics/'],
            ['PixelJoint', 'https://pixeljoint.com/pixelart/148541.htm'],
          ],
        },
        {
          tag: 'Fan',
          title: 'SV gym leaders in BW style',
          who: 'Roncally_Hayate · 2023',
          text: 'All eight gym leaders drawn with Black & White’s character traits, with the battle music remixed in the DS style.',
          take: 'Gen 5 is the fidelity to match for new trainer art.',
          links: [
            [
              'SoraNews24',
              'https://soranews24.com/2023/03/21/how-would-pokemon-scarlet-and-violet-look-with-pixel-art-awesome-japanese-fan-shows%E3%80%90video%E3%80%91/',
            ],
          ],
        },
        {
          tag: 'Fan',
          title: 'Scarlet, demade for Game Boy',
          who: '2bitcrook',
          text: 'The opening of Scarlet rebuilt in the style of Red and Blue, playable on Game Boy and Analogue Pocket.',
          take: 'Constraint can be the feature.',
          links: [['Pocket Tactics', 'https://www.pockettactics.com/pokemon-scarlet-violet/demake']],
        },
        {
          tag: 'Fan',
          title: 'PokéRogue',
          who: 'Browser roguelite · 2024',
          text: 'Praised for emotive, characterful sprites; its credits list the BW2 sprites and many Smogon Sprite Project artists.',
          take: 'The closest cousin to Pokédice: browser, runs, Gen 5 sprites. Compare its battle juice.',
          links: [
            [
              'Retro Dodo',
              'https://retrododo.com/pokerogue-is-an-unmissable-pokemon-roguelite-and-its-free-to-play-in-your-browser/',
            ],
          ],
        },
        {
          tag: 'Indie',
          title: 'Cassette Beasts',
          who: 'Bytten Studio · 2023',
          text: 'A 3D overworld with 2D pixel battles. One recurring criticism: the pixel art clashes with a vector UI.',
          take: 'Keep the UI on the same pixel grid as the sprites. That is what the 9-slice frames here are for.',
          links: [['RPGFan review', 'https://rpgfan.com/review/cassette-beasts']],
        },
        {
          tag: 'Fan',
          title: 'Legends: Z-A in Gen 5 style',
          who: 'flea_alex, Ezerart, R3dd1t_D4v1d · 2025',
          text: 'Mega Evolution menu icons on a 32×32 3DS-style canvas, and an animated Gen 5-style Mega Dragonite.',
          take: 'New forms keep being drawn in Gen 5 style: it is a living dialect, not a dated look.',
          links: [
            ['Game Rant', 'https://gamerant.com/pokemon-mega-dragonite-gen-5-style-fan-art/'],
            [
              'DeviantArt',
              'https://www.deviantart.com/ezerart/art/Pokemon-Legends-ZA-Icon-Sprites-3DS-Style-1250791936',
            ],
          ],
        },
      ],
    },
    {
      id: 'mb-motion',
      style: null,
      name: 'Battle motion',
      for: 'All animations',
      thesis:
        'What makes a hit feel like a hit in pixels: wind-up, smears drawn as frames, hit-stop, white silhouette flashes, particles that walk a colour ramp, and sprites that react to their state.',
      palette: [
        ['Flash', '#ffffff'],
        ['Spark', '#fff6a8'],
        ['Flame', '#ffb23a'],
        ['Ember', '#e8481c'],
        ['Jet', '#4aa8ff'],
        ['Leaf', '#5ec04a'],
        ['Psy', '#ff7ad9'],
        ['Ink', '#1a1423'],
      ],
      tiles: [
        {
          span: 't-6',
          w: 260,
          h: 58,
          gen: 'timing',
          title: 'A hit, in frames',
          cap: 'The Flamethrower’s contact: wind-up, release, 5 frames of stop, shake, settle. The stop is what sells weight.',
        },
        {
          span: 't-6',
          w: 180,
          h: 64,
          gen: 'smear',
          title: 'Smears are drawn',
          cap: 'In-between positions as stretched copies on the motion path, never a blur filter.',
        },
        {
          span: 't-4',
          w: 120,
          h: 72,
          gen: 'flash',
          title: 'Flash right',
          cap: 'Left: an opacity blink, the common fallback. Right: two white frames, a hit-stop and a tinted shake.',
        },
        {
          span: 't-4',
          w: 120,
          h: 64,
          gen: 'fireRamp',
          title: 'Particles walk a ramp',
          cap: 'Every flame particle steps white → yellow → orange → red → soot, shrinking as it goes.',
        },
        {
          span: 't-4',
          w: 90,
          h: 54,
          gen: 'stars',
          title: 'The gotcha fan',
          cap: 'Three stars burst out at 120°, 90° and 60°, overshooting, then blink out.',
        },
      ],
      refs: [
        {
          tag: 'Official',
          title: 'Gen 5 sprite behaviour',
          who: 'Bulbapedia',
          text: 'Each Pokémon has two identically animated sets (eyes open, eyes closed). Animation slows as HP drops and under most statuses, and a status makes the sprite glow its colour.',
          take: 'Cheap and powerful for Pokédice: play the idle at 35 % speed when worn out, tint by status.',
          links: [['Generation V', 'https://bulbapedia.bulbagarden.net/wiki/Generation_V']],
        },
        {
          tag: 'Official',
          title: 'Battle animations over the generations',
          who: 'Bulbapedia',
          text: 'From Generation VI, damaging moves fall back to a generic strike animation.',
          take: 'Typed effects are where a fan game can beat the modern games.',
          links: [['Battle effects', 'https://bulbapedia.bulbagarden.net/wiki/Battle_animation']],
        },
        {
          tag: 'Fan',
          title: 'Pokémon Showdown move animations',
          who: 'Open-source client',
          text: 'Moves are short tweens of a few effect sprites: fireballs, wisps, leaves, bolts.',
          take: 'A small, shared set of effect sprites goes a long way when timing is right.',
          links: [
            ['Bulbapedia: Showdown', 'https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Showdown'],
            ['Client source', 'https://github.com/smogon/pokemon-showdown-client'],
          ],
        },
        {
          tag: 'Craft',
          title: 'Pixel art tutorials',
          who: 'Pedro Medeiros (Saint11)',
          text: 'Animated GIF lessons on impacts, explosions and motion blur, among many others.',
          take: 'Impact frames and smears are frames you draw, not effects you apply.',
          links: [
            ['Patreon', 'https://www.patreon.com/saint11'],
            [
              'Creative Bloq',
              'https://creativebloq.com/news/artist-makes-animated-gif-tutorials-to-teach-you-pixel-art',
            ],
          ],
        },
      ],
    },
    {
      id: 'mb-craft',
      style: null,
      name: 'Sprite discipline',
      for: 'New art next to Gen 5 sprites',
      thesis:
        'The rules the community’s best spriters work by, so anything new (badges, banners, backgrounds, effects) sits next to Black/White sprites without a seam.',
      palette: [
        ['Shade', '#1b3b4f'],
        ['Deep', '#1f6a52'],
        ['Base', '#3f9a4b'],
        ['Mid', '#7cc04a'],
        ['Light', '#c3df5c'],
        ['Shine', '#f4f3a8'],
      ],
      tiles: [
        {
          span: 't-6',
          w: 160,
          h: 72,
          gen: 'ramps',
          title: 'Hue-shift every ramp',
          cap: 'The same six steps of value; only the right one shifts hue as it brightens.',
        },
        {
          span: 't-6',
          w: 180,
          h: 72,
          gen: 'bgTest',
          title: 'Test on three grounds',
          cap: 'A sprite has to hold on light, mid and dark backgrounds: the styles here span all three.',
        },
        {
          span: 't-6',
          w: 200,
          h: 96,
          gen: 'paletteCount',
          o: { key: 'back-charizard' },
          title: 'Count the colours',
          cap: 'One frame of the BW Charizard back sprite, every colour it uses. New art should live in the same budget.',
        },
        {
          span: 't-6',
          w: 200,
          h: 96,
          gen: 'paletteCount',
          o: { key: 'front-eevee' },
          title: 'Eevee’s budget',
          cap: 'Small sprites need even fewer: each ramp is a handful of shades.',
        },
      ],
      refs: [
        {
          tag: 'Craft',
          title: 'Pixelblog 1: Color Palettes',
          who: 'Raymond Schlitter (Slynyrd)',
          text: 'Build ramps that shift hue as they brighten; his worked example uses 9 swatches per ramp and 20° of shift between steps.',
          take: 'Every new palette in Pokédice (backgrounds, badges, frames) should follow this.',
          links: [['slynyrd.com', 'https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes']],
        },
        {
          tag: 'Fan',
          title: 'Smogon sprite rules',
          who: 'Smogon CAP & X/Y Sprite Project',
          text: 'Match the in-game size and style; no move or environment effects on the sprite; test against several backgrounds; keep palettes swappable for shinies. The X/Y project kept BW’s style and is free to use with credit.',
          take: 'Effects live in the effect layer, never baked into a sprite.',
          links: [
            ['X/Y Sprite Project', 'https://www.smogon.com/forums/threads/x-y-sprite-project.3486712/'],
          ],
        },
        {
          tag: 'Fan',
          title: 'Mystery Dungeon portraits',
          who: 'SpriteBot / PMD community',
          text: 'Emotion portraits are 40×40 px with at most 15 colours, free to use in PMD fan projects.',
          take: 'A ready spec if Professor Oak’s tips or trainer cards get portraits.',
          links: [['SkyTemple SpriteBot', 'https://skytemple.org/spritebot.html']],
        },
        {
          tag: 'Fan',
          title: 'Pokémon Infinite Fusion',
          who: 'Community spriters',
          text: 'Tens of thousands of community sprites, credited per artist. In 2024, AI-written Pokédex entries pushed artists to ask for their work back; the developer removed them.',
          take: 'Credit and consent for any community art the game pulls in.',
          links: [['Infinite Fusion Dex FAQ', 'https://infinitefusiondex.com/faq']],
        },
      ],
    },
  ]

  function renderMoods() {
    $('#mb-index').innerHTML = MOODS.map(
      (m) => `<button type="button" data-go="${m.id}">${esc(m.name)}</button>`,
    ).join('')
    $$('#mb-index button').forEach((b) =>
      b.addEventListener('click', () =>
        document
          .getElementById(b.dataset.go)
          .scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }),
      ),
    )
    $('#mb-list').innerHTML = MOODS.map(
      (m, i) => `<section class="mb" id="${m.id}" style="scroll-margin-top:120px">
      <div class="mb-head"><div><p class="eyebrow">BOARD ${i + 1} OF ${MOODS.length} · FOR ${esc(m.for.toUpperCase())}</p><h2 class="title">${esc(m.name)}</h2><p>${esc(m.thesis)}</p></div>
      <div class="mb-pal" aria-label="Palette">${m.palette.map(([n, c]) => `<i style="background:${c}" title="${esc(n)} ${c}"><span>${c}</span></i>`).join('')}</div></div>
      <div class="mb-grid">${m.tiles.map((t, k) => `<figure class="tile ${t.span}" style="margin:0"><div class="art"><canvas data-tile="${i}:${k}" width="${t.w}" height="${t.h}"></canvas></div><figcaption class="cap"><b>${esc(t.title)}</b>${esc(t.cap)}</figcaption></figure>`).join('')}</div>
      <div class="refs">${m.refs.map((r) => `<article class="ref"><div class="k"><i class="${r.tag}">${r.tag.toUpperCase()}</i>${esc(r.who)}</div><h4>${esc(r.title)}</h4><p>${esc(r.text)}</p><p><em>Take:</em> ${esc(r.take)}</p><div class="links">${r.links.map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join('')}</div></article>`).join('')}</div>
    </section>`,
    ).join('')
    $$('canvas[data-tile]').forEach((cv) => {
      const [i, k] = cv.dataset.tile.split(':').map(Number)
      const t = MOODS[i].tiles[k]
      const fn = TILE[t.gen](cv, t.o || {})
      if (typeof fn === 'function') live(cv, fn)
    })
    renderMoodHeaders()
  }
  function renderMoodHeaders() {
    $$('#mb-index button').forEach((b) => {
      const m = MOODS.find((x) => x.id === b.dataset.go)
      b.setAttribute('aria-current', String(m.style === style))
    })
  }

  // ================================================================== tabs, keys, boot
  const TAB_IDS = ['home', 'animations', 'styles', 'moodboards']
  let animsStarted = false
  function showTab(id, push = true) {
    if (!TAB_IDS.includes(id)) id = 'home'
    TAB_IDS.forEach((t) => {
      $('#' + t).hidden = t !== id
      $(`#tab-${t}`).setAttribute('aria-selected', String(t === id))
      $(`#tab-${t}`).tabIndex = t === id ? 0 : -1
    })
    if (push)
      try {
        history.replaceState(null, '', '#' + id)
      } catch {
        /* sandboxed */
      }
    if (id !== 'animations' && player) {
      player.pause()
      syncPlay()
    }
    if (id === 'animations' && !animsStarted) {
      animsStarted = true
      if (!REDUCED) {
        player.play()
        syncPlay()
      }
    }
    window.scrollTo({ top: 0 })
  }

  function bindGlobal() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)))
    $('.tabs').addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
      const cur = TAB_IDS.findIndex((t) => $(`#tab-${t}`).getAttribute('aria-selected') === 'true')
      const n = TAB_IDS[(cur + (e.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length]
      showTab(n)
      $(`#tab-${n}`).focus()
    })
    const hold = $('#hold')
    let held = false
    hold.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      held = true
      setCompare(true)
    })
    const release = () => {
      if (held) {
        held = false
        setCompare(false)
      }
    }
    hold.addEventListener('pointerup', release)
    hold.addEventListener('pointerleave', release)
    hold.addEventListener('pointercancel', release)
    hold.addEventListener('click', (e) => {
      if (e.detail === 0) setCompare(!comparing)
    })
    hold.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return
      if ((e.key === 'c' || e.key === 'C') && !e.repeat && !$('#styles').hidden) setCompare(true)
      if (e.key === ' ' && !$('#animations').hidden && !e.target.closest('button, [tabindex]')) {
        e.preventDefault()
        if (player.playing) player.pause()
        else player.play()
        syncPlay()
      }
    })
    window.addEventListener('keyup', (e) => {
      if (e.key === 'c' || e.key === 'C') setCompare(false)
    })
    $('#screens-nav').innerHTML = SCREENS.map(
      ([id, l]) => `<button type="button" data-ph="${id}">${l}</button>`,
    ).join('')
    $$('#screens-nav button').forEach((b) =>
      b.addEventListener('click', () =>
        $('#ph-' + b.dataset.ph).scrollIntoView({
          behavior: REDUCED ? 'auto' : 'smooth',
          inline: 'center',
          block: 'nearest',
        }),
      ),
    )
  }

  async function boot() {
    injectFrames()
    renderSwitch()
    bindGlobal()
    await Promise.all([
      PX.loadSprites('assets/'),
      SCN.loadImage('grass', 'assets/current-grass.png'),
      SCN.loadImage('plains', 'assets/current-plains.png'),
      document.fonts ? document.fonts.ready : null,
    ])
    renderIntro()
    renderScreens()
    renderSheet()
    initAnims()
    renderMoods()
    const hash = (location.hash || '').slice(1)
    showTab(TAB_IDS.includes(hash) ? hash : 'home', false)
    HOME.init()
    requestAnimationFrame(tick)
    // Hooks for scripted previews (seek a timeline, pick an animation).
    window.PDLAB = {
      seek,
      load(o) {
        Object.assign(OPT, o)
        renderPicker()
        renderAnimOpts()
        loadAnim(false)
      },
      setStyle,
    }
    window.claude?.hot?.snapshot?.(() => ({ style, tab: TAB_IDS.find((t) => !$('#' + t).hidden) }))
  }
  boot()
})()
