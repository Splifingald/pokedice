// Hidden talents (docs/51, docs/15 §38): the gem a Pokémon that carries its talent wears (green, blue or gold by
// rarity), the sheet's Talent section, and the rules pop-up (once, in the one-time pop-ups' queue; then a tap on
// the sheet's talent box).
// The engine decides who carries what (`engine/talents.ts`); these only show it.
import { useState } from 'react'
import {
  familyTalent,
  familyUnlocked,
  markTalentRulesSeen,
  TALENT,
  talentMet,
  talentTier,
  talentsOn,
  type GameData,
  type PokemonInstance,
  type TalentKey,
} from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesModal, type RuleRow } from './RulesModal'
import { SheetSection } from './SheetSection'

/** The gem of each rarity: green for common, blue for rare, gold for ultra. */
export const TIER_ICON = { common: 'talentCommon', rare: 'talentBase', ultra: 'talent' } as const

/** The numbers each talent's text says, from the engine's table. */
const pct = (x: number) => Math.round(x * 100)
const NUMBERS: Partial<Record<TalentKey, Record<string, number | string>>> = {
  extraReroll: { n: TALENT.extraReroll },
  doubleReroll: { n: TALENT.doubleReroll },
  quick: { n: pct(TALENT.quick) },
  ultraSpeed: { n: pct(TALENT.ultraSpeed) },
  thickHide: { n: pct(TALENT.thickHide) },
  opener: { n: pct(TALENT.opener) },
  finisher: { n: pct(TALENT.finisher), below: pct(TALENT.finisherBelow) },
  pairPro: { n: pct(TALENT.pairPro) },
  companion: { n: pct(TALENT.companion) },
  fieldMedic: { n: pct(TALENT.fieldMedic) },
  leftovers: { n: pct(TALENT.leftovers) },
  mindsEye: { x: TALENT.mindsEye },
  raider: { n: pct(TALENT.raider) },
  payDay: { n: pct(TALENT.payDay) },
  amuletCoin: { n: pct(TALENT.amuletCoin) },
  pickup: { n: pct(TALENT.pickup) },
  daycareDarling: { n: pct(TALENT.daycareDarling) },
  eggRush: { n: TALENT.eggRush },
  gentleTouch: { n: TALENT.gentleTouch },
}

export const talentName = (key: TalentKey): string => t(`ui.talent.name.${key}`)
export const talentText = (key: TalentKey): string => t(`ui.talent.text.${key}`, NUMBERS[key] ?? {})

/** What the battle log says of a talent at work (`LogEntry` kind 'talent'). */
export function talentLogText(
  name: string,
  e: { talent: TalentKey; amount?: number },
  ally?: string,
): string {
  const talent = talentName(e.talent)
  switch (e.talent) {
    case 'leftovers':
      return t('ui.talent.log.heal', { name, talent, n: e.amount ?? 0 })
    case 'mirror':
      return t('ui.talent.log.mirror', { name, n: e.amount ?? 0 })
    case 'sturdy':
      return t('ui.talent.log.sturdy', { name })
    case 'naturalCure':
      return t('ui.talent.log.cure', { name })
    case 'thaw':
      return t('ui.talent.log.thaw', { name })
    case 'companion':
      return t('ui.talent.log.companion', { name, ally: ally ?? '' })
    default:
      return t('ui.talent.log.boost', { name, talent })
  }
}

/** A Pokémon of the save by id, its name as the player knows it (its nickname, else its species'). */
function useMonName(uid: string, dex: number): string {
  const data = useGame((s) => s.data)
  const nick = useGame((s) => s.save?.box.find((p) => p.id === uid)?.nickname)
  return nick || data.species[dex]?.name || t('ui.common.pokemon')
}

