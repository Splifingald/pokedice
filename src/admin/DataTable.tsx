// Shared admin table: sticky header, sort, filter, pagination, inline editing with per-cell dirty highlight,
// Zod errors in the cell, duplicate / delete / bulk edit, CSV import + export.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from 'react'
import type { Row, TableName } from '@/config/mapping'
import { PixelButton } from '@/components/PixelButton'
import { pushToast } from '@/store/game'
import { cx } from '@/theme/util'
import { downloadText, parseCsv, toCsv } from './csv'
import { addRows, removeRows, rowErrors, rowKey, updateRow, upsertRows, useAdmin, useTableDiff } from './store'
import { inputCls } from './widgets'

export interface ColumnDef {
  key: string
  label: string
  kind?: 'text' | 'number' | 'bool' | 'json' | 'enum' | 'color'
  options?: readonly string[]
  nullable?: boolean
  width?: number
  readOnly?: boolean
  render?: (row: Row) => ReactNode
  /** Custom editor; call `set` to commit (it also closes the editor). */
  editor?: (value: unknown, set: (v: unknown) => void, row: Row) => ReactNode
}

export interface DataTableProps {
  table: TableName
  columns: ColumnDef[]
  where?: (r: Row) => boolean
  newRow?: () => Row
  duplicate?: (r: Row) => Row
  onOpen?: (r: Row) => void
  pageSize?: number
  title?: ReactNode
  toolbar?: ReactNode
}

function display(v: unknown, kind?: ColumnDef['kind']): ReactNode {
  if (v === null || v === undefined) return <span className="text-muted">—</span>
  if (kind === 'color' && typeof v === 'string')
    return (
      <span className="flex items-center gap-1">
        <span className="inline-block h-4 w-4 border-2 border-ink" style={{ background: v }} /> {v}
      </span>
    )
  if (typeof v === 'object') return <span className="font-mono text-xs">{JSON.stringify(v).slice(0, 80)}</span>
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  return String(v)
}

function parseInput(raw: string, col: ColumnDef): unknown {
  if (col.kind === 'number') {
    if (raw.trim() === '') return col.nullable ? null : 0
    return Number(raw)
  }
  if (col.kind === 'json') {
    if (raw.trim() === '' && col.nullable) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw // left as a string → shows as a validation error
    }
  }
  if (col.nullable && raw === '') return null
  return raw
}

/**
 * Inline editor for one cell. It stays open while you are editing — it only closes on Enter,
 * on Escape (discarding), or when you click / tab somewhere outside the editor, which commits
 * whatever is in the field at that moment. A field left empty commits 0 (or null when nullable).
 */
