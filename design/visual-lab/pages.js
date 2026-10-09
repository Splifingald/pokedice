/*
 * Pokédice Visual Lab: the pages behind Home's tab bar (Johto Daybreak, Jersey 20).
 * Team (drag to reorder, the Box with search, sort and type filter), Pokédex (search, filters, where to find),
 * Poké Mart (buy and sell by category) and Upgrades (combos and dice, affordable first). Built on the game's data
 * (assets/game.json, from src/data) and the save Home previews.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, plural, dexIco } = A
  const UI = () => window.PDUI
  const pad3 = (d) => String(d).padStart(3, '0')
  const cap = (s) => s[0].toUpperCase() + s.slice(1)
  const money = (n) => `₽${n.toLocaleString('en-US')}`

  // ------------------------------------------------------------------ what each preview save carries besides Home's
  const EXTRA = {
    mid: {
      bag: {
        'poke-ball': 8,
        'great-ball': 3,
        'ultra-ball': 1,
        potion: 3,
        'super-potion': 2,
        antidote: 1,
        'paralyze-heal': 1,
        ether: 1,
        'moon-stone': 1,
        'rare-candy': 1,
      },
      combos: {
        pair: 4,
        two_pair: 2,
        three_kind: 3,
        small_straight: 1,
        full_house: 1,
        four_kind: 1,
        full_straight: 1,
        five_kind: 1,
      },
      dice: { fire: 3, electric: 2, water: 2, flying: 2, normal: 2, ice: 1, grass: 1, poison: 1 },
      shiny: 129,
    },
    versus: {
      bag: {
        'poke-ball': 14,
        'great-ball': 6,
        'ultra-ball': 5,
        'super-potion': 4,
        'hyper-potion': 2,
        revive: 1,
        ether: 2,
        'max-ether': 1,
        'burn-heal': 1,
        'water-stone': 1,
      },
      combos: {
        pair: 7,
        two_pair: 5,
        three_kind: 6,
        small_straight: 4,
        full_house: 3,
        four_kind: 3,
        full_straight: 2,
        five_kind: 1,
      },
      dice: {
        fire: 6,
        electric: 5,
        water: 5,
        flying: 4,
        normal: 4,
        ice: 3,
        grass: 2,
        poison: 2,
        fighting: 2,
        ground: 2,
      },
      shiny: 129,
    },
    league: {
      bag: {
        'poke-ball': 20,
        'great-ball': 10,
        'ultra-ball': 8,
        'hyper-potion': 4,
        revive: 2,
        'max-revive': 1,
        'max-ether': 2,
        'thunder-stone': 1,
      },
      combos: {
        pair: 9,
        two_pair: 7,
        three_kind: 8,
        small_straight: 6,
        full_house: 5,
        four_kind: 4,
        full_straight: 4,
        five_kind: 2,
      },
      dice: {
        fire: 8,
        electric: 7,
        water: 7,
        flying: 6,
        normal: 5,
        ice: 5,
        grass: 4,
        poison: 3,
        fighting: 3,
        ground: 3,
        psychic: 2,
      },
      shiny: 129,
    },
  }
  let BOX = []
  const ST = {
    boxQ: '',
    boxSort: 'no',
    boxType: 'all',
    dexQ: '',
    dexF: 'all',
    shopTab: 'buy',
    shopCat: 'all',
    open: null,
    qty: 1,
    upTab: 'combos',
    upAfford: false,
  }

  // ------------------------------------------------------------------ species helpers
  const G = () => A.G
  const nameOf = (d) => A.K.names[d] || `#${d}`
  const typesOf = (d) => A.K.types[d] || ['normal']
  const spriteKey = (d) => {
    const k = 'front-' + A.fold(nameOf(d)).replace(/[^a-z]/g, '')
    return PX.SPR.meta[k] ? k : null
  }
  /** The dice and rerolls a species has at a level, milestones applied. */
  function kit(dex, lv) {
    const s = G().mons[dex]
    const dice = []
    for (const [t, n] of s.dice) for (let i = 0; i < n; i++) dice.push(t)
    let rr = s.rr
    for (const [mlv, eff, die, from, amt] of s.ms)
      if (mlv <= lv) {
        if (eff === 'ADD_DIE') dice.push(die)
        else if (eff === 'REPLACE_DIE') {
          const i = dice.indexOf(from)
          if (i >= 0) dice[i] = die
        } else if (eff === 'ADD_REROLL') rr += amt || 1
      }
    return { dice, rr, sp: s.sp, cv: s.cv }
  }
  const DIE_NAME = (t) => (t === 'base' ? 'Base' : G().dice[t].label)
  function milestoneText([lv, eff, die, from, amt], dex) {
    if (eff === 'ADD_DIE') return `+1 ${DIE_NAME(die)} die`
    if (eff === 'REPLACE_DIE') return `${DIE_NAME(from)} die → ${DIE_NAME(die)}`
    if (eff === 'ADD_REROLL') return `+${amt || 1} reroll${(amt || 1) > 1 ? 's' : ''}`
    if (eff === 'EVOLVE') {
      const e = G().mons[dex].evo.find((x) => x[1] === lv)
      return e ? `Evolves into ${nameOf(e[0])}` : 'Evolves'
    }
    return eff
  }
  const evoFrom = (d) => {
    for (const [from, s] of Object.entries(G().mons)) {
      const e = s.evo.find((x) => x[0] === d)
      if (e) return [Number(from), e]
    }
    return null
  }
  // What a status face does, with the game's numbers (src/data/config.json).
  const STATUS_NAME = {
    burn: 'Burn',
    paralyze: 'Paralyze',
    frozen: 'Freeze',
    poison: 'Poison',
    confuse: 'Confuse',
    heal: 'Heal',
  }
  const STATUS_LINE = {
    burn: '1 face burns the foe: −4% HP a turn for 3 turns. Burns stack.',
    paralyze: '2 faces in one roll: the foe misses its next turn.',
    frozen: '3 faces in one roll: the foe is frozen for 2 turns.',
    poison: '2 faces in one roll: the foe loses 10% HP a turn for 3 turns.',
    confuse: '2 faces in one roll: the foe’s next attack hurts it too (20% recoil).',
    heal: '2 faces in one roll: your Pokémon heals by the dice total.',
  }
  const light = (hex) => {
    const [r, g, b] = PX.rgba(hex)
    return 0.299 * r + 0.587 * g + 0.114 * b > 165
  }
  /** A die's six faces as little dice; a status face wears its colour and icon, and says what it does below. */
  function faces(t) {
    const D = G().dice[t],
      col = t === 'base' ? '#f4f6fb' : UI().TYPE[t]
    const st = [...new Set(D.faces.filter(Array.isArray).map((f) => f[1]))]
    const tiles = D.faces
      .map((f) => {
        const s = Array.isArray(f) ? f[1] : null,
          v = Array.isArray(f) ? f[0] : f
        return s
          ? `<i class="st" role="listitem" style="--stc:${UI().STATUS[s]}" aria-label="${v}, ${STATUS_NAME[s]} face"><img class="px" alt="" src="${UI().statusIcon(s, 2)}" />${v}</i>`
          : `<i role="listitem" aria-label="${v}">${v}</i>`
      })
      .join('')
    return `<span class="pg-faces${light(col) ? ' lt' : ''}" role="list" aria-label="${D.label} die faces" style="--c:${col}">${tiles}</span>${st
      .map(
        (s) =>
          `<span class="pg-stline" style="--stc:${UI().STATUS[s]}"><img class="px" alt="" src="${UI().statusIcon(s, 2)}" /><span><b>${STATUS_NAME[s]}</b> ${STATUS_LINE[s]}</span></span>`,
      )
      .join('')}`
  }
  const itemBy = (key) => G().items.find((i) => i.key === key)
  const itemName = (key) => (itemBy(key) || { name: key }).name
  /** Every Pokémon the player owns: the team first, then the Box. */
  const owned = () => [
    ...A.TEAM.map((m, i) => ({ ...m, where: 'team', i })),
    ...BOX.map((b) => ({ ...b, where: 'box' })),
  ]

  function reset() {
    const S = A.SAVE,
      E = EXTRA[S.id]
    S.bag = { ...E.bag }
    S.up = { combos: { ...E.combos }, dice: { ...E.dice } }
    S.dexSeen = false
    ST.open = null
    ST.boxQ = ST.dexQ = ''
    // The Box: everyone caught who isn't in the team or at the Day Care, at the level they were caught.
    const team = new Set(A.TEAM.map((m) => m.dex)),
      care = new Set(S.dayCare.filter(Boolean).map((d) => d.dex))
    const first = {}
    for (const a of [...A.K.areas].sort((x, y) => x.order - y.order))
      for (const w of a.wild || []) if (!first[w.d]) first[w.d] = w
    const r = PX.rng(S.id.length * 97 + 5)
    let at = 0
    BOX = [...A.caught]
      .filter((d) => !team.has(d) && !care.has(d))
      .map((d) => {
        const w = first[d]
        const lv = w ? r.int(w.lv[0], w.lv[1]) : r.int(12, 18)
        const max = A.hpAt(d, lv)
        return { uid: 'b' + d, dex: d, lv, hp: [max, max], xp: r(), shiny: d === E.shiny, at: at++ }
      })
  }

  // ------------------------------------------------------------------ small parts
  const sprCanvas = (d, w = 96, h = 96, cls = '') => {
    const k = spriteKey(d)
    return k
      ? `<canvas class="pg-spr ${cls}" width="${w}" height="${h}" data-key="${k}" data-ph="${(d * 137) % 1000}" aria-hidden="true"></canvas>`
      : `<span class="pg-spr-ico ${cls}">${dexIco(d, 'x2')}</span>`
  }
  const typeBadges = (d) =>
    typesOf(d)
      .map((t) => UI().typeBadge(t))
      .join('')
  const miniDice = (dice) =>
    `<span class="pg-minidice" aria-label="${dice.length} dice">${dice.map((t) => `<i style="--c:${t === 'base' ? '#f4f6fb' : UI().TYPE[t]}"></i>`).join('')}</span>`
  const pips = (lv, max = 10) =>
    `<span class="pg-pips" role="img" aria-label="Level ${lv} of ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>`
  const xpBar = (x) =>
    `<span class="pg-xp" aria-hidden="true"><i style="width:${Math.round(x * 100)}%"></i></span>`
  function bumpGold() {
    A.renderTop()
    const pill = $('#hm-pill')
    pill.classList.remove('bump')
    void pill.offsetWidth
    pill.classList.add('bump')
  }
  /** The shared sheet: title, a line under it, a body and a footer. */
  function sheet(title, sub, body, foot = '') {
    $('#hm-s2-title').textContent = title
    $('#hm-s2-sub').textContent = sub
    $('#hm-s2-body').innerHTML = body
    $('#hm-s2-foot').innerHTML = foot
    $('#hm-s2-foot').hidden = !foot
    const el = $('#hm-sheet2')
    if (el.hidden) A.openDialog(el)
    // New content under the same sheet: keep focus inside it.
    else $('.hm-x', el).focus({ preventScroll: true })
    $('#hm-s2-body').scrollTop = 0
  }

  // ------------------------------------------------------------------ a Pokémon's sheet (Team, Box, Pokédex)
  let MON = null
  function openMon(m) {
    MON = m
    const d = m.dex,
      k = kit(d, m.lv),
      s = G().mons[d]
    const p = m.hp[0] / m.hp[1]
    const groups = []
    for (const t of k.dice) {
      const g = groups.find((x) => x.t === t)
      if (g) g.n++
      else groups.push({ t, n: 1 })
    }
    const dieRows = groups
      .map(({ t, n }) => {
        const D = G().dice[t]
        return `<li class="pg-die"><span class="pg-die-name">${UI().die(t, 6, { size: 26 })}<b>${D.label}</b><em>×${n}</em><small>${esc(D.desc)}</small></span>${faces(t)}</li>`
      })
      .join('')
    const next = s.ms.filter((x) => x[0] > m.lv).slice(0, 3)
    const evo = s.evo.filter((e) => e[2])
    const ahead = next.length
      ? `<ul class="pg-ms">${next.map((x) => `<li><span class="pg-ms-lv">Lv.${x[0]}</span><span>${milestoneText(x, d)}</span><span class="pg-ms-bar"><i style="width:${Math.min(100, Math.round((m.lv / x[0]) * 100))}%"></i></span></li>`).join('')}${evo.map((e) => `<li><span class="pg-ms-lv stone">${A.itemIco(itemBy(e[2]) || { i: -1 })}</span><span>${itemName(e[2])}: evolves into ${nameOf(e[0])}</span></li>`).join('')}</ul>`
      : evo.length
        ? `<ul class="pg-ms">${evo.map((e) => `<li><span class="pg-ms-lv stone">${A.itemIco(itemBy(e[2]) || { i: -1 })}</span><span>${itemName(e[2])}: evolves into ${nameOf(e[0])}</span></li>`).join('')}</ul>`
        : '<p class="hm-d-empty">Nothing more to learn: fully grown.</p>'
    const body = `
      <div class="pg-hero">${sprCanvas(d, 112, 104)}<div class="pg-hero-t"><span class="pg-types">${typeBadges(d)}</span>
        ${m.where === 'dex' ? '' : UI().hp(p, `${m.hp[0]}/${m.hp[1]}`)}
        ${m.where === 'dex' ? '' : `<span class="pg-xpline">${xpBar(m.xp || 0)}<small>XP to Lv.${m.lv + 1}</small></span>`}</div></div>
      <div class="pg-stats"><span><b>${k.sp}</b><small>Speed</small></span><span><b>${k.rr}</b><small>Rerolls</small></span><span><b>${k.cv}</b><small>Catch value</small></span></div>
      <section class="hm-d-sec"><div class="hm-d-h"><h3>Dice</h3><span class="hm-d-hint">${plural(k.dice.length, 'die', 'dice')} a roll</span></div><ul class="pg-dice">${dieRows}</ul></section>
      <section class="hm-d-sec"><div class="hm-d-h"><h3>What’s next</h3></div>${ahead}</section>
      ${m.where === 'dex' ? whereToFind(d) : ''}`
    let foot = ''
    if (m.where === 'team')
      foot = `<div class="pg-foot2">${m.i > 0 ? '<button type="button" class="ui-btn" data-act="lead"><span>Make lead</span></button>' : '<span class="pg-lead-note">Leads the team</span>'}<button type="button" class="ui-btn primary" data-act="item"><span>Use an item</span></button></div>`
    else if (m.where === 'box')
      foot = `<p class="pg-foot-note"><img class="px" alt="" src="${A.icons.LOCK}" />Swap ${esc(nameOf(d))} into your team at a Pokémon Center.</p>`
    sheet(
      `${nameOf(d)}${m.shiny ? ' ★' : ''}`,
      `#${pad3(d)} · Lv.${m.lv}${m.where === 'team' ? (m.i === 0 ? ' · Lead' : ` · Goes out ${['first', 'second', 'third'][m.i]}`) : m.where === 'box' ? ' · In the Box' : ''}`,
      body,
      foot,
    )
  }
  /** Use an item on a team member: what helps it now first; the rest says why not. */
  function openItems(m) {
    const bag = A.SAVE.bag
    const keys = Object.keys(bag).filter((k) => bag[k] > 0)
    const rows = keys
      .map((k) => itemBy(k))
      .filter((it) => (it && ['heal', 'field'].includes(it.group)) || (it && it.eff.kind === 'stone'))
      .map((it) => {
        const e = it.eff
        let ok = true,
          why = ''
        if (e.kind === 'heal')
          ((ok = m.hp[0] > 0 && m.hp[0] < m.hp[1]),
            (why = m.hp[0] === m.hp[1] ? 'Already full' : m.hp[0] === 0 ? 'Fainted: needs a Revive' : ''))
        if (e.kind === 'revive') ((ok = m.hp[0] === 0), (why = ok ? '' : 'Not fainted'))
        if (e.kind === 'stone') {
          const ev = G().mons[m.dex].evo.find((x) => x[2] === it.key)
          ok = !!ev
          why = ev ? `Evolves it into ${nameOf(ev[0])}` : 'No effect on it'
        }
        return `<li><button type="button" class="pg-useit" data-use="${it.key}"${ok ? '' : ' disabled'}>${A.itemIco(it)}<span><b>${esc(it.name)}</b><small>${why || shortEffect(it)}</small></span><em>×${bag[it.key]}</em></button></li>`
      })
      .join('')
    sheet(
      `Use an item`,
      `On ${nameOf(m.dex)} · ${m.hp[0]}/${m.hp[1]} HP`,
      rows
        ? `<ul class="pg-uselist">${rows}</ul>`
        : '<p class="hm-d-empty">No item in your bag helps here. The Poké Mart sells Potions.</p>',
      '<div class="pg-foot2"><button type="button" class="ui-btn" data-act="back"><span>Back</span></button></div>',
    )
  }
  function useItem(key) {
    const m = A.TEAM[MON.i],
      it = itemBy(key),
      e = it.eff
    if (e.kind === 'stone') {
      const ev = G().mons[m.dex].evo.find((x) => x[2] === key)
      A.toast(
        ev
          ? `${m.name} would evolve into ${nameOf(ev[0])}: evolution plays in the full game`
          : `${it.name} has no effect on ${m.name}`,
      )
      return
    }
    if (e.kind === 'heal') m.hp[0] = Math.min(m.hp[1], m.hp[0] + e.amount)
    else if (e.kind === 'revive') m.hp[0] = Math.round((m.hp[1] * e.percent) / 100)
    else if (e.kind === 'level') {
      const was = m.hp[1]
      m.lv += 1
      m.hp[1] = A.hpAt(m.dex, m.lv)
      m.hp[0] += m.hp[1] - was
    }
    A.SAVE.bag[key] -= 1
    A.toast(e.kind === 'level' ? `${m.name} grew to Lv.${m.lv}!` : `${m.name}: ${m.hp[0]}/${m.hp[1]} HP`)
    MON = { ...m, where: 'team', i: MON.i }
    openMon(MON)
    rerender()
  }
  function shortEffect(it) {
    const e = it.eff || {}
    return (
      {
        heal: () => `+${e.amount} HP`,
        revive: () => `Revives at ${e.percent}% HP`,
        cure: () => `Cures ${(e.statuses || []).join(', ')}`,
        rerolls: () => `+${e.amount} reroll${e.amount > 1 ? 's' : ''} in battle`,
        ball: () => `+${e.bonus} to the catch die`,
        stone: () => 'Evolves some Pokémon',
        fossil: () => `Revives as ${nameOf(e.dex)} in ${e.hours} h`,
        level: () => '+1 level',
      }[e.kind]?.() || it.desc
    )
  }

  /** Where a species lives: the areas whose wild pool has it, rarest last, with a GO for the open ones. */
  function whereToFind(d) {
    const rows = A.K.areas
      .map((a) => ({ a, w: (a.wild || []).find((w) => w.d === d) }))
      .filter((x) => x.w)
      .sort((x, y) => y.w.p - x.w.p)
      .map(({ a, w }) => {
        const st = A.statusOf(a),
          locked = st === 'locked'
        const r = w.p <= 2 ? ['rare', 'Rare'] : w.p <= 5 ? ['unc', 'Uncommon'] : ['com', 'Common']
        return `<li class="pg-where st-${st}"><img class="px pg-where-ban" alt="" src="${A.thumbOf(a)}" /><span class="pg-where-t"><b>${esc(a.name)}</b><small><span class="hm-rar ${r[0]}">${r[1]} · ${w.p}%</span> Lv.${w.lv[0]}–${w.lv[1]}${locked ? ` · ${esc(A.lockReason(a))}` : ''}</small></span>${locked ? `<span class="hm-gobtn off" aria-hidden="true"><img class="px" alt="" src="${A.icons.LOCK}" /></span>` : `<button type="button" class="hm-gobtn" data-goarea="${a.order}" aria-label="Go to ${esc(a.name)}">GO</button>`}</li>`
      })
    const from = evoFrom(d)
    const fromLine = from
      ? `<p class="pg-evo-from">${dexIco(from[0])}Evolves from ${esc(nameOf(from[0]))}${from[1][1] ? ` at Lv.${from[1][1]}` : from[1][2] ? ` with a ${esc(itemName(from[1][2]))}` : ''}</p>`
      : ''
    return `<section class="hm-d-sec"><div class="hm-d-h"><h3>Where to find it</h3></div>${rows.length ? `<ul class="pg-wherelist">${rows.join('')}</ul>` : `<p class="hm-d-empty">Not in the wild in Kanto.</p>`}${fromLine}</section>`
  }

  // ------------------------------------------------------------------ Team
  function teamRender(el) {
    const T = A.TEAM
    const boxTypes = [...new Set(BOX.flatMap((b) => typesOf(b.dex)))].sort()
    el.innerHTML = `
      <div class="pg-head"><img class="px pg-h-ico" alt="" src="${A.icons.NAV.team}" /><h2>Team</h2><span class="pg-count">${T.length}/3</span><button type="button" class="pg-hint" data-hint><img class="px" alt="" src="${A.icons.LOCK}" />Swaps at a Center</button></div>
      <ol class="pg-team" aria-label="Your team, in send-out order">${T.map(
        (
          m,
          i,
        ) => `<li><button type="button" class="pg-tm${i === 0 ? ' lead' : ''}" data-tm="${i}" aria-label="${esc(`${m.name}, Lv.${m.lv}, ${m.hp[0]} of ${m.hp[1]} HP, goes out ${['first', 'second', 'third'][i]}. Open`)}">
          <span class="pg-tm-n">${i === 0 ? '<span class="pg-crown" aria-hidden="true"></span>LEAD' : i + 1}</span>
          ${sprCanvas(m.dex, 96, 84)}
          <b class="pg-tm-name">${esc(m.name)}</b><span class="hm-lv">Lv.${m.lv}</span>
          ${UI().hp(m.hp[0] / m.hp[1], `${m.hp[0]}/${m.hp[1]}`)}
          ${xpBar(m.xp || 0)}
          ${miniDice(kit(m.dex, m.lv).dice)}</button></li>`,
      ).join('')}</ol>
      <p class="pg-tip">Drag a card onto another to change the order. The lead goes out first.</p>
      <div class="pg-sec-h"><h3>Box</h3><span class="pg-count">${BOX.length}</span></div>
      <div class="pg-tools"><label class="sr" for="pg-boxq">Search the Box</label><input id="pg-boxq" type="search" placeholder="Search the Box" autocomplete="off" spellcheck="false" value="${esc(ST.boxQ)}" />
        <div class="hm-seg" role="radiogroup" aria-label="Sort the Box">${[
          ['no', 'No.'],
          ['lv', 'Level'],
          ['new', 'New'],
        ]
          .map(
            ([k, l]) =>
              `<button type="button" role="radio" data-bsort="${k}" aria-checked="${ST.boxSort === k}">${l}</button>`,
          )
          .join('')}</div></div>
      <div class="hm-chips pg-typechips" role="radiogroup" aria-label="Filter by type"><button type="button" role="radio" data-btype="all" aria-checked="${ST.boxType === 'all'}">All types</button>${boxTypes
        .map(
          (t) =>
            `<button type="button" role="radio" data-btype="${t}" aria-checked="${ST.boxType === t}"><i class="pg-tdot" style="--c:${UI().TYPE[t]}"></i>${cap(t)}</button>`,
        )
        .join('')}</div>
      <ul class="pg-box" id="pg-box"></ul>`
    boxList()
  }
  function boxList() {
    const q = A.fold(ST.boxQ.trim())
    let list = BOX.filter(
      (b) =>
        (!q || A.fold(nameOf(b.dex)).includes(q)) &&
        (ST.boxType === 'all' || typesOf(b.dex).includes(ST.boxType)),
    )
    if (ST.boxSort === 'lv') list.sort((a, b) => b.lv - a.lv || a.dex - b.dex)
    else if (ST.boxSort === 'new') list.sort((a, b) => b.at - a.at)
    else list.sort((a, b) => a.dex - b.dex)
    const newest = new Set(
      [...BOX]
        .sort((a, b) => b.at - a.at)
        .slice(0, 3)
        .map((b) => b.uid),
    )
    $('#pg-box').innerHTML = list.length
      ? list
          .map(
            (b) =>
              `<li><button type="button" class="pg-bx" data-uid="${b.uid}" aria-label="${esc(`${nameOf(b.dex)}${b.shiny ? ', shiny' : ''}, Lv.${b.lv}`)}">${dexIco(b.dex)}<b>${esc(nameOf(b.dex))}</b><span>Lv.${b.lv}</span>${b.shiny ? '<em class="pg-shiny" aria-hidden="true">★</em>' : ''}${newest.has(b.uid) ? '<em class="pg-new">NEW</em>' : ''}</button></li>`,
          )
          .join('')
      : `<li class="hm-empty">Nothing in the Box matches.</li>`
  }
  // Drag a team card onto another to swap them; a plain tap opens the sheet.
  function teamDrag(el) {
    let drag = null
    el.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.pg-tm')
      if (!card || e.button > 0) return
      drag = { card, i: Number(card.dataset.tm), x: e.clientX, y: e.clientY, on: false, over: null }
      card.setPointerCapture(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (!drag) return
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y
      if (!drag.on && Math.hypot(dx, dy) < 8) return
      drag.on = true
      drag.card.classList.add('dragging')
      drag.card.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-4, Math.min(4, dx / 20))}deg)`
      drag.card.style.pointerEvents = 'none'
      const under = document.elementFromPoint(e.clientX, e.clientY)
      const over = under && under.closest('.pg-tm')
      $$('.pg-tm.over', el).forEach((c) => c !== over && c.classList.remove('over'))
      drag.over = over && over !== drag.card ? over : null
      if (drag.over) drag.over.classList.add('over')
    })
    const end = (e, cancel) => {
      if (!drag) return
      const d = drag
      drag = null
      d.card.style.transform = ''
      d.card.style.pointerEvents = ''
      d.card.classList.remove('dragging')
      $$('.pg-tm.over', el).forEach((c) => c.classList.remove('over'))
      if (cancel) return
      if (!d.on) {
        const m = A.TEAM[d.i]
        return openMon({ ...m, where: 'team', i: d.i })
      }
      if (d.over) swapTeam(d.i, Number(d.over.dataset.tm))
    }
    el.addEventListener('pointerup', (e) => end(e, false))
    el.addEventListener('pointercancel', (e) => end(e, true))
  }
  function swapTeam(i, j) {
    const T = A.TEAM
    ;[T[i], T[j]] = [T[j], T[i]]
    rerender()
    A.toast(i === 0 || j === 0 ? `${T[0].name} leads now` : `${T[i].name} and ${T[j].name} swapped`)
  }

  // ------------------------------------------------------------------ Pokédex
  /** Catchable now: in the wild pool of an area that's open, and not caught yet. */
  function nearby() {
    const out = new Set()
    for (const a of A.K.areas)
      if (A.statusOf(a) !== 'locked') for (const w of a.wild || []) if (!A.caught.has(w.d)) out.add(w.d)
    return out
  }
  function dexRender(el) {
    const n = A.caught.size
    const near = nearby()
    const counts = { all: 151, caught: n, missing: 151 - n, near: near.size }
    const fi = A.K.areas.find((a) => a.name === 'Faraway Island')
    const newest = [...A.caught].pop()
    el.innerHTML = `
      <div class="pg-head"><img class="px pg-h-ico" alt="" src="${A.icons.NAV.dex}" /><h2>Pokédex</h2><span class="pg-count">${n}/151</span></div>
      <div class="pg-progress"><span class="hm-meter" role="img" aria-label="${n} of 151 caught"><i style="width:${(n / 151) * 100}%"></i></span><small>${n >= 150 ? 'Faraway Island is open' : `${150 - n} more and ${esc(fi.name)} opens`}</small></div>
      <div class="pg-tools"><label class="sr" for="pg-dexq">Search by name or number</label><input id="pg-dexq" type="search" placeholder="Name or number" autocomplete="off" spellcheck="false" value="${esc(ST.dexQ)}" inputmode="search" /></div>
      <div class="hm-chips" role="radiogroup" aria-label="Show">${[
        ['all', 'All'],
        ['caught', 'Caught'],
        ['missing', 'Missing'],
        ['near', 'Nearby'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="radio" data-dexf="${k}" aria-checked="${ST.dexF === k}">${l} <i>${counts[k]}</i></button>`,
        )
        .join('')}</div>
      <ul class="pg-dex" id="pg-dex"></ul>`
    dexList(near, A.SAVE.dexSeen ? null : newest)
    if (!A.SAVE.dexSeen) {
      A.SAVE.dexSeen = true
      A.renderNavDots()
    }
  }
  function dexList(near = nearby(), fresh = null) {
    const q = ST.dexQ.trim()
    const num = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null
    const fq = A.fold(q)
    let list = Array.from({ length: 151 }, (_, i) => i + 1)
    if (ST.dexF === 'caught') list = list.filter((d) => A.caught.has(d))
    if (ST.dexF === 'missing') list = list.filter((d) => !A.caught.has(d))
    if (ST.dexF === 'near') list = list.filter((d) => near.has(d))
    // A number finds anything; a name only finds what you've caught (the rest is still ???).
    if (num != null) list = list.filter((d) => String(d).startsWith(String(num)))
    else if (fq) list = list.filter((d) => A.caught.has(d) && A.fold(nameOf(d)).includes(fq))
    $('#pg-dex').innerHTML = list.length
      ? list
          .map((d) => {
            const got = A.caught.has(d)
            return `<li><button type="button" class="pg-dx${got ? '' : ' miss'}" data-dex="${d}" aria-label="${got ? esc(nameOf(d)) : 'Unknown'}, number ${d}${near.has(d) ? ', nearby' : ''}">${dexIco(d)}<span class="pg-dx-n">#${pad3(d)}</span><b>${got ? esc(nameOf(d)) : '???'}</b>${near.has(d) ? '<em class="pg-near">Nearby</em>' : ''}${fresh === d ? '<em class="pg-new">NEW</em>' : ''}</button></li>`
          })
          .join('')
      : `<li class="hm-empty">${num == null && fq ? 'Only Pokémon you’ve caught can be found by name. Try a number.' : 'Nothing here.'}</li>`
  }
  function openDex(d) {
    if (A.caught.has(d)) {
      const mine = owned().filter((m) => m.dex === d)
      const best = mine.sort((a, b) => b.lv - a.lv)[0]
      return openMon(best ? { ...best, where: 'dex' } : { dex: d, lv: 5, hp: [1, 1], where: 'dex' })
    }
    sheet(
      '???',
      `#${pad3(d)} · Not caught yet`,
      `<div class="pg-hero miss"><span class="pg-spr-ico">${dexIco(d, 'x2')}</span><div class="pg-hero-t"><p class="pg-miss-t">Catch it to learn its name, dice and how it grows.</p></div></div>${whereToFind(d)}`,
    )
  }

  // ------------------------------------------------------------------ Poké Mart
  const CATS = [
    ['ball', 'Balls'],
    ['heal', 'Healing'],
    ['battle', 'Battle'],
    ['cure', 'Cures'],
    ['stone', 'Stones'],
    ['fossil', 'Fossils'],
  ]
  function shopRender(el) {
    const S = A.SAVE
    const tab = ST.shopTab
    el.innerHTML = `
      <div class="pg-head"><img class="px pg-h-ico" alt="" src="${A.icons.NAV.shop}" /><h2>Poké Mart</h2><span class="pg-wallet"><img class="px" alt="" src="${A.icons.COIN}" />${money(S.gold)}</span></div>
      <div class="hm-seg pg-tabs" role="tablist" aria-label="Poké Mart">${[
        ['buy', 'Buy'],
        ['sell', 'Sell'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="tab" data-shoptab="${k}" aria-selected="${tab === k}">${l}</button>`,
        )
        .join('')}</div>
      <div class="hm-chips" role="radiogroup" aria-label="Category"><button type="button" role="radio" data-cat="all" aria-checked="${ST.shopCat === 'all'}">All</button>${CATS.filter(
        ([k]) => G().items.some((i) => i.group === k && (tab === 'sell' ? (S.bag[i.key] || 0) > 0 : i.shop)),
      )
        .map(
          ([k, l]) =>
            `<button type="button" role="radio" data-cat="${k}" aria-checked="${ST.shopCat === k}">${l}</button>`,
        )
        .join('')}</div>
      <div id="pg-shoplist">${tab === 'buy' ? buyList() : sellList()}</div>`
  }
  const inCat = (it) => ST.shopCat === 'all' || it.group === ST.shopCat
  const catOrder = (it) => CATS.findIndex(([k]) => k === it.group)
  function buyList() {
    const S = A.SAVE
    const open = G()
      .items.filter((i) => i.shop && i.badges <= S.badges && inCat(i))
      .sort((a, b) => catOrder(a) - catOrder(b) || a.price - b.price)
    const later = G()
      .items.filter((i) => i.shop && i.badges > S.badges && inCat(i))
      .sort((a, b) => a.badges - b.badges)
    const row = (it) => {
      const isOpen = ST.open === it.key
      const total = it.price * ST.qty
      const can = total <= S.gold
      return `<li class="pg-it${isOpen ? ' open' : ''}${it.price > S.gold ? ' poor' : ''}">
        <button type="button" class="pg-it-main" data-item="${it.key}" aria-expanded="${isOpen}">${A.itemIco(it)}<span class="pg-it-t"><b>${esc(it.name)}</b><small>${esc(shortEffect(it))}</small></span>${S.bag[it.key] ? `<em class="pg-own">×${S.bag[it.key]}</em>` : ''}<span class="pg-price">${money(it.price)}</span></button>
        ${
          isOpen
            ? `<div class="pg-it-more"><p>${esc(it.desc)}</p><div class="pg-buyrow"><div class="hm-seg" role="radiogroup" aria-label="How many">${[
                1, 5, 10,
              ]
                .map(
                  (q) =>
                    `<button type="button" role="radio" data-qty="${q}" aria-checked="${ST.qty === q}">×${q}</button>`,
                )
                .join(
                  '',
                )}</div><button type="button" class="ui-btn${can ? ' primary' : ''} pg-buy" data-buy="${it.key}"${can ? '' : ' disabled'}><span>${can ? `Buy ${money(total)}` : `Need ${money(total - S.gold)} more`}</span></button></div></div>`
            : ''
        }</li>`
    }
    return `<ul class="pg-items">${open.map(row).join('') || '<li class="hm-empty">Nothing in this category yet.</li>'}</ul>${
      later.length
        ? `<div class="pg-sec-h"><h3>Coming later</h3></div><ul class="pg-items later">${later.map((it) => `<li class="pg-it locked"><span class="pg-it-main">${A.itemIco(it)}<span class="pg-it-t"><b>${esc(it.name)}</b><small>${esc(shortEffect(it))}</small></span><span class="pg-lockbadge"><img class="px" alt="" src="${A.icons.BADGE}" />${it.badges} badges</span></span></li>`).join('')}</ul>`
        : ''
    }`
  }
  function sellList() {
    const S = A.SAVE
    const keys = Object.keys(S.bag).filter((k) => S.bag[k] > 0)
    const items = keys
      .map((k) => itemBy(k))
      .filter((i) => i && inCat(i))
      .sort((a, b) => catOrder(a) - catOrder(b) || b.price - a.price)
    if (!items.length) return '<p class="hm-d-empty">Your bag is empty here.</p>'
    return `<p class="pg-note">The Mart buys back what it sells, at half price.</p><ul class="pg-items">${items
      .map((it) => {
        const n = S.bag[it.key]
        const sellable = it.shop
        const unit = Math.floor(it.price / 2)
        const isOpen = ST.open === it.key && sellable
        const q = ST.qty === 'all' ? n : Math.min(ST.qty, n)
        return `<li class="pg-it${isOpen ? ' open' : ''}${sellable ? '' : ' locked'}">
          <button type="button" class="pg-it-main" data-item="${it.key}" ${sellable ? `aria-expanded="${isOpen}"` : 'disabled'}>${A.itemIco(it)}<span class="pg-it-t"><b>${esc(it.name)}</b><small>${sellable ? `${money(unit)} each` : 'Can’t sell'}</small></span><em class="pg-own">×${n}</em>${sellable ? `<span class="pg-price sell">+${money(unit)}</span>` : ''}</button>
          ${
            isOpen
              ? `<div class="pg-it-more"><div class="pg-buyrow"><div class="hm-seg" role="radiogroup" aria-label="How many">${[
                  1, 5,
                ]
                  .filter((x) => x <= n)
                  .map(
                    (x) =>
                      `<button type="button" role="radio" data-qty="${x}" aria-checked="${ST.qty === x}">×${x}</button>`,
                  )
                  .join(
                    '',
                  )}<button type="button" role="radio" data-qty="all" aria-checked="${ST.qty === 'all'}">All ×${n}</button></div><button type="button" class="ui-btn primary pg-buy" data-sell="${it.key}"><span>Sell +${money(unit * q)}</span></button></div></div>`
              : ''
          }</li>`
      })
      .join('')}</ul>`
  }

  // ------------------------------------------------------------------ Upgrades
  const COMBO_EX = {
    pair: [4, 4],
    two_pair: [2, 2, 5, 5],
    three_kind: [3, 3, 3],
    small_straight: [2, 3, 4, 5],
    full_house: [6, 6, 6, 2, 2],
    four_kind: [5, 5, 5, 5],
    full_straight: [1, 2, 3, 4, 5],
    five_kind: [6, 6, 6, 6, 6],
  }
  /** Every upgrade the player could buy right now, with its state. */
  function upgrades() {
    const S = A.SAVE,
      g = G()
    const mine = owned()
    const maxDice = Math.max(...mine.map((m) => kit(m.dex, m.lv).dice.length))
    const dieCount = {}
    for (const m of mine) for (const t of new Set(kit(m.dex, m.lv).dice)) dieCount[t] = (dieCount[t] || 0) + 1
    const combos = g.combos.map((c) => {
      const lv = S.up.combos[c.key] || 1
      const locked = maxDice < c.min
      return {
        kind: 'combo',
        key: c.key,
        name: c.name,
        lv,
        bonus: c.bonus,
        cost: lv < 10 ? c.cost[lv] : null,
        locked,
        why: locked ? `Needs a Pokémon with ${c.min}+ dice (yours throw up to ${maxDice})` : '',
        ex: COMBO_EX[c.key],
      }
    })
    const dice = Object.entries(g.dice)
      .filter(([t, d]) => d.up)
      .map(([t, d]) => {
        const lv = S.up.dice[t] || 1
        const n = dieCount[t] || 0
        return {
          kind: 'die',
          key: t,
          name: `${d.label} die`,
          lv,
          bonus: g.dieTrack.bonus,
          cost: lv < 10 ? g.dieTrack.cost[lv] : null,
          locked: !n,
          why: n ? '' : 'None of your Pokémon has this die yet',
          n,
        }
      })
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    return { combos, dice }
  }
  const affordable = (u) => !u.locked && u.cost != null && u.cost <= A.SAVE.gold
  function upRender(el) {
    const U = upgrades()
    const can = [...U.combos, ...U.dice].filter(affordable).length
    const list = U[ST.upTab].filter((u) => !ST.upAfford || affordable(u))
    const open = list.filter((u) => !u.locked),
      locked = list.filter((u) => u.locked)
    el.innerHTML = `
      <div class="pg-head"><img class="px pg-h-ico" alt="" src="${A.icons.NAV.upgrades}" /><h2>Upgrades</h2><span class="pg-wallet"><img class="px" alt="" src="${A.icons.COIN}" />${money(A.SAVE.gold)}</span></div>
      <div class="hm-seg pg-tabs" role="tablist" aria-label="Upgrades">${[
        ['combos', 'Combos'],
        ['dice', 'Dice'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" role="tab" data-uptab="${k}" aria-selected="${ST.upTab === k}">${l} <i>${U[k].filter(affordable).length || ''}</i></button>`,
        )
        .join('')}</div>
      <div class="pg-tools"><p class="pg-note">${ST.upTab === 'combos' ? 'A combo adds its bonus to the damage of any roll that makes it.' : 'Each level adds damage to every die of that type you roll.'}</p>
        <button type="button" class="pg-toggle" data-afford aria-pressed="${ST.upAfford}">Affordable <i>${can}</i></button></div>
      <ul class="pg-ups">${open.map(upCard).join('') || '<li class="hm-empty">Nothing you can afford here yet.</li>'}</ul>
      ${locked.length ? `<details class="pg-locked"><summary>${plural(locked.length, 'locked upgrade')}</summary><ul class="pg-ups">${locked.map(upCard).join('')}</ul></details>` : ''}`
  }
  function upCard(u) {
    const S = A.SAVE
    const now = u.bonus[u.lv - 1],
      next = u.lv < 10 ? u.bonus[u.lv] : null
    const can = affordable(u)
    const visual =
      u.kind === 'combo'
        ? `<span class="pg-ex">${u.ex.map((v) => UI().die('base', v, { size: 22 })).join('')}</span>`
        : `<span class="pg-ex"><small>${u.n ? `on ${plural(u.n, 'Pokémon', 'Pokémon')}` : ''}</small></span>`
    const btn = u.locked
      ? `<span class="pg-upbtn off"><img class="px" alt="" src="${A.icons.LOCK}" />Locked</span>`
      : u.cost == null
        ? '<span class="pg-upbtn max">MAX</span>'
        : `<button type="button" class="pg-upbtn${can ? '' : ' poor'}" data-up="${u.kind}:${u.key}" ${can ? '' : 'aria-disabled="true"'} aria-label="Upgrade ${esc(u.name)} to level ${u.lv + 1} for ${u.cost} Pokédollars${can ? '' : ', not enough Pokédollars'}"><b>${money(u.cost)}</b><small>${can ? 'Upgrade' : `need ${money(u.cost - S.gold)}`}</small></button>`
    return `<li class="pg-up${u.locked ? ' locked' : ''}${can ? ' can' : ''}" data-key="${u.kind}:${u.key}">
      <div class="pg-up-top">${u.kind === 'die' ? UI().die(u.key, 6, { size: 26 }) : ''}<span class="pg-up-name"><b>${esc(u.name)}</b>${u.kind === 'die' ? `<small>${esc(G().dice[u.key].desc)}</small>` : ''}</span>${visual}</div>
      ${u.kind === 'die' ? faces(u.key) : ''}
      <div class="pg-up-mid">${pips(u.lv)}<span class="pg-up-lv">Lv.${u.lv}</span></div>
      <div class="pg-up-bot"><span class="pg-up-bonus">${u.kind === 'combo' ? `+${now} damage` : `+${now} a die`}${next != null ? ` <span class="pg-arrow">→</span> <em>+${next}</em>` : ''}</span>${btn}</div>
      ${u.locked ? `<p class="pg-up-why">${esc(u.why)}</p>` : ''}</li>`
  }
  function buyUpgrade(id) {
    const [kind, key] = id.split(':')
    const U = upgrades()
    const u = (kind === 'combo' ? U.combos : U.dice).find((x) => x.key === key)
    if (!affordable(u))
      return A.toast(u.cost != null ? `Need ${money(u.cost - A.SAVE.gold)} more` : 'Already at its best')
    A.SAVE.gold -= u.cost
    A.SAVE.up[kind === 'combo' ? 'combos' : 'dice'][key] = u.lv + 1
    bumpGold()
    rerender()
    const on = $$(`.pg-up[data-key="${id}"] .pg-pips i.on`)
    if (on.length) on[on.length - 1].classList.add('pop')
    A.toast(`${u.name} Lv.${u.lv + 1}: +${u.bonus[u.lv]}${kind === 'combo' ? ' damage' : ' a die'}`)
  }

  // ------------------------------------------------------------------ wiring
  const RENDER = { team: teamRender, dex: dexRender, shop: shopRender, upgrades: upRender }
  let current = null
  function rerender() {
    const el = $('.hm-page:not([hidden])')
    if (!el || !RENDER[el.dataset.page]) return
    const y = el.scrollTop
    const focus = document.activeElement && document.activeElement.id
    RENDER[el.dataset.page](el)
    el.scrollTop = y
    if (focus && $('#' + focus)) $('#' + focus).focus({ preventScroll: true })
    A.renderNavDots()
  }
  function bindPage(el, id) {
    if (el.dataset.bound) return
    el.dataset.bound = '1'
    if (id === 'team') teamDrag(el)
    el.addEventListener('click', (e) => {
      const t = e.target
      const q = (s) => t.closest(s)
      let b
      if (q('[data-hint]'))
        return A.toast('Team changes happen at a Pokémon Center, or when a catch offers a swap')
      // Taps on team cards go through the drag handler; Enter and Space arrive here as clicks with no pointer.
      if ((b = q('[data-tm]')) && e.detail === 0)
        return openMon({ ...A.TEAM[Number(b.dataset.tm)], where: 'team', i: Number(b.dataset.tm) })
      if ((b = q('[data-uid]'))) return openMon({ ...BOX.find((x) => x.uid === b.dataset.uid), where: 'box' })
      if ((b = q('[data-bsort]'))) return ((ST.boxSort = b.dataset.bsort), rerender())
      if ((b = q('[data-btype]'))) return ((ST.boxType = b.dataset.btype), rerender())
      if ((b = q('[data-dexf]'))) return ((ST.dexF = b.dataset.dexf), rerender())
      if ((b = q('[data-dex]'))) return openDex(Number(b.dataset.dex))
      if ((b = q('[data-shoptab]')))
        return (
          (ST.shopTab = b.dataset.shoptab),
          (ST.open = null),
          (ST.qty = 1),
          (ST.shopCat = 'all'),
          rerender()
        )
      if ((b = q('[data-cat]'))) return ((ST.shopCat = b.dataset.cat), (ST.open = null), rerender())
      if ((b = q('[data-qty]')))
        return ((ST.qty = b.dataset.qty === 'all' ? 'all' : Number(b.dataset.qty)), rerender())
      if ((b = q('[data-item]'))) {
        ST.open = ST.open === b.dataset.item ? null : b.dataset.item
        ST.qty = 1
        return rerender()
      }
      if ((b = q('[data-buy]'))) {
        const it = itemBy(b.dataset.buy),
          total = it.price * ST.qty
        if (total > A.SAVE.gold) return
        A.SAVE.gold -= total
        A.SAVE.bag[it.key] = (A.SAVE.bag[it.key] || 0) + ST.qty
        bumpGold()
        rerender()
        return A.toast(`+${ST.qty} ${it.name}${ST.qty > 1 ? 's' : ''} · ${money(A.SAVE.gold)} left`)
      }
      if ((b = q('[data-sell]'))) {
        const it = itemBy(b.dataset.sell),
          n = A.SAVE.bag[it.key],
          k = ST.qty === 'all' ? n : Math.min(ST.qty, n),
          gain = Math.floor(it.price / 2) * k
        A.SAVE.bag[it.key] = n - k
        A.SAVE.gold += gain
        if (!A.SAVE.bag[it.key]) ST.open = null
        bumpGold()
        rerender()
        return A.toast(`Sold ${k} ${it.name}${k > 1 ? 's' : ''} · +${money(gain)}`)
      }
      if ((b = q('[data-uptab]'))) return ((ST.upTab = b.dataset.uptab), rerender())
      if (q('[data-afford]')) return ((ST.upAfford = !ST.upAfford), rerender())
      if ((b = q('[data-up]'))) return buyUpgrade(b.dataset.up)
    })
    el.addEventListener('input', (e) => {
      if (e.target.id === 'pg-boxq') {
        ST.boxQ = e.target.value
        boxList()
      }
      if (e.target.id === 'pg-dexq') {
        ST.dexQ = e.target.value
        // A search looks through the whole Pokédex.
        if (ST.dexQ.trim() && ST.dexF !== 'all') {
          ST.dexF = 'all'
          $$('[data-dexf]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dexf === 'all')))
        }
        dexList()
      }
    })
  }
  // The shared sheet's own buttons.
  function bindSheet() {
    $('#hm-sheet2').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act], [data-use], [data-goarea]')
      if (!b) return
      if (b.dataset.goarea) return A.goToArea(Number(b.dataset.goarea))
      if (b.dataset.use) return useItem(b.dataset.use)
      const act = b.dataset.act
      if (act === 'lead') {
        const T = A.TEAM,
          [m] = T.splice(MON.i, 1)
        T.unshift(m)
        A.closeAll()
        rerender()
        return A.toast(`${m.name} leads now`)
      }
      if (act === 'item') return openItems(A.TEAM[MON.i] && { ...A.TEAM[MON.i], i: MON.i })
      if (act === 'back') return openMon({ ...A.TEAM[MON.i], where: 'team', i: MON.i })
    })
  }

  // Animated sprites on the cards and in the sheet.
  function tick(now) {
    for (const c of $$('canvas.pg-spr')) {
      if (!c.offsetParent) continue
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, c.width, c.height)
      PX.softEllipse(g, c.width / 2, c.height - 5, Math.round(c.width * 0.26), 3, '#24304f', 0.35, 0.8)
      PX.sprite(
        g,
        c.dataset.key,
        Math.round(c.width / 2),
        c.height - 5,
        A.REDUCED ? 0 : now + Number(c.dataset.ph || 0),
        {},
      )
    }
    requestAnimationFrame(tick)
  }

  for (const [id, render] of Object.entries(RENDER))
    HOME.page(id, {
      render(el) {
        bindPage(el, id)
        current = id
        render(el)
      },
      reset: id === 'team' ? reset : null,
      dot:
        id === 'upgrades'
          ? () => {
              if (!A.SAVE.up) return null
              const U = upgrades()
              const n = [...U.combos, ...U.dice].filter(affordable).length
              return n
                ? { text: n > 9 ? '9+' : String(n), label: `${plural(n, 'upgrade')} you can afford` }
                : null
            }
          : id === 'dex'
            ? () => (A.SAVE.dexSeen ? null : { text: 'NEW', gold: true, label: 'A new Pokédex entry' })
            : null,
    })
  const ready = () => {
    bindSheet()
    requestAnimationFrame(tick)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready)
  else ready()
  void current
})()
