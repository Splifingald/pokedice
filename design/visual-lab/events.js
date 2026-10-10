/*
 * Pokédice Visual Lab: Special events (Johto Daybreak, Jersey 20). The plan is docs/18-SPECIAL-EVENTS-PLAN.md.
 * Home's events widget becomes a stack of event cards, most important on top. The Events page has one tab per
 * unlocked event:
 *  - Fortune Wheel (permanent, priority 5): one free spin a day (UTC midnight), equal slices, odds in an info pop-up.
 *  - Raid Battles (24 h, priority 3): your three plus up to two friends' teams (NPC trainers fill in), one Pokémon out
 *    per side, against a Lv.50 raid Pokémon with HP bars that calls up to two allies; catch it to close the raid.
 *  - Elite Rebattle (priority 4): the League in three tiers (+10, +25, Lv.100), each a gauntlet with no Center.
 * Each event opens with a pop-up the first time: a banner, 2–4 rule sections, a button straight to it.
 * The admin mock beside the phone edits the same numbers the phone uses (CFG).
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco, plural } = A
  const UI = () => window.PDUI
  const SND = () => PX.Sound
  const REDUCED = A.REDUCED
  const wait = (ms) => new Promise((r) => setTimeout(r, EVS.fast ? ms / 4 : ms))
  const pad = (d) => String(d).padStart(3, '0')
  const cap = (s) => s[0].toUpperCase() + s.slice(1)

  // ------------------------------------------------------------------ the admin's numbers (defaults)
  const ITEM = (key) => A.G.items.find((i) => i.key === key)
  const CFG = {
    priority: { seasonal: 1, raid: 3, rebattle: 4, wheel: 5 },
    teaserBadges: 3,
    // Each event's banner picture (the Events page title and the unlock pop-up). Placeholders from the area pictures
    // until the event art arrives; the final files go next to them, one per event, set in admin.
    banner: { wheel: 'evening', raid: 'lair-shrine', rebattle: 'champion' },
    // Equal slices on the wheel; each row is a reward, how many slices it takes and the odds of each slice.
    wheel: [
      { kind: 'gold', amount: 10, n: 4, odds: 12.5 },
      { kind: 'item', key: 'poke-ball', amount: 1, n: 2, odds: 12.5 },
      { kind: 'item', key: 'great-ball', amount: 1, n: 1, odds: 12.5 },
      { kind: 'item', key: 'ultra-ball', amount: 1, n: 1, odds: 10 },
      { kind: 'item', key: 'master-ball', amount: 1, n: 1, odds: 2.5 },
    ],
    raid: {
      bars: 3,
      colors: ['#34c97a', '#ffbe2e', '#ff5a4a', '#5b8def', '#c58aff'],
      startAllies: 2,
      perBreak: 2,
      maxField: 2,
      level: 50,
      upgrade: 7,
      teamCap: 50,
      maxFriends: 2,
      shiny: 30,
      repeatHours: 72,
      helperCap: 5,
      gifts: [
        { key: 'ultra-ball', odds: 40 },
        { key: 'hyper-potion', odds: 25 },
        { key: 'revive', odds: 20 },
        { key: 'rare-candy', odds: 15 },
      ],
    },
    rebattle: [
      // Each tier has its medal: a bronze diamond, a silver pentagon, a gold hexagon.
      { tier: 'Bronze', lv: '+10', gold: 1.5, up: '+1' },
      { tier: 'Silver', lv: '+25', gold: 2, up: '+2' },
      { tier: 'Gold', lv: '100', gold: 3, up: 'max' },
    ],
  }

  // ------------------------------------------------------------------ the events
  const DEF = {
    wheel: { name: 'Fortune Wheel', short: 'Wheel', unlock: 11, unlockText: 'Clear Routes 7 & 8 (Celadon)' },
    raid: { name: 'Raid Battles', short: 'Raids', unlock: 15, unlockText: 'Clear the Safari Zone' },
    rebattle: { name: 'Elite Rebattle', short: 'Rebattle', unlock: 22, unlockText: 'Beat the Kanto League' },
  }
  // The raid pool (legendaries that left their areas) and the fallback when none is available.
  const POOL = [
    [151, 'Mew', 'Faraway Island', 'kanto'],
    [251, 'Celebi', 'Ilex Shrine', 'johto'],
    [385, 'Jirachi', 'Birth Island', 'hoenn'],
    [386, 'Deoxys', 'Birth Island', 'hoenn'],
    [384, 'Rayquaza', 'Sky Pillar', 'hoenn'],
    [381, 'Latios', 'Southern Island II', 'hoenn'],
    [489, 'Phione', 'The Seabreak Path', 'sinnoh'],
    [490, 'Manaphy', 'The Seabreak Path', 'sinnoh'],
    [492, 'Shaymin', 'Flower Paradise', 'sinnoh'],
    [493, 'Arceus', 'The Hall of Origin', 'sinnoh'],
    [488, 'Cresselia', 'Fullmoon Island', 'sinnoh'],
    [494, 'Victini', 'Liberty Garden', 'unova'],
    [647, 'Keldeo', 'The Moor of Icirrus', 'unova'],
    [648, 'Meloetta', 'The Castelia Café', 'unova'],
    [649, 'Genesect', 'The P2 Laboratory', 'unova'],
    [719, 'Diancie', 'The Diamond Domain', 'kalos'],
    [720, 'Hoopa', 'Hoopa’s Ring', 'kalos'],
    [721, 'Volcanion', 'The Nebel Plateau', 'kalos'],
    [808, 'Meltan', 'The Mystery Box', 'alola'],
    [801, 'Magearna', 'Magearna’s Workshop', 'alola'],
    [802, 'Marshadow', 'Ten Carat Hill', 'alola'],
    [807, 'Zeraora', 'The Blush Mountain', 'alola'],
    [893, 'Zarude', 'The Forest of Focus', 'galar'],
  ]
  const FALLBACK = [
    [149, 'Dragonite', 'kanto'],
    [130, 'Gyarados', 'kanto'],
    [143, 'Snorlax', 'kanto'],
    [131, 'Lapras', 'kanto'],
    [248, 'Tyranitar', 'johto'],
    [373, 'Salamence', 'hoenn'],
    [376, 'Metagross', 'hoenn'],
    [445, 'Garchomp', 'sinnoh'],
    [448, 'Lucario', 'sinnoh'],
    [635, 'Hydreigon', 'unova'],
    [637, 'Volcarona', 'unova'],
    [706, 'Goodra', 'kalos'],
    [681, 'Aegislash', 'kalos'],
    [784, 'Kommo-o', 'alola'],
    [887, 'Dragapult', 'galar'],
    [983, 'Kingambit', 'paldea'],
    [998, 'Baxcalibur', 'paldea'],
  ]
  // Friends with a raid team registered (three at Lv.50), and the NPC trainers that fill an empty side.
  const FRIENDS = [
    { name: 'Lea', look: 'cooltrainer-f', team: [149, 94, 130], helped: 3 },
    { name: 'Noor', look: 'psychic-m', team: [143, 65, 68], helped: 1 },
    { name: 'Kai', look: 'hiker', team: [59, 121, 112], helped: 0 },
  ]
  const NPCS = [
    { name: 'Ace Trainer Cal', look: 'cooltrainer-m', team: [59, 134, 76] },
    { name: 'Ace Trainer Ria', look: 'cooltrainer-f', team: [121, 115, 128] },
  ]
  // The boss's summons: Kanto, fully evolved, never Psychic like Mew, never legendary / starter / pseudo-legendary.
  const SUMMONS = [68, 76, 34, 71, 112, 115, 128, 134, 59]
  // The Kanto League, tier by tier. Trainers keep three Pokémon at most: tier I is League I +10 with one new pick,
  // tier II +25 with another, tier III everyone at Lv.100. The ace goes last.
  const LEAGUE = [
    {
      name: 'Lorelei',
      img: 'elite-lorelei',
      t: [
        [[91, 62], [124, 64], [131, 66]],
        [[87, 77], [91, 79], [131, 81]],
        [[91, 100], [124, 100], [131, 100]],
      ],
    },
    {
      name: 'Bruno',
      img: 'elite-bruno',
      t: [
        [[107, 64], [95, 64], [68, 66]],
        [[106, 79], [208, 79], [68, 81]],
        [[107, 100], [208, 100], [68, 100]],
      ],
    },
    {
      name: 'Agatha',
      img: 'elite-agatha',
      t: [
        [[93, 64], [24, 64], [94, 68]],
        [[169, 79], [110, 79], [94, 83]],
        [[169, 100], [93, 100], [94, 100]],
      ],
    },
    {
      name: 'Lance',
      img: 'elite-lance',
      t: [
        [[130, 66], [142, 67], [149, 70]],
        [[6, 82], [142, 82], [149, 85]],
        [[230, 100], [142, 100], [149, 100]],
      ],
    },
    {
      name: 'Rival Green',
      img: 'green',
      rival: true,
      t: [
        [[26, 71], [59, 71], [9, 73]],
        [[65, 86], [59, 86], [9, 88]],
        [[26, 100], [65, 100], [9, 100]],
      ],
    },
  ]

  // ------------------------------------------------------------------ preview state
  const EVS = {
    mode: 'save', // save · teaser · wheel · raid · all
    tab: null,
    seen: new Set(),
    queue: [],
    spun: false,
    spinning: false,
    raidKind: 'mew', // mew · shiny · fallback
    raid: null,
    raidTeam: [6, 25, 131],
    allies: ['Lea', 'Noor'],
    tries: 0,
    caught: false,
    // paid: the trainers who already paid out, by tier ('0-2' = tier I, Agatha). Each pays once: after a loss and a
    // restart, beating them again gives no ₽.
    reb: { tier: 0, step: 0, done: 0, paid: new Set() },
    fast: false,
    gifts: 2,
  }
  // The raid is fought in front of the picture of the area that unlocked it (src/fx/areaArtMap.ts). A fallback raid
  // uses the area where the species lives.
  const RAID_ART = {
    151: { area: 'Faraway Island', art: 'lair-island', horizon: 140 },
    149: { area: 'Safari Zone', art: 'marsh', horizon: 103 },
  }
  const raidArt = (dex) => RAID_ART[dex] || RAID_ART[151]
  /** The battle's 240 × 160 window of a 400 px area picture, as an <img> placement (src/fx/areaArt.ts artPlacement). */
  function artWindow(horizon) {
    const K = 400 / 288,
      CROP = (400 - 276 * K) / 2
    const y = horizon == null ? 276 - 160 : Math.max(0, Math.min(276 - 160, Math.round(horizon - 80)))
    const w = 240 * K,
      h = 160 * K
    return `left:${(-(24 * K) / w) * 100}%;top:${(-(CROP + y * K) / h) * 100}%;width:${(400 / w) * 100}%;height:${(400 / h) * 100}%`
  }
  const raidSpecies = () =>
    EVS.raidKind === 'fallback'
      ? { dex: 149, name: 'Dragonite', shiny: true, why: 'Every legendary in your pool is caught or still locked: a powerful Pokémon instead, shiny 30 % of the time.' }
      : EVS.raidKind === 'shiny'
        ? { dex: 151, name: 'Mew', shiny: true, why: 'You own every legendary of your pool: they come back as shinies.' }
        : { dex: 151, name: 'Mew', shiny: false, why: 'From your raid pool: you cleared Faraway Island and don’t own Mew yet.' }

  function unlocked(id) {
    const m = EVS.mode
    if (m === 'teaser') return false
    if (m === 'wheel') return id === 'wheel'
    if (m === 'raid') return id !== 'rebattle'
    if (m === 'all') return true
    return A.clearedArea(A.areaBy(DEF[id].unlock))
  }
  const active = () =>
    Object.keys(DEF)
      .filter((id) => unlocked(id) && !(id === 'rebattle' && EVS.reb.done >= 3))
      .sort((a, b) => CFG.priority[a] - CFG.priority[b])

  // ------------------------------------------------------------------ time (UTC midnight)
  function untilMidnight() {
    const n = new Date()
    const m = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)
    return m - n.getTime()
  }
  function hm(ms) {
    const m = Math.max(1, Math.floor(ms / 60000))
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
  }

  // ------------------------------------------------------------------ art
  const IMG = {}
  function img(src) {
    if (!IMG[src]) {
      const im = new Image()
      im.src = src
      IMG[src] = im
    }
    return IMG[src]
  }
  const front = (d, shiny) => `assets/ev/${pad(d)}_front${shiny ? '_shiny' : ''}.png`
  const back = (d) => `assets/ev/${pad(d)}_back.png`
  const ITEMS = img('assets/items.png')
  const DEXICO = img('assets/dex-icons.png')
  const itemIco = (key) => A.itemIco(ITEM(key) || { i: -1 })
  // Banner pictures: square area art, cropped to a strip around its horizon.
  const ART = { evening: 52, modern: 50, 'lair-shrine': 56, 'lair-summit': 50, champion: 62, league: 56 }
  const artOf = (id) => `--art:url(assets/ev/art/${CFG.banner[id]}.png);--pos:${ART[CFG.banner[id]] ?? 55}%`
  const rewardName = (r) => (r.kind === 'gold' ? `₽${r.amount}` : `${r.amount > 1 ? `${r.amount}× ` : ''}${ITEM(r.key).name}`)
  const rewardIco = (r) => (r.kind === 'gold' ? `<img class="px it coin" alt="" src="${A.icons.COIN}" />` : itemIco(r.key))
  const portrait = (k, cls = '') => `<span class="ev-port ${cls}" style="background-image:url(assets/ev/${k}.png)" aria-hidden="true"></span>`
  const teamIcons = (team) => `<span class="so-team">${team.map((d) => `<span class="so-mon">${d > 251 ? '' : dexIco(d)}</span>`).join('')}</span>`

  // ------------------------------------------------------------------ the Home widgets: one square per event
  // Each open event gets its own widget next to the Day Care and Versus, in priority order.
  const RAID_ICO = [
    '.....kk.....',
    '....kwRk....',
    '...kwRRRk...',
    '..kwRRRRRk..',
    '.kwRRRRRRRk.',
    'kRRRRRRRRRdk',
    '.kRRRRRRRdk.',
    '..kRRRRRdk..',
    '...kRRRdk...',
    '....kRdk....',
    '.....kk.....',
    '............',
  ]
  let ICONS = null
  function icons() {
    if (ICONS) return ICONS
    const c = document.createElement('canvas')
    c.width = c.height = 48
    drawWheel(c.getContext('2d'), 48, 0, { icons: false })
    return (ICONS = {
      raid: PX.icon(RAID_ICO, { k: '#24304f', w: '#ffd5cf', R: '#f2553f', d: '#b8352a' }, 2).toDataURL(),
      wheel: c.toDataURL(),
      rebattle: A.icons.TROPHY,
    })
  }
  const nextFoe = () => (EVS.reb.done >= 3 ? null : LEAGUE[EVS.reb.step])
  function subText(id) {
    if (id === 'wheel') return EVS.spun ? `Next spin in ${hm(untilMidnight())}` : 'One free spin a day'
    if (id === 'raid')
      return `${EVS.caught ? `New raid in ${hm(untilMidnight())}` : `${hm(untilMidnight())} left`} · ${plural(EVS.tries, 'try', 'tries')}`
    const m = nextFoe()
    if (!m) return 'Every tier cleared'
    const team = m.t[EVS.reb.tier]
    return `Fight ${EVS.reb.step + 1} of 5 · Lv.${Math.min(...team.map((x) => x[1]))}–${Math.max(...team.map((x) => x[1]))}`
  }
  function widgetHTML(id) {
    const I = icons()
    const head = (title, tag) => `<span class="hm-w-head"><img class="ev-w-ico${id === 'rebattle' ? ' px' : id === 'raid' ? ' px' : ''}" alt="" src="${I[id]}" /><b>${title}</b>${tag || ''}</span>`
    const sub = `<span class="hm-w-sub" data-ev-sub="${id}">${esc(subText(id))}</span>`
    if (id === 'raid') {
      const r = raidSpecies()
      const label = `Raid: ${r.shiny ? 'shiny ' : ''}${r.name}. ${EVS.caught ? 'Caught' : 'Not caught yet'}. ${subText(id)}. Open`
      return `<button type="button" class="ui-panel hm-w ev-w raid${EVS.caught ? ' done' : ''}" data-ev="raid" aria-label="${esc(label)}">${head('Raid', EVS.caught ? '<span class="ev-tag ok">CAUGHT</span>' : '<span class="hm-new">LIVE</span>')}
        <span class="ev-w-mon"><img class="px" alt="" src="${front(r.dex, r.shiny && r.dex === 151)}" />${r.shiny ? '<span class="ev-rc-sparkle" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</span>
        <span class="hm-w-title">${r.shiny ? '<i class="ev-sh" aria-hidden="true"></i>' : ''}${esc(r.name)}</span>${sub}</button>`
    }
    if (id === 'rebattle') {
      const m = nextFoe()
      const t = CFG.rebattle[EVS.reb.tier]
      const label = m ? `Elite Rebattle, ${t.tier} tier: next, ${m.name}. ${subText(id)}. Open` : 'Elite Rebattle: every tier cleared. Open'
      return `<button type="button" class="ui-panel hm-w ev-w reb" data-ev="rebattle" aria-label="${esc(label)}">${head('Rebattle', `<span class="ev-medal sm m${EVS.reb.tier}" aria-hidden="true"></span>`)}
        ${m ? `<span class="ev-w-next">${portrait(m.img)}<span><small>Next</small><b>${esc(m.name)}</b></span></span>` : ''}${sub}</button>`
    }
    const items = CFG.wheel
      .filter((r) => r.n > 0)
      // Prizes only, no values: the wheel's own page has the amounts and odds.
      .map((r) => `<span class="ev-car-it">${rewardIco(r)}</span>`)
      .join('')
    const label = `Fortune Wheel: ${EVS.spun ? 'spun today' : 'a free spin is ready'}. Prizes: ${CFG.wheel.map(rewardName).join(', ')}. Open`
    return `<button type="button" class="ui-panel hm-w ev-w wheel" data-ev="wheel" aria-label="${esc(label)}">${head('Fortune Wheel')}
      <span class="ev-car" aria-hidden="true"><span class="ev-car-track">${items}${items}</span></span>
      <span class="hm-w-title">${EVS.spun ? 'Spun today' : 'Free spin!'}</span>${sub}</button>`
  }
  function renderWidget() {
    const el = $('#hm-events')
    if (!el) return
    const list = active()
    if (!list.length) {
      const teaser = A.SAVE.badges >= CFG.teaserBadges
      el.innerHTML = `<div class="hm-w hm-events" role="note" aria-label="${teaser ? 'Special events: the first one opens when you clear Routes 7 and 8' : 'Special events: coming later'}"><span class="hm-w-head"><b>Special events</b>${teaser ? `<img class="px hm-w-lock" alt="" src="${A.icons.LOCK}" />` : ''}</span><img class="px hm-ev-star" alt="" src="${starURL()}" /><span class="hm-w-sub">${teaser ? 'Soon: clear Routes 7 & 8' : 'Coming later'}</span></div>`
      return
    }
    el.innerHTML = list.map(widgetHTML).join('')
  }
  /** The countdowns tick without rebuilding the widgets (the prize carousel keeps rolling). */
  function tick() {
    $$('[data-ev-sub]').forEach((s) => (s.textContent = subText(s.dataset.evSub)))
  }
  const status = (id) => ({
    text: subText(id),
    hot: id === 'wheel' ? !EVS.spun : id === 'raid' ? !EVS.caught : EVS.reb.step === 0,
  })
  let STAR = null
  function starURL() {
    if (!STAR) STAR = $('#hm-ico-ev') ? $('#hm-ico-ev').src : ''
    return STAR || ''
  }

  // ------------------------------------------------------------------ the wheel
  /** Slices in wheel order: identical rewards spread out (round-robin over the rows). */
  function slices() {
    const rows = CFG.wheel.map((r) => ({ ...r, left: r.n }))
    const out = []
    let guard = 0
    while (rows.some((r) => r.left > 0) && guard++ < 99)
      for (const r of [...rows].sort((a, b) => b.left - a.left))
        if (r.left > 0 && (!out.length || out[out.length - 1].row !== r || rows.filter((x) => x.left).length === 1)) {
          out.push({ row: r, odds: r.odds })
          r.left--
          break
        }
    return out
  }
  const SLICE_COL = { gold: ['#ffe7a8', '#ffd76a'], 'poke-ball': ['#ffc2b8', '#ff8f7f'], 'great-ball': ['#b8d4ff', '#8ab4ff'], 'ultra-ball': ['#d6dbe6', '#aab4c8'], 'master-ball': ['#e2c4ff', '#c58aff'] }
  const sliceCol = (r, i) => (SLICE_COL[r.kind === 'gold' ? 'gold' : r.key] || ['#e3e9f2', '#cfd8e6'])[i % 2]
  /**
   * The wheel, drawn at the screen's own resolution. The outer ring stands still and carries the marquee bulbs; the
   * disc inside turns: slices, pegs, the prizes upright (item art at a whole-number scale, so it stays sharp) and the
   * amounts in Jersey 20. S is the canvas size in device pixels; u scales everything from the 288 px it is designed at.
   * o.lights(i, nb) → 0 off · 1 on · 2 white-hot; o.blur: degrees of motion smear; o.win: { k, flash, dim }.
   */
  function drawWheel(g, S, rot, o = {}) {
    const sl = o.slices || slices()
    const n = sl.length
    const u = S / 288
    const c = S / 2
    const R = S / 2 - 1
    const rad = (d) => (d * Math.PI) / 180
    const step = 360 / n
    g.clearRect(0, 0, S, S)
    g.save()
    g.imageSmoothingEnabled = true
    const disc = (r, fill, stroke, lw) => {
      g.beginPath()
      g.arc(c, c, r, 0, Math.PI * 2)
      if (fill) {
        g.fillStyle = fill
        g.fill()
      }
      if (stroke) {
        g.strokeStyle = stroke
        g.lineWidth = lw
        g.stroke()
      }
    }
    // The ring: navy edge, a gold band with its bulbs, a navy inner edge.
    disc(R, '#24304f')
    disc(R - 3 * u, '#e8a21c')
    disc(R - 5 * u, '#ffbe2e')
    const r = R - 15 * u
    disc(r + 2.5 * u, '#24304f')
    const nb = n * 3
    if (u > 0.4)
      for (let i = 0; i < nb; i++) {
        const a = rad(-90 + (i + 0.5) * (360 / nb))
        const br = R - 8.5 * u
        const x = c + Math.cos(a) * br,
          y = c + Math.sin(a) * br
        const st = o.lights ? o.lights(i, nb) : 0
        if (st) {
          g.beginPath()
          g.arc(x, y, 6 * u, 0, Math.PI * 2)
          g.fillStyle = st === 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,240,160,0.45)'
          g.fill()
        }
        g.beginPath()
        g.arc(x, y, 3 * u, 0, Math.PI * 2)
        g.fillStyle = st === 2 ? '#ffffff' : st ? '#fff6c0' : '#b8862a'
        g.fill()
        g.lineWidth = Math.max(1, 1.2 * u)
        g.strokeStyle = '#7a5410'
        g.stroke()
      }
    // The slices; at speed, ghost passes behind smear them along the turn.
    const slicesAt = (rr, alpha) => {
      g.globalAlpha = alpha
      sl.forEach((sx, i) => {
        const a0 = rad(-90 + i * step + rr),
          a1 = rad(-90 + (i + 1) * step + rr)
        g.beginPath()
        g.moveTo(c, c)
        g.arc(c, c, r, a0, a1)
        g.closePath()
        g.fillStyle = sliceCol(sx.row, i)
        g.fill()
      })
      g.globalAlpha = 1
    }
    const blur = Math.min(40, o.blur || 0)
    if (blur > 1.5) for (let j = 3; j >= 1; j--) slicesAt(rot - (blur * j) / 3, 0.35)
    slicesAt(rot, blur > 1.5 ? 0.85 : 1)
    sl.forEach((sx, i) => {
      const a0 = rad(-90 + i * step + rot),
        a1 = rad(-90 + (i + 1) * step + rot)
      g.beginPath()
      g.arc(c, c, r, a0, a1)
      g.arc(c, c, r - 8 * u, a1, a0, true)
      g.closePath()
      g.fillStyle = 'rgba(255,255,255,0.35)'
      g.fill()
    })
    // Slice edges and pegs.
    g.strokeStyle = '#24304f'
    g.lineWidth = Math.max(1, 2.5 * u)
    for (let i = 0; i < n; i++) {
      const a = rad(-90 + i * step + rot)
      g.beginPath()
      g.moveTo(c, c)
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
      g.stroke()
    }
    if (u > 0.4)
      for (let i = 0; i < n; i++) {
        const a = rad(-90 + i * step + rot)
        const pr = r - 4 * u
        g.beginPath()
        g.arc(c + Math.cos(a) * pr, c + Math.sin(a) * pr, 2.8 * u, 0, Math.PI * 2)
        g.fillStyle = '#fbfdff'
        g.fill()
        g.lineWidth = 1.5 * u
        g.stroke()
      }
    if (o.icons !== false) {
      // Upright prizes: their slice turns, they don't.
      const k = Math.max(1, Math.round(u * 1.5))
      const sz = 30 * k
      const fs = Math.round(20 * u)
      g.font = `${fs}px 'Jersey 20', 'Jersey 15', sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      sl.forEach((sx, i) => {
        const a = rad((i + 0.5) * step + rot)
        const ri = r * 0.64
        const x = Math.round(c + Math.sin(a) * ri),
          y = Math.round(c - Math.cos(a) * ri)
        const label = sx.row.kind === 'gold' ? `₽${sx.row.amount}` : sx.row.amount > 1 ? `×${sx.row.amount}` : ''
        if (sx.row.kind === 'item' && ITEMS.complete) {
          const it = ITEM(sx.row.key)
          g.imageSmoothingEnabled = false
          g.drawImage(ITEMS, it.i * 30, 0, 30, 30, Math.round(x - sz / 2), Math.round(y - sz / 2 - (label ? 6 * u : 0)), sz, sz)
          g.imageSmoothingEnabled = true
        }
        if (label) {
          const ly = sx.row.kind === 'gold' ? y : y + 14 * u
          g.lineWidth = Math.max(2, 4 * u)
          g.strokeStyle = '#fbfdff'
          g.strokeText(label, x, ly)
          g.fillStyle = '#24304f'
          g.fillText(label, x, ly)
        }
      })
    }
    // The win: the others sink into shadow, the winning slice blinks white.
    if (o.win) {
      sl.forEach((sx, i) => {
        const a0 = rad(-90 + i * step + rot),
          a1 = rad(-90 + (i + 1) * step + rot)
        const isWin = i === o.win.k
        const alpha = isWin ? o.win.flash * 0.75 : o.win.dim * 0.55
        if (alpha <= 0) return
        g.beginPath()
        g.moveTo(c, c)
        g.arc(c, c, r, a0, a1)
        g.closePath()
        g.fillStyle = isWin ? `rgba(255,255,255,${alpha})` : `rgba(20,26,48,${alpha})`
        g.fill()
      })
      if (o.win.dim > 0) {
        const a0 = rad(-90 + o.win.k * step + rot),
          a1 = rad(-90 + (o.win.k + 1) * step + rot)
        g.beginPath()
        g.moveTo(c, c)
        g.arc(c, c, r, a0, a1)
        g.closePath()
        g.lineWidth = 5 * u
        g.strokeStyle = '#ffbe2e'
        g.stroke()
      }
    }
    // The hub.
    disc(24 * u, '#fbfdff', '#24304f', Math.max(1, 3 * u))
    disc(9 * u, '#f2553f', '#24304f', Math.max(1, 2 * u))
    g.restore()
  }

  // The wheel's state: one loop draws it (and its effects canvas) from here; spin() only moves the numbers.
  const W = { rot: 0, cv: null, fx: null, S: 288, F: 400, M: 0, dpr: 1, vel: 0, chase: 0, mode: 'idle', win: null, pop: null, parts: [], flash: 0, raf: 0, last: 0 }
  HOME.wheel = W // the lab's preview checks read it
  function wheelTab() {
    const sl = slices()
    return `<div class="ev-wheel${EVS.spun ? ' won' : ''}" id="ev-wheel">
        <span class="ev-wheel-rays" aria-hidden="true"></span>
        <span class="ev-pointer" id="ev-pointer" aria-hidden="true"></span>
        <canvas id="ev-wcv" width="288" height="288" role="img" aria-label="The wheel: ${sl.length} slices, ${esc(CFG.wheel.filter((r) => r.n).map((r) => `${r.n} × ${rewardName(r)}`).join(', '))}"></canvas>
        <canvas class="ev-wfx" id="ev-wfx" aria-hidden="true"></canvas>
      </div>
      <div class="ev-wheel-foot">
        <div class="ev-wheel-btns"><button type="button" class="ev-info" data-odds aria-label="Info: every prize and its odds"><span>Info</span></button>${
          EVS.spun
            ? `<p class="ev-next"><b>Come back tomorrow</b><small>Next spin in ${hm(untilMidnight())}</small></p>`
            : `<button type="button" class="ui-btn primary ev-spin" data-spin${EVS.spinning ? ' disabled' : ''}><span>Spin!</span></button>`
        }</div>
        ${EVS.spun ? '<button type="button" class="pg-hint" data-respin>Preview: spin again</button>' : '<p class="pg-tip">Free once a day. A new spin at midnight UTC.</p>'}
      </div>`
  }
  function mountWheel() {
    W.cv = $('#ev-wcv')
    W.fx = $('#ev-wfx')
    if (!W.cv) return
    W.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    const css = W.cv.getBoundingClientRect().width || 288
    W.S = Math.round(css * W.dpr)
    W.cv.width = W.cv.height = W.S
    // The effects canvas reaches past the wheel so sparks and coins can fly out of it.
    const fr = W.fx.getBoundingClientRect()
    W.F = Math.round(fr.width * W.dpr)
    W.M = Math.round((fr.width - css) / 2) * W.dpr
    W.fx.width = W.F
    W.fx.height = Math.round(fr.height * W.dpr)
    W.mode = EVS.spun ? 'won' : 'idle'
    if (EVS.spun && W.win) W.win.dim = 1
    cancelAnimationFrame(W.raf)
    W.last = performance.now()
    W.raf = requestAnimationFrame(wheelLoop)
    if (document.fonts) document.fonts.load("20px 'Jersey 20'")
  }
  /** The marquee: a slow chase when idle, a fast one while it turns, everything blinking on a win. */
  function lightsFn(t) {
    if (W.mode === 'won') return (i) => (i % 2 ? 1 : 0)
    if (W.mode === 'win') return () => (Math.floor(t * 9) % 2 ? 2 : 1)
    const ph = Math.floor(W.chase)
    return (i, nb) => ((i + ph) % 3 === 0 ? (W.mode === 'spin' ? 2 : 1) : (W.mode === 'spin' && (i + ph) % 3 === 1 ? 1 : 0))
  }
  function wheelLoop(now) {
    if (!W.cv || !W.cv.isConnected) return
    const dt = Math.min(0.05, (now - W.last) / 1000)
    W.last = now
    const t = now / 1000
    W.chase += dt * (W.mode === 'spin' ? 4 + Math.abs(W.vel) * 0.9 : 3)
    let win = null
    if (W.win && (W.mode === 'win' || W.mode === 'won')) {
      const e = (now - W.win.t0) / 1000
      win = { k: W.win.k, flash: W.mode === 'won' ? 0 : e < 0.9 ? (Math.floor(e * 7) % 2 ? 1 : 0.15) : 0.25 + 0.15 * Math.sin(e * 6), dim: W.mode === 'won' ? 1 : Math.min(1, e * 2.5) }
    }
    drawWheel(W.cv.getContext('2d'), W.S, W.rot, { lights: lightsFn(t), blur: Math.abs(W.vel) * 1.6, win })
    fxDraw(dt, now)
    W.raf = requestAnimationFrame(wheelLoop)
  }
  // The effects: sparks off the pegs, the prize popping out, coins and stars.
  const FXC = { coin: ['#ffe066', '#ffbe2e', '#c88a1a'], star: ['#ffffff', '#fff6a8', '#ffbe2e', '#7fd6ff', '#ff9ad5'] }
  function fxCenter() {
    return { x: W.F / 2, y: W.M + W.S / 2 }
  }
  function burst(kind, n, o = {}) {
    if (REDUCED) return
    const c = o.at || fxCenter()
    const u = W.S / 288
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * Math.PI * 2
      const sp = (o.speed || 6) * (0.4 + Math.random()) * u
      W.parts.push({
        kind,
        x: c.x,
        y: c.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.lift || 0) * u,
        g: (o.g ?? 0.25) * u,
        life: o.life || 1.2 + Math.random() * 0.6,
        age: 0,
        s: (o.size || 3) * u * (0.7 + Math.random() * 0.6),
        c: (FXC[kind] || FXC.star)[Math.floor(Math.random() * (FXC[kind] || FXC.star).length)],
        spin: Math.random() * Math.PI,
      })
    }
  }
  function fxDraw(dt, now) {
    if (!W.fx) return
    const g = W.fx.getContext('2d')
    g.clearRect(0, 0, W.fx.width, W.fx.height)
    const u = W.S / 288
    for (let i = W.parts.length - 1; i >= 0; i--) {
      const p = W.parts[i]
      p.age += dt
      if (p.age > p.life) {
        W.parts.splice(i, 1)
        continue
      }
      p.vy += p.g
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.985
      p.spin += dt * 8
      const a = Math.min(1, (p.life - p.age) * 3)
      g.globalAlpha = a
      if (p.kind === 'coin') {
        // A spinning coin: its width follows the spin.
        const w = Math.max(1, Math.abs(Math.cos(p.spin)) * p.s * 2)
        g.fillStyle = '#7a5410'
        g.fillRect(Math.round(p.x - w / 2 - u), Math.round(p.y - p.s - u), Math.round(w + 2 * u), Math.round(p.s * 2 + 2 * u))
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - p.s), Math.round(w), Math.round(p.s * 2))
      } else if (p.kind === 'spark') {
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.s), Math.round(p.s))
        g.globalAlpha = a * 0.4
        g.fillRect(Math.round(p.x - p.vx), Math.round(p.y - p.vy), Math.round(p.s), Math.round(p.s))
      } else {
        // A four-point star.
        const s = Math.round(p.s * (0.8 + 0.4 * Math.sin(p.spin)))
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x - s), Math.round(p.y - s / 3), s * 2, Math.round((s * 2) / 3))
        g.fillRect(Math.round(p.x - s / 3), Math.round(p.y - s), Math.round((s * 2) / 3), s * 2)
      }
    }
    g.globalAlpha = 1
    // The prize, out of its slice and up to the middle, big.
    if (W.pop) {
      const e = Math.min(1, (now - W.pop.t0) / 650)
      const c = fxCenter()
      const p = PX.ease.outBack(e, 1.6)
      const x = W.pop.x + (c.x - W.pop.x) * PX.ease.outQ(e),
        y = W.pop.y + (c.y - W.pop.y) * PX.ease.outQ(e)
      const k = Math.max(1, Math.round(u * (1.5 + 2.5 * Math.min(1, p))))
      const sz = 30 * k
      const bob = e >= 1 ? Math.sin(now / 180) * 3 * u : 0
      // A glow behind it.
      const gr = g.createRadialGradient(x, y + bob, 0, x, y + bob, sz)
      gr.addColorStop(0, 'rgba(255,240,160,0.95)')
      gr.addColorStop(1, 'rgba(255,190,46,0)')
      g.fillStyle = gr
      g.beginPath()
      g.arc(x, y + bob, sz, 0, Math.PI * 2)
      g.fill()
      g.imageSmoothingEnabled = false
      if (W.pop.kind === 'gold') {
        const coin = img(A.icons.COIN)
        if (coin.complete) g.drawImage(coin, Math.round(x - sz / 2), Math.round(y + bob - sz / 2), sz, sz)
      } else if (ITEMS.complete) g.drawImage(ITEMS, W.pop.i * 30, 0, 30, 30, Math.round(x - sz / 2), Math.round(y + bob - sz / 2), sz, sz)
      g.imageSmoothingEnabled = true
    }
    if (W.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${W.flash})`
      g.fillRect(0, 0, W.fx.width, W.fx.height)
      W.flash = Math.max(0, W.flash - dt * 2.2)
    }
  }
  function pickSlice() {
    const sl = slices()
    const tot = sl.reduce((n, s) => n + s.odds, 0)
    let x = Math.random() * tot
    for (let i = 0; i < sl.length; i++) if ((x -= sl[i].odds) <= 0) return i
    return sl.length - 1
  }
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  async function spin() {
    if (EVS.spinning || EVS.spun) return
    EVS.spinning = true
    $('[data-spin]').disabled = true
    const box = $('#ev-wheel')
    const sl = slices()
    const n = sl.length,
      s = 360 / n
    const k = pickSlice()
    const r = sl[k].row
    const jackpot = r.kind === 'item' && (r.key === 'ultra-ball' || r.key === 'master-ball')
    const ptr = $('#ev-pointer')
    const flick = () => {
      if (!ptr || REDUCED) return
      ptr.classList.remove('flick')
      void ptr.offsetWidth
      ptr.classList.add('flick')
    }
    // 1. The wind-up: it creaks back a little, the lights speed up.
    W.mode = 'spin'
    box.classList.add('spinning')
    const back = REDUCED ? 0 : 16
    let t0 = performance.now()
    const r0 = W.rot
    while (!REDUCED) {
      const e = Math.min(1, (performance.now() - t0) / 420)
      W.rot = r0 - back * PX.ease.outQ(e)
      if (e > 0.3 && e < 0.35) SND().tone(180, 0.08, { type: 'square', vol: 0.03 })
      if (e >= 1) break
      await frame()
    }
    // 2. The launch: a whoosh, then a long ease out with a teeter at the end.
    SND().noise(0.6, { vol: 0.07, freq: 600, slide: 2400 })
    const jitter = (Math.random() - 0.5) * s * 0.6
    const start = W.rot
    const end = start - (((start % 360) + 360) % 360) + 360 * 7 - (k + 0.5) * s + jitter
    const total = end - start
    const T = REDUCED ? 600 : 5600
    let last = Math.floor(start / s)
    let prev = start
    t0 = performance.now()
    for (;;) {
      const t = Math.min(1, (performance.now() - t0) / T)
      // Out-quart to a third of a slice past the target, then a teeter back onto it.
      const p = t < 0.9 ? (1 - Math.pow(1 - t / 0.9, 4)) * (1 + (s * 0.33) / total) : 1 + ((s * 0.33) / total) * (1 - PX.ease.ioS((t - 0.9) / 0.1))
      W.rot = start + total * p
      W.vel = W.rot - prev
      prev = W.rot
      const cur = Math.floor(W.rot / s)
      if (cur !== last) {
        last = cur
        SND().tone(1600 - 900 * t, 0.025, { vol: 0.035 })
        flick()
        // Sparks where the pointer scrapes the pegs, more at speed.
        const c = fxCenter()
        burst('spark', Math.min(6, 1 + Math.round(Math.abs(W.vel) / 3)), { at: { x: c.x, y: W.M + 14 * (W.S / 288) }, dir: -Math.PI / 2, spread: 2.2, speed: 4, g: 0.2, life: 0.5, size: 2.5 })
      }
      box.style.setProperty('--spin', `${Math.min(1, Math.abs(W.vel) / 14)}`)
      if (t >= 1) break
      await frame()
    }
    W.vel = 0
    W.rot = end
    box.style.setProperty('--spin', '0')
    // 3. The land: a clack, a shake, the winning slice blinks while the rest go dark.
    SND().tone(220, 0.09, { type: 'square', vol: 0.05 })
    SND().noise(0.12, { vol: 0.05, freq: 1800 })
    box.classList.remove('spinning')
    box.classList.add('landed', jackpot ? 'jackpot' : 'win')
    W.mode = 'win'
    W.win = { k, t0: performance.now() }
    await new Promise((res) => setTimeout(res, REDUCED ? 100 : 750))
    // 4. The prize pops out of its slice and grows in the middle; coins and stars fly.
    const c = fxCenter()
    const u = W.S / 288
    W.pop = { t0: performance.now(), x: c.x, y: c.y - (W.S / 2 - 15 * u) * 0.64, kind: r.kind, i: r.kind === 'item' ? ITEM(r.key).i : 0 }
    SND().tone(660, 0.1, { vol: 0.05, slide: 600 })
    await new Promise((res) => setTimeout(res, REDUCED ? 50 : 420))
    if (r.kind === 'gold') burst('coin', 26, { speed: 7, lift: 4, g: 0.3, size: 4 })
    burst('star', jackpot ? 46 : 22, { speed: jackpot ? 9 : 6, g: 0.05, size: jackpot ? 5 : 4, life: 1.4 })
    if (jackpot) {
      W.flash = 0.9
      burst('coin', 40, { speed: 9, lift: 5, g: 0.32, size: 4 })
      const notes = [523, 659, 784, 1047, 784, 1047, 1319]
      notes.forEach((f, i) => SND().tone(f, 0.14, { vol: 0.05, at: i * 0.1 }))
      // A shower from the top for a while.
      for (let i = 0; i < 6; i++)
        setTimeout(() => burst('coin', 8, { at: { x: Math.random() * W.F, y: 0 }, dir: Math.PI / 2, spread: 0.6, speed: 2, g: 0.3, size: 4, life: 2 }), 200 * i)
    } else {
      SND().tone(880, 0.08, { vol: 0.045 })
      SND().tone(1320, 0.18, { vol: 0.045, at: 0.08 })
    }
    await new Promise((res) => setTimeout(res, REDUCED ? 100 : jackpot ? 1700 : 1150))
    // 5. Paid out, then the card.
    EVS.spinning = false
    EVS.spun = true
    W.pop = null
    W.mode = 'won'
    if (r.kind === 'gold') {
      A.SAVE.gold += r.amount
      A.bumpGold()
    } else if (A.SAVE.bag) A.SAVE.bag[r.key] = (A.SAVE.bag[r.key] || 0) + r.amount
    rerender()
    showReward(r, k)
  }
  function showReward(r) {
    const big = r.kind === 'item' && (r.key === 'ultra-ball' || r.key === 'master-ball')
    const ov = overlay()
    ov.innerHTML = `<div class="ev-reward${big ? ' big' : ''}" role="dialog" aria-modal="true" aria-labelledby="ev-rw-t">
      ${big ? '<canvas class="ev-confetti" width="288" height="320" aria-hidden="true"></canvas>' : ''}
      <span class="ev-rays" aria-hidden="true"></span>
      <span class="ev-rw-ico">${r.kind === 'gold' ? `<img class="px" alt="" src="${A.icons.COIN}" />` : `<span class="it x3" style="background-position:-${ITEM(r.key).i * 90}px 0"></span>`}</span>
      <p class="ev-rw-eyebrow">${big ? 'JACKPOT!' : 'You won'}</p>
      <h3 id="ev-rw-t">+${esc(rewardName(r))}</h3>
      <p class="ev-rw-sub">${r.kind === 'gold' ? 'Added to your money.' : 'Added to your Bag.'}</p>
      <button type="button" class="ui-btn primary wide" data-ov-close><span>Nice!</span></button></div>`
    ov.hidden = false
    $('[data-ov-close]', ov).focus()
    if (big) confetti($('.ev-confetti', ov))
  }
  function confetti(cv) {
    if (!cv || REDUCED) return
    const g = cv.getContext('2d')
    const cols = ['#ffbe2e', '#f2553f', '#34c97a', '#5b8def', '#c58aff', '#ffffff']
    const ps = Array.from({ length: 70 }, () => ({
      x: 144 + (Math.random() - 0.5) * 40,
      y: 150,
      vx: (Math.random() - 0.5) * 6,
      vy: -3 - Math.random() * 5,
      c: cols[Math.floor(Math.random() * cols.length)],
      s: Math.random() < 0.5 ? 2 : 3,
    }))
    let f = 0
    const step = () => {
      if (!cv.isConnected || f++ > 150) return
      g.clearRect(0, 0, 288, 320)
      for (const p of ps) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12
        p.vx *= 0.99
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s)
      }
      requestAnimationFrame(step)
    }
    step()
  }
  function oddsSheet() {
    const tot = CFG.wheel.reduce((n, r) => n + r.n * r.odds, 0)
    $('#hm-s2-title').textContent = 'Prizes and odds'
    $('#hm-s2-sub').textContent = `${slices().length} slices of the same size`
    $('#hm-s2-body').innerHTML = `<p class="pg-note">The slices all look the same size, but each prize has its own chance. These are the real odds of every spin.</p>
      <table class="ev-odds"><thead><tr><th scope="col">Prize</th><th scope="col">Slices</th><th scope="col">Chance</th></tr></thead><tbody>${CFG.wheel
        .map((r) => `<tr><td>${rewardIco(r)}${esc(rewardName(r))}</td><td>${r.n}</td><td><b>${+(r.n * r.odds).toFixed(2)} %</b><small>${r.n > 1 ? `${r.odds} % each` : ''}</small></td></tr>`)
        .join('')}</tbody></table>${Math.abs(tot - 100) > 0.01 ? `<p class="pg-tip">The admin odds add up to ${+tot.toFixed(2)} %: the game scales them to 100 %.</p>` : ''}`
    $('#hm-s2-foot').hidden = true
    A.openDialog($('#hm-sheet2'))
  }

  // ------------------------------------------------------------------ the raid tab
  const friendBy = (n) => FRIENDS.find((f) => f.name === n)
  function sidesFor() {
    const sides = [{ name: 'You', look: A.SAVE.look || 'red', team: EVS.raidTeam, me: true }]
    for (const n of EVS.allies.slice(0, CFG.raid.maxFriends)) sides.push({ ...friendBy(n), friend: true })
    let k = 0
    while (sides.length < 3) sides.push({ ...NPCS[k++ % NPCS.length], npc: true })
    return sides
  }
  function raidTab() {
    const r = raidSpecies()
    const R = CFG.raid
    const empty = Math.max(0, R.maxFriends - EVS.allies.length)
    const ra = raidArt(r.dex)
    return `<div class="ev-raidcard${EVS.caught ? ' done' : ''}"><img class="rd-art" alt="" src="assets/ev/art/${ra.art}.png" style="${artWindow(ra.horizon)}" /><span class="ev-rc-where">${esc(ra.area)}</span>
        <span class="ev-rc-time">${EVS.caught ? 'New raid in' : 'Ends in'} ${hm(untilMidnight())}</span>
        <img class="px ev-rc-mon${r.shiny ? ' shiny' : ''}" alt="" src="${front(r.dex, r.shiny && r.dex === 151)}" />
        ${r.shiny ? '<span class="ev-rc-sparkle" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
        <span class="ev-rc-name"><b>${r.shiny ? 'Shiny ' : ''}${esc(r.name)}</b><small>Raid · Lv.${R.level} · ${R.bars} HP bars</small></span>
        <span class="ev-rc-bars" aria-hidden="true">${Array.from({ length: R.bars }, (_, i) => `<i style="--c:${R.colors[i % R.colors.length]}"></i>`).join('')}</span>
        ${EVS.caught ? '<span class="ev-stamp">CAUGHT</span>' : ''}
      </div>
      ${
        EVS.caught
          ? `<p class="ev-closed">You caught today’s raid. Your raid team stays registered for your friends: they can still bring it along.</p>`
          : `<button type="button" class="ui-btn primary wide ev-go" data-raidgo><span>Start the raid</span></button>
      <p class="pg-tip">${EVS.tries ? `${plural(EVS.tries, 'try', 'tries')} today · ` : ''}Free retries until it’s caught. Friends who help you catch it get a gift.</p>
      <div class="pg-sec-h"><h3>Your raid team</h3><span class="pg-count">Lv.${R.teamCap} max</span><button type="button" class="pg-hint" data-raidteam>Change</button></div>
      <ol class="ev-myteam">${EVS.raidTeam.map((d, i) => `<li><span class="so-n">${i + 1}</span>${dexIco(d)}<b>${esc(A.K.names[d])}</b></li>`).join('')}</ol>
      <div class="pg-sec-h"><h3>Your group</h3><span class="pg-count">${EVS.allies.length}/${R.maxFriends} friends</span></div>
      <ul class="ev-sides">${EVS.allies
        .slice(0, R.maxFriends)
        .map((n) => friendBy(n))
        .map(
          (s) =>
            `<li>${A.lookOf(s.look)}<span class="so-who"><b>${esc(s.name)}</b>${teamIcons(s.team)}<small>Plays on their own · helped you ${plural(s.helped, 'time')}</small></span><button type="button" class="pg-hint" data-unally="${esc(s.name)}" aria-label="Remove ${esc(s.name)}">✕</button></li>`,
        )
        .join('')}${Array.from({ length: empty }, () => '<li class="empty"><span class="ev-slot-plus" aria-hidden="true">+</span><span class="so-who"><b>Empty slot</b><small>Pick a friend below</small></span></li>').join('')}</ul>
      <details class="ev-friends"${empty ? ' open' : ''}><summary>Friends with a raid team <i>${FRIENDS.length}</i></summary>
        <ul>${FRIENDS.map((f) => {
          const on = EVS.allies.includes(f.name)
          return `<li><button type="button" class="pg-useit" data-ally="${esc(f.name)}" aria-pressed="${on}">${A.lookOf(f.look)}<span><b>${esc(f.name)}</b>${teamIcons(f.team)}</span>${on ? '<em class="ev-check" aria-label="Picked"></em>' : ''}</button></li>`
        }).join('')}</ul></details>`
      }`
  }
  /** Starting with empty slots: say once that trainers fill them, then start. */
  function raidGo() {
    const empty = Math.max(0, CFG.raid.maxFriends - EVS.allies.length)
    if (!empty) return startRaid()
    const ov = overlay()
    ov.innerHTML = `<div class="ev-reward ev-confirm" role="dialog" aria-modal="true" aria-labelledby="ev-cf-t">
      <span class="ev-cf-slots" aria-hidden="true">${Array.from({ length: CFG.raid.maxFriends }, (_, i) => (i < EVS.allies.length ? A.lookOf(friendBy(EVS.allies[i]).look) : A.lookOf(NPCS[(i - EVS.allies.length) % NPCS.length].look, 'npc'))).join('')}</span>
      <h3 id="ev-cf-t">${empty > 1 ? 'Empty slots' : 'An empty slot'}</h3>
      <p class="ev-rw-sub">The empty ${empty > 1 ? 'slots' : 'slot'} in your group will be filled with NPC, invite friends next time!</p>
      <div class="ev-pop-foot"><button type="button" class="ui-btn" data-ov-close><span>Back</span></button><button type="button" class="ui-btn primary" data-ov-raid><span>Start</span></button></div></div>`
    ov.hidden = false
    $('[data-ov-raid]', ov).focus()
  }
  function raidTeamSheet() {
    const pick = [...EVS.raidTeam]
    const draw = () => {
      const own = (A.owned ? A.owned() : A.TEAM).filter((m, i, a) => a.findIndex((x) => x.dex === m.dex) === i)
      $('#hm-s2-body').innerHTML = `<p class="pg-note">Pick three, in the order they go out. They fight at Lv.${CFG.raid.teamCap} at most, and friends can bring them to their own raids.</p>
        <ul class="so-pick">${own
          .slice(0, 24)
          .map((m) => {
            const at = pick.indexOf(m.dex)
            return `<li><button type="button" class="pg-useit" data-rpick="${m.dex}" aria-pressed="${at >= 0}">${dexIco(m.dex)}<span><b>${esc(m.name || A.K.names[m.dex])}</b><small>Lv.${m.lv}${m.lv > CFG.raid.teamCap ? ` → ${CFG.raid.teamCap}` : ''}</small></span>${at >= 0 ? `<em class="so-order">${at + 1}</em>` : ''}</button></li>`
          })
          .join('')}</ul>`
      const foot = $('#hm-s2-foot')
      foot.hidden = false
      foot.innerHTML = `<button type="button" class="ui-btn primary wide" data-rsave${pick.length === 3 ? '' : ' disabled'}><span>Save raid team</span></button>`
    }
    $('#hm-s2-title').textContent = 'Raid team'
    $('#hm-s2-sub').textContent = 'Three Pokémon, Lv.50 at most'
    draw()
    const sh = $('#hm-sheet2')
    sh.onclick = (e) => {
      const b = e.target.closest('[data-rpick]')
      if (b) {
        const d = Number(b.dataset.rpick),
          at = pick.indexOf(d)
        if (at >= 0) pick.splice(at, 1)
        else if (pick.length < 3) pick.push(d)
        else return A.toast('Three at most: tap one to take it out first')
        draw()
        return $(`[data-rpick="${d}"]`).focus({ preventScroll: true })
      }
      if (e.target.closest('[data-rsave]')) {
        EVS.raidTeam = pick
        sh.onclick = null
        A.closeDialog(sh)
        rerender()
        A.toast('Raid team saved: friends can bring it along too')
      }
    }
    A.openDialog(sh)
  }

  // ------------------------------------------------------------------ the raid battle
  let RB = null
  const typesOf = (d) => A.K.types[d] || ['normal']
  function kit(dex) {
    const m = A.G.mons[dex]
    if (!m) return { dice: ['base', 'base', 'base'], rr: 3, sp: 8 }
    const dice = m.dice.flatMap(([t, n]) => Array(n).fill(t))
    let rr = m.rr
    for (const [lv, kind, a, b, n] of m.ms || []) {
      if (lv > 50) continue
      if (kind === 'ADD_DIE') dice.push(a)
      if (kind === 'REPLACE_DIE') {
        const i = dice.indexOf(b)
        if (i >= 0) dice[i] = a
      }
      if (kind === 'ADD_REROLL') rr += n || 1
    }
    return { dice: dice.slice(0, 5), rr, sp: m.sp }
  }
  function mon(dex, side) {
    const max = A.hpAt(dex, 50) || 150
    const k = kit(dex)
    return { dex, name: A.K.names[dex] || `#${dex}`, types: typesOf(dex), hp: max, max, sp: k.sp, dice: k.dice, rr: k.rr, side }
  }
  function mult(att, def) {
    const ch = A.G.chart
    return def.reduce((m, t) => m * ((ch[att] || {})[t] ?? 1), 1)
  }
  /** The engine's attack, simplified for the mock: sum + combo, × the best type of the dice against the target. */
  function evalRoll(roll, def) {
    const vals = roll.map((d) => d.v).sort((a, b) => a - b)
    const counts = {}
    vals.forEach((v) => (counts[v] = (counts[v] || 0) + 1))
    const most = Math.max(...Object.values(counts))
    let run = 1,
      best = 1
    const u = [...new Set(vals)]
    for (let i = 1; i < u.length; i++) best = Math.max(best, (run = u[i] === u[i - 1] + 1 ? run + 1 : 1))
    const combo = most >= 4 ? ['Four of a kind', 12] : best >= 4 ? ['Straight', 10] : most === 3 ? ['Three of a kind', 7] : most === 2 && Object.values(counts).filter((c) => c === 2).length === 2 ? ['Two pairs', 5] : most === 2 ? ['Pair', 3] : null
    const sum = vals.reduce((a, b) => a + b, 0)
    const types = [...new Set(roll.map((d) => d.t).filter((t) => t !== 'base'))]
    const m = types.length ? Math.max(...types.map((t) => mult(t, def))) : 1
    return { sum, combo, mult: m, dmg: Math.max(1, Math.round((sum + (combo ? combo[1] : 0)) * m)) }
  }
  const rollDice = (dice) => dice.map((t) => ({ t, v: 1 + Math.floor(Math.random() * 6) }))

  function startRaid() {
    const r = raidSpecies()
    const R = CFG.raid
    EVS.tries++
    if (RB) RB.over = true
    const boss = mon(r.dex, 'boss')
    boss.shiny = r.shiny
    boss.bars = R.bars
    boss.bar = 0
    RB = {
      boss,
      summons: Array(Math.min(2, R.maxField)).fill(null),
      points: 0,
      sides: sidesFor().map((s, i) => ({ ...s, i, k: 0, mons: s.team.map((d) => mon(d, i)), out: false })),
      fx: { shake: 0, flash: 0, ring: [] },
      // Who stands in front: the foe at the top right, the ally at the bottom left. Everyone else waits in the queues.
      front: { foe: 'boss', own: 0 },
      list: [],
      at: -1,
      lastTarget: null,
      ball: null,
      picking: false,
      over: false,
      target: 'boss',
    }
    RB.summonPool = SUMMONS.filter((d) => !typesOf(d).some((t) => boss.types.includes(t)))
    A.showPage('raid')
  }
  const activeOf = (s) => (s.out ? null : s.mons[s.k])
  const foeOf = (id) => (id === 'boss' ? RB.boss : RB.summons[+id[1]] || null)
  const ownerName = (s) => (s.me ? 'You' : s.name.replace('Ace Trainer ', ''))
  const hpVar = (p) => (p > 0.5 ? 'var(--hp-hi)' : p > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)')
  function raidRender(p) {
    p.innerHTML = `
      <div class="bt-stage stage rd-stage" id="rd-stage"><img class="rd-art" alt="" src="assets/ev/art/${raidArt(RB.boss.dex).art}.png" style="${artWindow(raidArt(RB.boss.dex).horizon)}" />
        <canvas id="rd-cv" width="240" height="160" role="img" aria-label="The raid: the Pokémon in front on each side"></canvas>
        <div class="ui-plate foe" id="rd-foe"></div>
        <div class="ui-plate own" id="rd-own"></div>
        <div class="rd-q foe"><span class="rd-q-l">Next</span><ol id="rd-qfoe" aria-label="Opponents, in the order they play next"></ol></div>
        <div class="rd-q own"><ol id="rd-qown" aria-label="Your side, in the order they play next"></ol><span class="rd-q-l">Next</span></div>
        <div class="rd-fx" id="rd-fx" aria-hidden="true"></div>
      </div>
      <div class="bt-panel rd-panel">
        <p class="bt-msg ui-dialog" id="rd-msg" aria-live="polite"></p>
        <div class="rd-targets" id="rd-targets" role="radiogroup" aria-label="Target"></div>
        <div class="bt-tray" id="rd-tray" role="group" aria-label="Your dice"></div>
        <div class="bt-read" id="rd-read" aria-live="polite"></div>
        <div class="bt-acts" id="rd-acts"></div>
        <div class="rd-sub"><button type="button" class="pg-hint" data-rdfast aria-pressed="${EVS.fast}">${EVS.fast ? 'Fast: on' : 'Fast: off'}</button><button type="button" class="pg-hint" data-rdleave>Leave the raid</button></div>
      </div>`
    RB.page = p
    RB.cv = $('#rd-cv')
    RB.g = RB.cv.getContext('2d')
    RB.g.imageSmoothingEnabled = false
    // Where the two stand: the game's battle layout (foe right, ally left).
    RB.L = SCN.layoutFor('daybreak', 240, 160)
    plates()
    loop()
    raidFlow()
  }

  // --- drawing: the classic stage, one Pokémon a side
  function drawSprite(g, src, dex, cx, by, o = {}) {
    const im = img(src)
    const a = o.a ?? 1
    if (a <= 0) return
    g.save()
    g.globalAlpha = a
    const s = o.s ?? 1
    if (im.complete && im.naturalWidth) {
      const w = 64 * s
      let pic = im
      if (o.flash) {
        // A hit: the sprite turns white, on its own canvas so the scene behind stays put.
        TMP.g.clearRect(0, 0, 64, 64)
        TMP.g.globalCompositeOperation = 'source-over'
        TMP.g.globalAlpha = 1
        TMP.g.drawImage(im, 0, 0)
        TMP.g.globalCompositeOperation = 'source-atop'
        TMP.g.globalAlpha = o.flash
        TMP.g.fillStyle = '#ffffff'
        TMP.g.fillRect(0, 0, 64, 64)
        pic = TMP.c
      }
      g.drawImage(pic, Math.round(cx - w / 2), Math.round(by - w), Math.round(w), Math.round(w))
    } else if (DEXICO.complete) {
      g.drawImage(DEXICO, ((dex - 1) % 16) * 40, Math.floor((dex - 1) / 16) * 30, 40, 30, cx - 40, by - 60, 80, 60)
    }
    g.restore()
  }
  const TMP = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    return { c, g: c.getContext('2d') }
  })()
  const FOE_AT = () => [RB.L.foe.x, RB.L.foe.y]
  const OWN_AT = () => [RB.L.own.x + 14, RB.L.own.y]
  function loop() {
    if (!RB || !RB.cv || !RB.cv.isConnected) return
    const g = RB.g,
      t = performance.now() / 1000
    const sh = RB.fx.shake > 0 ? Math.round((Math.random() - 0.5) * RB.fx.shake) : 0
    g.save()
    g.translate(sh, 0)
    g.clearRect(-10, -10, 260, 180)
    // The raid sky: a warm pulse over the scene.
    g.fillStyle = `rgba(242, 85, 63, ${0.08 + 0.05 * Math.sin(t * 2)})`
    g.fillRect(0, 0, 240, 160)
    const [fx, fy] = FOE_AT()
    const fm = foeOf(RB.front.foe)
    if (fm && !RB.ball) {
      const f = fm.fx || {}
      // The raid Pokémon glows; its allies don't.
      if (fm === RB.boss && (f.a ?? 1) > 0.5) {
        const R = Math.round(30 + Math.sin(t * 3) * 2)
        PX.disc(g, fx + (f.dx || 0), fy - 30, R, 'rgba(255, 190, 46, 0.22)')
        PX.disc(g, fx + (f.dx || 0), fy - 30, R - 8, 'rgba(255, 230, 160, 0.2)')
      }
      drawSprite(g, front(fm.dex, fm.shiny && fm.dex === 151), fm.dex, fx + (f.dx || 0), fy + (f.dy || 0), { s: f.s ?? 1, a: f.a ?? 1, flash: f.flash })
    }
    // The ball after a throw: it sits where the raid Pokémon was, and sparkles once it's caught.
    if (RB.ball) {
      const x = fx,
        y = fy - 8
      const wob = RB.ball.wobble ? Math.round(Math.sin(performance.now() / 60) * 2) : 0
      PX.disc(g, x + wob, y, 7, '#24304f')
      PX.disc(g, x + wob, y, 6, '#fbfdff')
      g.fillStyle = RB.ball.color
      g.fillRect(x + wob - 6, y - 6, 13, 6)
      g.fillStyle = '#24304f'
      g.fillRect(x + wob - 6, y, 13, 1)
      PX.disc(g, x + wob, y, 2, '#24304f')
      PX.disc(g, x + wob, y, 1, '#fbfdff')
      if (RB.ball.caught)
        for (let k = 0; k < 3; k++) {
          const a = t * 2 + (k * Math.PI * 2) / 3
          g.fillStyle = '#ffd23a'
          g.fillRect(Math.round(x + Math.cos(a) * 16), Math.round(y - 4 + Math.sin(a) * 10), 2, 2)
        }
    }
    const s = RB.sides[RB.front.own]
    const om = s && activeOf(s)
    if (om) {
      const f = om.fx || {}
      const [ox, oy] = OWN_AT()
      drawSprite(g, back(om.dex), om.dex, ox + (f.dx || 0), oy + (f.dy || 0), { s: f.s ?? 1, a: f.a ?? 1, flash: f.flash })
    }
    // Summon portals, where the foe stands.
    for (const r of RB.fx.ring) {
      const k = (performance.now() - r.t0) / 600
      if (k > 1) continue
      g.strokeStyle = `rgba(197, 138, 255, ${1 - k})`
      g.lineWidth = 2
      g.beginPath()
      g.ellipse(fx, fy - 2, 8 + 30 * k, 3 + 9 * k, 0, 0, Math.PI * 2)
      g.stroke()
    }
    g.restore()
    if (RB.fx.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${RB.fx.flash})`
      g.fillRect(0, 0, 240, 160)
      RB.fx.flash = Math.max(0, RB.fx.flash - 0.05)
    }
    RB.fx.shake = Math.max(0, RB.fx.shake - 0.4)
    requestAnimationFrame(loop)
  }
  function anim(ms, fn) {
    if (REDUCED) {
      fn(1)
      return Promise.resolve()
    }
    const T = EVS.fast ? ms / 4 : ms
    return new Promise((done) => {
      const t0 = performance.now()
      const step = (now) => {
        const p = Math.min(1, (now - t0) / T)
        fn(p)
        if (p < 1) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
  }
  function floatNum(x, y, txt, cls = '') {
    const fx = $('#rd-fx')
    if (!fx) return
    const s = document.createElement('span')
    s.className = `rd-num ${cls}`
    s.textContent = txt
    s.style.left = `${(x / 240) * 100}%`
    s.style.top = `${(y / 160) * 100}%`
    fx.appendChild(s)
    setTimeout(() => s.remove(), 1100)
  }
  function shards() {
    const fx = $('#rd-fx')
    if (!fx || REDUCED) return
    const c = CFG.raid.colors[RB.boss.bar - 1] || '#ffbe2e'
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i')
      s.className = 'rd-shard'
      s.style.setProperty('--c', c)
      s.style.setProperty('--dx', `${(Math.random() - 0.3) * 200}px`)
      s.style.setProperty('--dy', `${-10 + Math.random() * 120}px`)
      s.style.setProperty('--r', `${Math.random() * 360}deg`)
      fx.appendChild(s)
      setTimeout(() => s.remove(), 900)
    }
  }

  // --- the plates and the two queues
  function order() {
    const all = [{ who: 'boss', sp: RB.boss.sp + 0.5 }]
    RB.summons.forEach((m, i) => m && all.push({ who: 's' + i, sp: m.sp }))
    RB.sides.forEach((s, i) => activeOf(s) && all.push({ who: 'p' + i, sp: activeOf(s).sp + (s.me ? 0.1 : 0) }))
    return all.sort((a, b) => b.sp - a.sp)
  }
  const alive = (w) => (w[0] === 'p' ? !!activeOf(RB.sides[+w[1]]) : !!foeOf(w) && foeOf(w).hp > 0)
  /** Who plays next on one side, in speed order from the turn being played, without the one in front. */
  function upcoming(kind) {
    const seq = [...RB.list.slice(RB.at + 1), ...order()].map((x) => x.who)
    const front = kind === 'foe' ? RB.front.foe : 'p' + RB.front.own
    const out = []
    for (const w of seq) if ((kind === 'foe') === (w[0] !== 'p') && w !== front && !out.includes(w) && alive(w)) out.push(w)
    return out
  }
  function plates() {
    if (!RB || !$('#rd-foe')) return
    const R = CFG.raid
    // The foe in front.
    const fp = $('#rd-foe')
    const fm = foeOf(RB.front.foe)
    if (fm) {
      const key = RB.front.foe + fm.dex
      if (fp.dataset.who !== key) {
        fp.dataset.who = key
        fp.innerHTML =
          fm === RB.boss
            ? `<div class="ui-row"><span class="name ui-trunc">${fm.shiny ? '<i class="ev-sh" aria-hidden="true"></i>' : ''}${esc(fm.name)}</span><span class="lv">Lv.${R.level}</span><span class="ui-grow"></span><span class="rd-pts"></span></div><div class="rd-bar"><i></i><b></b></div>`
            : `<div class="ui-row"><span class="name ui-trunc">${esc(fm.name)}</span><span class="lv">Lv.${R.level}</span><span class="ui-grow"></span><span class="rd-ally-tag">Ally</span></div><div class="ui-row pl2"><span class="ui-types">${fm.types.map((t) => UI().typeBadge(t)).join('')}</span>${UI().hp(1, '')}</div>`
      }
      fp.classList.toggle('tg', RB.picking && RB.target === RB.front.foe)
      if (fm === RB.boss) {
        const left = fm.bars - fm.bar
        const bar = $('.rd-bar', fp)
        bar.style.setProperty('--c', R.colors[fm.bar % R.colors.length])
        bar.style.setProperty('--n', left > 1 ? R.colors[(fm.bar + 1) % R.colors.length] : '#dde5f0')
        $('i', bar).style.width = `${(Math.max(0, fm.hp) / fm.max) * 100}%`
        $('b', bar).textContent = `×${left}`
        $('.rd-pts', fp).textContent = RB.points ? plural(RB.points, 'summon') : ''
        $('.rd-pts', fp).hidden = !RB.points
        fp.setAttribute('aria-label', `${fm.name}, Lv.${R.level}: ${left} of ${fm.bars} HP bars left, ${Math.round((Math.max(0, fm.hp) / fm.max) * 100)}% of this one. ${plural(RB.points, 'summon point')}.`)
      } else {
        const p = Math.max(0, fm.hp) / fm.max
        const f = $('.ui-hp .fill', fp)
        $('.ui-hp .trail', fp).style.width = f.style.width = `${p * 100}%`
        f.style.setProperty('--hp', hpVar(p))
        fp.setAttribute('aria-label', `${fm.name}, ally of ${RB.boss.name}, ${Math.round(p * 100)}% HP`)
      }
    }
    // The ally in front.
    const op = $('#rd-own')
    const s = RB.sides[RB.front.own]
    const om = s && activeOf(s)
    if (om) {
      const key = `${s.i}-${s.k}`
      if (op.dataset.who !== key) {
        op.dataset.who = key
        op.innerHTML = `<div class="ui-row"><span class="rd-owner${s.me ? ' me' : ''}">${esc(ownerName(s))}</span><span class="name ui-trunc">${esc(om.name)}</span><span class="lv">Lv.${R.teamCap}</span></div><div class="ui-row">${UI().hp(1, '')}</div><span class="rd-balls" aria-hidden="true"></span>`
      }
      const p = om.hp / om.max
      const f = $('.ui-hp .fill', op)
      $('.ui-hp .trail', op).style.width = f.style.width = `${p * 100}%`
      f.style.setProperty('--hp', hpVar(p))
      $('.ui-hp .num', op) ? ($('.ui-hp .num', op).textContent = `${om.hp}/${om.max}`) : $('.ui-hp', op).insertAdjacentHTML('beforeend', `<span class="num">${om.hp}/${om.max}</span>`)
      $('.rd-balls', op).innerHTML = s.mons.map((x) => `<i class="${x.hp > 0 ? '' : 'out'}"></i>`).join('')
      op.setAttribute('aria-label', `${ownerName(s)}: ${om.name}, ${om.hp} of ${om.max} HP, ${s.mons.filter((x) => x.hp > 0).length} of 3 left`)
    }
    // The queues: top right for the foes, bottom left for your side.
    const mini = (p) => `<span class="bt-pip-hp"><i style="width:${p * 100}%;--hp:${hpVar(p)}"></i></span>`
    $('#rd-qfoe').innerHTML = upcoming('foe')
      .map((w) => {
        const m = foeOf(w)
        const p = Math.max(0, m.hp) / m.max
        const lbl = `${m.name}${m === RB.boss ? `, ${m.bars - m.bar} bars left` : `, ${Math.round(p * 100)}% HP`}`
        return `<li><button type="button" class="rd-qi${m === RB.boss ? ' boss' : ''}${RB.picking && RB.target === w ? ' tg' : ''}" data-tg="${w}" aria-label="${esc(lbl)}${RB.picking ? '. Target it' : ''}"${RB.picking ? '' : ' tabindex="-1"'}>${dexIco(m.dex)}${mini(p)}</button></li>`
      })
      .join('')
    $('#rd-qown').innerHTML = upcoming('own')
      .map((w) => {
        const sd = RB.sides[+w[1]]
        const m = activeOf(sd)
        const p = m.hp / m.max
        return `<li class="rd-qi" aria-label="${esc(`${ownerName(sd)}: ${m.name}, ${m.hp} of ${m.max} HP`)}">${dexIco(m.dex)}${mini(p)}<small>${esc(ownerName(sd))}</small></li>`
      })
      .join('')
  }
  const say = (m) => {
    const p = $('#rd-msg')
    if (p) p.textContent = m
  }

  // --- who stands in front
  async function swapFoe(id, o = {}) {
    if (RB.front.foe === id && !o.force) return
    const cur = foeOf(RB.front.foe)
    if (cur && cur.hp > 0 && RB.front.foe !== id) {
      await anim(170, (p) => (cur.fx = { dx: 70 * PX.ease.inQ(p), a: 1 - p }))
      cur.fx = {}
    }
    RB.front.foe = id
    plates()
    const n = foeOf(id)
    if (!n) return
    await anim(o.pop ? 420 : 200, (p) => (n.fx = o.pop ? { s: PX.ease.outBack(p, 2), a: Math.min(1, p * 2) } : { dx: 70 * (1 - PX.ease.outQ(p)), a: p }))
    n.fx = {}
  }
  async function swapOwn(i) {
    if (RB.front.own === i) return
    const cs = RB.sides[RB.front.own]
    const cur = cs && activeOf(cs)
    if (cur) {
      await anim(170, (p) => (cur.fx = { dx: -70 * PX.ease.inQ(p), a: 1 - p }))
      cur.fx = {}
    }
    RB.front.own = i
    plates()
    const n = activeOf(RB.sides[i])
    if (!n) return
    await anim(200, (p) => (n.fx = { dx: -70 * (1 - PX.ease.outQ(p)), a: p }))
    n.fx = {}
  }

  // --- the flow
  // --- the raid's opening: about six seconds, any tap on Skip ends it
  // 0.0 alarm: hazard tapes and a red pulse · 1.0 storm: clouds, lightning, the silhouette rising · 2.35 a pillar
  // of light · 2.75 the reveal: white-out, shockwaves, debris, a roar · 3.25 the name slams down, the HP bars fill ·
  // 4.55 the three trainers cut in · 5.5 GO! · 6.15 it fades into the battle.
  function tintOf(im, color, k) {
    const c = document.createElement('canvas')
    c.width = c.height = 64 * k
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    g.drawImage(im, 0, 0, 64 * k, 64 * k)
    if (color) {
      g.globalCompositeOperation = 'source-in'
      g.fillStyle = color
      g.fillRect(0, 0, c.width, c.height)
    }
    return c
  }
  function raidIntro() {
    if (REDUCED || EVS.fast) return Promise.resolve()
    const B = RB.boss
    const R = CFG.raid
    const host = $('.hm-screen')
    const el = document.createElement('div')
    el.className = 'rd-intro'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-label', `Raid battle: ${B.name}`)
    const cutBg = (s) => (s.me ? '#f2553f' : s.npc ? '#8592ad' : '#5b8def')
    el.innerHTML = `<canvas class="rd-i-cv" width="240" height="360" aria-hidden="true"></canvas>
      <div class="rd-i-tape top" aria-hidden="true"><b>WARNING · RAID BATTLE</b></div>
      <div class="rd-i-tape bottom" aria-hidden="true"><b>A POWERFUL POKÉMON APPEARS</b></div>
      <div class="rd-i-name"><small>RAID BATTLE</small><b>${esc(B.name.toUpperCase())}</b>${B.shiny ? '<em>SHINY</em>' : ''}<span class="rd-i-sub">Lv.${R.level} · ${plural(R.bars, 'HP bar')}</span>
        <span class="rd-i-bars">${Array.from({ length: R.bars }, (_, i) => `<i style="--c:${R.colors[i % R.colors.length]};--d:${i * 250}ms"></i>`).join('')}</span></div>
      <div class="rd-i-cuts">${RB.sides
        .map(
          (s, i) =>
            `<div class="rd-i-cut" style="--bg:${cutBg(s)};--d:${i * 150}ms"><span class="rd-i-who">${A.lookOf(s.look)}</span><span class="rd-i-t"><b>${esc(s.me ? 'You' : s.name.replace('Ace Trainer ', ''))}</b><small>${s.npc ? 'NPC · ' : ''}leads with ${esc(s.mons[0].name)}</small></span><span class="rd-i-lead">${dexIco(s.mons[0].dex, 'x2')}</span></div>`,
        )
        .join('')}</div>
      <div class="rd-i-go" aria-hidden="true">GO!</div>
      <button type="button" class="rd-i-skip" data-skip>Skip</button>`
    host.appendChild(el)
    const cv = $('.rd-i-cv', el)
    const g = cv.getContext('2d')
    g.imageSmoothingEnabled = false
    const spr = img(front(B.dex, B.shiny && B.dex === 151))
    let full = null,
      sil = null,
      glow = null
    const art = () => {
      if (full || !spr.complete || !spr.naturalWidth) return
      full = tintOf(spr, null, 2)
      sil = tintOf(spr, '#0b0e1e', 2)
      glow = tintOf(spr, '#ffbe2e', 2)
    }
    const rnd = PX.rng(B.dex * 7 + 3)
    const bolts = [1.15, 1.5, 1.85, 2.2].map((t) => {
      const x0 = 20 + rnd() * 200
      return { t, pts: PX.bolt(rnd, x0, -4, x0 + (rnd() - 0.5) * 90, 150 + rnd() * 110, 0.3, 5) }
    })
    const clouds = Array.from({ length: 9 }, (_, i) => ({ x: rnd() * 300, y: 20 + rnd() * 120, w: 60 + rnd() * 90, h: 14 + rnd() * 18, v: 6 + rnd() * 14, d: i % 3 }))
    const parts = []
    let burst = false
    const FEET = 262
    const draw = (T) => {
      art()
      const shake = T > 2.75 && T < 3.25 ? Math.round((Math.random() - 0.5) * 8 * (3.25 - T) * 2) : 0
      g.save()
      g.translate(shake, Math.round(shake / 2))
      // The sky: black with a red alarm pulse, then a storm.
      if (T < 1) {
        g.fillStyle = '#05060d'
        g.fillRect(-10, -10, 260, 380)
        g.fillStyle = `rgba(242,85,63,${0.18 + 0.18 * Math.max(0, Math.sin(T * 14))})`
        g.fillRect(-10, -10, 260, 380)
      } else {
        const sky = g.createLinearGradient(0, 0, 0, 360)
        sky.addColorStop(0, '#120a22')
        sky.addColorStop(0.55, '#3a1030')
        sky.addColorStop(1, '#170a1a')
        g.fillStyle = sky
        g.fillRect(-10, -10, 260, 380)
        for (const c of clouds) {
          const x = ((c.x - T * c.v) % 340) - 50
          g.fillStyle = ['rgba(8,6,18,0.7)', 'rgba(40,18,52,0.6)', 'rgba(90,40,80,0.35)'][c.d]
          g.beginPath()
          g.ellipse(x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2)
          g.fill()
        }
        // Lightning, with a flash.
        for (const b of bolts) {
          const e = T - b.t
          if (e < 0 || e > 0.16) continue
          g.fillStyle = `rgba(220,200,255,${0.5 * (1 - e / 0.16)})`
          g.fillRect(-10, -10, 260, 380)
          PX.polyline(g, b.pts.map(([x, y]) => [Math.round(x) + 1, Math.round(y)]), '#9a6bff', 3)
          PX.polyline(g, b.pts.map(([x, y]) => [Math.round(x), Math.round(y)]), '#ffffff', 1)
        }
        // The plateau it stands on.
        g.fillStyle = '#0b0710'
        g.beginPath()
        g.ellipse(120, FEET + 40, 150, 46, 0, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#24142c'
        g.fillRect(-10, FEET + 2, 260, 2)
      }
      // The silhouette rises, its outline glowing.
      if (T >= 1.3 && T < 2.75 && sil) {
        const e = Math.min(1, (T - 1.3) / 1.0)
        const y = FEET - 128 + Math.round((1 - PX.ease.outQ(e)) * 180)
        const pulse = 0.5 + 0.5 * Math.sin(T * 10)
        g.globalAlpha = 0.5 + 0.5 * pulse
        for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) g.drawImage(glow, 56 + ox, y + oy)
        g.globalAlpha = 1
        g.drawImage(sil, 56, y)
      }
      // The pillar of light.
      if (T >= 2.35 && T < 3.0) {
        const e = Math.min(1, (T - 2.35) / 0.4)
        const w = Math.round(4 + 86 * PX.ease.inQ(e))
        const a = T < 2.75 ? 1 : 1 - (T - 2.75) / 0.25
        const gr = g.createLinearGradient(120 - w / 2, 0, 120 + w / 2, 0)
        gr.addColorStop(0, 'rgba(255,190,46,0)')
        gr.addColorStop(0.3, `rgba(255,220,120,${0.7 * a})`)
        gr.addColorStop(0.5, `rgba(255,255,255,${a})`)
        gr.addColorStop(0.7, `rgba(255,220,120,${0.7 * a})`)
        gr.addColorStop(1, 'rgba(255,190,46,0)')
        g.fillStyle = gr
        g.fillRect(120 - w / 2, -10, w, FEET + 14)
        g.fillStyle = `rgba(255,240,180,${0.6 * a})`
        g.beginPath()
        g.ellipse(120, FEET + 2, w * 0.9, 8, 0, 0, Math.PI * 2)
        g.fill()
      }
      // The reveal: aura, the Pokémon itself, shockwaves.
      if (T >= 2.75 && full) {
        const bob = Math.round(Math.sin(T * 3) * 2)
        const ar = 58 + Math.sin(T * 5) * 4
        PX.disc(g, 120, FEET - 60, Math.round(ar), 'rgba(255,190,46,0.18)')
        PX.disc(g, 120, FEET - 60, Math.round(ar - 16), 'rgba(255,230,160,0.16)')
        const k = T < 2.95 ? 1 + 0.25 * (1 - (T - 2.75) / 0.2) : 1
        const s = Math.round(128 * k)
        g.drawImage(full, 120 - s / 2, FEET - s + bob, s, s)
        for (let i = 0; i < 3; i++) {
          const e = (T - 2.75 - i * 0.14) / 0.7
          if (e < 0 || e > 1) continue
          g.strokeStyle = i === 1 ? `rgba(255,190,46,${1 - e})` : `rgba(255,255,255,${1 - e})`
          g.lineWidth = 3 - 2 * e
          g.beginPath()
          g.ellipse(120, FEET, 10 + 200 * e, 4 + 40 * e, 0, 0, Math.PI * 2)
          g.stroke()
        }
        if (!burst) {
          burst = true
          for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2,
              v = 1 + Math.random() * 4
            parts.push({ x: 120, y: FEET - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.09, life: 1.4, age: 0, c: ['#ffffff', '#ffe066', '#ffbe2e', '#c58aff'][i % 4], s: 1 + (i % 3) })
          }
        }
        // Embers keep rising after.
        if (Math.random() < 0.6)
          parts.push({ x: 40 + Math.random() * 160, y: FEET + 6, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.8, g: 0, life: 2, age: 0, c: B.shiny ? '#fff6a8' : '#ff9a5a', s: 1 })
        if (B.shiny && Math.random() < 0.3) parts.push({ x: 70 + Math.random() * 100, y: FEET - 120 + Math.random() * 110, vx: 0, vy: -0.2, g: 0, life: 0.6, age: 0, c: '#ffffff', s: 2, star: true })
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.age += 1 / 60
        if (p.age > p.life) {
          parts.splice(i, 1)
          continue
        }
        p.vy += p.g
        p.x += p.vx
        p.y += p.vy
        g.globalAlpha = Math.min(1, (p.life - p.age) * 2)
        g.fillStyle = p.c
        if (p.star) {
          g.fillRect(Math.round(p.x) - 2, Math.round(p.y), 5, 1)
          g.fillRect(Math.round(p.x), Math.round(p.y) - 2, 1, 5)
        } else g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s)
      }
      g.globalAlpha = 1
      g.restore()
      // White-out at the reveal.
      if (T >= 2.7 && T < 3.05) {
        g.fillStyle = `rgba(255,255,255,${1 - (T - 2.7) / 0.35})`
        g.fillRect(0, 0, 240, 360)
      }
    }
    return new Promise((resolve) => {
      const timers = []
      const at = (ms, fn) => timers.push(setTimeout(fn, ms))
      const cls = (c) => () => el.classList.add(c)
      let done = false,
        raf = 0
      const t0 = performance.now()
      const finish = (quick) => {
        if (done) return
        done = true
        timers.forEach(clearTimeout)
        el.classList.add('out')
        setTimeout(
          () => {
            cancelAnimationFrame(raf)
            el.remove()
            resolve()
          },
          quick ? 220 : 450,
        )
      }
      $('[data-skip]', el).addEventListener('click', () => finish(true))
      // The alarm.
      at(40, cls('alert'))
      at(80, () => {
        SND().tone(660, 0.18, { type: 'square', vol: 0.05 })
        SND().tone(880, 0.18, { type: 'square', vol: 0.05, at: 0.2 })
        SND().tone(660, 0.18, { type: 'square', vol: 0.05, at: 0.42 })
        SND().tone(880, 0.18, { type: 'square', vol: 0.05, at: 0.62 })
      })
      at(950, cls('alert-out'))
      // The storm.
      at(1050, () => SND().noise(1.6, { vol: 0.06, freq: 120, type: 'lowpass' }))
      for (const b of bolts) at(b.t * 1000, () => SND().noise(0.35, { vol: 0.09, freq: 2600, slide: -2300 }))
      at(2350, () => SND().noise(0.45, { vol: 0.07, freq: 400, slide: 3000 }))
      // The reveal.
      at(2750, () => {
        el.classList.add('boom')
        SND().tone(55, 0.7, { type: 'sawtooth', vol: 0.08, slide: -20 })
        SND().noise(0.6, { vol: 0.1, freq: 300 })
      })
      at(2900, () => SND().tone(240, 0.6, { type: 'sawtooth', vol: 0.06, slide: -160 }))
      // The name, the bars.
      at(3250, () => {
        el.classList.add('name')
        SND().noise(0.18, { vol: 0.09, freq: 160 })
      })
      at(3600, cls('bars'))
      for (let i = 0; i < R.bars; i++) at(3650 + i * 250, () => SND().tone(1320 + i * 220, 0.12, { vol: 0.045 }))
      // The trainers.
      at(4550, cls('cuts'))
      RB.sides.forEach((_, i) => at(4560 + i * 150, () => SND().noise(0.18, { vol: 0.05, freq: 1500, slide: 1500 })))
      // GO!
      at(5500, () => {
        el.classList.add('go')
        ;[523, 659, 784, 1047].forEach((f, i) => SND().tone(f, 0.12, { vol: 0.05, at: i * 0.07 }))
      })
      at(6150, () => finish(false))
      const loop = (now) => {
        if (done && !el.isConnected) return
        draw((now - t0) / 1000)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      $('[data-skip]', el).focus({ preventScroll: true })
    })
  }
  async function raidFlow() {
    const B = RB.boss
    const me = RB
    say(`${B.shiny ? 'A shiny ' : ''}${B.name.toUpperCase()} appears in a raid!`)
    // The opening (skippable), then the battle picks up with the raid Pokémon already out.
    await raidIntro()
    if (RB !== me) return
    RB.fx.shake = 6
    SND().tone(110, 0.4, { type: 'sawtooth', vol: 0.05, slide: -40 })
    await wait(400)
    for (let i = 0; i < Math.min(CFG.raid.startAllies, RB.summons.length); i++) await summon(i, false)
    await swapFoe('boss')
    RB.list = order()
    RB.at = -1
    const first = RB.list.find((x) => x.who[0] === 'p')
    RB.front.own = +first.who[1]
    const m0 = activeOf(RB.sides[RB.front.own])
    m0.fx = { s: 0, a: 0 }
    plates()
    say(`${RB.sides.map((s) => `${ownerName(s) === 'You' ? 'You send' : `${ownerName(s)} sends`} out ${activeOf(s).name}`).join('. ')}!`)
    await anim(420, (p) => (m0.fx = { s: PX.ease.outBack(p, 2), a: 1 }))
    m0.fx = {}
    await wait(600)
    while (RB === me && !me.over) await round(me)
  }
  async function summon(i, pay = true) {
    const d = RB.summonPool[Math.floor(Math.random() * RB.summonPool.length)]
    const m = mon(d, 'summon')
    if (pay) RB.points--
    RB.summons[i] = m
    RB.fx.ring.push({ t0: performance.now() })
    SND().tone(300, 0.25, { type: 'triangle', vol: 0.05, slide: 500 })
    say(`${RB.boss.name} calls ${m.name}!`)
    // The new ally shows itself in front, then takes its place in the queue.
    await swapFoe('s' + i, { pop: true })
    await wait(450)
  }
  async function round(me) {
    RB.list = order()
    for (RB.at = 0; RB.at < RB.list.length && RB === me && !RB.over; RB.at++) {
      const w = RB.list[RB.at].who
      if (!alive(w)) continue
      plates()
      if (w === 'boss') await bossTurn()
      else if (w[0] === 's') await foeTurn(w)
      else await allyTurn(RB.sides[+w[1]])
      if (RB === me && !RB.over && RB.sides.every((s) => s.out)) await lose()
    }
  }
  function targets() {
    const list = [{ id: 'boss', m: RB.boss }]
    RB.summons.forEach((m, i) => m && list.push({ id: 's' + i, m }))
    return list
  }
  async function allyTurn(s) {
    // An ally's turn: the raid Pokémon comes back in front, the ally who plays steps forward.
    if (RB.front.foe !== 'boss') await swapFoe('boss')
    await swapOwn(s.i)
    const m = activeOf(s)
    let tid, ev
    if (s.me && !EVS.fast) ({ tid, ev } = await pick(s))
    else {
      const roll = rollDice(m.dice)
      // Allies hit the raid Pokémon, unless one of its allies is low enough to finish.
      tid = 'boss'
      RB.summons.forEach((x, i) => {
        if (x && x.hp <= evalRoll(roll, x.types).dmg) tid = 's' + i
      })
      ev = evalRoll(roll, foeOf(tid).types)
      say(`${s.me ? 'Your' : `${ownerName(s)}’s`} ${m.name} attacks ${foeOf(tid).name}!`)
      await wait(450)
    }
    await strike(m, tid, ev)
  }
  function pick(s) {
    const m = activeOf(s)
    let roll = rollDice(m.dice)
    let rr = Math.min(3, m.rr)
    const sel = new Set()
    if (!foeOf(RB.target)) RB.target = 'boss'
    RB.picking = true
    say(`What will ${m.name} do? Tap dice to reroll, pick a target (top right for those waiting), then attack.`)
    return new Promise((done) => {
      const draw = () => {
        const tg = foeOf(RB.target)
        const ev = evalRoll(roll, tg.types)
        plates()
        $('#rd-targets').innerHTML = `<span>Target</span>${targets()
          .map((x) => `<button type="button" role="radio" data-tg="${x.id}" aria-checked="${RB.target === x.id}">${dexIco(x.m.dex)}${esc(x.m.name)}</button>`)
          .join('')}`
        $('#rd-tray').innerHTML = roll
          .map((d, i) => `<button type="button" class="bt-die" data-rdie="${i}" aria-pressed="${sel.has(i)}" aria-label="${cap(d.t)} die, ${d.v}${sel.has(i) ? ', will reroll' : ''}">${UI().die(d.t, d.v, { size: 50, sel: sel.has(i) })}</button>`)
          .join('')
        $('#rd-read').innerHTML = `${ev.combo ? `<span class="bt-chip combo">${ev.combo[0]} +${ev.combo[1]}</span>` : '<span class="bt-chip none">No combo</span>'}<span class="bt-math">(${ev.sum}${ev.combo ? ` + ${ev.combo[1]}` : ''})${ev.mult !== 1 ? ` × ${ev.mult}` : ''} = <b>${ev.dmg}</b></span>${ev.mult > 1 ? '<em class="bt-eff up">super effective</em>' : ev.mult < 1 ? '<em class="bt-eff down">not very effective</em>' : ''}`
        $('#rd-acts').innerHTML = `<button type="button" class="ui-btn" data-rdre${sel.size && rr > 0 ? '' : ' disabled'}><span>Reroll <i>${rr}</i></span></button><button type="button" class="ui-btn primary" data-rdatk><span>Attack</span></button>`
      }
      const page = RB.page
      const onClick = (e) => {
        let b
        if ((b = e.target.closest('[data-rdie]'))) {
          const i = +b.dataset.rdie
          sel.has(i) ? sel.delete(i) : sel.add(i)
          draw()
          return $(`[data-rdie="${i}"]`).focus({ preventScroll: true })
        }
        if ((b = e.target.closest('[data-tg]'))) {
          RB.target = b.dataset.tg
          draw()
          return $(`.rd-targets [data-tg="${RB.target}"]`).focus({ preventScroll: true })
        }
        if (e.target.closest('[data-rdre]')) {
          rr--
          roll = roll.map((d, i) => (sel.has(i) ? { t: d.t, v: 1 + Math.floor(Math.random() * 6) } : d))
          sel.clear()
          SND().noise(0.12, { vol: 0.04, freq: 2400 })
          return draw()
        }
        if (e.target.closest('[data-rdatk]')) {
          page.removeEventListener('click', onClick)
          RB.picking = false
          $('#rd-targets').innerHTML = ''
          $('#rd-acts').innerHTML = ''
          $('#rd-tray').innerHTML = ''
          $('#rd-read').innerHTML = ''
          const tid = RB.target
          done({ tid, ev: evalRoll(roll, foeOf(tid).types) })
        }
      }
      page.addEventListener('click', onClick)
      draw()
    })
  }
  /** An ally's hit. A target waiting in the queue steps to the front for it, then goes back to its place. */
  async function strike(m, tid, ev) {
    const fromQueue = RB.front.foe !== tid
    if (fromQueue) await swapFoe(tid)
    const tg = foeOf(tid)
    await anim(220, (p) => (m.fx = { dx: 26 * Math.sin(p * Math.PI), dy: -12 * Math.sin(p * Math.PI) }))
    m.fx = {}
    SND().noise(0.15, { vol: 0.07, freq: 900 })
    tg.hp -= ev.dmg
    const [fx, fy] = FOE_AT()
    floatNum(fx, fy - 56, `-${ev.dmg}`, ev.mult > 1 ? 'up' : ev.mult < 1 ? 'down' : '')
    RB.fx.shake = tid === 'boss' ? 3 : 1
    tg.fx = { flash: 0.8 }
    plates()
    await anim(260, (p) => (tg.fx = { flash: 0.8 * (1 - p) }))
    tg.fx = {}
    if (tid === 'boss') return bossDamaged()
    if (tg.hp <= 0) {
      say(`${tg.name} fainted!`)
      await anim(380, (p) => (tg.fx = { dy: 14 * p, a: 1 - p }))
      RB.summons[+tid[1]] = null
      await swapFoe('boss', { force: true })
    } else if (fromQueue) await swapFoe('boss')
  }
  async function bossDamaged() {
    const B = RB.boss
    while (B.hp <= 0 && !RB.over) {
      B.bar++
      if (B.bar >= B.bars) return win()
      // A bar breaks: the rest carries over to the next one.
      const carry = -B.hp
      B.hp = Math.max(1, B.max - carry)
      RB.points += CFG.raid.perBreak
      shards()
      RB.fx.flash = REDUCED ? 0 : 0.7
      RB.fx.shake = 8
      SND().noise(0.4, { vol: 0.08, freq: 3000, slide: -2500 })
      SND().tone(90, 0.5, { type: 'sawtooth', vol: 0.05, slide: -30, at: 0.1 })
      plates()
      const bar = $('.rd-bar')
      if (bar) {
        bar.classList.remove('broke')
        void bar.offsetWidth
        bar.classList.add('broke')
      }
      say(`${B.name}’s ${['first', 'second', 'third', 'fourth'][B.bar - 1] || 'next'} bar broke! It roars: +${CFG.raid.perBreak} summon points.`)
      await wait(900)
    }
  }
  async function bossTurn() {
    // Free slots are filled first, one point each.
    for (let i = 0; i < RB.summons.length; i++) if (!RB.summons[i] && RB.points > 0) await summon(i)
    await foeTurn('boss')
  }
  /** A foe's turn: it steps forward, picks a side at random (never the one hit just before), and that ally steps forward. */
  async function foeTurn(id) {
    const m = foeOf(id)
    if (!m || m.hp <= 0) return
    await swapFoe(id)
    const live = RB.sides.filter((s) => activeOf(s))
    if (!live.length) return
    const pool = live.length > 1 ? live.filter((s) => s.i !== RB.lastTarget) : live
    const s = pool[Math.floor(Math.random() * pool.length)]
    RB.lastTarget = s.i
    await swapOwn(s.i)
    const t = activeOf(s)
    const ev = evalRoll(rollDice(m.dice), t.types)
    // The raid's upgrade level (7) adds to the raid Pokémon's hits; its allies hit like trainers' Pokémon.
    const dmg = m === RB.boss ? ev.dmg + CFG.raid.upgrade : Math.round(ev.dmg * 0.8)
    say(`${m === RB.boss ? '' : `${RB.boss.name}’s ally `}${m.name} attacks ${s.me ? 'your' : `${ownerName(s)}’s`} ${t.name}!`)
    await wait(350)
    await anim(240, (p) => (m.fx = { dx: -22 * Math.sin(p * Math.PI), dy: 10 * Math.sin(p * Math.PI) }))
    m.fx = {}
    SND().noise(0.15, { vol: 0.07, freq: 600 })
    t.hp = Math.max(0, t.hp - dmg)
    const [ox] = OWN_AT()
    floatNum(ox, 108, `-${dmg}`, ev.mult > 1 ? 'up' : '')
    t.fx = { flash: 0.8 }
    plates()
    await anim(240, (p) => (t.fx = { flash: 0.8 * (1 - p) }))
    t.fx = {}
    if (t.hp > 0) return
    say(`${t.name} fainted!`)
    await anim(380, (p) => (t.fx = { dy: 18 * p, a: 1 - p }))
    t.fx = {}
    s.k = s.mons.findIndex((x) => x.hp > 0)
    if (s.k < 0) {
      s.out = true
      s.k = 0
      say(`${s.me ? 'You have' : `${s.name} has`} no Pokémon left!`)
      plates()
      await wait(500)
      const next = RB.sides.find((x) => activeOf(x))
      if (next) await swapOwn(next.i)
      return
    }
    const n = activeOf(s)
    n.fx = { s: 0 }
    plates()
    say(`${s.me ? 'Go' : `${ownerName(s)} sends out`} ${n.name}!`)
    await anim(380, (p) => (n.fx = { s: PX.ease.outBack(p, 2) }))
    n.fx = {}
    await wait(250)
  }
  async function win() {
    RB.over = true
    const B = RB.boss
    B.hp = 0
    plates()
    say(`${B.name} is worn out!`)
    SND().tone(220, 0.6, { type: 'sawtooth', vol: 0.05, slide: -150 })
    await anim(500, (p) => (B.fx = { dy: 4 * p }))
    if (RB.summons.some(Boolean)) {
      say('Its allies flee!')
      $$('#rd-qfoe li').forEach((li) => li.classList.add('flee'))
      await wait(600)
      RB.summons = RB.summons.map(() => null)
      plates()
    }
    await wait(400)
    catchPanel()
  }
  function catchPanel(again) {
    const B = RB.boss
    const cv = (A.G.mons[B.dex] || {}).cv || 5
    const bag = A.SAVE.bag || {}
    const balls = [
      ['poke-ball', 0],
      ['great-ball', 1],
      ['ultra-ball', 2],
      ['master-ball', 9],
    ]
    say(again ? `${B.name} broke free! Throw another ball.` : `Throw a ball! Catch it: d6 + the ball’s bonus ≥ ${cv}.`)
    $('#rd-tray').innerHTML = ''
    $('#rd-read').innerHTML = ''
    $('#rd-acts').innerHTML = `<div class="rd-balls-pick">${balls
      .map(([k, bonus]) => {
        const n = bag[k] ?? (k === 'master-ball' ? 0 : 5)
        const chance = k === 'master-ball' ? 100 : Math.round((Math.max(0, Math.min(6, 7 - (cv - bonus))) / 6) * 100)
        return `<button type="button" class="pg-useit" data-ball="${k}" data-bonus="${bonus}"${n ? '' : ' disabled'}>${itemIco(k)}<span><b>${esc(ITEM(k).name)}</b><small>${k === 'master-ball' ? 'Never fails' : `+${bonus} · ${chance} %`}</small></span><em>×${n}</em></button>`
      })
      .join('')}</div>`
    const onClick = async (e) => {
      const b = e.target.closest('[data-ball]')
      if (!b) return
      $('.rd-panel').removeEventListener('click', onClick)
      const k = b.dataset.ball
      if (A.SAVE.bag) A.SAVE.bag[k] = Math.max(0, (A.SAVE.bag[k] ?? 5) - 1)
      $('#rd-acts').innerHTML = ''
      const d6 = 1 + Math.floor(Math.random() * 6)
      const ok = k === 'master-ball' || d6 + +b.dataset.bonus >= cv
      await throwBall(k, d6, +b.dataset.bonus, cv, ok)
    }
    $('.rd-panel').addEventListener('click', onClick)
  }
  async function throwBall(k, d6, bonus, cv, ok) {
    const B = RB.boss
    $('#rd-tray').innerHTML = `<span class="bt-die">${UI().die('base', d6, { size: 50 })}</span>`
    $('#rd-read').innerHTML = k === 'master-ball' ? '<span class="bt-chip combo">Master Ball</span>' : `<span class="bt-math">${d6} + ${bonus} = <b>${d6 + bonus}</b> vs ${cv}</span>`
    say(`You threw a ${ITEM(k).name}!`)
    await wait(500)
    await anim(500, (p) => (B.fx = { s: 1 - 0.9 * p, a: 1 - p }))
    RB.ball = { color: { 'poke-ball': '#f2553f', 'great-ball': '#5b8def', 'ultra-ball': '#3a3a3a', 'master-ball': '#9a5ad8' }[k], wobble: true }
    const wobbles = ok ? 3 : 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < wobbles; i++) {
      SND().tone(700, 0.06, { vol: 0.04 })
      await wait(550)
    }
    RB.ball.wobble = false
    if (ok) {
      RB.ball.caught = true
      SND().tone(784, 0.1, { vol: 0.05 })
      SND().tone(988, 0.1, { vol: 0.05, at: 0.1 })
      SND().tone(1319, 0.3, { vol: 0.05, at: 0.2 })
      EVS.caught = true
      // The leaderboard's Raids board counts only raids won this way: the raid Pokémon caught.
      A.raidsWon = (A.raidsWon || 0) + 1
      A.onCatch && A.onCatch(B.dex, CFG.raid.level)
      const helpers = RB.sides.filter((s) => s.friend).map((s) => s.name)
      say(`Gotcha! ${B.name} was caught!`)
      $('.rd-panel').classList.add('over')
      $('#rd-acts').innerHTML = `<div class="rd-end"><p><b>${esc(B.name)} joins your Box at Lv.${CFG.raid.level}.</b>${helpers.length ? ` ${esc(helpers.join(' and '))} ${helpers.length > 1 ? 'each get' : 'gets'} a gift for helping.` : ''} The raid is closed until the next one.</p><button type="button" class="ui-btn primary wide" data-rdleave><span>Back to events</span></button></div>`
      renderWidget()
    } else {
      SND().noise(0.3, { vol: 0.07, freq: 1500 })
      RB.ball = null
      await anim(300, (p) => (B.fx = { s: 0.1 + 0.9 * PX.ease.outBack(p, 2), a: 1 }))
      B.fx = { dy: 4 }
      say(`${B.name} broke free!`)
      $('.rd-panel').classList.add('over')
      $('#rd-acts').innerHTML = `<div class="rd-end"><p><b>${esc(B.name)} broke free.</b> The raid stays open: fight it again from full whenever you like.</p><div class="rd-end-btns"><button type="button" class="ui-btn" data-rdleave><span>Later</span></button><button type="button" class="ui-btn primary" data-rdagain><span>Fight again</span></button></div></div>`
    }
  }
  async function lose() {
    RB.over = true
    say(`${RB.boss.name} beat every side!`)
    $('.rd-panel').classList.add('over')
    $('#rd-acts').innerHTML = `<div class="rd-end"><p><b>Your raid team was defeated.</b> ${esc(RB.boss.name)} is still here until midnight UTC. Your team is healed for the next try.</p><div class="rd-end-btns"><button type="button" class="ui-btn" data-rdleave><span>Later</span></button><button type="button" class="ui-btn primary" data-rdagain><span>Try again</span></button></div></div>`
  }

  // ------------------------------------------------------------------ the rebattle tab
  const GOLD_BASE = (lv) => lv * 60
  function rebattleTab() {
    const R = EVS.reb
    const t = CFG.rebattle[R.tier]
    return `<div class="hm-chips so-chips" role="radiogroup" aria-label="Region"><button type="button" role="radio" aria-checked="true">Kanto</button><button type="button" role="radio" aria-checked="false" aria-disabled="true" data-reblocked>Johto <img class="px hm-w-lock" alt="" src="${A.icons.LOCK}" /></button></div>
      <ol class="ev-tiers">${CFG.rebattle
        .map((x, i) => {
          const st = i < R.done ? 'done' : i === R.tier && R.done < 3 ? 'now' : 'locked'
          return `<li class="${st}"><span class="ev-medal m${i}" aria-hidden="true"></span><span><b>${x.tier}</b><small>${x.lv === '100' ? 'Lv.100' : `Lv.${x.lv}`} · ₽×${x.gold}</small></span>${st === 'done' ? '<em>Cleared</em>' : st === 'locked' ? '<em class="lock">Locked</em>' : ''}</li>`
        })
        .join('')}</ol>
      ${
        R.done >= 3
          ? '<p class="ev-closed">You cleared every tier of the Kanto League. The next region’s rebattle opens when you beat its League.</p>'
          : `<div class="pg-sec-h"><h3>${t.tier} gauntlet</h3><span class="pg-count">${R.step}/5</span></div>
      <ol class="ev-ladder">${LEAGUE.map((m, i) => {
        const st = i < R.step ? 'won' : i === R.step ? 'next' : ''
        const team = m.t[R.tier]
        return `<li class="${st}">${portrait(m.img)}<span class="so-who"><b>${esc(m.name)}${m.rival ? ' <em>Champion</em>' : ''}</b><span class="so-team">${team.map(([d, lv]) => `<span class="so-mon" title="${esc(A.K.names[d] || '')} Lv.${lv}">${dexIco(d)}</span>`).join('')}</span><small>Lv.${Math.min(...team.map((x) => x[1]))}–${Math.max(...team.map((x) => x[1]))} · ${R.paid.has(`${R.tier}-${i}`) ? '<s>₽</s> already paid' : `₽${Math.round(GOLD_BASE(Math.max(...team.map((x) => x[1]))) * t.gold).toLocaleString('en-US')}`}</small></span>${st === 'won' ? '<em class="ev-check" aria-label="Beaten"></em>' : ''}</li>`
      }).join('')}</ol>
      <ul class="ev-rules-mini"><li>Five fights in a row, no Pokémon Center</li><li>Items allowed</li><li>A loss sends you back to Lorelei; the ₽ you won is kept</li><li>Each trainer pays once: beaten again after a loss, no ₽</li></ul>
      <button type="button" class="ui-btn primary wide ev-go" data-rebgo><span>${R.step ? `Continue: ${LEAGUE[R.step].name}` : `Start the ${t.tier.toLowerCase()} tier`}</span></button>`
      }`
  }
  function rebFight() {
    const R = EVS.reb
    const m = LEAGUE[R.step]
    const t = CFG.rebattle[R.tier]
    $('#hm-s2-title').textContent = `${m.name} · ${t.tier} tier`
    $('#hm-s2-sub').textContent = `Fight ${R.step + 1} of 5`
    $('#hm-s2-body').innerHTML = `<div class="ev-vs">${portrait(m.img, 'big')}<p class="pg-note">In the game this is the usual trainer battle (Battle tab), against this team. Preview how it ends:</p></div>`
    const foot = $('#hm-s2-foot')
    foot.hidden = false
    foot.innerHTML = `<div class="rd-end-btns"><button type="button" class="ui-btn" data-reblose><span>Lose</span></button><button type="button" class="ui-btn primary" data-rebwin><span>Win</span></button></div>`
    const sh = $('#hm-sheet2')
    sh.onclick = (e) => {
      if (e.target.closest('[data-rebwin]')) {
        sh.onclick = null
        A.closeDialog(sh)
        const lv = Math.max(...m.t[R.tier].map((x) => x[1]))
        // A trainer pays once per tier: beaten again after a restart, no ₽.
        const key = `${R.tier}-${R.step}`
        const gold = R.paid.has(key) ? 0 : Math.round(GOLD_BASE(lv) * t.gold)
        R.paid.add(key)
        if (gold) {
          A.SAVE.gold += gold
          A.bumpGold()
        }
        R.step++
        if (R.step >= 5) {
          R.done = R.tier + 1
          R.tier = Math.min(2, R.tier + 1)
          R.step = 0
          rerender()
          medal(t, gold)
        } else {
          rerender()
          A.toast(gold ? `${m.name} beaten! +₽${gold.toLocaleString('en-US')} (×${t.gold})` : `${m.name} beaten again: no ₽, they already paid`)
        }
        renderWidget()
      }
      if (e.target.closest('[data-reblose]')) {
        sh.onclick = null
        A.closeDialog(sh)
        R.step = 0
        rerender()
        A.toast(`${m.name} won. Back to Lorelei: the ₽ you won is kept, but those trainers won’t pay again`)
        const l = $('.ev-ladder')
        if (l && !REDUCED) {
          l.classList.remove('reset')
          void l.offsetWidth
          l.classList.add('reset')
        }
      }
    }
    A.openDialog(sh)
  }
  function medal(t, gold) {
    const ov = overlay()
    const last = EVS.reb.done >= 3
    ov.innerHTML = `<div class="ev-reward medal" role="dialog" aria-modal="true" aria-labelledby="ev-md-t">
      <canvas class="ev-confetti" width="288" height="320" aria-hidden="true"></canvas>
      <span class="ev-rays" aria-hidden="true"></span>
      <span class="ev-medal big m${CFG.rebattle.indexOf(t)}" aria-hidden="true"></span>
      <p class="ev-rw-eyebrow">KANTO LEAGUE</p>
      <h3 id="ev-md-t">${t.tier} tier cleared!</h3>
      <p class="ev-rw-sub">${gold ? `Last fight: +₽${gold.toLocaleString('en-US')}.` : 'Last fight: no ₽ (already paid).'} ${last ? 'Every tier is cleared: the card leaves Home.' : `The ${CFG.rebattle[EVS.reb.tier].tier.toLowerCase()} tier is open: Lv.${CFG.rebattle[EVS.reb.tier].lv}.`}</p>
      <button type="button" class="ui-btn primary wide" data-ov-close><span>Great!</span></button></div>`
    ov.hidden = false
    $('[data-ov-close]', ov).focus()
    confetti($('.ev-confetti', ov))
    SND().tone(523, 0.15, { vol: 0.05 })
    SND().tone(784, 0.15, { vol: 0.05, at: 0.15 })
    SND().tone(1047, 0.4, { vol: 0.05, at: 0.3 })
  }

  // ------------------------------------------------------------------ the unlock pop-up
  // The rules read the admin's numbers, so a rebalance shows up in the pop-up too.
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '')
  function rules(id) {
    const R = CFG.raid
    if (id === 'wheel') {
      const rows = CFG.wheel.filter((r) => r.n > 0 && r.odds > 0)
      const tot = rows.reduce((n, r) => n + r.n * r.odds, 0) || 1
      const rare = [...rows].sort((a, b) => a.n * a.odds - b.n * b.odds)[0]
      const pct = (r) => +(((r.n * r.odds) / tot) * 100).toFixed(1)
      return [
        ['coin', 'Once a day', 'Spin the wheel for free once a day. A new spin comes at midnight (UTC).'],
        [rare && rare.kind === 'item' ? rare.key : 'coin', 'Prizes', `${list(rows.map(rewardName))}.${rare ? ` The rarest: ${rewardName(rare)}, ${pct(rare)} % a spin.` : ''}`],
        ['info', 'The odds', 'Tap Info under the wheel to see every prize’s chance.'],
      ]
    }
    if (id === 'raid') {
      const friends = R.maxFriends ? `Up to ${R.maxFriends === 1 ? 'one friend’s team' : `${R.maxFriends} friends’ teams`} fight beside you on their own; trainers fill the empty spots.` : 'Trainers fight beside you on their own.'
      return [
        ['mon', 'A rare Pokémon every day', 'A raid lasts until midnight (UTC). It never runs away: retry until you catch it.'],
        ['team', 'Three sides, one fight', `Register three Pokémon (Lv.${R.teamCap} at most). ${friends}`],
        ['bars', 'Break its bars', `It has ${plural(R.bars, 'HP bar')} and ${R.startAllies ? `starts with ${plural(R.startAllies, 'ally', 'allies')}` : 'starts alone'}. Each break lets it call ${plural(R.perBreak, 'more', 'more')}${R.maxField ? `, ${R.maxField} at most by its side` : ''}.`],
        ['ultra-ball', 'Catch it, thank them', `Beat it, then catch it as usual. Friends who helped get a gift (${plural(R.helperCap, 'gift')} a day at most).`],
      ]
    }
    const T = CFG.rebattle
    const lv = (t) => (t.lv === '100' ? 'everyone at Lv.100' : `Lv.${t.lv}`)
    return [
      ['league', 'The League, stronger', `The Elite Four and your rival again, in ${plural(T.length, 'tier')}: ${list(T.map(lv))}.`],
      ['potion', 'No break', 'Five fights in a row with no Pokémon Center. Items are allowed. A loss sends you back to the first fight.'],
      ['coin', 'Bigger prizes', `Each win pays ${list(T.map((t) => `×${t.gold}`))} the usual prize money. You keep it after a loss, but each trainer pays only once.`],
    ]
  }
  function ruleIco(k) {
    if (k === 'coin') return `<img class="px ev-ri-img" alt="" src="${A.icons.COIN}" />`
    if (k === 'info') return '<span class="ev-ri-i">Info</span>'
    if (k === 'mon') return dexIco(raidSpecies().dex)
    if (k === 'team') return '<span class="ev-ri-3"><i></i><i></i><i></i></span>'
    if (k === 'bars') return `<span class="ev-ri-bars">${CFG.raid.colors.slice(0, Math.min(5, CFG.raid.bars)).map((c) => `<i style="--c:${c}"></i>`).join('')}</span>`
    if (k === 'league') return portrait('elite-lance', 'sm')
    return ITEM(k === 'potion' ? 'hyper-potion' : k) ? itemIco(k === 'potion' ? 'hyper-potion' : k) : `<img class="px ev-ri-img" alt="" src="${A.icons.COIN}" />`
  }
  function bannerArt(id) {
    if (id === 'wheel') {
      const c = document.createElement('canvas')
      c.width = c.height = 192
      drawWheel(c.getContext('2d'), 192, 20)
      return `<img class="ev-pop-wheel" alt="" src="${c.toDataURL()}" />`
    }
    if (id === 'raid') return `<img class="px ev-pop-sil" alt="" src="${front(raidSpecies().dex)}" />`
    return `<span class="ev-pop-five">${LEAGUE.map((m) => portrait(m.img)).join('')}</span>`
  }
  function popup(id) {
    const ov = overlay()
    ov.innerHTML = `<div class="ev-pop" role="dialog" aria-modal="true" aria-labelledby="ev-pop-t">
      <div class="ev-pop-banner" style="${artOf(id)}">${bannerArt(id)}<span class="ev-pop-tag">NEW EVENT</span></div>
      <h3 id="ev-pop-t">${DEF[id].name}</h3>
      <ul class="ev-rules">${rules(id).map(([k, h, t]) => `<li><span class="ev-ri">${ruleIco(k)}</span><span><b>${esc(h)}</b><small>${esc(t)}</small></span></li>`).join('')}</ul>
      <div class="ev-pop-foot"><button type="button" class="ui-btn" data-ov-close><span>Later</span></button><button type="button" class="ui-btn primary" data-pop-go="${id}"><span>Let’s go!</span></button></div></div>`
    ov.hidden = false
    EVS.seen.add(id)
    SND().tone(660, 0.1, { vol: 0.04 })
    SND().tone(990, 0.2, { vol: 0.04, at: 0.1 })
    $('[data-pop-go]', ov).focus()
  }
  function nextPopup() {
    const id = EVS.queue.shift()
    if (id) popup(id)
  }
  function queuePopups() {
    // Only the newest unlock gets its pop-up; a save that already had the older events doesn't see them all at once.
    const fresh = active()
      .filter((id) => !EVS.seen.has(id))
      .sort((a, b) => DEF[b].unlock - DEF[a].unlock)
    EVS.queue = fresh.slice(0, 1)
    active().forEach((id) => id !== EVS.queue[0] && EVS.seen.add(id))
  }
  // The helper's side: a gift on the next login.
  function giftPopup() {
    const R = CFG.raid
    const tot = R.gifts.reduce((n, g) => n + g.odds, 0)
    let x = Math.random() * tot
    const gft = R.gifts.find((g) => (x -= g.odds) <= 0) || R.gifts[0]
    EVS.gifts = Math.min(R.helperCap, EVS.gifts + 1)
    const ov = overlay()
    ov.innerHTML = `<div class="ev-reward" role="dialog" aria-modal="true" aria-labelledby="ev-gf-t">
      <span class="ev-rays" aria-hidden="true"></span>
      <span class="ev-gift-who">${A.lookOf('cooltrainer-f', 'big')}<span class="ev-gift-mon">${dexIco(251)}</span></span>
      <p class="ev-rw-eyebrow">THANKS FOR THE HELP!</p>
      <h3 id="ev-gf-t">Your raid team helped Lea catch Celebi</h3>
      <span class="ev-rw-ico">${`<span class="it x3" style="background-position:-${ITEM(gft.key).i * 90}px 0"></span>`}</span>
      <p class="ev-rw-sub"><b>+1 ${esc(ITEM(gft.key).name)}</b> · gifts today ${EVS.gifts}/${R.helperCap}</p>
      <button type="button" class="ui-btn primary wide" data-ov-close><span>Nice!</span></button></div>`
    ov.hidden = false
    $('[data-ov-close]', ov).focus()
    if (A.SAVE.bag) A.SAVE.bag[gft.key] = (A.SAVE.bag[gft.key] || 0) + 1
  }
  function overlay() {
    let ov = $('#ev-ov')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'ev-ov'
      ov.className = 'ev-ov'
      ov.hidden = true
      $('.hm-screen').appendChild(ov)
      ov.addEventListener('click', (e) => {
        if (e.target.closest('[data-ov-close]') || e.target === ov) {
          ov.hidden = true
          nextPopup()
        }
        if (e.target.closest('[data-ov-raid]')) {
          ov.hidden = true
          return startRaid()
        }
        const go = e.target.closest('[data-pop-go]')
        if (go) {
          ov.hidden = true
          EVS.tab = go.dataset.popGo
          A.showPage('events')
        }
      })
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          ov.hidden = true
        }
      })
    }
    return ov
  }

  // ------------------------------------------------------------------ the Events page
  function eventsRender(p) {
    const list = active()
    if (!list.length) {
      p.innerHTML = `<div class="pg-head"><button type="button" class="pg-back" data-home aria-label="Back to Home"></button><h2>Events</h2></div><p class="pg-note">No event yet. The first one, the Fortune Wheel, opens when you clear Routes 7 & 8.</p>`
      return
    }
    if (!list.includes(EVS.tab)) EVS.tab = list[0]
    p.innerHTML = `<header class="ev-head" style="${artOf(EVS.tab)}">
        <button type="button" class="pg-back ev-back" data-home aria-label="Back to Home"></button>
        <div class="ev-head-t"><h2>${DEF[EVS.tab].name}</h2><small data-ev-sub="${EVS.tab}">${esc(subText(EVS.tab))}</small></div>
      </header>
      <div class="ev-body">${EVS.tab === 'wheel' ? wheelTab() : EVS.tab === 'raid' ? raidTab() : rebattleTab()}</div>`
    if (EVS.tab === 'wheel') mountWheel()
  }
  const page = (id) => $(`.hm-page[data-page="${id}"]`)
  function rerender() {
    const p = page('events')
    if (p && !p.hidden) eventsRender(p)
    renderWidget()
  }
  function click(e) {
    const t = e.target
    let b
    if (t.closest('[data-home]')) return A.showPage('home')
    if ((b = t.closest('[data-evtab]'))) {
      EVS.tab = b.dataset.evtab
      rerender()
      return $(`[data-evtab="${EVS.tab}"]`).focus({ preventScroll: true })
    }
    if (t.closest('[data-spin]')) return spin()
    if (t.closest('[data-respin]')) {
      EVS.spun = false
      return rerender()
    }
    if (t.closest('[data-odds]')) return oddsSheet()
    if (t.closest('[data-raidteam]')) return raidTeamSheet()
    if ((b = t.closest('[data-ally]'))) {
      const n = b.dataset.ally
      if (EVS.allies.includes(n)) EVS.allies = EVS.allies.filter((x) => x !== n)
      else if (EVS.allies.length < CFG.raid.maxFriends) EVS.allies.push(n)
      else return A.toast(`${CFG.raid.maxFriends} friends at most: take one out first`)
      rerender()
      return $(`[data-ally="${n}"]`) && $(`[data-ally="${n}"]`).focus({ preventScroll: true })
    }
    if ((b = t.closest('[data-unally]'))) {
      EVS.allies = EVS.allies.filter((x) => x !== b.dataset.unally)
      return rerender()
    }
    if (t.closest('[data-raidgo]')) return raidGo()
    if (t.closest('[data-rebgo]')) return rebFight()
    if (t.closest('[data-reblocked]')) return A.toast('Johto’s rebattle opens when you beat the Johto League')
  }
  function raidClick(e) {
    const t = e.target
    if (t.closest('[data-rdleave]')) {
      if (RB) RB.over = true
      EVS.tab = 'raid'
      return A.showPage('events')
    }
    if (t.closest('[data-rdagain]')) return startRaid()
    if (t.closest('[data-rdfast]')) {
      EVS.fast = !EVS.fast
      const b = t.closest('[data-rdfast]')
      b.setAttribute('aria-pressed', String(EVS.fast))
      b.textContent = EVS.fast ? 'Fast: on' : 'Fast: off'
    }
  }

  // ------------------------------------------------------------------ the preview controls and the admin mock
  function controls() {
    const box = $('#ev-controls')
    if (!box || box.dataset.bound) return
    box.dataset.bound = '1'
    box.addEventListener('click', (e) => {
      let b
      if ((b = e.target.closest('[data-evmode]'))) {
        EVS.mode = b.dataset.evmode
        $$('[data-evmode]', box).forEach((x) => x.setAttribute('aria-checked', String(x === b)))
        EVS.seen.clear()
        queuePopups()
        rerender()
        if (A.SAVE && $('.hm-page[data-page="home"]') && !$('.hm-page[data-page="home"]').hidden) nextPopup()
        return
      }
      if (e.target.closest('[data-evpop]')) {
        A.showPage('home')
        const list = active()
        if (!list.length) return A.toast('No event is open in this preview: pick one above')
        EVS.queue = [...list].sort((a, b) => DEF[b].unlock - DEF[a].unlock)
        return nextPopup()
      }
      if (e.target.closest('[data-evgift]')) {
        A.showPage('home')
        return giftPopup()
      }
      if ((b = e.target.closest('[data-evraid]'))) {
        EVS.raidKind = b.dataset.evraid
        EVS.caught = false
        $$('[data-evraid]', box).forEach((x) => x.setAttribute('aria-checked', String(x === b)))
        return rerender()
      }
      if (e.target.closest('[data-evsound]')) {
        PX.Sound.on = !PX.Sound.on
        if (PX.Sound.on) PX.Sound.ensure()
        const s = e.target.closest('[data-evsound]')
        s.setAttribute('aria-pressed', String(PX.Sound.on))
        s.textContent = PX.Sound.on ? 'Sound on' : 'Sound off'
      }
    })
  }
  function admin() {
    const el = $('#ev-admin')
    if (!el) return
    const R = CFG.raid
    const num = (k, label, o = {}) =>
      `<label><span>${label}</span><input type="number" data-raid="${k}" value="${R[k]}" min="${o.min ?? 0}" max="${o.max ?? 99}" step="${o.step ?? 1}" /></label>`
    const tot = CFG.wheel.reduce((n, r) => n + r.n * r.odds, 0)
    el.innerHTML = `
      <div class="ad-sec"><h3>Events</h3>
        <table class="ad-t"><thead><tr><th>Event</th><th>On</th><th>Priority</th><th>Unlocks when cleared</th><th>Banner</th></tr></thead><tbody>${[
          ['seasonal', 'Seasonal (later)', 'shared · start/end dates'],
          ['raid', 'Raid Battles', 'Safari Zone'],
          ['rebattle', 'Elite Rebattle', 'the region’s League'],
          ['wheel', 'Fortune Wheel', 'Routes 7 & 8 (Celadon)'],
        ]
          .map(
            ([id, n, u]) =>
              `<tr><td>${n}</td><td><input type="checkbox" ${id === 'seasonal' ? 'disabled' : 'checked'} aria-label="${n} on" /></td><td><input type="number" data-prio="${id}" value="${CFG.priority[id]}" min="1" max="9" aria-label="${n} priority" /></td><td>${u}</td><td>${id === 'seasonal' ? '—' : `<select data-banner="${id}" aria-label="${n} banner">${Object.keys(ART).map((b) => `<option ${CFG.banner[id] === b ? 'selected' : ''}>${b}</option>`).join('')}</select>`}</td></tr>`,
          )
          .join('')}</tbody></table>
        <p class="ad-note">Lower number = higher on Home. Banner: one picture per event, used on its page and its pop-up (placeholders from the area pictures until the event art arrives). Rule sections: 2–4 string ids from strings.csv, picked per event.</p></div>
      <div class="ad-sec"><h3>Fortune Wheel</h3>
        <div class="ad-wheel"><table class="ad-t"><thead><tr><th>Prize</th><th>Amount</th><th>Slices</th><th>% each</th><th>Total</th></tr></thead><tbody>${CFG.wheel
          .map(
            (r, i) =>
              `<tr><td>${r.kind === 'gold' ? '₽ (gold)' : esc(ITEM(r.key).name)}</td><td><input type="number" data-w="${i}" data-f="amount" value="${r.amount}" min="1" /></td><td><input type="number" data-w="${i}" data-f="n" value="${r.n}" min="0" max="8" /></td><td><input type="number" data-w="${i}" data-f="odds" value="${r.odds}" min="0" step="0.5" /></td><td>${+(r.n * r.odds).toFixed(2)} %</td></tr>`,
          )
          .join('')}</tbody><tfoot><tr><td colspan="4">Sum</td><td class="${Math.abs(tot - 100) > 0.01 ? 'bad' : 'ok'}">${+tot.toFixed(2)} %</td></tr></tfoot></table>
        <canvas id="ad-wcv" width="192" height="192" aria-label="Preview of the wheel"></canvas></div>
        ${Math.abs(tot - 100) > 0.01 ? '<p class="ad-note bad">Doesn’t add up to 100 %: the game scales the odds.</p>' : ''}</div>
      <div class="ad-sec"><h3>Raids</h3><div class="ad-grid">
        ${num('bars', 'HP bars', { min: 1, max: 5 })}${num('startAllies', 'Allies at the start', { max: 2 })}${num('perBreak', 'Summon points per break')}${num('maxField', 'Max beside it', { min: 0, max: 2 })}
        ${num('level', 'Raid level', { min: 1, max: 100 })}${num('upgrade', 'Dice / upgrade level', { min: 1, max: 10 })}${num('teamCap', 'Team level cap', { max: 100 })}${num('maxFriends', 'Friends per raid', { max: 2 })}
        ${num('shiny', 'Fallback shiny %', { max: 100 })}${num('repeatHours', 'No repeat within (h)', { max: 240 })}${num('helperCap', 'Helper gifts per day', { max: 20 })}
        <label><span>Bar colours</span><span class="ad-cols">${R.colors.slice(0, R.bars).map((c, i) => `<input type="color" data-col="${i}" value="${c}" aria-label="Bar ${i + 1} colour" />`).join('')}</span></label>
      </div>
      <table class="ad-t"><thead><tr><th>Helper gift</th><th>Odds</th></tr></thead><tbody>${R.gifts.map((g) => `<tr><td>${esc(ITEM(g.key).name)}</td><td>${g.odds} %</td></tr>`).join('')}</tbody></table>
      <p class="ad-note">Pool: ${POOL.length} legendaries (each tied to its area) · fallback: ${FALLBACK.length} species by region · NPC allies and summons: fully evolved, no legendary, mythical, starter line or pseudo-legendary.</p></div>
      <div class="ad-sec"><h3>Elite Rebattle</h3><table class="ad-t"><thead><tr><th>Tier</th><th>Levels</th><th>Gold</th><th>Foe upgrades</th></tr></thead><tbody>${CFG.rebattle.map((t) => `<tr><td>${t.tier}</td><td>${t.lv === '100' ? 'all Lv.100' : `League I ${t.lv}`}</td><td>×${t.gold}</td><td>League ${t.up}</td></tr>`).join('')}</tbody></table>
      <p class="ad-note">Teams per tier are generated, then editable in the trainer team editor. The Champion slot is the rival (per starter).</p></div>
      <div class="ad-sec"><h3>Dev tools</h3><div class="ad-dev"><button type="button" class="btn small" data-addev="spin">Reset my spin</button><button type="button" class="btn small" data-addev="raid">Rotate my raid</button><button type="button" class="btn small" data-addev="reb">Reset rebattle</button><button type="button" class="btn small" data-addev="gift">Grant a helper gift</button></div></div>`
    const cv = $('#ad-wcv')
    drawWheel(cv.getContext('2d'), 192, 0)
    if (el.dataset.bound) return
    el.dataset.bound = '1'
    el.addEventListener('change', (e) => {
      const t = e.target
      if (t.dataset.w != null) CFG.wheel[+t.dataset.w][t.dataset.f] = Math.max(0, Number(t.value) || 0)
      else if (t.dataset.raid) CFG.raid[t.dataset.raid] = Number(t.value) || 0
      else if (t.dataset.prio) CFG.priority[t.dataset.prio] = Number(t.value) || 1
      else if (t.dataset.banner) CFG.banner[t.dataset.banner] = t.value
      else if (t.dataset.col) CFG.raid.colors[+t.dataset.col] = t.value
      else return
      ICONS = null
      admin()
      rerender()
    })
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-addev]')
      if (!b) return
      const k = b.dataset.addev
      if (k === 'spin') EVS.spun = false
      if (k === 'raid') {
        EVS.raidKind = EVS.raidKind === 'mew' ? 'shiny' : EVS.raidKind === 'shiny' ? 'fallback' : 'mew'
        EVS.caught = false
        $$('[data-evraid]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.evraid === EVS.raidKind)))
      }
      if (k === 'reb') EVS.reb = { tier: 0, step: 0, done: 0, paid: new Set() }
      if (k === 'gift') {
        A.showPage('home')
        giftPopup()
      }
      rerender()
      A.toast(b.textContent)
    })
  }

  // ------------------------------------------------------------------ the Pokédex: where raids fit in
  // A raid species says how to get its raid ("Clear Faraway Island…"), or that it's in your pool; a powerful
  // Pokémon of the fallback pool says it can show up when the pool runs dry. In the lab, Mew joins your pool as
  // soon as raids are open.
  A.raidWhere = (d) => {
    const p = POOL.find((x) => x[0] === d)
    const f = FALLBACK.find((x) => x[0] === d)
    if (!p && !f) return ''
    const open = unlocked('raid')
    const inPool = open && d === 151
    let sub
    if (!open) sub = `${DEF.raid.unlockText} to open raids${p ? `, then clear ${p[2]} for its raid` : ''}`
    else if (p) sub = inPool ? 'In your raid pool: it can be the raid of the day' : `Clear ${p[2]} to unlock its raid`
    else sub = `Shows up when your raid pool has nothing left · shiny ${CFG.raid.shiny} %`
    const ok = open && (inPool || !p)
    return `<li class="pg-where ev-where${ok ? '' : ' st-locked'}"><span class="pg-where-ban ev-where-ban" aria-hidden="true"><img class="px" alt="" src="${icons().raid}" /></span><span class="pg-where-t"><b>Raid Battles</b><small>${esc(sub)}</small></span>${ok ? '<button type="button" class="hm-gobtn" data-goraid aria-label="Open the raids">GO</button>' : `<span class="hm-gobtn off" aria-hidden="true"><img class="px" alt="" src="${A.icons.LOCK}" /></span>`}</li>`
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-goraid]')) return
    EVS.tab = 'raid'
    A.showPage('events')
  })

  // ------------------------------------------------------------------ wiring
  function reset() {
    // The plan deletes Victory Road II and League II: the lab's Kanto drops them too.
    const K = A.K
    for (let i = K.areas.length - 1; i >= 0; i--) if (/ II$/.test(K.areas[i].name)) K.areas.splice(i, 1)
    EVS.spun = false
    EVS.caught = false
    EVS.tries = 0
    EVS.reb = { tier: 0, step: 0, done: 0, paid: new Set() }
    EVS.tab = null
    // Raids won so far in each preview save (raids open with the Safari Zone).
    A.raidsWon = { mid: 0, versus: 3, league: 7 }[A.SAVE.id] || 0
    controls()
    admin()
    queuePopups()
    renderWidget()
    // The pop-up waits until Home is on screen (after the other pop-ups in the game).
    setTimeout(() => {
      const home = $('.hm-page[data-page="home"]')
      if (home && !home.hidden) nextPopup()
    }, 400)
  }
  $('#hm-events') &&
    $('#hm-events').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ev]')
      if (b) {
        EVS.tab = b.dataset.ev
        return A.showPage('events')
      }
      A.toast(A.SAVE.badges >= CFG.teaserBadges ? 'Special events open soon: clear Routes 7 & 8 for the first one' : 'Special events: coming later')
    })
  HOME.page('events', {
    render(p) {
      if (!p.dataset.bound) {
        p.dataset.bound = '1'
        p.addEventListener('click', click)
      }
      eventsRender(p)
    },
    reset,
    dot: null,
  })
  HOME.page('raid', {
    full: true,
    render(p) {
      if (!p.dataset.bound) {
        p.dataset.bound = '1'
        p.addEventListener('click', raidClick)
      }
      raidRender(p)
    },
    leave() {
      if (RB) RB.over = true
    },
    dot: null,
  })
  // Countdowns tick on Home and on the Events page.
  setInterval(tick, 30000)
})()
