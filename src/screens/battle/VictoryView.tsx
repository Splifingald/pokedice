// Result screens: victory (XP, level-ups, milestones, evolution, gauge, gold, catch), wipe and stalemate.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getInstance, instanceStats, progressOf, teamOf, type RunEvent } from '@/engine'
import { sfx } from '@/audio/sfx'
import { DiceSet } from '@/components/DiceSet'
import { Gauge } from '@/components/Gauge'
import { useCountUp } from '@/components/GoldPill'
import { PixelIcon } from '@/components/icons'
import { LeadPicker, defaultLead } from '@/components/LeadPicker'
import { MonCard, XpBar } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { StatChip } from '@/components/StatChip'
import { milestoneText, money, trainerTitle } from '@/lib/format'
import { BadgeIcon } from '@/components/BadgeIcon'
import { useGame } from '@/store/game'
import { afterStalemate, afterWipe, continueAfterVictory, enterArea, resolveCatch, trainerHasNext } from '@/store/run'
import { cx } from '@/theme/util'

function Overlay({ children, onAdvance }: { children: ReactNode; onAdvance?: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-ink/70 p-3 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className={cx('pixel-panel pixel-scroll my-4 w-full max-w-xl p-4', onAdvance && 'cursor-pointer')}
        initial={{ y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        onClick={onAdvance}
      >
        {children}
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

function EvolutionSequence({ uid, fromDex, toDex }: { uid: string; fromDex: number; toDex: number }) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const data = useGame((s) => s.data)
  const inst = useGame((s) => (s.save ? getInstance(s.save, uid) : undefined))
  const [stage, setStage] = useState(reduced ? 3 : 0)
  useEffect(() => {
    if (stage >= 3) return
    const t = setTimeout(() => setStage((s) => s + 1), [1000, 1400, 350][stage])
    return () => clearTimeout(t)
  }, [stage])
  useEffect(() => {
    if (stage === 3) sfx('levelup')
  }, [stage])
  const from = data.species[fromDex]?.name ?? '???'
  const to = data.species[toDex]?.name ?? '???'
  const stats = inst ? instanceStats(inst, data) : null
  return (
    <div className="flex flex-col items-center gap-2 border-[3px] border-ink bg-ink p-3 text-panel">
      <div className="relative" style={{ width: 144, height: 144 }}>
        {stage < 3 && (
          <motion.div
            className="absolute inset-0"
            animate={stage === 1 ? { opacity: [1, 0, 1, 0, 1, 0, 1, 0] } : { opacity: 1 }}
            transition={{ duration: 1.4 }}
          >
            <SpriteImg dex={fromDex} size={144} silhouette={stage >= 1} />
          </motion.div>
        )}
        {stage === 1 && (
          <motion.div className="absolute inset-0" animate={{ opacity: [0, 1, 0, 1, 0, 1, 0, 1] }} transition={{ duration: 1.4 }}>
            <SpriteImg dex={toDex} size={144} silhouette />
          </motion.div>
        )}
        {stage === 2 && <div className="absolute inset-0 bg-white" />}
        {stage === 3 && (
          <motion.div className="absolute inset-0" initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <SpriteImg dex={toDex} size={144} />
          </motion.div>
        )}
      </div>
      <div className="text-center text-2xl">{stage < 3 ? `What? ${from} is evolving!` : `${from} evolved into ${to}!`}</div>
      {stage === 3 && stats && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-lg">
          <DiceSet dice={stats.dice} size={24} />
          <StatChip stat="rerolls" value={stats.rerolls} />
          <StatChip stat="hp" value={`${inst!.currentHp}/${stats.maxHp}`} />
        </div>
      )}
    </div>
  )
}

function CatchCard({ uid, dex, level, joined, replacedLevel }: { uid: string; dex: number; level: number; joined: boolean; replacedLevel?: number }) {
  const name = useGame((s) => s.data.species[dex]?.name ?? '???')
  void uid
  return (
    <div className="flex items-center gap-3 border-[3px] border-ink bg-gold/40 p-2">
      <motion.div initial={{ rotate: -30, y: -20 }} animate={{ rotate: [0, -15, 15, -8, 0], y: 0 }} transition={{ duration: 0.9 }}>
        <PixelIcon name="ball" size={36} />
      </motion.div>
      <SpriteImg dex={dex} size={72} />
      <div>
        <div className="text-3xl leading-none">Gotcha!</div>
        <div className="text-xl">
          {name} (Lv.{level}) was caught!
        </div>
        <div className="text-lg">
          {replacedLevel != null
            ? `It replaces your Lv.${replacedLevel} ${name}.`
            : joined
              ? `${name} joined your team.`
              : 'Your team is full…'}
        </div>
      </div>
    </div>
  )
}

function TeamChoice() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const pending = useGame((s) => s.run.pendingCatchId)
  if (!save || !pending) return null
  const caught = getInstance(save, pending)
  if (!caught) return null
  const name = data.species[caught.dex]?.name
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="text-2xl">Add {name} to your team?</div>
      <div className="copy text-muted">Swap it in for one of your three — the one you replace goes to the Box.</div>
      {teamOf(save).map((p) => (
        <MonCard key={p.id} inst={p}>
          <PixelButton size="sm" onClick={() => resolveCatch(p.id)}>
            Swap out
          </PixelButton>
        </MonCard>
      ))}
      <PixelButton onClick={() => resolveCatch(null)}>Send {name} to the Box</PixelButton>
    </div>
  )
}

