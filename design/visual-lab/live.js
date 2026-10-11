/*
 * Pokédice Visual Lab: Live events (event type 4, priority 2). The plan is docs/20-LIVE-EVENTS-PLAN.md.
 * One at a time, the same for every player, scheduled in the admin (start and end, UTC), shown from a few badges:
 *  - Shiny Parade: wild Pokémon more often shiny, in some areas, one region or the whole game.
 *  - Special Shop: items at a special price or never sold in the Mart, some limited per trainer, for a while.
 *  - Cash Flow: every ₽ earned × the multiplier (selling excluded).
 * No page of its own: a Home square (picture, title, timer, gauge), a pop-up once per event, chips where it applies.
 * The admin mock beside the phone edits the same events the phone shows (LV.events).
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco } = A
  const SND = () => PX.Sound
  const MIN = 60e3
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR
  const ITEM = (key) => A.G.items.find((i) => i.key === key)
  const money = (n) => `₽${Math.round(n).toLocaleString('en-US')}`
  const pct = (m) => Math.round((m - 1) * 100)
  // Banner pictures: the events' square area art (assets/ev/art), cropped around its horizon.
  const ART = { evening: 52, modern: 50, 'lair-island': 50, 'lair-shrine': 56, 'lair-summit': 50, champion: 62, league: 56, marsh: 55 }
  const artOf = (k) => `--art:url(assets/ev/art/${k}.png);--pos:${ART[k] ?? 55}%`
  const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova']
  const NAME = { shiny: 'Shiny Parade', shop: 'Special Shop', cash: 'Cash Flow' }
  const TYPES = Object.keys(NAME)

  // ------------------------------------------------------------------ the admin's events (one live at a time)
  const LV = {
    pick: 'shiny-region', // none · shiny-areas · shiny-region · shiny-all · shop · cash
    time: 'mid', // start · mid · last
    wide: false,
    seen: new Set(),
    bought: {}, // event id → { item key: bought }
    open: null,
    qty: 1,
    edit: null,
    events: [
      {
        id: 'parade',
        type: 'shiny',
        title: '',
        banner: 'evening',
        minBadges: 3,
        days: 3,
        shiny: { mult: 5, scope: 'region', region: 'Kanto', areas: [3, 15, 18] },
      },
      {
        id: 'shop',
        type: 'shop',
        title: '',
        banner: 'modern',
        minBadges: 3,
        days: 4,
        shop: [
          { key: 'master-ball', price: 1000, limit: 1, regions: 'all' },
          { key: 'rare-candy', price: 300, limit: 3, regions: 'all' },
          { key: 'ultra-ball', price: 75, limit: 10, regions: 'all' },
          { key: 'moon-stone', price: 150, limit: null, regions: ['Kanto'] },
        ],
      },
      { id: 'cash', type: 'cash', title: '', banner: 'league', minBadges: 3, days: 2, cash: { mult: 1.5 } },
    ],
  }
  const byId = (id) => LV.events.find((e) => e.id === id)

  /**
   * The preview bar picks the live one; its dates move around now (just started, halfway, its last hour), the others
   * get dates of their own: the next one scheduled after it, the last one ended.
   */
  function schedule() {
    const now = Date.now()
    const type = LV.pick === 'none' ? null : LV.pick.startsWith('shiny') ? 'shiny' : LV.pick
    const live = LV.events.find((e) => e.type === type) || null
    if (live) {
      const D = live.days * DAY
      const done = LV.time === 'start' ? 5 * MIN : LV.time === 'last' ? D - 50 * MIN : D / 2
      live.start = now - done
      live.end = live.start + D
      live.ended = false
      if (type === 'shiny') live.shiny.scope = LV.pick.slice(6)
    }
    let next = live ? live.end + 2 * DAY : now + 2 * DAY
    let past = now - 9 * DAY
    LV.events
      .filter((e) => e !== live)
      .forEach((e, i) => {
        e.ended = false
        if (i === 0) {
          e.start = hourOf(next)
          e.end = e.start + e.days * DAY
          next = e.end + 2 * DAY
        } else {
          e.end = hourOf(past)
          e.start = e.end - e.days * DAY
          past = e.start - 5 * DAY
        }
      })
  }
  const hourOf = (ms) => Math.round(ms / HOUR) * HOUR

  // ------------------------------------------------------------------ time
  const stateOf = (e, now = Date.now()) => (e.start > now ? 'scheduled' : now < e.end ? 'live' : 'ended')
  /** The one running now (the admin refuses overlaps; the mock takes the first). */
  const liveEvent = () => LV.events.find((e) => stateOf(e) === 'live') || null
  /** Running, and this player has the badges for it. */
  const visible = () => {
    const e = liveEvent()
    return e && A.SAVE.badges >= e.minBadges ? e : null
  }
  const left = (e) => Math.max(0, e.end - Date.now())
  const frac = (e) => Math.max(0, Math.min(1, left(e) / (e.end - e.start)))
  const hot = (e) => left(e) < 3 * HOUR
  function dur(ms) {
    const m = Math.max(1, Math.ceil(ms / MIN))
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')}`
    return h % 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h / 24} d`
  }
  const when = (ms) =>
    new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const isoUTC = (ms) => new Date(ms).toISOString().slice(0, 16)
  const gauge = (e) => `<span class="lv-gauge" aria-hidden="true"><i style="width:${(frac(e) * 100).toFixed(1)}%"></i></span>`

  // ------------------------------------------------------------------ words
  // The title is automatic (the type's name, translated) unless the admin types one for a special occasion.
  const titleOf = (e) => e.title.trim() || NAME[e.type]
  const areaNames = (list) => list.map((o) => A.areaBy(o)?.name).filter(Boolean)
  const plural = (n, name) => (n > 1 ? name.replace(/y$/, 'ie') + 's' : name)
  function andList(xs) {
    if (xs.length < 2) return xs[0] || ''
    return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  }
  function whereText(e, short) {
    const s = e.shiny
    if (s.scope === 'all') return 'everywhere'
    if (s.scope === 'region') return `in ${s.region}`
    const n = areaNames(s.areas)
    return short && n.length > 1 ? `in ${n[0]} +${n.length - 1}` : `in ${andList(n)}`
  }
  function subOf(e) {
    if (e.type === 'shiny') return `×${e.shiny.mult} shiny ${whereText(e, true)}`
    if (e.type === 'shop') return `${e.shop.length} items, for a while`
    return `+${pct(e.cash.mult)} % on every ₽`
  }
  const spark = '<i class="lv-spk" aria-hidden="true"></i>'
  function tagOf(e) {
    if (e.type === 'shiny') return `×${e.shiny.mult}${spark}`
    if (e.type === 'shop') return 'SALE'
    return `+${pct(e.cash.mult)} % ₽`
  }
  const tagText = (e) => (e.type === 'shiny' ? `times ${e.shiny.mult} shiny` : e.type === 'shop' ? 'sale' : `plus ${pct(e.cash.mult)} percent Pokédollars`)
  const covers = (e, a) =>
    !!a && a.dex && a.dex.length > 0 && (e.shiny.scope === 'all' || (e.shiny.scope === 'region' ? e.shiny.region === 'Kanto' : e.shiny.areas.includes(a.order)))

  // ------------------------------------------------------------------ art: sparkles, coins, items
  const COIN = () => A.icons.COIN
  const bigIt = (key) => `<span class="it lv-it2" style="background-position:-${ITEM(key).i * 60}px 0"></span>`
  function fx(e, big) {
    if (e.type === 'shiny')
      return `<span class="lv-fx-spk${big ? ' big' : ''}" aria-hidden="true">${'<i></i>'.repeat(big ? 7 : 5)}</span>`
    if (e.type === 'cash')
      return `<span class="lv-fx-coins${big ? ' big' : ''}" aria-hidden="true">${[0, 1, 2, 3, 4]
        .slice(0, big ? 5 : 3)
        .map((i) => `<img class="px" alt="" src="${COIN()}" style="--i:${i}" />`)
        .join('')}</span>`
    const keys = e.shop.slice(0, 3).map((r) => r.key)
    return `<span class="lv-fx-shelf${big ? ' big' : ''}" aria-hidden="true">${keys.map((k, i) => `<span style="--i:${i}">${big ? bigIt(k) : A.itemIco(ITEM(k))}</span>`).join('')}</span>`
  }

  // ------------------------------------------------------------------ the Home square (priority 2: first among the events)
  function squareHTML(e) {
    const label = `Live event: ${titleOf(e)}, ${subOf(e)}, ${tagText(e)}. Ends in ${dur(left(e))}. ${e.type === 'shop' ? 'Open the shop' : 'See what it does'}`
    return `<button type="button" class="hm-w lv-w t-${e.type}${LV.wide ? ' wide' : ''}${hot(e) ? ' hot' : ''}" data-lv aria-label="${esc(label)}" style="${artOf(e.banner)}">
      <span class="lv-w-top"><span class="lv-live"><i></i>LIVE</span><span class="lv-tag">${tagOf(e)}</span></span>
      ${fx(e, false)}
      <span class="lv-w-bot"><b class="lv-w-title">${esc(titleOf(e))}</b><small class="lv-w-sub">${esc(subOf(e))}</small>
        <span class="lv-time" data-lv-left="square">Ends in ${dur(left(e))}</span>${gauge(e)}</span></button>`
  }
  /** events.js renders the events stack and asks for this square first. */
  A.liveWidget = () => {
    const e = visible()
    return e ? squareHTML(e) : ''
  }

  // ------------------------------------------------------------------ the pop-up (once per event)
  function rules(e) {
    if (e.type === 'shiny') {
      const s = e.shiny
      return [
        ['spark', `Shiny Pokémon ×${s.mult}`, `Wild Pokémon are ${s.mult} times more likely to be shiny ${whereText(e)}.`],
        ['grass', 'Wild encounters only', 'Trainers, bosses, Eggs and raids keep their usual odds.'],
      ]
    }
    if (e.type === 'cash') {
      const p = pct(e.cash.mult)
      return [
        ['coin', `+${p} % on every ₽`, 'Trainers and Gyms, the ₽ you find, the Game Corner, the Day Care and the wheel.'],
        ['sell', 'Selling stays the same', 'The Mart buys back at its usual price.'],
      ]
    }
    const never = e.shop.filter((r) => !ITEM(r.key).shop)
    const sale = e.shop.filter((r) => ITEM(r.key).shop && r.price < ITEM(r.key).price)
    const lim = e.shop.filter((r) => r.limit != null)
    const out = []
    if (never.length) out.push([never[0].key, 'Never sold in the Mart', `${andList(never.map((r) => ITEM(r.key).name))}, for a few days.`])
    if (sale.length)
      out.push([sale[0].key, 'Special prices', sale.map((r) => `${ITEM(r.key).name} ${money(r.price)} (instead of ${money(ITEM(r.key).price)})`).join(', ') + '.'])
    if (lim.length) out.push(['limit', 'While stocks last', `Per trainer: ${andList(lim.map((r) => `${r.limit} ${plural(r.limit, ITEM(r.key).name)}`))}.`])
    return out.slice(0, 3)
  }
  function ruleIco(k) {
    if (k === 'spark') return '<span class="lv-ri-spk"><i></i><i></i><i></i></span>'
    if (k === 'grass') return '<span class="lv-ri-grass"><i></i><i></i><i></i></span>'
    if (k === 'coin') return `<img class="px ev-ri-img" alt="" src="${COIN()}" />`
    if (k === 'sell') return '<span class="ev-ri-i">½</span>'
    if (k === 'limit') return '<span class="ev-ri-i">×3</span>'
    return A.itemIco(ITEM(k))
  }
  function popup(e) {
    const ov = overlay()
    const big = e.type === 'shiny' ? `×${e.shiny.mult}` : e.type === 'cash' ? `+${pct(e.cash.mult)} %` : ''
    ov.innerHTML = `<div class="ev-pop lv-pop t-${e.type}" role="dialog" aria-modal="true" aria-labelledby="lv-pop-t">
      <div class="ev-pop-banner" style="${artOf(e.banner)}">${fx(e, true)}${big ? `<span class="lv-pop-big" aria-hidden="true">${big}</span>` : ''}<span class="ev-pop-tag lv-pop-tag">LIVE EVENT</span></div>
      <h3 id="lv-pop-t">${esc(titleOf(e))}</h3>
      <div class="lv-pop-when"><span><b data-lv-left="pop">${dur(left(e))} left</b> · until ${esc(when(e.end))}</span>${gauge(e)}</div>
      <ul class="ev-rules">${rules(e)
        .map(([k, h, t]) => `<li><span class="ev-ri">${ruleIco(k)}</span><span><b>${esc(h)}</b><small>${esc(t)}</small></span></li>`)
        .join('')}</ul>
      <div class="ev-pop-foot${e.type === 'shop' ? '' : ' one'}">${
        e.type === 'shop'
          ? '<button type="button" class="ui-btn" data-lv-close><span>OK</span></button><button type="button" class="ui-btn primary" data-lv-shop><span>Go to the shop</span></button>'
          : '<button type="button" class="ui-btn primary" data-lv-close><span>OK</span></button>'
      }</div></div>`
    ov.hidden = false
    LV.seen.add(e.id)
    SND().tone(784, 0.08, { vol: 0.04 })
    SND().tone(1175, 0.18, { vol: 0.04, at: 0.08 })
    ;($('[data-lv-shop]', ov) || $('[data-lv-close]', ov)).focus()
  }
  /** Cash Flow where it shows most: a trainer victory's ₽ line, counting up, with the bonus beside it. */
  function victory() {
    const e = visible()
    const mult = e && e.type === 'cash' ? e.cash.mult : 1
    const base = 240
    const total = Math.round(base * mult)
    const ov = overlay()
    const team = (A.TEAM || []).slice(0, 3)
    ov.innerHTML = `<div class="ev-reward lv-vic" role="dialog" aria-modal="true" aria-labelledby="lv-vic-t">
      <p class="ev-rw-eyebrow">BEAT HIKER CLARK</p>
      <h3 id="lv-vic-t">Victory!</h3>
      <ul class="lv-vic-xp">${team.map((m) => `<li>${dexIco(m.dex)}<b>${esc(m.name || A.K.names[m.dex])}</b><span>+38 XP</span></li>`).join('')}</ul>
      <div class="lv-vic-gold"><img class="px" alt="" src="${COIN()}" /><b data-count="${total}">+${money(0)}</b>${mult > 1 ? `<span class="lv-chip cash">+${pct(mult)} %</span>` : ''}</div>
      <p class="lv-vic-note">${mult > 1 ? `${money(base)} + ${money(total - base)} from Cash Flow` : 'No Cash Flow running: the usual ₽'}</p>
      <button type="button" class="ui-btn primary wide" data-lv-close><span>Next</span></button></div>`
    ov.hidden = false
    $('[data-lv-close]', ov).focus()
    const b = $('[data-count]', ov)
    const t0 = performance.now()
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 800)
      b.textContent = `+${money(total * k)}`
      if (k < 1 && b.isConnected) requestAnimationFrame(step)
    }
    if (A.REDUCED) b.textContent = `+${money(total)}`
    else requestAnimationFrame(step)
  }
  function overlay() {
    let ov = $('#lv-ov')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'lv-ov'
      ov.className = 'ev-ov'
      ov.hidden = true
      $('.hm-screen').appendChild(ov)
      ov.addEventListener('click', (e) => {
        if (e.target.closest('[data-lv-close]') || e.target === ov) ov.hidden = true
        if (e.target.closest('[data-lv-shop]')) {
          ov.hidden = true
          openShop()
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
  /** After the game's other pop-ups (the events' unlock pop-up in the lab), on Home. */
  function popWhenFree(e, tries = 40) {
    const busy = ($('#ev-ov') && !$('#ev-ov').hidden) || ($('#lv-ov') && !$('#lv-ov').hidden)
    const home = $('.hm-page[data-page="home"]')
    if (!busy && home && !home.hidden) return popup(e)
    if (tries > 0) setTimeout(() => popWhenFree(e, tries - 1), 400)
  }
  function openShop() {
    A.showPage('shop')
    const buy = $('[data-shoptab="buy"]')
    if (buy && buy.getAttribute('aria-selected') !== 'true') buy.click()
  }

  // ------------------------------------------------------------------ the shop's Special section
  const bought = (e) => (LV.bought[e.id] = LV.bought[e.id] || {})
  // Question 2: an item set to some regions is sold while playing one of them (the lab plays Kanto).
  const soldHere = (r) => r.regions === 'all' || r.regions.includes('Kanto')
  A.liveShop = (cat) => {
    const e = visible()
    if (!e || e.type !== 'shop') return ''
    const rows = e.shop.filter((r) => soldHere(r) && ITEM(r.key) && (cat === 'all' || ITEM(r.key).group === cat))
    if (!rows.length) return ''
    return `<section class="lv-shop" aria-labelledby="lv-shop-t">
      <header class="lv-shop-h" style="${artOf(e.banner)}"><span class="lv-live"><i></i>LIVE</span><h3 id="lv-shop-t">${esc(titleOf(e))}</h3>
        <span class="lv-shop-left"><span data-lv-left="shop">Ends in ${dur(left(e))}</span>${gauge(e)}</span></header>
      <ul class="pg-items lv-items">${rows.map((r) => rowHTML(e, r)).join('')}</ul>
      <p class="lv-shop-note">Prices and stock for this event only. Limits are per trainer.</p></section>`
  }
  function rowHTML(e, r) {
    const it = ITEM(r.key)
    const S = A.SAVE
    const got = bought(e)[r.key] || 0
    const stock = r.limit == null ? Infinity : r.limit - got
    const out = stock <= 0
    const sale = it.shop && r.price < it.price
    const isOpen = LV.open === r.key && !out
    const qs = [1, 5, 10].filter((q) => q <= stock)
    const q = Math.min(LV.qty, stock)
    const total = r.price * q
    const can = total <= S.gold
    const tag = !it.shop
      ? '<em class="lv-it-tag never">NOT IN THE MART</em>'
      : sale
        ? `<em class="lv-it-tag sale">−${Math.round((1 - r.price / it.price) * 100)} %</em>`
        : ''
    const stockTxt = r.limit == null ? 'No limit' : out ? 'Sold out' : `${stock} of ${r.limit} left`
    const label = `${it.name}, ${money(r.price)}${sale ? `, usually ${money(it.price)}` : ''}${!it.shop ? ', not sold in the Mart' : ''}, ${stockTxt}`
    return `<li class="pg-it lv-it${isOpen ? ' open' : ''}${out ? ' lv-out' : r.price > S.gold ? ' poor' : ''}">
      <button type="button" class="pg-it-main" data-litem="${r.key}" aria-expanded="${isOpen}" aria-label="${esc(label)}"${out ? ' disabled' : ''}>${A.itemIco(it)}<span class="pg-it-t"><b>${esc(it.name)}</b><small>${tag}<span class="lv-stock${out ? ' out' : stock <= 2 ? ' low' : ''}">${stockTxt}</span></small></span>${S.bag[it.key] ? `<em class="pg-own">×${S.bag[it.key]}</em>` : ''}<span class="pg-price lv-price">${sale ? `<s>${money(it.price)}</s>` : ''}${out ? 'SOLD OUT' : money(r.price)}</span></button>
      ${
        isOpen
          ? `<div class="pg-it-more"><p>${esc(it.desc || '')}</p><div class="pg-buyrow">${
              qs.length > 1
                ? `<div class="hm-seg" role="radiogroup" aria-label="How many">${qs.map((n) => `<button type="button" role="radio" data-lqty="${n}" aria-checked="${q === n}">×${n}</button>`).join('')}</div>`
                : '<span class="lv-one">One per trainer</span>'
            }<button type="button" class="ui-btn${can ? ' primary' : ''} pg-buy" data-lbuy="${r.key}"${can ? '' : ' disabled'}><span>${can ? `Buy ${money(total)}` : `Need ${money(total - S.gold)} more`}</span></button></div></div>`
          : ''
      }</li>`
  }
  function shopClick(ev) {
    const t = ev.target
    let b
    const e = visible()
    if (!e || e.type !== 'shop') return
    if ((b = t.closest('[data-litem]'))) {
      LV.open = LV.open === b.dataset.litem ? null : b.dataset.litem
      LV.qty = 1
      return reshop(`[data-litem="${b.dataset.litem}"]`)
    }
    if ((b = t.closest('[data-lqty]'))) {
      LV.qty = Number(b.dataset.lqty)
      return reshop(`[data-lqty="${b.dataset.lqty}"]`)
    }
    if ((b = t.closest('[data-lbuy]'))) {
      const r = e.shop.find((x) => x.key === b.dataset.lbuy)
      const it = ITEM(r.key)
      const got = bought(e)[r.key] || 0
      const q = Math.min(LV.qty, r.limit == null ? Infinity : r.limit - got)
      if (q <= 0 || r.price * q > A.SAVE.gold) return
      A.SAVE.gold -= r.price * q
      A.SAVE.bag[r.key] = (A.SAVE.bag[r.key] || 0) + q
      bought(e)[r.key] = got + q
      if (r.limit != null && got + q >= r.limit) LV.open = null
      LV.qty = 1
      A.renderTop()
      reshop(`[data-litem="${r.key}"]`)
      SND().tone(988, 0.06, { vol: 0.04 })
      SND().tone(1319, 0.12, { vol: 0.04, at: 0.06 })
      return A.toast(`+${q} ${plural(q, it.name)} · ${money(A.SAVE.gold)} left`)
    }
  }
  function reshop(focus) {
    const p = $('.hm-page[data-page="shop"]')
    const y = p.scrollTop
    A.showPage('shop', true)
    p.scrollTop = y
    const f = focus && $(focus, p)
    if (f) f.focus({ preventScroll: true })
  }

  // ------------------------------------------------------------------ chips where it applies
  /** The area plate on Home (and the area cards): ×5 with a sparkle where the Shiny Parade covers it. */
  A.liveChip = (a) => {
    const e = visible()
    if (!e || e.type !== 'shiny' || !covers(e, a)) return ''
    return `<span class="lv-chip" title="Shiny Parade: shiny odds ×${e.shiny.mult} here">×${e.shiny.mult}${spark}</span>`
  }
  A.liveTag = (a) => {
    const e = visible()
    if (!e || e.type !== 'shiny' || !covers(e, a)) return ''
    return `<span class="hm-gym lv-gtag">×${e.shiny.mult} SHINY</span>`
  }
  /** The purse in the top bar (Cash Flow) and the Shop tab (Special Shop). */
  function chips() {
    const e = visible()
    let purse = $('#lv-purse')
    if (!purse) {
      purse = document.createElement('span')
      purse.id = 'lv-purse'
      purse.className = 'lv-purse'
      $('#hm-pill').before(purse)
    }
    purse.hidden = !(e && e.type === 'cash')
    if (e && e.type === 'cash') {
      purse.textContent = `+${pct(e.cash.mult)} %`
      purse.title = `Cash Flow: every ₽ you earn +${pct(e.cash.mult)} %`
    }
    const tab = $('#hm-nav [data-tab="shop"]')
    let sale = $('.lv-navtag', tab)
    if (!sale) {
      sale = document.createElement('i')
      sale.className = 'lv-navtag'
      sale.textContent = 'SALE'
      tab.appendChild(sale)
    }
    sale.hidden = !(e && e.type === 'shop')
    tab.setAttribute('aria-label', e && e.type === 'shop' ? 'Shop: Special Shop running' : 'Shop')
  }

  // ------------------------------------------------------------------ refresh
  function refresh() {
    A.renderEventWidgets && A.renderEventWidgets()
    A.renderArea && A.renderArea()
    chips()
    const p = $('.hm-page[data-page="shop"]')
    if (p && !p.hidden) reshop()
    const ov = $('#lv-ov')
    if (ov && !ov.hidden && !visible()) ov.hidden = true
  }
  /** The timers tick without rebuilding anything; an event that ends takes its square with it. */
  function tick() {
    const e = visible()
    const had = $('[data-lv]')
    if (!e) {
      if (had) refresh()
      return
    }
    $$('[data-lv-left]').forEach((s) => (s.textContent = s.dataset.lvLeft === 'pop' ? `${dur(left(e))} left` : `Ends in ${dur(left(e))}`))
    $$('.lv-gauge i').forEach((i) => (i.style.width = `${(frac(e) * 100).toFixed(1)}%`))
    if (had) had.classList.toggle('hot', hot(e))
  }
  function pickChanged() {
    schedule()
    LV.open = null
    LV.edit = (liveEvent() || LV.events[0]).id
    // In the game each event is new to the player once; in the lab each pick plays as a new one.
    if (liveEvent()) LV.seen.delete(liveEvent().id)
    refresh()
    admin()
    const e = visible()
    if (e && !LV.seen.has(e.id)) {
      A.showPage('home')
      popWhenFree(e)
    } else if (liveEvent() && !e) A.toast(`This save has ${A.SAVE.badges} badges: the event shows from ${liveEvent().minBadges}`)
  }

  // ------------------------------------------------------------------ the preview bar
  function controls() {
    const box = $('#lv-controls')
    if (!box || box.dataset.bound) return
    box.dataset.bound = '1'
    const mark = (attr, v) => $$(`[${attr}]`, box).forEach((x) => x.setAttribute('aria-checked', String(x.getAttribute(attr) === v)))
    mark('data-lvpick', LV.pick)
    mark('data-lvtime', LV.time)
    mark('data-lvwide', String(LV.wide))
    box.addEventListener('click', (ev) => {
      let b
      if ((b = ev.target.closest('[data-lvpick]'))) {
        LV.pick = b.dataset.lvpick
        mark('data-lvpick', LV.pick)
        return pickChanged()
      }
      if ((b = ev.target.closest('[data-lvtime]'))) {
        LV.time = b.dataset.lvtime
        mark('data-lvtime', LV.time)
        schedule()
        refresh()
        return admin()
      }
      if ((b = ev.target.closest('[data-lvwide]'))) {
        LV.wide = b.dataset.lvwide === 'true'
        mark('data-lvwide', String(LV.wide))
        A.showPage('home')
        return refresh()
      }
      if (ev.target.closest('[data-lvpop]')) {
        const e = visible()
        A.showPage('home')
        if (!e) return A.toast(liveEvent() ? `The event shows from ${liveEvent().minBadges} badges` : 'No live event in this preview: pick one above')
        return popup(e)
      }
      if (ev.target.closest('[data-lvwin]')) {
        A.showPage('home')
        return victory()
      }
    })
  }

  // ------------------------------------------------------------------ the admin mock
  function admin() {
    const el = $('#lv-admin')
    if (!el) return
    const now = Date.now()
    const ed = byId(LV.edit) || LV.events[0]
    LV.edit = ed.id
    const list = [...LV.events].sort((a, b) => b.start - a.start)
    const chip = (st) => `<span class="ad-st ${st}">${st === 'live' ? 'Live' : st === 'scheduled' ? 'Scheduled' : 'Ended'}</span>`
    const clash = LV.events.find((o) => o !== ed && o.start < ed.end && ed.start < o.end)
    const opt = (v, cur, label = v) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`
    const wild = A.K.areas.filter((a) => a.dex && a.dex.length)
    let body = ''
    if (ed.type === 'shiny') {
      const s = ed.shiny
      body = `<div class="ad-grid"><label><span>Shiny odds ×</span><input type="number" data-lvf="shiny.mult" value="${s.mult}" min="1" max="100" step="0.5" /></label>
        <label><span>Where</span><select data-lvf="shiny.scope">${opt('areas', s.scope, 'Some areas')}${opt('region', s.scope, 'One region')}${opt('all', s.scope, 'The whole game')}</select></label>
        ${s.scope === 'region' ? `<label><span>Region</span><select data-lvf="shiny.region">${REGIONS.map((r) => opt(r, s.region)).join('')}</select></label>` : ''}</div>
        ${s.scope === 'areas' ? `<fieldset class="ad-areas"><legend>Areas (${s.areas.length})</legend>${wild.map((a) => `<label><input type="checkbox" data-lvarea="${a.order}"${s.areas.includes(a.order) ? ' checked' : ''} />${esc(a.name)}</label>`).join('')}</fieldset>` : ''}
        <p class="ad-note">Wild encounters only: trainers, bosses, Eggs and raids keep their odds; legendaries stay shiny-locked. The game's base odds × this number.</p>`
    } else if (ed.type === 'cash') {
      body = `<div class="ad-grid"><label><span>₽ earned +%</span><input type="number" data-lvf="cash.pct" value="${pct(ed.cash.mult)}" min="1" max="500" step="5" /></label></div>
        <p class="ad-note">Every ₽ earned × ${ed.cash.mult}: trainers and Gyms, ₽ found in areas, the Elite Rebattle, the Game Corner, the Day Care, the wheel. Selling isn't boosted.</p>`
    } else {
      body = `<table class="ad-t"><thead><tr><th>Item</th><th>Event price</th><th>Mart</th><th>Limit / trainer</th><th>Sold in</th><th></th></tr></thead><tbody>${ed.shop
        .map((r, i) => {
          const it = ITEM(r.key)
          return `<tr><td><select data-lvs="${i}" data-k="key" aria-label="Item ${i + 1}">${A.G.items.map((x) => opt(x.key, r.key, x.name)).join('')}</select></td>
            <td><input type="number" data-lvs="${i}" data-k="price" value="${r.price}" min="1" aria-label="${esc(it.name)} event price" /></td>
            <td>${it.shop ? `${money(it.price)}${r.price < it.price ? ` <span class="ok">−${Math.round((1 - r.price / it.price) * 100)} %</span>` : ''}` : '<span class="ok">never sold</span>'}</td>
            <td><input type="number" data-lvs="${i}" data-k="limit" value="${r.limit ?? ''}" min="1" placeholder="none" aria-label="${esc(it.name)} limit per trainer" /></td>
            <td><select data-lvs="${i}" data-k="regions" aria-label="${esc(it.name)} regions">${opt('all', r.regions === 'all' ? 'all' : r.regions[0], 'Every region')}${REGIONS.map((g) => opt(g, r.regions === 'all' ? 'all' : r.regions[0])).join('')}</select></td>
            <td><button type="button" class="btn small" data-lvrm="${i}" aria-label="Remove ${esc(it.name)}">✕</button></td></tr>`
        })
        .join('')}</tbody></table>
        <div class="ad-dev"><button type="button" class="btn small" data-lvadd>Add an item</button></div>
        <p class="ad-note">Empty limit = no limit. A region-only item is sold while the player plays that region. Items the Mart sells keep their usual row too.</p>`
    }
    el.innerHTML = `
      <div class="ad-sec"><h3>Live events</h3>
        <table class="ad-t"><thead><tr><th>Event</th><th>Type</th><th>Starts (UTC)</th><th>Ends (UTC)</th><th>State</th><th></th></tr></thead><tbody>${list
          .map((e) => {
            const st = stateOf(e, now)
            return `<tr${e.id === ed.id ? ' class="sel"' : ''}><td>${esc(titleOf(e))}<small>${esc(subOf(e))}</small></td><td>${NAME[e.type]}</td><td>${isoUTC(e.start).replace('T', ' ')}</td><td>${isoUTC(e.end).replace('T', ' ')}</td><td>${chip(st)}</td>
              <td class="ad-acts"><button type="button" class="btn small" data-lvedit="${e.id}">Edit</button>${st === 'live' ? `<button type="button" class="btn small" data-lvend="${e.id}">End now</button>` : ''}</td></tr>`
          })
          .join('')}</tbody></table>
        <p class="ad-note">One live event at a time: saving one that overlaps another is refused. It starts and ends by itself at those times, for everyone (server time).</p></div>
      <div class="ad-sec"><h3>Edit · ${esc(titleOf(ed))} ${chip(stateOf(ed, now))}</h3>
        <div class="ad-grid">
          <label><span>Type</span><select data-lvf="type">${TYPES.map((t) => opt(t, ed.type, NAME[t])).join('')}</select></label>
          <label><span>Banner</span><select data-lvf="banner">${Object.keys(ART).map((b) => opt(b, ed.banner)).join('')}</select></label>
          <label><span>Badges needed</span><input type="number" data-lvf="minBadges" value="${ed.minBadges}" min="0" max="40" /></label>
          <label class="ad-wide"><span>Custom title</span><input type="text" data-lvf="title" value="${esc(ed.title)}" placeholder="${esc(NAME[ed.type])} (automatic, translated)" maxlength="28" /></label>
          <label class="ad-wide"><span>Starts (UTC)</span><input type="datetime-local" data-lvf="start" value="${isoUTC(ed.start)}" /><small>${esc(when(ed.start))} your time</small></label>
          <label class="ad-wide"><span>Ends (UTC)</span><input type="datetime-local" data-lvf="end" value="${isoUTC(ed.end)}" /><small>${esc(when(ed.end))} your time · ${dur(ed.end - ed.start)}</small></label>
        </div>
        ${clash ? `<p class="ad-note bad">Overlaps “${esc(titleOf(clash))}” (${esc(when(clash.start))} → ${esc(when(clash.end))}): one live event at a time, the admin won’t save this.</p>` : ''}
        ${body}
        <div class="ad-dev"><button type="button" class="btn small" data-lvprev>Show its pop-up</button></div></div>`
    if (el.dataset.bound) return
    el.dataset.bound = '1'
    el.addEventListener('change', (ev) => {
      const t = ev.target
      const e = byId(LV.edit)
      if (t.dataset.lvf) {
        const f = t.dataset.lvf
        if (f === 'type') {
          // A type change keeps the dates and the banner; the settings start from the type's defaults.
          e.type = t.value
          e.shiny = e.shiny || { mult: 5, scope: 'all', region: 'Kanto', areas: [] }
          e.shop = e.shop || [{ key: 'ultra-ball', price: 75, limit: 10, regions: 'all' }]
          e.cash = e.cash || { mult: 1.5 }
        } else if (f === 'banner') e.banner = t.value
        else if (f === 'title') e.title = t.value
        else if (f === 'minBadges') e.minBadges = Math.max(0, Number(t.value) || 0)
        else if (f === 'start' || f === 'end') {
          const ms = Date.parse(`${t.value}:00Z`)
          if (Number.isFinite(ms)) e[f] = ms
          e.days = Math.max(1 / 24, (e.end - e.start) / DAY)
        } else if (f === 'shiny.mult') e.shiny.mult = Math.max(1, Number(t.value) || 1)
        else if (f === 'shiny.scope') e.shiny.scope = t.value
        else if (f === 'shiny.region') e.shiny.region = t.value
        else if (f === 'cash.pct') e.cash.mult = 1 + Math.max(1, Number(t.value) || 1) / 100
      } else if (t.dataset.lvarea) {
        const o = Number(t.dataset.lvarea)
        e.shiny.areas = t.checked ? [...e.shiny.areas, o].sort((a, b) => a - b) : e.shiny.areas.filter((x) => x !== o)
      } else if (t.dataset.lvs != null) {
        const r = e.shop[Number(t.dataset.lvs)]
        const k = t.dataset.k
        if (k === 'key') r.key = t.value
        else if (k === 'price') r.price = Math.max(1, Number(t.value) || 1)
        else if (k === 'limit') r.limit = t.value === '' ? null : Math.max(1, Number(t.value) || 1)
        else if (k === 'regions') r.regions = t.value === 'all' ? 'all' : [t.value]
      } else return
      admin()
      refresh()
    })
    el.addEventListener('click', (ev) => {
      let b
      const e = byId(LV.edit)
      if ((b = ev.target.closest('[data-lvedit]'))) {
        LV.edit = b.dataset.lvedit
        return admin()
      }
      if ((b = ev.target.closest('[data-lvend]'))) {
        byId(b.dataset.lvend).end = Date.now() - 1000
        A.toast(`${titleOf(byId(b.dataset.lvend))} ended for everyone`)
        admin()
        return refresh()
      }
      if ((b = ev.target.closest('[data-lvrm]'))) {
        e.shop.splice(Number(b.dataset.lvrm), 1)
        admin()
        return refresh()
      }
      if (ev.target.closest('[data-lvadd]')) {
        e.shop.push({ key: 'max-revive', price: 300, limit: 2, regions: 'all' })
        admin()
        return refresh()
      }
      if (ev.target.closest('[data-lvprev]')) {
        A.showPage('home')
        return popup(e)
      }
    })
  }

  // ------------------------------------------------------------------ wiring
  function reset() {
    if (!LV.events[0].start) {
      schedule()
      // The lab opens with the Shiny Parade running and its pop-up already seen (the preview bar replays it).
      LV.events.forEach((e) => LV.seen.add(e.id))
      LV.edit = (liveEvent() || LV.events[0]).id
    }
    LV.open = null
    controls()
    admin()
    // events.js drew the events stack before this ran: draw it again with the square.
    refresh()
  }
  $('#hm-events') &&
    $('#hm-events').addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-lv]')) return
      const e = visible()
      if (!e) return
      if (e.type === 'shop') return openShop()
      popup(e)
    })
  const shopPage = $('.hm-page[data-page="shop"]')
  shopPage && shopPage.addEventListener('click', shopClick)
  // A page with no screen of its own: only its reset runs with each preview save.
  HOME.page('live', { render() {}, reset, dot: null })
  setInterval(tick, 15000)
})()
