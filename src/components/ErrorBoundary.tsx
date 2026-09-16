import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SAVE_KEY } from '@/save/storage'
import { useGame } from '@/store/game'

interface State {
  error: Error | null
  copied: 'idle' | 'ok' | 'failed'
}

function saveText(): string {
  try {
    return localStorage.getItem(SAVE_KEY) ?? JSON.stringify(useGame.getState().save)
  } catch {
    return JSON.stringify(useGame.getState().save)
  }
}

/** Last line of defence, with a "copy save to clipboard" escape hatch. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: 'idle' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[pokedice] crash', error, info.componentStack)
  }

  render() {
    const { error, copied } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="pixel-panel flex max-w-lg flex-col gap-3 p-5">
          <h1 className="text-4xl">Something broke.</h1>
          <p className="text-xl">Your progress is stored in this browser. Copy it somewhere safe before trying anything else.</p>
          <pre className="max-h-24 overflow-auto border-2 border-ink bg-ink p-2 font-mono text-xs text-panel">{String(error.message || error)}</pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="pixel-btn bg-gold px-3 py-1 text-xl"
              onClick={() =>
                navigator.clipboard
                  .writeText(saveText())
                  .then(() => this.setState({ copied: 'ok' }))
                  .catch(() => this.setState({ copied: 'failed' }))
              }
            >
              Copy save to clipboard
            </button>
            <button type="button" className="pixel-btn bg-panel px-3 py-1 text-xl" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="pixel-btn bg-panel px-3 py-1 text-xl" onClick={() => (window.location.href = '/')}>
              Title screen
            </button>
          </div>
          {copied === 'ok' && <p className="text-lg text-good">Save copied.</p>}
          {copied === 'failed' && <textarea readOnly className="h-24 w-full border-2 border-ink font-mono text-xs" value={saveText()} />}
        </div>
      </div>
    )
  }
}
