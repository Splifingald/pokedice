import { useCallback, useEffect, useRef, useState } from 'react'
import type { CampaignOptions, CampaignResult, GameData } from '@/engine'
import type { CampaignMessage, CampaignRequest } from './campaign.worker'

interface RunnerState {
  /** 0..1 while running, null when idle. */
  progress: number | null
  results: CampaignResult[] | null
  error: string | null
  /** Wall-clock time of the last completed run. */
  ms: number | null
}

/** One campaign worker per simulator tab: start, follow progress, cancel. The worker dies with the tab. */
export function useCampaignRunner() {
  const worker = useRef<Worker | null>(null)
  const [state, setState] = useState<RunnerState>({ progress: null, results: null, error: null, ms: null })

  const stop = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
  }, [])
  useEffect(() => stop, [stop])

  const start = useCallback(
    (data: GameData, opts: CampaignOptions, runs: number) => {
      stop()
      const w = new Worker(new URL('./campaign.worker.ts', import.meta.url), { type: 'module' })
      worker.current = w
      const t0 = performance.now()
      setState((s) => ({ ...s, progress: 0, error: null }))
      w.onmessage = (e: MessageEvent<CampaignMessage>) => {
        const m = e.data
        if (m.type === 'progress') {
          setState((s) => ({ ...s, progress: m.value }))
          return
        }
        stop()
        if (m.type === 'done') setState({ progress: null, results: m.results, error: null, ms: performance.now() - t0 })
        else setState((s) => ({ ...s, progress: null, error: `The simulation stopped: ${m.message}` }))
      }
      w.onerror = (e) => {
        stop()
        setState((s) => ({ ...s, progress: null, error: `The simulation worker crashed: ${e.message || 'unknown error'}` }))
      }
      const request: CampaignRequest = { data, opts, runs }
      w.postMessage(request)
    },
    [stop],
  )

  const cancel = useCallback(() => {
    stop()
    setState((s) => ({ ...s, progress: null }))
  }, [stop])

  return { ...state, start, cancel }
}

export type CampaignRunner = ReturnType<typeof useCampaignRunner>
