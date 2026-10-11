/*
 * Pokédice Visual Lab: Trades (docs/23-TRADING-PLAN.md). Players trade Pokémon through listings, like the games' GTS:
 * you put up one of your Pokémon, say what you want for it, and anyone allowed to see the listing takes it while you're
 * away. The Trades page (trainer menu → Trades): the board and your listings; a listing's sheet; taking one (the
 * picker, the confirm, the trade scene, a trade evolution); New listing (your Pokémon, what you want, who sees it);
 * sharing a link; a friend's card; the pop-up when one of yours was taken. A preview bar plays the moments; the admin
 * mock beside the phone edits the same numbers (TR.cfg).
 * The rules section mirrors the engine functions of the plan's §6 (src/engine/trade.ts), on the lab's data:
 * assets/game.json for evolutions, assets/kanto.json for the wild pools. The screens only show their results.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco, plural } = A
  const SND = () => PX.Sound
  const HOUR = 3600e3
  const DAY = 24 * HOUR
  const pad3 = (d) => String(d).padStart(3, '0')
  // The lab's data stops at #251: the names the trade-evolution list needs past it.
  const LATER = {
    525: 'Boldore',
    526: 'Gigalith',
    533: 'Gurdurr',
    534: 'Conkeldurr',
    588: 'Karrablast',
    589: 'Escavalier',
    616: 'Shelmet',
    617: 'Accelgor',
    708: 'Phantump',
    709: 'Trevenant',
    710: 'Pumpkaboo',
    711: 'Gourgeist',
  }
  const nameOf = (d) => A.K.names[d] || LATER[d] || `#${d}`
  const REGION_NAME = { kanto: 'Kanto', johto: 'Johto' }

  // ------------------------------------------------------------------ the admin's numbers (game_config `trade`)
  const TR = {
    cfg: {
      access: 'all', // off · admin · all
      maxListings: 4,
      listingDays: 3,
      tradesPerDay: 5,
      levelCap: 50,
      minBadges: 1,
      evolveOnTrade: [
        [64, 65],
        [67, 68],
        [75, 76],
        [93, 94],
        [525, 526],
        [533, 534],
        [588, 589],
        [616, 617],
        [708, 709],
        [710, 711],
      ],
    },
    asAdmin: true,
    signed: true,
    johto: true, // Johto started too (the preview bar)
    used: 1, // trades taken today (UTC)
    tab: 'board',
    q: '',
    chip: 'all',
    sort: 'tradable',
    dot: false, // a trade of yours went through and you haven't looked yet
    rulesSeen: false,
    board: [],
    mine: [],
    done: [],
    teamOut: new Set(), // team members waiting on the board (the lab's Home keeps its three)
    jBox: [], // the Johto Box, once Johto is started
    jDex: new Set(),
    draft: null,
    take: null,
  }
  const C = () => TR.cfg

  // ------------------------------------------------------------------ the rules (the plan's §6, src/engine/trade.ts)
  const LEGENDS = new Set([144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251])
  const MYTHICAL = new Set([151, 251])
  /** The region of a species' generation: where a traded Pokémon lands (homeRegionOf). */
  const homeRegionOf = (d) => (d <= 151 ? 'kanto' : 'johto')
  // Johto's evolutions aren't in the lab's data: the few the mock shows, as the engine would find them.
  const J_MIN = {
    153: [152, 16],
    154: [153, 32],
    156: [155, 14],
    157: [156, 36],
    159: [158, 18],
    160: [159, 30],
    162: [161, 15],
    164: [163, 20],
    176: [175, 'item'],
  }
  /** Who evolves into `d`, and how: [from, level] or [from, 'item']. */
  function preEvo(d) {
    if (d > 151) return J_MIN[d] || null
    for (const [from, s] of Object.entries(A.G.mons)) {
      const e = s.evo.find((x) => x[0] === d)
      if (e) return [Number(from), e[1] != null ? e[1] : 'item']
    }
    return null
  }
  /** The lowest level a species is found wild in a fixed-level area, and where. */
  function wildMin(d) {
    let best = null
    for (const a of A.K.areas)
      for (const w of a.wild || [])
        if (w.d === d && (!best || w.lv[0] < best.lv)) best = { lv: w.lv[0], area: a.name }
    return best
  }
  /**
   * The lowest level the game ever gives a species (speciesMinLevel), with the reason in words: its evolution level,
   * lower if it's found wild lower in a fixed-level area; an item evolution takes its pre-evolution's; none: Lv.1.
   */
  function speciesMin(d, seen = new Set()) {
    if (seen.has(d)) return { lv: 1, why: '' }
    seen.add(d)
    const pre = preEvo(d)
    let m
    if (!pre) m = { lv: 1, why: 'no pre-evolution' }
    else if (pre[1] === 'item') {
      const p = speciesMin(pre[0], seen)
      m = { lv: p.lv, why: `${nameOf(pre[0])}’s minimum (it evolves by an item)` }
    } else m = { lv: pre[1], why: `${nameOf(pre[0])} evolves at ${pre[1]}` }
    const w = d <= 151 ? wildMin(d) : null
    if (w && w.lv < m.lv) m = { lv: w.lv, why: `found at Lv.${w.lv} in ${w.area}` }
    return m
  }
  /** arrivalLevel: the level of the Pokémon given, at most the cap, raised to the species' minimum. */
  function arrival(d, given) {
    const min = speciesMin(d)
    const capped = Math.min(given, C().levelCap)
    return { lv: Math.max(capped, min.lv), raised: min.lv > capped, capped: given > C().levelCap, min }
  }
  const evolvesOnTrade = (d) => (C().evolveOnTrade.find(([a]) => a === d) || [])[1] || null

  // ------------------------------------------------------------------ the save, as the trade sees it
  const started = () => (TR.johto ? ['kanto', 'johto'] : ['kanto'])
  /** Every Pokémon you own, every region's Box and team, with the Day Care and a reviving fossil (they can't go). */
  function myMons() {
    const out = A.owned()
      .filter((m) => !(m.where === 'team' && TR.teamOut.has(`team${m.i}`)))
      .map((m) => ({
        uid: m.uid || `team${m.i}`,
        dex: m.dex,
        lv: m.lv,
        shiny: !!m.shiny,
        where: m.where,
        region: 'kanto',
      }))
    for (const d of A.SAVE.dayCare.own.filter(Boolean))
      out.push({ uid: `dc${d.dex}`, dex: d.dex, lv: d.lv, where: 'daycare', region: 'kanto' })
    out.push({ uid: 'fossil', dex: 142, lv: 30, where: 'fossil', region: 'kanto' })
    if (TR.johto) for (const m of TR.jBox) out.push({ ...m, region: 'johto' })
    return out
  }
  const pokedex = (d) => (d <= 151 ? A.caught.has(d) : TR.jDex.has(d))
  /** Your plain copy of a species in the Box it would land in (the one-copy rule), or null. */
  function copyOf(d) {
    const mine = myMons().filter((m) => m.dex === d && !m.shiny && m.where !== 'fossil')
    return mine.sort((a, b) => b.lv - a.lv)[0] || null
  }
  const owns = (d) => myMons().some((m) => m.dex === d && m.where !== 'fossil')
  /** listable: null, or why this one can't go on the board. */
  function listable(m) {
    if (LEGENDS.has(m.dex)) return MYTHICAL.has(m.dex) ? 'Mythical' : 'Legendary'
    if (m.where === 'daycare') return 'At the Day Care'
    if (m.where === 'fossil') return 'Reviving: 3 h'
    if (m.region === 'johto' && TR.jBox.length <= 1) return 'Last in Johto'
    return null
  }
  /** wantable: every species of the regions you've started, legendaries and mythicals out. */
  function wantable() {
    const top = TR.johto ? 251 : 151
    return Array.from({ length: top }, (_, i) => i + 1).filter((d) => !LEGENDS.has(d))
  }
  /** What a listing's poster owns (made up: most of Kanto, less of Johto). */
  function hasFor(owner, d) {
    const P = PEOPLE[owner]
    if (!P) return false
    const h = (d * 2654435761 + owner.length * 97 + owner.charCodeAt(0) * 31) % 100
    return h < (d <= 151 ? P.pct : P.pct / 3)
  }
  /** wantMatches: does this Pokémon of yours answer the listing's want? */
  function wantMatches(want, m, owner) {
    if (want.kind === 'species') return m.dex === want.dex
    if (want.kind === 'notOwned') return m.shiny || !hasFor(owner, m.dex)
    return true
  }
  /** receiveTrade's outcome for you: new · back (in your Pokédex, not your Box) · replaced · merged · shiny. */
  function outcomeFor(d, lv, shiny) {
    const evo = evolvesOnTrade(d)
    const final = evo || d
    if (shiny) return { kind: 'shiny', final, evo }
    const mine = copyOf(final)
    if (!mine) return { kind: pokedex(final) ? 'back' : 'new', final, evo }
    return mine.lv < lv ? { kind: 'replaced', final, evo, mine } : { kind: 'merged', final, evo, mine }
  }

  // ------------------------------------------------------------------ other trainers (made up for the preview)
  const PEOPLE = {
    Lea: {
      look: 'cooltrainer-f',
      friend: true,
      pct: 90,
      since: 'Sep 28, 2026',
      lv: 74,
      dex: 139,
      ago: '6 min ago',
    },
    Kai: { look: 'hiker', friend: true, pct: 70, since: 'Oct 2, 2026', lv: 61, dex: 117, ago: '2 h ago' },
    Sora: {
      look: 'swimmer-f',
      friend: true,
      pct: 95,
      since: 'Sep 30, 2026',
      lv: 100,
      dex: 146,
      ago: '20 min ago',
    },
    Noor: {
      look: 'psychic-m',
      friend: true,
      pct: 75,
      since: 'Oct 5, 2026',
      lv: 68,
      dex: 128,
      ago: '1 d ago',
    },
    Mio: { look: 'beauty', pct: 96 },
    Ivy: { look: 'channeler', pct: 70 },
    Ana: { look: 'ranger-f', pct: 60 },
    Theo: { look: 'youngster', pct: 55 },
    Rin: { look: 'black-belt', pct: 50 },
    Jo: { look: 'picnicker', pct: 45 },
    Ezra: { look: 'scientist', pct: 40 },
    Misty: { look: 'lass', pct: 50 },
  }
  const friend = (n) => !!(PEOPLE[n] && PEOPLE[n].friend)
  let seq = 0
  const code = () => {
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''
    let x = (++seq * 7919 + 104729) >>> 0
    for (let i = 0; i < 8; i++) {
      s += ABC[x % ABC.length]
      x = Math.floor(x / ABC.length) + (i + 3) * 977
    }
    return s
  }
  // Their open listings: [owner, dex, level, shiny, want, visibility, hours left, hours since posted].
  const BOARD = [
    ['Sora', 158, 18, false, { kind: 'species', dex: 25 }, 'friends', 30, 42],
    ['Lea', 64, 30, false, { kind: 'notOwned' }, 'public', 52, 20],
    ['Noor', 133, 22, true, { kind: 'species', dex: 93 }, 'friends', 12, 60],
    ['Mio', 131, 25, false, { kind: 'species', dex: 123 }, 'public', 64, 8],
    ['Ivy', 92, 20, false, { kind: 'any' }, 'public', 5, 67],
    ['Ana', 37, 14, false, { kind: 'species', dex: 16 }, 'public', 40, 32],
    ['Theo', 129, 8, false, { kind: 'any' }, 'public', 70, 2],
    ['Rin', 67, 28, false, { kind: 'species', dex: 74 }, 'public', 20, 52],
    ['Jo', 35, 14, false, { kind: 'notOwned' }, 'public', 33, 39],
    ['Kai', 95, 20, false, { kind: 'species', dex: 63 }, 'public', 45, 27],
    ['Ezra', 137, 25, false, { kind: 'species', dex: 149 }, 'public', 66, 6],
    ['Mio', 155, 10, false, { kind: 'species', dex: 7 }, 'public', 58, 14],
    // A private one: only its link finds it.
    ['Sora', 147, 12, false, { kind: 'any' }, 'private', 61, 11],
  ]
  function buildBoard() {
    const now = Date.now()
    TR.board = BOARD.map(([owner, dex, lv, shiny, want, vis, left, since], i) => ({
      id: `L${i + 1}`,
      code: i === 0 ? 'K7QM4XD9' : code(),
      owner,
      mon: { dex, lv, shiny },
      want,
      vis,
      ends: now + left * HOUR,
      at: now - since * HOUR,
    }))
  }

  // ------------------------------------------------------------------ small parts
  function dur(ms) {
    const m = Math.max(1, Math.ceil(ms / 60000))
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
    return h % 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h / 24}d`
  }
  const left = (L) => Math.max(0, L.ends - Date.now())
  const gauge = (L) => {
    const f = left(L) / (C().listingDays * DAY)
    return `<span class="lv-gauge${left(L) < 6 * HOUR ? ' hot' : ''}" aria-hidden="true"><i style="width:${Math.min(100, f * 100).toFixed(1)}%"></i></span>`
  }
  const lookOf = (n, cls) => A.lookOf((PEOPLE[n] || {}).look || 'red', cls)
  const shinyStar = (s) => (s ? '<em class="tr-star" title="Shiny" aria-label="shiny">★</em>' : '')
  const VIS = {
    public: ['Public', 'On the trade board for every signed-in player, and by its link.'],
    friends: ['Friends', 'Only your friends see it on the board and can take it.'],
    private: ['Private', 'Only people with its link. The share sheet opens when you post.'],
  }
  const visChip = (v) => `<span class="tr-vis ${v}">${v === 'private' ? 'Private (link)' : VIS[v][0]}</span>`
  /** The want, as a tile: the species' icon and name, or a NEW / ANY tile. */
  function wantTile(want, owner, big) {
    if (want.kind === 'species')
      return `<span class="tr-want${big ? ' big' : ''}">${dexIco(want.dex)}<b>${esc(nameOf(want.dex))}</b></span>`
    if (want.kind === 'notOwned')
      return `<span class="tr-want${big ? ' big' : ''}"><span class="tr-anytile new" aria-hidden="true">NEW</span><b>${owner ? `Any ${esc(owner)} lacks` : 'Any I don’t own'}</b></span>`
    return `<span class="tr-want${big ? ' big' : ''}"><span class="tr-anytile" aria-hidden="true">ANY</span><b>Anything</b></span>`
  }
  const wantWords = (want, owner) =>
    want.kind === 'species'
      ? nameOf(want.dex)
      : want.kind === 'notOwned'
        ? `one ${owner || 'they'} lack${owner ? 's' : ''}`
        : 'anything'
  /** An animated sprite where the lab has one (its shiny when shiny), the menu icon at 2× otherwise. */
  function bigMon(d, shiny, w = 112, h = 104) {
    const base = A.spriteKey(d)
    const key = base && shiny && PX.SPR.meta[`${base}-shiny`] ? `${base}-shiny` : base
    return key
      ? `<canvas class="pg-spr" width="${w}" height="${h}" data-key="${key}" data-ph="${(d * 137) % 1000}" aria-hidden="true"></canvas>`
      : `<span class="pg-spr-ico">${dexIco(d, 'x2')}</span>`
  }
  const regionTag = (d) =>
    homeRegionOf(d) !== 'kanto' ? `<span class="tr-reg">${REGION_NAME[homeRegionOf(d)]}</span>` : ''

  // ------------------------------------------------------------------ can I take this listing?
  /** null, or the first thing in the way, in words (the board greys the row with it). */
  function blocker(L) {
    if (!TR.signed) return 'Sign in to trade'
    if (L.owner === 'me') return 'Yours'
    if (L.vis === 'friends' && !friend(L.owner)) return `Only ${L.owner}’s friends can take it`
    if (!started().includes(homeRegionOf(L.mon.dex)))
      return `Start ${REGION_NAME[homeRegionOf(L.mon.dex)]} first`
    if (TR.used >= C().tradesPerDay) return 'No trades left today'
    if (!candidates(L).some((c) => !c.why))
      return L.want.kind === 'species'
        ? `You have no ${nameOf(L.want.dex)}`
        : L.want.kind === 'notOwned'
          ? `${L.owner} has all of yours`
          : 'Nothing you can trade'
    return null
  }
  /** Your Pokémon that answer the want; the ones that can't go carry why. */
  function candidates(L) {
    return myMons()
      .filter((m) => wantMatches(L.want, m, L.owner))
      .map((m) => {
        const why = listable(m)
        return { ...m, why: why === 'Mythical' || why === 'Legendary' ? `${why}s can’t be traded` : why }
      })
      .sort((a, b) => !!a.why - !!b.why || b.lv - a.lv)
  }
  const isNewFor = (L) => !pokedex(L.mon.dex)

  // ------------------------------------------------------------------ the Trades page
  function render(p) {
    const S = A.SAVE
    const head = `<div class="pg-head"><button type="button" class="pg-back" data-tr-back aria-label="Back to the trainer card"></button><img class="px pg-h-ico" alt="" src="${ICON}" /><h2>Trades</h2>${TR.signed ? `<span class="pg-count">${Math.max(0, C().tradesPerDay - TR.used)}/${C().tradesPerDay} today</span>` : ''}</div>`
    if (!visible()) {
      p.innerHTML = `${head}<p class="pg-note">Trades are switched off.</p>`
      return
    }
    if (!TR.signed) {
      p.innerHTML = `${head}
        <div class="tr-connect"><span class="tr-connect-pic" aria-hidden="true">${dexIco(25)}<img class="px" alt="" src="${ICON}" />${dexIco(158)}</span>
          <b>Trade Pokémon with other trainers</b><p>Put one of yours up, say what you want for it, and anyone can take it while you’re away. Trading needs an account: Google or Discord.</p>
          <button type="button" class="ui-btn primary wide" data-tr-connect><span>Connect</span></button></div>
        ${boardHTML(true)}`
      return
    }
    if (S.badges < C().minBadges) {
      p.innerHTML = `${head}<div class="so-locked"><img class="px" alt="" src="${A.icons.LOCK3}" /><b>Trades open with your first badge.</b><small>${S.badges}/${C().minBadges} badges</small></div>
        <p class="pg-note">So a new trainer can’t trade away their partner on day one.</p>`
      return
    }
    const mineN = TR.mine.length
    p.innerHTML = `${head}
      <div class="hm-seg pg-tabs" role="tablist" aria-label="Trades">
        <button type="button" role="tab" data-tr-tab="board" aria-selected="${TR.tab === 'board'}">Board <i>${boardList().length}</i></button>
        <button type="button" role="tab" data-tr-tab="mine" aria-selected="${TR.tab === 'mine'}">Mine <i>${mineN}/${C().maxListings}</i>${TR.dot ? '<span class="tr-dot" aria-label="a trade went through"></span>' : ''}</button>
      </div>
      ${TR.tab === 'board' ? boardHTML() : mineHTML()}
      <button type="button" class="tr-info" data-tr-info>INFO</button>`
  }
  const visible = () => C().access === 'all' || (C().access === 'admin' && TR.asAdmin)
  /** Public and friends' open listings (never a private one), yours included. */
  function boardList() {
    const mine = TR.mine.filter((L) => L.vis !== 'private').map((L) => ({ ...L, owner: 'me' }))
    return [
      ...TR.board.filter((L) => L.vis === 'public' || (L.vis === 'friends' && friend(L.owner))),
      ...mine,
    ]
  }
  function boardHTML(guest) {
    const all = boardList().filter((L) => !guest || L.vis === 'public')
    const q = A.fold(TR.q.trim())
    const tagged = all.map((L) => ({ L, why: blocker(L), fr: friend(L.owner), fresh: isNewFor(L) }))
    const counts = {
      all: tagged.length,
      friends: tagged.filter((x) => x.fr).length,
      new: tagged.filter((x) => x.fresh).length,
      can: tagged.filter((x) => !x.why).length,
    }
    let list = tagged.filter((x) =>
      TR.chip === 'friends' ? x.fr : TR.chip === 'new' ? x.fresh : TR.chip === 'can' ? !x.why : true,
    )
    if (q)
      list = list.filter(
        ({ L }) =>
          A.fold(L.owner === 'me' ? A.SAVE.trainer : L.owner).includes(q) ||
          A.fold(nameOf(L.mon.dex)).includes(q) ||
          (L.want.kind === 'species' && A.fold(nameOf(L.want.dex)).includes(q)),
      )
    const soon = (a, b) => a.L.ends - b.L.ends
    if (TR.sort === 'soon') list.sort(soon)
    else if (TR.sort === 'newest') list.sort((a, b) => b.L.at - a.L.at)
    // Tradable first (friends first, then ending soonest); your own at the end.
    else
      list.sort(
        (a, b) =>
          (a.L.owner === 'me') - (b.L.owner === 'me') || !!a.why - !!b.why || b.fr - a.fr || soon(a, b),
      )
    if (guest)
      return `<div class="pg-sec-h"><h3>On the board now</h3><span class="pg-count">${all.length}</span></div><ul class="tr-board">${list
        .slice(0, 4)
        .map((x) => rowHTML(x, true))
        .join('')}</ul>`
    return `
      <div class="pg-tools"><label class="sr" for="tr-q">Search a Pokémon or a trainer</label><input id="tr-q" type="search" placeholder="Search a Pokémon or a trainer" autocomplete="off" spellcheck="false" value="${esc(TR.q)}" /></div>
      <div class="hm-chips" role="radiogroup" aria-label="Show">${[
        ['all', 'All'],
        ['friends', 'Friends'],
        ['new', 'New for me'],
        ['can', 'I can trade'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="radio" data-tr-chip="${k}" aria-checked="${TR.chip === k}">${l} <i>${counts[k]}</i></button>`,
        )
        .join('')}</div>
      <div class="hm-sort tr-sort" role="radiogroup" aria-label="Sort by"><span aria-hidden="true">Sort</span>${[
        ['tradable', 'Tradable first'],
        ['soon', 'Ending soon'],
        ['newest', 'Newest'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="radio" data-tr-sort="${k}" aria-checked="${TR.sort === k}">${l}</button>`,
        )
        .join('')}</div>
      <ul class="tr-board">${list.map((x) => rowHTML(x)).join('') || `<li class="hm-empty">${q ? 'No listing matches. Try a Pokémon or a trainer.' : TR.chip === 'can' ? 'Nothing you can take right now. New listings show up here.' : 'Nothing here yet.'}</li>`}</ul>`
  }
  function rowHTML({ L, why, fr, fresh }, guest) {
    const me = L.owner === 'me'
    const who = me ? A.SAVE.trainer : L.owner
    const ok = !why
    const label = `${nameOf(L.mon.dex)}${L.mon.shiny ? ', shiny' : ''}${fresh ? ', new for you' : ''}, from ${me ? 'you' : who}, for ${wantWords(L.want, who)}. ${dur(left(L))} left. ${ok ? 'You can trade' : why}`
    return `<li><button type="button" class="tr-row${fr ? ' fr' : ''}${me ? ' me' : ''}${ok || me ? '' : ' off'}" data-tr-open="${L.id}" aria-label="${esc(label)}">
      <span class="tr-row-mon">${dexIco(L.mon.dex)}<span class="tr-row-t"><b>${esc(nameOf(L.mon.dex))}${shinyStar(L.mon.shiny)}${fresh ? '<em class="tr-new">NEW</em>' : ''}</b>
        <small>${homeRegionOf(L.mon.dex) !== 'kanto' ? `<em class="tr-regsm first">${REGION_NAME[homeRegionOf(L.mon.dex)]}</em> ` : ''}${me ? '<em class="tr-you">YOURS</em>' : `${esc(who)}${fr ? ' <em class="tr-fr">FRIEND</em>' : ''}`} · ${dur(left(L))}</small></span></span>
      <span class="tr-for" aria-hidden="true">for</span>
      ${wantTile(L.want, me ? null : who)}
      ${guest || me ? '' : `<span class="tr-row-why${ok ? ' ok' : ''}">${ok ? 'You can trade' : esc(why)}</span>`}</button></li>`
  }
  function mineHTML() {
    const slots = []
    for (let i = 0; i < C().maxListings; i++) {
      const L = TR.mine[i]
      if (!L) {
        slots.push(
          `<li><button type="button" class="tr-slot empty" data-tr-new><span class="tr-plus" aria-hidden="true">+</span><b>New listing</b></button></li>`,
        )
        continue
      }
      slots.push(`<li class="tr-slot">
        <span class="tr-slot-top">${dexIco(L.mon.dex)}<span class="tr-row-t"><b>${esc(nameOf(L.mon.dex))}${shinyStar(L.mon.shiny)} <span class="hm-lv">Lv.${L.mon.lv}</span></b><small>Waits here: no XP, no evolving</small></span>${visChip(L.vis)}</span>
        <span class="tr-slot-want"><span class="tr-for">for</span>${wantTile(L.want)}</span>
        <span class="tr-slot-time"><span>Ends in ${dur(left(L))}</span>${gauge(L)}</span>
        <span class="tr-slot-btns"><button type="button" class="ui-btn" data-tr-share="${L.id}"><span>Share</span></button><button type="button" class="ui-btn" data-tr-cancel="${L.id}"><span>Cancel</span></button></span></li>`)
    }
    const done = TR.done
      .map(
        (
          t,
        ) => `<li class="tr-done"><span class="tr-done-pair">${dexIco(t.gave.dex)}<span class="tr-done-arrow" aria-hidden="true">→</span>${dexIco(t.got.dex)}</span>
          <span class="tr-row-t"><b>${t.dir === 'took' ? `You took ${esc(t.other)}’s ${esc(nameOf(t.listed))}` : `${esc(t.other)} took your ${esc(nameOf(t.gave.dex))}`}</b>
          <small>Gave ${esc(nameOf(t.gave.dex))} Lv.${t.gave.lv} · got ${esc(nameOf(t.got.dex))} Lv.${t.got.lv}${t.note ? ` · ${esc(t.note)}` : ''} · ${esc(t.ago)}</small></span>${t.fresh ? '<em class="tr-new">NEW</em>' : ''}</li>`,
      )
      .join('')
    return `<p class="pg-note">Your Pokémon waits on the board, frozen, until someone takes it or you cancel. It comes back by itself after ${plural(C().listingDays, 'day')}.</p>
      <ul class="tr-slots">${slots.join('')}</ul>
      <div class="pg-sec-h"><h3>Done</h3><span class="pg-count">${TR.done.length}</span></div>
      <ul class="tr-dones">${done || '<li class="hm-empty">Your trades show up here, both ways.</li>'}</ul>`
  }

  // ------------------------------------------------------------------ a listing (its sheet)
  function sheet(title, sub, body, foot = '') {
    $('#hm-s2-title').textContent = title
    $('#hm-s2-sub').textContent = sub
    $('#hm-s2-body').innerHTML = body
    $('#hm-s2-foot').innerHTML = foot
    $('#hm-s2-foot').hidden = !foot
    const el = $('#hm-sheet2')
    el.classList.add('tr-sheet')
    if (el.hidden) A.openDialog(el)
    else $('.hm-x', el).focus({ preventScroll: true })
    $('#hm-s2-body').scrollTop = 0
  }
  const findListing = (id) => TR.board.find((L) => L.id === id) || TR.mine.find((L) => L.id === id)
  function openListing(id, via) {
    const L0 = findListing(id)
    if (!L0) return A.toast('This listing is gone: someone took it, or it ended')
    const mine = TR.mine.includes(L0)
    const L = mine ? { ...L0, owner: 'me' } : L0
    const who = mine ? A.SAVE.trainer : L.owner
    const d = L.mon.dex
    const min = speciesMin(d)
    const evo = evolvesOnTrade(d)
    const why = mine ? null : blocker(L)
    const fresh = !mine && isNewFor(L)
    const body = `
      <div class="tr-hero">${bigMon(d, L.mon.shiny)}${L.mon.shiny ? `<span class="lv-fx-spk big" aria-hidden="true">${'<i></i>'.repeat(5)}</span>` : ''}
        <div class="pg-hero-t"><span class="pg-types">${A.typeBadges(d)}</span>
          <span class="tr-owner">${mine ? A.lookOf(A.SAVE.look || 'red', 'sm') : lookOf(L.owner, 'sm')}<b>${mine ? 'Yours' : `${esc(who)}’s`}</b>${!mine && friend(who) ? `<button type="button" class="pg-hint" data-tr-card="${esc(who)}">Their card</button>` : ''}</span>
          <span class="tr-tags">${visChip(L.vis)}${fresh ? '<em class="tr-new">NEW for you</em>' : ''}${regionTag(d)}</span></div></div>
      <div class="tr-wants"><span class="tr-wants-h">${mine ? 'You want' : 'They want'}</span>${wantTile(L.want, mine ? null : who, true)}
        ${!mine && L.want.kind === 'species' ? `<small>${owns(L.want.dex) ? `You have ${plural(myMons().filter((m) => m.dex === L.want.dex).length, nameOf(L.want.dex), nameOf(L.want.dex))}` : `You have no ${esc(nameOf(L.want.dex))}`}</small>` : ''}
        ${!mine && L.want.kind === 'notOwned' ? `<small>One ${esc(who)} doesn’t have in their Box, or a shiny</small>` : ''}</div>
      <div class="tr-time"><span>Ends in <b>${dur(left(L))}</b></span>${gauge(L)}</div>
      <ul class="tr-facts">
        <li><b>${mine ? 'You get theirs at the level of this one' : 'You get it at the level of the Pokémon you give'}</b><small>Lv.${min.lv} at least (${esc(min.why)}), Lv.${C().levelCap} at most. Listed at Lv.${L.mon.lv}.</small></li>
        ${evo ? `<li><b>It evolves the moment it arrives</b><small>${esc(nameOf(d))} becomes ${esc(nameOf(evo))}, at the level it arrives at.</small></li>` : ''}
        <li><b>Lands in your ${REGION_NAME[homeRegionOf(d)]} Box</b><small>${homeRegionOf(d) === 'kanto' ? 'Its home region.' : `Its home region, wherever it came from.`} ${L.mon.shiny ? 'A shiny is always kept as its own Pokémon.' : 'If you have one, the stronger stays.'}</small></li>
      </ul>`
    let foot
    if (mine)
      foot = `<div class="pg-foot2"><button type="button" class="ui-btn" data-tr-cancel="${L.id}"><span>Cancel</span></button><button type="button" class="ui-btn primary" data-tr-share="${L.id}"><span>Share</span></button></div>`
    else if (!TR.signed)
      foot = `<p class="tr-why">${esc(who)} wants to trade. Connect to take part.</p><button type="button" class="ui-btn primary wide" data-tr-connect><span>Connect</span></button>`
    else if (L.vis === 'friends' && !friend(who))
      foot = `<p class="tr-why">Only ${esc(who)}’s friends can take it.</p><button type="button" class="ui-btn primary wide" data-tr-addfriend="${esc(who)}"><span>Add ${esc(who)}</span></button>`
    else if (why)
      foot = `<button type="button" class="ui-btn primary wide" aria-disabled="true" data-tr-why="${esc(why)}"><span>${esc(why)}</span></button>`
    else
      foot = `<button type="button" class="ui-btn primary wide" data-tr-take="${L.id}"><span>Trade</span></button>`
    sheet(
      `${nameOf(d)}${L.mon.shiny ? ' ★' : ''}`,
      `#${pad3(d)} · ${mine ? 'Your listing' : `${who}’s listing`}${via ? ' · from a link' : ''}`,
      body,
      foot,
    )
  }

  // ------------------------------------------------------------------ taking it: the picker, the confirm
  function picker(id) {
    const L = findListing(id)
    const list = candidates(L)
    TR.take = { id }
    const rows = list
      .map((m) => {
        const a = arrival(L.mon.dex, m.lv)
        const o = outcomeFor(L.mon.dex, a.lv, L.mon.shiny)
        const tags = [
          o.kind === 'new' ? '<em class="tr-new">NEW</em>' : '',
          o.kind === 'replaced' ? '<em class="tr-strong">STRONGER</em>' : '',
          o.kind === 'shiny' ? '<em class="tr-strong">✦ SHINY</em>' : '',
          o.evo ? `<em class="tr-evo">→ ${esc(nameOf(o.evo))}</em>` : '',
        ].join('')
        const line = m.why
          ? esc(m.why)
          : `You get ${esc(nameOf(L.mon.dex))} Lv.${a.lv}${a.raised ? ' (its minimum)' : a.capped ? ' (the cap)' : ''}${o.kind === 'merged' ? ` · You have Lv.${o.mine.lv}: nothing gained` : ''}`
        return `<li><button type="button" class="pg-useit tr-pick${o.kind === 'merged' && !m.why ? ' meh' : ''}" data-tr-give="${esc(m.uid)}"${m.why ? ' disabled' : ''}>${dexIco(m.dex)}<span><b>${esc(nameOf(m.dex))}${shinyStar(m.shiny)} <span class="hm-lv">Lv.${m.lv}</span>${m.where === 'team' ? ' <em class="tr-team">TEAM</em>' : ''}${TR.johto ? ` <em class="tr-regsm">${REGION_NAME[m.region]}</em>` : ''}</b><small>${line}</small></span>${m.why ? '' : tags}</button></li>`
      })
      .join('')
    sheet(
      `Trade for ${nameOf(L.mon.dex)}`,
      `What do you give? · ${plural(list.filter((m) => !m.why).length, 'match', 'matches')}`,
      `<p class="pg-note">${L.want.kind === 'species' ? `${esc(L.owner)} wants ${esc(nameOf(L.want.dex))}.` : L.want.kind === 'notOwned' ? `${esc(L.owner)} wants one they don’t own.` : `${esc(L.owner)} takes anything.`} ${esc(nameOf(L.mon.dex))} arrives at the level of the one you give.</p>
        <ul class="pg-uselist tr-picks">${rows}</ul>`,
      `<div class="pg-foot2"><button type="button" class="ui-btn" data-tr-open="${id}"><span>Back</span></button></div>`,
    )
  }
  function confirm(uid) {
    const L = findListing(TR.take.id)
    const m = myMons().find((x) => x.uid === uid)
    const a = arrival(L.mon.dex, m.lv)
    const o = outcomeFor(L.mon.dex, a.lv, L.mon.shiny)
    TR.take.uid = uid
    const get = `${nameOf(L.mon.dex)} Lv.${a.lv}`
    const lines = [
      a.raised ? `Raised from Lv.${Math.min(m.lv, C().levelCap)} to Lv.${a.lv}: ${a.min.why}.` : '',
      a.capped ? `Traded Pokémon arrive at Lv.${C().levelCap} at most.` : '',
      o.evo ? `It evolves into ${nameOf(o.evo)} on arrival.` : '',
      o.kind === 'merged'
        ? `You have ${nameOf(o.final)} Lv.${o.mine.lv}: the new one merges into yours, which stays as it is.`
        : '',
      o.kind === 'replaced' ? `It replaces your ${nameOf(o.final)} Lv.${o.mine.lv}.` : '',
    ].filter(Boolean)
    sheet(
      'Trade?',
      `With ${L.owner}`,
      `<div class="tr-swap"><span>${dexIco(m.dex, 'x2')}<b>${esc(nameOf(m.dex))}</b><small>Lv.${m.lv}</small></span><span class="tr-swap-arrow" aria-hidden="true">⇄</span><span>${dexIco(L.mon.dex, 'x2')}<b>${esc(nameOf(L.mon.dex))}${shinyStar(L.mon.shiny)}</b><small>Lv.${a.lv}</small></span></div>
        <p class="tr-confirm"><b>${esc(nameOf(m.dex))} Lv.${m.lv}</b> leaves your Box for good (its Pokédex entry stays). You get <b>${esc(get)}</b>.</p>
        ${lines.length ? `<ul class="tr-facts">${lines.map((l) => `<li><small>${esc(l)}</small></li>`).join('')}</ul>` : ''}`,
      `<div class="pg-foot2"><button type="button" class="ui-btn" data-tr-take="${L.id}"><span>Back</span></button><button type="button" class="ui-btn primary" data-tr-go><span>Trade</span></button></div>`,
    )
    if (o.kind === 'merged') A.toast('Nothing gained: you already have a stronger one')
  }
  /** The server said yes (the first taker wins): apply your half, then the scene. */
  function takeIt() {
    const L = findListing(TR.take.id)
    const m = myMons().find((x) => x.uid === TR.take.uid)
    if (!L || !m) return
    TR.board = TR.board.filter((x) => x !== L)
    TR.used++
    const res = receive(L.mon.dex, m, L.mon.shiny)
    giveAway(m)
    TR.done.unshift({
      dir: 'took',
      other: L.owner,
      listed: L.mon.dex,
      gave: { dex: m.dex, lv: m.lv },
      got: { dex: res.final, lv: res.lv },
      ago: 'just now',
      note: res.evo ? `evolved into ${nameOf(res.evo)}` : '',
    })
    A.closeAll()
    moment({ give: m, get: { dex: L.mon.dex, shiny: L.mon.shiny }, who: L.owner, res })
  }
  /** receiveTrade: into its home region's Box (the one-copy rule), a trade evolution, the Pokédex. */
  function receive(d, given, shiny) {
    const a = arrival(d, given.lv)
    const o = outcomeFor(d, a.lv, shiny)
    const fin = o.final
    const max = A.hpAt(fin, a.lv) || 40
    const add = () => {
      if (fin > 151) TR.jBox.push({ uid: `j${fin}-${Date.now()}`, dex: fin, lv: a.lv, shiny, where: 'box' })
      else A.boxAdd({ dex: fin, lv: a.lv, hp: [max, max], shiny })
    }
    if (o.kind === 'replaced') {
      if (o.mine.where === 'team' && fin <= 151) {
        // Your copy's team slot keeps the newcomer.
        const T = A.TEAM[Number(o.mine.uid.slice(4))]
        T.lv = a.lv
        T.hp = [A.hpAt(fin, a.lv) || T.hp[1], A.hpAt(fin, a.lv) || T.hp[1]]
      } else {
        if (fin <= 151) A.boxRemove(o.mine.uid)
        else TR.jBox = TR.jBox.filter((x) => x.uid !== o.mine.uid)
        add()
      }
    } else if (o.kind !== 'merged') add()
    const wasNew = !pokedex(fin) || (o.evo && !pokedex(d))
    if (fin <= 151) {
      if (!A.caught.has(fin)) A.SAVE.dexSeen = false
      A.caught.add(fin)
      if (o.evo) A.caught.add(d)
    } else TR.jDex.add(fin)
    return { ...o, ...a, final: fin, wasNew }
  }
  /** The one you gave leaves your Box (or team) for good; its Pokédex entry stays. */
  function giveAway(m) {
    if (m.region === 'johto') TR.jBox = TR.jBox.filter((x) => x.uid !== m.uid)
    else if (m.where === 'team') TR.teamOut.add(m.uid)
    else A.boxRemove(m.uid)
  }

  // ------------------------------------------------------------------ the trade scene, full screen
  let playing = null
  /** A sprite key for the scene: the lab's animated sprite, or the menu icon at 2× drawn as a one-frame sprite. */
  function sceneKey(d, shiny) {
    const base = A.spriteKey(d)
    if (base) return shiny && PX.SPR.meta[`${base}-shiny`] ? `${base}-shiny` : base
    const key = `ico-${d}`
    if (!PX.SPR.meta[key] && ATLAS.complete) {
      const c = document.createElement('canvas')
      c.width = 80
      c.height = 60
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = false
      g.drawImage(ATLAS, ((d - 1) % 16) * 40, Math.floor((d - 1) / 16) * 30, 40, 30, 0, 0, 80, 60)
      PX.SPR.img[key] = c
      PX.SPR.meta[key] = { w: 80, h: 60, cols: 1, n: 1, seq: [0], dur: [1000], total: 1000 }
    }
    return key
  }
  const ATLAS = new Image()
  ATLAS.src = 'assets/dex-icons.png'
  const BALLS = ['poke', 'great', 'ultra']
  /**
   * The scene (the Animations tab's trade timeline), a trade evolution after it when there is one, then where it went.
   * o: { give: {dex, lv, shiny}, get: {dex, shiny}, who, res, first? } — `first` is the pop-up's line before it.
   */
  function moment(o) {
    let el = $('#tr-moment')
    if (!el) {
      el = document.createElement('div')
      el.id = 'tr-moment'
      el.className = 'dc-moment tr-moment'
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-modal', 'true')
      el.setAttribute('aria-label', 'Trade')
      $('.hm-screen').appendChild(el)
    }
    el.innerHTML = `<div class="dc-m-stage"><canvas width="240" height="160" aria-hidden="true"></canvas></div>
      <p class="dc-m-say ui-dialog" aria-live="polite">…</p>
      <div class="dc-m-end" hidden></div>
      <button type="button" class="dc-m-skip">Skip</button>`
    el.hidden = false
    $('.hm-screen').classList.add('in-moment')
    const cv = $('canvas', el)
    const sayEl = $('.dc-m-say', el)
    const hud = {
      reset() {},
      setRoll() {},
      tick() {},
      hp() {},
      status() {},
      show() {},
      chip() {},
      heal() {},
      say: (m) => (sayEl.textContent = m),
    }
    const r = o.res
    const giveName = nameOf(o.give.dex)
    const getName = nameOf(o.get.dex)
    const defs = [
      () =>
        ANIM.MAKE.trade({
          give: { key: sceneKey(o.give.dex, o.give.shiny), name: giveName, ball: BALLS[o.give.dex % 3] },
          get: {
            key: sceneKey(o.get.dex, o.get.shiny),
            name: getName,
            ball: BALLS[(o.get.dex + 1) % 3],
            shiny: o.get.shiny,
          },
          who: o.who,
        }),
    ]
    if (r.evo)
      defs.push(() =>
        ANIM.MAKE.evolve({
          from: sceneKey(o.get.dex, o.get.shiny),
          to: sceneKey(r.evo, o.get.shiny),
          fromName: getName,
          toName: nameOf(r.evo),
        }),
      )
    const pl = new ANIM.Player(cv, hud)
    let step = 0
    playing = { pl, el }
    const load = () => {
      pl.load(defs[step](), { style: 'daybreak' })
      if (A.REDUCED) {
        pl.t = pl.def.dur - 0.01
        pl.advance(0.02)
        pl.render()
        next()
      } else pl.play()
    }
    const next = () => {
      if (++step < defs.length) return setTimeout(load, A.REDUCED ? 0 : 350)
      done()
    }
    const done = () => {
      pl.pause()
      const fin = nameOf(r.final)
      sayEl.textContent = r.evo
        ? `Congratulations! Your ${getName} evolved into ${fin}!`
        : `Take good care of ${getName}!`
      $('.dc-m-skip', el).hidden = true
      const end = $('.dc-m-end', el)
      end.hidden = false
      const where =
        r.kind === 'merged'
          ? `You already had ${fin} Lv.${r.mine.lv}: it merged into yours, which stays as it was.`
          : r.kind === 'replaced'
            ? `It replaced your ${fin} Lv.${r.mine.lv}${r.mine.where === 'team' ? ', and took its team slot' : ''}.`
            : r.kind === 'shiny'
              ? `A shiny: kept as its own Pokémon, in your ${REGION_NAME[homeRegionOf(r.final)]} Box.`
              : `It joined your ${REGION_NAME[homeRegionOf(r.final)]} Box${r.wasNew ? ', and your Pokédex' : ''}.`
      const lvl = r.raised
        ? `Lv.${Math.min(o.give.lv, C().levelCap)} raised to Lv.${r.lv}: ${r.min.why}.`
        : r.capped
          ? `Capped at Lv.${C().levelCap}.`
          : ''
      end.innerHTML = `<p class="dc-m-who">${dexIco(r.final)}<b>${esc(fin)}</b><span>Lv.${r.lv}</span>${o.get.shiny ? '<em class="shiny">✦ SHINY</em>' : ''}${r.wasNew ? '<em>NEW</em>' : ''}${r.kind === 'replaced' ? '<em>STRONGER</em>' : ''}</p>
        <p class="dc-m-where">${esc(where)}${lvl ? ` ${esc(lvl)}` : ''} ${esc(giveName)}’s Pokédex entry stays.</p>
        <div class="dc-m-btns"><button type="button" class="ui-btn primary" data-m-close><span>Done</span></button></div>`
      $('[data-m-close]', end).focus({ preventScroll: true })
    }
    pl.onEnd = next
    const skip = () => {
      // Skip jumps past every scene left, to what you got.
      pl.pause()
      step = defs.length - 1
      pl.load(defs[step](), { style: 'daybreak' })
      pl.t = pl.def.dur - 0.01
      pl.advance(0.02)
      pl.render()
      done()
    }
    $('.dc-m-skip', el).onclick = skip
    el.onclick = (e) => e.target.closest('[data-m-close]') && close()
    el.onkeydown = (e) => e.key === 'Escape' && ($('.dc-m-end', el).hidden ? skip() : close())
    load()
    $('.dc-m-skip', el).focus({ preventScroll: true })
    function close() {
      shut()
      A.renderNavDots()
      rerender()
      if (o.after) o.after()
    }
  }
  function shut() {
    if (!playing) return
    playing.pl.pause()
    playing.el.hidden = true
    $('.hm-screen').classList.remove('in-moment')
    playing = null
  }

  // ------------------------------------------------------------------ New listing: your Pokémon, the want, who sees it
  function newListing(preUid) {
    if (!TR.signed) return A.toast('Connect first: trades need an account')
    if (TR.mine.length >= C().maxListings)
      return A.toast(`${C().maxListings} listings at most: cancel one first`)
    TR.draft = {
      uid: preUid || null,
      kind: 'species',
      want: null,
      vis: 'public',
      monQ: '',
      monReg: 'kanto',
      monSort: 'lv',
      q: '',
      own: 'not',
      reg: 'all',
    }
    draftRender()
  }
  function draftRender(focusSel) {
    const D = TR.draft
    const mons = myMons()
    const pick = mons.find((m) => m.uid === D.uid)
    // 1. Your Pokémon
    let s1
    if (pick)
      s1 = `<div class="tr-picked">${dexIco(pick.dex)}<span class="tr-row-t"><b>${esc(nameOf(pick.dex))}${shinyStar(pick.shiny)} <span class="hm-lv">Lv.${pick.lv}</span></b><small>${pick.where === 'team' ? 'In your team: the next one steps in' : `In your ${REGION_NAME[pick.region]} Box`}</small></span><button type="button" class="pg-hint" data-tr-d="unpick">Change</button></div>`
    else {
      const q = A.fold(D.monQ.trim())
      let list = mons.filter(
        (m) => m.region === D.monReg && (!q || A.fold(nameOf(m.dex)).includes(q) || String(m.dex) === q),
      )
      list.sort((a, b) => (D.monSort === 'lv' ? b.lv - a.lv : a.dex - b.dex) || a.dex - b.dex)
      s1 = `${
        TR.johto
          ? `<div class="hm-seg pg-tabs tr-regtabs" role="tablist" aria-label="Region">${started()
              .map(
                (r) =>
                  `<button type="button" role="tab" data-tr-d="monreg:${r}" aria-selected="${D.monReg === r}">${REGION_NAME[r]}</button>`,
              )
              .join('')}</div>`
          : ''
      }
        <div class="pg-tools"><label class="sr" for="tr-mq">Search your Pokémon</label><input id="tr-mq" type="search" placeholder="Search your Pokémon" autocomplete="off" spellcheck="false" value="${esc(D.monQ)}" />
          <div class="hm-seg" role="radiogroup" aria-label="Sort">${[
            ['lv', 'Level'],
            ['no', 'No.'],
          ]
            .map(
              ([k, l]) =>
                `<button type="button" role="radio" data-tr-d="monsort:${k}" aria-checked="${D.monSort === k}">${l}</button>`,
            )
            .join('')}</div></div>
        <ul class="tr-mongrid">${
          list
            .map((m) => {
              const why = listable(m)
              return `<li><button type="button" class="pg-bx tr-mt${why ? ' off' : ''}" data-tr-d="pick:${esc(m.uid)}"${why ? ` aria-disabled="true" data-tr-why="${esc(why)}"` : ''} aria-label="${esc(`${nameOf(m.dex)}, Lv.${m.lv}${why ? `: ${why}` : ''}`)}">${dexIco(m.dex)}<b>${esc(nameOf(m.dex))}</b><span>Lv.${m.lv}</span>${m.shiny ? '<em class="pg-shiny" aria-hidden="true">★</em>' : ''}${m.where === 'team' ? '<em class="tr-team tl">TEAM</em>' : ''}${why ? `<small class="tr-mt-why">${esc(why)}</small>` : ''}</button></li>`
            })
            .join('') || '<li class="hm-empty">Nothing matches.</li>'
        }</ul>`
    }
    // 2. In exchange
    const kinds = [
      ['species', 'A species'],
      ['notOwned', 'Any I don’t own'],
      ['any', 'Anything'],
    ]
    let s2 = `<div class="hm-seg pg-tabs tr-kinds" role="radiogroup" aria-label="What you want">${kinds
      .map(
        ([k, l]) =>
          `<button type="button" role="radio" data-tr-d="kind:${k}" aria-checked="${D.kind === k}">${l}</button>`,
      )
      .join('')}</div>`
    if (D.kind === 'species') {
      if (D.want)
        s2 += `<div class="tr-picked">${dexIco(D.want)}<span class="tr-row-t"><b>${esc(nameOf(D.want))}</b><small>#${pad3(D.want)} · ${owns(D.want) ? 'Owned' : pokedex(D.want) ? 'In your Pokédex, not your Box' : 'NEW: not in your Pokédex'}</small></span><button type="button" class="pg-hint" data-tr-d="unwant">Change</button></div>`
      else {
        const all = wantable()
        const inReg = (d) => D.reg === 'all' || homeRegionOf(d) === D.reg
        const q = A.fold(D.q.trim())
        const num = /^#?\d+$/.test(D.q.trim()) ? Number(D.q.trim().replace('#', '')) : null
        const hit = (d) =>
          num != null ? String(d).startsWith(String(num)) : !q || A.fold(nameOf(d)).includes(q)
        const base = all.filter((d) => inReg(d) && hit(d))
        const cnt = {
          not: base.filter((d) => !owns(d)).length,
          own: base.filter((d) => owns(d)).length,
          all: base.length,
        }
        const shown = base.filter((d) => (D.own === 'not' ? !owns(d) : D.own === 'own' ? owns(d) : true))
        s2 += `<div class="pg-tools"><label class="sr" for="tr-wq">Search by name or number</label><input id="tr-wq" type="search" placeholder="Name or number" autocomplete="off" spellcheck="false" value="${esc(D.q)}" />
          <div class="hm-seg" role="radiogroup" aria-label="Show">${[
            ['not', 'Not owned'],
            ['own', 'Owned'],
            ['all', 'All'],
          ]
            .map(
              ([k, l]) =>
                `<button type="button" role="radio" data-tr-d="own:${k}" aria-checked="${D.own === k}">${l} <i>${cnt[k]}</i></button>`,
            )
            .join('')}</div></div>
          ${TR.johto ? `<div class="hm-chips" role="radiogroup" aria-label="Region">${['all', ...started()].map((r) => `<button type="button" role="radio" data-tr-d="reg:${r}" aria-checked="${D.reg === r}">${r === 'all' ? 'All regions' : REGION_NAME[r]}</button>`).join('')}</div>` : ''}
          <ul class="tr-grid">${
            shown
              .map((d) => {
                const o = owns(d)
                const nw = !pokedex(d)
                return `<li><button type="button" class="tr-tile" data-tr-d="want:${d}" aria-label="${esc(`${nameOf(d)}, number ${d}, ${o ? 'owned' : nw ? 'new: not in your Pokédex' : 'not owned'}`)}"><span class="tr-tile-n">#${pad3(d)}</span>${dexIco(d)}<b>${esc(nameOf(d))}</b>${o ? '<em class="tr-own">Owned</em>' : nw ? '<em class="tr-new">NEW</em>' : ''}</button></li>`
              })
              .join('') || '<li class="hm-empty">No species matches.</li>'
          }</ul>`
      }
    } else if (D.kind === 'notOwned')
      s2 += `<p class="tr-kind-note">Any Pokémon you don’t have right now in the Box it would land in, or a shiny when you have no shiny of it.</p>`
    else
      s2 += `<p class="tr-kind-note">Anything at all. If it’s one you already have, as strong or stronger, it merges into yours and nothing is gained.</p>`
    // 3. Who can see it
    const s3 = `<div class="hm-seg pg-tabs tr-kinds" role="radiogroup" aria-label="Who can see it">${Object.entries(
      VIS,
    )
      .map(
        ([k, [l]]) =>
          `<button type="button" role="radio" data-tr-d="vis:${k}" aria-checked="${D.vis === k}">${l}</button>`,
      )
      .join('')}</div><p class="tr-kind-note">${VIS[D.vis][1]}</p>`
    const ready = pick && (D.kind !== 'species' || D.want)
    const lv = pick ? Math.min(pick.lv, C().levelCap) : 0
    const summary = ready
      ? `<p class="tr-summary"><b>${esc(nameOf(pick.dex))}</b> leaves your Box now. It comes back if nobody trades within ${plural(C().listingDays, 'day')}. You’ll get theirs at Lv.${lv}${pick.lv > C().levelCap ? ' (the cap)' : ''}, or its minimum.</p>`
      : ''
    const why = !pick ? 'Pick your Pokémon' : !ready ? 'Pick the Pokémon you want' : ''
    sheet(
      'New listing',
      `${TR.mine.length + 1} of ${C().maxListings} · ends in ${plural(C().listingDays, 'day')} if nobody trades`,
      `<section class="tr-step"><h3><span>1</span>Your Pokémon</h3>${s1}</section>
        <section class="tr-step"><h3><span>2</span>In exchange</h3>${s2}</section>
        <section class="tr-step"><h3><span>3</span>Who can see it</h3>${s3}</section>${summary}`,
      `<button type="button" class="ui-btn primary wide" data-tr-post${why ? ` aria-disabled="true" data-tr-why="${why}"` : ''}><span>${why || 'Post'}</span></button>`,
    )
    if (focusSel && $(focusSel)) {
      const f = $(focusSel)
      f.focus({ preventScroll: true })
      if (f.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length)
    }
  }
  function draftAct(v) {
    const D = TR.draft
    const [k, x] = v.split(/:(.*)/)
    if (k === 'pick') D.uid = x
    else if (k === 'unpick') D.uid = null
    else if (k === 'monreg') D.monReg = x
    else if (k === 'monsort') D.monSort = x
    else if (k === 'kind') D.kind = x
    else if (k === 'want') D.want = Number(x)
    else if (k === 'unwant') D.want = null
    else if (k === 'own') D.own = x
    else if (k === 'reg') D.reg = x
    else if (k === 'vis') D.vis = x
    const y = $('#hm-s2-body').scrollTop
    draftRender()
    // Picking folds a grid away: keep the place unless a step just closed.
    $('#hm-s2-body').scrollTop = k === 'pick' || k === 'want' ? 0 : y
    const back = $(`[data-tr-d="${v}"]`)
    if (back) back.focus({ preventScroll: true })
  }
  function post() {
    const D = TR.draft
    const m = myMons().find((x) => x.uid === D.uid)
    const L = {
      id: `M${Date.now()}`,
      code: code(),
      mon: { dex: m.dex, lv: m.lv, shiny: m.shiny },
      uid: m.uid,
      from: m,
      want: D.kind === 'species' ? { kind: 'species', dex: D.want } : { kind: D.kind },
      vis: D.vis,
      ends: Date.now() + C().listingDays * DAY,
      at: Date.now(),
    }
    TR.mine.push(L)
    giveAway(m)
    TR.draft = null
    TR.tab = 'mine'
    A.closeAll()
    if (A.SAVE && $('.hm-page[data-page="trades"]').hidden) A.showPage('trades')
    rerender()
    A.toast(
      `${nameOf(m.dex)} is on the board${m.where === 'team' ? ' (the lab’s Home keeps its three)' : ''}`,
    )
    if (L.vis === 'private') setTimeout(() => share(L.id), 120)
  }
  /** Cancel (or it ended, or the admin removed it): back into the Box, by the catch rule. */
  function back(id, how) {
    const L = TR.mine.find((x) => x.id === id)
    if (!L) return
    TR.mine = TR.mine.filter((x) => x !== L)
    const m = L.from || {
      dex: L.mon.dex,
      lv: L.mon.lv,
      shiny: L.mon.shiny,
      where: 'box',
      region: homeRegionOf(L.mon.dex),
    }
    if (m.region === 'johto')
      TR.jBox.push({ uid: m.uid || `j${m.dex}`, dex: m.dex, lv: m.lv, shiny: m.shiny, where: 'box' })
    else if (m.where === 'team') TR.teamOut.delete(m.uid)
    else {
      const max = A.hpAt(m.dex, m.lv) || 40
      A.boxAdd({ uid: m.uid, dex: m.dex, lv: m.lv, hp: [max, max], shiny: m.shiny })
    }
    A.closeAll()
    rerender()
    A.toast(
      how === 'ended'
        ? `${nameOf(m.dex)} came back from the trade board.`
        : how === 'admin'
          ? `${nameOf(m.dex)} came back: the listing was removed`
          : `${nameOf(m.dex)} is back in your Box`,
    )
  }

  // ------------------------------------------------------------------ sharing, links, friends' cards
  const linkOf = (L) => `${location.origin.replace(/^https?:\/\//, '')}/t/${L.code}`
  function share(id) {
    const L = findListing(id)
    sheet(
      'Share your listing',
      `${nameOf(L.mon.dex)} · ${VIS[L.vis][0]}`,
      `<div class="tr-share"><span class="tr-share-l">LINK</span><code>${esc(linkOf(L))}</code><button type="button" class="ui-btn" data-tr-copy="${L.id}"><span>Copy</span></button></div>
        <p class="pg-note">${L.vis === 'private' ? 'Only people with this link can find it.' : L.vis === 'friends' ? 'Anyone can open it; only your friends can take it.' : 'Anyone signed in can take it, from the board or this link.'} On a phone, Share opens the share sheet.</p>`,
      `<button type="button" class="ui-btn primary wide" data-tr-copy="${L.id}"><span>Share</span></button>`,
    )
  }
  /** A shared link opened: the listing in its sheet, once the run is idle (never mid-fight). */
  function openLink(kind) {
    A.showPage('home')
    const L =
      kind === 'stranger'
        ? TR.board.find((x) => x.vis === 'friends' && x.owner === 'Sora')
        : TR.board.find((x) => x.vis === 'private')
    if (!L) return A.toast('That listing is gone')
    const was = { signed: TR.signed, fr: PEOPLE.Sora.friend }
    if (kind === 'out') TR.signed = false
    if (kind === 'stranger') PEOPLE.Sora.friend = false
    openListing(L.id, true)
    // The preview only borrows these for the one sheet.
    TR.signed = was.signed
    PEOPLE.Sora.friend = was.fr
  }
  function friendsSheet() {
    const fr = Object.entries(PEOPLE).filter(([, p]) => p.friend)
    sheet(
      'Friends',
      `${fr.length}/100`,
      `<ul class="tr-friends">${fr
        .map(([n, p]) => {
          const theirs = TR.board.filter((L) => L.owner === n && L.vis !== 'private').length
          return `<li><button type="button" class="so-row tr-frow" data-tr-card="${esc(n)}">${A.lookOf(p.look)}<span class="so-who"><b>${esc(n)}</b><small>Kanto · Lv.${p.lv} · ${esc(p.ago)}</small></span>${theirs ? `<em class="tr-fr">${plural(theirs, 'trade')}</em>` : ''}</button></li>`
        })
        .join(
          '',
        )}</ul><p class="pg-note">The real Friends page (docs/16) adds trainers by friend ID or link. Their cards gain a Their trades row.</p>`,
    )
  }
  function card(n) {
    const p = PEOPLE[n]
    const theirs = TR.board.filter((L) => L.owner === n && L.vis !== 'private')
    sheet(
      n,
      `Friends since ${p.since}`,
      `<div class="tc-card"><div class="tc-top"><span>TRAINER CARD</span><span>PLAYED ${esc(p.ago.toUpperCase())}</span></div>
        <div class="tc-main">${A.lookOf(p.look, 'big')}<div class="tc-info"><p class="tc-name"><b>${esc(n)}</b></p>
          <dl class="tc-stats"><dt>Pokédex</dt><dd>${p.dex}/151</dd><dt>Best level</dt><dd>Lv.${p.lv}</dd><dt>Trades</dt><dd>${theirs.length} open</dd></dl></div></div></div>
        <div class="pg-sec-h"><h3>Their trades</h3><span class="pg-count">${theirs.length}</span></div>
        <ul class="tr-board">${theirs.map((L) => rowHTML({ L, why: blocker(L), fr: true, fresh: isNewFor(L) })).join('') || '<li class="hm-empty">No open listing right now.</li>'}</ul>`,
    )
  }

  // ------------------------------------------------------------------ coming back: a listing was taken, or ran out
  function taken() {
    let L = TR.mine.find((x) => x.mon.dex === 4) || TR.mine[0]
    if (!L) return A.toast('No listing of yours is open: post one first')
    const taker = 'Misty'
    // Misty gave the Wartortle Lv.34 the plan's example uses (or something matching another want).
    const theirs = L.want.kind === 'species' ? { dex: L.want.dex, lv: 34 } : { dex: 8, lv: 34 }
    TR.mine = TR.mine.filter((x) => x !== L)
    const res = receive(theirs.dex, { lv: L.mon.lv }, false)
    TR.done.unshift({
      dir: 'taken',
      other: taker,
      listed: L.mon.dex,
      gave: { dex: L.mon.dex, lv: L.mon.lv },
      got: { dex: res.final, lv: res.lv },
      ago: 'just now',
      fresh: true,
      note: res.raised ? 'its minimum' : '',
    })
    TR.dot = true
    paintDots()
    A.showPage('home')
    const ov = overlay()
    ov.innerHTML = `<div class="ev-pop tr-pop" role="dialog" aria-modal="true" aria-labelledby="tr-pop-t">
      <div class="tr-pop-top"><span>${dexIco(L.mon.dex, 'x2')}<small>Yours</small></span><img class="px tr-pop-ico" alt="" src="${ICON}" /><span>${dexIco(theirs.dex, 'x2')}<small>${esc(taker)}’s</small></span></div>
      <h3 id="tr-pop-t">Trade done!</h3>
      <p class="tr-pop-line">${esc(taker)} took your ${esc(nameOf(L.mon.dex))}.</p>
      <div class="ev-pop-foot"><button type="button" class="ui-btn" data-tr-later><span>Later</span></button><button type="button" class="ui-btn primary" data-tr-see><span>See it</span></button></div></div>`
    ov.hidden = false
    SND().tone(784, 0.1, { vol: 0.04 })
    SND().tone(1047, 0.18, { vol: 0.04, at: 0.1 })
    $('[data-tr-see]', ov).focus()
    TR.pending = {
      give: { dex: L.mon.dex, lv: L.mon.lv, shiny: L.mon.shiny },
      get: { dex: theirs.dex, shiny: false },
      who: taker,
      res,
    }
  }
  function ranOut() {
    const L = TR.mine[TR.mine.length - 1]
    if (!L) return A.toast('No listing of yours is open: post one first')
    A.showPage('home')
    back(L.id, 'ended')
  }
  /** The gold dot on your avatar (and the Trades row) until you've seen what a trade brought. */
  function paintDots() {
    const tb = $('#hm-trainer')
    if (!tb) return
    const on = TR.dot && visible()
    tb.classList.toggle('tr-av-dot', on)
    tb.setAttribute('aria-label', on ? 'Trainer card: a trade went through' : 'Trainer card')
  }
  function overlay() {
    let ov = $('#tr-ov')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'tr-ov'
      ov.className = 'ev-ov'
      ov.hidden = true
      $('.hm-screen').appendChild(ov)
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          ov.hidden = true
        }
      })
    }
    return ov
  }
  function rulesPop() {
    const ov = overlay()
    TR.rulesSeen = true
    ov.innerHTML = `<div class="ev-pop tr-pop" role="dialog" aria-modal="true" aria-labelledby="tr-rules-t">
      <div class="tr-pop-top"><span>${dexIco(25, 'x2')}</span><img class="px tr-pop-ico" alt="" src="${ICON}" /><span>${dexIco(158, 'x2')}</span></div>
      <h3 id="tr-rules-t">Trades</h3>
      <ul class="ev-rules">
        <li><span class="ev-ri"><img class="px ev-ri-img" alt="" src="${ICON}" /></span><span><b>Put one up, get one back</b><small>Say what you want; anyone allowed takes it while you’re away. ${C().maxListings} listings at most, ${plural(C().listingDays, 'day')} each.</small></span></li>
        <li><span class="ev-ri"><span class="ev-ri-i">Lv</span></span><span><b>At the level of the one given</b><small>Lv.${C().levelCap} at most, never under the species’ minimum.</small></span></li>
        <li><span class="ev-ri">${dexIco(4)}</span><span><b>You lose the one you trade</b><small>Its Pokédex entry stays. Legendaries and mythicals can’t be traded.</small></span></li>
        <li><span class="ev-ri">${dexIco(65)}</span><span><b>Kadabra, Machoke, Graveler, Haunter…</b><small>evolve the moment they arrive.</small></span></li>
      </ul>
      <div class="ev-pop-foot one"><button type="button" class="ui-btn primary" data-tr-later><span>OK</span></button></div></div>`
    ov.hidden = false
    $('[data-tr-later]', ov).focus()
  }

  // ------------------------------------------------------------------ the trainer menu, the Pokémon sheet
  /** The Friends and Trades rows, under the Leaderboard (social.js asks for them). */
  A.tradeMenuRows = () => {
    if (!visible()) return ''
    return `<li><button type="button" data-tr-friends><span class="tc-mi tr-mi-fr" aria-hidden="true">${A.lookOf('cooltrainer-f', 'av')}</span><span><b>Friends</b><small>Add trainers and see their cards</small></span></button></li>
      <li><button type="button" data-tr-page><img class="px" alt="" src="${ICON}" /><span><b>Trades</b><small>${TR.signed ? 'Your listings and the trade board' : 'Connect to trade Pokémon'}</small></span>${TR.dot ? '<em class="tr-menu-dot">NEW</em>' : TR.mine.length ? `<em>${TR.mine.length}/${C().maxListings}</em>` : ''}</button></li>`
  }
  /**
   * TRADE on a Pokémon's sheet, beside Send on, in the panel at the bottom of its body (the game's SendOnPanel):
   * it opens New listing with this one picked. pages.js asks for it.
   */
  A.sheetActions = (m) => {
    if (!visible() || !TR.signed || m.where === 'dex') return ''
    const uid = m.where === 'team' ? `team${m.i}` : m.uid
    const why = listable({ ...m, region: 'kanto' })
    const name = nameOf(m.dex)
    const send =
      A.SAVE.id === 'league'
        ? '<button type="button" class="ui-btn primary" data-tr-why="Send to Johto: the game’s button (from the League on)"><span>Send to Johto</span></button>'
        : ''
    return `<section class="tr-sendon">
      <div class="tr-sendon-btns">${send}<button type="button" class="ui-btn${send ? '' : ' primary'}" data-tr-sheetpick="${esc(uid)}"${why ? ` aria-disabled="true" data-tr-why="${esc(why)}"` : ''}><span>Trade</span></button></div>
      <p class="pg-note">${why ? esc(`${name} can’t be traded: ${why.toLowerCase()}.`) : `Trade puts ${esc(name)} on the trade board: you say what you want for it.`}</p></section>`
  }

  // ------------------------------------------------------------------ clicks
  function onClick(e) {
    const t = e.target
    let b
    const q = (s) => t.closest(s)
    if ((b = q('[data-tr-why]'))) return A.toast(b.dataset.trWhy)
    if (q('[data-tr-back]')) return A.showPage('trainer')
    if (q('[data-tr-page]')) return A.showPage('trades')
    if (q('[data-tr-friends]')) return friendsSheet()
    if ((b = q('[data-tr-card]'))) return card(b.dataset.trCard)
    if ((b = q('[data-tr-tab]'))) {
      TR.tab = b.dataset.trTab
      if (TR.tab === 'mine' && TR.dot) {
        TR.dot = false
        paintDots()
      }
      rerender()
      return $(`[data-tr-tab="${TR.tab}"]`).focus({ preventScroll: true })
    }
    if ((b = q('[data-tr-chip]'))) {
      TR.chip = b.dataset.trChip
      rerender()
      return $(`[data-tr-chip="${TR.chip}"]`).focus({ preventScroll: true })
    }
    if ((b = q('[data-tr-sort]'))) {
      TR.sort = b.dataset.trSort
      rerender()
      return $(`[data-tr-sort="${TR.sort}"]`).focus({ preventScroll: true })
    }
    if ((b = q('[data-tr-open]'))) return openListing(b.dataset.trOpen)
    if ((b = q('[data-tr-take]'))) return picker(b.dataset.trTake)
    if ((b = q('[data-tr-give]'))) return confirm(b.dataset.trGive)
    if (q('[data-tr-go]')) return takeIt()
    if (q('[data-tr-new]')) return newListing()
    if ((b = q('[data-tr-sheetpick]'))) {
      A.closeAll()
      A.showPage('trades')
      return newListing(b.dataset.trSheetpick)
    }
    if ((b = q('[data-tr-d]'))) return draftAct(b.dataset.trD)
    if (q('[data-tr-post]')) return post()
    if ((b = q('[data-tr-cancel]'))) return back(b.dataset.trCancel)
    if ((b = q('[data-tr-share]'))) return share(b.dataset.trShare)
    if ((b = q('[data-tr-copy]'))) {
      const L = findListing(b.dataset.trCopy)
      try {
        navigator.clipboard && navigator.clipboard.writeText(`${location.origin}/t/${L.code}`)
      } catch (err) {
        void err
      }
      return A.toast('Link copied')
    }
    if (q('[data-tr-connect]')) return A.toast('Connect: Google or Discord (the game’s chooser)')
    if ((b = q('[data-tr-addfriend]'))) {
      PEOPLE[b.dataset.trAddfriend].friend = true
      A.toast(`You and ${b.dataset.trAddfriend} are friends now`)
      return
    }
    if (q('[data-tr-info]')) return rulesPop()
    if (q('[data-tr-later]')) {
      $('#tr-ov').hidden = true
      paintDots()
      return
    }
    if (q('[data-tr-see]')) {
      $('#tr-ov').hidden = true
      TR.dot = false
      paintDots()
      return moment(TR.pending)
    }
  }
  document.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest || !e.target.closest('.hm-screen')) return
      if (
        e.target.closest(
          '[data-tr-why], [data-tr-back], [data-tr-page], [data-tr-friends], [data-tr-card], [data-tr-tab], [data-tr-chip], [data-tr-sort], [data-tr-open], [data-tr-take], [data-tr-give], [data-tr-go], [data-tr-new], [data-tr-sheetpick], [data-tr-d], [data-tr-post], [data-tr-cancel], [data-tr-share], [data-tr-copy], [data-tr-connect], [data-tr-addfriend], [data-tr-info], [data-tr-later], [data-tr-see]',
        )
      ) {
        e.stopPropagation()
        onClick(e)
      }
    },
    true,
  )
  document.addEventListener('input', (e) => {
    const id = e.target.id
    if (id === 'tr-q') {
      TR.q = e.target.value
      const pos = e.target.selectionStart
      rerender()
      const el = $('#tr-q')
      el.focus()
      el.setSelectionRange(pos, pos)
    } else if (id === 'tr-mq' || id === 'tr-wq') {
      TR.draft[id === 'tr-mq' ? 'monQ' : 'q'] = e.target.value
      draftRender(`#${id}`)
    }
  })
  // The shared sheet is the Pokémon sheet's too: drop the trade look when something else opens it.
  new MutationObserver(() => {
    const el = $('#hm-sheet2')
    if (el && el.hidden) el.classList.remove('tr-sheet')
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] })

  // ------------------------------------------------------------------ the preview bar
  function controls() {
    const box = $('#tr-controls')
    if (!box || box.dataset.bound) return
    box.dataset.bound = '1'
    const mark = (attr, v) =>
      $$(`[${attr}]`, box).forEach((x) => x.setAttribute('aria-checked', String(x.getAttribute(attr) === v)))
    box.addEventListener('click', (e) => {
      let b
      if ((b = e.target.closest('[data-trsign]'))) {
        TR.signed = b.dataset.trsign === 'in'
        mark('data-trsign', b.dataset.trsign)
        return refresh()
      }
      if ((b = e.target.closest('[data-trreg]'))) {
        TR.johto = b.dataset.trreg === 'both'
        mark('data-trreg', b.dataset.trreg)
        return refresh()
      }
      if ((b = e.target.closest('[data-trcap]'))) {
        TR.used = b.dataset.trcap === 'full' ? C().tradesPerDay : 1
        mark('data-trcap', b.dataset.trcap)
        return refresh()
      }
      if (e.target.closest('[data-tropen]')) return A.showPage('trades')
      if (e.target.closest('[data-trtaken]')) return taken()
      if (e.target.closest('[data-trout]')) return ranOut()
      if ((b = e.target.closest('[data-trlink]'))) return openLink(b.dataset.trlink)
      if (e.target.closest('[data-trscene]')) {
        A.showPage('home')
        const k = myMons().find((m) => m.dex === 129) || { dex: 129, lv: 12 }
        return moment({
          give: { dex: k.dex, lv: k.lv },
          get: { dex: 64, shiny: false },
          who: 'Lea',
          res: {
            ...outcomeFor(64, Math.max(16, k.lv), false),
            ...arrival(64, k.lv),
            final: 65,
            evo: 65,
            wasNew: !A.caught.has(65),
          },
        })
      }
    })
  }

  // ------------------------------------------------------------------ the admin mock
  function admin() {
    const el = $('#tr-admin')
    if (!el) return
    const c = C()
    const all = [
      ...TR.board.map((L) => ({ L, who: L.owner })),
      ...TR.mine.map((L) => ({ L, who: A.SAVE.trainer, mine: true })),
    ].sort((a, b) => a.L.ends - b.L.ends)
    el.innerHTML = `
      <div class="ad-sec"><h3>Config → Trades</h3>
        <div class="ad-switch" role="radiogroup" aria-label="Trades: who sees them">${['off', 'admin', 'all']
          .map(
            (a) =>
              `<button type="button" role="radio" aria-checked="${c.access === a}" data-tracc="${a}">${a === 'off' ? 'Off' : a === 'admin' ? 'On for admin' : 'On for everyone'}</button>`,
          )
          .join('')}</div>
        ${c.access === 'admin' ? `<label class="ad-inline"><input type="checkbox" data-trasadmin${TR.asAdmin ? ' checked' : ''} /> Preview signed in as the admin</label>` : ''}
        <div class="ad-grid">
          <label><span>Open listings a player</span><input type="number" data-trf="maxListings" value="${c.maxListings}" min="1" max="8" /></label>
          <label><span>Listing lasts (days)</span><input type="number" data-trf="listingDays" value="${c.listingDays}" min="1" max="14" /></label>
          <label><span>Trades a day (UTC)</span><input type="number" data-trf="tradesPerDay" value="${c.tradesPerDay}" min="1" max="50" /></label>
          <label><span>Level cap</span><input type="number" data-trf="levelCap" value="${c.levelCap}" min="5" max="100" /></label>
          <label><span>Badges needed</span><input type="number" data-trf="minBadges" value="${c.minBadges}" min="0" max="16" /></label>
        </div>
        <table class="ad-t"><thead><tr><th>Evolves on trade</th><th>Into</th><th></th></tr></thead><tbody>${c.evolveOnTrade
          .map(
            ([a, b], i) =>
              `<tr><td>#${a} ${esc(nameOf(a))}</td><td>#${b} ${esc(nameOf(b))}</td><td><button type="button" class="btn small" data-trevrm="${i}">✕</button></td></tr>`,
          )
          .join('')}</tbody></table>
        <div class="ad-dev"><button type="button" class="btn small" data-trevadd>Add Slowpoke → Slowbro</button></div>
        <p class="ad-note">Off by default; the server checks the switch too. The level cap, the days and the daily cap apply at once; listings already open keep their end date. The trade-evolution list is config, not data: no seed needed.</p></div>
      <div class="ad-sec"><h3>Admin → Trades · ${plural(all.length, 'open listing')}</h3>
        <table class="ad-t"><thead><tr><th>Trainer</th><th>Pokémon</th><th>Wants</th><th>Seen by</th><th>Ends</th><th></th></tr></thead><tbody>${all
          .map(
            ({ L, who, mine }) =>
              `<tr><td>${esc(who)}</td><td>${esc(nameOf(L.mon.dex))}${L.mon.shiny ? ' ★' : ''} Lv.${L.mon.lv}</td><td>${esc(wantWords(L.want, who))}</td><td>${VIS[L.vis][0]}</td><td>${dur(left(L))}</td><td><button type="button" class="btn small" data-trrm="${L.id}"${mine ? ' data-mine="1"' : ''}>Remove</button></td></tr>`,
          )
          .join('')}</tbody></table>
        <p class="ad-note">Remove gives the Pokémon back to its owner (their game applies it on its next check).</p></div>`
    if (el.dataset.bound) return
    el.dataset.bound = '1'
    el.addEventListener('change', (e) => {
      const t = e.target
      if (t.dataset.trf)
        C()[t.dataset.trf] = Math.max(Number(t.min) || 0, Number(t.value) || C()[t.dataset.trf])
      else if (t.matches('[data-trasadmin]')) TR.asAdmin = t.checked
      else return
      refresh()
    })
    el.addEventListener('click', (e) => {
      let b
      if ((b = e.target.closest('[data-tracc]'))) {
        C().access = b.dataset.tracc
        return refresh()
      }
      if ((b = e.target.closest('[data-trevrm]'))) {
        C().evolveOnTrade.splice(Number(b.dataset.trevrm), 1)
        return refresh()
      }
      if (e.target.closest('[data-trevadd]')) {
        if (!C().evolveOnTrade.some(([a]) => a === 79)) C().evolveOnTrade.push([79, 80])
        return refresh()
      }
      if ((b = e.target.closest('[data-trrm]'))) {
        if (b.dataset.mine) back(b.dataset.trrm, 'admin')
        else TR.board = TR.board.filter((L) => L.id !== b.dataset.trrm)
        return refresh()
      }
    })
  }

  // ------------------------------------------------------------------ wiring
  // The page's icon: two arrows crossing, gold and blue, drawn like the tab bar's (navy outline, three tones).
  function iconMap() {
    const N = 16
    const F = Array.from({ length: N }, () => Array(N).fill('.'))
    const put = (x, y, c) => x >= 0 && y >= 0 && x < N && y < N && (F[y][x] = c)
    // → on top, ← below.
    for (let y = 3; y <= 5; y++) for (let x = 1; x <= 8; x++) put(x, y, y === 3 ? 'Y' : y === 5 ? 'o' : 'y')
    for (let dy = -3; dy <= 3; dy++)
      for (let x = 9; x <= 12 - Math.abs(dy); x++) put(x, 4 + dy, dy < 0 ? 'Y' : dy > 0 ? 'o' : 'y')
    for (let y = 10; y <= 12; y++)
      for (let x = 7; x <= 14; x++) put(x, y, y === 10 ? 'c' : y === 12 ? 'd' : 'b')
    for (let dy = -3; dy <= 3; dy++)
      for (let x = 3 + Math.abs(dy); x <= 6; x++) put(x, 11 + dy, dy < 0 ? 'c' : dy > 0 ? 'd' : 'b')
    const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && F[y][x] !== '.' && F[y][x] !== 'k'
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (F[y][x] === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)))
          F[y][x] = 'k'
    return F.map((r) => r.join(''))
  }
  const ICON = PX.icon(
    iconMap(),
    { k: '#24304f', y: '#ffbe2e', Y: '#ffe7a8', o: '#e08e00', b: '#5b8def', c: '#a9dcff', d: '#3a5fc0' },
    2,
  ).toDataURL()
  const page = () => $('.hm-page[data-page="trades"]')
  function rerender() {
    const p = page()
    if (p && !p.hidden) {
      const y = p.scrollTop
      render(p)
      p.scrollTop = y
    }
    const tc = $('.hm-page[data-page="trainer"]')
    if (tc && !tc.hidden && A.rerenderTrainer) A.rerenderTrainer()
    admin()
  }
  function refresh() {
    paintDots()
    rerender()
  }
  /** The preview saves: what each one has on the board and in its history. */
  function reset() {
    const S = A.SAVE
    buildBoard()
    TR.mine = []
    TR.done = []
    TR.teamOut = new Set()
    TR.dot = false
    TR.tab = 'board'
    TR.q = ''
    TR.chip = 'all'
    TR.draft = null
    TR.johto = S.id === 'league'
    $$('#tr-controls [data-trreg]').forEach((x) =>
      x.setAttribute('aria-checked', String(x.dataset.trreg === (TR.johto ? 'both' : 'kanto'))),
    )
    // Johto, started in the League save: the partner and a few catches.
    const partner = S.partner || 158
    TR.jBox = [
      { uid: 'j1', dex: partner, lv: 18, where: 'team' },
      { uid: 'j2', dex: 161, lv: 9, where: 'box' },
      { uid: 'j3', dex: 163, lv: 11, where: 'box' },
      { uid: 'j4', dex: 165, lv: 8, where: 'box' },
      { uid: 'j5', dex: 179, lv: 14, where: 'box' },
      { uid: 'j6', dex: 187, lv: 10, where: 'box' },
    ]
    TR.jDex = new Set(TR.jBox.map((m) => m.dex).concat([162, 172, 175]))
    const now = Date.now()
    const listOut = (dex, want, vis, hoursLeft, lv) => {
      const m = myMons().find((x) => x.dex === dex && x.where === 'box')
      if (!m) return
      A.boxRemove(m.uid)
      if (lv) m.lv = lv
      TR.mine.push({
        id: `M${dex}`,
        code: code(),
        mon: { dex, lv: m.lv, shiny: m.shiny },
        uid: m.uid,
        from: m,
        want,
        vis,
        ends: now + hoursLeft * HOUR,
        at: now - (C().listingDays * 24 - hoursLeft) * HOUR,
      })
    }
    // The plan's example: a Lv.12 Charmander up for a Wartortle.
    listOut(4, { kind: 'species', dex: 8 }, 'public', 50, 12)
    if (S.id !== 'mid') listOut(1, { kind: 'notOwned' }, 'friends', 20)
    if (S.id === 'league') listOut(7, { kind: 'any' }, 'private', 66)
    if (S.id !== 'mid') {
      // Pidgey went in an earlier trade: still in the Pokédex, not in the Box.
      const pg = myMons().find((x) => x.dex === 16 && x.where === 'box')
      if (pg) A.boxRemove(pg.uid)
      TR.done.push({
        dir: 'took',
        other: 'Kai',
        listed: 58,
        gave: { dex: 16, lv: 22 },
        got: { dex: 58, lv: 22 },
        ago: '2 d ago',
      })
      TR.done.push({
        dir: 'taken',
        other: 'Ivy',
        listed: 19,
        gave: { dex: 19, lv: 9 },
        got: { dex: 92, lv: 20 },
        ago: '4 d ago',
        note: 'its minimum',
      })
    }
    TR.used = S.id === 'mid' ? 0 : 1
    $$('#tr-controls [data-trcap]').forEach((x) =>
      x.setAttribute('aria-checked', String(x.dataset.trcap === 'ok')),
    )
    controls()
    refresh()
  }
  HOME.page('trades', {
    render(p) {
      render(p)
      if (!TR.rulesSeen && TR.signed && visible()) setTimeout(rulesPop, 150)
    },
    reset,
    leave: shut,
    dot: null,
  })
  setInterval(() => page() && !page().hidden && rerender(), 60000)
})()
