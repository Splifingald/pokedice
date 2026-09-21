// The rules in plain words. Numbers come from the live game data; the type chart has its own screen.
import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { COMBO_KEYS, comboBonus, getRegion, regionOf, unlockedRegions } from '@/engine'
import { multiExpText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { DieFaces } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { TypeBadge } from '@/components/TypeBadge'
import { comboExampleText, comboName, statusEffects } from '@/lib/format'
import { useGame } from '@/store/game'

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

export function HelpContent() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config
  // Help never names a region the player has not reached: with one unlocked, it reads exactly as it always did.
  const regions = save ? unlockedRegions(save, data) : []
  const regionName = (save && getRegion(data, regionOf(save))?.name) ?? 'Kanto'
  const manyRegions = regions.length > 1
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
          ['grow', 'ui.help.navGrow'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="pixel-btn flex min-h-[44px] items-center bg-panel px-2 md:min-h-[32px]">
            {t(label!)}
          </a>
        ))}
      </nav>

      <Section id="goal" title={t('ui.help.navGoal')}>
        <p>{t('ui.help.goalBody', { region: regionName })}</p>
        {manyRegions && <p>{t('ui.help.goalRegions')}</p>}
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
