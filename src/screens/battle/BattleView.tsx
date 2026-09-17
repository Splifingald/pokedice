// The showpiece: drives the Phase 2 engine through the store and renders its log.
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  activeBattler,
  COMBO_NAMES,
  computeDamage,
  effectText,
  faceOf,
  hasStatus,
  statusesFromRoll,
  usableIn,
  type Battler,
  type Side,
} from '@/engine'
import { Die } from '@/components/Die'
import { HpBar } from '@/components/HpBar'
import { PixelIcon, STATUS_ICON } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { ParticleCanvas, type ParticleHandle } from '@/components/ParticleCanvas'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { TypeBadge } from '@/components/TypeBadge'
import { trainerTitle } from '@/lib/format'
import { useIsDesktop, useMediaQuery } from '@/lib/useMediaQuery'
import { useGame, type BattleSlice } from '@/store/game'
import { dispatchBattle } from '@/store/run'
import { cx, typeColor } from '@/theme/util'
import { useBattleAnimator } from './useBattleAnimator'
import { CatchView } from './CatchView'
import { VictoryView, WipeView, StalemateView } from './VictoryView'
import { BattleHistory, BattleHistoryList, DamageRecap } from './BattleHistory'

function BattlerPanel({
  b,
  hp,
  side,
  extra,
}: {
  b: Battler
  hp: number
  side: Side
  extra?: React.ReactNode
}) {
  return (
    <div className={cx('pixel-panel w-full max-w-[340px] p-1.5 sm:p-2', side === 'enemy' ? '' : 'ml-auto')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xl leading-none sm:text-2xl">{b.name}</span>
        <span className="shrink-0 text-lg leading-none sm:text-xl">Lv.{b.level}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {b.types.map((t) => (
          <TypeBadge key={t} type={t} size="sm" />
        ))}
        <StatusIcons status={b.status} />
      </div>
      <HpBar hp={hp} max={b.maxHp} className="mt-1.5" />
      {extra}
    </div>
  )
}

function useShake(ref: RefObject<HTMLElement>, shake: { id: number; power: number } | null, reduced: boolean) {
  useEffect(() => {
    if (!shake || reduced || !ref.current?.animate) return
    const p = shake.power
    ref.current.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-p}px, ${p / 3}px)` },
        { transform: `translate(${p}px, ${-p / 3}px)` },
        { transform: `translate(${-p * 0.6}px, 0)` },
        { transform: `translate(${p * 0.6}px, ${p / 4}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 360, easing: 'steps(6)' },
    )
  }, [shake?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}

const POP_COLOR = { super: '#e8b44a', weak: '#f7f2e0', immune: '#9c9caf', normal: '#f7f2e0', heal: '#4aa84a' }

