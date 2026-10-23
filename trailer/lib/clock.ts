// The trailer's one clock: 60 frames a second, 120 BPM (a beat is half a second, so every act starts on a beat). The
// acts' times are docs/36's beat sheet.
export const FPS = 60
export const BEAT = 0.5

export const ACT = {
  title: [0, 4],
  journey: [4, 25],
  montage: [25, 42.5],
  features: [42.5, 48.5],
  choice: [48.5, 53],
  end: [53, 58.5],
} as const satisfies Record<string, readonly [number, number]>

export const TOTAL_FRAMES = Math.round(ACT.end[1] * FPS)

/** The frame being drawn: its time, and the time of the frame before it (for "did we just pass T?"). */
export const clock = { t: 0, prev: -1 / FPS }

/** True on the one frame that reaches time T. */
export const hit = (T: number) => clock.prev < T && clock.t >= T
