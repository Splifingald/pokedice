// A raid's own rules on its page (docs/40, the raid overhaul): its level and bars, its weather, each rule and its last
// bar, so players can learn the pattern before going in; INFO tells how the overhaul works. The engine decides every
// rule and number (engine/raidSpecials.ts); this only words them.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PixelIcon, type IconName } from '@/components/icons'
import { useMyTurn, useOnScreen } from '@/components/popupTurn'
import { RuleList, RulesModal, type RuleRow } from '@/components/RulesModal'
import {
  lowHpFormOf,
  markRaidRulesSeen,
  megaRaidDie,
  raidRules,
  raidSpecialFor,
  type GameData,
  type RaidKindOf,
  type RaidMod,
  type RaidSpecial,
  type RaidWeather,
} from '@/engine'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { mutateSave, useGame } from '@/store/game'
import { bannerUrl } from './shared'

type T = (key: string, vars?: Record<string, string | number>) => string

const pct = (x: number) => Math.round(x * 100)

const WEATHER_ICON: Record<RaidWeather, IconName> = {
  rain: 'cloud',
  sun: 'daySun',
  snow: 'frozen',
  sand: 'cloud',
  harshSun: 'daySun',
  heavyRain: 'cloud',
  strongWinds: 'cloud',
}

const MOD_ICON: Record<RaidMod['k'], IconName> = {
  telegraph: 'warning',
  shield: 'shield',
  firstHits: 'shield',
  regen: 'heart',
  recover: 'heart',
  barDie: 'dice',
  koDie: 'skull',
  neverResisted: 'sword',
  twice: 'sword',
  chip: 'warning',
  shift: 'reroll',
  absorb: 'energy',
  strikeMult: 'sword',
  lifesteal: 'heart',
  hazard: 'warning',
  slowStart: 'history',
  trickRoom: 'history',
  skipEvery: 'run',
  comboHeal: 'heal',
  spacialRend: 'sword',
  prism: 'sparkle',
  comboCut: 'dice',
  upgradeDrop: 'up',
  burnLonger: 'burn',
  noItems: 'potion',
  loveHate: 'heart',
  statusShort: 'check',
  extraDie: 'dice',
  airLock: 'cloud',
}

const types = (list: string[]) => list.map((x) => typeName(x as never)).join(', ')

