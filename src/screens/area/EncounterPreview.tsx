import { motion } from 'framer-motion'
import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { catchTarget, catchValueOf, effectiveStats, getSpecies, MONEY, type Encounter } from '@/engine'
import { effectText } from '@/i18n/text'
import { money } from '@/lib/format'
import { useT } from '@/i18n/react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { BadgeIcon } from '@/components/BadgeIcon'
import { DiceSet } from '@/components/DiceSet'
import { PixelIcon } from '@/components/icons'
import { LeadPicker, defaultLead } from '@/components/LeadPicker'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { StatChip } from '@/components/StatChip'
import { TrainerSprite } from '@/components/TrainerArt'
import { TypeBadge } from '@/components/TypeBadge'
import { foeTypes } from '@/components/TypeMatchups'
import { useGame } from '@/store/game'
import { canSkipCurrent, declineChallenge, engage, skipEncounter } from '@/store/run'
import { cx } from '@/theme/util'

function WildCard({ enc }: { enc: Extract<Encounter, { kind: 'wild' | 'boss' }> }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const desktop = useIsDesktop()
  const sp = getSpecies(data, enc.dex)
  const stats = effectiveStats(sp, enc.level, data)
  const boss = enc.kind === 'boss'
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cx('shrink-0', boss ? 'border-[3px] border-gold bg-ink' : 'border-[3px] border-ink bg-parchment')}
      >
        <SpriteImg dex={enc.dex} size={desktop ? 144 : 104} shiny={enc.shiny} />
      </motion.div>
      <div className="flex min-w-0 flex-col gap-1">
        {boss && <div className="text-lg leading-none tracking-[0.35em] text-gold">{t('ui.enc.legendaryTag')}</div>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-3xl leading-none sm:text-4xl">{sp.name}</span>
          {enc.shiny && (
            <span className="inline-flex items-center gap-1 border-2 border-ink bg-panel px-1.5 text-lg leading-tight text-ink">
              <PixelIcon name="star" size={14} /> {t('ui.mon.shinyTag')}
            </span>
          )}
          {enc.kind === 'wild' &&
            (enc.isNew ? (
              <span className="border-2 border-ink bg-gold px-1.5 text-lg leading-tight text-ink">{t('ui.enc.new')}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-lg text-muted">
                <PixelIcon name="ball" size={16} /> {t('ui.enc.caught')}
              </span>
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl leading-none">{t('ui.common.level.short', { n: enc.level })}</span>
          <TypeBadge type={sp.type1} size="sm" />
          {sp.type2 && <TypeBadge type={sp.type2} size="sm" />}
        </div>
        <div className="flex items-center gap-2">
          <DiceSet dice={stats.dice} size={22} />
          <StatChip stat="rerolls" value={stats.rerolls} size={18} className="text-lg" />
        </div>
        <CatchHint dex={enc.dex} level={enc.level} kind={boss ? 'boss' : 'wild'} shiny={enc.shiny} />
      </div>
    </div>
  )
}

/** What a catch would mean here: its catch value, and whether it's new, an upgrade, or not catchable. */
function CatchHint({ dex, level, kind, shiny }: { dex: number; level: number; kind: 'wild' | 'boss'; shiny?: boolean }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const target = catchTarget(save, dex, level, kind, data, shiny)
  return (
    <div className="flex flex-wrap items-center gap-x-1 text-lg leading-tight">
      <StatChip stat="catch" value={catchValueOf(data, dex)} size={18} />
      {target?.mode === 'replace' && t('ui.enc.replaces', { level: target.level })}
      {target?.mode === 'new' && shiny && save.pokedex.includes(dex) && t('ui.enc.shinyExtra')}
      {!target && t('ui.enc.noCatch')}
    </div>
  )
}

function ItemCard({ enc }: { enc: Extract<Encounter, { kind: 'item' }> }) {
  const data = useGame((s) => s.data)
  const isMoney = enc.itemKey === MONEY
  const item = data.items[enc.itemKey]
  return (
    <div className="flex flex-col items-center gap-2 text-center">

      {isMoney ? (
        <span className="text-6xl leading-none" aria-hidden>
          ₽
        </span>
      ) : item?.spriteUrl ? (
        <img src={item.spriteUrl} alt="" width={80} height={80} className="pixelated" style={{ imageRendering: 'pixelated' }} />
      ) : null}
      <div className="text-4xl leading-none">
        {isMoney ? money(enc.qty) : `${item?.name ?? enc.itemKey}${enc.qty > 1 ? ` ×${enc.qty}` : ''}`}
      </div>
      {!isMoney && item && <p className="copy text-muted">{item.description ?? effectText(item)}</p>}
    </div>
  )
}

/** The trainer steps in from the side of the pop-up. */
function TrainerIntro({ src, size }: { src: string | null | undefined; size: number }) {
  return (
    <motion.div
      className="-my-2 shrink-0 self-end"
      initial={{ x: -48, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      <TrainerSprite src={src} size={size} />
    </motion.div>
  )
}

function TrainerCard({ enc }: { enc: Extract<Encounter, { kind: 'trainer' }> }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const desktop = useIsDesktop()
  return (
    <div className="flex items-center gap-3">
      <TrainerIntro src={enc.spriteUrl} size={desktop ? 192 : 128} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-3xl leading-none sm:text-4xl">{enc.name}</div>
        <div className="text-xl leading-tight text-muted">{t('ui.enc.wantsToBattle', { count: enc.team.length })}</div>
        <div className="flex flex-wrap gap-1.5">
          {enc.team.map((m, i) => (
            <div key={i} className="flex flex-col items-center border-2 border-ink bg-panel px-1 py-0.5">
              <MiniSprite dex={m.dex} size={36} silhouette />
              <span className="text-base leading-none">{t('ui.common.level.short', { n: m.level })}</span>
            </div>
          ))}
        </div>
        <div className="text-base leading-tight text-muted">
          {t('ui.enc.paysPerKo')}
          {/* Only worth saying when wild battles can be fled. */}
          {!data.config.noEscape && t('ui.enc.noRunning')}
        </div>
        <div className="sr-only">{enc.team.map((m) => data.species[m.dex]?.name).join(', ')}</div>
      </div>
    </div>
  )
}

function GymCard({ enc }: { enc: Extract<Encounter, { kind: 'gym' }> }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const desktop = useIsDesktop()
  const title =
    enc.role === 'leader'
      ? t('ui.enc.gymBattle')
      : enc.role === 'champion'
        ? t('ui.enc.champion')
        : t('ui.enc.eliteFour', { index: enc.index, total: enc.total })
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center text-xl tracking-[0.35em] text-gold">{title}</div>
      <div className="flex items-center gap-3">
        <TrainerIntro src={enc.spriteUrl} size={desktop ? 192 : 128} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-3xl leading-none sm:text-4xl">
            {enc.role === 'leader' ? t('ui.trainer.gymLeader', { name: enc.name }) : enc.name}
          </div>
          {enc.badge && (
            <div className="flex items-center gap-2 text-xl">
              <BadgeIcon badge={enc.badge} earned size={22} /> {t('ui.enc.winBadge', { badge: enc.badge })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {enc.team.map((m, i) => (
          <div key={i} className="flex items-center gap-1 border-2 border-gold bg-panel px-1.5 py-0.5 text-ink">
            <MiniSprite dex={m.dex} size={40} />
            <span className="text-base leading-tight">
              {data.species[m.dex]?.name}
              {m.shiny && <PixelIcon name="star" size={12} className="ml-1 inline-block" title={t('ui.mon.shiny')} />}
              <br />
              {t('ui.common.level.short', { n: m.level })}
            </span>
          </div>
        ))}
      </div>
      <div className="text-base leading-tight">
        {t(data.config.noEscape ? 'ui.enc.gymPays' : 'ui.enc.gymPaysNoRun', { multiplier: data.config.gymGoldMultiplier })}
      </div>
    </div>
  )
}

function CenterCard({ enc }: { enc: Extract<Encounter, { kind: 'center' }> }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <PixelIcon key={i} name="ball" size={32} />
        ))}
      </div>
      <div className="text-4xl">{t('ui.enc.centerTitle')}</div>
      <div className="text-xl text-muted">
        {enc.forced
          ? t(
              enc.reason === 'round' ? 'ui.enc.centerRound' : enc.reason === 'fainted' ? 'ui.enc.centerFainted' : 'ui.enc.centerHurt',
            )
          : t('ui.enc.centerRest')}{' '}
        {t('ui.enc.centerFull')}
      </div>
    </div>
  )
}

function CasinoCard() {
  const { t } = useT()
  const slots = useGame((s) => s.data.config.slotMachine)
  const prize = useGame((s) => s.data.species[s.data.config.slotMachine.prizeDex]?.name) ?? t('ui.enc.prizeMon')
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-1">
        <PixelIcon name="ball" size={32} />
        <SpriteImg dex={slots.prizeDex} size={48} />
        <PixelIcon name="ball" size={32} />
      </div>
      <div className="text-4xl">{t('ui.enc.casinoTitle')}</div>
      <div className="text-xl text-muted">{t('ui.enc.casinoIntro', { cost: slots.cost, prize })}</div>
    </div>
  )
}

const TITLES: Record<Encounter['kind'], string> = {
  wild: 'ui.enc.titleWild',
  boss: 'ui.enc.titleBoss',
  trainer: 'ui.enc.titleTrainer',
  gym: 'ui.enc.titleGym',
  item: 'ui.enc.titleItem',
  center: 'ui.enc.titleCenter',
  casino: 'ui.enc.titleCasino',
}

/** The encounter, in a pop-up (a bottom sheet on phones): the opponent, who to send out, FIGHT or FLEE (AVOID a trainer). */
export function EncounterPreview({ enc }: { enc: Encounter }) {
  const { t } = useT()
  const [lead, setLead] = useState<string | null>(null)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const titleId = useId()
  const skippable = canSkipCurrent()
  const fight = enc.kind !== 'center' && enc.kind !== 'item' && enc.kind !== 'casino'
  const dark = enc.kind === 'boss' || enc.kind === 'gym'
  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/60 sm:items-center sm:p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        key={JSON.stringify(enc)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden sm:max-h-[90vh]', dark ? 'pixel-panel-dark' : 'pixel-panel')}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        {/* Gym and legendary cards carry their own banner, so their title is for screen readers only. */}
        <h2 id={titleId} className={dark ? 'sr-only' : 'border-b-[3px] border-ink px-3 py-2 text-center text-2xl leading-tight sm:text-3xl'}>
          {t(TITLES[enc.kind])}
        </h2>
        <div className="pixel-scroll flex flex-col gap-3 overflow-y-auto p-3 sm:p-4">
          {enc.kind === 'gym' && <GymCard enc={enc} />}
          {enc.kind === 'wild' && <WildCard enc={enc} />}
          {enc.kind === 'boss' && (
            <>
              <div className="text-center text-2xl leading-tight text-gold">
                {enc.returning
                  ? t('ui.enc.legendaryBack', { name: data.species[enc.dex]?.name ?? t('ui.enc.theLegendary') })
                  : t('ui.enc.legendaryBlocks')}
              </div>
              <div className="bg-panel p-3 text-ink">
                <WildCard enc={enc} />
              </div>
            </>
          )}
          {enc.kind === 'trainer' && <TrainerCard enc={enc} />}
          {enc.kind === 'item' && <ItemCard enc={enc} />}
          {enc.kind === 'center' && <CenterCard enc={enc} />}
          {enc.kind === 'casino' && <CasinoCard />}

          {fight && save && (
            <div className={dark ? 'bg-panel p-2 text-ink' : undefined}>
              <LeadPicker value={lead} onChange={setLead} foe={foeTypes(data, enc)} />
            </div>
          )}
        </div>

        <div
          className={cx('flex gap-2 border-t-[3px] p-3', dark ? 'border-shadow' : 'border-ink')}
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <PixelButton
            variant="primary"
            size="lg"
            className="flex-1"
            autoFocus
            onClick={() => engage(fight ? (lead ?? defaultLead()) : undefined)}
          >
            {fight && <PixelIcon name="sword" size={22} />}
            {t(
              enc.kind === 'center' || enc.kind === 'casino' ? 'ui.enc.enter' : enc.kind === 'item' ? 'ui.enc.pickUp' : 'ui.enc.fight',
            )}
          </PixelButton>
          {skippable && (
            <PixelButton size="lg" className="flex-1" onClick={skipEncounter}>
              {fight && <PixelIcon name="run" size={20} />}
              {t(enc.kind === 'trainer' ? 'ui.enc.avoid' : fight ? 'ui.enc.flee' : 'ui.enc.skip')}
              {data.config.skipPolicy === 'once' && <span className="text-base"> (1)</span>}
            </PixelButton>
          )}
          {/* A challenge the player picked (gym, or a legendary due once every round is done) can wait. */}
          {(enc.kind === 'gym' || (enc.kind === 'boss' && !enc.returning)) && (
            <PixelButton size="lg" className="flex-1" onClick={declineChallenge}>
              {t('ui.enc.notYet')}
            </PixelButton>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