/** A family's talent unlocked (a result card, a toast's twin): caught with it, passed from a weaker one, found evolving. */
export function TalentFoundCard({
  uid,
  dex,
  talent,
  how,
}: {
  uid: string
  dex: number
  talent: TalentKey
  how: 'caught' | 'passed' | 'evolved' | 'candy'
}) {
  useT()
  const name = useMonName(uid, dex)
  return (
    <div className="flex items-center gap-2 bg-gold-pale p-2 text-left shadow-ring">
      <TalentGem talent={talent} size={24} />
      <span className="grid gap-0.5">
        <span className="text-xl leading-tight">
          {t(`ui.talent.found.${how}`, { name, talent: talentName(talent) })}
        </span>
        <span className="font-pixel-sm text-[16px] leading-tight text-muted">{talentText(talent)}</span>
      </span>
    </div>
  )
}

/** Field Medic and Pickup after a win (docs/51): what the talent did. */
export function TalentAfterWinCard({
  uid,
  dex,
  line,
}: {
  uid: string
  dex: number
  line: (name: string) => string
}) {
  useT()
  const data = useGame((s) => s.data)
  const name = useMonName(uid, dex)
  return (
    <div className="flex items-center gap-2 bg-sky p-2 text-left shadow-ring">
      <TalentGem talent={familyTalent(data, dex)} size={20} />
      <span className="text-lg leading-tight">{line(name)}</span>
    </div>
  )
}

/** The switch, for the screens: off, no gem, no section, nothing. */
export const useTalentsOn = (): boolean => useGame((s) => talentsOn(s.data))

/**
 * The gem: green, blue or gold for a common, rare or ultra talent, grey for a talent not known yet. Its title names
 * the talent for screen readers and on hover.
 */
export function TalentGem({
  talent,
  unknown,
  size = 12,
  className,
}: {
  talent: TalentKey
  unknown?: boolean
  size?: number
  className?: string
}) {
  useT()
  const name = unknown ? t('ui.talent.unknown') : t('ui.talent.carries', { talent: talentName(talent) })
  const icon = unknown ? 'talentLocked' : TIER_ICON[talentTier(talent)]
  return <PixelIcon name={icon} size={size} title={name} className={cx('shrink-0', className)} />
}

/** A Pokémon's gem, when it carries its talent and the switch is on; nothing otherwise. */
export function InstTalentGem({
  inst,
  size,
  className,
}: {
  inst: Pick<PokemonInstance, 'dex' | 'talent'>
  size?: number
  className?: string
}) {
  const data = useGame((s) => s.data)
  if (!inst.talent || !talentsOn(data)) return null
  return <TalentGem talent={familyTalent(data, inst.dex)} size={size} className={className} />
}

/** The gem of a species' family talent (a listing's Pokémon, a want "with its talent"), while the switch is on. */
export function DexTalentGem({ dex, size, className }: { dex: number; size?: number; className?: string }) {
  const data = useGame((s) => s.data)
  if (!talentsOn(data)) return null
  return <TalentGem talent={familyTalent(data, dex)} size={size} className={className} />
}

/** The talent's name with its tier, as a chip of text: "Pickup · Base talent". */
function TalentTitle({ talent, dim }: { talent: TalentKey; dim?: boolean }) {
  useT()
  return (
    <span className={cx('flex flex-wrap items-center gap-x-2 gap-y-0.5', dim && 'text-muted')}>
      <TalentGem talent={talent} size={16} />
      <b className="text-[22px] font-normal leading-none">{talentName(talent)}</b>
      <span className="font-pixel-sm text-[16px] leading-none text-muted">
        {t(`ui.talent.tier.${talentTier(talent)}`)}
      </span>
    </span>
  )
}

/**
 * The sheet's Talent section: what this Pokémon's family has. Carried: its name, tier and what it does. Known but not
 * learnt here: the same, dimmed, with how to learn it. Never met: "???" and how to find out. A tap shows the rules.
 */
export function TalentSection({ dex, inst }: { dex: number; inst?: PokemonInstance }) {
  useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const [info, setInfo] = useState(false)
  if (!talentsOn(data)) return null
  const has = inst ? !!inst.talent : !!save && familyUnlocked(save, data, dex)
  return (
    <SheetSection title={t('ui.talent.section')}>
      {/* The box itself opens the rules (the user's call, 2026-10-30): no INFO button over it. */}
      <TalentBox
        talent={familyTalent(data, dex)}
        has={has}
        known={has || talentMet(save, data, dex)}
        onClick={() => setInfo(true)}
      />
      <TalentRulesModal open={info} onClose={() => setInfo(false)} />
    </SheetSection>
  )
}

