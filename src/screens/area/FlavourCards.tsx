// The region flavours' encounter cards (docs/62, docs/15 §44): a Kalos horde's banner, an island trial's (the captain
// greeting, the Totem with its aura and its allies), a Titan's (its two phases, what it leaves). Each carries INFO,
// and its rules open by themselves the first time (docs/15 §20). The engine decides what each is; these show it.
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { flavourSeen, getSpecies, markFlavourSeen, trialById, type BossDef, type Encounter, type FlavourKey } from '@/engine'
import { joinList } from '@/i18n'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { BadgeIcon } from '@/components/BadgeIcon'
import { PixelIcon, type IconName } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { RulesModal, type RuleRow } from '@/components/RulesModal'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'

type CardFlavour = Extract<FlavourKey, 'hordes' | 'trials' | 'titans'>

const ICON: Record<CardFlavour, IconName> = { hordes: 'horde', trials: 'sparkle', titans: 'crown' }
const RULE_KEYS: Record<CardFlavour, [IconName, string][]> = {
  hordes: [
    ['horde', 'ui.horde.rules.what'],
    ['vs', 'ui.horde.rules.fight'],
    ['ball', 'ui.horde.rules.catch'],
  ],
  trials: [
    ['sparkle', 'ui.trial.rules.what'],
    ['up', 'ui.trial.rules.aura'],
    ['badge', 'ui.trial.rules.win'],
  ],
  titans: [
    ['crown', 'ui.titan.rules.what'],
    ['up', 'ui.titan.rules.phases'],
    ['coin', 'ui.titan.rules.reward'],
  ],
}

export function useFlavourRules(flavour: CardFlavour): RuleRow[] {
  const { t } = useT()
  return RULE_KEYS[flavour].map(([icon, k]) => ({ icon, title: t(`${k}.title`), text: t(`${k}.text`) }))
}

/** A flavour's rules (docs/15 §20): once as its first card shows, then from the card's INFO. */
export function FlavourRulesModal({
  flavour,
  open,
  onClose,
  onGo,
}: {
  flavour: CardFlavour
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useFlavourRules(flavour)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t(`ui.${flavour === 'hordes' ? 'horde' : flavour === 'trials' ? 'trial' : 'titan'}.rules.title`)}
      picture={<FlavourBanner flavour={flavour} />}
      icon={ICON[flavour]}
      rules={rules}
      onGo={onGo}
    />
  )
}

/** The rules' banner: the flavour's own species, drawn big. */
function FlavourBanner({ flavour }: { flavour: CardFlavour }) {
  const dex = flavour === 'hordes' ? [16, 16, 16] : flavour === 'trials' ? [735] : [950]
  return (
    <div className={cx('absolute inset-0 flex items-end justify-center gap-1 pb-2', flavour === 'hordes' ? 'bg-sky' : 'light-scope bg-night')} aria-hidden>
      {dex.map((d, i) => (
        <SpriteImg key={i} dex={d} size={flavour === 'hordes' ? 72 : 112} />
      ))}
    </div>
  )
}

/**
 * The card's INFO, and the rules opening by themselves the first time this flavour's card shows (`auto`; the kitchen
 * sink shows the cards without).
 */
function FlavourInfo({ flavour, dark, auto = true }: { flavour: CardFlavour; dark?: boolean; auto?: boolean }) {
  const { t } = useT()
  const seen = useGame((s) => !!s.save && flavourSeen(s.save, flavour))
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!seen && auto) setOpen(true)
  }, [seen, auto])
  const close = () => {
    setOpen(false)
    mutateSave((s) => (flavourSeen(s, flavour) ? null : markFlavourSeen(s, flavour)))
  }
  return (
    <>
      <PixelButton size="sm" className={cx('shrink-0', dark && 'text-ink')} onClick={() => setOpen(true)} aria-label={t('ui.flavour.info')}>
        <PixelIcon name="book" size={16} />
        {t('ui.lead.info')}
      </PixelButton>
      <FlavourRulesModal flavour={flavour} open={open} onClose={close} onGo={seen ? undefined : close} />
    </>
  )
}

/** A horde's banner over its card (docs/62 §5): HORDE, the five of them, and INFO. */
export function HordeBanner({ enc, auto }: { enc: Extract<Encounter, { kind: 'wild' }>; auto?: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const all = [{ dex: enc.dex, shiny: enc.shiny }, ...(enc.horde ?? [])]
  return (
    <div className="flex flex-col gap-2 bg-sky/40 p-2 shadow-ring-line" data-horde={all.length}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xl leading-none tracking-[0.3em] text-ink">
          <PixelIcon name="horde" size={20} />
          {t('ui.horde.tag')}
        </span>
        <FlavourInfo flavour="hordes" auto={auto} />
      </div>
      <div className="flex flex-wrap items-end gap-1" aria-label={joinList(all.map((m) => data.species[m.dex]?.name ?? ''))}>
        {all.map((m, i) => (
          <motion.span
            key={i}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.08 }}
            className="relative grid place-items-center bg-paper shadow-ring-line"
          >
            <MiniSprite dex={m.dex} size={44} />
            {m.shiny && <PixelIcon name="star" size={12} className="absolute right-0.5 top-0.5" title={t('ui.mon.shiny')} />}
          </motion.span>
        ))}
      </div>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight">{t('ui.horde.line', { n: all.length })}</p>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.horde.throw')}</p>
    </div>
  )
}

