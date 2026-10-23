// The trailer's music: an original chiptune at 120 BPM, synthesised like the game's sound effects (pulse, triangle and
// noise voices), so nothing is borrowed. D minor through the journey, D major for the evolution, the five of a kind and
// the end card. Its sections follow the beat sheet (clock.ts): the title's riff and held chord, a light groove under
// each explained roll, the climb of the evolution, a stop under the slow die, the build through the big moments, the
// features' riff an octave up, the lab's quiet arpeggio, the last chord.

const Q = 0.5
const S = Q / 4
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)

type Chord = { root: number; third: number }
const Dm: Chord = { root: 62, third: 3 }
const Bb: Chord = { root: 58, third: 4 }
const C: Chord = { root: 60, third: 4 }
const A: Chord = { root: 57, third: 4 }
const D: Chord = { root: 62, third: 4 }
const G: Chord = { root: 55, third: 4 }
const tones = (c: Chord) => [0, c.third, 7, 12, 12 + c.third, 19]

export function scoreMusic(ctx: BaseAudioContext, out: AudioNode) {
  const waves = new Map<number, PeriodicWave>()
  const pulse = (duty: number) => {
    let w = waves.get(duty)
    if (!w) {
      const n = 48
      const re = new Float32Array(n)
      const im = new Float32Array(n)
      for (let i = 1; i < n; i++) re[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty)
      w = ctx.createPeriodicWave(re, im)
      waves.set(duty, w)
    }
    return w
  }
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  {
    const d = noiseBuf.getChannelData(0)
    let s = 7
    let last = 0
    for (let i = 0; i < d.length; i++) {
      // Crushed noise, like the game's: a new value every few samples.
      if (i % 3 === 0) {
        s = (s * 16807) % 2147483647
        last = (s / 2147483647) * 2 - 1
      }
      d[i] = last
    }
  }

  // Added to every time below: the parts after the fights are written at their first times and moved with it.
  let OFF = 0
  const voice = (
    t: number,
    m: number,
    d: number,
    { v = 0.2, duty = 0.25, tri = false, slide = 0, pan = 0 }: { v?: number; duty?: number; tri?: boolean; slide?: number; pan?: number } = {},
  ) => {
    t += OFF
    const o = ctx.createOscillator()
    if (tri) o.type = 'triangle'
    else o.setPeriodicWave(pulse(duty))
    o.frequency.setValueAtTime(hz(m), t)
    if (slide) o.frequency.exponentialRampToValueAtTime(hz(m + slide), t + d)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(v, t + 0.004)
    g.gain.setValueAtTime(v, t + Math.max(0.005, d * 0.6))
    g.gain.exponentialRampToValueAtTime(0.0008, t + d)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    o.connect(g).connect(p).connect(out)
    o.start(t)
    o.stop(t + d + 0.02)
  }
  const noise = (t: number, d: number, { v = 0.2, f = 6000, type = 'highpass' as BiquadFilterType, q = 0.7, slide = 0 } = {}) => {
    t += OFF
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    const fl = ctx.createBiquadFilter()
    fl.type = type
    fl.frequency.setValueAtTime(f, t)
    if (slide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d)
    fl.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.0008, t + d)
    s.connect(fl).connect(g).connect(out)
    s.start(t, (t * 0.37) % 0.5)
    s.stop(t + d + 0.02)
  }
  const kick = (t: number, v = 0.9) => {
    t += OFF
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.2)
  }
  const snare = (t: number, v = 0.35) => {
    noise(t, 0.14, { v, f: 1900, type: 'bandpass', q: 0.6 })
    voice(t, 52, 0.06, { v: v * 0.5, tri: true, slide: -12 })
  }
  const hat = (t: number, v = 0.07, d = 0.03) => noise(t, d, { v, f: 7500 })
  const crash = (t: number, v = 0.22) => noise(t, 1.4, { v, f: 5000, q: 0.4 })

  // ---- the parts
  /** A groove bar (or part of one): kick, snare, hats, an eighth-note bass. */
  const groove = (t0: number, beats: number, c: Chord, { drums = true, busy = false } = {}) => {
    const bass = [0, 0, 12, 0, 0, 12, 0, 7]
    for (let i = 0; i < beats * 2; i++) {
      const t = t0 + i * (Q / 2)
      voice(t, c.root - 24 + bass[i % 8]!, Q / 2 - 0.02, { v: 0.5, tri: true })
      if (!drums) continue
      hat(t + (busy ? 0 : Q / 4), i % 2 ? 0.06 : 0.04)
      if (busy) hat(t + Q / 4, 0.035)
      if (i % 2 === 0) {
        const beat = i / 2
        if (beat % 2 === 0) kick(t)
        else snare(t)
        if (busy && beat % 2 === 0) kick(t + Q * 0.75, 0.6)
      }
    }
  }
  /** Sixteenth-note arpeggio over a chord. */
  const arp = (t0: number, beats: number, c: Chord, { oct = 0, v = 0.07, duty = 0.125, tri = false, pan = 0.25 } = {}) => {
    const pat = [0, 1, 2, 3, 2, 1, 3, 4]
    const tn = tones(c)
    for (let i = 0; i < beats * 4; i++)
      voice(t0 + i * S, c.root + oct + tn[pat[i % pat.length]!]!, S * 0.9, { v, duty, tri, pan })
  }
  /** A melody: [midi or null, length in sixteenths]. */
  const line = (t0: number, notes: [number | null, number][], { v = 0.16, duty = 0.25, oct = 0, pan = -0.15 } = {}) => {
    let t = t0
    for (const [m, n] of notes) {
      if (m != null) voice(t, m + oct, n * S - 0.015, { v, duty, pan })
      t += n * S
    }
  }

  // ---- act 1, the title (0 → 4): a riser under the dice, the riff on the combo, a held chord while the word stays
  noise(0.2, 1.3, { v: 0.05, f: 300, type: 'bandpass', q: 1.5, slide: 3000 })
  kick(1.5, 1)
  crash(1.5, 0.25)
  arp(1.5, 2, Dm, { oct: 12, v: 0.09, duty: 0.25 })
  arp(2.5, 2, Bb, { oct: 12, v: 0.07, duty: 0.25 })
  voice(1.5, 38, 2.4, { v: 0.45, tri: true })
  for (const m of [62, 65, 69]) voice(2.0, m, 1.9, { v: 0.035, duty: 0.5 })
  for (let i = 0; i < 4; i++) snare(3.5 + i * S, 0.1 + i * 0.03)

  // ---- act 2, fight 1 (4 → 9): a light groove under the roll, a hit on the move, the level-up's run
  crash(4)
  groove(4, 4, Dm)
  line(4, [[69, 4], [74, 2], [76, 2], [77, 4], [76, 2], [74, 2]])
  groove(6, 1.6, Dm, { drums: false })
  for (let i = 0; i < 3; i++) hat(6 + i * Q, 0.05)
  kick(6.8, 1)
  crash(6.8, 0.2)
  groove(6.8, 2.4, Bb, { busy: true })
  arp(8, 2, D, { oct: 12, v: 0.08 })
  voice(8, 50, 1, { v: 0.35, tri: true })

  // ---- the evolution (9 → 12): no drums, arpeggios climbing, the burst in D major
  ;[Dm, Bb, C, A].forEach((c, i) => arp(9 + i * 0.68, 1.4, c, { oct: i * 5, v: 0.05 + i * 0.012, tri: i < 2 }))
  noise(9.2, 2.5, { v: 0.05, f: 300, type: 'bandpass', q: 1.2, slide: 6000 })
  voice(9, 38, 2.7, { v: 0.3, tri: true })
  kick(11.72, 1)
  crash(11.72, 0.3)
  for (const m of [50, 62, 66, 69, 74]) voice(11.72, m, 0.3, { v: m < 60 ? 0.4 : 0.06, tri: m < 60 })

  // ---- fight 2 (12 → 17)
  crash(12, 0.18)
  groove(12, 4, Bb)
  line(12, [[77, 4], [74, 2], [77, 2], [82, 6], [81, 2]])
  arp(12, 4, Bb, { v: 0.045 })
  groove(14, 2.8, C)
  line(14, [[79, 4], [76, 2], [79, 2], [84, 3]])
  kick(15.4, 1)
  crash(15.4, 0.2)
  groove(15.4, 3.2, C, { busy: true })
  arp(16, 2, C, { oct: 12, v: 0.06 })

  // ---- fight 3 (17 → 26.5): Mewtwo's dark, the throw, the stop under the slow die, the five of a kind in D major
  voice(17, 38, 1.8, { v: 0.45, tri: true })
  voice(17, 50, 1.8, { v: 0.05, duty: 0.5 })
  kick(17.3, 0.6)
  kick(17.52, 0.45)
  kick(17.9, 0.6)
  kick(18.12, 0.45)
  kick(18.28, 1)
  crash(18.28, 0.25)
  groove(18.8, 4, C, { busy: true })
  arp(18.8, 4, C, { oct: 12, v: 0.05 })
  line(18.8, [[79, 4], [76, 2], [79, 2], [84, 4], [83, 4]])
  groove(20.8, 1.5, A, { busy: true })
  // The stop (21.55 → 23.92): only a slow heartbeat and a long riser.
  for (let t = 21.6; t < 23.9; t += 0.42) kick(t, 0.55)
  noise(21.55, 2.37, { v: 0.05, f: 150, type: 'bandpass', q: 2, slide: 5000 })
  voice(21.55, 33, 2.37, { v: 0.25, tri: true, slide: 12 })
  // Five 5s: a fanfare.
  kick(23.92, 1)
  crash(23.92, 0.35)
  for (const m of [50, 62, 66, 69, 74, 78]) voice(23.92, m, 0.9, { v: m < 60 ? 0.45 : 0.06, tri: m < 60 })
  ;[74, 78, 81, 86, 90, 93].forEach((m, i) => voice(23.95 + i * 0.07, m, 0.3, { v: 0.07, duty: 0.25, pan: 0.3 }))
  groove(24.4, 2.4, D, { busy: true })
  line(24.4, [[86, 2], [88, 2], [90, 4], [93, 4]], { v: 0.12 })
  kick(26.08, 1)
  crash(26.08, 0.3)

  // Everything after the fights is written at its first times (the fights were 3 s longer) and moved back with OFF.
  OFF = -3

  // ---- the big moments (29.5 → 47)
  voice(29.5, 38, 2.2, { v: 0.35, tri: true })
  for (let t = 29.5; t < 31.7; t += 0.5) kick(t, 0.5)
  crash(31.7, 0.25)
  groove(31.7, 4.6, Dm, { busy: true })
  arp(31.7, 4.6, Dm, { oct: 12, v: 0.05 })
  groove(34, 2, C)
  groove(35, 2, Bb, { busy: true })
  crash(36.12, 0.25)
  groove(36.12, 1.8, C, { busy: true })
  arp(36.12, 1.8, C, { oct: 12, v: 0.06 })
  groove(37, 4, A)
  crash(39.05, 0.25)
  groove(39.05, 2, Dm, { busy: true })
  arp(39.05, 2, Dm, { oct: 12, v: 0.06 })
  crash(40, 0.2)
  groove(40, 4, Bb)
  arp(40, 4, Bb, { v: 0.06 })
  line(40, [[77, 4], [74, 4], [77, 4], [82, 4]], { v: 0.12 })
  groove(42, 3, C, { busy: true })
  arp(42, 3, C, { oct: 12, v: 0.06 })
  crash(43.5, 0.25)
  groove(43.5, 5, A, { busy: true })
  arp(43.5, 5, A, { oct: 12, v: 0.07 })
  line(43.5, [[81, 4], [83, 4], [85, 4], [88, 8]], { v: 0.13 })
  for (let i = 0; i < 8; i++) snare(46 + i * S, 0.12 + i * 0.015)
  for (let i = 0; i < 8; i++) snare(46.5 + i * (S / 2), 0.2 + i * 0.02)
  noise(46, 1.0, { v: 0.08, f: 400, type: 'bandpass', q: 1, slide: 8000 })

  // ---- the features (47 → 53): the riff an octave up, full groove
  crash(47, 0.3)
  kick(47, 1)
  const feat: [number, Chord][] = [
    [47, D],
    [48.5, Bb],
    [50, C],
    [51.5, A],
  ]
  for (const [t, c] of feat) {
    groove(t, 3, c, { busy: true })
    arp(t, 3, c, { oct: 12, v: 0.08, duty: 0.25 })
  }
  line(47, [
    [86, 2], [85, 2], [86, 2], [90, 2], [93, 4], [94, 2], [93, 2],
    [91, 4], [88, 4], [89, 2], [88, 2], [85, 4],
  ], { v: 0.12, duty: 0.125 })
  line(50, [
    [88, 2], [86, 2], [88, 2], [91, 2], [93, 6], [91, 2],
    [89, 4], [88, 4], [85, 8],
  ], { v: 0.12, duty: 0.125 })

  // ---- the lab (53 → 57.5): a quiet arpeggio, no drums, hanging on the A chord while the ball shakes
  arp(53, 4, Dm, { tri: true, v: 0.12 })
  arp(55, 2, G, { tri: true, v: 0.1, oct: 12 })
  arp(56, 3, A, { tri: true, v: 0.09, oct: 12 })
  voice(53, 38, 2, { v: 0.3, tri: true })
  voice(55, 43, 1, { v: 0.25, tri: true })
  voice(56, 45, 1.5, { v: 0.25, tri: true })

  // ---- the end card (57.5 → 63, so 54.5 → 60): the last chord in D major, a run up, a slow arpeggio while the
  // badges come in, ringing out
  kick(57.5, 1)
  crash(57.5, 0.32)
  for (const m of [50, 62, 66, 69, 74]) voice(57.5, m, 2.5, { v: m < 60 ? 0.4 : 0.07, tri: m < 60, duty: 0.25 })
  ;[62, 66, 69, 74, 78, 81, 86].forEach((m, i) => voice(57.5 + i * 0.06, m, 0.5, { v: 0.06, duty: 0.125, pan: 0.3 }))
  line(58, [[86, 4], [90, 12]], { v: 0.1, duty: 0.25 })
  arp(59.5, 4, D, { tri: true, v: 0.08, oct: 12 })
  voice(59.5, 50, 3.5, { v: 0.3, tri: true })
  for (const m of [62, 66, 69]) voice(59.5, m, 3.5, { v: 0.03, duty: 0.5 })
}