/**
 * The section's box, in its three states: carried, known but not learnt, never met. With `onClick` the whole box is a
 * button that opens the rules.
 */
export function TalentBox({
  talent,
  has,
  known,
  onClick,
}: {
  talent: TalentKey
  has: boolean
  known: boolean
  onClick?: () => void
}) {
  useT()
  const Box = onClick ? 'button' : 'div'
  return (
    <Box
      {...(onClick && { type: 'button' as const, onClick, 'aria-haspopup': 'dialog' as const })}
      className={cx(
        'grid w-full gap-1 px-3 py-2 text-left shadow-ring-line',
        has ? 'bg-paper' : 'bg-well',
        onClick && 'cursor-pointer hover:shadow-ring focus-visible:shadow-ring',
      )}
    >
      {known ? (
        <>
          <TalentTitle talent={talent} dim={!has} />
          <p className={cx('copy', !has && 'text-muted')}>{talentText(talent)}</p>
          {!has && <p className="font-pixel-sm text-[16px] text-muted">{t('ui.talent.notLearnt')}</p>}
        </>
      ) : (
        <>
          <span className="flex items-center gap-2">
            <TalentGem talent={talent} unknown size={16} />
            <b className="text-[22px] font-normal leading-none text-muted">{t('ui.talent.unknown')}</b>
          </span>
          <p className="copy text-muted">{t('ui.talent.unknownHint')}</p>
        </>
      )}
    </Box>
  )
}

export function useTalentRules(data: GameData): RuleRow[] {
  useT()
  const odds = (x: number | undefined, d: number) => pct(Number.isFinite(Number(x)) ? Number(x) : d)
  const cfg = data.config.hiddenTalents
  return [
    { icon: 'talent', title: t('ui.talent.rules.what.title'), text: t('ui.talent.rules.what.text') },
    {
      icon: 'ball',
      title: t('ui.talent.rules.catch.title'),
      text: t('ui.talent.rules.catch.text', { n: odds(cfg?.wildChance, 0.05) }),
    },
    {
      icon: 'up',
      title: t('ui.talent.rules.evolve.title'),
      text: t('ui.talent.rules.evolve.text', { n: odds(cfg?.evolveChance, 0.3) }),
    },
    { icon: 'talentBase', title: t('ui.talent.rules.tiers.title'), text: t('ui.talent.rules.tiers.text') },
  ]
}

/** The rules (docs/15 §20): once as they open (Later / Let's go!), then from a tap on the sheet's talent box (OK). */
export function TalentRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  useT()
  const data = useGame((s) => s.data)
  const rules = useTalentRules(data)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.talent.title')}
      picture={<TalentBanner />}
      icon="talent"
      rules={rules}
      onGo={onGo}
    />
  )
}

/** The banner: the three gems on a night-blue ground, the gold one in the middle. */
function TalentBanner() {
  return (
    <div className="light-scope absolute inset-0 flex items-center justify-center gap-6 bg-night" aria-hidden>
      <PixelIcon name="talentBase" size={44} />
      <PixelIcon name="talent" size={64} />
      <PixelIcon name="talentLocked" size={44} />
    </div>
  )
}

const seen = () => mutateSave((s) => (s.talentRulesSeen ? null : markTalentRulesSeen(s)))

/**
 * Once, between fights, as the switch opens them to the player. It takes its turn in the one-time pop-ups' queue
 * (engine/popups.ts), after the battle powers'. Let's go! has nowhere to lead: talents are on every Pokémon.
 */
export function TalentRulesPopup() {
  const open = useMyTurn('talents')
  useOnScreen('talents', open)
  return <TalentRulesModal open={open} onClose={seen} onGo={seen} />
}
