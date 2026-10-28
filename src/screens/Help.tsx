// How to play (docs/43 §5.10): the four animated cards (the basics, shown by doing), then the rules as folded sections,
// one open at a time, each a few short lines; every detail one tap further for whoever wants it. Numbers come from the
// live game data; the type chart has its own screen.
import { useId, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { COMBO_KEYS, comboBonus, getRegion, regionOf, unlockedRegions } from '@/engine'
import { multiExpText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { DieFaces } from '@/components/Die'
import { PixelIcon, type IconName } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { TypeBadge } from '@/components/TypeBadge'
import { comboExampleText, comboName, statusEffects } from '@/lib/format'
import { useGame } from '@/store/game'
import { HowToPlay } from '@/screens/help/HowToPlay'
import { cx } from '@/theme/util'

function StatusTable() {
  const { t } = useT()
  const r = useGame((s) => s.data.config.status)
  const rows = statusEffects(r)
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('ui.help.navStatus')}>
      <table className="w-full border-collapse text-[18px]">
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
      <p className="mt-1 text-[18px] text-muted">{t('ui.help.statusNote')}</p>
    </div>
  )
}

function ComboTable() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('ui.help.navCombos')}>
      <table className="w-full border-collapse text-[18px]">
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
              <td className="px-2 py-1 tabular-nums">{comboExampleText(k)}</td>
              <td className="px-2 py-1">+{comboBonus(k, 1, data)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Rule {
  id: string
  icon: IconName
  title: string
  /** What a player needs: two or three short lines. */
  short: ReactNode[]
  /** Everything else, one tap further. */
  more?: ReactNode
}

/**
 * The rules, folded: one section open at a time (opening one closes the other), so the page is a list of titles a
 * newcomer reads in a glance. Each opens on its short lines; "Every detail" shows the rest.
 */
function RulesAccordion({ rules }: { rules: Rule[] }) {
  const { t } = useT()
  const uid = useId()
  const [open, setOpen] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      {rules.map((r) => {
        const on = open === r.id
        const body = `${uid}-${r.id}`
        return (
          <section key={r.id} id={r.id} className={cx('bg-paper', on ? 'shadow-card-gold' : 'shadow-card')}>
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={on}
                aria-controls={body}
                onClick={() => {
                  setOpen(on ? null : r.id)
                  setMore(false)
                }}
                className="flex min-h-[52px] w-full items-center gap-2.5 px-3 text-left text-[24px] leading-none"
              >
                <PixelIcon name={r.icon} size={20} />
                <span className="flex-1">{r.title}</span>
                <span aria-hidden className={cx('text-[18px]', on && 'rotate-180')}>
                  ▾
                </span>
              </button>
            </h3>
            {on && (
              <div id={body} className="flex flex-col gap-2 px-3 pb-3">
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {r.short.map((line, i) => (
                    <li key={i} className="flex gap-2 text-[20px] leading-[1.25]">
                      <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-accent" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                {r.more && (
                  <>
                    {more && <div className="copy flex flex-col gap-2 text-[18px]">{r.more}</div>}
                    <button
                      type="button"
                      aria-expanded={more}
                      onClick={() => setMore((m) => !m)}
                      className="min-h-[44px] self-start text-[18px] text-muted underline underline-offset-4"
                    >
                      {t(more ? 'ui.help.lessDetail' : 'ui.help.everyDetail')}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function HelpContent({ columns = false }: { columns?: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config
  // Help never names a region the player has not reached: with one unlocked, it reads exactly as it always did.
  const regions = save ? unlockedRegions(save, data) : []
  const regionName = (save && getRegion(data, regionOf(save))?.name) ?? 'Kanto'
  const manyRegions = regions.length > 1
  // The basics come first as animated cards (docs/38 §8b), the rules beside (PC) or below them.
  const rules: Rule[] = [
    {
      id: 'goal',
      icon: 'star',
      title: t('ui.help.navGoal'),
      short: [t('ui.help.short.goal', { region: regionName })],
      more: (
        <>
          <p>{t('ui.help.goalBody', { region: regionName })}</p>
          {manyRegions && <p>{t('ui.help.goalRegions')}</p>}
        </>
      ),
    },
    {
      id: 'explore',
      icon: 'map',
      title: t('ui.help.navExplore'),
      short: [t('ui.help.short.explore1'), t('ui.help.short.explore2'), t('ui.help.short.explore3')],
      more: (
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
      ),
    },
    {
      id: 'battle',
      icon: 'sword',
      title: t('ui.help.navBattle'),
      short: [t('ui.help.battle1'), t('ui.help.short.battle2'), t('ui.help.battle3')],
      more: (
        <>
          <p>{t('ui.help.battle2')}</p>
          <p>{t('ui.help.battleBody')}</p>
          <p>{t('ui.help.keyboard', { k1: '1', k6: '6', r: 'R', space: 'Space' })}</p>
        </>
      ),
    },
    {
      id: 'damage',
      icon: 'dice',
      title: t('ui.help.navDamage'),
      short: [t('ui.help.short.damage1'), t('ui.help.short.damage2')],
      more: (
        <>
          <p>{t('ui.help.damageBody')}</p>
          <div className="flex items-center gap-2">
            <span className="w-16">{t('ui.help.baseLabel')}</span>
            <DieFaces type="base" faces={data.diceTypes.base?.faces ?? []} size={28} />
          </div>
          <p className="text-muted">{t('ui.help.baseBody')}</p>
        </>
      ),
    },
    {
      id: 'combos',
      icon: 'sparkle',
      title: t('ui.help.navCombos'),
      short: [t('ui.help.combosBody')],
      more: <ComboTable />,
    },
    {
      id: 'status',
      icon: 'burn',
      title: t('ui.help.navStatus'),
      short: [t('ui.help.short.status')],
      more: <StatusTable />,
    },
    {
      id: 'grow',
      icon: 'up',
      title: t('ui.help.navGrow'),
      short: [t('ui.help.short.grow1'), t('ui.help.short.grow2'), t('ui.help.short.grow3')],
      more: (
        <ul className="ml-5 list-disc">
          <li>{t('ui.help.grow1')}</li>
          <li>{t('ui.help.grow2', { share: multiExpText(data) })}</li>
          <li>{t('ui.help.grow3', { multiplier: cfg.gymGoldMultiplier })}</li>
          <li>{t('ui.help.grow4')}</li>
          <li>{t('ui.help.grow5')}</li>
          <li>{t('ui.help.grow6')}</li>
        </ul>
      ),
    },
  ]
  return (
    <div
      className={cx(
        'flex flex-col gap-6',
        columns && 'lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-8',
      )}
    >
      <HowToPlay carousel />
      <section aria-labelledby="help-rules" className="flex flex-col gap-3">
        <h2 id="help-rules" className="text-[34px] leading-none">
          {t('ui.help.howRules')}
        </h2>
        <RulesAccordion rules={rules} />
      </section>
    </div>
  )
}

export function HelpPage() {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[32px] leading-none">{t('ui.help.title')}</h1>
        <PixelButton onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>{t('ui.help.back')}</PixelButton>
      </div>
      <div className="pixel-panel p-3 sm:p-4">
        <HelpContent columns />
      </div>
      <Link to="/" className="flex min-h-[44px] items-center self-center underline">
        {t('ui.help.titleScreen')}
      </Link>
    </main>
  )
}
