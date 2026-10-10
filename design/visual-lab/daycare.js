/*
 * Pokédice Visual Lab: the Day Care (Johto Daybreak, Jersey 20).
 * One Day Care for every region, open from 20 species caught. Two of your Pokémon train there until Lv.100 (+1 XP
 * every 10 min, no other cap), and up to four Pokémon from your friends' Day Cares visit (they stay theirs: nothing
 * changes for the friend). Every 12 h, each of yours checks everyone there: a pair from compatible Egg groups leaves
 * an Egg. Ditto pairs with everyone, but slower: its pairs have their own check, every 24 h. The Egg's species is
 * random as before (missing ones more likely), and it hatches shiny 1 time in 100.
 * The page looks like Home: the yard on top with everyone roaming (pairs seek each other out), the slots under it.
 */
;(function () {
  'use strict'
  const A = HOME.api
  const { $, $$, esc, dexIco, plural } = A
  // Eggs hatch into the first form of an evolving line, the region's own, starters excluded; missing ones 4× as
  // likely. The prototype keeps to the ones it has a sprite for.
  const EGG_POOL = [147, 133, 102, 84, 46, 48, 111, 79]
  const EGG = { unowned: 4, rank: 3, offset: 5, min: 5 }
  // Your first and second Pokémon each have a colour: a heart in that colour means "can make an Egg with it".
  const HEART = ['#ff5a7a', '#5b8def']
  const ST = { q: '', only: false, slot: null, mode: 'friend' }

  // Your friends (from the friend list, planned in another session) and what is in their Day Cares, read only.
  const FRIENDS = [
    {
      name: 'Lea',
      look: 'cooltrainer-f',
      care: [
        { dex: 149, lv: 55 },
        { dex: 135, lv: 41 },
      ],
    },
    {
      name: 'Noor',
      look: 'psychic-m',
      care: [
        { dex: 132, lv: 30 },
        { dex: 143, lv: 47 },
      ],
    },
    {
      name: 'Kai',
      look: 'hiker',
      care: [
        { dex: 59, lv: 50 },
        { dex: 111, lv: 30 },
      ],
    },
    {
      name: 'Sora',
      look: 'swimmer-f',
      care: [
        { dex: 130, lv: 52 },
        { dex: 131, lv: 36 },
      ],
    },
    { name: 'Mio', look: 'beauty', care: [{ dex: 113, lv: 40 }] },
    {
      name: 'Rin',
      look: 'black-belt',
      care: [
        { dex: 123, lv: 33 },
        { dex: 128, lv: 38 },
      ],
    },
  ]
  const friendOf = (name) => FRIENDS.find((f) => f.name === name)
  const nameOf = (d) => A.K.names[d]

  // ------------------------------------------------------------------ Egg groups (the real ones)
  const isDitto = (d) => (A.G.eggs[d] || []).includes('Ditto')
  const isLegend = (d) => A.G.legendary.includes(d)
  /** A pair with a Ditto in it: it pairs with everyone but legendaries, and its check comes every 24 h, not 12. */
  const slow = (a, b) => isDitto(a) || isDitto(b)
  /**
   * Two Pokémon can make an Egg when they share an Egg group. Ditto pairs with everyone but legendaries and mythicals
   * (slower, see above); Undiscovered (legendaries, babies) never breeds otherwise; genderless ones (Magnemite,
   * Voltorb…) only with Ditto; two of a male-only or two of a female-only species can't. Pokédice has no genders:
   * this is the closest to the games without them.
   */
  function compatible(a, b) {
    if (slow(a, b)) return !isLegend(a) && !isLegend(b)
    const E = A.G.eggs,
      Gd = A.G.gender
    const ga = E[a] || [],
      gb = E[b] || []
    if (ga.includes('Undiscovered') || gb.includes('Undiscovered')) return false
    if (Gd[a] === 'N' || Gd[b] === 'N') return false
    if (Gd[a] && Gd[a] === Gd[b]) return false
    return ga.some((g) => gb.includes(g))
  }
  /** What makes a pair: the group they share, or Ditto, and how often it is checked. */
  const why = (a, b) => {
    if (slow(a, b)) return `Ditto · every ${A.DC.dittoHours} h`
    const ga = A.G.eggs[a] || [],
      gb = A.G.eggs[b] || []
    return `${ga.filter((g) => gb.includes(g)).join(' · ')} · every ${A.DC.checkHours} h`
  }
  /** The tag on a Pokémon you could add: who it would pair with, in their heart colours, and Ditto's slower pace. */
  function tagFor(dex, idx, heartsOf = idx) {
    const own = A.SAVE.dayCare.own
    if (isDitto(dex))
      return `<em class="dc-tag ok">${hearts(heartsOf)}Compatible with all but legendaries · ${A.DC.dittoHours} h</em>`
    if (!idx.length) return ''
    const names = idx.map((i) =>
      isDitto(own[i].dex) ? `${own[i].name} (every ${A.DC.dittoHours} h)` : own[i].name,
    )
    return `<em class="dc-tag ok">${hearts(heartsOf)}Compatible with ${esc(names.join(' and '))}</em>`
  }
  /** Everyone at the Day Care, with an id: your two (o0, o1) and the visitors (f0…f3). */
  function everyone() {
    const D = A.SAVE.dayCare
    return [
      ...D.own.map((d, i) => d && { ...d, uid: `o${i}`, mine: i }),
      ...D.friends.map((d, i) => d && { ...d, uid: `f${i}`, name: nameOf(d.dex) }),
    ].filter(Boolean)
  }
  /** The pairs the checks will find: each of yours with everyone else (each pair once). Ditto's are the slow ones. */
  function pairs() {
    const all = everyone(),
      out = []
    for (const a of all.filter((x) => x.mine != null))
      for (const b of all)
        if (b !== a && !(b.mine != null && b.mine < a.mine) && compatible(a.dex, b.dex)) {
          const pr = [a, b]
          pr.slow = slow(a.dex, b.dex)
          out.push(pr)
        }
    return out
  }
  /** Minutes to the next check that could leave an Egg: the 12 h one, or Ditto's 24 h one if only Ditto pairs. */
  function nextCheck() {
    const D = A.SAVE.dayCare,
      ps = pairs()
    const t = []
    if (ps.some((p) => !p.slow)) t.push(D.next)
    if (ps.some((p) => p.slow)) t.push(D.nextDitto)
    return t.length ? Math.min(...t) : D.next
  }
  /** Which of your two a Pokémon pairs with: their indexes, for the hearts. */
  const pairsWith = (dex, skip) =>
    A.SAVE.dayCare.own
      .map((o, i) => (o && i !== skip && compatible(o.dex, dex) ? i : -1))
      .filter((i) => i >= 0)
  const HEARTS = {}
  const heartImg = (c) =>
    (HEARTS[c] ||= PX.icon(
      ['.k.k.', 'kakak', 'kaaak', '.kak.', '..k..'],
      { k: '#24304f', a: c },
      2,
    ).toDataURL())
  const hearts = (idx) =>
    idx.map((i) => `<img class="px dc-heart" alt="" src="${heartImg(HEART[i])}" />`).join('')

  // ------------------------------------------------------------------ the page
  let yard = null
  let hatching = null // the Egg moment's player, while it is open
  function render(p) {
    const S = A.SAVE,
      D = S.dayCare,
      DC = A.DC
    const all = everyone(),
      ps = pairs()
    const fN = D.friends.filter(Boolean).length
    if (yard) yard.stop()
    p.innerHTML = `
      <div class="dc-yard" id="dc-yard"><canvas width="288" height="276" role="img" aria-label="The Day Care's yard: ${esc(all.map((m) => m.name).join(', '))}"></canvas>
        <div class="dc-yplate hm-plate"><button type="button" class="pg-back" data-home aria-label="Back to Home"></button><span class="dc-yp-t"><h2>Day Care</h2><small>Every region · ${plural(all.length, 'Pokémon', 'Pokémon')} here</small></span></div></div>
      ${D.egg ? eggCard(D) : rushBar(ps)}
      <div class="pg-sec-h"><h3>Your Pokémon</h3><span class="pg-count">${D.own.filter(Boolean).length}/${DC.own}</span></div>
      <p class="pg-note">They gain ${DC.per} XP every ${DC.tick} min, even while you’re away, all the way to Lv.100.</p>
      <ul class="dc-grid">${D.own.map((d, i) => (d ? ownCard(d, i) : emptyOwn(i))).join('')}</ul>
      <div class="pg-sec-h"><h3>Friends’ Pokémon</h3><span class="pg-count">${fN}/${DC.friends}</span></div>
      <p class="pg-note">Invite a Pokémon from a friend’s Day Care to make Eggs with yours. It stays theirs: nothing changes for your friend.</p>
      <ul class="dc-grid">${D.friends.map((d, i) => (d ? friendCard(d, i) : emptyFriend(i))).join('')}</ul>
      <section class="dc-check" aria-labelledby="dc-check-h">
        <h3 id="dc-check-h">Egg checks</h3>
        <p class="pg-note">Every ${DC.checkHours} h, each of your Pokémon checks everyone here: a pair from the same Egg group leaves an Egg. Ditto pairs with everyone but legendaries, slower: its pairs are checked every ${DC.dittoHours} h. One Egg waits at a time.</p>
        <dl class="dc-timers"><dt>Egg groups</dt><dd>every ${DC.checkHours} h · next in ${A.dcTime(D.next)}</dd><dt>Ditto</dt><dd>every ${DC.dittoHours} h · next in ${A.dcTime(D.nextDitto)}</dd></dl>
        ${ps.length ? `<ul class="dc-pairs">${ps.map((pr) => `<li${pr.slow ? ' class="slow"' : ''}>${hearts([pr[0].mine])}<b>${esc(pr[0].name)}</b><span aria-hidden="true">+</span><b>${esc(pr[1].name)}</b>${pr[1].friend ? `<small>${esc(pr[1].friend)}’s</small>` : ''}<em>${esc(why(pr[0].dex, pr[1].dex))}</em></li>`).join('')}</ul>` : '<p class="dc-nopair">No pair can make an Egg yet. Invite a friend’s Pokémon from the same Egg group, or a Ditto: the picker shows which.</p>'}
      </section>`
    const cv = $('#dc-yard canvas', p)
    yard = A.makeYard(
      cv,
      all
        .filter((m) => A.spriteKey(m.dex))
        .map((m) => ({
          dex: m.dex,
          key: A.spriteKey(m.dex),
          name: m.name,
          uid: m.uid,
          likes: all
            .filter((o) => o !== m && (o.mine != null || m.mine != null) && compatible(o.dex, m.dex))
            .map((o) => o.uid),
        })),
    )
    if (D.egg) yard.overlay(drawNest)
  }
  /** The Egg in its nest in the yard, shaking now and then. */
  const NEST = { x: 214, y: 236 }
  function drawNest(g, t, layer) {
    if (layer !== 'back') return
    PX.ellipse(g, NEST.x, NEST.y, 14, 5, '#8a5a32')
    PX.ellipse(g, NEST.x, NEST.y - 1, 12, 4, '#c8945a')
    const shake = t % 1.6 < 0.5 ? (Math.floor(t * 14) % 2 ? 1 : -1) : 0
    PX.sprite(g, 'front-egg', NEST.x + shake, NEST.y + 1, 0, {})
    PX.ellipse(g, NEST.x, NEST.y + 2, 12, 2, '#a0704a')
  }
  /** The Egg waiting, in gold, where the Egg-now bar sits otherwise. */
  const eggCard = (D) =>
    `<div class="dc-eggcard"><span class="dc-eggspr" aria-hidden="true"><img class="px" alt="" src="assets/front-egg.png" /></span><span class="dc-egg-t"><b>An Egg is waiting!</b><small>${D.eggFrom ? `${esc(D.eggFrom[0])} and ${esc(D.eggFrom[1])} left it` : 'Left by a pair at the last check'}. It hatches into a young Pokémon, often one you don’t have yet.</small></span><button type="button" class="ui-btn gold" data-hatch><span>Hatch it</span></button></div>`
  /** The next check, and the button that skips the wait for gold (admin setting, ₽200). */
  function rushBar(ps) {
    const price = A.DC.rushPrice
    const poor = A.SAVE.gold < price
    return `<div class="dc-rush">
      <span class="dc-rush-t"><small>Next Egg check</small><b>in ${A.dcTime(nextCheck())}</b><small>${ps.length ? plural(ps.length, 'pair') + ' can leave one' : 'No pair can make an Egg yet'}</small></span>
      <button type="button" class="ui-btn gold dc-rush-btn${poor ? ' poor' : ''}" data-rush${ps.length ? '' : ' disabled'} aria-label="Skip the wait: an Egg now for ${A.money(price)}"><span class="dc-rush-l">Egg now</span><span class="dc-rush-p"><img class="px" alt="" src="${A.icons.COIN}" />${A.money(price)}</span></button>
    </div>`
  }
  /** Who a Pokémon here pairs with, as hearts and names. */
  const mateList = (list) =>
    list.map((o) => `<span>${o.mine != null ? hearts([o.mine]) : ''}${esc(o.name)}</span>`).join('')
  function ownCard(d, i) {
    const others = everyone().filter((o) => o.uid !== `o${i}` && compatible(o.dex, d.dex))
    return `<li class="dc-card mine" style="--hc:${HEART[i]}">
      <span class="dc-c-head"><img class="px dc-heart" alt="" src="${heartImg(HEART[i])}" /><span>Yours</span><em>${d.lv > d.from ? `+${d.lv - d.from} Lv` : 'New'}</em></span>
      <span class="dc-c-spr">${A.sprCanvas(d.dex, 96, 72)}</span>
      <span class="dc-c-name"><b>${esc(d.name)}</b><span>Lv.${d.lv}</span></span>
      <span class="dc-xp" role="img" aria-label="${Math.round(d.xp * 100)}% of the way to Lv.${d.lv + 1}"><i style="width:${d.xp * 100}%"></i></span>
      <small>${d.lv >= 100 ? 'Lv.100: it can’t grow more' : `To Lv.${d.lv + 1} · came at Lv.${d.from}`}</small>
      <span class="dc-c-mates">${isDitto(d.dex) ? '<small>Pairs with all but legendaries</small>' : others.length ? `<small>Pairs with</small>${mateList(others)}` : '<small>No partner here yet</small>'}</span>
      <button type="button" class="ui-btn dc-c-btn" data-take="${i}" aria-label="Take back ${esc(d.name)}"><span>Take back</span></button>
    </li>`
  }
  const emptyOwn = (i) =>
    `<li class="dc-card empty"><button type="button" class="dc-add" data-leave="${i}"><span class="dc-plus" aria-hidden="true">+</span><b>Leave a Pokémon</b><small>From your team or your Box</small></button></li>`
  function friendCard(d, i) {
    const f = friendOf(d.friend)
    const own = everyone().filter((o) => o.mine != null && compatible(o.dex, d.dex))
    const name = nameOf(d.dex)
    return `<li class="dc-card guest">
      <span class="dc-c-head">${A.lookOf(f.look, 'av')}<span>${esc(d.friend)}’s</span></span>
      <span class="dc-c-spr">${A.sprCanvas(d.dex, 96, 72)}</span>
      <span class="dc-c-name"><b>${esc(name)}</b><span>Lv.${d.lv}</span></span>
      <span class="dc-c-mates">${own.length ? `<small>Pairs with</small>${mateList(own)}` : '<small>No match with yours</small>'}</span>
      <button type="button" class="ui-btn dc-c-btn" data-unvite="${i}" aria-label="Send ${esc(name)} back to ${esc(d.friend)}’s Day Care"><span>Send back</span></button>
    </li>`
  }
  const emptyFriend = (i) =>
    `<li class="dc-card empty"><button type="button" class="dc-add" data-invite="${i}"><span class="dc-plus" aria-hidden="true">+</span><b>Add from a friend</b><small>A Pokémon from their Day Care</small></button></li>`

  // ------------------------------------------------------------------ adding: a friend's Pokémon, or one of yours
  function friendSheet(slot) {
    ST.slot = slot
    ST.mode = 'friend'
    ST.q = ''
    $('#hm-s2-title').textContent = 'Add a friend’s Pokémon'
    $('#hm-s2-sub').textContent =
      'From your friends’ Day Cares. It stays theirs: nothing changes for your friend.'
    $('#hm-s2-body').innerHTML =
      `<div class="pg-tools"><label class="sr" for="dc-q">Search a friend or a Pokémon</label><input id="dc-q" type="search" placeholder="Friend or Pokémon" autocomplete="off" spellcheck="false" /><button type="button" class="pg-toggle" data-only aria-pressed="${ST.only}">Compatible only</button></div><div id="dc-pick"></div>`
    $('#hm-s2-foot').hidden = true
    friendList()
    A.openDialog($('#hm-sheet2'), $('#dc-q'))
  }
  function friendList() {
    const D = A.SAVE.dayCare
    const q = A.fold(ST.q.trim())
    const taken = new Set(D.friends.filter(Boolean).map((d) => `${d.friend}:${d.dex}`))
    const groups = FRIENDS.map((f) => {
      const rows = f.care
        .filter((c) => !q || A.fold(f.name).includes(q) || A.fold(nameOf(c.dex)).includes(q))
        .map((c) => ({ ...c, idx: pairsWith(c.dex) }))
        .filter((c) => !ST.only || c.idx.length)
      return { f, rows, best: Math.max(0, ...rows.map((r) => r.idx.length)) }
    })
      .filter((g) => g.rows.length)
      .sort((a, b) => b.best - a.best)
    $('#dc-pick').innerHTML =
      groups
        .map(
          ({ f, rows }) =>
            `<section class="dc-pgroup"><h4>${A.lookOf(f.look, 'sm')}${esc(f.name)}<small>${f.care.length} Pokémon at the Day Care</small></h4><ul>${rows
              .map((c) => {
                const added = taken.has(`${f.name}:${c.dex}`)
                return `<li><button type="button" class="pg-useit dc-prow" data-pick="${esc(f.name)}:${c.dex}"${added ? ' disabled' : ''}>${dexIco(c.dex)}<span><b>${esc(nameOf(c.dex))} <small>Lv.${c.lv}</small></b><small>${esc((A.G.eggs[c.dex] || []).join(' · '))}</small></span>${added ? '<em class="dc-tag">Invited</em>' : c.idx.length ? tagFor(c.dex, c.idx) : '<em class="dc-tag no">No match with yours</em>'}</button></li>`
              })
              .join('')}</ul></section>`,
        )
        .join('') ||
      `<p class="hm-empty">${ST.only ? 'No friend has a compatible Pokémon at their Day Care right now.' : 'No friend or Pokémon by that name.'}</p>`
  }
  function invite(ref) {
    const [friend, dex] = ref.split(':')
    const f = friendOf(friend),
      c = f.care.find((x) => x.dex === Number(dex))
    const D = A.SAVE.dayCare
    const slot = D.friends[ST.slot] == null ? ST.slot : D.friends.indexOf(null)
    if (slot < 0) return A.toast('Four friends’ Pokémon at most: send one back first')
    D.friends[slot] = { friend, dex: c.dex, lv: c.lv }
    A.closeAll()
    rerender()
    A.renderWidgets()
    const idx = pairsWith(c.dex)
    A.toast(
      `${nameOf(c.dex)} is visiting from ${friend}’s Day Care${idx.length ? ` · pairs with ${idx.map((i) => D.own[i].name).join(' and ')}` : ''}`,
    )
  }
  function uninvite(i) {
    const D = A.SAVE.dayCare,
      d = D.friends[i]
    D.friends[i] = null
    rerender()
    A.renderWidgets()
    A.toast(`${nameOf(d.dex)} went back to ${d.friend}’s Day Care`)
  }
  function leaveSheet(slot) {
    ST.slot = slot
    ST.mode = 'own'
    ST.q = ''
    $('#hm-s2-title').textContent = 'Leave which Pokémon?'
    $('#hm-s2-sub').textContent =
      `It leaves your team or Box while it trains: +${A.DC.per} XP every ${A.DC.tick} min, up to Lv.100.`
    $('#hm-s2-body').innerHTML =
      `<div class="pg-tools"><label class="sr" for="dc-q">Search your Pokémon</label><input id="dc-q" type="search" placeholder="Search your Pokémon" autocomplete="off" spellcheck="false" /></div><ul class="dc-pick" id="dc-pick"></ul>`
    $('#hm-s2-foot').hidden = true
    ownList()
    A.openDialog($('#hm-sheet2'), $('#dc-q'))
  }
  function ownList() {
    const q = A.fold(ST.q.trim())
    const team = A.TEAM.length
    const here = everyone()
    const rows = A.owned()
      .filter((m) => !q || A.fold(m.name || nameOf(m.dex)).includes(q))
      .map((m) => ({ ...m, mates: here.filter((o) => compatible(o.dex, m.dex)) }))
      // Those that pair with someone already here first, then the team, then the Box by level.
      .sort(
        (a, b) =>
          (b.mates.length > 0) - (a.mates.length > 0) ||
          (a.where === b.where ? a.lv - b.lv : a.where === 'team' ? -1 : 1),
      )
    $('#dc-pick').innerHTML =
      rows
        .map((m) => {
          const last = m.where === 'team' && team <= 1
          const name = m.name || nameOf(m.dex)
          const tag = isDitto(m.dex)
            ? tagFor(m.dex, [], [ST.slot])
            : m.mates.length
              ? `<em class="dc-tag ok">${hearts([ST.slot])}Compatible with ${esc(m.mates.map((o) => (isDitto(o.dex) ? `${o.name} (every ${A.DC.dittoHours} h)` : o.name)).join(', '))}</em>`
              : ''
          return `<li><button type="button" class="pg-useit dc-prow" data-put="${m.where === 'team' ? `t${m.i}` : m.uid}"${last ? ' disabled' : ''}>${dexIco(m.dex)}<span><b>${esc(name)} <small>Lv.${m.lv}</small></b><small>${last ? 'Your last team member' : esc((A.G.eggs[m.dex] || []).join(' · '))}</small></span>${tag}${m.where === 'team' ? '<em class="dc-teamtag">TEAM</em>' : ''}</button></li>`
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
    const name = m.name || nameOf(m.dex)
    A.SAVE.dayCare.own[ST.slot] = { dex: m.dex, name, lv: m.lv, from: m.lv, xp: 0, shiny: m.shiny }
    A.closeAll()
    rerender()
    A.renderWidgets()
    A.toast(`${name} is staying at the Day Care`)
  }
  function take(i) {
    const D = A.SAVE.dayCare,
      d = D.own[i]
    if (!d) return
    const max = A.hpAt(d.dex, d.lv)
    D.own[i] = null
    const team = joinTeam(d.dex, d.lv, max)
    if (!team) A.boxAdd({ dex: d.dex, lv: d.lv, hp: [max, max], shiny: d.shiny })
    rerender()
    A.renderWidgets()
    const grew = d.lv > d.from ? ` It grew ${plural(d.lv - d.from, 'level')}, to Lv.${d.lv}.` : ''
    A.toast(
      `${d.name} is back!${grew} ${team ? 'It rejoined your team.' : 'Your team is full: it went to the Box.'}`,
    )
  }
  /** Into the team when there's room (it needs a sprite to roam Home), else the Box. */
  function joinTeam(dex, lv, max) {
    if (A.TEAM.length >= 3) return false
    const known = A.MONS.find((m) => m.dex === dex)
    const key = A.spriteKey(dex)
    if (!known && !key) return false
    const base = known || { dex, key, name: nameOf(dex), hpLv: 3, speed: 14, hop: 2 }
    A.TEAM.push({ ...base, lv, hp: [max, max], xp: 0 })
    A.refreshTeam()
    return true
  }

  // ------------------------------------------------------------------ the check, and the Egg
  /**
   * A check (the preview runs them on demand): the 12 h one looks at the Egg-group pairs, Ditto's 24 h one at the
   * pairs with a Ditto. A pair leaves an Egg if none is waiting.
   */
  function runCheck(ditto) {
    const D = A.SAVE.dayCare,
      ps = pairs().filter((p) => p.slow === !!ditto)
    if (ditto) D.nextDitto = A.DC.dittoHours * 60
    else D.next = A.DC.checkHours * 60
    if (D.egg) A.toast('An Egg is already waiting: hatch it so the next check can leave another')
    else if (!ps.length)
      A.toast(
        ditto
          ? 'Ditto’s check: no Ditto here, no Egg this time'
          : 'The check found no compatible pair: no Egg this time',
      )
    else {
      const [a, b] = ps[Math.floor(Math.random() * ps.length)]
      D.egg = true
      D.eggFrom = [a.name, b.friend ? `${b.name} (${b.friend})` : b.name]
      A.toast(`${D.eggFrom[0]} and ${D.eggFrom[1]} left an Egg at the Day Care!`)
    }
    A.renderWidgets()
    rerender()
  }
  /**
   * Egg now: skip the wait for gold. The check that comes next (the one the bar counts down to) runs now and starts
   * over; a pair from it leaves an Egg, and it hatches right away.
   */
  function rush() {
    const D = A.SAVE.dayCare,
      price = A.DC.rushPrice
    const ps = pairs()
    if (D.egg || !ps.length) return
    if (A.SAVE.gold < price) return A.toast(`Need ${A.money(price - A.SAVE.gold)} more`)
    const plain = ps.filter((p) => !p.slow),
      dit = ps.filter((p) => p.slow)
    const ditto = !plain.length || (dit.length && D.nextDitto < D.next)
    const pool = ditto ? dit : plain
    if (ditto) D.nextDitto = A.DC.dittoHours * 60
    else D.next = A.DC.checkHours * 60
    A.SAVE.gold -= price
    A.bumpGold()
    const [a, b] = pool[Math.floor(Math.random() * pool.length)]
    D.egg = true
    D.eggFrom = [a.name, b.friend ? `${b.name} (${b.friend})` : b.name]
    rerender()
    hatch()
  }
  function hatchLevel() {
    const lv = A.owned()
      .map((m) => m.lv)
      .sort((a, b) => a - b)
    const ref = lv[Math.min(EGG.rank, lv.length) - 1] ?? EGG.min
    return Math.max(EGG.min, ref - EGG.offset)
  }
  function pickEgg() {
    const pool = EGG_POOL.map((d) => ({ d, w: A.caught.has(d) ? 1 : EGG.unowned }))
    let x = Math.random() * pool.reduce((n, o) => n + o.w, 0)
    for (const o of pool) if ((x -= o.w) <= 0) return o.d
    return pool[0].d
  }
  function hatch() {
    const S = A.SAVE,
      D = S.dayCare
    if (!D.egg) return
    D.egg = false
    D.eggFrom = null
    const dex = pickEgg(),
      lv = hatchLevel(),
      name = nameOf(dex)
    // Day Care Eggs have their own shiny odds (admin setting, 1 in 100).
    const shiny = Math.random() < A.DC.shiny
    const isNew = !A.caught.has(dex)
    const copies = A.owned().filter((m) => m.dex === dex)
    const best = Math.max(0, ...copies.map((m) => m.lv))
    let where
    const max = A.hpAt(dex, lv)
    if (copies.length && best >= lv && !shiny)
      where = `You already have a stronger ${name}: the Day Care couple will look after this one.`
    else if (copies.length && !shiny) {
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
      A.boxAdd({ dex, lv, hp: [max, max], shiny })
      where = 'Your team is full: it went to the Box.'
    }
    if (isNew) {
      A.caught.add(dex)
      S.dexSeen = false
    }
    A.renderWidgets()
    moment(dex, name, lv, isNew, where, shiny)
  }
  /** The hatching, full screen over the phone: the Animations tab's timeline, then what hatched and where it went. */
  function moment(dex, name, lv, isNew, where, shiny) {
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
    const base = A.spriteKey(dex) || 'front-eevee'
    const key = shiny && PX.SPR.meta[`${base}-shiny`] ? `${base}-shiny` : base
    const def = () => ANIM.MAKE.hatch({ key, name, shiny })
    const pl = new ANIM.Player(cv, hud)
    pl.load(def(), { style: 'daybreak' })
    hatching = { pl, el }
    const done = () => {
      pl.pause()
      sayEl.textContent = shiny ? `A shiny ${name} hatched from the Egg!` : `${name} hatched from the Egg!`
      $('.dc-m-skip', el).hidden = true
      const end = $('.dc-m-end', el)
      end.hidden = false
      end.innerHTML = `<p class="dc-m-who">${dexIco(dex)}<b>${esc(name)}</b><span>Lv.${lv}</span>${shiny ? '<em class="shiny">✦ SHINY</em>' : ''}${isNew ? '<em>NEW</em>' : ''}</p><p class="dc-m-where">${esc(where)}</p>
        <div class="dc-m-btns"><button type="button" class="ui-btn primary" data-m-close><span>Done</span></button></div>`
      $('[data-m-close]', end).focus({ preventScroll: true })
    }
    pl.onEnd = done
    const skip = () => {
      pl.t = def().dur - 0.01
      pl.advance(0.02)
      pl.render()
      done()
    }
    $('.dc-m-skip', el).onclick = skip
    if (A.REDUCED) {
      pl.t = def().dur - 0.01
      pl.advance(0.02)
      pl.render()
      done()
    } else pl.play()
    $('.dc-m-skip', el).focus({ preventScroll: true })
    el.onclick = (e) => {
      if (e.target.closest('[data-m-close]')) close()
    }
    // Escape skips to the end, then closes.
    el.onkeydown = (e) => e.key === 'Escape' && ($('.dc-m-end', el).hidden ? skip() : close())
    function close() {
      shut()
      rerender()
      A.renderNavDots()
      A.renderWidgets()
    }
  }

  function shut() {
    if (!hatching) return
    hatching.pl.pause()
    hatching.el.hidden = true
    hatching = null
  }

  // ------------------------------------------------------------------ wiring
  const page = () => $('.hm-page[data-page="daycare"]')
  const rerender = () => {
    const p = page()
    if (p && !p.hidden) render(p)
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
          if ((b = t.closest('[data-invite]'))) return friendSheet(Number(b.dataset.invite))
          if ((b = t.closest('[data-unvite]'))) return uninvite(Number(b.dataset.unvite))
          if (t.closest('[data-hatch]')) return hatch()
          if (t.closest('[data-rush]')) return rush()
        })
        // The yard: tap a Pokémon (a hop and a heart) or the Egg (it hatches).
        p.addEventListener('pointerdown', (e) => {
          const c = e.target.closest('#dc-yard canvas')
          if (!c || !yard) return
          const r = c.getBoundingClientRect()
          const x = ((e.clientX - r.left) / r.width) * 288,
            y = ((e.clientY - r.top) / r.height) * 276
          if (A.SAVE.dayCare.egg && Math.abs(x - NEST.x) < 16 && y > NEST.y - 30 && y < NEST.y + 8)
            return hatch()
          const m = yard.hit(x, y)
          if (m) yard.poke(m)
        })
      }
      render(p)
    },
    leave() {
      if (yard) yard.stop()
      yard = null
      shut()
    },
    // Another save in the preview: an open hatching closes with it.
    reset: shut,
    dot: null,
  })
  /** From Home's widget: open the Day Care, and hatch the waiting Egg right away. */
  A.openDayCare = (o = {}) => {
    A.showPage('daycare')
    if (o.hatch) setTimeout(hatch, A.REDUCED ? 0 : 450)
  }
  A.dcCheck = runCheck
  A.dcCompatible = compatible
  A.dcNext = nextCheck
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'dc-q') return
    ST.q = e.target.value
    ST.mode === 'friend' ? friendList() : ownList()
  })
  document.addEventListener('click', (e) => {
    let b
    if ((b = e.target.closest('[data-put]')) && !b.disabled) return put(b.dataset.put)
    if ((b = e.target.closest('[data-pick]')) && !b.disabled) return invite(b.dataset.pick)
    if ((b = e.target.closest('#hm-sheet2 [data-only]'))) {
      ST.only = !ST.only
      b.setAttribute('aria-pressed', String(ST.only))
      friendList()
    }
    if (e.target.closest('#hm-dc-check')) runCheck(false)
    if (e.target.closest('#hm-dc-ditto')) runCheck(true)
  })
})()
