// Result screens: victory (XP, level-ups, milestones, gold, catch, then evolutions), wipe and stalemate.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getInstance, instanceStats, progressOf, teamOf, type DieType, type Milestone, type RunEvent } from '@/engine'
import { sfx } from '@/audio/sfx'
import { EvolutionQueue, type EvolutionShow } from '@/components/Evolution'
import { RoundsCounter } from '@/components/RoundsCounter'
import { useCountUp } from '@/components/GoldPill'
import { PixelIcon } from '@/components/icons'
import { LeadPicker, defaultLead } from '@/components/LeadPicker'
import { ForfeitButton } from '@/components/ForfeitButton'
import { speciesTypes } from '@/components/TypeMatchups'
import { HpBar } from '@/components/HpBar'
import { XpBar } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { milestoneText, money, trainerTitle, typeName } from '@/lib/format'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { usePace } from '@/lib/pace'
import { BadgeIcon } from '@/components/BadgeIcon'
import { Confetti } from '@/components/Confetti'
import { useGame } from '@/store/game'
import { afterStalemate, afterWipe, continueAfterVictory, enterArea, resolveCatch, trainerHasNext } from '@/store/run'
import { cx, shade, typeColor } from '@/theme/util'

/**
 * A result card over the battle. On phones it takes the screen: the content scrolls and the `footer` (the action
 * button) stays pinned at the bottom of the card, so it's never below the fold.
 */
