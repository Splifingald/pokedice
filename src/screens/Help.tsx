// The rules in plain words, plus the type chart. Numbers come from the live game data.
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { COMBO_KEYS, comboBonus, POKE_TYPES, typeMultiplier, type PokeType } from '@/engine'
import { multiExpText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { DieFaces } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { TypeBadge } from '@/components/TypeBadge'
import { comboExampleText, comboName, dieAbbr, statusEffects, typeName } from '@/lib/format'
import { useGame } from '@/store/game'
import { badgeColors, cx, typeColor } from '@/theme/util'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-2">
      <h2 id={`${id}-h`} className="border-b-[3px] border-ink text-3xl leading-tight">
        {title}
      </h2>
      <div className="copy flex flex-col gap-2">{children}</div>
    </section>
  )
}

function StatusTable() {
  const { t } = useT()
  const r = useGame((s) => s.data.config.status)
  const rows = statusEffects(r)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-lg">
        <thead>
          <tr className="bg-ink text-panel">
            <th scope="col" className="px-2 py-1 text-left font-normal">{t('ui.help.statusCol')}</th>
            <th scope="col" className="px-2 py-1 text-left font-normal">{t('ui.help.triggersCol')}</th>
            <th scope="col" className="px-2 py-1 text-left font-normal">{t('ui.help.effectCol')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.name} className="border-b-2 border-shadow/40 align-top">
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                <span className="flex items-center gap-1">
                  <PixelIcon name={x.icon} size={16} /> {x.name}
                </span>
                <TypeBadge type={x.die} size="sm" />
              </th>
              <td className="px-2 py-1">{t('ui.help.inOneRoll', { when: x.when })}</td>
              <td className="px-2 py-1">{x.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-lg text-muted">{t('ui.help.statusNote')}</p>
    </div>
  )
}

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
function TypeLookup() {
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
            <dd className="flex flex-wrap gap-1">{list.length ? list.map((x) => <TypeBadge key={x} type={x} size="sm" />) : '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function HelpContent() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = data.config
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t('ui.help.sections')} className="flex flex-wrap gap-2 text-lg">
        {[
          ['goal', 'ui.help.navGoal'],
          ['explore', 'ui.help.navExplore'],
          ['battle', 'ui.help.navBattle'],
          ['damage', 'ui.help.navDamage'],
          ['combos', 'ui.help.navCombos'],
          ['status', 'ui.help.navStatus'],
          ['types', 'ui.help.navTypes'],
          ['grow', 'ui.help.navGrow'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="pixel-btn flex min-h-[44px] items-center bg-panel px-2 md:min-h-[32px]">
            {t(label!)}
          </a>
        ))}
      </nav>

      <Section id="goal" title={t('ui.help.navGoal')}>
        <p>{t('ui.help.goalBody')}</p>
      </Section>

      <Section id="explore" title={t('ui.help.navExplore')}>
        <ul className="ml-5 list-disc">
          <li>{t('ui.help.explore1')}</li>
          <li>{t('ui.help.explore2')}</li>
          <li>{t('ui.help.explore3')}</li>
          <li>{t('ui.help.explore4')}</li>
          <li>{t('ui.help.explore5')}</li>
          <li>{t('ui.help.explore6')}</li>
          <li>{t('ui.help.explore7')}</li>
          {cfg.encounterMode === 'deck' && <li>{t('ui.help.explore8')}</li>}
          <li>{t('ui.help.explore9')}</li>
          <li>{t('ui.help.explore10')}</li>
        </ul>
      </Section>

      <Section id="battle" title={t('ui.help.navBattle')}>
        <ol className="ml-5 list-decimal">
          <li>{t('ui.help.battle1')}</li>
          <li>{t('ui.help.battle2')}</li>
          <li>{t('ui.help.battle3')}</li>
        </ol>
        <p>
          {t('ui.help.battleBody')}{' '}
          {t('ui.help.keyboard', { k1: '1', k6: '6', r: 'R', space: 'Space' })}
        </p>
      </Section>

      <Section id="damage" title={t('ui.help.navDamage')}>
        <p>{t('ui.help.damageBody')}</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="w-16 text-lg">{t('ui.help.baseLabel')}</span>
            <DieFaces type="base" faces={data.diceTypes.base?.faces ?? []} size={28} />
          </div>
          <p className="copy text-muted">{t('ui.help.baseBody')}</p>
        </div>
      </Section>

      <Section id="combos" title={t('ui.help.navCombos')}>
        <p>{t('ui.help.combosBody')}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-lg">
            <thead>
              <tr className="bg-ink text-panel">
                <th scope="col" className="px-2 py-1 text-left font-normal">{t('ui.help.comboCol')}</th>
                <th scope="col" className="px-2 py-1 text-left font-normal">{t('ui.help.exampleCol')}</th>
                <th scope="col" className="px-2 py-1 text-left font-normal">{t('ui.help.bonusCol')}</th>
              </tr>
            </thead>
            <tbody>
              {COMBO_KEYS.map((k) => (
                <tr key={k} className="border-b-2 border-shadow/40">
                  <th scope="row" className="px-2 py-1 text-left font-normal">{comboName(k)}</th>
                  <td className="px-2 py-1 font-mono text-base">{comboExampleText(k)}</td>
                  <td className="px-2 py-1">+{comboBonus(k, 1, data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="status" title={t('ui.help.navStatus')}>
        <StatusTable />
      </Section>

      <Section id="types" title={t('ui.help.navTypes')}>
        <TypeLookup />
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xl">{t('ui.help.showFullChart')}</summary>
          <TypeChart />
        </details>
      </Section>

      <Section id="grow" title={t('ui.help.navGrow')}>
        <ul className="ml-5 list-disc">
          <li>{t('ui.help.grow1')}</li>
          <li>{t('ui.help.grow2', { share: multiExpText(data) })}</li>
          <li>{t('ui.help.grow3', { multiplier: cfg.gymGoldMultiplier })}</li>
          <li>{t('ui.help.grow4')}</li>
          <li>{t('ui.help.grow5')}</li>
          <li>{t('ui.help.grow6')}</li>
        </ul>
      </Section>
    </div>
  )
}

export function HelpPage() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-5xl">{t('ui.help.title')}</h1>
        <PixelButton onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>{t('ui.help.back')}</PixelButton>
      </div>
      <div className="pixel-panel p-4">
        <HelpContent />
      </div>
      <Link to="/" className="self-center underline">
        {t('ui.help.titleScreen')}
      </Link>
    </main>
  )
}
