/*
 * Pokédice Visual Lab: picking a partner when a new region opens (Johto Daybreak, Jersey 20).
 * From the Regions view, ENTER: in the professor's lab, three Poké Balls drop from above onto the table. Tap one and the Pokémon inside comes
 * out; "Do you want to pick it?" with its type, what it hits hard, what hits it hard and its dice. Yes makes it your
 * partner; no sends it back into its ball. The scene is the Animations tab's (ANIM.StarterScene); this file drives it
 * from taps and keys.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, esc } = A
  const UI = () => window.PDUI
  const cap = (s) => s[0].toUpperCase() + s.slice(1)
  const BALL_AT = [60, 120, 180] // the scene's slots, in stage pixels

  /** The region's three, as the scene wants them; a region without its own set borrows names and sprites by number. */
  function setFor(r) {
    const own = ANIM.STARTER_SETS[r.id]
    if (own) return own
    const slug = (d) => A.fold(A.K.names[d]).replace(/[^a-z]/g, '')
    return {
      ...ANIM.STARTER_SETS.johto,
      region: r.name,
      mons: r.starters.map((d) => ({
        dex: d,
        key: `front-${slug(d)}`,
        name: A.K.names[d],
        types: A.K.types[d],
      })),
    }
  }
  /** What a type hits hard and what hits it hard, from the game's chart. */
  function matchups(types) {
    const chart = A.G.chart
    const all = Object.keys(chart)
    const strong = all.filter((d) => types.some((t) => (chart[t] || {})[d] === 2))
    const weak = all.filter((a) => types.reduce((m, t) => m * ((chart[a] || {})[t] ?? 1), 1) > 1)
    return { strong, weak }
  }

  let M = null // the moment in progress
  function start(regionId) {
    const r = A.K.regions.find((x) => x.id === regionId)
    const set = setFor(r)
    const el = document.createElement('div')
    el.className = 'hm-moment'
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    el.setAttribute('aria-label', `Pick your partner in ${r.name}`)
    el.innerHTML = `<div class="hm-mo-stage"><canvas width="240" height="160" aria-hidden="true"></canvas>
        <div class="hm-mo-hits">${BALL_AT.map((x, i) => `<button type="button" class="hm-mo-ball" data-ball="${i}" style="left:${(x / 240) * 100}%" aria-label="Poké Ball ${i + 1} of 3" disabled></button>`).join('')}</div>
        <button type="button" class="hm-mo-x" data-leave aria-label="Not now, back to the regions">✕</button></div>
      <p class="hm-mo-say ui-dialog" aria-live="polite"></p>
      <div class="hm-mo-ask" hidden></div>
      <div class="hm-mo-end" hidden></div>`
    $('.hm-screen').appendChild(el)
    const cv = $('canvas', el),
      g = cv.getContext('2d')
    g.imageSmoothingEnabled = false
    M = {
      r,
      set,
      el,
      g,
      t: 0,
      last: performance.now(),
      state: 'intro',
      scene: new ANIM.StarterScene(set, { instant: A.REDUCED }),
      raf: 0,
    }
    if (A.REDUCED) M.state = 'choose'
    say(`Welcome to ${r.name}!`)
    el.addEventListener('click', onClick)
    el.addEventListener('keydown', onKey)
    el.addEventListener('pointermove', onHover)
    loop()
    $('[data-leave]', el).focus({ preventScroll: true })
  }
  function say(msg) {
    $('.hm-mo-say', M.el).textContent = msg
  }
  function loop() {
    const frame = (now) => {
      if (!M) return
      const dt = Math.min(0.05, (now - M.last) / 1000)
      M.last = now
      M.t += dt
      const s = M.scene
      if (M.state === 'intro' && M.t >= s.landed) toChoose()
      s.step(M.t, dt)
      M.g.clearRect(0, 0, 240, 160)
      s.draw(M.g, M.t)
      M.raf = requestAnimationFrame(frame)
    }
    M.raf = requestAnimationFrame(frame)
  }
  function toChoose() {
    M.state = 'choose'
    say('Choose your partner! Tap a Poké Ball.')
    M.el.querySelectorAll('[data-ball]').forEach((b) => (b.disabled = false))
  }
  /** A ball opens: its Pokémon comes out, and the question with everything you need to answer it. */
  function open(i) {
    const s = M.scene
    if (M.state !== 'choose') return
    s.openBall(i, M.t)
    s.focus = i
    M.state = 'ask'
    M.pick = i
    const m = M.set.mons[i]
    const mu = matchups(m.types)
    const kit = (A.G.starters || {})[m.dex]
    const badges = (list) =>
      list.length ? list.map((t) => UI().typeBadge(t)).join('') : '<span class="hm-ask-none">None</span>'
    M.el
      .querySelectorAll('[data-ball]')
      .forEach((b, k) =>
        b.setAttribute('aria-label', k === i ? `${m.name}, out of its ball` : `Poké Ball ${k + 1} of 3`),
      )
    setTimeout(
      () => {
        if (!M || M.pick !== i || M.state !== 'ask') return
        say(`Do you want to pick ${m.name}?`)
        const ask = $('.hm-mo-ask', M.el)
        ask.innerHTML = `<div class="hm-ask-head">${A.dexIco(m.dex, 'x2')}<span><b>${esc(m.name)}</b><span class="ui-types">${m.types.map((t) => UI().typeBadge(t)).join('')}</span></span></div>
        <dl class="hm-ask-facts">
          <dt>Strong vs</dt><dd>${badges(mu.strong)}</dd>
          <dt>Weak to</dt><dd>${badges(mu.weak)}</dd>
          ${kit ? `<dt>Dice</dt><dd class="hm-ask-dice">${kit.dice.flatMap(([t, n]) => Array.from({ length: n }, () => UI().die(t, 6, { size: 26 }))).join('')}<small>${kit.dice.map(([t, n]) => `${n} ${cap(t)}`).join(' + ')} · ${A.plural(kit.rr, 'reroll')}</small></dd>` : ''}
        </dl>
        <div class="hm-ask-btns"><button type="button" class="ui-btn" data-no><span>Not this one</span></button><button type="button" class="ui-btn primary" data-yes><span>Pick ${esc(m.name)}</span></button></div>`
        ask.hidden = false
        $('[data-yes]', ask).focus({ preventScroll: true })
      },
      A.REDUCED ? 0 : 520,
    )
  }
  /** No: it goes back into its ball, and the choice is open again. */
  function back() {
    const i = M.pick
    M.scene.closeBall(i, M.t)
    M.state = 'choose'
    M.pick = null
    $('.hm-mo-ask', M.el).hidden = true
    say('Choose your partner! Tap a Poké Ball.')
    M.el
      .querySelectorAll('[data-ball]')
      .forEach((b, k) => b.setAttribute('aria-label', `Poké Ball ${k + 1} of 3`))
    $(`[data-ball="${i}"]`, M.el).focus({ preventScroll: true })
  }
  /** Yes: the other two fly home, the partner celebrates, then off to the region. */
  function yes() {
    const i = M.pick,
      m = M.set.mons[i]
    M.scene.choose(i, M.t)
    M.state = 'done'
    $('.hm-mo-ask', M.el).hidden = true
    M.el.querySelectorAll('[data-ball]').forEach((b) => (b.disabled = true))
    say(`${m.name} is your partner! Your ${M.r.name} journey begins.`)
    setTimeout(
      () => {
        if (!M) return
        const end = $('.hm-mo-end', M.el)
        end.innerHTML = `<button type="button" class="ui-btn primary wide" data-go><span>Let’s go!</span></button>`
        end.hidden = false
        $('[data-go]', end).focus({ preventScroll: true })
      },
      A.REDUCED ? 0 : 1600,
    )
    A.SAVE.partner = m.dex
    A.SAVE.offerSeen = true
  }
  function close(toRegions) {
    if (!M) return
    cancelAnimationFrame(M.raf)
    M.el.remove()
    const done = A.SAVE.partner
    const r = M.r
    M = null
    A.renderAreasBtn()
    if (toRegions) A.openRegions()
    else if (done) A.toast(`${A.K.names[done]} is your partner in ${r.name}!`)
  }
  function onClick(e) {
    const t = e.target
    let b
    if (t.closest('[data-leave]')) return close(!A.SAVE.partner || M.state !== 'done')
    if (t.closest('[data-go]')) return close(false)
    if (t.closest('[data-no]')) return back()
    if (t.closest('[data-yes]')) return yes()
    if ((b = t.closest('[data-ball]'))) {
      // Another ball while one is out: the first goes back in, the new one comes out.
      const i = Number(b.dataset.ball)
      if (M.state === 'ask') {
        if (i === M.pick) return
        back()
      }
      return open(i)
    }
    // A tap during the drop lets the balls land at once.
    if (M.state === 'intro' && t.closest('.hm-mo-stage')) {
      M.t = Math.max(M.t, M.scene.landed)
      M.scene.done.add('l0').add('l1').add('l2').add('b0').add('b1').add('b2')
    }
  }
  function onHover(e) {
    const b = e.target.closest('[data-ball]')
    if (M && M.state === 'choose') M.scene.focus = b ? Number(b.dataset.ball) : M.scene.focus
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (M.state === 'ask') return back()
      return close(M.state !== 'done')
    }
    // Focus on a ball moves the arrow there; Tab stays inside the moment.
    const b = e.target.closest && e.target.closest('[data-ball]')
    if (b && M.state === 'choose') M.scene.focus = Number(b.dataset.ball)
    if (e.key === 'Tab') {
      const f = [...M.el.querySelectorAll('button:not([disabled])')].filter((x) => x.offsetParent)
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault()
        f[0].focus()
      }
    }
  }
  document.addEventListener('focusin', (e) => {
    const b = M && e.target.closest && e.target.closest('.hm-moment [data-ball]')
    if (b && M.state === 'choose') M.scene.focus = Number(b.dataset.ball)
  })
  A.startStarter = start
})()
