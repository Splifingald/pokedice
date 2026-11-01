import { HauntSprite } from '@/components/Nightmare'
import { GlitchSprite } from '@/components/Portal'
import { skinKey, skinOfArea } from '@/components/portalSkin'
import { motion } from 'framer-motion'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { catchTarget, catchValueOf, effectiveStats, getSpecies, isDoubleEncounter, isPlayerFoe, MONEY, paidKey, rebattleProgress, rebattleTiers, teamOf, type Encounter, portalNoCatch, nightmareFoe, whiteoutFoe, familyTalent, familyUnlocked, noteTalentMet, talentMet, talentsOn } from '@/engine'
import { joinList } from '@/i18n'
import { effectText } from '@/i18n/text'
import { money } from '@/lib/format'
import { useT } from '@/i18n/react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { BadgeIcon } from '@/components/BadgeIcon'
import { DiceSet } from '@/components/DiceSet'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelIcon } from '@/components/icons'
import { LeadPicker, defaultLead, pickedPair } from '@/components/LeadPicker'
import { AutoButton, PILOT_PICK_MS } from '@/components/AutoButton'
import { useAutoLevel } from '@/store/autopilot'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { StatChip } from '@/components/StatChip'
import { TrainerSprite } from '@/components/TrainerArt'
import { TypeBadge } from '@/components/TypeBadge'
import { foeTypes } from '@/components/TypeMatchups'
import { ShinyParadeChip } from '@/screens/events/live'
import { TrickCard } from '@/components/TrickOrTreat'
import { GiftCardPreview } from '@/components/GiftCard'
import { mutateSave, useGame } from '@/store/game'
import { canSkipCurrent, declineChallenge, engage, skipEncounter } from '@/store/run'
import { cx } from '@/theme/util'
import { TalentGem, talentName } from '@/components/Talent'
import { PlayerFoeCard } from '@/components/AreaVersus'

