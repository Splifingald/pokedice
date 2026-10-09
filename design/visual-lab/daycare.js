/*
 * Pokédice Visual Lab: the Day Care, from its Home widget (Johto Daybreak, Jersey 20).
 * Two slots that train while you're away, a drop-off list with search, and the Egg: bought (or free, once) and hatched
 * on the spot with the Animations tab's hatching timeline. Rules from src/engine/daycare.ts and src/data/config.json.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco, plural } = A
  const UI = () => window.PDUI
  // Eggs hatch into the first form of an evolving line, Kanto's own, starters excluded; missing ones 4× as likely.
  // The prototype keeps to the ones it has a sprite for.
  const EGG_POOL = [147, 133, 102, 84, 46, 48, 111, 79]
  const EGG = { unowned: 4, rank: 3, offset: 5, min: 5 }
  const ST = { q: '' }

  // ------------------------------------------------------------------ the page
  function render(p) {
    const S = A.SAVE,
      DC = A.DC
    const used = S.dayCare.filter(Boolean).length
    p.innerHTML = `
      <div class="pg-head"><button type="button" class="pg-back" data-home aria-label="Back to Home"></button><h2>Day Care</h2><span class="pg-count">${used}/${DC.slots}</span></div>
      <p class="pg-note">Up to ${DC.slots} Pokémon train here, even while you’re away: +${DC.per} XP every ${DC.tick} min, up to ${DC.max} XP a stay. They level up here, and evolve once back in battle.</p>
      <ul class="dc-slots">${S.dayCare.map((d, i) => (d ? resident(d, i) : empty(i))).join('')}</ul>
      <div class="pg-sec-h"><h3>Eggs</h3>${S.eggFree ? '<span class="dc-free">1 FREE</span>' : ''}</div>
      ${eggCard()}`
  }
  function resident(d, i) {
    const DC = A.DC,
      full = A.dcReady(d)
    const lvNow = d.lv + (d.gain || 0)
    const status = full
      ? 'Full: it has learned all it can here. Pick it up!'
      : `+${DC.per} XP in ${d.next ?? DC.tick} min · full in ${A.dcLong(A.dcLeft(d))}`
    return `<li class="dc-res${full ? ' ready' : ''}">
      ${A.sprCanvas(d.dex, 96, 84)}
      <div class="dc-res-t">
        <span class="dc-name"><b>${esc(d.name)}</b>${full ? '<span class="dc-tag">READY</span>' : ''}</span>
        <span class="dc-lv">Lv.${d.lv}${d.gain ? ` <i aria-hidden="true">→</i> <b>Lv.${lvNow}</b>` : ''}</span>
        <span class="dc-xp" role="img" aria-label="${d.xp} of ${DC.max} XP"><i style="width:${(d.xp / DC.max) * 100}%"></i></span>
        <small>${d.xp} of ${DC.max} XP · ${status}</small>
      </div>
      <button type="button" class="ui-btn${full ? ' primary' : ''} dc-take" data-take="${i}" aria-label="Take back ${esc(d.name)}"><span>Take back</span></button>
    </li>`
  }
  const empty = (i) =>
    `<li class="dc-res empty"><button type="button" class="dc-leave" data-leave="${i}"><span class="dc-plus" aria-hidden="true">+</span><span><b>Leave a Pokémon</b><small>From your team or your Box</small></span></button></li>`
  function eggCard() {
    const S = A.SAVE,
      price = A.DC.egg
    const poor = !S.eggFree && S.gold < price
    const lv = hatchLevel()
    const missing = EGG_POOL.filter((d) => !A.caught.has(d)).length
    return `<div class="dc-egg${S.eggFree ? ' free' : ''}">
      <canvas class="pg-spr dc-eggspr" width="72" height="72" data-key="front-egg" data-ph="0" aria-hidden="true"></canvas>
      <div class="dc-egg-t">
        <b>${S.eggFree ? 'An Egg for you!' : 'Buy an Egg'}</b>
        <p>${S.eggFree ? 'The Day Care couple found an Egg. They’d like you to have it: it’s about to hatch!' : `It hatches straight away into a young Pokémon, often one you don’t have yet. ₽${price} each.`}</p>
        <ul class="dc-facts"><li>Hatches at <b>Lv.${lv}</b></li><li>${missing ? `<b>${missing}</b> you don’t have, 4× as likely` : 'You have them all: any of them'}</li></ul>
      </div>
      <button type="button" class="ui-btn primary dc-buy" data-egg${poor ? ' disabled' : ''}><span>${S.eggFree ? 'Take the Egg' : poor ? `Need ${A.money(price - S.gold)} more` : `Buy · ${A.money(price)}`}</span></button>
    </div>`
  }
  /** The hatchling's level: the 3rd lowest level you own (or the highest, with fewer), minus 5, at least 5. */
  function hatchLevel() {
    const lv = A.owned()
      .map((m) => m.lv)
      .sort((a, b) => a - b)
    const ref = lv[Math.min(EGG.rank, lv.length) - 1] ?? EGG.min
    return Math.max(EGG.min, ref - EGG.offset)
  }

  // ------------------------------------------------------------------ leave one: the drop-off sheet
  function leaveSheet(slot) {
    ST.slot = slot
    ST.q = ''
    $('#hm-s2-title').textContent = 'Leave which Pokémon?'
    $('#hm-s2-sub').textContent =
      `It leaves your team or Box while it trains: +${A.DC.per} XP every ${A.DC.tick} min, up to ${A.DC.max} XP.`
    $('#hm-s2-body').innerHTML =
      `<div class="pg-tools"><label class="sr" for="dc-q">Search your Pokémon</label><input id="dc-q" type="search" placeholder="Search your Pokémon" autocomplete="off" spellcheck="false" /></div><ul class="dc-pick" id="dc-pick"></ul>`
    $('#hm-s2-foot').hidden = true
    pickList()
    A.openDialog($('#hm-sheet2'), $('#dc-q'))
  }
  function pickList() {
    const q = A.fold(ST.q.trim())
    const team = A.TEAM.length
    // The team first (the ones you'd train most), then the Box, lowest level first: they gain the most from a stay.
    const rows = A.owned()
      .filter((m) => !q || A.fold(m.name || A.K.names[m.dex]).includes(q))
      .sort((a, b) => (a.where === b.where ? a.lv - b.lv : a.where === 'team' ? -1 : 1))
    $('#dc-pick').innerHTML =
      rows
        .map((m) => {
          const last = m.where === 'team' && team <= 1
          const name = m.name || A.K.names[m.dex]
          return `<li><button type="button" class="pg-useit" data-put="${m.where === 'team' ? `t${m.i}` : m.uid}"${last ? ' disabled' : ''}>${dexIco(m.dex)}<span><b>${esc(name)}</b><small>${last ? 'Your last team member' : `Lv.${m.lv} · gains up to ${A.DC.max} XP`}</small></span>${m.where === 'team' ? '<em class="dc-teamtag">TEAM</em>' : ''}</button></li>`
        })
        .join('') || '<li class="hm-empty">No Pokémon by that name.</li>'
  }
  function put(ref) {
    let m
    if (ref[0] === 't') {
      const i = Number(ref.slice(1))
      ;[m] = A.TEAM.splice(i, 1)
      A.refreshTeam()
    } else m = A.boxRemove(ref)
    if (!m) return
    const name = m.name || A.K.names[m.dex]
    A.SAVE.dayCare[ST.slot] = { dex: m.dex, name, lv: m.lv, gain: 0, xp: 0, next: A.DC.tick, shiny: m.shiny }
    A.closeAll()
    rerender()
    A.toast(`${name} is staying at the Day Care`)
  }

  // ------------------------------------------------------------------ take one back
  function take(i) {
    const S = A.SAVE,
      d = S.dayCare[i]
    if (!d) return
    const lv = d.lv + (d.gain || 0)
    const max = A.hpAt(d.dex, lv)
    S.dayCare[i] = null
    const team = joinTeam(d.dex, lv, max)
    if (!team) A.boxAdd({ dex: d.dex, lv, hp: [max, max], shiny: d.shiny })
    rerender()
    A.renderWidgets()
    const grew = d.gain
      ? `It gained ${d.xp} XP and grew ${plural(d.gain, 'level')}.`
      : `It gained ${d.xp} XP.`
    A.toast(
      `${d.name} is back! ${grew} ${team ? 'It rejoined your team.' : 'Your team is full: it went to the Box.'}`,
    )
  }
  /** Into the team when there's room (it needs a sprite to roam Home), else the Box. */
  function joinTeam(dex, lv, max) {
    if (A.TEAM.length >= 3) return false
    const known = A.MONS.find((m) => m.dex === dex)
    const key = A.spriteKey(dex)
    if (!known && !key) return false
    const base = known || { dex, key, name: A.K.names[dex], hpLv: 3, speed: 14, hop: 2 }
    A.TEAM.push({ ...base, lv, hp: [max, max], xp: 0 })
    A.refreshTeam()
    return true
  }

  // ------------------------------------------------------------------ the Egg
  function pickEgg() {
    const pool = EGG_POOL.map((d) => ({ d, w: A.caught.has(d) ? 1 : EGG.unowned }))
    let x = Math.random() * pool.reduce((n, o) => n + o.w, 0)
    for (const o of pool) if ((x -= o.w) <= 0) return o.d
    return pool[0].d
  }
  function hatch() {
    const S = A.SAVE,
      price = A.DC.egg
    const free = !!S.eggFree
    if (!free && S.gold < price) return
    if (free) S.eggFree = false
    else S.gold -= price
    A.renderTop()
    const dex = pickEgg(),
      lv = hatchLevel(),
      name = A.K.names[dex]
    const isNew = !A.caught.has(dex)
    // One copy of a species is kept: a stronger hatchling replaces the weakest copy, a weaker one isn't kept.
    const copies = A.owned().filter((m) => m.dex === dex)
    const best = Math.max(0, ...copies.map((m) => m.lv))
    let where
    const max = A.hpAt(dex, lv)
    if (copies.length && best >= lv)
      where = `You already have a stronger ${name}: the Day Care couple will look after this one.`
    else if (copies.length) {
      const weak = copies.sort((a, b) => a.lv - b.lv)[0]
      if (weak.where === 'team') {
        Object.assign(A.TEAM[weak.i], { lv, hp: [max, max] })
        A.refreshTeam()
      } else {
        A.boxRemove(weak.uid)
        A.boxAdd({ dex, lv, hp: [max, max] })
      }
      where = `It replaced your Lv.${weak.lv} ${name}.`
    } else if (joinTeam(dex, lv, max)) where = 'It joined your team.'
    else {
      A.boxAdd({ dex, lv, hp: [max, max] })
      where = 'Your team is full: it went to the Box.'
    }
    if (isNew) {
      A.caught.add(dex)
      S.dexSeen = false
    }
    moment(dex, name, lv, isNew, where)
  }
  /** The hatching, full screen over the phone: the Animations tab's timeline, then what hatched and where it went. */
  function moment(dex, name, lv, isNew, where) {
    let el = $('#dc-moment')
    if (!el) {
      el = document.createElement('div')
      el.id = 'dc-moment'
      el.className = 'dc-moment'
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-modal', 'true')
      el.setAttribute('aria-label', 'Egg hatching')
      $('.hm-screen').appendChild(el)
    }
    el.innerHTML = `<div class="dc-m-stage"><canvas width="240" height="160" aria-hidden="true"></canvas></div>
      <p class="dc-m-say ui-dialog" aria-live="polite">…</p>
      <div class="dc-m-end" hidden></div>
      <button type="button" class="dc-m-skip">Skip</button>`
    el.hidden = false
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
    const key = A.spriteKey(dex) || 'front-eevee'
    const pl = new ANIM.Player(cv, hud)
    pl.load(ANIM.MAKE.hatch({ key, name }), { style: 'daybreak' })
    const done = () => {
      pl.pause()
      sayEl.textContent = `${name} hatched from the Egg!`
      $('.dc-m-skip', el).hidden = true
      const end = $('.dc-m-end', el)
      end.hidden = false
      end.innerHTML = `<p class="dc-m-who">${dexIco(dex)}<b>${esc(name)}</b><span>Lv.${lv}</span>${isNew ? '<em>NEW</em>' : ''}</p><p class="dc-m-where">${esc(where)}</p>
        <div class="dc-m-btns"><button type="button" class="ui-btn" data-m-close><span>Done</span></button>${A.SAVE.gold >= A.DC.egg ? `<button type="button" class="ui-btn primary" data-m-again><span>Another · ${A.money(A.DC.egg)}</span></button>` : ''}</div>`
      $('[data-m-close]', end).focus({ preventScroll: true })
    }
    pl.onEnd = done
    $('.dc-m-skip', el).onclick = () => {
      // Skip: straight to the hatched Pokémon.
      pl.t = ANIM.MAKE.hatch({ key, name }).dur - 0.01
      pl.advance(0.02)
      pl.render()
      done()
    }
    if (A.REDUCED) {
      pl.t = 8.9
      pl.advance(0.02)
      pl.render()
      done()
    } else pl.play()
    $('.dc-m-skip', el).focus({ preventScroll: true })
    el.onclick = (e) => {
      if (e.target.closest('[data-m-close]')) close()
      if (e.target.closest('[data-m-again]')) {
        close()
        hatch()
      }
    }
    el.onkeydown = (e) => e.key === 'Escape' && !$('.dc-m-end', el).hidden && close()
    function close() {
      pl.pause()
      el.hidden = true
      rerender()
      A.renderNavDots()
      A.renderWidgets()
      const b = $('[data-egg]')
      if (b) b.focus({ preventScroll: true })
    }
  }

  // ------------------------------------------------------------------ wiring
  const rerender = () => {
    const p = $('.hm-page[data-page="daycare"]')
    if (!p.hidden) render(p)
  }
  HOME.page('daycare', {
    render(p) {
      if (!p.dataset.bound) {
        p.dataset.bound = '1'
        p.addEventListener('click', (e) => {
          const t = e.target
          let b
          if (t.closest('[data-home]')) return A.showPage('home')
          if ((b = t.closest('[data-take]'))) return take(Number(b.dataset.take))
          if ((b = t.closest('[data-leave]'))) return leaveSheet(Number(b.dataset.leave))
          if (t.closest('[data-egg]')) return hatch()
        })
      }
      render(p)
    },
    leave() {
      const m = $('#dc-moment')
      if (m) m.hidden = true
    },
    dot: null,
  })
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'dc-q') return
    ST.q = e.target.value
    pickList()
  })
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-put]')
    if (b && !b.disabled) put(b.dataset.put)
  })
})()
