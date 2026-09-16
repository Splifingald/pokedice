// Runs whole-campaign simulations off the main thread, so the admin stays responsive and a run can be cancelled.
import { runCampaign, type CampaignOptions, type CampaignResult, type GameData } from '@/engine'

export interface CampaignRequest {
  data: GameData
  opts: CampaignOptions
  /** Runs with seeds opts.seed, opts.seed + 1, … */
  runs: number
}

export type CampaignMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; results: CampaignResult[] }
  | { type: 'error'; message: string }

const post = (m: CampaignMessage) => self.postMessage(m)

self.onmessage = (e: MessageEvent<CampaignRequest>) => {
  const { data, opts, runs } = e.data
  try {
    const results: CampaignResult[] = []
    let last = -1
    for (let r = 0; r < runs; r++) {
      const gen = runCampaign(data, { ...opts, seed: opts.seed + r })
      let step = gen.next()
      while (!step.done) {
        const value = (r + step.value) / runs
        if (value - last >= 0.005) {
          post({ type: 'progress', value })
          last = value
        }
        step = gen.next()
      }
      results.push(step.value)
    }
    post({ type: 'done', results })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
