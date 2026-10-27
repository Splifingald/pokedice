// The type chart on its own (docs/43 §5.10): two views of one thing — pick a type and read what it beats and what
// beats it, or the full grid, readable at 16 px and scrolling inside its own box (never the page sideways). Split out
// of the guide so the trainer menu can open it in one click, mid-run.
import { useState } from 'react'
import { POKE_TYPES, typeMultiplier, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { PixelIcon } from '@/components/icons'
import { Seg } from '@/components/Segmented'
import { Toggle } from '@/components/Toggle'
import { TypeBadge } from '@/components/TypeBadge'
import { dieAbbr, typeName } from '@/lib/format'
import { setSettings, useGame } from '@/store/game'
import { useTypeHints } from '@/store/hooks'
import { badgeColors, cx, typeColor } from '@/theme/util'

/** `words` is a sheet key: the cell's meaning, read out in the player's language. */
const CELL: Record<string, { label: string; cls: string; words: string }> = {
  '2': { label: '2', cls: 'bg-hp-green text-night', words: 'ui.help.superEffective' },
  '0.5': { label: '½', cls: 'light-scope bg-[#e8905a] text-ink', words: 'ui.help.notVeryEffective' },
  '0': { label: '0', cls: 'bg-ink text-panel', words: 'ui.help.noEffect' },
  '1': { label: '', cls: '', words: 'ui.help.normalEffect' },
}

function TypeHeader({ type }: { type: PokeType }) {
  const { bg, fg } = badgeColors(typeColor(type))
  return (
    <span
      className="flex h-9 w-11 items-center justify-center border border-edge text-[16px] leading-none"
      style={{ background: bg, color: fg }}
      title={typeName(type)}
    >
      <span aria-hidden="true">{dieAbbr(type)}</span>
      <span className="sr-only">{typeName(type)}</span>
    </span>
  )
}

export function TypeChart() {
  const { t } = useT()
  const chart = useGame((s) => s.data.typeChart)
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[18px] text-muted">{t('ui.help.chartCaption')}</p>
      {/* Its own box scrolls both ways, the attacking column and the defending row pinned. */}
      <div
        className="pixel-scroll max-h-[min(60dvh,560px)] overflow-auto shadow-ring-line"
        role="region"
        aria-label={t('ui.help.chartLabel')}
        tabIndex={0}
      >
      <table className="border-collapse">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-[2] bg-panel p-0.5 text-left text-[16px] font-normal leading-none">
              {t('ui.help.atkDef')}
            </th>
            {POKE_TYPES.map((d) => (
              <th key={d} scope="col" className="sticky top-0 z-[1] bg-panel p-0.5">
                <TypeHeader type={d} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {POKE_TYPES.map((a) => (
            <tr key={a}>
              <th scope="row" className="sticky left-0 bg-panel p-0.5">
                <TypeHeader type={a} />
              </th>
              {POKE_TYPES.map((d) => {
                const m = typeMultiplier(chart, a, [d])
                const cell = CELL[String(m)] ?? CELL['1']!
                return (
                  <td key={d} className="p-0.5">
                    <span
                      className={cx('flex h-9 w-11 items-center justify-center border border-shadow/40 text-[18px]', cell.cls)}
                      title={t('ui.help.cellTitle', { attacker: typeName(a), defender: typeName(d), words: t(cell.words) })}
                    >
                      <span aria-hidden="true">{cell.label}</span>
                      <span className="sr-only">
                        {t('ui.help.cellSr', { attacker: typeName(a), defender: typeName(d), words: t(cell.words) })}
                      </span>
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="flex flex-wrap gap-3 text-[18px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-edge bg-hp-green" /> ×2
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-edge bg-[#e8905a]" /> ×½
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-edge bg-ink" /> ×0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-shadow/40" /> ×1
        </span>
      </div>
    </div>
  )
}

/** Pick a type (big buttons, 44 px), read its matchups: what its dice do, and what it takes. */
export function TypeLookup() {
  const { t } = useT()
  const chart = useGame((s) => s.data.typeChart)
  const [type, setType] = useState<PokeType>('fire')
  const by = (pred: (m: number) => boolean, atk: boolean) =>
    POKE_TYPES.filter((o) => pred(atk ? typeMultiplier(chart, type, [o]) : typeMultiplier(chart, o, [type])))
  const name = typeName(type)
  const attack: [string, PokeType[]][] = [
    [t('ui.help.hitHard', { type: name }), by((m) => m === 2, true)],
    [t('ui.help.weakOn', { type: name }), by((m) => m === 0.5, true)],
    [t('ui.help.nothingTo', { type: name }), by((m) => m === 0, true)],
  ]
  const defence: [string, PokeType[]][] = [
    [t('ui.help.takeDouble', { type: name }), by((m) => m === 2, false)],
    [t('ui.help.resist', { type: name }), by((m) => m < 1, false)],
  ]
  const block = (icon: 'sword' | 'shield', rows: [string, PokeType[]][]) => (
    <dl className="m-0 flex flex-col gap-2 bg-paper p-2.5 shadow-card">
      {rows.map(([label, list]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="flex items-center gap-1.5 text-[18px] leading-tight first-letter:uppercase">
            <PixelIcon name={icon} size={16} />
            {label}
          </dt>
          <dd className="m-0 flex flex-wrap gap-1">
            {list.length ? list.map((x) => <TypeBadge key={x} type={x} />) : <span className="text-[18px]">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5 min-[400px]:grid-cols-4 sm:grid-cols-6" role="group" aria-label={t('ui.help.pickType')}>
        {POKE_TYPES.map((x) => {
          const { bg, fg } = badgeColors(typeColor(x))
          const on = x === type
          return (
            <button
              key={x}
              type="button"
              onClick={() => setType(x)}
              aria-pressed={on}
              className={cx(
                'light-scope flex min-h-[44px] items-center justify-center gap-1 px-1 text-[17px] uppercase leading-none tracking-[0.04em]',
                on ? 'shadow-[inset_0_0_0_3px_#24304f] outline outline-[3px] outline-offset-0 outline-gold' : 'shadow-[inset_0_0_0_2px_rgba(36,48,79,0.35)]',
              )}
              style={{ background: bg, color: fg }}
            >
              {on && <PixelIcon name="check" size={12} />}
              {typeName(x)}
            </button>
          )
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {block('sword', attack)}
        {block('shield', defence)}
      </div>
    </div>
  )
}

/** Everything the type chart has to say — what the trainer menu opens. Its hints switch is Settings' one too. */
export function TypesContent() {
  const { t } = useT()
  const hints = useTypeHints()
  const [view, setView] = useState<'pick' | 'chart'>('pick')
  return (
    <div className="flex flex-col gap-3">
      <Seg
        tabs
        idPrefix="types"
        label={t('ui.help.navTypes')}
        value={view}
        onChange={setView}
        options={[
          { id: 'pick', label: t('ui.help.pickType') },
          { id: 'chart', label: t('ui.help.navTypes') },
        ]}
      />
      <div role="tabpanel" id={`types-${view}-panel`} aria-labelledby={`types-${view}`}>
        {view === 'pick' ? <TypeLookup /> : <TypeChart />}
      </div>
      {/* The hints' switch (Settings' too), after what the player came for. */}
      <div className="bg-paper px-3 py-1.5 shadow-ring-line">
        <Toggle
          label={t('ui.types.toggle')}
          hint={t('ui.types.toggleHint')}
          on={hints}
          onChange={(v) => setSettings({ typeHints: v })}
        />
      </div>
    </div>
  )
}