function Overlay({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-ink/70 p-2 sm:items-center sm:p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="pixel-panel flex max-h-full w-full max-w-xl flex-col sm:max-h-[90vh]"
        initial={{ y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
      >
        <div className="pixel-scroll min-h-0 flex-1 overflow-auto p-3 sm:p-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t-[3px] border-ink bg-parchment p-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function GoldCard({ amount }: { amount: number }) {
  const n = useCountUp(amount, 800)
  return (
    <div className="flex items-center gap-2 text-3xl text-ink">
      <PixelIcon name="coin" size={28} /> +{money(n)}
    </div>
  )
}

function CatchCard({ uid, dex, level, joined, replacedLevel }: { uid: string; dex: number; level: number; joined: boolean; replacedLevel?: number }) {
  const { t } = useT()
  const name = useGame((s) => s.data.species[dex]?.name) ?? t('ui.common.unknown')
  const shiny = useGame((s) => !!s.save?.box.find((p) => p.id === uid)?.shiny)
  return (
    <div className="flex items-center gap-3 border-[3px] border-ink bg-gold/40 p-2">
      <motion.div initial={{ rotate: -30, y: -20 }} animate={{ rotate: [0, -15, 15, -8, 0], y: 0 }} transition={{ duration: 0.9 }}>
        <PixelIcon name="ball" size={36} />
      </motion.div>
      <SpriteImg dex={dex} size={72} shiny={shiny} />
      <div>
        <div className="text-3xl leading-none">{t('ui.victory.gotcha')}</div>
        <div className="text-xl">
          {t('ui.victory.wasCaught', { shiny: shiny ? t('ui.victory.shinyPrefix') : '', name, level })}
        </div>
        <div className="text-lg">
          {replacedLevel != null
            ? t('ui.victory.replacesYours', { level: replacedLevel, name })
            : joined
              ? t('ui.victory.joinedTeam', { name })
              : t('ui.victory.teamFull')}
        </div>
      </div>
    </div>
  )
}

/**
 * "Add X to your team?" — the three team members side by side; tapping one swaps it out. Saying nothing is an answer
 * too: CONTINUE (the footer) sends the catch to the Box.
 */
function TeamChoice() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const pending = useGame((s) => s.run.pendingCatchId)
  if (!save || !pending) return null
  const caught = getInstance(save, pending)
  if (!caught) return null
  const name = data.species[caught.dex]?.name
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="text-2xl">{t('ui.victory.addToTeam', { name: name ?? '' })}</div>
      <ul className="grid grid-cols-3 gap-2">
        {teamOf(save).map((p) => {
          const species = data.species[p.dex]
          const stats = instanceStats(p, data)
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => resolveCatch(p.id)}
                className="pixel-btn flex w-full flex-col items-center gap-0.5 bg-panel px-1 pb-1.5 pt-1 text-center"
                aria-label={t('ui.victory.swapOutFor', { name: species?.name ?? '', level: p.level, newName: name ?? '' })}
              >
                <MiniSprite dex={p.dex} size={40} className="-my-1" />
                <span className="w-full truncate text-lg leading-none">{species?.name}</span>
                <span className="text-base leading-none text-muted">{t('ui.common.level.short', { n: p.level })}</span>
                <HpBar hp={p.currentHp} max={stats.maxHp} className="w-full" height={6} />
                <span className="text-base leading-none">{t('ui.victory.swapOut')}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The Pokémon a victory touched, in order: XP, level-ups, milestones and a pending evolution, one entry each. */
interface MonRecap {
  uid: string
  /** The form it fought as (an evolution plays after the recap). */
  dex: number
  xp: number
  shared: boolean
  fromLevel: number | null
  toLevel: number | null
  milestones: Extract<RunEvent, { kind: 'milestone' }>['milestone'][]
  evolvesTo: number | null
}

type Extra = { key: string; node: ReactNode; sound?: 'levelup' | 'catch' | 'gold' }

function useRecap(events: RunEvent[]): { mons: MonRecap[]; extras: Extra[]; evolutions: EvolutionShow[] } {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  return useMemo(() => {
    const byUid = new Map<string, MonRecap>()
    // The form it fought as: the first level-up / milestone / evolution names it; before that, its current form.
    const named = new Set<string>()
    const mon = (uid: string, dex?: number) => {
      let m = byUid.get(uid)
      if (!m) {
        const now = save ? getInstance(save, uid)?.dex : undefined
        m = { uid, dex: dex ?? now ?? 0, xp: 0, shared: false, fromLevel: null, toLevel: null, milestones: [], evolvesTo: null }
        byUid.set(uid, m)
      }
      if (dex != null && !named.has(uid)) {
        m.dex = dex
        named.add(uid)
      }
      return m
    }
    const extras: Extra[] = []
    const evolutions: EvolutionShow[] = []
    events.forEach((e, i) => {
      const k = `${e.kind}-${i}`
      switch (e.kind) {
        case 'xp': {
          const m = mon(e.uid)
          m.xp += e.amount
          m.shared ||= !!e.shared
          return
        }
        case 'level_up': {
          const m = mon(e.uid, e.dex)
          m.fromLevel ??= e.level - 1
          m.toLevel = e.level
          return
        }
        case 'milestone': {
          const m = mon(e.uid, e.dex)
          m.milestones.push(e.milestone)
          return
        }
        case 'evolve': {
          const m = mon(e.uid, e.fromDex)
          m.evolvesTo = e.toDex
          evolutions.push({ uid: e.uid, fromDex: e.fromDex, toDex: e.toDex })
          return
        }
        case 'gold':
          extras.push({ key: k, sound: 'gold', node: <GoldCard amount={e.amount} /> })
          return
        case 'caught':
          extras.push({
            key: k,
            sound: 'catch',
            node: <CatchCard uid={e.uid} dex={e.dex} level={e.level} joined={e.joinedTeam} replacedLevel={e.replacedLevel} />,
          })
          return
        case 'fled':
          extras.push({
            key: k,
            node: (
              <div className="text-center text-xl text-muted">
                {t('ui.victory.fled', { name: data.species[e.dex]?.name ?? t('ui.common.unknown') })}
              </div>
            ),
          })
          return
        case 'boss_defeated':
          extras.push({
            key: k,
            node: (
              <div className="text-center text-xl text-gold">
                {t('ui.victory.bossDefeated', { name: data.species[e.dex]?.name ?? t('ui.common.unknown') })}
              </div>
            ),
          })
          return
        case 'gym_defeated':
          extras.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="flex items-center justify-center gap-3 border-[3px] border-ink bg-gold p-2 text-center">
                {e.badge && <BadgeIcon badge={e.badge} earned size={36} />}
                <div>
                  <div className="text-2xl leading-none">
                    {e.role === 'champion' ? t('ui.victory.champion') : t('ui.victory.trainerDefeated', { name: e.name })}
                  </div>
                  {e.badge && <div className="text-lg">{t('ui.victory.earnedBadge', { badge: e.badge })}</div>}
                </div>
              </div>
            ),
          })
          return
        case 'secret_unlocked': {
          const a = data.areas.find((x) => x.id === e.areaId)
          extras.push({
            key: k,
            sound: 'catch',
            node: (
              <div className="pixel-panel-dark p-2 text-center">
                <div className="text-xl text-gold">{t('ui.victory.secretArea')}</div>
                <div className="text-lg">{t('ui.victory.secretOnMap', { name: a?.name ?? t('ui.common.unknown') })}</div>
              </div>
            ),
          })
          return
        }
        case 'area_cleared': {
          const next = data.areas.find((a) => a.id === e.nextAreaId)
          extras.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="border-[3px] border-ink bg-hp-green p-2 text-center">
                <div className="text-2xl">{t('ui.victory.areaCleared')}</div>
                <div className="text-lg">
                  {next ? t('ui.victory.nextOpen', { name: next.name }) : t('ui.victory.allCleared')}
                </div>
              </div>
            ),
          })
          return
        }
      }
    })
    return { mons: [...byUid.values()].filter((m) => m.dex), extras, evolutions }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, data])
}