/** One rule, worded: its title and its line, with the numbers the engine set. */
function modRow(m: RaidMod, t: T): RuleRow {
  const k = `ui.raid.rule.${m.k}`
  const icon = MOD_ICON[m.k]
  switch (m.k) {
    case 'telegraph':
      return { icon, title: t(`${k}.title`), text: t(`${k}.${m.move}`, { every: m.every }) }
    case 'shield':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { pct: pct(m.share) }) }
    case 'firstHits':
      return { icon, title: t(`${k}.title`), text: t(m.n === 1 ? `${k}.one` : `${k}.text`, { n: m.n }) }
    case 'regen':
      return {
        icon,
        title: t(`${k}.title`),
        text: t(m.unless ? `${k}.${m.unless}` : `${k}.text`, { pct: pct(m.pct) }),
      }
    case 'recover':
    case 'lifesteal':
    case 'comboHeal':
    case 'hazard':
    case 'prism':
    case 'comboCut':
      return {
        icon,
        title: t(`${k}.title`),
        text: t(`${k}.text`, { pct: pct(m.k === 'prism' ? 1 - m.mult : 'pct' in m ? m.pct : 0) }),
      }
    case 'barDie':
    case 'extraDie':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { type: typeName(m.die) }) }
    case 'koDie':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { max: m.max }) }
    case 'neverResisted':
      return {
        icon,
        title: t(`${k}.title`),
        text: m.types ? t(`${k}.types`, { types: types(m.types) }) : t(`${k}.all`),
      }
    case 'twice':
      return {
        icon,
        title: t(`${k}.title`),
        text: m.every ? t(`${k}.every`, { every: m.every }) : t(`${k}.text`, { pct: pct(m.mult) }),
      }
    case 'chip':
      return { icon, title: t(`${k}.${m.who}.title`), text: t(`${k}.${m.who}`, { pct: pct(m.pct) }) }
    case 'shift':
      return {
        icon,
        title: t(`${k}.title`),
        text: t(m.bars ? `${k}.bars` : `${k}.text`, { bars: (m.bars ?? []).join(', ') }),
      }
    case 'absorb':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { type: typeName(m.type) }) }
    case 'strikeMult':
      return {
        icon,
        title: t(`${k}.title`),
        text:
          m.above != null
            ? t(`${k}.above`, { pct: pct(m.mult - 1), above: pct(m.above) })
            : t(`${k}.text`, { pct: pct(m.mult - 1) }),
      }
    case 'slowStart':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { n: m.rounds }) }
    case 'skipEvery':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { n: m.n }) }
    case 'upgradeDrop':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { n: m.levels }) }
    case 'burnLonger':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`, { n: m.turns }) }
    case 'loveHate':
      return {
        icon,
        title: t(`${k}.title`),
        text: t(`${k}.text`, { heal: pct(m.heal), pct: pct(m.mult - 1) }),
      }
    case 'trickRoom':
    case 'spacialRend':
    case 'noItems':
    case 'statusShort':
    case 'airLock':
      return { icon, title: t(`${k}.title`), text: t(`${k}.text`) }
  }
}

/** Its last bar, worded: the form it takes, the dice it gains, what changes. */
function finalText(special: RaidSpecial, dex: number, data: GameData, t: T): string {
  const f = special.final
  const parts: string[] = []
  const low = lowHpFormOf(data, dex)
  if (low) parts.push(t('ui.raid.final.form', { form: t(`ui.raid.form.${low.dex}`) }))
  if (f?.form && data.species[f.form])
    parts.push(t('ui.raid.final.form', { form: data.species[f.form]!.name }))
  if (f?.dice?.length) parts.push(t('ui.raid.final.dice', { types: types(f.dice) }))
  if (f?.shiftDice)
    parts.push(
      t(f.shiftDice === 1 ? 'ui.raid.final.shiftDie' : 'ui.raid.final.shiftDice', { n: f.shiftDice }),
    )
  if (f?.spread) parts.push(t('ui.raid.final.spread', { pct: pct(f.spread) }))
  if (f?.regen) parts.push(t('ui.raid.final.regen'))
  if (f?.reflect) parts.push(t('ui.raid.final.reflect', { pct: pct(f.reflect) }))
  if (f?.harden) parts.push(t('ui.raid.final.harden', { n: f.harden }))
  if (f?.shiftEvery) parts.push(t('ui.raid.final.shiftEvery'))
  if (f?.stellar) parts.push(t('ui.raid.final.stellar'))
  return parts.length ? parts.join(' · ') : t('ui.raid.final.none')
}

/** A raid's rules as rows: its numbers, the weather or terrain, the auras, each rule, its last bar. */
export function raidRuleRows(
  data: GameData,
  dex: number,
  kind: RaidKindOf,
  areaId: string | undefined,
  t: T,
): RuleRow[] | null {
  const special = raidSpecialFor(data, dex, kind, areaId)
  if (!special) return null
  const r = raidRules(data, dex, kind, areaId)
  const rows: RuleRow[] = [
    {
      icon: 'star',
      title: t('ui.raid.rule.level.title', { n: r.level }),
      text: t('ui.raid.rule.level.text', { n: r.level, bars: r.bars }),
    },
  ]
  const airLock = special.mods.some((m) => m.k === 'airLock')
  if (special.weather && !airLock)
    rows.push({
      icon: WEATHER_ICON[special.weather],
      title: t(`ui.raid.x.weather.${special.weather}.name`),
      text: t(`ui.raid.x.weather.${special.weather}.text`),
    })
  if (special.terrain && !airLock)
    rows.push({
      icon: special.terrain === 'grassy' ? 'heal' : 'cloud',
      title: t(`ui.raid.x.terrain.${special.terrain}.name`),
      text: t(`ui.raid.x.terrain.${special.terrain}.text`),
    })
  for (const a of special.auras ?? [])
    rows.push({
      icon: 'sparkle',
      title: t('ui.raid.rule.aura.title', { type: typeName(a.type) }),
      text: t(a.who === 'all' ? 'ui.raid.rule.aura.all' : 'ui.raid.rule.aura.boss', {
        type: typeName(a.type),
        pct: pct(a.mult - 1),
      }),
    })
  const mega = megaRaidDie(data, dex)
  if (mega)
    rows.push({
      icon: 'dice',
      title: t('ui.raid.rule.mega.title'),
      text: t('ui.raid.rule.mega.text', { type: typeName(mega) }),
    })
  for (const m of special.mods) rows.push(modRow(m, t))
  rows.push({ icon: 'crown', title: t('ui.raid.rule.final.title'), text: finalText(special, dex, data, t) })
  return rows
}

/** The raid page's section: this raid's rules, and INFO for how the overhaul works. Nothing with the overhaul off. */
export function RaidRulesPanel({ dex, kind, areaId }: { dex: number; kind: RaidKindOf; areaId?: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [info, setInfo] = useState(false)
  const rows = raidRuleRows(data, dex, kind, areaId, t)
  if (!rows) return null
  return (
    <section aria-labelledby="raid-rules-title" className="grid gap-2.5 bg-paper p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="raid-rules-title" className="m-0 text-[22px] font-normal leading-none">
          {t('ui.raid.rules.title')}
        </h2>
        <button
          type="button"
          className="grid h-11 min-w-11 place-items-center px-2 font-pixel-sm text-[15px] text-muted"
          onClick={() => setInfo(true)}
          aria-label={t('ui.raid.rules.infoLabel')}
        >
          <PixelIcon name="book" size={20} />
        </button>
      </div>
      <RuleList rules={rows} />
      <RaidRulesInfo open={info} onClose={() => setInfo(false)} />
    </section>
  )
}

/**
 * How the overhaul works, for every raid: the pop-up shown once (with `onGo`: Later / Let's go!) and from the raid
 * pages' INFO (just OK).
 */
export function RaidRulesInfo({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const rows: RuleRow[] = [
    { icon: 'star', title: t('ui.raid.rules.info.level.title'), text: t('ui.raid.rules.info.level.text') },
    {
      icon: 'warning',
      title: t('ui.raid.rules.info.pattern.title'),
      text: t('ui.raid.rules.info.pattern.text'),
    },
    { icon: 'crown', title: t('ui.raid.rules.info.final.title'), text: t('ui.raid.rules.info.final.text') },
    {
      icon: 'masterball',
      title: t('ui.raid.rules.info.mega.title'),
      text: t('ui.raid.rules.info.mega.text'),
    },
  ]
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      onGo={onGo}
      title={t('ui.raid.rules.info.title')}
      picture={{ src: bannerUrl(data.config.events.raid.banner) }}
      icon="star"
      rules={rows}
    />
  )
}

const seen = () => mutateSave((s) => (s.events?.raidRulesSeen ? null : markRaidRulesSeen(s)))

/**
 * Once, between fights, the first time a progression raid is open with the overhaul on. It takes its turn in the
 * one-time pop-ups' queue (engine/popups.ts), after the battle powers'. Let's go! leads to the Raids page.
 */
export function RaidRulesPopup() {
  const open = useMyTurn('raidRules')
  useOnScreen('raidRules', open)
  const navigate = useNavigate()
  return (
    <RaidRulesInfo
      open={open}
      onClose={seen}
      onGo={() => {
        seen()
        navigate('/events/raid')
      }}
    />
  )
}