function WildCard({ enc }: { enc: Extract<Encounter, { kind: 'wild' | 'boss' }> }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const desktop = useIsDesktop()
  const sp = getSpecies(data, enc.dex)
  const stats = effectiveStats(sp, enc.level, data)
  const boss = enc.kind === 'boss'
  const area = useGame((s) => s.data.areas.find((a) => a.id === s.run.areaId))
  // A portal run's wild Pokémon (docs/28): distorted, and never caught.
  const distorted = useGame((s) => !boss && !!s.save && portalNoCatch(s.save, s.data, s.run.areaId))
  // The Stairway of Plates' Pokémon wear light instead, and say so in its words (docs/61 §4.5).
  const skin = skinOfArea(area, data)
  // The nightmare's foe (docs/30): its round, and never caught either.
  // (Its store values picked one by one: a selector must not build a new object on every call.)
  const save = useGame((s) => s.save)
  const runArea = useGame((s) => s.run.areaId)
  const dream = !boss && save && runArea ? nightmareFoe(save, data, runArea) : null
  // The whiteout's wave foe (docs/61 §4.3): its wave and place, lost in the blizzard, never caught.
  const storm = !boss && !dream && save && runArea ? whiteoutFoe(save, data, runArea) : null
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cx(
          'shrink-0',
          boss
            ? 'bg-night shadow-[inset_0_0_0_3px_#ffbe2e]'
            : dream
              ? 'light-scope bg-[#080b1f] shadow-[inset_0_0_0_3px_#5a3aa8]'
              : storm
                ? 'light-scope bg-[#16264a] shadow-[inset_0_0_0_3px_#a6c2db]'
                : 'bg-paper shadow-ring',
        )}
      >
        {distorted ? (
          <GlitchSprite dex={enc.dex} size={desktop ? 144 : 104} shiny={enc.shiny} look={skin} />
        ) : dream ? (
          <HauntSprite dex={enc.dex} size={desktop ? 144 : 104} shiny={enc.shiny} />
        ) : (
          <SpriteImg dex={enc.dex} size={desktop ? 144 : 104} shiny={enc.shiny} />
        )}
      </motion.div>
      <div className="flex min-w-0 flex-col gap-1">
        {boss && <div className="text-lg leading-none tracking-[0.35em] text-gold">{t('ui.enc.legendaryTag')}</div>}
        {dream && (
          <div className="text-lg leading-none tracking-[0.2em] text-muted">
            {t('ui.nightmare.roundTag', { n: dream.round, total: dream.total })}
          </div>
        )}
        {storm && (
          <div className="text-lg leading-none tracking-[0.2em] text-muted">
            {t('ui.whiteout.waveTag', { n: storm.wave, total: storm.waves, i: storm.index, size: storm.size })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[30px] leading-none">{sp.name}</span>
          {enc.shiny && (
            <span className="inline-flex items-center gap-1 bg-paper px-1.5 text-lg leading-tight text-ink shadow-ring">
              <PixelIcon name="star" size={14} /> {t('ui.mon.shinyTag')}
            </span>
          )}
          {enc.kind === 'wild' && <ShinyParadeChip area={area} />}
          {enc.kind === 'wild' &&
            !distorted &&
            !dream &&
            !storm &&
            (enc.isNew ? (
              <span className="bg-gold px-1.5 text-lg leading-tight text-ink shadow-ring">{t('ui.enc.new')}</span>
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
        {enc.talent && <TalentNews dex={enc.dex} name={sp.name} catchable={!distorted && !dream && !storm} />}
        {distorted ? (
          <p className="m-0 flex items-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-muted">
            <PixelIcon name="sparkle" size={14} />
            {t(skinKey(skin, 'ui.portal.noCatch'))}
          </p>
        ) : dream ? (
          <p className="m-0 flex items-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-muted">
            <PixelIcon name="moon" size={14} />
            {t('ui.nightmare.noCatch')}
          </p>
        ) : storm ? (
          <p className="m-0 flex items-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-muted">
            <PixelIcon name="frozen" size={14} />
            {t('ui.whiteout.noCatch')}
          </p>
        ) : (
          <CatchHint dex={enc.dex} level={enc.level} kind={boss ? 'boss' : 'wild'} shiny={enc.shiny} talent={enc.talent} />
        )}
      </div>
    </div>
  )
}

/** What a catch would mean here: its catch value, and whether it's new, an upgrade, or not catchable. */
/**
 * A wild Pokémon carrying its hidden talent (docs/51): its name, and whether catching it teaches the family (still
 * locked here) or it's one more that has it. Seeing it notes the talent as met: the sheets name it from now on.
 */
function TalentNews({ dex, name, catchable }: { dex: number; name: string; catchable: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  useEffect(() => {
    if (talentsOn(data)) mutateSave((s) => (talentMet(s, data, dex) ? null : noteTalentMet(s, data, dex)))
  }, [data, dex])
  if (!talentsOn(data) || !save) return null
  const talent = familyTalent(data, dex)
  const learn = catchable && !familyUnlocked(save, data, dex)
  return (
    <p className="m-0 flex items-start gap-1.5 bg-gold-pale px-2 py-1 text-[17px] leading-tight shadow-ring-line">
      <TalentGem talent={talent} size={16} className="mt-0.5" />
      <span>
        {t(learn ? 'ui.talent.preview.learn' : 'ui.talent.preview.has', { name, talent: talentName(talent) })}
      </span>
    </p>
  )
}

function CatchHint({
  dex,
  level,
  kind,
  shiny,
  talent,
}: {
  dex: number
  level: number
  kind: 'wild' | 'boss'
  shiny?: boolean
  talent?: boolean
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const target = catchTarget(save, dex, level, kind, data, shiny, save.currentAreaId, !!talent)
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
        <ItemSprite item={item} size={80} />
      ) : null}
      <div className="text-[32px] leading-none">
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
        <div className="text-[30px] leading-none">{enc.name}</div>
        <div className="text-xl leading-tight text-muted">
          {t(enc.double ? 'ui.enc.wantsToBattleDouble' : 'ui.enc.wantsToBattle', { count: enc.team.length })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {enc.team.map((m, i) => (
            <div key={i} className="flex flex-col items-center bg-paper px-1 py-0.5 shadow-ring">
              <MiniSprite dex={m.dex} size={36} silhouette />
              <span className="text-base leading-none">{t('ui.common.level.short', { n: m.level })}</span>
            </div>
          ))}
        </div>
        <div className="text-base leading-tight text-muted">
          {/* A set opening's trainer (docs/46) pays a set prize for the win. */}
          {enc.prize != null ? t('ui.enc.paysPrize', { gold: enc.prize }) : t('ui.enc.paysPerKo')}
          {/* Only worth saying when wild battles can be fled. */}
          {!data.config.noEscape && t('ui.enc.noRunning')}
        </div>
        <div className="sr-only">{joinList(enc.team.map((m) => data.species[m.dex]?.name ?? ''))}</div>
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
          <div className="text-[30px] leading-none">
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
        {enc.rebattle ? (
          <RebattlePays enc={enc} rebattle={enc.rebattle} />
        ) : (
          t(data.config.noEscape ? 'ui.enc.gymPays' : 'ui.enc.gymPaysNoRun', { multiplier: data.config.gymGoldMultiplier })
        )}
      </div>
    </div>
  )
}

/** An Elite Rebattle trainer: each of their Pokémon pays at the tier's multiplier, once in the tier. */
function RebattlePays({ enc, rebattle }: { enc: Extract<Encounter, { kind: 'gym' }>; rebattle: { regionId: string; tier: number } }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const paid = save ? rebattleProgress(save, rebattle.regionId).paid : []
  const allPaid = enc.team.every((_, i) => paid.includes(paidKey(rebattle.tier, enc.trainerId, i)))
  const gold = rebattleTiers(data)[rebattle.tier]?.gold ?? 1
  return <>{allPaid ? t('ui.events.rebattle.allPaid') : t('ui.events.rebattle.pays', { gold })}</>
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
      <div className="text-[32px] leading-none">{t('ui.enc.centerTitle')}</div>
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
      <div className="text-[32px] leading-none">{t('ui.enc.casinoTitle')}</div>
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
  trick: 'ui.enc.titleTrick',
  gift: 'ui.enc.titleGift',
}

/** The encounter, in a pop-up (a bottom sheet on phones): the opponent, who to send out, FIGHT or FLEE (AVOID a trainer). */
export function EncounterPreview({ enc }: { enc: Encounter }) {
  const { t } = useT()
  const [lead, setLead] = useState<string | null>(null)
  // A double battle sends two out (docs/33).
  const [leads, setLeads] = useState<string[]>([])
  const double = isDoubleEncounter(enc)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const titleId = useId()
  const skippable = canSkipCurrent()
  const fight =
    enc.kind !== 'center' && enc.kind !== 'item' && enc.kind !== 'casino' && enc.kind !== 'trick' && enc.kind !== 'gift'
  const dark = enc.kind === 'boss' || enc.kind === 'gym'
  // A card whose one way on is its button (the Game Corner, Trick or Treat with no skipping it): it loads and presses
  // itself (the user's rule: no step that is only a button). A fight, or a card with a second choice, waits.
  const waits = enc.kind === 'gym' || (enc.kind === 'boss' && !enc.returning)
  // The autopilot leaves a trainer's card on the table (engine pilotShowsCard): FIGHT loads and goes by itself with the
  // lead it would pick, and a Pokémon tapped holds it for the player's own FIGHT.
  const pilot = useAutoLevel() === 'full' && (enc.kind === 'trainer' || enc.kind === 'gym')
  const picked = lead != null || leads.length > 0
  const Primary = pilot || (!fight && !skippable && !waits) ? AutoButton : PixelButton
  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-night/60 sm:items-center sm:p-3"
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
        <h2 id={titleId} className={dark ? 'sr-only' : 'border-b-[3px] border-edge px-3 py-2 text-center text-2xl leading-tight sm:text-3xl'}>
          {t(enc.kind === 'wild' && enc.partner ? 'ui.enc.titleWildPair' : isPlayerFoe(enc) ? 'ui.areaVersus.title' : TITLES[enc.kind])}
        </h2>
        <div className="pixel-scroll flex flex-col gap-3 overflow-y-auto p-3 sm:p-4">
          {enc.kind === 'gym' && <GymCard enc={enc} />}
          {enc.kind === 'wild' && <WildCard enc={enc} />}
          {enc.kind === 'wild' && enc.partner && <WildCard enc={{ kind: 'wild', ...enc.partner }} />}
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
          {/* A real player's team (docs/54): who, their team and what it pays, after its intro. */}
          {enc.kind === 'trainer' && (isPlayerFoe(enc) ? <PlayerFoeCard enc={enc} /> : <TrainerCard enc={enc} />)}
          {enc.kind === 'item' && <ItemCard enc={enc} />}
          {enc.kind === 'center' && <CenterCard enc={enc} />}
          {enc.kind === 'casino' && <CasinoCard />}
          {enc.kind === 'trick' && <TrickCard dex={enc.dex} level={enc.level} tier={enc.tier} isNew={enc.isNew} shiny={enc.shiny} />}
          {/* The Gift card (docs/61 §4.0): only while the server says yes, the present itself comes at once. */}
          {enc.kind === 'gift' && <GiftCardPreview />}

          {/* A team of one has no one to pick: no "Send out" at all (LeadPicker draws nothing either). */}
          {fight && save && teamOf(save).length > 1 && (
            <div className={cx(dark && 'bg-panel p-2 text-ink', pilot && 'grid gap-1.5')}>
              {pilot && !picked && (
                <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted" role="status">
                  {t('ui.idle.pickLead')}
                </p>
              )}
              {/* The send-out's cards (one design for "pick a Pokémon", docs/43 §5.3): a tap picks (two, a double
                  battle's pair), INFO opens one. */}
              <LeadPicker
                value={lead}
                onChange={setLead}
                foe={foeTypes(data, enc)}
                go
                {...(double && { pair: { value: leads, onChange: setLeads } })}
              />
            </div>
          )}
        </div>

        <div
          className={cx('flex gap-2 border-t-[3px] p-3', dark ? 'border-shadow' : 'border-edge')}
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Primary
            variant="primary"
            size="lg"
            className="flex-1"
            autoFocus
            {...(pilot && { ms: PILOT_PICK_MS, hold: picked })}
            onClick={() => engage(!fight ? undefined : double ? pickedPair(leads) : (lead ?? defaultLead()))}
          >
            {fight && <PixelIcon name="sword" size={22} />}
            {enc.kind === 'trick' && <PixelIcon name="pumpkin" size={22} />}
            {enc.kind === 'gift' && <PixelIcon name="gift" size={22} />}
            {t(
              enc.kind === 'center' || enc.kind === 'casino'
                ? 'ui.enc.enter'
                : enc.kind === 'item'
                  ? 'ui.enc.pickUp'
                  : enc.kind === 'trick'
                    ? 'ui.trick.start'
                    : enc.kind === 'gift'
                      ? 'ui.giftCard.start'
                      : 'ui.enc.fight',
            )}
          </Primary>
          {skippable && (
            <PixelButton size="lg" className="flex-1" onClick={skipEncounter}>
              {fight && <PixelIcon name="run" size={20} />}
              {t(isPlayerFoe(enc) ? 'ui.areaVersus.skip' : enc.kind === 'trainer' ? 'ui.enc.avoid' : fight ? 'ui.enc.flee' : 'ui.enc.skip')}
              {data.config.skipPolicy === 'once' && !isPlayerFoe(enc) && <span className="text-base"> (1)</span>}
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
