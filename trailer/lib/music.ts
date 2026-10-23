// The trailer's music: an original chiptune at 120 BPM, synthesised like the game's sound effects (pulse, triangle and
// noise voices), so nothing is borrowed. D minor through the journey, D major on the end card. Its sections follow
// the beat sheet (clock.ts): the title's riff, the journey's groove with a stop under the slow die, the montage's
// build, the features' riff an octave up, the lab's quiet arpeggio, the last chord.

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

  const voice = (
    t: number,
    m: number,
    d: number,
    { v = 0.2, duty = 0.25, tri = false, slide = 0, pan = 0 }: { v?: number; duty?: number; tri?: boolean; slide?: number; pan?: number } = {},
  ) => {
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

  // ---- act 1, the title (0 → 2.5): a riser under the dice, then the riff on the combo
  noise(0.2, 1.3, { v: 0.05, f: 300, type: 'bandpass', q: 1.5, slide: 3000 })
  kick(1.5, 1)
  crash(1.5, 0.25)
  arp(1.5, 2, Dm, { oct: 12, v: 0.09, duty: 0.25 })
  voice(1.5, 38, 1.0, { v: 0.5, tri: true })
  hat(2.25, 0.05)
  noise(2.0, 0.5, { v: 0.06, f: 800, type: 'bandpass', q: 1, slide: 6000 })

  // ---- act 2, the journey (2.5 → 10): a bar a fight, the legend's dark, a stop under the slow die
  crash(2.5)
  groove(2.5, 4, Dm)
  line(2.5, [
    [69, 4], [74, 2], [76, 2], [77, 4], [76, 2], [74, 2],
  ])
  crash(4.5, 0.18)
  groove(4.5, 4, Bb)
  line(4.5, [
    [77, 4], [74, 2], [77, 2], [82, 6], [81, 2],
  ])
  arp(4.5, 4, Bb, { v: 0.045 })
  groove(6.5, 1, C, { busy: true })
  line(6.5, [[79, 2], [84, 2]])
  // Mewtwo's entrance (7 → 7.8): the drums drop out under a low drone and its heartbeats.
  voice(7.0, 38, 0.8, { v: 0.45, tri: true })
  voice(7.0, 50, 0.8, { v: 0.05, duty: 0.5 })
  kick(7.05, 0.6)
  kick(7.25, 0.45)
  crash(7.33, 0.25)
  kick(7.33, 1)
  groove(7.8, 2, C, { busy: true })
  arp(7.8, 2, C, { oct: 12, v: 0.05 })
  line(7.8, [[79, 4], [76, 2], [79, 2]])
  groove(8.8, 0.1, A, { drums: false })
  // The stop under the slow die (8.85 → 9.375): only a heartbeat and a riser.
  kick(8.9, 0.7)
  kick(9.12, 0.5)
  noise(8.85, 0.52, { v: 0.05, f: 200, type: 'bandpass', q: 2, slide: 4000 })
  // Five of a kind lands: the big hit on the A chord, until the smash cut.
  kick(9.375, 1)
  crash(9.375, 0.3)
  groove(9.375, 1, A, { busy: true })
  line(9.375, [[81, 4]], { v: 0.18 })
  arp(9.375, 1, A, { oct: 12, v: 0.06 })
  kick(9.835, 1)

  // ---- act 3, the montage (10 → 15): the siren's bar, then a build to the roll
  for (let i = 0; i < 4; i++) voice(10 + i * 0.25, i % 2 ? 81 : 76, 0.22, { v: 0.05, duty: 0.5 })
  groove(10, 2, Dm, { drums: false })
  kick(10)
  kick(10.5)
  crash(11)
  groove(11, 2, Bb)
  arp(11, 2, Bb, { v: 0.06 })
  line(11, [[77, 4], [74, 4]], { v: 0.13 })
  groove(12, 2, C, { busy: true })
  arp(12, 2, C, { oct: 12, v: 0.06 })
  line(12, [[79, 4], [84, 4]], { v: 0.14 })
  crash(13, 0.2)
  groove(13, 2, A, { busy: true })
  arp(13, 2, A, { oct: 12, v: 0.07 })
  line(13, [[81, 2], [83, 2], [85, 2], [88, 2]], { v: 0.14 })
  // The roll: sixteenths, then thirty-seconds, rising.
  for (let i = 0; i < 8; i++) snare(14 + i * S, 0.12 + i * 0.015)
  for (let i = 0; i < 8; i++) snare(14.5 + i * (S / 2), 0.2 + i * 0.02)
  groove(14, 2, A, { drums: false })
  noise(14, 1.0, { v: 0.08, f: 400, type: 'bandpass', q: 1, slide: 8000 })

  // ---- act 4, the features (15 → 17.5): the riff an octave up, full groove
  crash(15, 0.3)
  kick(15, 1)
  const feat: [number, number, Chord][] = [
    [15, 2, D],
    [16, 1, Bb],
    [16.5, 1, C],
    [17, 1, A],
  ]
  for (const [t, beats, c] of feat) {
    groove(t, beats, c, { busy: true })
    arp(t, beats, c, { oct: 12, v: 0.08, duty: 0.25 })
  }
  line(15, [
    [86, 2], [85, 2], [86, 2], [90, 2], [93, 4], [94, 2], [93, 2],
    [91, 4], [88, 4], [89, 2], [88, 2], [85, 4],
  ], { v: 0.12, duty: 0.125 })

  // ---- act 5, the lab (17.5 → 20): a quiet arpeggio, no drums, leaning on the last chord
  arp(17.5, 2, Dm, { tri: true, v: 0.12 })
  arp(18.5, 2, G, { tri: true, v: 0.1, oct: 12 })
  arp(19.5, 1, A, { tri: true, v: 0.09, oct: 12 })
  voice(17.5, 38, 2, { v: 0.3, tri: true })
  voice(18.5, 43, 1, { v: 0.25, tri: true })
  voice(19.5, 45, 0.5, { v: 0.25, tri: true })

  // ---- act 6, the end card (20 → 22): the last chord in D major, a run up, ringing out
  kick(20, 1)
  crash(20, 0.32)
  for (const m of [50, 62, 66, 69, 74]) voice(20, m, 2, { v: m < 60 ? 0.4 : 0.07, tri: m < 60, duty: 0.25 })
  ;[62, 66, 69, 74, 78, 81, 86].forEach((m, i) => voice(20 + i * 0.06, m, 0.5, { v: 0.06, duty: 0.125, pan: 0.3 }))
  line(20.5, [[86, 4], [90, 10]], { v: 0.1, duty: 0.25 })
}