/** A blank die in its type's colour, small enough to sit in a chip (the colour is the type; a number would confuse). */
function DieChip({ type }: { type: DieType }) {
  const bg = typeColor(type)
  return (
    <span
      className="die-mini inline-block shrink-0 align-middle"
      style={{ width: 20, height: 20, background: `linear-gradient(135deg, ${shade(bg, 1.08)} 0%, ${bg} 55%, ${shade(bg, 0.88)} 100%)` }}
      role="img"
      aria-label={t('ui.victory.dieChip', { type: typeName(type) })}
      title={t('ui.victory.dieChip', { type: typeName(type) })}
    />
  )
}

/** What a milestone gives, as icons: a die gained or swapped, a reroll, HP. */
function MilestoneChip({ m, type1 }: { m: Milestone; type1: DieType }) {
  const to = m.dieType ?? type1
  const from = m.effect === 'UPGRADE_DIE' ? 'base' : (m.fromDieType ?? 'base')
  const body =
    m.effect === 'ADD_DIE' ? (
      <>
        <span aria-hidden>+</span>
        <DieChip type={to} />
      </>
    ) : m.effect === 'UPGRADE_DIE' || m.effect === 'REPLACE_DIE' ? (
      <>
        <DieChip type={from} />
        <span aria-hidden>→</span>
        <DieChip type={to} />
      </>
    ) : m.effect === 'ADD_REROLL' ? (
      <>
        <span aria-hidden>+{(m.amount ?? 1) > 1 ? m.amount : ''}</span>
        <PixelIcon name="reroll" size={20} />
      </>
    ) : (
      <>
        <span aria-hidden>+{m.amount ?? 0}</span>
        <PixelIcon name="heart" size={18} />
      </>
    )
  return (
    <span
      className="inline-flex items-center gap-1 border-2 border-ink bg-gold px-1.5 py-0.5 text-xl leading-none"
      aria-label={milestoneText(m, type1)}
      title={milestoneText(m, type1)}
    >
      {body}
    </span>
  )
}

/**
 * One Pokémon: sprite, name, level and XP on one line (with its XP bar), and one line below for what it earned —
 * a level-up (the sprite pulses, confetti flies), new dice and milestones, an evolution to come.
 */
