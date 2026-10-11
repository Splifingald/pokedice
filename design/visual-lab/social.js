/*
 * Pokédice Visual Lab: the screens about other trainers (Johto Daybreak, Jersey 20).
 * Versus, from its Home widget: opponents to fight (on auto, in battle.js), my team of three Lv.50 clones, the Versus
 * board. The leaderboard, from the cup: max level, progression, Pokédex, shinies, with a Hall of Fame for whoever has
 * maxed a board out. The trainer card, from the avatar: the look other trainers see, the badge case, the menu.
 * Rules and wording from src/engine/versus.ts, src/screens/Versus.tsx and Leaderboard.tsx, src/lib/avatars.ts.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco, plural } = A
  const UI = () => window.PDUI

  // ------------------------------------------------------------------ other trainers (made up for the preview)
  // vs: their Versus team (three at Lv.50, in order); team: who they show on the leaderboard.
  const PEOPLE = [
    {
      name: 'Mio',
      raids: 14,
      look: 'beauty',
      vs: [146, 144, 135],
      lv: 100,
      areas: 23,
      dex: 151,
      shiny: 9,
      atk: 21,
      def: 18,
    },
    {
      name: 'Sora',
      raids: 11,
      look: 'swimmer-f',
      vs: [150, 131, 143],
      lv: 100,
      areas: 23,
      dex: 146,
      shiny: 6,
      atk: 15,
      def: 11,
    },
    {
      name: 'Lea',
      raids: 9,
      look: 'cooltrainer-f',
      vs: [149, 94, 130],
      lv: 74,
      areas: 23,
      dex: 139,
      shiny: 4,
      atk: 12,
      def: 9,
    },
    {
      name: 'Noor',
      raids: 6,
      look: 'psychic-m',
      vs: [143, 65, 68],
      lv: 68,
      areas: 21,
      dex: 128,
      shiny: 2,
      atk: 9,
      def: 14,
    },
    {
      name: 'Ivy',
      raids: 4,
      look: 'channeler',
      vs: [94, 65, 113],
      lv: 63,
      areas: 22,
      dex: 121,
      shiny: 0,
      atk: 8,
      def: 4,
    },
    { name: 'Kai',
      raids: 5, look: 'hiker', vs: [59, 145, 76], lv: 61, areas: 20, dex: 117, shiny: 1, atk: 7, def: 5 },
    {
      name: 'Ana',
      raids: 2,
      look: 'ranger-f',
      vs: [113, 123, 131],
      lv: 58,
      areas: 19,
      dex: 104,
      shiny: 3,
      atk: 5,
      def: 7,
    },
    {
      name: 'Theo',
      raids: 1,
      look: 'youngster',
      vs: [115, 128, 127],
      lv: 55,
      areas: 17,
      dex: 96,
      shiny: 0,
      atk: 3,
      def: 2,
    },
    {
      name: 'Rin',
      raids: 0,
      look: 'black-belt',
      vs: [68, 128, 111],
      lv: 52,
      areas: 16,
      dex: 88,
      shiny: 1,
      atk: 2,
      def: 1,
    },
    { name: 'Jo',
      raids: 0, look: 'lass', team: [35, 39, 133], lv: 44, areas: 14, dex: 77, shiny: 0 },
    { name: 'Ezra',
      raids: 0, look: 'scientist', team: [81, 100, 137], lv: 39, areas: 12, dex: 70, shiny: 1 },
    { name: 'Pia',
      raids: 0, look: 'picnicker', team: [43, 69, 102], lv: 33, areas: 10, dex: 58, shiny: 0 },
    { name: 'Max',
      raids: 0, look: 'camper', team: [19, 21, 27], lv: 27, areas: 8, dex: 41, shiny: 0 },
    { name: 'Ben',
      raids: 0, look: 'bug-catcher', team: [10, 13, 48], lv: 21, areas: 6, dex: 35, shiny: 2 },
  ]
  const opponents = () => PEOPLE.filter((p) => p.vs)
  const ST = {
    vsTab: 'fight',
    vsF: 'tobeat',
    vsQ: '',
    vsBoard: 'atk',
    board: 'level',
    pick: [],
    lookOpen: false,
    naming: false,
  }
  const VSS = { beaten: new Set(), team: null }

  // The trainer's look, cut from the sheet of the game's trainer sprites (battle.js loads it).
  const lookOf = (name, cls) => A.lookOf(name, cls)
  const LOOK_NAME = (k) =>
    ({
      red: 'Red',
      green: 'Leaf',
      'psychic-m': 'Psychic',
      'swimmer-f': 'Swimmer',
      'cooltrainer-m': 'Cool Trainer',
      'cooltrainer-f': 'Cool Trainer',
      'ranger-f': 'Pokémon Ranger',
      'ranger-m': 'Pokémon Ranger',
    })[k] || k.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const teamIcons = (team, lv) =>
    `<span class="so-team">${team.map((d) => `<span class="so-mon" title="${esc(A.K.names[d])}${lv ? ` Lv.${lv}` : ''}">${dexIco(d)}</span>`).join('')}</span>`

  // ------------------------------------------------------------------ you, as the boards see you
  function me() {
    const S = A.SAVE
    const own = A.owned()
    return {
      name: S.trainer,
      look: S.look || 'red',
      team: A.TEAM.map((m) => m.dex),
      lv: Math.max(...own.map((m) => m.lv)),
      areas: A.K.areas.filter((a) => A.clearedArea(a)).length,
      dex: A.caught.size,
      shiny: own.filter((m) => m.shiny).length,
      atk: VSS.beaten.size,
      def: A.VS.defense,
      raids: A.raidsWon || 0,
      vs: VSS.team,
      isMe: true,
    }
  }
  const AREAS = () => A.K.areas.length
  const BOARDS = {
    level: {
      label: 'Max level',
      note: 'Your highest-level Pokémon.',
      val: (p) => p.lv,
      fmt: (p) => `Lv.${p.lv}`,
      max: () => 100,
      hall: 'These trainers hit the level cap. Nobody can pass them, so they watch the board from here.',
    },
    progress: {
      label: 'Progression',
      note: 'Areas cleared in Kanto.',
      val: (p) => p.areas,
      fmt: (p) => `${p.areas}/${AREAS()}`,
      max: AREAS,
      hall: 'These trainers cleared every area of the region. Nobody can pass them, so they watch the board from here.',
    },
    dex: {
      label: 'Pokédex',
      note: 'Species caught in Kanto.',
      val: (p) => p.dex,
      fmt: (p) => `${p.dex}/151`,
      max: () => 151,
      hall: 'These trainers filled the region’s Pokédex. Nobody can pass them, so they watch the board from here.',
    },
    shiny: {
      label: 'Shiny',
      note: 'Shiny Pokémon owned.',
      val: (p) => p.shiny,
      fmt: (p) => plural(p.shiny, 'shiny', 'shinies'),
      max: () => Infinity,
    },
    // Raids won: only the raids where the raid Pokémon was caught count (events.js).
    raids: {
      label: 'Raids',
      note: 'Raids won: the raid Pokémon was caught.',
      val: (p) => p.raids || 0,
      fmt: (p) => plural(p.raids || 0, 'raid'),
      max: () => Infinity,
    },
  }
  /** One board: who's ranked, who's in the Hall of Fame (maxed out), with ties sharing a rank. */
  function ranked(key) {
    const B = BOARDS[key]
    const all = [...PEOPLE, me()]
    const hall = all.filter((p) => B.val(p) >= B.max())
    const rows = all
      .filter((p) => B.val(p) < B.max())
      .sort((a, b) => B.val(b) - B.val(a) || a.name.localeCompare(b.name))
    rows.forEach((p, i) => (p.rank = i && B.val(rows[i - 1]) === B.val(p) ? rows[i - 1].rank : i + 1))
    return { rows, hall }
  }
  const medal = (r) => `<span class="so-rank${r <= 3 ? ` m${r}` : ''}" aria-label="Rank ${r}">${r}</span>`
  function boardRow(p, value, sub) {
    return `<li class="so-row${p.isMe ? ' me' : ''}"${p.isMe ? ' id="so-me"' : ''}>${medal(p.rank)}${lookOf(p.look)}
      <span class="so-who"><b>${esc(p.name)}${p.isMe ? ' <em>you</em>' : ''}</b>${teamIcons(p.vs || p.team)}</span>
      <span class="so-val"><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</span></li>`
  }

  // ------------------------------------------------------------------ the leaderboard (the cup)
  function ranksRender(p) {
    const key = ST.board,
      B = BOARDS[key]
    const { rows, hall } = ranked(key)
    const mine = rows.find((r) => r.isMe)
    const meHall = hall.some((r) => r.isMe)
    p.innerHTML = `
      <div class="pg-head"><button type="button" class="pg-back" data-home aria-label="Back to Home"></button><img class="px pg-h-ico" alt="" src="${A.icons.NAV.ranks}" /><h2>Leaderboard</h2><span class="pg-count">Kanto</span></div>
      <div class="hm-seg pg-tabs so-tabs4 so-tabs5" role="tablist" aria-label="Sort by">${Object.entries(BOARDS)
        .map(
          ([k, b]) =>
            `<button type="button" role="tab" data-board="${k}" aria-selected="${k === key}">${b.label}</button>`,
        )
        .join('')}</div>
      <button type="button" class="so-mine" data-findme>${lookOf(me().look)}<span><small>${B.note}</small><b>${meHall ? 'You’re in the Hall of Fame' : `You’re #${mine.rank} of ${rows.length}`}</b></span><span class="so-val"><b>${B.fmt(me())}</b></span></button>
      ${hall.length ? `<button type="button" class="so-hall" data-hall><span class="so-crown" aria-hidden="true"></span><span><b>Hall of Fame</b><small>${plural(hall.length, 'trainer')} maxed this board out</small></span><span class="so-hall-faces">${hall.map((h) => lookOf(h.look, 'sm')).join('')}</span></button>` : ''}
      <ol class="so-board" aria-label="${B.label}">${rows.map((r) => boardRow(r, B.fmt(r), key === 'progress' ? `${r.areas >= 22 ? 8 : Math.min(8, Math.floor(r.areas / 2.6))} badges` : '')).join('')}</ol>`
  }
  function hallSheet() {
    const B = BOARDS[ST.board]
    const { hall } = ranked(ST.board)
    $('#hm-s2-title').textContent = 'Hall of Fame'
    $('#hm-s2-sub').textContent = `${B.label} · ${plural(hall.length, 'trainer')}`
    $('#hm-s2-body').innerHTML =
      `<p class="pg-note">${B.hall}</p><ul class="so-board">${hall.map((h) => `<li class="so-row${h.isMe ? ' me' : ''}"><span class="so-crown" aria-hidden="true"></span>${lookOf(h.look)}<span class="so-who"><b>${esc(h.name)}${h.isMe ? ' <em>you</em>' : ''}</b>${teamIcons(h.vs || h.team)}</span><span class="so-val"><b>${B.fmt(h)}</b></span></li>`).join('')}</ul>`
    $('#hm-s2-foot').hidden = true
    A.openDialog($('#hm-sheet2'))
  }

  // ------------------------------------------------------------------ Versus (its widget)
  const eligible = () => A.owned().filter((m) => m.lv >= 50)
  /** How your team's types do against theirs: how many of their three you hit super effectively. */
  function edge(team) {
    const mine = (VSS.team || []).flatMap((d) => A.K.types[d])
    const chart = A.G.chart
    return team.filter((d) =>
      mine.some((t) => A.K.types[d].reduce((m, x) => m * ((chart[t] || {})[x] ?? 1), 1) > 1),
    ).length
  }
  function versusRender(p) {
    const S = A.SAVE
    const head = `<div class="pg-head"><button type="button" class="pg-back" data-home aria-label="Back to Home"></button><h2>Versus</h2><span class="so-auto">AUTO · LV.50</span></div>`
    if (!S.versus) {
      const n = Math.min(3, eligible().length)
      // The three closest to Lv.50, wherever they are (team, Box).
      const best = A.owned()
        .sort((a, b) => b.lv - a.lv)
        .slice(0, 3)
        .map((m) => ({ ...m, name: m.name || A.K.names[m.dex] }))
      p.innerHTML = `${head}
        <div class="so-locked"><img class="px" alt="" src="${A.icons.LOCK3}" /><b>Versus opens when 3 of your Pokémon reach Lv.50.</b>
          <span class="hm-meter"><i style="width:${(n / 3) * 100}%"></i></span><small>${n}/3 at Lv.50</small></div>
        <div class="pg-sec-h"><h3>Closest</h3></div>
        <ul class="so-close">${best.map((m) => `<li>${dexIco(m.dex)}<b>${esc(m.name)}</b><span class="hm-meter"><i style="width:${Math.min(100, (m.lv / 50) * 100)}%"></i></span><small>${m.lv >= 50 ? 'Ready' : `Lv.${m.lv} · ${50 - m.lv} to go`}</small></li>`).join('')}</ul>
        <p class="pg-note">Leave a team of three for other trainers to fight, and fight theirs. Every fight plays itself, and its result is decided the moment it starts.</p>`
      return
    }
    const opp = opponents()
    const toBeat = opp.filter((o) => !VSS.beaten.has(o.name)).length
    p.innerHTML = `${head}
      <p class="pg-note">Leave a team of three for other trainers to fight, and fight theirs. Every fight plays itself, and its result is decided the moment it starts.</p>
      <div class="hm-seg pg-tabs" role="tablist" aria-label="Versus">${[
        ['fight', 'Opponents', toBeat],
        ['team', 'My team', ''],
        ['board', 'Leaderboard', ''],
      ]
        .map(
          ([k, l, n]) =>
            `<button type="button" role="tab" data-vstab="${k}" aria-selected="${ST.vsTab === k}">${l} <i>${n || ''}</i></button>`,
        )
        .join('')}</div>
      <div class="so-body">${ST.vsTab === 'team' ? teamTab() : ST.vsTab === 'board' ? vsBoard() : fightTab(opp)}</div>`
  }
  function fightTab(opp) {
    if (!VSS.team)
      return `<div class="so-first"><p>Set your team first: it fights for you in attack and in defense.</p><button type="button" class="ui-btn primary" data-vstab="team"><span>Set my team</span></button></div>`
    const q = A.fold(ST.vsQ.trim())
    const beaten = opp.filter((o) => VSS.beaten.has(o.name)).length
    const list = opp
      .filter((o) =>
        ST.vsF === 'all' ? true : ST.vsF === 'beaten' ? VSS.beaten.has(o.name) : !VSS.beaten.has(o.name),
      )
      .filter((o) => !q || A.fold(o.name).includes(q) || o.vs.some((d) => A.fold(A.K.names[d]).includes(q)))
    return `<div class="so-mine-team"><span>Your team</span>${teamIcons(VSS.team, 50)}<button type="button" class="pg-hint" data-vstab="team">Change</button></div>
      <div class="pg-tools"><label class="sr" for="so-q">Search a trainer or a Pokémon</label><input id="so-q" type="search" placeholder="Search a trainer or a Pokémon" autocomplete="off" spellcheck="false" value="${esc(ST.vsQ)}" /></div>
      <div class="hm-chips so-chips" role="radiogroup" aria-label="Show">${[
        ['tobeat', 'To beat', opp.length - beaten],
        ['beaten', 'Beaten', beaten],
        ['all', 'All', opp.length],
      ]
        .map(
          ([k, l, n]) =>
            `<button type="button" role="radio" data-vsf="${k}" aria-checked="${ST.vsF === k}">${l} <i>${n}</i></button>`,
        )
        .join('')}</div>
      <ul class="so-opps">${
        list
          .map((o) => {
            const won = VSS.beaten.has(o.name),
              e = edge(o.vs)
            return `<li class="so-opp${won ? ' won' : ''}">${lookOf(o.look)}
              <span class="so-who"><b>${esc(o.name)}</b>${teamIcons(o.vs, 50)}<small class="so-edge${e >= 2 ? ' good' : e === 0 ? ' bad' : ''}">${e ? `You hit ${e} of 3 super effectively` : 'No super-effective hit on them'}</small></span>
              ${won ? `<span class="so-beaten" title="You beat this team. When ${esc(o.name)} changes it, you can fight again.">Beaten</span>` : `<button type="button" class="ui-btn primary so-fight" data-fight="${esc(o.name)}" aria-label="Fight ${esc(o.name)}"><span>Fight</span></button>`}</li>`
          })
          .join('') ||
        `<li class="hm-empty">${ST.vsF === 'tobeat' && !q ? 'You beat every team! New teams show up here.' : 'No trainer by that name.'}</li>`
      }</ul>`
  }
  function teamTab() {
    const pick = ST.pick
    const saved = VSS.team && VSS.team.join() === pick.join()
    const el = eligible()
    return `<p class="pg-note">Pick three Pokémon at Lv.50 or more, in the order they go out. They fight as clones at Lv.50, and every upgrade is the same for everyone: levelling up later changes nothing.</p>
      <ol class="so-slots">${[0, 1, 2]
        .map((i) => {
          const d = pick[i]
          if (d == null)
            return `<li class="so-slot empty"><span class="so-n">${i + 1}</span><span>Pick one below</span></li>`
          const m = el.find((x) => x.dex === d)
          return `<li class="so-slot"><span class="so-n">${i + 1}</span>${A.sprCanvas(d, 72, 64)}<b>${esc(A.K.names[d])}</b><small>${m && m.lv > 50 ? `Lv.${m.lv} → 50` : 'Lv.50'}</small></li>`
        })
        .join('')}</ol>
      <ul class="so-pick">${el
        .map((m) => {
          const at = pick.indexOf(m.dex)
          return `<li><button type="button" class="pg-useit" data-pickvs="${m.dex}" aria-pressed="${at >= 0}">${dexIco(m.dex)}<span><b>${esc(m.name || A.K.names[m.dex])}</b><small>Lv.${m.lv} · ${A.K.types[m.dex].join(' / ')}</small></span>${at >= 0 ? `<em class="so-order">${at + 1}</em>` : ''}</button></li>`
        })
        .join('')}</ul>
      <div class="so-save"><button type="button" class="ui-btn" data-vsclear${pick.length ? '' : ' disabled'}><span>Clear</span></button><button type="button" class="ui-btn primary" data-vssave${pick.length === 3 && !saved ? '' : ' disabled'}><span>${saved ? 'Team saved' : 'Save team'}</span></button></div>`
  }
  function vsBoard() {
    const atk = ST.vsBoard === 'atk'
    const all = [...opponents(), me()].filter((p) => p.vs)
    const val = (p) => (atk ? p.atk : p.def) || 0
    const rows = all.sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name))
    rows.forEach((p, i) => (p.rank = i && val(rows[i - 1]) === val(p) ? rows[i - 1].rank : i + 1))
    return `<div class="hm-seg pg-tabs" role="tablist" aria-label="Board">${[
      ['atk', 'Attack'],
      ['def', 'Defense'],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" role="tab" data-vsboard="${k}" aria-selected="${ST.vsBoard === k}">${l}</button>`,
      )
      .join('')}</div>
      <p class="pg-note">${atk ? 'Teams beaten: each team counts once.' : 'Fights won in defense: your team, fighting while you’re away.'}</p>
      <ol class="so-board">${rows.map((r) => boardRow(r, atk ? plural(val(r), 'win') : plural(val(r), 'defense win'))).join('')}</ol>`
  }

  // ------------------------------------------------------------------ the trainer card (the avatar)
  // The eight Kanto badges, 12 × 12, and the crown for clearing the region's last area.
  const BADGES = [
    [
      'Boulder',
      [
        '...kkkkkk...',
        '..kbbbaaak..',
        '.kbwbaaaaak.',
        'kbwbaaaaaack',
        'kbbaaaaaaack',
        'kbaaaaaaaack',
        'kaaaaaaaacck',
        'kaaaaaaaacck',
        'kaaaaaaaccck',
        '.kaaaaacccck',
        '..kaacccck..',
        '...kkkkkk...',
      ],
      { a: '#a8aebb', b: '#d8dce4', c: '#6f7686' },
    ],
    [
      'Cascade',
      [
        '.....kk.....',
        '....kbak....',
        '....kbak....',
        '...kbbaak...',
        '..kbwbaaak..',
        '.kbwbaaaaak.',
        '.kbbaaaaack.',
        'kbaaaaaaaack',
        'kaaaaaaaacck',
        '.kaaaaaacck.',
        '..kaaaccck..',
        '...kkkkkk...',
      ],
      { a: '#4aa8ff', b: '#a9dcff', c: '#1d5fc8' },
    ],
    [
      'Thunder',
      [
        '.....kk.....',
        '.k..kbak..k.',
        '.kk.kbak.kk.',
        '..kkbbaakk..',
        '.kkbwbaaakk.',
        'kbbwbaaaaack',
        'kaaaaaaaccck',
        '.kkaaaaacck.',
        '..kkaaacckk.',
        '.kk.kack.kk.',
        '.k..kcck..k.',
        '.....kk.....',
      ],
      { a: '#ffb23a', b: '#ffe066', c: '#d06a1a' },
    ],
    [
      'Rainbow',
      [
        '....kkkk....',
        '...krrrrk...',
        '.kkkrrrrkkk.',
        'kuuukrrkyyyk',
        'kuuuukkyyyyk',
        'kuuukwwkyyyk',
        'kuuukwwkyyyk',
        'kuuuukkyyyyk',
        'kuuukggkyyyk',
        '.kkkggggkkk.',
        '...kggggk...',
        '....kkkk....',
      ],
      { r: '#f2553f', u: '#5b8def', y: '#ffd23a', g: '#4aa84a' },
    ],
    [
      'Soul',
      [
        '............',
        '.kkk....kkk.',
        'kbbak..kbaak',
        'kbwbakkbaaak',
        'kbbaaaaaaaak',
        'kbaaaaaaaack',
        '.kaaaaaaacck',
        '..kaaaaaack.',
        '...kaaaack..',
        '....kaack...',
        '.....kk.....',
        '............',
      ],
      { a: '#ff7ab0', b: '#ffc2dc', c: '#c8457e' },
    ],
    [
      'Marsh',
      [
        '...kkkkkk...',
        '..kbbbaaak..',
        '.kbwkkkkaak.',
        'kbbk....kack',
        'kbk..kk..kck',
        'kak.kbak.kck',
        'kak.kack.kck',
        'kak..kk..kck',
        'kack....kcck',
        '.kaakkkkccck',
        '..kaacccck..',
        '...kkkkkk...',
      ],
      { a: '#e8b44a', b: '#ffe7a8', c: '#a87a1a' },
    ],
    [
      'Volcano',
      [
        '.....k......',
        '....kak.....',
        '....kaak....',
        '...kbaak.k..',
        '..kbaaakkak.',
        '..kbayaaaak.',
        '.kbayyyaaak.',
        '.kbayywyaack',
        '.kaayywyyack',
        '.kaaayyyaack',
        '..kaaaaacck.',
        '...kkkkkkk..',
      ],
      { a: '#e8481c', b: '#ff9a5a', c: '#9a2a14', y: '#ffd23a' },
    ],
    [
      'Earth',
      [
        '.....kk.....',
        '....kbak....',
        '...kbwaak...',
        '..kbwbaaak..',
        '.kbbbaaaaak.',
        'kbbaaaaaaack',
        'kaaaaaaaacck',
        '.kaaaaaacck.',
        '..kaaaaacck.',
        '...kaaacck..',
        '....kacck...',
        '.....kk.....',
      ],
      { a: '#4aa84a', b: '#a8e08a', c: '#2a6e2f' },
    ],
  ]
  const CROWN = [
    '............',
    '............',
    'k..k.kk.k..k',
    'kk.kkbbkk.kk',
    'kbkkbwbakkak',
    'kbbbwbaaaaak',
    'kbaaaaaaaack',
    'kaaaaaaaacck',
    'kkkkkkkkkkkk',
    'kyyyyyyyyyyk',
    'kkkkkkkkkkkk',
    '............',
  ]
  const badgeImg = (map, pal, off) =>
    PX.icon(
      map,
      off
        ? {
            k: '#b6c3d9',
            a: '#e3e8f0',
            b: '#eef2f8',
            c: '#cfd8e6',
            w: '#f4f7fb',
            r: '#e3e8f0',
            u: '#e3e8f0',
            y: '#e3e8f0',
            g: '#e3e8f0',
          }
        : { k: '#24304f', w: '#ffffff', ...pal },
      3,
    ).toDataURL()
  function trainerRender(p) {
    const S = A.SAVE,
      m = me()
    const champ = S.id === 'league'
    const shown = ST.lookOpen
    p.innerHTML = `
      <div class="pg-head"><button type="button" class="pg-back" data-home aria-label="Back to Home"></button><h2>Trainer card</h2></div>
      <div class="tc-card">
        <div class="tc-top"><span>TRAINER CARD</span><span>ID No. ${String(27315 + S.id.length * 7).padStart(5, '0')}</span></div>
        <div class="tc-main">${lookOf(m.look, 'big')}
          <div class="tc-info">
            ${ST.naming ? `<form class="tc-nameform" data-nameform><label class="sr" for="tc-name">Your name</label><input id="tc-name" maxlength="12" value="${esc(S.trainer)}" autocomplete="off" spellcheck="false" /><button type="submit" class="pg-hint">Save</button></form>` : `<p class="tc-name"><b>${esc(S.trainer)}</b><button type="button" class="pg-hint" data-rename aria-label="Change your name">Change</button></p>`}
            <dl class="tc-stats">
              <dt>Money</dt><dd>${A.money(S.gold)}</dd>
              <dt>Pokédex</dt><dd>${m.dex}/151</dd>
              <dt>Best level</dt><dd>Lv.${m.lv}</dd>
              <dt>Areas</dt><dd>${m.areas}/${AREAS()}</dd>
              <dt>Shinies</dt><dd>${m.shiny}</dd>
              <dt>Versus</dt><dd>${S.versus ? `${m.atk} won · ${m.def} held` : 'Locked'}</dd>
            </dl>
          </div>
        </div>
        <div class="tc-team">${A.TEAM.map((t) => `<span>${dexIco(t.dex)}<small>Lv.${t.lv}</small></span>`).join('')}</div>
      </div>
      <div class="pg-sec-h"><h3>Badge case</h3><span class="pg-count">${S.badges}/8</span></div>
      <ul class="tc-badges">${BADGES.map(([n, map, pal], i) => {
        const got = i < S.badges
        return `<li class="${got ? '' : 'off'}"><img class="px" alt="" src="${badgeImg(map, pal, !got)}" /><span>${n}</span><span class="sr">${got ? 'earned' : 'not earned yet'}</span></li>`
      }).join('')}
        <li class="tc-crown${champ ? '' : ' off'}"><img class="px" alt="" src="${badgeImg(CROWN, { a: '#ffbe2e', b: '#ffe7a8', c: '#c88a1a', y: '#f2553f' }, !champ)}" /><span>Crown</span><span class="sr">${champ ? 'earned' : 'not earned yet'}</span></li></ul>
      <p class="pg-tip">The crown is for clearing the region’s last area.</p>
      <div class="pg-sec-h"><h3>Leaderboard &amp; Versus</h3></div>
      <div class="tc-look">${lookOf(m.look)}<p>How other trainers see you: ${esc(LOOK_NAME(m.look))}. Your character in battle doesn’t change.</p><button type="button" class="pg-hint" data-looks aria-expanded="${shown}">${shown ? 'Done' : 'Change'}</button></div>
      ${shown ? `<div class="tc-looks" role="radiogroup" aria-label="Choose your look">${A.LOOKS.map((k) => `<button type="button" role="radio" class="tc-lk" data-look="${k}" aria-checked="${k === m.look}" aria-label="${esc(LOOK_NAME(k))}">${lookOf(k)}</button>`).join('')}</div>` : ''}
      <ul class="tc-menu">
        <li><button type="button" data-goto="ranks"><img class="px" alt="" src="${A.icons.NAV.ranks}" /><span><b>Leaderboard</b><small>Max level, progression, Pokédex, shinies</small></span></button></li>
        <li><button type="button" data-soonrow="How to play"><span class="tc-mi">?</span><span><b>How to play</b><small>The rules, with the game’s numbers</small></span></button></li>
        <li><button type="button" data-soonrow="Settings"><span class="tc-mi">⚙</span><span><b>Settings</b><small>Sound, Multi EXP, reduced motion, language</small></span></button></li>
        <li><button type="button" data-soonrow="Cloud backup"><span class="tc-mi">☁</span><span><b>Cloud backup</b><small>Your save lives in this browser. Connect to play on any device.</small></span><em>Connect</em></button></li>
      </ul>`
  }

  // ------------------------------------------------------------------ wiring
  const page = (id) => $(`.hm-page[data-page="${id}"]`)
  const rerender = (id) => {
    const p = page(id)
    if (p && !p.hidden) RENDER[id](p)
  }
  const RENDER = { versus: versusRender, ranks: ranksRender, trainer: trainerRender }
  function reset() {
    const S = A.SAVE
    VSS.beaten = new Set(S.id === 'league' ? ['Rin', 'Theo', 'Ana', 'Kai'] : [])
    VSS.team = S.versus === 'set' ? A.TEAM.filter((m) => m.lv >= 50).map((m) => m.dex) : null
    A.VS.defense = S.id === 'league' ? 3 : 0
    A.VS.toBeat = opponents().filter((o) => !VSS.beaten.has(o.name)).length
    ST.pick = VSS.team
      ? [...VSS.team]
      : eligible()
          .map((m) => m.dex)
          .slice(0, 3)
    ST.vsTab = S.versus === 'new' ? 'team' : 'fight'
    ST.lookOpen = ST.naming = false
  }
  // A Versus win (battle.js): the team counts once on the board.
  A.onVersus = (name) => {
    VSS.beaten.add(name)
    A.VS.toBeat = opponents().filter((o) => !VSS.beaten.has(o.name)).length
  }
  function click(id, e) {
    const t = e.target
    let b
    if (t.closest('[data-home]')) return A.showPage('home')
    if ((b = t.closest('[data-board]'))) {
      ST.board = b.dataset.board
      rerender(id)
      return $(`[data-board="${ST.board}"]`).focus({ preventScroll: true })
    }
    if (t.closest('[data-findme]')) {
      const r = $('#so-me')
      if (!r) return
      r.scrollIntoView({ block: 'center', behavior: A.REDUCED ? 'auto' : 'smooth' })
      r.classList.remove('flash')
      void r.offsetWidth
      r.classList.add('flash')
      return
    }
    if (t.closest('[data-hall]')) return hallSheet()
    if ((b = t.closest('[data-vstab]'))) {
      ST.vsTab = b.dataset.vstab
      rerender(id)
      return $(`[data-vstab="${ST.vsTab}"][role="tab"]`).focus({ preventScroll: true })
    }
    if ((b = t.closest('[data-vsf]'))) {
      ST.vsF = b.dataset.vsf
      rerender(id)
      return $(`[data-vsf="${ST.vsF}"]`).focus({ preventScroll: true })
    }
    if ((b = t.closest('[data-vsboard]'))) {
      ST.vsBoard = b.dataset.vsboard
      rerender(id)
      return $(`[data-vsboard="${ST.vsBoard}"]`).focus({ preventScroll: true })
    }
    if ((b = t.closest('[data-fight]'))) {
      const o = opponents().find((x) => x.name === b.dataset.fight)
      return A.startVersus({
        name: o.name,
        look: o.look,
        team: o.vs,
        beaten: VSS.beaten.has(o.name),
        mine: VSS.team,
      })
    }
    if ((b = t.closest('[data-pickvs]'))) {
      const d = Number(b.dataset.pickvs),
        at = ST.pick.indexOf(d)
      if (at >= 0) ST.pick.splice(at, 1)
      else if (ST.pick.length < 3) ST.pick.push(d)
      else return A.toast('Three at most: tap one to take it out first')
      rerender(id)
      return $(`[data-pickvs="${d}"]`).focus({ preventScroll: true })
    }
    if (t.closest('[data-vsclear]')) {
      ST.pick = []
      return rerender(id)
    }
    if (t.closest('[data-vssave]')) {
      VSS.team = [...ST.pick]
      A.SAVE.versus = 'set'
      ST.vsTab = 'fight'
      A.renderWidgets()
      rerender(id)
      return A.toast('Team saved! It fights for you in attack and in defense')
    }
    if (t.closest('[data-rename]')) {
      ST.naming = true
      rerender(id)
      return $('#tc-name').select()
    }
    if (t.closest('[data-looks]')) {
      ST.lookOpen = !ST.lookOpen
      rerender(id)
      return $('[data-looks]').focus({ preventScroll: true })
    }
    if ((b = t.closest('[data-look]'))) {
      A.SAVE.look = b.dataset.look
      rerender(id)
      A.renderTop()
      return $(`[data-look="${A.SAVE.look}"]`).focus({ preventScroll: true })
    }
    if ((b = t.closest('[data-goto]'))) return A.showPage(b.dataset.goto)
    if ((b = t.closest('[data-soonrow]'))) return A.toast(`${b.dataset.soonrow}: next in the UX pass`)
  }
  for (const id of Object.keys(RENDER))
    HOME.page(id, {
      render(p) {
        if (!p.dataset.bound) {
          p.dataset.bound = '1'
          p.addEventListener('click', (e) => click(id, e))
          p.addEventListener('input', (e) => {
            if (e.target.id !== 'so-q') return
            ST.vsQ = e.target.value
            const pos = e.target.selectionStart
            rerender(id)
            const q = $('#so-q')
            q.focus()
            q.setSelectionRange(pos, pos)
          })
          p.addEventListener('submit', (e) => {
            e.preventDefault()
            const v = $('#tc-name').value.trim()
            if (v) A.SAVE.trainer = v
            ST.naming = false
            A.renderTop()
            rerender(id)
            $('[data-rename]').focus({ preventScroll: true })
          })
        }
        RENDER[id](p)
      },
      reset: id === 'versus' ? reset : null,
      dot: null,
    })
})()