function CellEditor({ col, row, onCommit, onCancel }: { col: ColumnDef; row: Row; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const v = row[col.key]
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)
  const done = useRef(false)

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const el = field.current
    if (commit && el && !(el instanceof HTMLSelectElement)) onCommit(parseInput(el.value, col))
    else onCancel()
  }

  // Leaving the editor — by click or by Tab — ends the edit; anything inside it (a picker's
  // dropdown, the number spinner, a second field) keeps it open.
  useEffect(() => {
    const outside = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) finish(true)
    }
    const leaving = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next && !box.current?.contains(next)) finish(true)
    }
    document.addEventListener('mousedown', outside)
    box.current?.addEventListener('focusout', leaving)
    const el = box.current
    return () => {
      document.removeEventListener('mousedown', outside)
      el?.removeEventListener('focusout', leaving)
    }
  })

  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      finish(false)
    }
    if (e.key === 'Enter' && col.kind !== 'json') {
      e.preventDefault()
      finish(true)
    }
  }

  return (
    <div ref={box} onKeyDown={keys} onClick={(e) => e.stopPropagation()}>
      {col.editor ? (
        col.editor(v, (nv) => {
          if (done.current) return
          done.current = true
          onCommit(nv)
        }, row)
      ) : col.kind === 'enum' ? (
        <select
          autoFocus
          ref={field as Ref<HTMLSelectElement>}
          className={inputCls}
          defaultValue={v == null ? '' : String(v)}
          onChange={(e) => {
            if (done.current) return
            done.current = true
            onCommit(parseInput(e.target.value, col))
          }}
        >
          {col.nullable && <option value="">—</option>}
          {(col.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : col.kind === 'json' ? (
        <textarea autoFocus ref={field as Ref<HTMLTextAreaElement>} className={cx(inputCls, 'h-28 font-mono text-xs')} defaultValue={v == null ? '' : JSON.stringify(v, null, 1)} />
      ) : (
        <input
          autoFocus
          ref={field as Ref<HTMLInputElement>}
          type={col.kind === 'number' ? 'number' : col.kind === 'color' ? 'color' : 'text'}
          step="any"
          className={inputCls}
          defaultValue={v == null ? '' : String(v)}
        />
      )}
    </div>
  )
}

export function DataTable({ table, columns, where, newRow, duplicate, onOpen, pageSize = 25, title, toolbar }: DataTableProps) {
  const all = useAdmin((s) => s.rows[table])
  const diff = useTableDiff(table)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [bulk, setBulk] = useState<{ col: string; value: string }>({ col: columns.find((c) => !c.readOnly)?.key ?? '', value: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const errors = useMemo(() => rowErrors(table, diff.upserts), [table, diff])

  const rows = useMemo(() => {
    let list = where ? all.filter(where) : all
    const needle = q.trim().toLowerCase()
    if (needle) list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(needle))
    if (sort) {
      list = [...list].sort((a, b) => {
        const x = a[sort.key]
        const y = b[sort.key]
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
        return String(typeof x === 'object' ? JSON.stringify(x) : (x ?? '')).localeCompare(String(typeof y === 'object' ? JSON.stringify(y) : (y ?? ''))) * sort.dir
      })
    }
    return list
  }, [all, where, q, sort])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const visible = rows.slice(cur * pageSize, cur * pageSize + pageSize)
  const colKeys = columns.map((c) => c.key)

  const exportCsv = () => {
    const keys = [...new Set([...Object.keys(rows[0] ?? {}), ...colKeys])].filter((k) => rows.some((r) => k in r))
    downloadText(`${table}.csv`, toCsv(rows, keys), 'text/csv')
  }
  const importCsv = async (file: File) => {
    try {
      const parsed = parseCsv(await file.text())
      if (!parsed.length) return pushToast('CSV is empty', 'bad')
      upsertRows(table, parsed)
      pushToast(`${parsed.length} row(s) merged from CSV — review, then Save`, 'good')
    } catch (err) {
      pushToast(`CSV import failed: ${String(err)}`, 'bad')
    }
  }
  const applyBulk = () => {
    const col = columns.find((c) => c.key === bulk.col)
    if (!col || !selected.size) return
    const value = col.kind === 'bool' ? bulk.value === 'true' : parseInput(bulk.value, col)
    for (const k of selected) updateRow(table, k, { [col.key]: value })
    pushToast(`Set ${col.label} on ${selected.size} row(s)`, 'good')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {title && <div className="mr-2 text-2xl">{title}</div>}
        <input className={cx(inputCls, 'max-w-[220px]')} placeholder="Filter…" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
        {newRow && (
          <PixelButton size="sm" variant="primary" onClick={() => addRows(table, [newRow()])}>
            + Add
          </PixelButton>
        )}
        <PixelButton size="sm" onClick={exportCsv}>
          CSV ↓
        </PixelButton>
        <PixelButton size="sm" onClick={() => fileRef.current?.click()}>
          CSV ↑
        </PixelButton>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])} />
        {toolbar}
        <span className="ml-auto text-base text-muted">
          {rows.length} rows{diff.upserts.length + diff.deletes.length ? ` · ${diff.upserts.length} changed, ${diff.deletes.length} deleted` : ''}
        </span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-2 border-ink bg-gold/30 p-2">
          <span className="text-lg">Bulk edit {selected.size} row(s):</span>
          <select className={cx(inputCls, 'w-auto')} value={bulk.col} onChange={(e) => setBulk((b) => ({ ...b, col: e.target.value }))}>
            {columns
              .filter((c) => !c.readOnly && !c.editor)
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
          </select>
          <input className={cx(inputCls, 'w-40')} value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))} placeholder="value" />
          <PixelButton size="sm" variant="primary" onClick={applyBulk}>
            Apply
          </PixelButton>
          <PixelButton size="sm" variant="danger" onClick={() => (removeRows(table, [...selected]), setSelected(new Set()))}>
            Delete selected
          </PixelButton>
          <PixelButton size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </PixelButton>
        </div>
      )}

      <div className="pixel-scroll max-h-[65vh] overflow-auto border-[3px] border-ink bg-panel">
        <table className="w-full border-collapse text-base">
          <thead className="sticky top-0 z-10 bg-ink text-panel">
            <tr>
              <th className="w-8 px-1">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={visible.length > 0 && visible.every((r) => selected.has(rowKey(table, r)))}
                  onChange={(e) => {
                    const next = new Set(selected)
                    for (const r of visible) {
                      if (e.target.checked) next.add(rowKey(table, r))
                      else next.delete(rowKey(table, r))
                    }
                    setSelected(next)
                  }}
                />
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="cursor-pointer select-none whitespace-nowrap px-2 py-1 text-left font-normal"
                  style={{ width: c.width }}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}
                >
                  {c.label || <span className="sr-only">{c.key}</span>}
                  {sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="px-2 text-right font-normal">
                <span className="sr-only">Actions</span>
                <span aria-hidden="true">·</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const k = rowKey(table, r)
              const isNew = diff.added.has(k)
              const changed = diff.changed.get(k)
              const errs = errors.get(k)
              return (
                <tr key={k} className={cx('border-b border-shadow/40', isNew && 'bg-hp-green/15')}>
                  <td className="px-1 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selected.has(k)}
                      onChange={() => {
                        const next = new Set(selected)
                        if (next.has(k)) next.delete(k)
                        else next.add(k)
                        setSelected(next)
                      }}
                    />
                  </td>
                  {columns.map((c) => {
                    const cellKey = `${k}::${c.key}`
                    const dirty = isNew || changed?.has(c.key)
                    const err = errs?.[c.key] ?? (c === columns[0] ? errs?.['*'] : undefined)
                    const isEditing = editing === cellKey
                    return (
                      <td
                        key={c.key}
                        className={cx(
                          'max-w-[320px] px-2 py-1 align-top',
                          dirty && 'bg-gold/40',
                          err && 'outline outline-2 -outline-offset-2 outline-danger',
                          !c.readOnly && c.kind !== 'bool' && !isEditing && 'cursor-text hover:bg-white',
                        )}
                        title={err}
                        onClick={() => !c.readOnly && c.kind !== 'bool' && !isEditing && setEditing(cellKey)}
                      >
                        {c.kind === 'bool' && !c.readOnly ? (
                          <input type="checkbox" checked={!!r[c.key]} onChange={(e) => updateRow(table, k, { [c.key]: e.target.checked })} />
                        ) : isEditing ? (
                          <CellEditor
                            col={c}
                            row={r}
                            onCancel={() => setEditing(null)}
                            onCommit={(v) => {
                              updateRow(table, k, { [c.key]: v })
                              setEditing(null)
                            }}
                          />
                        ) : (
                          <div className="truncate">{c.render ? c.render(r) : display(r[c.key], c.kind)}</div>
                        )}
                        {err && <div className="text-xs leading-tight text-danger">{err}</div>}
                      </td>
                    )
                  })}
                  <td className="whitespace-nowrap px-1 text-right">
                    {onOpen && (
                      <button type="button" className="px-1 text-lg" title="Open editor" onClick={() => onOpen(r)}>
                        ✎
                      </button>
                    )}
                    {duplicate && (
                      <button type="button" className="px-1 text-lg" title="Duplicate" onClick={() => addRows(table, [duplicate(r)])}>
                        ⎘
                      </button>
                    )}
                    {confirmDel === k ? (
                      <button type="button" className="px-1 text-lg text-danger" onClick={() => (removeRows(table, [k]), setConfirmDel(null))}>
                        sure?
                      </button>
                    ) : (
                      <button type="button" className="px-1 text-lg" title="Delete" onClick={() => setConfirmDel(k)}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="p-3 text-center text-muted">
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <PixelButton size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            ◀
          </PixelButton>
          <span className="text-lg">
            {cur + 1} / {pages}
          </span>
          <PixelButton size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
            ▶
          </PixelButton>
        </div>
      )}
    </div>
  )
}