function useCards(events: RunEvent[]): { key: string; node: ReactNode; sound?: 'levelup' | 'catch' | 'gold' }[] {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const areas = data.areas
  return useMemo(() => {
    const out: { key: string; node: ReactNode; sound?: 'levelup' | 'catch' | 'gold' }[] = []
    events.forEach((e, i) => {
      const k = `${e.kind}-${i}`
      switch (e.kind) {
        case 'xp': {
          const inst = save ? getInstance(save, e.uid) : undefined
          if (!inst) return
          out.push({
            key: k,
            node: (
              <div className="flex items-center gap-2">
                <SpriteImg dex={inst.dex} size={48} />
                <div className="flex-1">
                  <div className="text-xl">
                    {data.species[inst.dex]?.name} gained <span className="border-b-[3px] border-type-water">{e.amount} XP</span>
                    {e.shared && <span className="text-base text-muted"> (Multi EXP)</span>}
                  </div>
                  <XpBar inst={inst} />
                </div>
              </div>
            ),
          })
          return
        }
        case 'level_up':
          out.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="flex items-center gap-2 text-2xl">
                <PixelIcon name="up" size={22} /> {data.species[e.dex]?.name} grew to <b>Lv.{e.level}</b>!
              </div>
            ),
          })
          return
        case 'milestone':
          out.push({
            key: k,
            node: (
              <div className="border-[3px] border-ink bg-gold px-3 py-1 text-center text-3xl shadow-hard-sm">
                {milestoneText(e.milestone, data.species[e.dex]?.type1 ?? 'normal')}
              </div>
            ),
          })
          return
        case 'evolve':
          out.push({ key: k, node: <EvolutionSequence uid={e.uid} fromDex={e.fromDex} toDex={e.toDex} /> })
          return
        case 'gauge':
          out.push({
            key: k,
            node: <Gauge value={e.xp} max={e.target} label={`+${e.amount}`} className="text-lg" />,
          })
          return
        case 'gold':
          out.push({ key: k, sound: 'gold', node: <GoldCard amount={e.amount} /> })
          return
        case 'caught':
          out.push({
            key: k,
            sound: 'catch',
            node: <CatchCard uid={e.uid} dex={e.dex} level={e.level} joined={e.joinedTeam} replacedLevel={e.replacedLevel} />,
          })
          return
        case 'fled':
          out.push({ key: k, node: <div className="text-center text-2xl text-muted">{data.species[e.dex]?.name} fled…</div> })
          return
        case 'boss_defeated':
          out.push({
            key: k,
            node: <div className="text-center text-2xl text-gold">The legendary {data.species[e.dex]?.name} was defeated!</div>,
          })
          return
        case 'gym_defeated':
          out.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="flex items-center justify-center gap-3 border-[3px] border-ink bg-gold p-2 text-center">
                {e.badge && <BadgeIcon badge={e.badge} earned size={40} />}
                <div>
                  <div className="text-3xl leading-none">
                    {e.role === 'champion' ? 'YOU ARE THE CHAMPION!' : e.role === 'elite' ? `${e.name} defeated!` : `${e.name} defeated!`}
                  </div>
                  {e.badge && <div className="text-xl">You earned the {e.badge}!</div>}
                </div>
              </div>
            ),
          })
          return
        case 'secret_unlocked': {
          const a = areas.find((x) => x.id === e.areaId)
          out.push({
            key: k,
            sound: 'catch',
            node: (
              <div className="pixel-panel-dark p-2 text-center">
                <div className="text-2xl text-gold">A secret area has appeared!</div>
                <div className="text-xl">{a?.name ?? '???'} is now on the Map.</div>
              </div>
            ),
          })
          return
        }
        case 'area_cleared': {
          const next = areas.find((a) => a.id === e.nextAreaId)
          out.push({
            key: k,
            sound: 'levelup',
            node: (
              <div className="border-[3px] border-ink bg-hp-green p-2 text-center">
                <div className="text-3xl">AREA CLEARED!</div>
                <div className="text-xl">{next ? `${next.name} is now open on the Map.` : 'Every area is cleared!'}</div>
              </div>
            ),
          })
          return
        }
      }
    })
    return out
  }, [events, data, save, areas])
}

