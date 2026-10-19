// The promo trailer's edit (scripts/record-promo.ts): hard cuts between windows of the takes' frames, the game's own
// sounds cut on the same frames (its effects as it played them, its cries laid in where it started them), encoded for
// Reddit: H.264, yuv420p, CRF 18, faststart, AAC audio.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { CryNote } from './capture'

export interface TakeLike {
  frames: string[]
  wav: string | null
  cries: CryNote[]
}

/** A window of one take: frames [from, to). */
export interface Cut {
  take: TakeLike
  from: number
  to: number
  /** Left out of the GIF (it must stay under 10 MB). */
  noGif?: boolean
  /** The part of its frames that fills the picture, device pixels (scaled nearest-neighbour to the edit's size). */
  crop?: { x: number; y: number; w: number; h: number }
}

const CRIES = resolve('scripts/.cache/cries')

function ffmpeg(args: string[]) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.slice(-1)[0]}`)
}

/** A cry's MP3, downloaded once (curl: it goes through the machine's proxy, Node's fetch wouldn't). */
function cryFile(url: string): string | null {
  mkdirSync(CRIES, { recursive: true })
  const file = join(CRIES, basename(new URL(url).pathname))
  if (existsSync(file)) return file
  const r = spawnSync('curl', ['-sSfL', '-o', file, url])
  return r.status === 0 ? file : null
}

/** A take's whole soundtrack: its effects, and each cry at the time it started (at its volume). */
function takeSound(take: TakeLike, dir: string, seconds: number): string {
  const out = join(dir, `mix-${basename(dirname(take.frames[0] ?? 'x/x'))}.wav`)
  const inputs: string[] = []
  const parts: string[] = []
  if (take.wav) inputs.push('-i', take.wav)
  else inputs.push('-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo')
  parts.push('[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a0]')
  const mix = ['[a0]']
  take.cries.forEach((c) => {
    const file = cryFile(c.url)
    if (!file) return
    const i = inputs.length / 2
    inputs.push('-i', file)
    const ms = Math.max(0, Math.round(c.at * 1000))
    parts.push(
      `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${c.volume.toFixed(2)},adelay=${ms}|${ms}[c${i}]`,
    )
    mix.push(`[c${i}]`)
  })
  parts.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first[out]`)
  ffmpeg([...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-t', String(seconds), out])
  return out
}

/**
 * Cuts that frame part of their takes: each one its own clip first (cropped, then scaled nearest-neighbour to `size`,
 * lossless), the clips then joined like frames. Returns that concat list.
 */
function croppedClips(cuts: Cut[], fps: number, size: [number, number], work: string): string {
  const files = cuts.map((c, k) => {
    const file = join(work, `clip-${String(k).padStart(2, '0')}.mkv`)
    const dir = dirname(c.take.frames[0]!)
    const from = Math.max(0, c.from)
    const crop = c.crop ? `crop=${c.crop.w}:${c.crop.h}:${c.crop.x}:${c.crop.y},` : ''
    ffmpeg([
      '-framerate',
      String(fps),
      '-start_number',
      String(from),
      '-i',
      join(dir, '%05d.png'),
      '-frames:v',
      String(c.to - from),
      '-vf',
      `${crop}scale=${size[0]}:${size[1]}:flags=neighbor`,
      '-c:v',
      'libx264rgb',
      '-qp',
      '0',
      '-preset',
      'ultrafast',
      file,
    ])
    return file
  })
  const list = join(work, 'clips.txt')
  writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'))
  return list
}

/** `size`: the picture's size when cuts crop their takes (each one scaled to it). */
export async function edit(cuts: Cut[], fps: number, out: string, work: string, size?: [number, number]) {
  // The picture: every cut's frames, one after the other.
  let list = join(work, 'frames.txt')
  if (size) list = croppedClips(cuts, fps, size, work)
  else
    writeFileSync(
      list,
      cuts
        .flatMap((c) => c.take.frames.slice(Math.max(0, c.from), c.to))
        .map((f) => `file '${f}'\nduration ${1 / fps}`)
        .join('\n'),
    )
  // The sound: each take's soundtrack, cut on the same frames (8 ms fades so no cut clicks), joined.
  const sounds = new Map<TakeLike, string>()
  for (const c of cuts)
    if (!sounds.has(c.take)) sounds.set(c.take, takeSound(c.take, work, c.take.frames.length / fps + 1))
  const inputs = [...new Set(sounds.values())]
  const parts = cuts.map((c, k) => {
    const i = inputs.indexOf(sounds.get(c.take)!)
    const a = Math.max(0, c.from) / fps
    const b = c.to / fps
    return `[${i}:a]atrim=${a.toFixed(4)}:${b.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=${(b - a - 0.008).toFixed(4)}:d=0.008[s${k}]`
  })
  const audio = join(work, 'sound.wav')
  ffmpeg([
    ...inputs.flatMap((f) => ['-i', f]),
    '-filter_complex',
    `${parts.join(';')};${cuts.map((_, k) => `[s${k}]`).join('')}concat=n=${cuts.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]`,
    '-map',
    '[out]',
    '-ar',
    '48000',
    audio,
  ])
  ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-r',
    String(fps),
    '-i',
    list,
    '-i',
    audio,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    // No resize happens (the frames are captured at the final size); any conversion stays nearest-neighbour.
    '-sws_flags',
    'neighbor',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    out,
  ])
}

/**
 * The trailer as a GIF under 10 MB: the cuts not marked `noGif`, from the encoded trailer, at half size (every pixel of
 * the art an even block: nearest-neighbour, a 2:1 step), 20 frames a second (GIF delays are hundredths), one palette.
 */
export function gifOf(trailer: string, cuts: Cut[], fps: number, out: string) {
  let at = 0
  const keep: [number, number][] = []
  for (const c of cuts) {
    const len = (c.to - Math.max(0, c.from)) / fps
    if (!c.noGif) keep.push([at, at + len])
    at += len
  }
  const trims = keep.map(
    ([a, b], i) => `[0:v]trim=${a.toFixed(4)}:${b.toFixed(4)},setpts=PTS-STARTPTS[g${i}]`,
  )
  const join = `${keep.map((_, i) => `[g${i}]`).join('')}concat=n=${keep.length}:v=1:a=0`
  ffmpeg([
    '-i',
    trailer,
    '-filter_complex',
    `${trims.join(';')};${join},fps=20,scale=iw/2:ih/2:flags=neighbor,split[x][y];` +
      `[x]palettegen=max_colors=192:stats_mode=diff[p];[y][p]paletteuse=dither=none:diff_mode=rectangle`,
    '-loop',
    '0',
    out,
  ])
}
