// The raid fight, full screen (docs/18 §3 "The battle", docs/19 §6.4): the classic battle layout — the raid Pokémon at
// the top right, the ally in front at the bottom left, with their plates — and whichever side plays steps to the front
// (the raid Pokémon strikes back at it right after). The other sides' Pokémon wait at the bottom left with their
// trainer's name. Under the stage: the message, the dice, your actions, then the Bag, your raid team (tap one on your
// turn to switch), the speed button and Give up; then the catch, and the result.
// The fight is the engine's (engine/raidBattle.ts); this screen only plays its log.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  comboDice,
  computeDamage,
  confusionRecoil,
  hasStatus,
  progressRaidOf,
  raidTeamCap,
  statusesFromRoll,
  sureThrow,
  usableIn,
  type Battler,
  type RaidEvent,
  type RaidNpcOption,
} from '@/engine'
import { playCry } from '@/audio/cries'
import { HpBar } from '@/components/HpBar'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { Sheet } from '@/components/Sheet'
import { MiniSprite } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { TypeBadge } from '@/components/TypeBadge'
import { pictureOf } from '@/fx/areaArt'
import { ballOfItem } from '@/fx/scenes'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { getLang } from '@/i18n'
import { useT } from '@/i18n/react'
import { effectText } from '@/i18n/text'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { PaceContext, RAID_FAST_SPEED } from '@/lib/pace'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { setSettings, useGame } from '@/store/game'
import {
  answerRaidBait,
  emptySlots,
  ensureNpcOffer,
  leaveRaid,
  raidAct,
  raidAgain,
  raidCatchShown,
  raidFightOver,
  raidIntroDone,
  throwRaidBall,
  useRaidRun,
  type RaidCatch,
  type RaidRun,
} from '@/store/raidBattle'
import { holdReload } from '@/store/sync'
import { cx } from '@/theme/util'
import {
  BagButton,
  DiceTray,
  Readout,
  SwitchRow,
  TeamPips,
  type Preview,
  type TrayDice,
} from '../battle/BattlePanel'
import { BattleStage, type StageOverlay } from '../battle/BattleStage'
import { CatchPanel, catchMessage } from '../battle/CatchPanel'
import { RaidIntro } from './RaidIntro'
import { RaidNpcPicker } from './RaidNpcPicker'
import { battlerOf, sideOfUid, useRaidAnimator, type RaidFx } from './raidAnimator'
import { TrainerName } from '@/components/TrainerName'

const BANNER_TONE = {
  super: 'bg-gold text-ink',
  weak: 'bg-paper text-ink',
  immune: 'bg-ink text-paper',
  info: 'bg-paper text-ink',
}