export function VictoryView() {
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const cards = useCards(run.events)
  const [shown, setShown] = useState(reduced ? Number.MAX_SAFE_INTEGER : 1)
  const [lead, setLead] = useState<string | null>(null)
  const allShown = shown >= cards.length

  useEffect(() => {
    if (allShown) return
    const card = cards[shown]
    const isEvo = cards[shown - 1]?.key.startsWith('evolve')
    const t = setTimeout(() => {
      setShown((s) => s + 1)
      if (card?.sound) sfx(card.sound)
    }, isEvo ? 3000 : 650)
    return () => clearTimeout(t)
  }, [shown, allShown, cards])

  const enemy = battle?.state.enemy
  const hasNext = trainerHasNext()
  const enc = run.encounter
  const nextMon =
    hasNext && (enc?.kind === 'trainer' || enc?.kind === 'gym') && run.trainer ? enc.team[run.trainer.index + 1] : null
  const trainerLabel = enc?.kind === 'gym' || enc?.kind === 'trainer' ? trainerTitle(enc) : 'The trainer'
  // This fight cleared the area: offer the newly opened one straight away.
  const clearedTo = run.events.flatMap((e) => (e.kind === 'area_cleared' && e.nextAreaId ? [e.nextAreaId] : []))[0]
  const nextArea = clearedTo ? data.areas.find((a) => a.id === clearedTo) : undefined

  return (
    // Tap anywhere on the card to show the next reward right away.
    <Overlay onAdvance={allShown ? undefined : () => setShown((s) => s + 1)}>
      <div className="mb-3 text-center text-4xl leading-none">
        {battle?.state.kind === 'boss' ? 'LEGENDARY VICTORY!' : 'VICTORY!'}
      </div>
      {enemy && (
        <div className="mb-3 text-center text-xl text-muted">
          {enemy.name} Lv.{enemy.level} was defeated.
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        <AnimatePresence initial={!reduced}>
          {cards.slice(0, shown).map((c) => (
            <motion.div key={c.key} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              {c.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {!allShown && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-lg text-muted">Tap for the next one</span>
          <PixelButton
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setShown(Number.MAX_SAFE_INTEGER)
            }}
          >
            SKIP ▸▸
          </PixelButton>
        </div>
      )}
      {allShown && run.pendingCatchId && <TeamChoice />}
      {allShown && !run.pendingCatchId && (
        <div className="mt-4 flex flex-col gap-3">
          {hasNext && nextMon ? (
            <>
              <div className="text-center text-xl">
                {trainerLabel} is about to send out{' '}
                {data.species[nextMon.dex]?.name} (Lv.{nextMon.level}). Switch freely:
              </div>
              <LeadPicker value={lead} onChange={setLead} />
              <PixelButton variant="primary" size="lg" onClick={() => continueAfterVictory(lead ?? defaultLead())}>
                NEXT BATTLE
              </PixelButton>
            </>
          ) : nextArea ? (
            <div className="flex flex-col gap-2">
              <PixelButton
                variant="primary"
                size="lg"
                className="whitespace-nowrap"
                onClick={() => {
                  continueAfterVictory()
                  enterArea(nextArea.id)
                }}
              >
                <PixelIcon name="map" size={22} />
                GO TO NEW AREA
              </PixelButton>
              <PixelButton onClick={() => continueAfterVictory()}>
                STAY HERE
              </PixelButton>
            </div>
          ) : (
            <PixelButton variant="primary" size="lg" onClick={() => continueAfterVictory()}>
              CONTINUE
            </PixelButton>
          )}
        </div>
      )}
    </Overlay>
  )
}

export function WipeView() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const areaId = useGame((s) => s.run.areaId)
  const area = data.areas.find((a) => a.id === areaId)
  const p = save && areaId ? progressOf(save, areaId) : null
  const xp = p?.xp ?? 0
  const full = area?.xpToUnlockNext != null && xp >= area.xpToUnlockNext
  return (
    <Overlay>
      <div className="mb-2 text-center text-4xl">Your team fainted…</div>
      <p className="copy mb-3 text-lg">
        You hurried back to the start of {area?.name}. Your Pokémon have been fully healed, and you keep your Pokédollars,
        items and your Pokémon's levels.{' '}
        {full ? 'The round is lost, but your exploration stays complete.' : `The round is lost: exploration is back to ${xp}, where it stood when the round began.`}{' '}
        A new round starts with a freshly shuffled deck.
      </p>
      {area && <Gauge value={xp} max={area.xpToUnlockNext} className="mb-4" />}
      <PixelButton variant="primary" size="lg" className="w-full" onClick={afterWipe}>
        TRY AGAIN
      </PixelButton>
    </Overlay>
  )
}

export function StalemateView() {
  return (
    <Overlay>
      <div className="mb-2 text-center text-4xl">Stalemate</div>
      <p className="copy mb-4 text-lg">
        Neither side can land a single blow on the other, so the fight is called off. No rewards — but no harm done beyond
        the damage already taken.
      </p>
      <PixelButton variant="primary" size="lg" className="w-full" onClick={afterStalemate}>
        CONTINUE
      </PixelButton>
    </Overlay>
  )
}