function MonRow({ m }: { m: MonRecap }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, m.uid) : undefined))
  const reduced = useGame((s) => s.settings.reducedMotion)
  const species = data.species[m.dex]
  if (!species) return null
  const leveled = m.toLevel != null
  const level = inst?.level ?? m.toLevel ?? 0
  const type1 = species.type1
  const chips: ReactNode[] = []
  if (leveled)
    chips.push(
      <span
        key="lv"
        className="inline-flex items-center gap-1 border-2 border-ink bg-hp-green px-1.5 py-0.5 text-xl leading-none text-ink"
        aria-label={t('ui.victory.levelUp', { level: m.toLevel ?? 0 })}
      >
        <PixelIcon name="up" size={18} />
        {t('ui.common.level.short', { n: m.toLevel ?? 0 })}
      </span>,
    )
  // The evolution milestone is the scene that follows the recap, not a chip.
  m.milestones.filter((ms) => ms.effect !== 'EVOLVE').forEach((ms, i) => chips.push(<MilestoneChip key={`m${i}`} m={ms} type1={type1} />))
  if (m.evolvesTo != null)
    chips.push(
      <span key="evo" className="border-2 border-ink bg-ink px-1.5 py-0.5 text-lg leading-none text-panel">
        {t('ui.victory.evolvingInto', { name: data.species[m.evolvesTo]?.name ?? t('ui.common.unknown') })}
      </span>,
    )
  return (
    <div className={cx('border-[3px] border-ink p-2', leveled ? 'bg-gold/25' : 'bg-panel')}>
      <div className="flex items-center gap-2">
        <motion.span
          className="relative shrink-0"
          initial={false}
          animate={leveled && !reduced ? { scale: [1, 1.4, 1, 1.3, 1], x: [0, -3, 3, -2, 2, 0], rotate: [0, -4, 4, -3, 0] } : undefined}
          transition={{ duration: 1, delay: 0.15 }}
        >
          <MiniSprite dex={m.dex} size={40} className="-my-2" />
          {leveled && <Confetti />}
        </motion.span>
        <span className="min-w-0 truncate text-xl leading-none">{species.name}</span>
        <span className="shrink-0 text-lg leading-none">{t('ui.common.level.short', { n: level })}</span>
        <span className="ml-auto shrink-0 text-lg leading-none">
          {t('ui.victory.xpGain', { amount: m.xp })}
          {m.shared && <span className="text-sm text-muted">{t('ui.victory.multi')}</span>}
        </span>
      </div>
      {inst && <XpBar inst={inst} className="mt-1" />}
      {chips.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{chips}</div>}
    </div>
  )
}

/**
 * The rewards after a K.O. Built for phones: the recap scrolls, the action button never does (it sits at the bottom of
 * the card). One row per Pokémon with its celebrations under it; then gold, catches, badges. Evolutions play after
 * CONTINUE, one after another, and only then does the game move on.
 */
