/*
 * Pokédice Visual Lab: a wild battle in the phone (Johto Daybreak, Jersey 20). CONTINUE starts it.
 * The dice come first: they roll by themselves, you tap the ones to throw again, REROLL, then ATTACK, and the move
 * plays on the same stage as the Animations tab. The foe answers. A K.O. leads to the catch, in the scene.
 * Rules from src/engine: (dice + upgrades + the best combo) × type, status faces with their thresholds,
 * catch = d6 + ball bonus ≥ the species' catch value, one throw.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco } = A
  const UI = () => window.PDUI
  const G = () => A.G
  const clamp = PX.clamp
  // A pause in the flow. If the battle is left meanwhile (another page, another save), the flow just stops there.
  const wait = (ms) => {
    const b = B
    return new Promise((r) =>
      setTimeout(() => B === b && r(), b && b.fast ? 0 : A.REDUCED ? Math.min(ms, 120) : ms),
    )
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1)

  // ------------------------------------------------------------------ rules (src/engine)
  const COMBO_NAME = {
    pair: 'Pair',
    two_pair: 'Two Pair',
    three_kind: 'Three of a Kind',
    small_straight: 'Small Straight',
    full_house: 'Full House',
    four_kind: 'Four of a Kind',
    full_straight: 'Full Straight',
    five_kind: 'Five of a Kind',
  }
  function longestRun(values) {
    const d = [...new Set(values)].sort((a, b) => a - b)
    let best = d.length ? 1 : 0,
      run = 1
    for (let i = 1; i < d.length; i++) {
      run = d[i] === d[i - 1] + 1 ? run + 1 : 1
      best = Math.max(best, run)
    }
    return best
  }
  function detectCombos(values) {
    const counts = new Map()
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
    const sorted = [...counts.values()].sort((a, b) => b - a)
    const max = sorted[0] || 0,
      second = sorted[1] || 0,
      pairs = sorted.filter((n) => n >= 2).length,
      run = longestRun(values)
    const f = []
    if (max >= 2) f.push('pair')
    if (pairs >= 2) f.push('two_pair')
    if (max >= 3) f.push('three_kind')
    if (run >= 4) f.push('small_straight')
    if (max >= 3 && second >= 2) f.push('full_house')
    if (max >= 4) f.push('four_kind')
    if (run >= 5) f.push('full_straight')
    if (max >= 5) f.push('five_kind')
    return f
  }
  /** Which dice make a combo: the ones to ring in gold. */
  function comboDice(roll, key) {
    const vals = roll.map((d) => d.v)
    const groups = {}
    vals.forEach((v, i) => (groups[v] = groups[v] || []).push(i))
    const byCount = Object.values(groups).sort((a, b) => b.length - a.length || vals[b[0]] - vals[a[0]])
    if (key === 'small_straight' || key === 'full_straight') {
      const d = [...new Set(vals)].sort((a, b) => a - b)
      let best = [d[0]],
        cur = [d[0]]
      for (let i = 1; i < d.length; i++) {
        cur = d[i] === d[i - 1] + 1 ? [...cur, d[i]] : [d[i]]
        if (cur.length > best.length) best = cur
      }
      return best.map((v) => vals.indexOf(v))
    }
    if (key === 'two_pair' || key === 'full_house') return [...byCount[0], ...byCount[1]]
    return byCount[0]
  }
  const comboBonus = (key, lv) => G().combos.find((c) => c.key === key).bonus[clamp(lv || 1, 1, 10) - 1]
  /** One type against the defender's types: combined, then clamped to 0, ½, 1 or 2 (a double weakness is ×2). */
  function typeMult(att, def) {
    let m = 1
    for (const d of def) m *= (G().chart[att] || {})[d] ?? 1
    return m === 0 ? 0 : m < 1 ? 0.5 : m > 1 ? 2 : 1
  }
  const THRESH = { burn: 1, paralyze: 2, frozen: 3, poison: 2, confuse: 2, heal: 2 }
  const ST_CODE = { burn: 'BRN', paralyze: 'PAR', frozen: 'FRZ', poison: 'PSN', confuse: 'CNF' }
  const ST_DONE = {
    burn: 'burned',
    paralyze: 'paralyzed',
    frozen: 'frozen solid',
    poison: 'poisoned',
    confuse: 'confused',
  }
  function rollFace(t) {
    const f = G().dice[t].faces[Math.floor(Math.random() * 6)]
    return Array.isArray(f) ? { t, v: f[0], st: f[1] } : { t, v: f }
  }
  /** Everything a roll does: the sum with upgrades, the combo that pays most, the attack type, statuses. */
  function evaluate(roll, levels, def) {
    const dieBonus = (t) => (t === 'base' ? 0 : G().dieTrack.bonus[(levels.dice[t] || 1) - 1])
    const sum = roll.reduce((n, d) => n + d.v + dieBonus(d.t), 0)
    const typed = [...new Set(roll.map((d) => d.t).filter((t) => t !== 'base'))]
    let att = null,
      mult = 1
    for (const t of typed) {
      const m = typeMult(t, def)
      if (att === null || m > mult) ((att = t), (mult = m))
    }
    let combo = null
    for (const k of detectCombos(roll.map((d) => d.v))) {
      const b = comboBonus(k, levels.combos[k])
      if (!combo || b >= combo.bonus) combo = { key: k, name: COMBO_NAME[k], bonus: b }
    }
    const total = sum + (combo ? combo.bonus : 0)
    const dmg = mult === 0 ? 0 : Math.max(1, Math.round(total * mult))
    const counts = {}
    for (const d of roll) if (d.st) counts[d.st] = (counts[d.st] || 0) + 1
    const statuses = Object.entries(counts).map(([s, n]) => ({
      s,
      n,
      need: THRESH[s],
      on: n >= THRESH[s] && mult > 0,
    }))
    return { sum, combo, mult, att, total, dmg, statuses }
  }
  const ENEMY_LEVELS = { combos: {}, dice: {} }
  /** Versus: nobody brings their own upgrades, every combo and die track is at level 5 on both sides. */
  const VS_LEVEL = 5
  const uniform = (n) => ({
    combos: Object.fromEntries(G().combos.map((c) => [c.key, n])),
    dice: Object.fromEntries(Object.keys(G().dice).map((t) => [t, n])),
  })

  // ------------------------------------------------------------------ fighters
  const slug = (d) => A.fold(A.K.names[d]).replace(/[^a-z]/g, '')
  function kitOf(dex, lv) {
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
  function fighter(dex, lv, hp, side, ref) {
    const k = kitOf(dex, lv)
    return {
      dex,
      lv,
      ref,
      name: A.K.names[dex],
      types: A.K.types[dex],
      dice: k.dice,
      rr: k.rr,
      sp: k.sp,
      cv: k.cv,
      max: A.hpAt(dex, lv),
      hp,
      st: {},
      key: `${side === 'own' ? 'back' : 'front'}-${slug(dex)}`,
    }
  }
  const MOVE = {
    fire: ['fire', 'Flamethrower'],
    electric: ['electric', 'Thunderbolt'],
    water: ['water', 'Hydro Pump'],
  }
  const moveOf = (f) => MOVE[f.types[0]] || MOVE[f.types[1]] || ['fire', 'Tackle']

  // ------------------------------------------------------------------ the battle
  let B = null,
    cv = null,
    g = null,
    stage = null,
    scene = null,
    playing = null,
    raf = 0
  const el = () => $('.hm-page[data-page="battle"]')
  // The trainers' looks (the game's own sprites, 80 × 80): the leaderboard, Versus and the trainer card use them too.
  const LOOKS = [
    'red',
    'green',
    'youngster',
    'lass',
    'bug-catcher',
    'camper',
    'picnicker',
    'hiker',
    'sailor',
    'swimmer-f',
    'beauty',
    'psychic-m',
    'cooltrainer-m',
    'cooltrainer-f',
    'black-belt',
    'bird-keeper',
    'scientist',
    'gentleman',
    'pokemaniac',
    'channeler',
    'juggler',
    'fisherman',
    'ranger-f',
    'ranger-m',
  ]
  const TRAINERS = new Image()
  TRAINERS.src = 'assets/trainers.png'
  // Where each sprite's head starts (px from the top of its 80 × 80 cell), so a crop shows the face.
  const LOOK_TOP = [14, 13, 23, 8, 6, 23, 25, 4, 6, 3, 4, 6, 2, 8, 9, 8, 5, 6, 7, 10, 5, 14, 10, 6]
  A.LOOKS = LOOKS
  /** A trainer's look as a crop of the sheet: `cls` sizes it (CSS .lk, .lk.big, .lk.av). */
  A.lookOf = (name, cls = '') => {
    const i = Math.max(0, LOOKS.indexOf(name))
    return `<span class="lk ${cls}" style="--i:${i};--t:${LOOK_TOP[i]}" aria-hidden="true"></span>`
  }

  /** A wild Pokémon from the area's pool that we have a sprite for (rarer when it's new to you). */
  function pickWild(a) {
    const has = (d) => !!PX.SPR.meta[`front-${slug(d)}`]
    let pool = (a.wild || []).filter((w) => has(w.d))
    // Areas without a drawable Pokémon borrow the Safari Zone's for the prototype.
    if (!pool.length) pool = (A.areaBy(15).wild || []).filter((w) => has(w.d))
    const tot = pool.reduce((n, w) => n + w.w * (A.caught.has(w.d) ? 1 : 2), 0)
    let x = Math.random() * tot
    for (const w of pool) if ((x -= w.w * (A.caught.has(w.d) ? 1 : 2)) <= 0) return w
    return pool[0]
  }
  function start(vs) {
    const a = A.areaBy(A.SAVE.current)
    let foe, team, foes
    if (vs) {
      // Versus: both teams as Lv.50 clones at full HP, the defender's three in order.
      foes = vs.team.map((d) => fighter(d, 50, A.hpAt(d, 50), 'foe'))
      foe = foes[0]
      team = (vs.mine || A.TEAM.map((m) => m.dex)).map((d, i) => {
        const m = A.TEAM.find((x) => x.dex === d)
        const lv = Math.min(50, m ? m.lv : 50)
        return fighter(d, lv, A.hpAt(d, lv), 'own', i)
      })
    } else {
      const w = pickWild(a)
      const lv = w.lv[0] + Math.floor(Math.random() * (w.lv[1] - w.lv[0] + 1))
      foe = fighter(w.d, lv, A.hpAt(w.d, lv), 'foe')
      team = A.TEAM.map((m, i) => fighter(m.dex, m.lv, m.hp[0], 'own', i))
    }
    const active = Math.max(
      0,
      team.findIndex((f) => f.hp > 0),
    )
    B = {
      area: a,
      foe,
      team,
      active,
      rerolls: team[active].rr,
      roll: [],
      sel: new Set(),
      phase: 'intro',
      used: false,
      item: false,
      exp: new Set([active]),
      vs: vs ? { ...vs, foes, i: 0 } : null,
      auto: !!vs,
      turns: 0,
      myLv: vs ? uniform(VS_LEVEL) : A.SAVE.up,
      foeLv: vs ? uniform(VS_LEVEL) : ENEMY_LEVELS,
    }
    stage = new ANIM.Stage({ style: 'daybreak' }, team[active].key, foe.key, 7)
    render()
    loop()
    vs ? vsIntro() : intro()
  }
  const own = () => B.team[B.active]

  // ------------------------------------------------------------------ the stage
  function loop() {
    cancelAnimationFrame(raf)
    const t0 = performance.now()
    const frame = (now) => {
      if (!B || el().hidden) return
      if (!playing) {
        const t = (now - t0) / 1000
        stage.absT = t
        g.clearRect(0, 0, 240, 160)
        // Between scenes the stage holds its pose (a trainer still out, yours not sent out yet).
        if (scene) scene(t, now)
        else idle(t, now, B.pose || {})
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
  }
  /** The two of them, breathing; a fainted one is gone; a worn-out foe sits lower and grey. */
  function idle(t, now, o = {}) {
    const st = stage
    st.begin(g, t)
    if (o.foeOff) {
      /* the trainer stands there instead */
    } else if (B.foe.hp > 0 || o.foeOn)
      st.drawFoe(g, t, {
        dx: o.foeDx || 0,
        dy: o.foeDy || 0,
        flash: o.foeFlash || 0,
        sx: o.foeS ?? 1,
        sy: o.foeS ?? 1,
        alpha: o.foeA ?? 1,
      })
    else if (!B.foeGone) st.drawFoe(g, t, { dy: 4, tint: { color: '#8592ad', a: 0.45 }, rate: 0.35 })
    if ((own().hp > 0 || o.ownOn) && !o.ownHide)
      st.drawOwn(g, t, {
        dx: o.ownDx || 0,
        dy: o.ownDy || 0,
        sx: o.ownS ?? 1,
        sy: o.ownS ?? 1,
        flash: o.ownFlash || 0,
      })
    st.fx.update(1 / 60)
    st.fx.draw(g)
    if (o.trainer && TRAINERS.complete)
      g.drawImage(
        TRAINERS,
        o.trainer.i * 80,
        0,
        80,
        80,
        Math.round(st.L.foe.x - 40 + o.trainer.dx),
        st.L.foe.y - 74,
        80,
        80,
      )
    if (o.pop)
      PX.text(
        g,
        o.pop.str,
        clamp(o.pop.x - PX.textWidth(o.pop.str) / 2, 3, 237 - PX.textWidth(o.pop.str)),
        o.pop.y,
        '#ffffff',
        '#1a1423',
        1,
        '#1a142380',
      )
    st.end(g)
  }
  /** Run a little scene of our own for `ms`, then go back to idling. */
  let sceneEnd = null
  function run(ms, draw) {
    return new Promise((res) => {
      const t0 = performance.now()
      sceneEnd = res
      scene = (t, now) => {
        const p = clamp((now - t0) / ms)
        draw(p, t)
        if (p >= 1) {
          scene = sceneEnd = null
          res()
        }
      }
      if (A.REDUCED || B.fast) {
        scene = sceneEnd = null
        res()
      }
    })
  }
  /** Versus, SKIP: the rest of the fight resolves at once (the result was always going to be the same). */
  function fastForward() {
    B.fast = true
    B.pose = null
    $('#bt-own').classList.remove('gone')
    $('#bt-foe').classList.remove('gone')
    actions('')
    if (playing) {
      const pl = playing
      pl.pause()
      pl.onEnd()
    }
    if (sceneEnd) {
      const r = sceneEnd
      scene = sceneEnd = null
      r()
    }
  }
  /** Play one of the Animations tab's timelines on this stage, with this screen standing in for its HUD. */
  function play(def) {
    return new Promise((res) => {
      if (B.fast) return res()
      playing = new ANIM.Player(cv, HUDA)
      playing.load(def, { style: 'daybreak' })
      playing.onEnd = () => {
        playing = null
        res()
      }
      playing.play()
    })
  }
  const HUDA = {
    reset() {},
    setRoll(spec) {
      this.spec = spec
    },
    tick(t) {
      const sp = this.spec
      if (!sp || sp.kind !== 'catch' || t < sp.t0) return
      const v = t < sp.t0 + 0.6 ? 1 + (Math.floor(t * 16) % 6) : sp.dice[0][1]
      $('#bt-tray').innerHTML =
        `<span class="bt-catchroll">${UI().die('base', v, { size: 54 })}<b>+${sp.bonus}</b><span>${t < sp.t0 + 0.6 ? '…' : `= ${v + sp.bonus} ${v + sp.bonus >= sp.need ? '≥' : '<'} ${sp.need}`}</span></span>`
    },
    say,
    hp() {
      if (B.lag) delete B.lag.hp
      plates()
    },
    status() {
      if (B.lag) delete B.lag.st
      plates()
    },
    show(side, on) {
      $(`#bt-${side}`).classList.toggle('gone', !on)
    },
    chip(text) {
      $('#bt-read').innerHTML = `<span class="bt-chip new">${esc(text)}</span>`
    },
    heal() {},
  }

  // ------------------------------------------------------------------ the screen
  function render() {
    const p = el()
    p.innerHTML = `
      <div class="bt-stage stage"><canvas id="bt-cv" width="240" height="160" role="img" aria-label="The battle"></canvas>
        <div class="ui-plate foe" id="bt-foe"></div><div class="ui-plate own" id="bt-own"></div></div>
      <div class="bt-panel">
        <p class="bt-msg ui-dialog" id="bt-msg" aria-live="polite"></p>
        <div class="bt-tray" id="bt-tray" role="group" aria-label="Your dice"></div>
        <div class="bt-read" id="bt-read" aria-live="polite"></div>
        <div class="bt-acts" id="bt-acts"></div>
        <div class="bt-sub">${B.vs ? `<span class="bt-vsname">vs ${esc(B.vs.name)}</span>` : `<button type="button" class="bt-bag" id="bt-bag"><img class="px" alt="" src="${A.icons.NAV.shop}" />Bag</button>`}<div class="bt-team" id="bt-team" role="group" aria-label="Switch Pokémon"></div></div>
      </div>`
    cv = $('#bt-cv')
    g = cv.getContext('2d')
    g.imageSmoothingEnabled = false
    plates()
    team()
    actions('')
  }
  /** The two plates. Built once per fighter, then only the bar moves, so HP drains instead of jumping.
   *  During a move the foe's plate lags behind (B.lag) until the animation's hit lands. */
  function plates() {
    const f = B.foe,
      o = own()
    const lag = B.lag || {}
    const chip = (st) => {
      const s = Object.keys(st).find((k) => ST_CODE[k])
      return s ? `<span class="ui-chip" style="--chip:${UI().STATUS[s]}">${ST_CODE[s]}</span>` : ''
    }
    const fill = (box, p, num) => {
      const hp = box.querySelector('.ui-hp')
      hp.querySelector('.fill').style.width = hp.querySelector('.trail').style.width = `${p * 100}%`
      hp.querySelector('.fill').style.setProperty(
        '--hp',
        p > 0.5 ? 'var(--hp-hi)' : p > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)',
      )
      if (num != null) hp.querySelector('.num').textContent = num
    }
    const fb = $('#bt-foe'),
      ob = $('#bt-own')
    const fhp = lag.hp ?? f.hp
    if (fb.dataset.who !== String(f.dex)) {
      fb.dataset.who = f.dex
      fb.innerHTML = `<div class="ui-row"><span class="name ui-trunc">${esc(f.name)}</span><span class="lv">Lv.${f.lv}</span><span class="ui-grow"></span><span class="bt-st"></span>${B.vs ? '<span class="bt-party"></span>' : ''}</div><div class="ui-row pl2"><span class="ui-types">${f.types.map((t) => UI().typeBadge(t)).join('')}</span>${UI().hp(fhp / f.max, '')}</div>`
    }
    fill(fb, fhp / f.max)
    fb.querySelector('.bt-st').innerHTML = chip(lag.st || f.st)
    if (B.vs) {
      const left = B.vs.foes.filter((x) => x.hp > 0).length
      fb.querySelector('.bt-party').innerHTML = B.vs.foes
        .map((x) => `<i class="${x.hp > 0 ? '' : 'out'}"></i>`)
        .join('')
      fb.querySelector('.bt-party').setAttribute(
        'aria-label',
        `${B.vs.name} has ${left} of ${B.vs.foes.length} left`,
      )
    }
    fb.setAttribute('aria-label', `${f.name}, Lv.${f.lv}, ${Math.round((fhp / f.max) * 100)}% HP`)
    if (ob.dataset.who !== String(B.active)) {
      ob.dataset.who = B.active
      ob.innerHTML = `<div class="ui-row"><span class="lv">Lv.${o.lv}</span>${UI().hp(o.hp / o.max, `${o.hp}/${o.max}`)}<span class="bt-st"></span></div>`
    }
    fill(ob, o.hp / o.max, `${o.hp}/${o.max}`)
    ob.querySelector('.bt-st').innerHTML = chip(o.st)
    ob.setAttribute('aria-label', `${o.name}, Lv.${o.lv}, ${o.hp} of ${o.max} HP`)
  }
  function team() {
    $('#bt-team').innerHTML = B.team
      .map(
        (m, i) =>
          `<button type="button" class="bt-pip${i === B.active ? ' on' : ''}${m.hp <= 0 ? ' fnt' : ''}" data-sw="${i}" aria-label="${esc(m.name)}, ${m.hp} of ${m.max} HP${i === B.active ? ', in battle' : m.hp <= 0 ? ', fainted' : '. Switch in'}" ${i === B.active || m.hp <= 0 ? 'aria-disabled="true"' : ''}>${dexIco(m.dex)}<span class="bt-pip-hp"><i style="width:${(m.hp / m.max) * 100}%;--hp:${m.hp / m.max > 0.5 ? 'var(--hp-hi)' : m.hp / m.max > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)'}"></i></span></button>`,
      )
      .join('')
  }
  function say(msg) {
    const p = $('#bt-msg')
    if (p) p.textContent = msg
  }
  function actions(kind) {
    const box = $('#bt-acts')
    // Versus plays itself: SKIP stays there the whole fight.
    if (B.auto && !kind && !B.fast && B.phase !== 'over') kind = 'auto'
    if (kind === 'auto')
      box.innerHTML = `<p class="bt-auto"><span class="bt-chip">AUTO</span>Both sides fight on their own.</p><button type="button" class="ui-btn bt-skip" id="bt-skip"><span>Skip ▸▸</span></button>`
    else if (kind === 'pick')
      box.innerHTML = `<button type="button" class="ui-btn bt-reroll" id="bt-reroll"${B.sel.size && B.rerolls > 0 ? '' : ' disabled'}><span>Reroll <i>${B.rerolls}</i></span></button><button type="button" class="ui-btn primary bt-attack" id="bt-attack"><span>Attack</span></button>`
    else box.innerHTML = ''
    $('#bt-bag') && ($('#bt-bag').disabled = kind !== 'pick' || B.item)
  }
  /** The tray: the dice, the combo in gold, the picked ones raised; and the readout under it. */
  function tray(roll, o = {}) {
    const ev =
      roll.length && !o.tumble
        ? evaluate(roll, o.foe ? B.foeLv : B.myLv, o.foe ? own().types : B.foe.types)
        : null
    const ring = ev && ev.combo ? new Set(comboDice(roll, ev.combo.key)) : new Set()
    $('#bt-tray').classList.toggle('foe', !!o.foe)
    $('#bt-tray').innerHTML = roll
      .map((d, i) => {
        const sel = !o.foe && B.sel.has(i)
        return `<button type="button" class="bt-die" data-die="${i}" aria-pressed="${sel}" aria-label="${cap(d.t)} die, ${d.v}${d.st ? `, ${d.st} face` : ''}${sel ? ', will reroll' : ''}"${o.foe || o.tumble ? ' disabled' : ''}>${UI().die(d.t, d.v, { size: o.foe ? 40 : 54, sel, combo: !sel && ring.has(i), status: d.st })}</button>`
      })
      .join('')
    const read = $('#bt-read')
    if (!ev) return (read.innerHTML = o.tumble ? '<span class="bt-rolling">Rolling…</span>' : '')
    const tag =
      ev.mult > 1
        ? '<em class="bt-eff up">super effective</em>'
        : ev.mult === 0
          ? '<em class="bt-eff no">no effect</em>'
          : ev.mult < 1
            ? '<em class="bt-eff down">not very effective</em>'
            : ''
    read.innerHTML = `${ev.combo ? `<span class="bt-chip combo">${ev.combo.name} +${ev.combo.bonus}</span>` : '<span class="bt-chip none">No combo</span>'}
      <span class="bt-math">(${ev.sum}${ev.combo ? ` + ${ev.combo.bonus}` : ''})${ev.mult !== 1 ? ` × ${ev.mult}` : ''} = <b>${ev.dmg}</b></span>${tag}
      ${ev.statuses.map((x) => `<span class="bt-chip st${x.on ? ' on' : ''}" style="--stc:${UI().STATUS[x.s]}">${x.s === 'heal' ? 'Heal' : ST_CODE[x.s] || x.s} ${x.on ? '' : `${x.n}/${x.need}`}</span>`).join('')}`
    return ev
  }

  // ------------------------------------------------------------------ the flow
  async function intro() {
    const f = B.foe
    say(`A wild ${f.name.toUpperCase()} appeared!`)
    $('#bt-own').classList.add('gone')
    $('#bt-foe').classList.add('gone')
    B.pose = { ownHide: true }
    await run(700, (p, t) => idle(t, 0, { foeDx: Math.round(140 * (1 - PX.ease.outQ(p))), ownHide: true }))
    $('#bt-foe').classList.remove('gone')
    await wait(500)
    say(`Go! ${own().name}!`)
    B.pose = null
    await run(380, (p, t) => idle(t, 0, { ownS: PX.ease.outBack(p, 2.2), ownFlash: 1 - p }))
    $('#bt-own').classList.remove('gone')
    await wait(350)
    if (f.sp > own().sp && (await foeTurn())) return
    if (B && B.phase !== 'over') ownTurn()
  }
  /** Versus: the trainer slides in, sends out the first one; then yours. */
  async function vsIntro() {
    const V = B.vs,
      f = B.foe
    $('#bt-own').classList.add('gone')
    $('#bt-foe').classList.add('gone')
    say(`${V.name} wants to battle!`)
    actions('auto')
    const look = { i: Math.max(0, LOOKS.indexOf(V.look)), dx: 0 }
    B.pose = { foeOff: true, ownHide: true, trainer: look }
    await run(700, (p, t) =>
      idle(t, 0, {
        foeOff: true,
        ownHide: true,
        trainer: { ...look, dx: Math.round(150 * (1 - PX.ease.outQ(p))) },
      }),
    )
    await wait(800)
    say(`${V.name} sent out ${f.name}!`)
    await run(300, (p, t) =>
      idle(t, 0, { foeOff: true, ownHide: true, trainer: { ...look, dx: Math.round(150 * PX.ease.inQ(p)) } }),
    )
    B.pose = { ownHide: true }
    await run(380, (p, t) => idle(t, 0, { ownHide: true, foeS: PX.ease.outBack(p, 2.2), foeFlash: 1 - p }))
    $('#bt-foe').classList.remove('gone')
    await wait(400)
    say(`Go! ${own().name}!`)
    B.pose = null
    await run(380, (p, t) => idle(t, 0, { ownS: PX.ease.outBack(p, 2.2), ownFlash: 1 - p }))
    $('#bt-own').classList.remove('gone')
    await wait(350)
    if (f.sp > own().sp && (await foeTurn())) return
    if (B && B.phase !== 'over' && own().hp > 0 && B.foe.hp > 0) ownTurn()
  }
  /** Versus: a defender is down; the next one comes out, or the attacker has won. */
  async function vsNext() {
    const V = B.vs,
      f = B.foe
    say(`${V.name}’s ${f.name} fainted!`)
    await run(450, (p, t) => idle(t, 0, { foeOn: true, foeDy: Math.round(28 * p), foeA: 1 - p }))
    B.foeGone = true
    plates()
    await wait(400)
    if (++V.i >= V.foes.length) return vsEnd(true)
    B.foe = V.foes[V.i]
    B.foeGone = false
    stage.foe = B.foe.key
    $('#bt-tray').innerHTML = ''
    $('#bt-read').innerHTML = ''
    say(`${V.name} sent out ${B.foe.name}!`)
    plates()
    await run(380, (p, t) => idle(t, 0, { foeS: PX.ease.outBack(p, 2.2), foeFlash: 1 - p }))
    await wait(400)
    if (B.foe.sp > own().sp && (await foeTurn())) return
    if (B && B.phase !== 'over' && own().hp > 0 && B.foe.hp > 0) ownTurn()
  }
  /** Versus is over: the attacker beat all three, or the defender held (a K.O. or a stalemate). */
  function vsEnd(won, stale) {
    const V = B.vs
    B.phase = 'over'
    B.fast = false
    if (won) $('#bt-foe').classList.add('gone')
    $('.bt-panel').classList.add('over')
    say(
      won
        ? `You beat ${V.name}’s team!`
        : stale
          ? `Nobody could break through: ${V.name}’s team held.`
          : `${V.name}’s team held.`,
    )
    const first = won && !V.beaten
    if (won && A.onVersus) A.onVersus(V.name)
    $('#bt-acts').innerHTML =
      `<div class="bt-win${won ? '' : ' lost'}"><p class="bt-win-h">${won ? 'Victory!' : 'Defeat'}</p>
      <p class="bt-win-note">${won ? (first ? '+1 team beaten on the Versus board. Each team counts once.' : 'You had already beaten this team: it counts once.') : 'Try again whenever you like, maybe with another team.'}</p>
      <div class="bt-win-btns"><button type="button" class="ui-btn" id="bt-rematch"><span>Rematch</span></button><button type="button" class="ui-btn primary" id="bt-vsback"><span>Back to Versus</span></button></div></div>`
  }
  /** Your turn: skip if stunned, otherwise the dice roll by themselves and you pick. */
  async function ownTurn() {
    const o = own()
    if (await stunned(o)) return endOfTurn(o).then((ko) => ko || foeTurnThenYou())
    B.phase = 'pick'
    B.item = false
    B.sel.clear()
    if (B.auto) return autoTurn(o)
    say(`What will ${o.name} do? Tap dice to throw them again.`)
    await tumble(o, false)
    B.roll = o.dice.map((t) => rollFace(t))
    tray(B.roll)
    actions('pick')
  }
  /** Auto (Versus): roll, keep the biggest group and throw the rest again while it has no combo, then attack. */
  async function autoTurn(o) {
    if (++B.turns > 60) return vsEnd(false, true)
    B.phase = 'anim'
    say(`${o.name} rolls…`)
    if (!B.fast) actions('auto')
    await tumble(o, false)
    B.roll = o.dice.map((t) => rollFace(t))
    tray(B.roll)
    await wait(500)
    if (!evaluate(B.roll, B.myLv, B.foe.types).combo && B.rerolls > 0 && B.roll.length > 1) {
      const keep = comboDice(B.roll, 'pair')
      B.roll.forEach((d, i) => !keep.includes(i) && B.sel.add(i))
      tray(B.roll)
      await wait(350)
      B.rerolls--
      B.roll = B.roll.map((d, i) => (B.sel.has(i) ? rollFace(d.t) : d))
      B.sel.clear()
      tray(B.roll)
      await wait(500)
    }
    if (B) attack()
  }
  async function tumble(f, foe) {
    const n = 7
    for (let k = 0; k < n; k++) {
      tray(
        f.dice.map((t) => rollFace(t)),
        { tumble: true, foe },
      )
      await wait(55)
    }
  }
  async function reroll() {
    if (!B.sel.size || B.rerolls <= 0) return
    B.rerolls--
    const idx = [...B.sel]
    for (let k = 0; k < 5; k++) {
      idx.forEach((i) => (B.roll[i] = rollFace(B.roll[i].t)))
      tray(B.roll)
      await wait(60)
    }
    B.sel.clear()
    tray(B.roll)
    actions('pick')
    say(B.rerolls ? `${B.rerolls} reroll${B.rerolls > 1 ? 's' : ''} left.` : 'No rerolls left this battle.')
  }
  async function attack() {
    B.phase = 'anim'
    actions('')
    const o = own(),
      f = B.foe
    const ev = evaluate(B.roll, B.myLv, f.types)
    const before = f.hp
    B.lag = { hp: before, st: JSON.parse(JSON.stringify(f.st)) }
    f.hp = Math.max(0, f.hp - ev.dmg)
    const won = ev.statuses.filter((x) => x.on && x.s !== 'heal' && ST_CODE[x.s])
    for (const x of won) applyStatus(f, x.s)
    // The move: the Animations tab's timeline, set to this fight.
    const [type, move] = moveOf(o)
    const At = ANIM.ATTACKS[type]
    const keep = JSON.parse(JSON.stringify(At))
    Object.assign(At, {
      own: o.key,
      foe: f.key,
      ownName: o.name,
      foeName: f.name,
      move,
      ownLv: o.lv,
      foeLv: f.lv,
      foeTypes: f.types,
      mult: ev.mult,
      dmg: ev.dmg,
      hp: [before / f.max, f.hp / f.max],
      status: won.length ? ST_CODE[won[0].s] : null,
      statusName: won.length ? ST_DONE[won[0].s] : '',
    })
    if (type === 'water') At.cannons = [[0.8, 0.22]]
    await play(ANIM.RAW[type]())
    Object.assign(At, keep)
    B.lag = null
    const heal = ev.statuses.find((x) => x.s === 'heal' && x.on)
    if (heal) {
      o.hp = Math.min(o.max, o.hp + ev.sum)
      say(`${o.name} healed ${ev.sum} HP!`)
      await wait(700)
    }
    plates()
    // Confused: the attack lands, then 20% of it comes back.
    if (o.st.confuse) {
      const rec = Math.max(1, Math.round(ev.dmg * 0.2))
      o.hp = Math.max(0, o.hp - rec)
      delete o.st.confuse
      say(`${o.name} hurt itself in its confusion! −${rec}`)
      plates()
      await wait(800)
    }
    if (f.hp <= 0) return foeDown()
    if (o.hp <= 0) return ownDown()
    if (await endOfTurn(o)) return
    foeTurnThenYou()
  }
  async function foeTurnThenYou() {
    if (await foeTurn()) return
    if (B && B.phase !== 'over' && own().hp > 0 && B.foe.hp > 0) ownTurn()
  }
  /** The foe's turn: it rolls in the tray (smaller dice), rerolls once if it has nothing, and strikes.
   *  True when a K.O. took the fight elsewhere (a switch, the catch, the next defender): the caller stops there. */
  async function foeTurn() {
    const f = B.foe,
      o = own()
    if (await stunned(f)) return endOfTurn(f)
    B.phase = 'foe'
    actions('')
    say(`${f.name} rolls…`)
    await tumble(f, true)
    let roll = f.dice.map((t) => rollFace(t))
    tray(roll, { foe: true })
    if (!evaluate(roll, B.foeLv, o.types).combo && f.rr > 0) {
      await wait(500)
      // Keep the biggest group, throw the rest again.
      const ev = comboDice(roll, 'pair')
      roll = roll.map((d, i) => (ev.includes(i) && roll.length > 1 ? d : rollFace(d.t)))
      tray(roll, { foe: true })
    }
    const ev = evaluate(roll, B.foeLv, o.types)
    await wait(700)
    say(
      `${f.name} attacks!${ev.mult > 1 ? ' It’s super effective!' : ev.mult === 0 ? ' It had no effect…' : ev.mult < 1 ? ' It’s not very effective…' : ''}`,
    )
    o.hp = Math.max(0, o.hp - ev.dmg)
    for (const x of ev.statuses) if (x.on && ST_CODE[x.s]) applyStatus(o, x.s)
    // A lunge, a hit-stop, two white frames, a shake and the number.
    const c = { x: 64, y: 118 }
    await run(820, (p, t) => {
      const lunge = p < 0.25 ? PX.ease.outQ(p / 0.25) : p < 0.45 ? 1 - (p - 0.25) / 0.2 : 0
      const hitP = p - 0.25
      const shake = hitP > 0 && hitP < 0.3 ? (Math.floor(hitP * 60) % 2 ? 2 : -2) : 0
      const flash = hitP > 0 && hitP < 0.1 ? 1 : 0
      if (hitP > 0 && hitP < 0.02)
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2
          stage.fx.add({
            x: c.x,
            y: c.y - 30,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 50,
            drag: 3,
            life: 0.4,
            shape: 'star',
            colors: ['#ffffff', '#ffe066'],
          })
        }
      idle(t, 0, {
        foeDx: -Math.round(18 * lunge),
        foeDy: Math.round(8 * lunge),
        ownDx: shake,
        ownFlash: flash,
        ownOn: true,
        pop:
          hitP > 0
            ? { str: `-${ev.dmg}`, x: c.x, y: Math.round(70 - 14 * PX.ease.outBack(clamp(hitP / 0.25), 2.4)) }
            : null,
      })
    })
    plates()
    team()
    const st = ev.statuses.find((x) => x.on && ST_CODE[x.s])
    if (st) {
      say(`${o.name} is ${ST_DONE[st.s]}!`)
      await wait(800)
    }
    if (o.hp <= 0) {
      ownDown()
      return true
    }
    return endOfTurn(f)
  }
  function applyStatus(x, s) {
    if (s === 'burn') x.st.burn = { stacks: ((x.st.burn && x.st.burn.stacks) || 0) + 1, turns: 3 }
    else if (s === 'poison') x.st.poison = { turns: 3 }
    else if (s === 'frozen') x.st.frozen = { skip: 2 }
    else if (s === 'paralyze') x.st.paralyze = { skip: 1 }
    else if (s === 'confuse') x.st.confuse = true
  }
  /** Frozen or paralyzed: the turn is lost. */
  async function stunned(x) {
    const k = x.st.frozen ? 'frozen' : x.st.paralyze ? 'paralyze' : null
    if (!k) return false
    say(k === 'frozen' ? `${x.name} is frozen solid!` : `${x.name} is paralyzed! It can’t move!`)
    if (--x.st[k].skip <= 0) delete x.st[k]
    plates()
    await wait(900)
    return true
  }
  /** Burn and poison bite at the end of the turn. True when one of them knocked it out (the K.O. takes over). */
  async function endOfTurn(x) {
    for (const [k, pct] of [
      ['burn', 0.04],
      ['poison', 0.1],
    ]) {
      const s = x.st[k]
      if (!s) continue
      const d = Math.max(1, Math.round(x.max * pct * (s.stacks || 1)))
      x.hp = Math.max(0, x.hp - d)
      say(`${x.name} is hurt by its ${k}! −${d}`)
      if (--s.turns <= 0) delete x.st[k]
      plates()
      team()
      await wait(800)
      if (x.hp <= 0) {
        x === B.foe ? foeDown() : ownDown()
        return true
      }
    }
    return false
  }
  async function ownDown() {
    const o = own()
    say(`${o.name} fainted!`)
    team()
    await run(500, (p, t) => idle(t, 0, { ownDy: Math.round(40 * p), ownOn: p < 1 }))
    const next = B.team.findIndex((m) => m.hp > 0)
    if (next < 0) return B.vs ? vsEnd(false) : wipe()
    // Versus plays itself: the next one in order goes out.
    if (B.auto) {
      await wait(500)
      return switchTo(next, true)
    }
    say('Who goes out next? Tap one below: switching now is free.')
    B.phase = 'force'
    $('#bt-tray').innerHTML = ''
    $('#bt-read').innerHTML = ''
    actions('')
    $('#bt-team').classList.add('force')
  }
  async function switchTo(i, free) {
    const m = B.team[i]
    if (!m || m.hp <= 0 || i === B.active) return
    $('#bt-team').classList.remove('force')
    B.active = i
    B.exp.add(i)
    B.rerolls = m.rr
    stage.own = m.key
    $('#bt-tray').innerHTML = ''
    $('#bt-read').innerHTML = ''
    say(`Go! ${m.name}!`)
    plates()
    team()
    await run(380, (p, t) => idle(t, 0, { ownS: PX.ease.outBack(p, 2.2), ownFlash: 1 - p }))
    if (free) return ownTurn()
    // A voluntary switch costs the turn.
    foeTurnThenYou()
  }
  async function foeDown() {
    const f = B.foe
    plates()
    if (B.vs) return vsNext()
    say(`The wild ${f.name} is worn out!`)
    const isNew = !A.caught.has(f.dex)
    await wait(700)
    B.phase = 'catch'
    catchPanel(isNew)
  }
  /** The catch, in the scene: pick a ball (what each one gives you), then one throw. */
  function catchPanel(isNew) {
    const f = B.foe,
      bag = A.SAVE.bag
    const balls = [
      ['none', 'No ball', 0, Infinity],
      ['poke', 'Poké Ball', 1, bag['poke-ball'] || 0],
      ['great', 'Great Ball', 2, bag['great-ball'] || 0],
      ['ultra', 'Ultra Ball', 3, bag['ultra-ball'] || 0],
    ]
    const chance = (b) => clamp((7 - (f.cv - b)) / 6)
    const sure = balls.find((x) => chance(x[2]) >= 1)
    B.ball =
      B.ball || (chance(0) >= 1 ? 'none' : balls.find((x) => x[3] > 0 && x[0] !== 'none')?.[0] || 'none')
    say(`${f.name} is worn out! Throw a ball${isNew ? ' — it’s new to your Pokédex' : ''}.`)
    $('#bt-tray').innerHTML = `<div class="bt-balls" role="radiogroup" aria-label="Ball">${balls
      .map(([k, name, bonus, n]) => {
        const p = Math.round(chance(bonus) * 100)
        const pointless = sure && bonus > sure[2]
        const off = n <= 0 || pointless
        return `<button type="button" role="radio" class="bt-ball" data-ball="${k}" aria-checked="${B.ball === k}"${off ? ' disabled' : ''}>${k === 'none' ? '<span class="bt-noball" aria-hidden="true">—</span>' : `<span class="bt-ballico" style="--b:${k}"></span>`}<b>${name}</b><small>${pointless ? 'not needed' : `${p}%${k === 'none' ? '' : ` · ×${n}`}`}</small></button>`
      })
      .join('')}</div>`
    const b = balls.find((x) => x[0] === B.ball)
    $('#bt-read').innerHTML = `<span class="bt-math">d6 + ${b[2]} ≥ ${f.cv} to catch</span>`
    $('#bt-acts').innerHTML =
      `<button type="button" class="ui-btn bt-leave" id="bt-leave"><span>Leave it</span></button><button type="button" class="ui-btn primary bt-throw" id="bt-throw"><span>${chance(b[2]) >= 1 ? 'Catch' : 'Roll to catch'}</span></button>`
    $('#bt-bag').disabled = true
    B.isNew = isNew
    paintBalls()
  }
  function paintBalls() {
    $$('.bt-ballico').forEach((s) => {
      const k = s.style.getPropertyValue('--b').trim()
      if (!s.firstChild)
        s.appendChild(
          Object.assign(new Image(), { src: SCN.ball(k, 0, { R: 6 }).toDataURL(), className: 'px', alt: '' }),
        )
    })
  }
  async function throwBall() {
    B.phase = 'throw'
    const f = B.foe,
      k = B.ball
    const bonus = { none: 0, poke: 1, great: 2, ultra: 3 }[k]
    const d = 1 + Math.floor(Math.random() * 6)
    const caught = d + bonus >= f.cv
    if (k !== 'none') A.SAVE.bag[`${k}-ball`] -= 1
    $('#bt-acts').innerHTML = ''
    $('#bt-read').innerHTML = ''
    const o = own()
    await play(
      ANIM.MAKE.catch({
        ball: k === 'none' ? 'poke' : k,
        outcome: caught ? 'caught' : 'fail',
        own: o.key,
        foe: f.key,
        foeName: f.name,
        dex: f.dex,
        need: f.cv,
        roll: d,
        isNew: B.isNew,
        foeLv: f.lv,
        foeTypes: f.types,
        ownName: o.name,
        ownLv: o.lv,
        ownHp: o.hp / o.max,
        ownMax: o.max,
      }),
    )
    if (caught && A.onCatch) A.onCatch(f.dex, f.lv)
    victory(caught ? f : false)
  }
  /** The end: XP for whoever fought, the catch, then back Home or straight into the next one. */
  function victory(caught, left) {
    B.phase = 'over'
    B.foeGone = true
    $('.bt-panel').classList.add('over')
    const f = B.foe
    const xp = f.lv
    const rows = [...B.exp]
      .map((i) => B.team[i])
      .map((m) => `<li>${dexIco(m.dex)}<b>${esc(m.name)}</b><span>+${xp} XP</span></li>`)
      .join('')
    $('#bt-tray').innerHTML = ''
    $('#bt-read').innerHTML = ''
    say(
      caught
        ? `${caught.name} joined your Box!`
        : caught === false
          ? `${f.name} fled…`
          : left
            ? `You let ${f.name} go.`
            : `${f.name} fainted.`,
    )
    $('#bt-acts').innerHTML =
      `<div class="bt-win"><p class="bt-win-h">${caught ? 'Gotcha!' : 'Victory!'}</p><ul>${rows}</ul>
      ${caught ? `<p class="bt-win-catch">${dexIco(f.dex)}${esc(f.name)} Lv.${f.lv}${B.isNew ? ' <em>NEW</em>' : ''}</p>` : caught === false ? `<p class="bt-win-catch fled">${esc(f.name)} fled. Wild battles pay no gold.</p>` : ''}
      <div class="bt-win-btns"><button type="button" class="ui-btn" id="bt-home"><span>Home</span></button><button type="button" class="ui-btn primary" id="bt-next"><span>Next encounter</span></button></div></div>`
    sync()
  }
  function wipe() {
    B.phase = 'over'
    $('.bt-panel').classList.add('over')
    $('#bt-tray').innerHTML = ''
    $('#bt-read').innerHTML = ''
    say('Your team fainted…')
    $('#bt-acts').innerHTML =
      `<div class="bt-win lost"><p class="bt-win-h">Your team fainted…</p><p>Back to the start of the area, fully healed. Rounds already done stay done; levels, items and ₽ are kept.</p><div class="bt-win-btns"><button type="button" class="ui-btn primary" id="bt-home"><span>Try again</span></button></div></div>`
    B.team.forEach((m) => (m.hp = m.max))
    sync()
  }
  /** Write the fight back to the save: HP of the team (Versus fights with clones: nothing to write). */
  function sync() {
    if (B.vs) return
    B.team.forEach((m) => (A.TEAM[m.ref].hp[0] = m.hp))
  }
  /** Stop everything: the stage loop, a move still playing. */
  function stop() {
    cancelAnimationFrame(raf)
    if (playing) playing.pause()
    playing = null
    scene = null
    B = null
  }
  function leave(next) {
    stop()
    A.showPage('home')
    A.renderWidgets()
    if (next) setTimeout(() => A.startBattle(), 50)
  }

  // ------------------------------------------------------------------ wiring
  HOME.page('battle', {
    full: true,
    leave: stop,
    render(p) {
      const vs = PENDING
      PENDING = null
      if (!p.dataset.bound) {
        p.dataset.bound = '1'
        p.addEventListener('click', (e) => {
          const t = e.target
          let b
          if (!B) return
          if ((b = t.closest('[data-die]')) && B.phase === 'pick') {
            const i = Number(b.dataset.die)
            B.sel.has(i) ? B.sel.delete(i) : B.sel.add(i)
            tray(B.roll)
            actions('pick')
            return
          }
          if (t.closest('#bt-reroll')) return reroll()
          if (t.closest('#bt-attack') && B.phase === 'pick') return attack()
          if (t.closest('#bt-skip') && B.auto && B.phase !== 'over') return fastForward()
          if (t.closest('#bt-vsback')) return A.showPage('versus')
          if (t.closest('#bt-rematch')) {
            const o = B.vs.opp
            stop()
            return start({ ...o, opp: o })
          }
          if ((b = t.closest('[data-sw]'))) {
            if (B.auto) return
            const i = Number(b.dataset.sw)
            if (b.getAttribute('aria-disabled') === 'true') return
            if (B.phase === 'force') return switchTo(i, true)
            if (B.phase === 'pick') {
              B.phase = 'anim'
              actions('')
              return switchTo(i, false)
            }
            return
          }
          if (t.closest('#bt-bag') && B.phase === 'pick') return bagSheet()
          if ((b = t.closest('[data-ball]'))) {
            B.ball = b.dataset.ball
            return catchPanel(B.isNew)
          }
          if (t.closest('#bt-throw') && B.phase === 'catch') return throwBall()
          if (t.closest('#bt-leave') && B.phase === 'catch') return victory(null, true)
          if (t.closest('#bt-home')) return leave(false)
          if (t.closest('#bt-next')) return leave(true)
        })
      }
      start(vs && { ...vs, opp: vs })
    },
  })
  /** The bag, during a fight: one item a turn, it doesn't end the turn. */
  function bagSheet() {
    const bag = A.SAVE.bag,
      o = own()
    const items = G()
      .items.filter((it) => (bag[it.key] || 0) > 0 && ['heal', 'rerolls', 'cure'].includes(it.eff.kind))
      .map((it) => {
        const e = it.eff
        const ok =
          e.kind === 'heal'
            ? o.hp < o.max
            : e.kind === 'rerolls'
              ? true
              : (e.statuses || []).some((s) => o.st[s === 'frozen' ? 'frozen' : s])
        const what =
          e.kind === 'heal'
            ? `+${e.amount} HP`
            : e.kind === 'rerolls'
              ? `+${e.amount} reroll${e.amount > 1 ? 's' : ''}`
              : `Cures ${(e.statuses || []).join(', ')}`
        return `<li><button type="button" class="pg-useit" data-bt-use="${it.key}"${ok ? '' : ' disabled'}>${A.itemIco(it)}<span><b>${esc(it.name)}</b><small>${ok ? what : e.kind === 'heal' ? 'Already full' : 'Nothing to cure'}</small></span><em>×${bag[it.key]}</em></button></li>`
      })
      .join('')
    $('#hm-s2-title').textContent = 'Bag'
    $('#hm-s2-sub').textContent = `One item a turn, it doesn’t end your turn · ${o.name} ${o.hp}/${o.max} HP`
    $('#hm-s2-body').innerHTML = items
      ? `<ul class="pg-uselist">${items}</ul>`
      : '<p class="hm-d-empty">Nothing in the bag helps in battle.</p>'
    $('#hm-s2-foot').hidden = true
    A.openDialog($('#hm-sheet2'))
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bt-use]')
    if (!b || !B) return
    const it = G().items.find((x) => x.key === b.dataset.btUse),
      e2 = it.eff,
      o = own()
    if (e2.kind === 'heal') o.hp = Math.min(o.max, o.hp + e2.amount)
    if (e2.kind === 'rerolls') B.rerolls += e2.amount
    if (e2.kind === 'cure') for (const s of e2.statuses || []) delete o.st[s]
    A.SAVE.bag[it.key] -= 1
    B.item = true
    A.closeAll()
    plates()
    team()
    actions('pick')
    say(
      e2.kind === 'heal'
        ? `${o.name} recovered ${e2.amount} HP.`
        : e2.kind === 'rerolls'
          ? `+${e2.amount} reroll${e2.amount > 1 ? 's' : ''}.`
          : `${o.name} is cured.`,
    )
  })
  let PENDING = null
  /** A Versus fight against `opp` ({name, look, team}), with your saved team. */
  A.startVersus = (opp) => {
    PENDING = opp
    A.showPage('battle')
  }
  A.startBattle = () =>
    A.TEAM.some((m) => m.hp[0] > 0)
      ? A.showPage('battle')
      : A.toast('Your team is worn out: heal them at a Pokémon Center first')
})()
