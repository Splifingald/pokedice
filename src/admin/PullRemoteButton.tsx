// Dev only: replace the bundled src/data/*.json with what's saved on Supabase, refusing when Supabase looks incomplete.
import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { pushToast } from '@/store/game'
import type { RemoteCheck } from './remoteCheck'
import { checkRemoteForPull, writeLocalBundle } from './store'

export function PullRemoteButton() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<RemoteCheck | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setOpen(true)
    setBusy(true)
    setCheck(null)
    setError(null)
    try {
      setCheck(await checkRemoteForPull())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!check?.bundle) return
    setBusy(true)
    try {
      await writeLocalBundle(check.bundle)
      pushToast('Local files now match Supabase — reloading', 'good', 4000)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const blocked = !!check && check.blockers.length > 0

  return (
    <>
      <PixelButton size="sm" variant="dark" onClick={() => void start()} title="Dev only: overwrite src/data/*.json and supabase/seed.sql with Supabase">
        Pull from Supabase
      </PixelButton>
      <Modal open={open} onClose={busy ? undefined : () => setOpen(false)} dismissable={!busy} title="Pull from Supabase" className="max-w-2xl">
        <div className="flex flex-col gap-3 text-lg">
          <p>
            Overwrites <code>src/data/*.json</code> and <code>supabase/seed.sql</code> with what's saved on Supabase. Uncommitted
            local edits to those files are lost (git can still restore committed ones). Unsaved admin edits are not included.
          </p>
          {busy && !check && <p className="text-muted">Reading Supabase…</p>}
          {error && <p className="text-danger">{error}</p>}
          {check && (
            <>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-muted">
                    <th>Table</th>
                    <th className="text-right">Local</th>
                    <th className="text-right">Supabase</th>
                  </tr>
                </thead>
                <tbody>
                  {check.counts.map((c) => (
                    <tr key={c.table} className={c.remote < c.local ? 'text-danger' : undefined}>
                      <td>{c.table}</td>
                      <td className="text-right">{c.local}</td>
                      <td className="text-right">{c.remote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {blocked && (
                <div className="border-2 border-danger p-2">
                  <p className="text-danger">Refused: Supabase seems to be missing data, so pulling would lose it.</p>
                  <ul className="list-disc pl-5">
                    {check.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {check.warnings.length > 0 && (
                <div className="border-2 border-shadow p-2">
                  <p>Check these are intended:</p>
                  <ul className="list-disc pl-5">
                    {check.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <PixelButton size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </PixelButton>
            <PixelButton size="sm" variant="danger" disabled={busy || !check?.bundle} onClick={() => void confirm()}>
              Overwrite local files
            </PixelButton>
          </div>
        </div>
      </Modal>
    </>
  )
}
