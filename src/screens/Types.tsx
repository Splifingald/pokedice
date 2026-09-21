// The type chart on its own: the matchup lookup, plus the full grid behind a disclosure. Split out of
// the guide so the trainer menu can open it in one click, mid-run.
import { useState } from 'react'
import { POKE_TYPES, typeMultiplier, type PokeType } from '@/engine'
import { useT } from '@/i18n/react'
import { Toggle } from '@/components/Toggle'
import { TypeBadge } from '@/components/TypeBadge'
import { dieAbbr, typeName } from '@/lib/format'
import { setSettings, useGame } from '@/store/game'
import { badgeColors, cx, typeColor } from '@/theme/util'

/** `words` is a sheet key: the cell's meaning, read out in the player's language. */
const CELL: Record<string, { label: string; cls: string; words: string }> = {
  '2': { label: '2', cls: 'bg-hp-green text-ink', words: 'ui.help.superEffective' },
  '0.5': { label: '½', cls: 'bg-[#e8905a] text-ink', words: 'ui.help.notVeryEffective' },
  '0': { label: '0', cls: 'bg-ink text-panel', words: 'ui.help.noEffect' },
  '1': { label: '', cls: '', words: 'ui.help.normalEffect' },
}

function TypeHeader({ type }: { type: PokeType }) {
  const { bg, fg } = badgeColors(typeColor(type))
  return (
    <span
      className="flex h-6 w-8 items-center justify-center border border-ink font-mono text-xs font-bold"
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
    <div className="pixel-scroll overflow-x-auto" role="region" aria-label={t('ui.help.chartLabel')} tabIndex={0}>
      <table className="border-collapse">
        <caption className="pb-1 text-left text-lg text-muted">{t('ui.help.chartCaption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-panel p-0.5 text-left text-sm font-normal">
              {t('ui.help.atkDef')}
            </th>
            {POKE_TYPES.map((d) => (
              <th key={d} scope="col" className="p-0.5">
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
                      className={cx('flex h-6 w-8 items-center justify-center border border-shadow/40 font-mono text-sm', cell.cls)}
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
      <div className="mt-1 flex flex-wrap gap-3 text-lg">
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-ink bg-hp-green" /> ×2
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-ink bg-[#e8905a]" /> ×½
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-ink bg-ink" /> ×0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-shadow/40" /> ×1
        </span>
      </div>
    </div>
  )
}

/** Mobile-friendly lookup: pick a type, read its matchups as lists. */
export function TypeLookup() {
  const { t } = useT()
  const chart = useGame((s) => s.data.typeChart)
  const [type, setType] = useState<PokeType>('fire')
  const by = (pred: (m: number) => boolean, atk: boolean) =>
    POKE_TYPES.filter((o) => pred(atk ? typeMultiplier(chart, type, [o]) : typeMultiplier(chart, o, [type])))
  const name = typeName(type)
  const rows: [string, PokeType[]][] = [
    [t('ui.help.hitHard', { type: name }), by((m) => m === 2, true)],
    [t('ui.help.weakOn', { type: name }), by((m) => m === 0.5, true)],
    [t('ui.help.nothingTo', { type: name }), by((m) => m === 0, true)],
    [t('ui.help.takeDouble', { type: name }), by((m) => m === 2, false)],
    [t('ui.help.resist', { type: name }), by((m) => m < 1, false)],
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('ui.help.pickType')}>
        {POKE_TYPES.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setType(x)}
            aria-pressed={x === type}
            className={cx('rounded-[2px]', x === type && 'outline outline-[3px] outline-offset-1 outline-gold')}
          >
            <TypeBadge type={x} size="sm" />
          </button>
        ))}
      </div>
      <dl className="grid gap-1 text-lg sm:grid-cols-[auto_1fr] sm:gap-x-3">
        {rows.map(([label, list]) => (
          <div key={label} className="contents">
            <dt className="text-muted first-letter:uppercase">{label}</dt>
            <dd className="flex flex-wrap gap-1">
              {list.length ? list.map((x) => <TypeBadge key={x} type={x} size="sm" />) : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Everything the type chart has to say — what the trainer menu opens. */
export function TypesContent() {
  const { t } = useT()
  const hints = useGame((s) => s.settings.typeHints) ?? false
  return (
    <div className="flex flex-col gap-3">
      <div className="pixel-panel px-3 py-1.5">
        <Toggle
          label={t('ui.types.toggle')}
          hint={t('ui.types.toggleHint')}
          on={hints}
          onChange={(v) => setSettings({ typeHints: v })}
        />
      </div>
      <p className="copy text-lg text-muted">{t('ui.help.typesIntro')}</p>
      <TypeLookup />
      <details>
        <summary className="flex min-h-[44px] cursor-pointer items-center text-xl">{t('ui.help.showFullChart')}</summary>
        <TypeChart />
      </details>
    </div>
  )
}