/** The raid Pokémon's plate: its bar, the colour of the next one under it, how many are left. */
function BossPlate({ b, hp, fx, bars, colors, aimed }: { b: Battler; hp: number; fx: RaidFx; bars: number; colors: string[]; aimed: boolean }) {
  const { t } = useT()
  // The last bar doesn't "break" in the log: the raid Pokémon is worn out instead.
  const left = fx.wornOut[b.uid] ? 0 : Math.max(0, bars - fx.broken)
  const color = colors[fx.broken % colors.length] ?? '#34c97a'
  const under = left > 1 ? (colors[(fx.broken + 1) % colors.length] ?? '#24304f') : '#24304f'
  const pct = Math.max(0, Math.min(1, hp / b.maxHp))
  return (
    <div
      role="group"
      aria-label={t('ui.raid.bossPlate', { name: b.name, level: t('ui.common.level.short', { n: b.level }), bars: left })}
      className={cx(
        'pixel-plate absolute left-1.5 top-1.5 grid w-[56%] gap-1 px-2 pb-[7px] pt-1.5 text-left',
        aimed && 'shadow-[inset_0_0_0_3px_#f2553f]',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <b className="min-w-0 truncate text-[20px] font-normal leading-none">{b.name}</b>
        {b.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
        <span className="shrink-0 font-pixel-sm text-[15px] leading-none">{t('ui.common.level.short', { n: b.level })}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {b.types.map((ty) => (
          <TypeBadge key={ty} type={ty} size="sm" />
        ))}
        <StatusIcons status={b.status} />
      </span>
      <span
        key={fx.barBreak?.id ?? 0}
        className={cx('rd-bar relative mt-1 block h-3', fx.barBreak && 'rd-bar-broke')}
        style={{ background: under } as CSSProperties}
        aria-hidden
      >
        <i
          className="absolute bottom-0.5 left-0.5 top-0.5 block transition-[width] duration-500"
          style={{ width: `calc(${pct * 100}% - ${pct * 4}px)`, background: `linear-gradient(#ffffff70 0 3px, transparent 3px), ${color}` }}
        />
        <b className="absolute -right-0.5 -top-[9px] bg-ink px-[5px] pb-px text-[15px] font-normal leading-none text-gold-pale">×{left}</b>
      </span>
    </div>
  )
}

/** The ally in front: its trainer, level, HP with numbers, statuses, and the side's three Poké Balls. */
function AllyPlate({
  b,
  hp,
  owner,
  rich,
  mine,
  team,
  fx,
}: {
  b: Battler
  hp: number
  owner: string
  /** The friend's golden name ("I am just rich", docs/25). */
  rich?: boolean
  mine: boolean
  team: Battler[]
  fx: RaidFx
}) {
  const { t } = useT()
  return (
    <div
      role="group"
      aria-label={t('ui.raid.allyPlate', { owner, name: b.name, level: t('ui.common.level.short', { n: b.level }) })}
      className="pixel-plate absolute bottom-1.5 right-1.5 grid w-[56%] gap-1 px-2 pb-[7px] pt-1.5 text-left"
    >
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={cx(
            'shrink-0 px-[5px] pb-px font-pixel-sm text-[12px] leading-tight',
            mine ? 'bg-crimson text-paper' : 'bg-[#dde5f0] text-ink',
            // The light chip keeps a golden name's daylight gold at dusk too.
            !mine && rich && 'light-scope',
          )}
        >
          {mine ? t('ui.raid.you') : <TrainerName name={owner} rich={rich} />}
        </span>
        <b className="min-w-0 truncate text-[18px] font-normal leading-none">{b.name}</b>
        <span className="ml-auto shrink-0 font-pixel-sm text-[15px] leading-none">{t('ui.common.level.short', { n: b.level })}</span>
      </span>
      <HpBar hp={hp} max={b.maxHp} compact height={8} />
      <span className="flex items-center gap-1.5">
        <span className="flex gap-0.5" aria-hidden>
          {team.map((m) => (
            <i
              key={m.uid}
              className={cx(
                'h-[7px] w-[7px] rounded-full shadow-[0_0_0_1px_#24304f]',
                (fx.hp[m.uid] ?? m.hp) > 0 ? 'bg-crimson' : 'bg-shadow',
              )}
            />
          ))}
        </span>
        <StatusIcons status={b.status} />
      </span>
    </div>
  )
}

/** Another side's Pokémon waiting at the side of the stage: its mini sprite and HP. */
function QueueMon({ b, hp, label }: { b: Battler; hp: number; label: string }) {
  const pct = Math.max(0, Math.min(1, hp / b.maxHp))
  return (
    <li>
      <span
        role="img"
        aria-label={label}
        title={label}
        className="relative grid w-[44px] justify-items-center gap-px bg-[#fbfdffe0] px-0.5 pb-[3px] pt-px shadow-[inset_0_0_0_2px_#24304f]"
      >
        <MiniSprite dex={b.dex} size={30} className="-my-1" />
        <span className="block h-[5px] w-[28px] bg-ink" aria-hidden>
          <span className="block h-full" style={{ width: `${pct * 100}%`, background: pct > 0.5 ? '#34c97a' : pct > 0.2 ? '#ffbe2e' : '#f2553f' }} />
        </span>
      </span>
    </li>
  )
}

/**
 * The speed button: the ally sides' turns at ×1 or ×1.5 (the raid Pokémon's and yours never change).
 * It shows the speed they play at, so the state is a word as well as a colour.
 */
export function RaidSpeedButton({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useT()
  const label = t('ui.raid.speed')
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className={cx(
        'grid min-h-[48px] min-w-[44px] place-items-center content-center gap-0.5 px-1 leading-none',
        on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-ring',
      )}
    >
      <PixelIcon name="fastForward" size={16} />
      <span className="font-pixel-sm text-[14px] tabular-nums">
        {t('ui.raid.speedTag', { n: (on ? RAID_FAST_SPEED : 1).toLocaleString(getLang()) })}
      </span>
    </button>
  )
}

export function RaidView({ run }: { run: RaidRun }) {
  const { t } = useT()
  useHoldFullscreen()
  // A pending reload (new build, Admin → "Reload all players") waits for the raid to end.
  useEffect(() => holdReload(), [])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config.events.raid
  const { level, calm } = useMotion()
  const quick = level === 'off'
  const fastOn = useGame((s) => !!s.settings.raidFast)
  const st = run.state
  const intro = run.stage === 'intro'
  const [menu, setMenu] = useState<null | 'item' | 'giveUp' | 'switch'>(null)
  const [itemKey, setItemKey] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const stageBox = useRef<HTMLDivElement>(null)

  const { fx, ready, sceneContact, sceneDone } = useRaidAnimator(
    run,
    quick,
    {
      kind: 'boss',
      trainerName: null,
      catchable: true,
      itemName: (k) => data.items[k]?.name ?? k,
      speciesName: (dex) => data.species[dex]?.name ?? `#${dex}`,
      megaMechanic: (dex) => data.species[dex]?.form?.mechanic ?? null,
      gmaxTurns: data.config.gigantamax.turns,
    },
    1,
    intro,
    fastOn ? RAID_FAST_SPEED : 1,
  )
  // The sped-up turns' HP bars, dice and sprites move as fast as their log.
  const pace = fastOn && fx.fast ? 1 / RAID_FAST_SPEED : 1

  // The stage shakes on a hit without a scene of its own (a bar breaking, a status tick).
  useEffect(() => {
    const el = stageBox.current
    const p = fx.shake?.power ?? 0
    if (!fx.shake || calm || !el?.animate) return
    el.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-p}px, ${p / 3}px)` },
        { transform: `translate(${p}px, ${-p / 3}px)` },
        { transform: `translate(${-p * 0.6}px, 0)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 360, easing: 'steps(6)' },
    )
  }, [fx.shake?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fx.cry) playCry(fx.cry.dex)
  }, [fx.cry?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!intro) playCry(st.boss.dex)
  }, [intro]) // eslint-disable-line react-hooks/exhaustive-deps

  const own = battlerOf(run, fx.activeUid) ?? st.sides[0]!.mons[0]!
  const foe = st.boss
  const ownSide = Math.max(0, sideOfUid(st.sides, own.uid))
  const art = useMemo(() => pictureOf(run.raid.areaId), [run.raid.areaId])

  // ---- Your turn.
  const duel = st.duel
  const myTurn = ready && !intro && st.phase === 'player' && !!duel
  const canAct = myTurn && (duel!.phase === 'player_roll' || duel!.phase === 'player_reroll')
  const stunned = myTurn && duel!.phase === 'player_stunned'
  const rolling = myTurn && duel!.phase === 'player_reroll'
  const canItem = (canAct || stunned) && !duel?.itemUsedThisTurn
  const act = (e: RaidEvent) => raidAct(e)
  const mine = duel ? duel.player[duel.activeIndex]! : null

  // The dice roll themselves as your turn starts, as in a battle.
  useEffect(() => {
    if (!myTurn || menu || duel?.phase !== 'player_roll') return
    const timer = setTimeout(() => act({ t: 'ROLL' }), quick ? 0 : 400)
    return () => clearTimeout(timer)
  }, [myTurn, menu, duel?.phase, quick])

  // The fight has played out: the catch, or the result.
  useEffect(() => {
    if (!ready || intro || run.stage !== 'fight') return
    if (st.phase !== 'won' && st.phase !== 'lost') return
    const timer = setTimeout(raidFightOver, quick ? 0 : 500)
    return () => clearTimeout(timer)
  }, [ready, intro, run.stage, st.phase, quick])

  const preview = useMemo<Preview | null>(() => {
    if (!rolling || !duel || !mine || !duel.dice.length) return null
    const r = computeDamage(duel.dice, mine.types, duel.enemy.types, duel.playerLevels, data)
    return { r, statuses: statusesFromRoll(duel.dice, data), almost: [], recoil: mine.status.confused ? confusionRecoil(mine.maxHp, data) : 0 }
  }, [rolling, duel, mine, data])
  const ring = useMemo(
    () => (preview?.r.combo ? new Set(comboDice(preview.r.perDie.map((p) => p.value), preview.r.combo.key)) : new Set<number>()),
    [preview],
  )
  const tray: TrayDice | null =
    rolling && duel
      ? {
          side: 'player',
          dice: duel.dice,
          keys: fx.tray?.side === 'player' && fx.tray.dice.length === duel.dice.length ? fx.tray.keys : duel.dice.map((_, i) => `s${i}`),
        }
      : fx.tray

  // ---- Items: one a turn, on your side.
  const inventory = save?.inventory ?? {}
  const ownedItems = Object.entries(inventory).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'battle'))
  const team = duel?.player ?? st.sides[0]!.mons
  const itemHelps = (key: string, p: Battler) => {
    const e = data.items[key]?.effect
    if (!e) return false
    if (e.kind === 'revive') return p.hp <= 0
    if (p.hp <= 0) return false
    if (e.kind === 'heal') return p.hp < p.maxHp
    if (e.kind === 'cure') return e.statuses.some((k) => hasStatus(p.status, k))
    if (e.kind === 'rerolls') return p.rerollsLeft < p.rerolls
    return false
  }
  const usefulItems = ownedItems.filter(([k]) => team.some((p) => itemHelps(k, p)))
  // Your raid team at the bottom, as the log has played: tap one on your turn to switch (it costs the turn).
  const showSwitch = data.config.allowVoluntarySwitch
  const switchTargets = duel ? duel.player.filter((p, i) => p.hp > 0 && i !== duel.activeIndex) : []
  // Stunned with nothing to cure it: the turn goes.
  useEffect(() => {
    if (!stunned || menu || (canItem && usefulItems.length > 0)) return
    const timer = setTimeout(() => act({ t: 'PASS' }), 900)
    return () => clearTimeout(timer)
  }, [stunned, menu, canItem, usefulItems.length])

  // ---- The catch.
  const catching = run.stage === 'catch' && !!run.catch
  const [thrown, setThrown] = useState<StageOverlay | null>(null)
  // Back on a throw already made (the Bait's question): its result shows at once, with its buttons.
  const [revealed, setRevealed] = useState(() => !!useRaidRun.getState().run?.catch?.result)
  const catchState = run.catch
    ? {
        dex: run.raid.dex,
        level: run.state.boss.level,
        shiny: run.raid.shiny,
        kind: 'boss' as const,
        target: { mode: 'new' as const },
        result: run.catch!.result ? { ...run.catch!.result, events: [], pendingCatchId: null } : null,
      }
    : null
  // A throw a Bait could still save stops with the ball on the ground while the panel asks (docs/25); the answer
  // plays on from that frame. Raids have no Capture Luck.
  // A throw that couldn't miss has no suspense to build: its result at once.
  const catchScene = (r: NonNullable<RaidCatch['result']>, from?: 'ground'): StageOverlay => ({
    instant: sureThrow(r),
    timeline: catchTimeline({
      own: spriteKey(own.dex, true, own.shiny),
      foe: spriteKey(st.boss.dex, false, st.boss.shiny),
      ball: ballOfItem(r.ballKey),
      caught: r.caught,
      short: level === 'short',
      hold: !!r.baitOffer,
      from,
      bait: r.baited === 'used',
      instant: sureThrow(r),
    }),
    ready: Promise.all([loadSprite(own.dex, true, own.shiny), loadSprite(st.boss.dex, false, st.boss.shiny)]),
    label:
      r.baited === 'used'
        ? t('ui.catch.baitThrown', { name: st.boss.name })
        : t('ui.catch.throwing', { ball: data.items[r.ballKey ?? 'poke-ball']?.name ?? t('ui.catch.aBall') }),
    hud: { catchResult: () => setRevealed(true) },
    onEnd: () => setRevealed(true),
  })
  const onThrow = (ballKey: string | null) => {
    throwRaidBall(ballKey)
    const r = useRaidRun.getState().run?.catch?.result
    if (!r) return
    setRevealed(false)
    setThrown(catchScene(r))
  }
  const onBait = (use: boolean) => {
    answerRaidBait(use)
    const r = useRaidRun.getState().run?.catch?.result
    if (!r || r.baitOffer) return
    setRevealed(false)
    setThrown(catchScene(r, 'ground'))
  }

  // ---- The other sides, waiting beside the ally in front.
  const alliesWaiting = fx.sideActive
    .map((uid, i) => ({ uid, i }))
    .filter(({ uid, i }) => uid !== fx.activeUid && !fx.out[i])

  const message = catchState ? catchMessage(catchState, st.boss.name, { revealed: revealed || run.stage === 'result' }) : fx.message
  const heading = t('ui.raid.heading', { name: st.boss.name })

  const stage = (
    <div ref={stageBox} className="shadow-ledge">
      <BattleStage
        own={own}
        foe={foe}
        fx={fx}
        art={art}
        ownShown={!intro}
        foeShown={!intro}
        trainer={null}
        overlay={thrown}
        worn={catching && !thrown}
        onContact={sceneContact}
        onSceneDone={sceneDone}
        tapLabel={(b) => t('ui.types.tap', { name: b.name })}
        label={heading}
      >
        {!intro && !thrown && (
          <>
            <BossPlate b={foe} hp={fx.hp[foe.uid] ?? foe.hp} fx={fx} bars={st.bars} colors={cfg.barColors} aimed={myTurn} />
            <AllyPlate
              b={own}
              hp={fx.hp[own.uid] ?? own.hp}
              owner={st.sides[ownSide]?.owner ?? ''}
              rich={run.friends.some((f) => f.rich && f.userId === st.sides[ownSide]?.userId)}
              mine={ownSide === 0}
              team={st.sides[ownSide]?.mons ?? []}
              fx={fx}
            />
            {alliesWaiting.length > 0 && (
              <ol aria-label={t('ui.raid.alliesQueue')} className="absolute bottom-[4%] left-[2%] z-[2] m-0 flex list-none gap-[3px] p-0">
                {alliesWaiting.map(({ uid, i }) => {
                  const b = battlerOf(run, uid)
                  if (!b) return null
                  return <QueueMon key={uid} b={b} hp={fx.hp[uid] ?? b.hp} label={t('ui.raid.allyOf', { owner: st.sides[i]!.owner, name: b.name })} />
                })}
              </ol>
            )}
          </>
        )}
        <AnimatePresence>
          {fx.banner && (
            <motion.div
              key={fx.banner.id}
              className="pointer-events-none absolute inset-x-0 top-[38%] z-[4] flex justify-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.2, 1], opacity: [0, 1, 1, 0] }}
              transition={{ duration: (quick ? 0.6 : 1.2) * pace, times: [0, 0.2, 0.8, 1] }}
            >
              <span className={cx('px-3 pb-1 pt-0.5 text-[22px] leading-none shadow-ring', BANNER_TONE[fx.banner.tone])}>{fx.banner.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {fx.barBreak && !calm && <Shards key={fx.barBreak.id} color={cfg.barColors[(fx.broken - 1 + cfg.barColors.length) % cfg.barColors.length] ?? '#34c97a'} />}
      </BattleStage>
    </div>
  )

  let actions: ReactNode = null
  if (stunned)
    actions = (
      <PixelButton variant="primary" size="lg" className="w-full" onClick={() => act({ t: 'PASS' })}>
        {t('ui.battle.skipTurn')}
      </PixelButton>
    )
  else if (rolling && mine)
    actions = (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
        <PixelButton
          size="lg"
          className="whitespace-nowrap px-2"
          disabled={!canAct || mine.rerollsLeft <= 0 || !duel!.selected.some(Boolean)}
          title={t('ui.battle.selectDice')}
          onClick={() => act({ t: 'REROLL' })}
        >
          {t('ui.battle.reroll', { left: mine.rerollsLeft })}
        </PixelButton>
        <PixelButton variant="primary" size="lg" className="whitespace-nowrap px-2" disabled={!canAct} onClick={() => act({ t: 'ATTACK' })}>
          {t('ui.battle.attack')}
        </PixelButton>
      </div>
    )

  return (
    <PaceContext.Provider value={pace}>
      <section aria-label={heading} className="mx-auto flex min-h-[100dvh] w-full max-w-[max(300px,min(560px,calc((100dvh_-_330px)_*_1.5)))] flex-col">
        <h1 className="sr-only">{heading}</h1>
        {stage}
        <div className="flex flex-1 flex-col gap-2 px-3 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <p className="pixel-dialogue m-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]" aria-live="polite">
            {message}
          </p>
          {run.stage === 'result' ? (
            <RaidResult run={run} />
          ) : catching && catchState ? (
            <CatchPanel c={catchState} onThrow={onThrow} revealed={revealed} onContinue={raidCatchShown} onBait={onBait} />
          ) : (
            <>
              <DiceTray
                tray={tray}
                live={rolling}
                selected={duel?.selected ?? []}
                combo={ring}
                onToggle={canAct && rolling ? (i) => act({ t: 'TOGGLE_DIE', i }) : undefined}
                size={48}
                foeName={foe.name}
              />
              <div className="flex min-h-[30px] flex-wrap items-center justify-center gap-x-2 gap-y-1" aria-live="polite">
                {preview && mine && (
                  <Readout preview={preview} activeName={mine.name} open={showBreakdown} onToggle={() => setShowBreakdown((v) => !v)} />
                )}
              </div>
              <div className="min-h-[56px]">{actions}</div>
              <div className="mt-auto flex items-center gap-2">
                {ownedItems.length > 0 && (
                  <BagButton
                    disabled={!canItem || usefulItems.length === 0}
                    title={duel?.itemUsedThisTurn ? t('ui.battle.oneItemPerTurn') : undefined}
                    onClick={() => setMenu('item')}
                  />
                )}
                <TeamPips
                  compact
                  team={st.sides[0]!.mons}
                  activeUid={fx.sideActive[0] ?? st.sides[0]!.mons[0]!.uid}
                  hpOf={(b) => fx.hp[b.uid] ?? b.hp}
                  canSwitch={canAct && showSwitch}
                  calling={false}
                  onPick={() => setMenu('switch')}
                />
                <div className="ml-auto flex items-center gap-1.5">
                  <RaidSpeedButton on={fastOn} onChange={(on) => setSettings({ raidFast: on })} />
                  <button
                    type="button"
                    onClick={() => setMenu('giveUp')}
                    aria-label={t('ui.raid.giveUp')}
                    title={t('ui.raid.giveUp')}
                    className="grid min-h-[48px] min-w-[44px] place-items-center bg-paper shadow-ring"
                  >
                    <PixelIcon name="flag" size={20} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {intro && <RaidIntro run={run} onDone={raidIntroDone} />}

      <Modal open={menu === 'giveUp'} onClose={() => setMenu(null)} title={t('ui.raid.giveUpTitle')}>
        <div className="grid gap-3">
          <p className="copy m-0 text-lg">{t('ui.raid.giveUpBody')}</p>
          <div className="grid grid-cols-2 gap-2">
            <PixelButton size="lg" onClick={() => setMenu(null)}>
              {t('ui.raid.keepFighting')}
            </PixelButton>
            <PixelButton
              variant="primary"
              size="lg"
              onClick={() => {
                setMenu(null)
                if (st.phase === 'player') act({ t: 'FORFEIT' })
                else leaveRaid()
              }}
            >
              {t('ui.raid.giveUp')}
            </PixelButton>
          </div>
        </div>
      </Modal>

      {/* Switching in: it costs your turn, as in a battle. */}
      <Modal open={menu === 'switch'} onClose={() => setMenu(null)} title={t('ui.battle.switchCosts')}>
        <div className="flex flex-col gap-2">
          {switchTargets.length === 0 && <p className="copy text-lg text-muted">{t('ui.battle.noSwitch')}</p>}
          {switchTargets.map((p) => (
            <SwitchRow
              key={p.uid}
              b={p}
              disabled={!canAct}
              onPick={() => {
                setMenu(null)
                act({ t: 'SWITCH', instanceId: p.uid })
              }}
            />
          ))}
        </div>
      </Modal>

      {/* The Bag: one item a turn, on your side, and the turn goes on. */}
      <Sheet
        open={menu === 'item'}
        onClose={() => {
          setMenu(null)
          setItemKey(null)
        }}
        title={itemKey ? t('ui.battle.useItemOn', { item: data.items[itemKey]?.name ?? itemKey }) : t('ui.battle.itemsTitle')}
      >
        {!itemKey ? (
          <div className="flex flex-col gap-2">
            {ownedItems.map(([k, n]) => {
              const it = data.items[k]!
              const useful = team.some((p) => itemHelps(k, p))
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!useful}
                  onClick={() => {
                    if (it.effect.kind === 'rerolls' && mine) {
                      act({ t: 'USE_ITEM', key: k, targetUid: mine.uid })
                      setMenu(null)
                    } else setItemKey(k)
                  }}
                  className="flex min-h-[56px] w-full items-center gap-2 bg-paper px-2 py-1 text-left shadow-card disabled:opacity-50"
                >
                  <ItemSprite item={it} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[20px] leading-none">{it.name}</span>
                    <span className="font-pixel-sm text-[15px] leading-tight text-muted">{effectText(it)}</span>
                  </span>
                  <span className="font-pixel-sm text-[16px] tabular-nums">×{n}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {team.map((p) => (
              <button
                key={p.uid}
                type="button"
                disabled={!itemHelps(itemKey, p)}
                onClick={() => {
                  act({ t: 'USE_ITEM', key: itemKey, targetUid: p.uid })
                  setMenu(null)
                  setItemKey(null)
                }}
                className="pixel-panel flex w-full items-center gap-2 p-2 text-left enabled:hover:bg-paper disabled:opacity-50"
              >
                <MiniSprite dex={p.dex} size={40} className="-my-2" />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between text-xl leading-none">
                    {p.name}
                    <span>{t('ui.common.level.short', { n: p.level })}</span>
                  </span>
                  <HpBar hp={p.hp} max={p.maxHp} height={8} className="mt-1" />
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </PaceContext.Provider>
  )
}

/** Bar shards flying off the boss's plate when a bar breaks. */
function Shards({ color }: { color: string }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        dx: `${Math.round(Math.cos((i / 14) * Math.PI * 2) * (40 + (i % 3) * 18))}px`,
        dy: `${Math.round(Math.sin((i / 14) * Math.PI * 2) * (26 + (i % 4) * 10) + 20)}px`,
        r: `${(i * 47) % 360}deg`,
      })),
    [],
  )
  return (
    <span className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <i
          key={i}
          className="rd-shard absolute left-[24%] top-[14%] h-[5px] w-2"
          style={{ background: color, '--dx': b.dx, '--dy': b.dy, '--r': b.r } as CSSProperties}
        />
      ))}
    </span>
  )
}

/** The end of a try: caught (and where it went), fled, or lost. Another try asks for NPC partners again (a new four). */
function RaidResult({ run }: { run: RaidRun }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const [offer, setOffer] = useState<RaidNpcOption[] | null>(null)
  const need = emptySlots(run.friends)
  const cap =
    run.source.kind === 'progress' ? raidTeamCap(data, progressRaidOf(data, run.source.key)?.dex ?? run.raid.dex, 'progress', run.raid.areaId) : data.config.events.raid.teamCap
  const again = (npcs: RaidNpcOption[] = []) => {
    setOffer(null)
    if (!raidAgain(npcs)) leaveRaid()
  }
  const name = run.state.boss.name
  const result = run.catch?.result
  const regionName = (id?: string) => data.regions.find((r) => r.id === id)?.name ?? ''
  // A progression raid has no midnight: it stays open until caught, and its catch closes it for good.
  const k = run.source.kind === 'progress' ? 'ui.raid.progress.result' : 'ui.raid.result'
  if (result?.caught)
    return (
      <div className="grid gap-2.5 bg-paper p-3 shadow-card" role="status">
        <h2 className="m-0 text-[28px] font-normal leading-none">{t('ui.raid.result.caught', { name })}</h2>
        <p className="copy m-0 text-lg">
          {run.catch?.locked
            ? t('ui.raid.result.locked', {
                name,
                area: data.areas.find((x) => x.id === run.raid.areaId)?.name ?? '',
                region: regionName(run.catch?.region),
              })
            : run.catch?.live
              ? t(`${k}.here`, { name })
              : t(`${k}.sent`, { name, region: regionName(run.catch?.region) })}
        </p>
        <PixelButton variant="primary" size="lg" className="w-full" onClick={leaveRaid}>
          {t('ui.raid.back')}
        </PixelButton>
      </div>
    )
  const fled = !!result && !result.caught
  return (
    <div className="grid gap-2.5 bg-paper p-3 shadow-card" role="status">
      <h2 className="m-0 text-[28px] font-normal leading-none">{t(fled ? 'ui.raid.result.fledTitle' : 'ui.raid.result.lostTitle', { name })}</h2>
      <p className="copy m-0 text-lg">{t(fled ? `${k}.fled` : `${k}.lost`, { name })}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
        <PixelButton size="lg" onClick={leaveRaid}>
          {t('ui.raid.back')}
        </PixelButton>
        <PixelButton variant="primary" size="lg" onClick={() => (need ? setOffer(ensureNpcOffer(run.source)) : again())}>
          {t('ui.raid.again')}
        </PixelButton>
      </div>
      {offer && save && (
        <RaidNpcPicker
          open
          offer={offer}
          need={need}
          group={[
            { name: t('ui.raid.you'), look: avatarOf(playerAvatarId(save.player)).src },
            ...run.friends.map((f) => ({ name: f.name, look: avatarOf(f.avatar).src })),
          ]}
          level={cap}
          onBack={() => setOffer(null)}
          onStart={again}
        />
      )}
    </div>
  )
}