/** An island trial's card (docs/62 §6): ISLAND TRIAL, the captain and their line, the Totem with its aura, its allies. */
export function TrialCard({ enc, auto }: { enc: Extract<Encounter, { kind: 'gym' }>; auto?: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const desktop = useIsDesktop()
  const def = trialById(data, enc.trial)
  const [totem, ...allies] = enc.team
  if (!def || !totem) return null
  const name = getSpecies(data, totem.dex).name
  const cfg = data.config.trials
  return (
    <div className="flex flex-col gap-2" data-trial={def.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xl tracking-[0.3em] text-gold">{t('ui.trial.tag')}</span>
        <FlavourInfo flavour="trials" dark auto={auto} />
      </div>
      <div className="flex items-end gap-2">
        <motion.div initial={{ x: -48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="-my-2 shrink-0 self-end">
          <TrainerSprite src={enc.spriteUrl} size={desktop ? 128 : 88} />
        </motion.div>
        <p className="pixel-dialogue m-0 flex-1 px-3 py-1.5 text-[18px] leading-[1.15] text-ink">
          {t('ui.trial.greet', { captain: def.captain, place: def.place })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 bg-panel p-2 text-ink">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="foe-aura-totem shrink-0 bg-night shadow-[inset_0_0_0_3px_#ffbe2e]"
        >
          <SpriteImg dex={totem.dex} size={desktop ? 144 : 112} />
        </motion.span>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="text-[28px] leading-none">{t('ui.trial.totem', { name })}</span>
          <span className="text-2xl leading-none">{t('ui.common.level.short', { n: totem.level })}</span>
          <span className="font-pixel-sm text-[16px] leading-tight">
            {t('ui.trial.aura', { hp: cfg?.hpTimes ?? 2, n: cfg?.extraDice ?? 1, calls: allies.length })}
          </span>
          {enc.badge && (
            <span className="flex items-center gap-2 text-lg">
              <BadgeIcon badge={enc.badge} earned size={20} /> {t('ui.enc.winBadge', { badge: enc.badge })}
            </span>
          )}
        </div>
      </div>
      {allies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base text-gold-pale">{t('ui.trial.allies')}</span>
          {allies.map((m, i) => (
            <span key={i} className="flex items-center gap-1 border-2 border-gold bg-panel px-1.5 py-0.5 text-ink">
              <MiniSprite dex={m.dex} size={36} />
              <span className="text-base leading-tight">
                {data.species[m.dex]?.name}
                <br />
                {t('ui.common.level.short', { n: m.level })}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** A Titan's card (docs/62 §7): TITAN, the Titan (and its partner), its two phases, what it leaves, and INFO. */
export function TitanCard({ enc, auto, boss }: { enc: Extract<Encounter, { kind: 'boss' }>; auto?: boolean; boss?: BossDef }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const desktop = useIsDesktop()
  const here = useGame((s) => s.data.areas.find((a) => a.id === s.run.areaId)?.legendaryBoss?.find((b) => b.dex === enc.dex && b.titan))
  const def = boss ?? here
  const character = useGame((s) => s.save?.player?.character ?? null)
  const dex = character === 'green' && def?.titan?.versionDex ? def.titan.versionDex : enc.dex
  const partner = def?.titan?.partner ?? null
  const name = getSpecies(data, dex).name
  const cfg = data.config.titans
  const items = joinList((cfg?.items ?? []).map((i) => `${data.items[i.key]?.name ?? i.key} ×${i.qty}`))
  return (
    <div className="flex flex-col gap-2" data-titan={dex}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xl tracking-[0.35em] text-gold">{t('ui.titan.tag')}</span>
        <FlavourInfo flavour="titans" dark auto={auto} />
      </div>
      <div className="text-center text-2xl leading-tight text-gold">{t('ui.titan.line', { name })}</div>
      <div className="flex flex-wrap items-center gap-3 bg-panel p-2 text-ink">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="foe-aura-titan flex shrink-0 items-end bg-night shadow-[inset_0_0_0_3px_#ffbe2e]"
        >
          <SpriteImg dex={dex} size={desktop ? 160 : 120} />
          {partner && <SpriteImg dex={partner.dex} size={desktop ? 72 : 56} />}
        </motion.span>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="text-[28px] leading-none">{name}</span>
          <span className="text-2xl leading-none">{t('ui.common.level.short', { n: enc.level })}</span>
          <span className="font-pixel-sm text-[16px] leading-tight">{t(partner ? 'ui.titan.phasesPartner' : 'ui.titan.phases', { partner: partner ? getSpecies(data, partner.dex).name : '' })}</span>
          <span className="flex items-center gap-1 font-pixel-sm text-[16px] leading-tight">
            <PixelIcon name="coin" size={14} />
            {t('ui.titan.reward', { gold: money(cfg?.gold ?? 0), items })}
          </span>
          <span className="font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.titan.noCatch')}</span>
        </div>
      </div>
    </div>
  )
}