export function VictoryView() {
  const { t } = useT()
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const { mons, extras, evolutions } = useRecap(run.events)
  const pace = usePace()
  const total = mons.length + extras.length
  const [shown, setShown] = useState(reduced ? Number.MAX_SAFE_INTEGER : 1)
  const [lead, setLead] = useState<string | null>(null)
  // The action picked on the recap waits for the evolutions to play.
  const [then, setThen] = useState<(() => void) | null>(null)
  const allShown = shown >= total

  useEffect(() => {
    if (allShown) return
    const t = setTimeout(() => {
      setShown((s) => s + 1)
      const next = shown < mons.length ? mons[shown] : extras[shown - mons.length]
      const sound = next && 'uid' in next ? (next.toLevel != null ? 'levelup' : undefined) : next?.sound
      if (sound) sfx(sound)
    }, 650 * pace)
    return () => clearTimeout(t)
  }, [shown, allShown, mons, extras, pace])
  // The first row's level-up sound (it appears without waiting).
  useEffect(() => {
    if (mons[0]?.toLevel != null) sfx('levelup')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // CONTINUE answers a pending "add to your team?" by sending the catch to the Box, then plays any evolution.
  const go = (action: () => void) => () => {
    if (useGame.getState().run.pendingCatchId) resolveCatch(null)
    if (evolutions.length) setThen(() => action)
    else action()
  }

  const enemy = battle?.state.enemy
  // Between a trainer's Pokémon, the one that just fought stays selected unless the player picks another.
  const fought = battle ? battle.state.player[battle.state.activeIndex] : undefined
  const stillIn = fought && fought.hp > 0 ? fought.uid : undefined
  const hasNext = trainerHasNext()
  const enc = run.encounter
  const nextMon =
    hasNext && (enc?.kind === 'trainer' || enc?.kind === 'gym') && run.trainer ? enc.team[run.trainer.index + 1] : null
  const trainerLabel = enc?.kind === 'gym' || enc?.kind === 'trainer' ? trainerTitle(enc) : t('ui.log.theTrainer')
  // This fight cleared the area: offer the newly opened one straight away.
  const clearedTo = run.events.flatMap((e) => (e.kind === 'area_cleared' && e.nextAreaId ? [e.nextAreaId] : []))[0]
  const nextArea = clearedTo ? data.areas.find((a) => a.id === clearedTo) : undefined

  if (then) return <EvolutionQueue items={evolutions} onDone={then} />

  const footer = !allShown ? (
    <PixelButton variant="primary" size="lg" className="w-full" onClick={() => setShown(Number.MAX_SAFE_INTEGER)}>
      {t('ui.victory.skip')}
    </PixelButton>
  ) : hasNext && nextMon ? (
    <PixelButton variant="primary" size="lg" className="w-full" onClick={go(() => continueAfterVictory(lead ?? stillIn ?? defaultLead()))}>
      {t('ui.victory.nextBattle')}
    </PixelButton>
  ) : nextArea ? (
    // A new area just opened: travelling there is the green offer, above the usual (yellow) CONTINUE.
    <div className="flex flex-col gap-2">
      <PixelButton
        variant="success"
        size="lg"
        className="w-full whitespace-nowrap"
        aria-label={t('ui.victory.goToArea', { name: nextArea.name })}
        onClick={go(() => {
          continueAfterVictory()
          enterArea(nextArea.id)
        })}
      >
        <PixelIcon name="map" size={20} />
        {t('ui.victory.goToNewArea')}
      </PixelButton>
      <PixelButton variant="primary" size="lg" className="w-full" onClick={go(() => continueAfterVictory())}>
        {t('ui.common.continue')}
      </PixelButton>
    </div>
  ) : (
    <PixelButton variant="primary" size="lg" className="w-full" onClick={go(() => continueAfterVictory())}>
      {t('ui.common.continue')}
    </PixelButton>
  )

  return (
    <Overlay footer={footer}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-3xl leading-none">
          {t(battle?.state.kind === 'boss' ? 'ui.victory.legendaryVictory' : 'ui.victory.victory')}
        </div>
        {enemy && (
          <div className="min-w-0 truncate text-lg text-muted">
            {t('ui.victory.foeDefeated', { name: enemy.name, level: enemy.level })}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <AnimatePresence initial={!reduced}>
          {mons.slice(0, shown).map((m) => (
            <motion.div key={m.uid} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <MonRow m={m} />
            </motion.div>
          ))}
          {extras.slice(0, Math.max(0, shown - mons.length)).map((c) => (
            <motion.div key={c.key} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              {c.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {allShown && run.pendingCatchId && <TeamChoice />}
      {allShown && !run.pendingCatchId && hasNext && nextMon && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <motion.div className="shrink-0" initial={reduced ? false : { x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
              <TrainerSprite src={enc?.kind === 'trainer' || enc?.kind === 'gym' ? enc.spriteUrl : null} size={72} />
            </motion.div>
            <div className="text-lg leading-tight">
              {t('ui.victory.aboutToSend', {
                trainer: trainerLabel,
                name: data.species[nextMon.dex]?.name ?? t('ui.common.unknown'),
                level: nextMon.level,
              })}
            </div>
          </div>
          <LeadPicker value={lead ?? stillIn ?? null} onChange={setLead} foe={speciesTypes(data, nextMon.dex)} />
          <ForfeitButton />
        </div>
      )}
    </Overlay>
  )
}

export function WipeView() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const areaId = useGame((s) => s.run.areaId)
  const area = data.areas.find((a) => a.id === areaId)
  const p = save && areaId ? progressOf(save, areaId) : null
  const done = p?.roundsDone ?? 0
  return (
    <Overlay
      footer={
        <PixelButton variant="primary" size="lg" className="w-full" onClick={afterWipe}>
          {t('ui.wipe.tryAgain')}
        </PixelButton>
      }
    >
      <div className="mb-2 text-center text-4xl">{t('ui.wipe.title')}</div>
      <p className="copy mb-3 text-lg">
        {t('ui.wipe.body', { area: area?.name ?? '', kept: done > 0 ? t('ui.wipe.keptRounds') : '' })}
      </p>
      {area && p && <RoundsCounter area={area} progress={p} />}
    </Overlay>
  )
}

export function StalemateView() {
  const { t } = useT()
  return (
    <Overlay
      footer={
        <PixelButton variant="primary" size="lg" className="w-full" onClick={afterStalemate}>
          {t('ui.common.continue')}
        </PixelButton>
      }
    >
      <div className="mb-2 text-center text-4xl">{t('ui.stalemate.title')}</div>
      <p className="copy text-lg">{t('ui.stalemate.body')}</p>
    </Overlay>
  )
}