function SpriteStage({
  dex,
  side,
  fainted,
  size,
  fx,
  anchorRef,
}: {
  dex: number
  side: Side
  fainted: boolean
  size: number
  fx: ReturnType<typeof useBattleAnimator>['fx']
  anchorRef: RefObject<HTMLDivElement>
}) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  return (
    <div ref={anchorRef} className="relative" style={{ width: size, height: size }}>
      {/* ground shadow */}
      <div
        className="absolute bottom-[6%] left-1/2 h-[14%] w-[70%] -translate-x-1/2 rounded-[50%] bg-ink/20"
        aria-hidden
      />
      <motion.div
        key={dex}
        initial={{ opacity: 0, x: side === 'enemy' ? 60 : -60 }}
        animate={fainted ? { opacity: 0, y: size * 0.4 } : { opacity: 1, x: 0, y: 0 }}
        transition={{ duration: fainted ? 0.7 : 0.45 }}
        className="absolute inset-0"
      >
        <SpriteImg dex={dex} size={size} back={side === 'player'} />
      </motion.div>
      <AnimatePresence>
        {fx.flash?.target === side && (
          <motion.div
            key={fx.flash.id}
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ mixBlendMode: 'screen' }}
          />
        )}
        {fx.status?.target === side && (
          <motion.div
            key={fx.status.id}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.1, 1], rotate: fx.status.status === 'confuse' ? 360 : 0 }}
            transition={{ duration: 0.85 }}
          >
            <PixelIcon name={STATUS_ICON[fx.status.status] ?? 'star'} size={size * 0.35} />
          </motion.div>
        )}
        {fx.pop?.target === side && (
          <motion.div
            key={fx.pop.id}
            className="pointer-events-none absolute left-1/2 top-[25%] -translate-x-1/2 font-pixel leading-none"
            initial={{ opacity: 0, y: 10, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [10, -20, -34, -48], scale: [0.4, 1.7, 1.2, 1] }}
            transition={{ duration: reduced ? 0 : 1.1 }}
            style={{
              fontSize: size * 0.28,
              color: POP_COLOR[fx.pop.tone],
              textShadow: '3px 3px 0 #2a2438, -2px -2px 0 #2a2438, 2px -2px 0 #2a2438, -2px 2px 0 #2a2438',
            }}
          >
            {fx.pop.tone === 'heal' ? '+' : fx.pop.amount === 0 ? '' : '−'}
            {fx.pop.amount}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function BattleView({ battle }: { battle: BattleSlice }) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const run = useGame((s) => s.run)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const desktop = useIsDesktop()
  const short = useMediaQuery('(max-height: 700px)')
  // Desktop screens under 1000px tall get a lower scene so the controls below stay in view.
  const roomy = useMediaQuery('(min-height: 1000px)')
  const st = battle.state
  const particles = useRef<ParticleHandle>(null)
  const scene = useRef<HTMLDivElement>(null)
  const enemyAnchor = useRef<HTMLDivElement>(null)
  const playerAnchor = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<null | 'item' | 'switch' | 'history'>(null)
  const [itemKey, setItemKey] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [intro, setIntro] = useState(st.kind === 'boss' && !reduced)

  const enc = run.encounter
  const isTrainerFight = enc?.kind === 'trainer' || enc?.kind === 'gym'
  const trainerName = isTrainerFight ? trainerTitle(enc) : null
  const onHit = useCallback((target: Side, color: string, power: number) => {
    const anchor = (target === 'enemy' ? enemyAnchor : playerAnchor).current
    const host = scene.current
    if (!anchor || !host) return
    const a = anchor.getBoundingClientRect()
    const h = host.getBoundingClientRect()
    particles.current?.burst(a.left - h.left + a.width / 2, a.top - h.top + a.height / 2, color, Math.round(40 * power + 20), power)
  }, [])

  const { fx, ready } = useBattleAnimator(battle, reduced, {
    kind: st.kind,
    trainerName,
    itemName: (k) => data.items[k]?.name ?? k,
    colorOf: (t) => data.diceTypes[t as keyof typeof data.diceTypes]?.color ?? typeColor(t),
    onHit,
  })
  useShake(scene, fx.shake, reduced)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    if (!intro) return
    const t = setTimeout(() => setIntro(false), 1900)
    return () => clearTimeout(t)
  }, [intro])

  // The enemy acts on its own once the log has caught up.
  useEffect(() => {
    if (!ready || intro || st.phase !== 'enemy_turn') return
    const t = setTimeout(() => dispatchBattle({ t: 'AI_TURN' }), reduced ? 0 : 450)
    return () => clearTimeout(t)
  }, [ready, intro, st.phase, reduced, battle.log.length])

  const active = st.player.find((p) => p.uid === fx.activeUid) ?? activeBattler(st)
  const canAct = ready && !intro && (st.phase === 'player_roll' || st.phase === 'player_reroll')
  const stunned = ready && !intro && st.phase === 'player_stunned'
  // One item per turn: before the roll, after it, or to cure a stun.
  const canItem = (canAct || stunned) && !st.itemUsedThisTurn
  const rolling = st.phase === 'player_reroll'

  const preview = useMemo(() => {
    if (!rolling || !st.dice.length) return null
    const a = activeBattler(st)
    const confused = a.status.confused
    const r = computeDamage(st.dice, a.types, confused ? a.types : st.enemy.types, st.playerLevels, data)
    const statuses = confused ? [] : statusesFromRoll(st.dice, data)
    return { r, statuses, confused }
  }, [rolling, st, data])

  const inventory = save?.inventory ?? {}
  const ownedItems = Object.entries(inventory).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'battle'))
  const itemHelps = (key: string, p: Battler) => {
    const fx = data.items[key]?.effect
    if (!fx || p.hp <= 0) return false
    if (fx.kind === 'heal') return p.hp < p.maxHp
    if (fx.kind === 'cure') return fx.statuses.some((k) => hasStatus(p.status, k))
    if (fx.kind === 'rerolls') return p.rerollsLeft < p.rerolls
    return false
  }
  const switchTargets = st.player.filter((p, i) => p.hp > 0 && i !== st.activeIndex)

  // Keyboard: 1..6 toggle, R reroll, Space roll/attack.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(canAct || stunned) || menu || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        dispatchBattle(stunned ? { t: 'PASS' } : st.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'ATTACK' })
      } else if (e.key.toLowerCase() === 'r' && rolling) dispatchBattle({ t: 'REROLL' })
      else if (/^[1-6]$/.test(e.key) && rolling) dispatchBattle({ t: 'TOGGLE_DIE', i: Number(e.key) - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAct, stunned, menu, rolling, st.phase])

  // Every turn starts with the throw, so the dice roll themselves (items, switching and running still work after it).
  useEffect(() => {
    if (!ready || intro || menu || st.phase !== 'player_roll') return
    const t = setTimeout(() => dispatchBattle({ t: 'ROLL' }), reduced ? 0 : 400)
    return () => clearTimeout(t)
  }, [ready, intro, menu, st.phase, reduced, battle.log.length])

  const usefulItems = ownedItems.filter(([k]) => st.player.some((p) => itemHelps(k, p)))
  const showItem = usefulItems.length > 0
  const showSwitch = data.config.allowVoluntarySwitch && switchTargets.length > 0

  // Stunned with no item that could help: nothing to do but lose the turn.
  const stunChoice = canItem && showItem
  useEffect(() => {
    if (!stunned || menu || stunChoice) return
    const t = setTimeout(() => dispatchBattle({ t: 'PASS' }), 900)
    return () => clearTimeout(t)
  }, [stunned, menu, stunChoice])

  // Short phones (≤ 700px tall) shrink the scene so the tray and controls still fit without scrolling.
  const enemySize = desktop ? (roomy ? 160 : 120) : short ? 84 : 112
  const playerSize = desktop ? (roomy ? 176 : 136) : short ? 96 : 128
  const mainSize = desktop ? 'lg' : 'md'
  const minorSize = desktop ? 'md' : 'sm'
  // Dice fill the tray: sized by how many are thrown (up to 64px), never under a 44px tap target.
  const diceCount = Math.max(1, active.dice.length, st.enemy.dice.length)
  const dieSize = desktop ? 64 : Math.max(44, Math.min(64, Math.floor((window.innerWidth - 56 - (diceCount - 1) * 8) / diceCount)))

  // Tray: animated roll while playing the log; the live, selectable roll once caught up.
  const tray =
    ready && rolling
      ? {
          side: 'player' as Side,
          dice: st.dice,
          keys: fx.tray?.side === 'player' && fx.tray.dice.length === st.dice.length ? fx.tray.keys : st.dice.map((_, i) => `s${i}`),
        }
      : fx.tray

  const trainerTeam = isTrainerFight ? enc.team : []
  const trainerLeft = isTrainerFight && run.trainer ? trainerTeam.length - run.trainer.index : 0
  const terminal = st.phase === 'won' || st.phase === 'lost' || st.phase === 'fled'

  return (
    <div className="relative mx-auto flex max-w-5xl flex-col gap-2 sm:gap-3">
      <h1 className="sr-only">
        Battle: {active.name} against {trainerName ? `${trainerName}'s ` : st.kind === 'wild' ? 'a wild ' : ''}
        {st.enemy.name}
      </h1>
      {/* Scene */}
      <div
        ref={scene}
        className="pixel-panel relative overflow-hidden p-0"
        style={{
          background: 'linear-gradient(#c6e7ef 0%, #e8f3df 48%, #cfe3a8 48%, #b8d68e 100%)',
          minHeight: desktop ? (roomy ? 300 : 240) : short ? 188 : 232,
        }}
      >
        <div className="absolute inset-0 scanlines" aria-hidden />
        {/* enemy row */}
        <div className={cx('relative flex items-start justify-between gap-2', short ? 'p-2' : 'p-3')}>
          <div className="z-10 w-[55%] sm:w-auto">
            <BattlerPanel
              b={st.enemy}
              hp={fx.hp[st.enemy.uid] ?? st.enemy.hp}
              side="enemy"
              extra={
                trainerLeft > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-sm">
                    {trainerTeam.map((_, i) => (
                        <PixelIcon key={i} name="ball" size={12} style={{ opacity: i < (run.trainer?.index ?? 0) ? 0.3 : 1 }} />
                      ))}
                  </div>
                )
              }
            />
          </div>
          <div className="relative mr-2 mt-2">
            <div
              className="absolute bottom-2 left-1/2 h-8 w-[110%] -translate-x-1/2 rounded-[50%] bg-[#a6c97a] shadow-[inset_0_-4px_0_#8fb35f]"
              aria-hidden
            />
            <SpriteStage dex={st.enemy.dex} side="enemy" fainted={!!fx.fainted[st.enemy.uid]} size={enemySize} fx={fx} anchorRef={enemyAnchor} />
          </div>
        </div>
        {/* player row */}
        <div className={cx('relative flex items-end justify-between gap-2', short ? 'px-2 pb-2' : 'px-3 pb-3')}>
          <div className="relative -mb-3 ml-1">
            <div
              className="absolute bottom-3 left-1/2 h-10 w-[115%] -translate-x-1/2 rounded-[50%] bg-[#a6c97a] shadow-[inset_0_-4px_0_#8fb35f]"
              aria-hidden
            />
            <SpriteStage dex={active.dex} side="player" fainted={!!fx.fainted[active.uid]} size={playerSize} fx={fx} anchorRef={playerAnchor} />
          </div>
          <div className="z-10 w-[55%] sm:w-auto">
            <BattlerPanel
              b={active}
              hp={fx.hp[active.uid] ?? active.hp}
              side="player"
              extra={
                <div className="mt-1 flex items-center justify-between text-base">
                  <span className="flex items-center gap-1">
                    <PixelIcon name="reroll" size={14} /> {active.rerollsLeft}/{active.rerolls} rerolls
                  </span>
                  <span className="flex gap-0.5">
                    {st.player.map((p) => (
                      <PixelIcon key={p.uid} name="ball" size={12} style={{ opacity: p.hp > 0 ? 1 : 0.3 }} />
                    ))}
                  </span>
                </div>
              }
            />
          </div>
        </div>

        <ParticleCanvas ref={particles} className="absolute inset-0 h-full w-full" />

        {/* Phones: no room under the battle, so the history opens in a sheet from here. */}
        {!desktop && (
          <button
            type="button"
            onClick={() => setMenu('history')}
            aria-label="Battle history"
            className="pixel-btn absolute left-2 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-panel/90"
          >
            <PixelIcon name="history" size={18} />
          </button>
        )}

        <AnimatePresence>
          {fx.banner && (
            <motion.div
              key={fx.banner.id}
              className="pointer-events-none absolute inset-x-0 top-[42%] z-20 flex justify-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.25, 1], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.2, times: [0, 0.2, 0.8, 1] }}
            >
              <span
                className={cx(
                  'border-[3px] border-ink px-4 py-1 text-3xl shadow-hard',
                  fx.banner.tone === 'super' && 'bg-gold text-ink',
                  fx.banner.tone === 'weak' && 'bg-shadow text-panel',
                  fx.banner.tone === 'immune' && 'bg-ink text-panel',
                  fx.banner.tone === 'info' && 'bg-panel text-ink',
                )}
              >
                {fx.banner.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {intro && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink text-panel"
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 1, 0] }}
            transition={{ duration: 1.9, times: [0, 0.8, 1] }}
          >
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 1.2 }}>
              <SpriteImg dex={st.enemy.dex} size={180} silhouette />
            </motion.div>
            <div className="text-xl tracking-[0.4em] text-gold">LEGENDARY</div>
            <div className="text-5xl">{st.enemy.name}</div>
            <div className="text-2xl">Lv.{st.enemy.level}</div>
          </motion.div>
        )}
      </div>

      {/* Message + tray */}
      <div
        className={cx(
          'pixel-dialogue flex flex-col gap-2',
          short ? 'p-2' : 'p-3',
          !desktop && 'sticky bottom-0 z-30',
        )}
        style={{ paddingBottom: desktop ? undefined : `calc(${short ? '0.5rem' : '0.75rem'} + env(safe-area-inset-bottom))` }}
      >
        <div className={cx('min-h-[1.6em] leading-tight', short ? 'text-xl' : 'text-2xl')} aria-live="polite">
          {fx.message}
        </div>

        <motion.div
          key={fx.fly ? `fly${fx.fly.id}` : 'tray'}
          className={cx('flex flex-wrap items-center justify-center gap-2 sm:gap-3', short ? 'min-h-[64px]' : 'min-h-[72px]')}
          initial={false}
          animate={fx.fly && !reduced ? { y: fx.fly.to === 'enemy' ? -140 : 60, opacity: 0, scale: 0.6 } : { y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeIn' }}
        >
          {tray?.dice.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <Die
                type={d.type}
                face={faceOf(d, data)}
                size={dieSize}
                rollKey={tray.keys[i]}
                delay={i * 0.06}
                selected={ready && rolling && !!st.selected[i]}
                onClick={canAct && rolling ? () => dispatchBattle({ t: 'TOGGLE_DIE', i }) : undefined}
                locked={tray.side === 'enemy'}
                asButton={tray.side === 'player'}
              />
              {desktop && ready && rolling && <span className="font-mono text-xs text-muted">{i + 1}</span>}
            </div>
          ))}
          {canAct && st.phase === 'player_roll' && <span className="text-xl text-muted">Rolling the dice…</span>}
          {tray?.side === 'enemy' && <span className="w-full text-center text-sm uppercase tracking-widest text-muted">enemy roll</span>}
        </motion.div>

        {/* Live combo readout */}
        {ready && preview && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xl">
            {preview.confused && <span className="text-danger">CONFUSED — this hit will strike {active.name}!</span>}
            <span className={preview.r.combo ? 'text-ink' : 'text-muted'}>
              {preview.r.combo ? `${COMBO_NAMES[preview.r.combo.key].toUpperCase()} — +${preview.r.combo.bonus}` : 'NO COMBO'}
            </span>
            <button
              type="button"
              aria-expanded={showBreakdown}
              aria-label={`${preview.r.final} damage — ${showBreakdown ? 'hide' : 'show'} details`}
              title="Damage — click for details"
              className={cx('inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-1 leading-none md:min-h-[32px]', short ? 'text-xl' : 'text-2xl')}
              onClick={() => setShowBreakdown((v) => !v)}
            >
              <PixelIcon name="sword" size={short ? 16 : 20} /> {preview.r.final}
            </button>
            {preview.statuses.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1 border-2 border-ink bg-panel px-1 text-base">
                <PixelIcon name={STATUS_ICON[s.status] ?? 'star'} size={12} />
                {s.status.toUpperCase()}
                {s.stacks && s.stacks > 1 ? ` ×${s.stacks}` : ''}
              </span>
            ))}
          </div>
        )}
        {ready && preview && showBreakdown && <DamageRecap result={preview.r} />}

        {/* Controls */}
        {stunned && (
          <PixelButton variant="primary" size={mainSize} className="self-center" onClick={() => dispatchBattle({ t: 'PASS' })}>
            SKIP TURN
          </PixelButton>
        )}
        {rolling && (
          <div className="grid w-full grid-cols-2 items-start gap-2 sm:mx-auto sm:max-w-md">
            <div className="flex flex-col gap-1">
              <PixelButton
                size={mainSize}
                // Icon + label must stay on one line in a half-width column on narrow phones.
                className="min-h-[48px] gap-1 whitespace-nowrap px-2 max-[400px]:text-xl"
                disabled={!canAct || active.rerollsLeft <= 0 || !st.selected.some(Boolean)}
                onClick={() => dispatchBattle({ t: 'REROLL' })}
                quiet
              >
                <PixelIcon name="reroll" size={18} /> REROLL ({active.rerollsLeft})
              </PixelButton>
              {active.rerollsLeft > 0 && (
                <span className={cx('text-center leading-tight text-muted', short ? 'whitespace-nowrap text-sm' : 'text-base')}>Select dice to reroll</span>
              )}
            </div>
            <PixelButton variant="primary" size={mainSize} className="min-h-[48px] gap-1 whitespace-nowrap px-2 max-[400px]:text-xl" disabled={!canAct} onClick={() => dispatchBattle({ t: 'ATTACK' })}>
              <PixelIcon name="sword" size={18} /> ATTACK
            </PixelButton>
          </div>
        )}
        {!terminal && (showItem || showSwitch || st.canRun) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {showItem && (
              <PixelButton
                size={minorSize}
                disabled={!canItem}
                title={st.itemUsedThisTurn ? 'One item per turn' : undefined}
                onClick={() => setMenu('item')}
              >
                <PixelIcon name="potion" size={14} /> ITEM
              </PixelButton>
            )}
            {showSwitch && (
              <PixelButton size={minorSize} disabled={!canAct} onClick={() => setMenu('switch')}>
                <PixelIcon name="ball" size={14} /> SWITCH
              </PixelButton>
            )}
            {st.canRun && (
              <PixelButton size={minorSize} variant="ghost" disabled={!canAct} onClick={() => dispatchBattle({ t: 'RUN' })}>
                <PixelIcon name="run" size={14} /> RUN
              </PixelButton>
            )}
          </div>
        )}
        {desktop && canAct && (
          <div className="text-center text-sm text-muted">Keys: 1–6 select · R reroll · Space {rolling ? 'attack' : 'roll'}</div>
        )}
      </div>

      {desktop && <BattleHistory battle={battle} cursor={fx.cursor} defaultOpen />}
      <Modal open={menu === 'history'} onClose={() => setMenu(null)} title="Battle history">
        <BattleHistoryList battle={battle} cursor={fx.cursor} />
      </Modal>

      {/* Forced switch after a faint (free) */}
      <Modal open={ready && st.phase === 'player_switch'} dismissable={false} title="Choose your next Pokémon">
        <div className="flex flex-col gap-2">
          {switchTargets.map((p) => (
            <SwitchRow key={p.uid} b={p} onPick={() => dispatchBattle({ t: 'SWITCH', instanceId: p.uid })} />
          ))}
        </div>
      </Modal>

      {/* Voluntary switch (costs the turn) */}
      <Modal open={menu === 'switch'} onClose={() => setMenu(null)} title="Switch (costs your turn)">
        <div className="flex flex-col gap-2">
          {switchTargets.map((p) => (
            <SwitchRow
              key={p.uid}
              b={p}
              onPick={() => {
                setMenu(null)
                dispatchBattle({ t: 'SWITCH', instanceId: p.uid })
              }}
            />
          ))}
        </div>
      </Modal>

      {/* Items: one per turn, the turn goes on */}
      <Modal
        open={menu === 'item'}
        onClose={() => {
          setMenu(null)
          setItemKey(null)
        }}
        title={itemKey ? `Use ${data.items[itemKey]?.name} on…` : 'Items (one per turn)'}
      >
        {!itemKey ? (
          <div className="flex flex-col gap-2">
            {ownedItems.map(([k, n]) => {
              const it = data.items[k]!
              const useful = st.player.some((p) => itemHelps(k, p))
              return (
                <PixelButton
                  key={k}
                  className="justify-between"
                  disabled={!useful}
                  onClick={() => {
                    // Ethers go to the Pokémon in battle; everything else asks who.
                    if (it.effect.kind === 'rerolls') {
                      dispatchBattle({ t: 'USE_ITEM', key: k, targetUid: activeBattler(st).uid })
                      setMenu(null)
                    } else setItemKey(k)
                  }}
                >
                  <span>
                    {it.name} <span className="text-base">({effectText(it)})</span>
                  </span>
                  <span className="font-mono text-base">×{n}</span>
                </PixelButton>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {st.player.map((p) => (
              <SwitchRow
                key={p.uid}
                b={p}
                disabled={!itemHelps(itemKey, p)}
                onPick={() => {
                  dispatchBattle({ t: 'USE_ITEM', key: itemKey, targetUid: p.uid })
                  setMenu(null)
                  setItemKey(null)
                }}
              />
            ))}
          </div>
        )}
      </Modal>

      {ready && run.phase === 'catch' && <CatchView />}
      {ready && run.phase === 'victory' && <VictoryView />}
      {ready && run.phase === 'wipe' && <WipeView />}
      {ready && run.phase === 'stalemate' && <StalemateView />}
    </div>
  )
}

function SwitchRow({ b, onPick, disabled }: { b: Battler; onPick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="pixel-panel flex w-full items-center gap-2 p-2 text-left enabled:hover:bg-white"
    >
      <SpriteImg dex={b.dex} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between text-xl leading-none">
          <span>{b.name}</span>
          <span>Lv.{b.level}</span>
        </div>
        <HpBar hp={b.hp} max={b.maxHp} height={8} className="mt-1" />
      </div>
    </button>
  )
}
