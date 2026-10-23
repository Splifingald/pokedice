// The trailer's one clock: 60 frames a second, 120 BPM (a beat is half a second, so every cut lands on a beat or a
// half-beat). The acts' times are docs/36's beat sheet.
export const FPS = 60
export const BEAT = 0.5

export const ACT = {
  title: [0, 2.5],
  journey: [2.5, 10],
  montage: [10, 15],
  features: [15, 17.5],
  choice: [17.5, 20],
  end: [20, 22],
} as const satisfies Record<string, readonly [number, number]>

export const TOTAL_FRAMES = Math.round(ACT.end[1] * FPS)

/** The frame being drawn: its time, and the time of the frame before it (for "did we just pass T?"). */
export const clock = { t: 0, prev: -1 / FPS }

/** True on the one frame that reaches time T. */
export const hit = (T: number) => clock.prev < T && clock.t >= T
