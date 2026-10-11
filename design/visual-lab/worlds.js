/*
 * Pokédice Visual Lab: Small worlds (event type 5, priority 1). The plan is docs/21-SMALL-WORLDS-PLAN.md.
 * A time-limited themed region built in the admin, where the shiny mythicals are won: a fresh start on one of three
 * starters, its own areas (some opening on a date), its own ₽ and Mart, XP ×5, dice by level (no upgrades), booster
 * types for both sides, and at the end a fight against a shiny mythical. Only the mythical is kept.
 * The admin mock beside the phone edits the same world the phone shows (SW.world).
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco } = A
  const SND = () => PX.Sound
  const HOUR = 3600e3
  const DAY = 24 * HOUR
  const money = (n) => `₽${Math.round(n).toLocaleString('en-US')}`
  const ITEM = (key) => A.G.items.find((i) => i.key === key)
  const ART = { evening: 52, modern: 50, 'lair-island': 50, 'lair-shrine': 56, 'lair-summit': 50, champion: 62, league: 56, marsh: 55 }
  const art = (k) => `assets/ev/art/${k}.png`
  const TYPE_COL = { psychic: '#f85888', ghost: '#705898', fire: '#f08030', grass: '#78c850', water: '#6890f0', electric: '#f8d030', dragon: '#7038f8', ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0' }
  const cap = (s) => s[0].toUpperCase() + s.slice(1)

  // ------------------------------------------------------------------ the admin's world
  const SW = {
    access: 'all', // off · admin · all
    phase: 'outside', // none · outside · inside
    time: 'mid', // start · mid · last
    picked: null,
    seen: false,
    gold: 0,
    mainGold: null,
    here: 3,
    caught: false,
    tries: 0,
    bought: {},
    world: {
      name: 'Mirage Island',
      banner: 'lair-island',
      theme: { main: '#5b3a9e', accent: '#ff6f9c', ground: '#efe6fb' },
      minBadges: 3,
      days: 10,
      starters: [63, 92, 79],
      xp: 5,
      boosters: [
        { type: 'psychic', mult: 1.5 },
        { type: 'ghost', mult: 1.5 },
      ],
      shop: [
        { key: 'great-ball', price: 60, limit: null },
        { key: 'ultra-ball', price: 150, limit: 10 },
        { key: 'rare-candy', price: 400, limit: 5 },
        { key: 'max-revive', price: 350, limit: 3 },
      ],
      mythical: { dex: 151, level: 60 },
      areas: [
        { name: 'Mirage Marsh', art: 'marsh', lv: [5, 12], opens: null },
        { name: 'Twilight Path', art: 'evening', lv: [12, 20], opens: null },
        { name: 'Echo Town', art: 'modern', lv: [20, 30], opens: null },
        { name: 'Spirit Shrine', art: 'lair-shrine', lv: [30, 40], opens: 3 },
        { name: 'Dream Peak', art: 'lair-summit', lv: [40, 50], opens: 6 },
        { name: 'Mirage Island', art: 'lair-island', lv: [60, 60], opens: null, final: true },
      ],
    },
  }
  const W = () => SW.world
  // The world's clock: started SW.start, lasting W().days; the preview bar picks how far in.
  function clock() {
    const D = W().days * DAY
    const done = SW.time === 'start' ? 2 * HOUR : SW.time === 'last' ? D - 11 * HOUR : D / 2
    SW.start = Date.now() - done
    SW.end = SW.start + D
  }
  const left = () => Math.max(0, SW.end - Date.now())
  const frac = () => left() / (SW.end - SW.start)
  function dur(ms) {
    const m = Math.max(1, Math.ceil(ms / 60000))
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
    return h % 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h / 24}d`
  }
  const when = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const visible = () => SW.access === 'all' || (SW.access === 'admin' && SW.asAdmin)
  // Progress: how many areas are cleared, by the clock (the preview bar's "how far in").
  const cleared = () => (SW.time === 'start' ? 0 : SW.time === 'mid' ? 3 : 5)
  const opensAt = (a) => (a.opens == null ? null : SW.start + a.opens * DAY)
  function stateOf(i) {
    const a = W().areas[i]
    const c = cleared()
    if (i < c) return 'cleared'
    const date = opensAt(a)
    if (date != null && date > Date.now()) return 'date'
    if (i > c) return 'locked'
    return i === SW.here ? 'here' : 'next'
  }
  const typeChip = (t, x) => `<span class="sw-type" style="--c:${TYPE_COL[t] || '#888'}">${cap(t)}${x ? ` ×${x}` : ''}</span>`
  const gauge = (hot) => `<span class="lv-gauge${hot ? ' hot' : ''}" aria-hidden="true"><i style="width:${(frac() * 100).toFixed(1)}%"></i></span>`
  const themeVars = () => `--w-main:${W().theme.main};--w-accent:${W().theme.accent};--w-ground:${W().theme.ground}`
  const silhouette = (big) =>
    `<img class="px sw-sil${SW.caught ? ' got' : ''}${big ? ' big' : ''}" alt="" src="assets/ev/151_front${SW.caught ? '_shiny' : ''}.png" />`

  // ------------------------------------------------------------------ outside: the Home square (priority 1)
  function squareHTML() {
    const n = W().areas.length
    const hot = left() < DAY
    const label = `Small world: ${W().name}. ${cleared()} of ${n} areas cleared. Ends in ${dur(left())}. ${SW.picked ? 'Enter' : 'Open'}`
    return `<button type="button" class="hm-w lv-w sw-w${hot ? ' hot' : ''}" data-sw="enter" aria-label="${esc(label)}" style="--art:url(${art(W().banner)});--pos:${ART[W().banner] ?? 50}%;${themeVars()}">
      <span class="lv-w-top"><span class="sw-tag">WORLD</span><span class="sw-tag star">✦ SHINY ${esc(A.K.names[W().mythical.dex])}</span></span>
      <span class="sw-w-mon">${silhouette(false)}<span class="lv-fx-spk" aria-hidden="true"><i></i><i></i><i></i></span></span>
      <span class="lv-w-bot"><b class="lv-w-title">${esc(W().name)}</b><small class="lv-w-sub">Areas ${cleared()}/${n} · ${SW.picked ? 'your ' + esc(A.K.names[SW.picked]) : 'fresh start'}</small>
        <span class="lv-time">Ends in ${dur(left())}</span>${gauge(hot)}</span></button>`
  }
  A.worldWidget = () => (SW.phase === 'outside' && visible() ? squareHTML() : '')

  // ------------------------------------------------------------------ the pop-up
  const rules = () => [
    ['xp', `XP ×${W().xp}`, `Your Pokémon grow ${W().xp} times faster here.`],
    ['dice', 'Dice follow the level', 'No upgrades: dice and combos are the level ÷ 10 (Lv.30 = 3), for every Pokémon here.'],
    ['boost', `${W().boosters.map((b) => cap(b.type)).join(' and ')} ×${W().boosters[0]?.mult ?? 1}`, 'Their hits do more damage, yours and the foes’.'],
    ['myth', `A shiny ${A.K.names[W().mythical.dex]} at the end`, 'Beat it and catch it: it’s yours to keep. Everything else stays in the world.'],
  ]
  function ruleIco(k) {
    if (k === 'xp') return '<span class="ev-ri-i">×5</span>'
    if (k === 'dice') return '<span class="sw-die" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i><b></b><i></i><b></b><i></i></span>'
    if (k === 'boost') return `<span class="sw-dot" style="background:${TYPE_COL[W().boosters[0]?.type] || '#888'}"></span>`
    return dexIco(W().mythical.dex)
  }
  function popup() {
    const ov = overlay()
    ov.innerHTML = `<div class="ev-pop lv-pop sw-pop" role="dialog" aria-modal="true" aria-labelledby="sw-pop-t" style="${themeVars()}">
      <div class="ev-pop-banner" style="--art:url(${art(W().banner)});--pos:${ART[W().banner] ?? 50}%">${silhouette(true)}<span class="lv-fx-spk big" aria-hidden="true">${'<i></i>'.repeat(6)}</span><span class="ev-pop-tag sw-pop-tag">SMALL WORLD</span></div>
      <h3 id="sw-pop-t">${esc(W().name)}</h3>
      <div class="lv-pop-when"><span><b>${dur(left())} left</b> · until ${esc(when(SW.end))}</span>${gauge(left() < DAY)}</div>
      <ul class="ev-rules">${rules().map(([k, h, t]) => `<li><span class="ev-ri">${ruleIco(k)}</span><span><b>${esc(h)}</b><small>${esc(t)}</small></span></li>`).join('')}</ul>
      <div class="ev-pop-foot"><button type="button" class="ui-btn" data-sw-close><span>Later</span></button><button type="button" class="ui-btn primary sw-btn" data-sw="enter"><span>Enter</span></button></div></div>`
    ov.hidden = false
    SW.seen = true
    SND().tone(523, 0.08, { vol: 0.04 })
    SND().tone(784, 0.16, { vol: 0.04, at: 0.08 })
    $('[data-sw="enter"]', ov).focus()
  }

  // ------------------------------------------------------------------ the partner pick, in the world's colours
  function pick(confirm) {
    const ov = overlay()
    const s = W().starters
    if (confirm) {
      const d = confirm
      ov.innerHTML = `<div class="ev-reward sw-pick" role="dialog" aria-modal="true" aria-labelledby="sw-pk-t" style="${themeVars()}">
        <p class="ev-rw-eyebrow">${esc(W().name)}</p><h3 id="sw-pk-t">${esc(A.K.names[d])}?</h3>
        <span class="sw-pk-big">${dexIco(d, 'x2')}</span>
        <p class="sw-pk-types">${A.K.types[d].map((t) => typeChip(t, W().boosters.find((b) => b.type === t)?.mult)).join('')}</p>
        <p class="ev-rw-sub">Lv.5 · dice level 0 until Lv.10. It stays in ${esc(W().name)} when the world closes.</p>
        <div class="ev-pop-foot sw-foot"><button type="button" class="ui-btn" data-sw="pick"><span>No</span></button><button type="button" class="ui-btn primary sw-btn" data-sw-yes="${d}"><span>Yes!</span></button></div></div>`
      ov.hidden = false
      return $('[data-sw-yes]', ov).focus()
    }
    ov.innerHTML = `<div class="ev-reward sw-pick" role="dialog" aria-modal="true" aria-labelledby="sw-pk-t" style="${themeVars()}">
      <p class="ev-rw-eyebrow">A FRESH START</p><h3 id="sw-pk-t">Pick your partner</h3>
      <p class="ev-rw-sub">${esc(W().name)} starts with one of three, at Lv.5.</p>
      <ul class="sw-pk-list">${s
        .map(
          (d) => `<li><button type="button" class="sw-pk-card" data-sw-pick="${d}" aria-label="${esc(A.K.names[d])}, ${A.K.types[d].join(' and ')}">${dexIco(d, 'x2')}<b>${esc(A.K.names[d])}</b><span>${A.K.types[d].map((t) => typeChip(t)).join('')}</span></button></li>`,
        )
        .join('')}</ul></div>`
    ov.hidden = false
    $('[data-sw-pick]', ov).focus()
  }

  // ------------------------------------------------------------------ inside: the world's Home
  function enter() {
    if (!visible()) return A.toast('This world is switched off')
    if (!SW.picked) return pick()
    SW.phase = 'inside'
    SW.here = Math.min(cleared(), W().areas.length - 1)
    if (SW.mainGold == null) {
      SW.mainGold = A.SAVE.gold
      A.SAVE.gold = SW.gold
    }
    A.showPage('home')
    refresh()
  }
  function leave(quiet) {
    if (SW.phase !== 'inside') return
    SW.phase = 'outside'
    SW.gold = A.SAVE.gold
    A.SAVE.gold = SW.mainGold ?? A.SAVE.gold
    SW.mainGold = null
    A.showPage('home')
    refresh()
    if (!quiet) A.toast('Back in Kanto: Mirage Island keeps your place')
  }
  function sceneHTML() {
    const a = W().areas[SW.here]
    const d = SW.picked
    return `<div class="sw-scene" aria-hidden="true"><img class="px" alt="" src="${art(a.art)}" />
        <span class="sw-scene-mon">${dexIco(d, 'x2')}</span></div>
      <button type="button" class="hm-area hm-plate sw-plate" data-sw="areas" aria-label="${esc(a.name)}, levels ${a.lv[0]} to ${a.lv[1]}. Open the world's areas">
        <span class="hm-area-row"><b class="hm-area-name">${esc(a.name)}</b><span class="hm-lv">Lv.${a.lv[0]}–${a.lv[1]}</span></span>
        <span class="hm-area-row"><span class="sw-booster-row">${W().boosters.map((b) => typeChip(b.type, b.mult)).join('')}</span><span class="hm-caught">XP ×${W().xp}</span></span>
      </button>`
  }
  function strip() {
    const hot = left() < DAY
    return `<div class="sw-strip" style="--art:url(${art(W().banner)});--pos:${ART[W().banner] ?? 50}%">
      <span class="sw-strip-t"><b>${esc(W().name)}</b><small${hot ? ' class="hot"' : ''}>Ends in ${dur(left())}</small></span>
      <button type="button" class="sw-back" data-sw="leave">Back to Kanto</button></div>`
  }
  function widgetsHTML() {
    const m = W().mythical
    const final = W().areas.length - 1
    const st = stateOf(final)
    return `<button type="button" class="ui-panel hm-w sw-wd" data-sw="final" aria-label="${esc(`The shiny ${A.K.names[m.dex]}: ${SW.caught ? 'caught' : st === 'next' || st === 'here' ? 'waiting for you' : 'in the last area'}`)}">
        <span class="hm-w-head"><b>The mythical</b>${SW.caught ? '<span class="ev-tag ok">CAUGHT</span>' : '<span class="sw-tag star sm">✦ SHINY</span>'}</span>
        <span class="sw-wd-mon">${silhouette(false)}</span>
        <span class="hm-w-title">${esc(A.K.names[m.dex])} Lv.${m.level}</span>
        <span class="hm-w-sub">${SW.caught ? 'In your Kanto Box' : st === 'next' || st === 'here' ? 'Waiting: fight it!' : `In ${esc(W().areas[final].name)}`}</span></button>
      <button type="button" class="ui-panel hm-w sw-wd" data-sw="mart" aria-label="The world's Mart: ${money(A.SAVE.gold)} of the world's money. Open">
        <span class="hm-w-head"><b>World Mart</b></span>
        <span class="sw-wd-items">${W().shop.slice(0, 3).map((r) => A.itemIco(ITEM(r.key))).join('')}</span>
        <span class="hm-w-title">${money(A.SAVE.gold)}</span><span class="hm-w-sub">The world’s own ₽</span></button>`
  }
  function render() {
    const scr = $('.hm-screen')
    const inside = SW.phase === 'inside'
    scr.classList.toggle('in-world', inside)
    scr.style.cssText = inside ? themeVars() : ''
    let host = $('#sw-home')
    if (!host) {
      host = document.createElement('div')
      host.id = 'sw-home'
      $('.hm-stage').after(host)
      const st = document.createElement('div')
      st.id = 'sw-stage'
      $('.hm-stage').appendChild(st)
      const wd = document.createElement('div')
      wd.id = 'sw-widgets'
      wd.className = 'hm-widgets'
      $('.hm-widgets').after(wd)
      const tb = document.createElement('div')
      tb.id = 'sw-strip'
      $('.hm-page-home').prepend(tb)
    }
    $('#sw-stage').innerHTML = inside ? sceneHTML() : ''
    $('#sw-widgets').innerHTML = inside ? widgetsHTML() : ''
    $('#sw-strip').innerHTML = inside ? strip() : ''
    $('#sw-home').hidden = true
    // CONTINUE plays the world's area.
    const go = $('#hm-go small')
    if (inside && go) go.textContent = `A battle in ${W().areas[SW.here].name}`
    A.renderTop()
    A.renderEventWidgets && A.renderEventWidgets()
  }
  function refresh() {
    render()
    admin()
  }

  // ------------------------------------------------------------------ the world's areas
  function areasSheet() {
    const ov = overlay()
    const rows = W()
      .areas.map((a, i) => {
        const st = stateOf(i)
        const date = opensAt(a)
        const chip =
          st === 'cleared'
            ? '<span class="ev-tag ok">CLEARED</span>'
            : st === 'here'
              ? '<span class="sw-tag here">HERE</span>'
              : st === 'next'
                ? '<span class="sw-tag next">NEXT</span>'
                : st === 'date'
                  ? `<span class="sw-tag lock">Opens ${esc(when(date))}</span>`
                  : `<span class="sw-tag lock">${a.final ? `After ${esc(W().areas[i - 1].name)}` : 'Clear the one before'}</span>`
        const open = st === 'cleared' || st === 'here' || st === 'next'
        return `<li class="sw-ar${open ? '' : ' off'}${a.final ? ' final' : ''}"><span class="sw-ar-pic" style="--art:url(${art(a.art)});--pos:${ART[a.art] ?? 50}%">${a.final ? `<span class="sw-tag star sm">✦ ${esc(A.K.names[W().mythical.dex])}</span>` : ''}</span>
          <span class="sw-ar-t"><b>${esc(a.name)}</b><small>Lv.${a.lv[0]}${a.lv[1] !== a.lv[0] ? `–${a.lv[1]}` : ''}</small>${chip}</span>
          ${open ? `<button type="button" class="hm-gobtn" data-sw-go="${i}" aria-label="Go to ${esc(a.name)}">GO</button>` : `<span class="hm-gobtn off" aria-hidden="true"><img class="px" alt="" src="${A.icons.LOCK}" /></span>`}</li>`
      })
      .join('')
    ov.innerHTML = `<div class="ev-pop sw-areas" role="dialog" aria-modal="true" aria-labelledby="sw-ar-t" style="${themeVars()}">
      <h3 id="sw-ar-t">${esc(W().name)}</h3><p class="sw-ar-sub">${cleared()} of ${W().areas.length} areas cleared · some open on a date</p>
      <ul class="sw-ar-list">${rows}</ul>
      <div class="ev-pop-foot one"><button type="button" class="ui-btn" data-sw-close><span>Close</span></button></div></div>`
    ov.hidden = false
  }

  // ------------------------------------------------------------------ a battle here: dice by level, a booster
  function battle() {
    const a = W().areas[SW.here]
    if (a.final) return finalFight()
    const ov = overlay()
    const me = { dex: SW.picked, lv: Math.max(5, a.lv[0] + 3) }
    const foe = { dex: 92, lv: a.lv[0] + 1 }
    const dl = (lv) => Math.floor(lv / 10)
    const boost = W().boosters.find((b) => A.K.types[me.dex].includes(b.type))
    const sum = 4 + 5 + 5
    const base = sum + 2
    const dmg = Math.round(base * (boost ? boost.mult : 1))
    ov.innerHTML = `<div class="ev-reward sw-bt" role="dialog" aria-modal="true" aria-labelledby="sw-bt-t" style="${themeVars()}">
      <p class="ev-rw-eyebrow">IN ${esc(a.name.toUpperCase())}</p><h3 id="sw-bt-t">A battle here</h3>
      <div class="sw-bt-vs"><span>${dexIco(me.dex, 'x2')}<b>${esc(A.K.names[me.dex])} Lv.${me.lv}</b><small>Dice level ${dl(me.lv)} · Lv.${me.lv} ÷ 10</small></span>
        <span class="sw-vs">VS</span>
        <span>${dexIco(foe.dex, 'x2')}<b>${esc(A.K.names[foe.dex])} Lv.${foe.lv}</b><small>Dice level ${dl(foe.lv)} · Lv.${foe.lv} ÷ 10</small></span></div>
      <div class="sw-bt-roll"><span class="sw-dice"><i>4</i><i>5</i><i>5</i></span><span class="sw-calc">Pair +2 · ${sum} + 2 = ${base}${boost ? ` <span class="sw-boost">${cap(boost.type)} ×${boost.mult} BOOSTER</span>` : ''}</span><b class="sw-dmg">${dmg} damage</b></div>
      <p class="ev-rw-sub">No upgrade shop in ${esc(W().name)}: both sides’ dice and combos come from their level. Boosters work for the foes too.</p>
      <div class="ev-pop-foot sw-foot"><button type="button" class="ui-btn" data-sw-close><span>Close</span></button><button type="button" class="ui-btn primary sw-btn" data-sw="win"><span>Win it</span></button></div></div>`
    ov.hidden = false
  }
  function win() {
    const ov = overlay()
    const gold = 40
    A.SAVE.gold += gold
    ov.innerHTML = `<div class="ev-reward lv-vic" role="dialog" aria-modal="true" aria-labelledby="sw-win-t" style="${themeVars()}">
      <p class="ev-rw-eyebrow">BEAT PSYCHIC NOVA</p><h3 id="sw-win-t">Victory!</h3>
      <ul class="lv-vic-xp"><li>${dexIco(SW.picked)}<b>${esc(A.K.names[SW.picked])}</b><span>+24 × ${W().xp} = ${24 * W().xp} XP</span></li></ul>
      <div class="lv-vic-gold"><img class="px" alt="" src="${A.icons.COIN}" /><b>+${money(gold)}</b></div>
      <p class="lv-vic-note">${esc(W().name)}’s ₽: spent in its Mart only</p>
      <button type="button" class="ui-btn primary wide sw-btn" data-sw-close><span>Next</span></button></div>`
    ov.hidden = false
    A.renderTop()
    render()
  }

  // ------------------------------------------------------------------ the final fight
  function finalFight(step = 'intro') {
    const ov = overlay()
    const m = W().mythical
    const name = A.K.names[m.dex]
    if (step === 'intro') {
      ov.innerHTML = `<div class="ev-reward sw-final" role="dialog" aria-modal="true" aria-labelledby="sw-fn-t" style="${themeVars()}">
        <span class="ev-rays" aria-hidden="true"></span>
        <p class="ev-rw-eyebrow">MIRAGE ISLAND · THE END</p>
        <span class="sw-fn-mon"><img class="px" alt="" src="assets/ev/${String(m.dex).padStart(3, '0')}_front_shiny.png" /><span class="lv-fx-spk big" aria-hidden="true">${'<i></i>'.repeat(7)}</span></span>
        <h3 id="sw-fn-t">A shiny ${esc(name)} appeared!</h3>
        <p class="ev-rw-sub">Lv.${m.level} · dice level ${Math.floor(m.level / 10)} · ${A.K.types[m.dex].map((t) => typeChip(t, W().boosters.find((b) => b.type === t)?.mult)).join(' ')}</p>
        <div class="ev-pop-foot sw-foot"><button type="button" class="ui-btn" data-sw-close><span>Later</span></button><button type="button" class="ui-btn primary sw-btn" data-sw-fn="won"><span>Fight</span></button></div></div>`
    } else if (step === 'won') {
      ov.innerHTML = `<div class="ev-reward sw-final" role="dialog" aria-modal="true" aria-labelledby="sw-fn-t" style="${themeVars()}">
        <span class="sw-fn-mon"><img class="px sw-worn" alt="" src="assets/ev/${String(m.dex).padStart(3, '0')}_front_shiny.png" /></span>
        <h3 id="sw-fn-t">${esc(name)} is worn out!</h3>
        <p class="ev-rw-sub">Throw a ball: the catch dice decide. Miss, and it waits here to be fought again${SW.tries ? ` (try ${SW.tries + 1})` : ''}.</p>
        <ul class="sw-balls">${['great-ball', 'ultra-ball'].map((k, i) => `<li><button type="button" class="sw-ball" data-sw-throw="${k}">${A.itemIco(ITEM(k))}<b>${esc(ITEM(k).name)}</b><small>${[20, 35][i]} %</small></button></li>`).join('')}</ul></div>`
    } else {
      const got = step === 'caught'
      ov.innerHTML = `<div class="ev-reward sw-final" role="dialog" aria-modal="true" aria-labelledby="sw-fn-t" style="${themeVars()}">
        ${got ? '<span class="ev-rays" aria-hidden="true"></span>' : ''}
        <span class="sw-fn-mon"><img class="px${got ? '' : ' sw-gone'}" alt="" src="assets/ev/${String(m.dex).padStart(3, '0')}_front_shiny.png" />${got ? `<span class="lv-fx-spk big" aria-hidden="true">${'<i></i>'.repeat(7)}</span>` : ''}</span>
        <h3 id="sw-fn-t">${got ? `Shiny ${esc(name)} is yours!` : `${esc(name)} broke free!`}</h3>
        <p class="ev-rw-sub">${got ? 'It leaves the world with you: it’s in your Kanto Box now, to keep.' : `It flew back to ${esc(W().areas[W().areas.length - 1].name)}. Fight it again until the world closes.`}</p>
        <button type="button" class="ui-btn primary wide sw-btn" data-sw-close><span>${got ? 'Amazing!' : 'Again later'}</span></button></div>`
    }
    ov.hidden = false
  }

  // ------------------------------------------------------------------ the world closes
  function closes() {
    const was = SW.phase === 'inside'
    if (was) leave(true)
    const ov = overlay()
    const name = A.K.names[W().mythical.dex]
    ov.innerHTML = `<div class="ev-pop lv-pop sw-pop" role="dialog" aria-modal="true" aria-labelledby="sw-cl-t" style="${themeVars()}">
      <div class="ev-pop-banner sw-closed" style="--art:url(${art(W().banner)});--pos:${ART[W().banner] ?? 50}%"><span class="ev-pop-tag sw-pop-tag">CLOSED</span></div>
      <h3 id="sw-cl-t">${esc(W().name)} has closed</h3>
      <ul class="ev-rules"><li><span class="ev-ri">${dexIco(W().mythical.dex)}</span><span><b>${SW.caught ? `You kept a shiny ${esc(name)}` : `The shiny ${esc(name)} got away`}</b><small>${SW.caught ? 'It’s in your Kanto Box.' : 'Another small world will bring another chance.'}</small></span></li>
        <li><span class="ev-ri"><span class="ev-ri-i">×</span></span><span><b>The rest stays there</b><small>${SW.picked ? `${esc(A.K.names[SW.picked])}, the world’s Pokémon, items and ₽ closed with it.` : 'You didn’t enter this time.'}</small></span></li></ul>
      <div class="ev-pop-foot one"><button type="button" class="ui-btn primary sw-btn" data-sw-close data-sw-gone><span>OK</span></button></div></div>`
    ov.hidden = false
    SW.phase = 'none'
    SW.picked = null
    $$('[data-swphase]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.swphase === 'none')))
    refresh()
  }

  // ------------------------------------------------------------------ the world's Mart (the Shop tab inside)
  A.worldShop = () => {
    if (SW.phase !== 'inside') return ''
    const rows = W()
      .shop.map((r) => {
        const it = ITEM(r.key)
        const got = SW.bought[r.key] || 0
        const stock = r.limit == null ? Infinity : r.limit - got
        const out = stock <= 0
        return `<li class="pg-it lv-it${out ? ' lv-out' : r.price > A.SAVE.gold ? ' poor' : ''}"><button type="button" class="pg-it-main" data-sw-buy="${r.key}"${out ? ' disabled' : ''} aria-label="${esc(`${it.name}, ${money(r.price)}, ${r.limit == null ? 'no limit' : out ? 'sold out' : `${stock} of ${r.limit} left`}. Buy one`)}">${A.itemIco(it)}<span class="pg-it-t"><b>${esc(it.name)}</b><small><span class="lv-stock${out ? ' out' : stock <= 2 ? ' low' : ''}">${r.limit == null ? 'No limit' : out ? 'Sold out' : `${stock} of ${r.limit} left`}</span></small></span>${A.SAVE.bag[it.key] ? `<em class="pg-own">×${A.SAVE.bag[it.key]}</em>` : ''}<span class="pg-price lv-price">${out ? 'SOLD OUT' : money(r.price)}</span></button></li>`
      })
      .join('')
    return `<div class="pg-head"><img class="px pg-h-ico" alt="" src="${A.icons.NAV.shop}" /><h2>World Mart</h2><span class="pg-wallet"><img class="px" alt="" src="${A.icons.COIN}" />${money(A.SAVE.gold)}</span></div>
      <section class="lv-shop sw-shop" aria-labelledby="sw-shop-t" style="${themeVars()}">
        <header class="lv-shop-h" style="--art:url(${art(W().banner)});--pos:${ART[W().banner] ?? 50}%"><span class="sw-tag">WORLD</span><h3 id="sw-shop-t">${esc(W().name)}</h3>
          <span class="lv-shop-left"><span>Ends in ${dur(left())}</span>${gauge(left() < DAY)}</span></header>
        <ul class="pg-items lv-items">${rows}</ul>
        <p class="lv-shop-note">The world’s own ₽, its own stock. Nothing bought here leaves the world.</p></section>`
  }
  A.worldUpgrades = () => {
    if (SW.phase !== 'inside') return ''
    const steps = [1, 10, 20, 30, 50, 70, 100]
    return `<div class="pg-head"><img class="px pg-h-ico" alt="" src="${A.icons.NAV.upgrades}" /><h2>Upgrades</h2></div>
      <section class="sw-up" style="${themeVars()}"><h3>Dice follow the level here</h3>
        <p>No upgrades in ${esc(W().name)}: a Pokémon’s dice and combos are its level ÷ 10, for every Pokémon, yours and the foes’.</p>
        <table class="sw-up-t"><thead><tr><th>Level</th>${steps.map((l) => `<th>${l}</th>`).join('')}</tr></thead><tbody><tr><td>Dice level</td>${steps.map((l) => `<td>${Math.floor(l / 10)}</td>`).join('')}</tr></tbody></table>
        <p class="sw-up-me">${dexIco(SW.picked)}<b>${esc(A.K.names[SW.picked])}</b><span>Lv.${W().areas[SW.here].lv[0] + 3} → dice level ${Math.floor((W().areas[SW.here].lv[0] + 3) / 10)}</span></p></section>`
  }

  // ------------------------------------------------------------------ the overlay and clicks
  function overlay() {
    let ov = $('#sw-ov')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'sw-ov'
      ov.className = 'ev-ov'
      ov.hidden = true
      $('.hm-screen').appendChild(ov)
      ov.addEventListener('click', onClick)
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          ov.hidden = true
        }
      })
    }
    return ov
  }
  function onClick(e) {
    const t = e.target
    let b
    const ov = $('#sw-ov')
    if (ov && (t === ov || t.closest('[data-sw-close]'))) return (ov.hidden = true)
    if ((b = t.closest('[data-sw-pick]'))) return pick(Number(b.dataset.swPick))
    if ((b = t.closest('[data-sw-yes]'))) {
      SW.picked = Number(b.dataset.swYes)
      ov.hidden = true
      SND().tone(880, 0.1, { vol: 0.04 })
      return enter()
    }
    if ((b = t.closest('[data-sw-go]'))) {
      SW.here = Number(b.dataset.swGo)
      ov.hidden = true
      return render()
    }
    if ((b = t.closest('[data-sw-fn]'))) return finalFight(b.dataset.swFn)
    if ((b = t.closest('[data-sw-throw]'))) {
      const odds = b.dataset.swThrow === 'ultra-ball' ? 0.35 : 0.2
      SW.tries++
      const got = SW.forceCatch != null ? SW.forceCatch : Math.random() < odds
      if (got) SW.caught = true
      finalFight(got ? 'caught' : 'missed')
      return render()
    }
    if ((b = t.closest('[data-sw]'))) {
      const k = b.dataset.sw
      if (ov && ov.contains(b)) ov.hidden = true
      if (k === 'enter') return enter()
      if (k === 'pick') return pick()
      if (k === 'leave') return leave()
      if (k === 'areas') return areasSheet()
      if (k === 'final') return W().areas.length - 1 <= cleared() || SW.caught ? (SW.caught ? A.toast('Already yours: it’s in your Kanto Box') : finalFight()) : A.toast(`Clear the areas before ${W().areas[W().areas.length - 1].name} first`)
      if (k === 'mart') return A.showPage('shop')
      if (k === 'win') return win()
    }
  }
  // Home: the square outside, the world's things inside; CONTINUE and Areas inside the world are the world's.
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target
      const inScreen = t.closest && t.closest('.hm-screen')
      if (!inScreen || t.closest('#sw-ov')) return
      if (t.closest('[data-sw]') || t.closest('[data-sw-buy]')) {
        e.stopPropagation()
        const buy = t.closest('[data-sw-buy]')
        if (buy) {
          const r = W().shop.find((x) => x.key === buy.dataset.swBuy)
          const got = SW.bought[r.key] || 0
          if (r.price > A.SAVE.gold) return A.toast('Not enough of the world’s ₽')
          if (r.limit != null && got >= r.limit) return
          A.SAVE.gold -= r.price
          A.SAVE.bag[r.key] = (A.SAVE.bag[r.key] || 0) + 1
          SW.bought[r.key] = got + 1
          A.renderTop()
          A.showPage('shop', true)
          return A.toast(`+1 ${ITEM(r.key).name} · ${money(A.SAVE.gold)} left`)
        }
        return onClick(e)
      }
      if (SW.phase !== 'inside') return
      if (t.closest('#hm-go')) {
        e.stopPropagation()
        e.preventDefault()
        return battle()
      }
      if (t.closest('#hm-areas')) {
        e.stopPropagation()
        e.preventDefault()
        return areasSheet()
      }
    },
    true,
  )

  // ------------------------------------------------------------------ the preview bar
  function controls() {
    const box = $('#sw-controls')
    if (!box || box.dataset.bound) return
    box.dataset.bound = '1'
    const mark = (attr, v) => $$(`[${attr}]`, box).forEach((x) => x.setAttribute('aria-checked', String(x.getAttribute(attr) === v)))
    box.addEventListener('click', (e) => {
      let b
      if ((b = e.target.closest('[data-swphase]'))) {
        const p = b.dataset.swphase
        mark('data-swphase', p)
        if (p === 'none') {
          leave(true)
          SW.phase = 'none'
        } else if (p === 'outside') {
          leave(true)
          SW.phase = 'outside'
          if (!SW.seen) setTimeout(popup, 200)
        } else {
          SW.phase = 'outside'
          if (!SW.picked) SW.picked = W().starters[0]
          enter()
        }
        return refresh()
      }
      if ((b = e.target.closest('[data-swtime]'))) {
        SW.time = b.dataset.swtime
        mark('data-swtime', SW.time)
        clock()
        return refresh()
      }
      if (e.target.closest('[data-swpop]')) {
        A.showPage('home')
        return popup()
      }
      if (e.target.closest('[data-swpick]')) {
        A.showPage('home')
        return pick()
      }
      if (e.target.closest('[data-swfinal]')) {
        A.showPage('home')
        return finalFight()
      }
      if (e.target.closest('[data-swclose]')) {
        A.showPage('home')
        return closes()
      }
    })
  }

  // ------------------------------------------------------------------ the admin mock
  const TYPES = Object.keys(TYPE_COL)
  function admin() {
    const el = $('#sw-admin')
    if (!el) return
    const w = W()
    const opt = (v, cur, label = v) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(String(label))}</option>`
    const dex = [63, 92, 79, 64, 93, 96, 151, 150, 144, 145, 146, 6, 9, 3]
    el.innerHTML = `
      <div class="ad-sec"><h3>Small worlds</h3>
        <div class="ad-switch" role="radiogroup" aria-label="Small worlds: who sees them">${['off', 'admin', 'all']
          .map((a) => `<button type="button" role="radio" aria-checked="${SW.access === a}" data-swacc="${a}">${a === 'off' ? 'Off' : a === 'admin' ? 'On for admin' : 'On for everyone'}</button>`)
          .join('')}</div>
        ${SW.access === 'admin' ? `<label class="ad-inline"><input type="checkbox" data-swasadmin${SW.asAdmin ? ' checked' : ''} /> Preview signed in as the admin</label>` : ''}
        <table class="ad-t"><thead><tr><th>World</th><th>Starts (UTC)</th><th>Ends (UTC)</th><th>State</th></tr></thead><tbody>
          <tr class="sel"><td>${esc(w.name)}<small>shiny ${esc(A.K.names[w.mythical.dex])} · ${w.areas.length} areas</small></td><td>${new Date(SW.start).toISOString().slice(0, 16).replace('T', ' ')}</td><td>${new Date(SW.end).toISOString().slice(0, 16).replace('T', ' ')}</td><td><span class="ad-st live">Live</span></td></tr></tbody></table>
        <p class="ad-note">Off by default. On for admin: only you see it, signed in, to try it in production. One world at a time.</p></div>
      <div class="ad-sec"><h3>Edit · ${esc(w.name)}</h3>
        <div class="ad-grid">
          <label class="ad-wide"><span>Name</span><input type="text" data-swf="name" value="${esc(w.name)}" maxlength="24" /></label>
          <label><span>Banner</span><select data-swf="banner">${Object.keys(ART).map((b) => opt(b, w.banner)).join('')}</select></label>
          <label><span>Lasts (days)</span><input type="number" data-swf="days" value="${w.days}" min="1" max="60" /></label>
          <label><span>Badges needed</span><input type="number" data-swf="minBadges" value="${w.minBadges}" min="0" max="40" /></label>
          <label><span>XP ×</span><input type="number" data-swf="xp" value="${w.xp}" min="1" max="20" step="0.5" /></label>
          <label><span>Main colour</span><input type="color" data-swc="main" value="${w.theme.main}" /></label>
          <label><span>Accent</span><input type="color" data-swc="accent" value="${w.theme.accent}" /></label>
          <label><span>Ground</span><input type="color" data-swc="ground" value="${w.theme.ground}" /></label>
          <label class="ad-wide"><span>Starters</span>${[0, 1, 2].map((i) => `<select data-sws="${i}" aria-label="Starter ${i + 1}">${dex.map((d) => opt(d, w.starters[i], A.K.names[d])).join('')}</select>`).join('')}</label>
          <label class="ad-wide"><span>Shiny mythical</span><select data-swm="dex">${[151, 251].map((d) => opt(d, w.mythical.dex, A.K.names[d] || `#${d}`)).join('')}</select><input type="number" data-swm="level" value="${w.mythical.level}" min="5" max="100" aria-label="Its level" /><small>boss of the last area</small></label>
        </div>
        <table class="ad-t"><thead><tr><th>Booster type</th><th>×</th><th></th></tr></thead><tbody>${w.boosters
          .map((b, i) => `<tr><td><select data-swb="${i}" data-k="type">${TYPES.map((t) => opt(t, b.type, cap(t))).join('')}</select></td><td><input type="number" data-swb="${i}" data-k="mult" value="${b.mult}" min="1" max="5" step="0.25" /></td><td><button type="button" class="btn small" data-swbrm="${i}">✕</button></td></tr>`)
          .join('')}</tbody></table>
        <div class="ad-dev"><button type="button" class="btn small" data-swbadd>Add a booster</button></div>
        <table class="ad-t"><thead><tr><th>World Mart item</th><th>Price (world ₽)</th><th>Limit</th></tr></thead><tbody>${w.shop
          .map((r) => `<tr><td>${esc(ITEM(r.key).name)}</td><td>${r.price}</td><td>${r.limit ?? 'none'}</td></tr>`)
          .join('')}</tbody></table>
        <table class="ad-t"><thead><tr><th>Area</th><th>Levels</th><th>Opens</th></tr></thead><tbody>${w.areas
          .map((a, i) => `<tr><td>${esc(a.name)}${a.final ? ' <small>the mythical</small>' : ''}</td><td>${a.lv[0]}–${a.lv[1]}</td><td><select data-swo="${i}">${opt('', a.opens ?? '', 'after the one before')}${[1, 2, 3, 4, 5, 6, 7, 8].map((d) => opt(d, a.opens ?? '', `day ${d + 1} (${when(SW.start + d * DAY)})`)).join('')}</select></td></tr>`)
          .join('')}</tbody></table>
        <p class="ad-note">Areas and trainers are built in their own sections, region = this world. An area with a date opens at that date (UTC) once the one before is cleared.</p></div>`
    if (el.dataset.bound) return
    el.dataset.bound = '1'
    el.addEventListener('change', (e) => {
      const t = e.target
      const w2 = W()
      if (t.dataset.swf) {
        const f = t.dataset.swf
        w2[f] = f === 'name' || f === 'banner' ? t.value : Number(t.value) || w2[f]
        if (f === 'days') clock()
      } else if (t.dataset.swc) w2.theme[t.dataset.swc] = t.value
      else if (t.dataset.sws) w2.starters[Number(t.dataset.sws)] = Number(t.value)
      else if (t.dataset.swm) w2.mythical[t.dataset.swm] = Number(t.value)
      else if (t.dataset.swb) w2.boosters[Number(t.dataset.swb)][t.dataset.k] = t.dataset.k === 'mult' ? Number(t.value) || 1 : t.value
      else if (t.dataset.swo) w2.areas[Number(t.dataset.swo)].opens = t.value === '' ? null : Number(t.value)
      else if (t.matches('[data-swasadmin]')) SW.asAdmin = t.checked
      else return
      refresh()
    })
    el.addEventListener('click', (e) => {
      let b
      if ((b = e.target.closest('[data-swacc]'))) {
        SW.access = b.dataset.swacc
        if (SW.access !== 'all' && !(SW.access === 'admin' && SW.asAdmin)) leave(true)
        return refresh()
      }
      if ((b = e.target.closest('[data-swbrm]'))) {
        W().boosters.splice(Number(b.dataset.swbrm), 1)
        return refresh()
      }
      if (e.target.closest('[data-swbadd]')) {
        W().boosters.push({ type: 'fire', mult: 1.5 })
        return refresh()
      }
    })
  }

  // ------------------------------------------------------------------ wiring
  function reset() {
    if (!SW.start) {
      clock()
      SW.seen = true
    }
    if (SW.phase === 'inside') leave(true)
    controls()
    refresh()
  }
  $('#hm-events') &&
    $('#hm-events').addEventListener(
      'click',
      (e) => {
        if (e.target.closest('[data-sw]')) e.stopPropagation()
      },
      true,
    )
  HOME.page('worlds', { render() {}, reset, dot: null })
  setInterval(() => SW.phase !== 'none' && render(), 30000)
})()
