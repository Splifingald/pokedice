import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  dayCareOf,
  dayCareXp,
  depositError,
  isDayCareOpen,
  nextDayCareTick,
  residentNow,
  type DayCareResident,
  type Hatch,
  type Pickup,
} from '@/engine'
import { sfx } from '@/audio/sfx'
import { Modal } from '@/components/Modal'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { hatchDayCareEgg, leaveAtDayCare, pickUpFromDayCare, visitDayCare } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

// 12×14 pixel Egg: k outline, w shell, s shade, g spots.
const EGG = [
  '....kkkk....',
  '...kwwwwk...',
  '..kwwggwwk..',
  '.kwwgggwwwk.',
  '.kwwwggwwwk.',
  'kwwwwwwwggwk',
  'kwggwwwwggwk',
  'kwgggwwwwwsk',
  'kwwggwwwwwsk',
  'kwwwwwwgwwsk',
  '.kwwwwwggssk',
  '.kswwwwwsssk',
  '..kssssssk..',
  '...kkkkkk...',
]
const EGG_COLORS: Record<string, string> = { k: '#2a2438', w: '#f7f2e0', s: '#d8cfb4', g: '#4aa84a' }

export function EggSprite({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * EGG.length) / EGG[0]!.length}
      viewBox={`0 0 ${EGG[0]!.length} ${EGG.length}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {EGG.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={EGG_COLORS[ch]} />
          ),
        ),
      )}
    </svg>
  )
}

const minutes = (ms: number) => {
  const m = Math.ceil(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

/** Re-render every 20 s so levels and countdowns stay current. */
function useNow(ms = 20_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function ResidentCard({ res, now, onPickUp }: { res: DayCareResident; now: number; onPickUp: () => void }) {
  const data = useGame((s) => s.data)
  const cfg = data.config.dayCare
  const grown = residentNow(res, now, data)
  const xp = dayCareXp(res, now, data)
  const next = nextDayCareTick(res, now, data)
  const species = data.species[res.inst.dex]
  const gained = grown.level - res.inst.level
  return (
    <div className="pixel-panel flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <SpriteImg
          dex={res.inst.dex}
          size={80}
          shiny={res.inst.shiny}
          className="border-[3px] border-ink bg-parchment"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-3xl leading-none">{species?.name ?? '???'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xl">
            <span>Lv.{res.inst.level}</span>
            {gained > 0 && (
              <>
                <span aria-hidden>→</span>
                <span className="border-2 border-ink bg-gold px-1 leading-none">Lv.{grown.level}</span>
                <span className="text-good">+{gained}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-base">
          <span>Day Care XP</span>
          <span className="font-mono">
            {xp}/{cfg.maxXp}
          </span>
        </div>
        <div className="h-3 border-2 border-ink bg-panel" role="img" aria-label={`${xp} of ${cfg.maxXp} XP`}>
          <div
            className="h-full bg-hp-green"
            style={{ width: `${Math.min(100, (xp / Math.max(1, cfg.maxXp)) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-base text-muted">
          {next == null
            ? 'Full: it has learned all it can here. Pick it up!'
            : `+${cfg.xpPerTick} XP in ${minutes(next)}`}
        </p>
      </div>
      <PixelButton variant="primary" onClick={onPickUp}>
        TAKE BACK
      </PixelButton>
    </div>
  )
}

/** Choose who stays: team first, then the Box. The last team member can't be left. */
function DepositModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const mons = [...save.box].sort((a, b) => {
    const ta = save.team.indexOf(a.id)
    const tb = save.team.indexOf(b.id)
    return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb) || a.dex - b.dex || b.level - a.level
  })
  return (
    <Modal open={open} onClose={onClose} title="Leave which Pokémon?" className="max-w-2xl">
      <p className="mb-2 text-lg text-muted">
        It leaves your team and Box while it trains: +{data.config.dayCare.xpPerTick} XP every{' '}
        {data.config.dayCare.tickMinutes} min, up to {data.config.dayCare.maxXp} XP.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {mons.map((p) => {
          const why = depositError(save, p.id, data)
          return (
            <li key={p.id}>
              <MonCard
                inst={p}
                disabled={!!why}
                onClick={() => {
                  if (leaveAtDayCare(p.id)) onClose()
                }}
                badge={
                  save.team.includes(p.id) ? (
                    <span className="border-2 border-ink px-1 text-sm">TEAM</span>
                  ) : null
                }
              >
                {why === 'last' && <span className="text-sm text-muted">your last team member</span>}
              </MonCard>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

function HatchModal({ hatch, onClose }: { hatch: Hatch | null; onClose: () => void }) {
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!hatch) return
    setOpen(reduced)
    if (reduced) return
    const t = setTimeout(() => {
      setOpen(true)
      sfx('catch')
    }, 1600)
    return () => clearTimeout(t)
  }, [hatch, reduced])
  const sp = hatch ? data.species[hatch.inst.dex] : undefined
  return (
    <Modal open={!!hatch} onClose={open ? onClose : undefined} dismissable={open} label="Egg hatching">
      {hatch && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {/* The Egg and the hatchling share one spot: a quick crossfade, no wait between them. */}
          <div className="relative h-40 w-40">
            <AnimatePresence>
              {!open ? (
                <motion.div
                  key="egg"
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{ rotate: [0, -12, 12, -12, 12, 0] }}
                  transition={{ duration: 0.8, repeat: 1 }}
                  exit={{ scale: 1.5, opacity: 0, transition: { duration: 0.2 } }}
                >
                  <EggSprite size={96} />
                </motion.div>
              ) : (
                <motion.div
                  key="mon"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                >
                  <SpriteImg dex={hatch.inst.dex} size={144} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-3xl leading-tight" aria-live="polite">
            {open ? `${sp?.name ?? 'A Pokémon'} hatched from the Egg!` : 'Oh? The Egg is moving!'}
          </p>
          {open && sp && (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xl">
                <span>Lv.{hatch.inst.level}</span>
                <TypeBadge type={sp.type1} />
                {sp.type2 && <TypeBadge type={sp.type2} />}
                {hatch.isNew && <span className="border-2 border-ink bg-gold px-1.5 leading-tight">NEW</span>}
              </div>
              <p className="text-lg text-muted">
                {hatch.joinedTeam ? 'It joined your team.' : 'Your team is full: it went to the Box.'}
              </p>
              <PixelButton variant="primary" onClick={onClose}>
                OK
              </PixelButton>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

/** The Pokémon Day Care: two Pokémon train on their own (real time), and Eggs hatch on the spot. */
export function DayCareScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const now = useNow()
  const [depositing, setDepositing] = useState(false)
  const [hatch, setHatch] = useState<Hatch | null>(null)
  const [pickup, setPickup] = useState<Pickup | null>(null)
  const open = !!save && isDayCareOpen(save, data)
  useEffect(() => {
    if (open) visitDayCare()
  }, [open])
  if (!save) return <Navigate to="/" replace />
  if (!isDayCareOpen(save, data)) return <Navigate to="/map" replace />
  const cfg = data.config.dayCare
  const dc = dayCareOf(save)
  const free = !dc.eggClaimed
  const canBuy = save.gold >= cfg.eggPrice

  const takeEgg = () => {
    const res = hatchDayCareEgg(free)
    if (res) setHatch(res)
  }
  const pickUp = (uid: string) => {
    const res = pickUpFromDayCare(uid)
    if (res) {
      sfx(res.levelsGained > 0 ? 'levelup' : 'button')
      setPickup(res)
    }
  }
  const picked = pickup ? data.species[pickup.inst.dex]?.name : null
  const eggPanel = (
    <section
      className={cx(
        'flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:text-left',
        free ? 'pixel-panel-dark' : 'pixel-panel',
      )}
      aria-label="Eggs"
    >
      <motion.div
        animate={free ? { rotate: [0, -8, 8, 0] } : {}}
        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.6 }}
      >
        <EggSprite size={72} />
      </motion.div>
      <div className="flex flex-1 flex-col gap-1">
        <h2 className={cx('text-3xl leading-none', free && 'text-gold')}>
          {free ? 'An Egg for you!' : 'Eggs'}
        </h2>
        <p className="text-lg">
          {free
            ? "The Day Care couple found an Egg. They'd like you to have it — it's about to hatch!"
            : `An Egg hatches straight away into a young Pokémon, often one you don't have yet. ₽${cfg.eggPrice} each.`}
        </p>
      </div>
      <PixelButton variant="primary" size="lg" disabled={!free && !canBuy} onClick={takeEgg}>
        {free ? 'TAKE THE EGG' : `BUY · ₽${cfg.eggPrice}`}
      </PixelButton>
    </section>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-5xl leading-none">Pokémon Day Care</h1>
        <PixelButton size="sm" onClick={() => navigate('/map')}>
          ◀ MAP
        </PixelButton>
      </div>
      <p className="copy text-muted">
        Leave up to {cfg.slots} Pokémon here: they gain {cfg.xpPerTick} XP every {cfg.tickMinutes} minutes,
        even while you're away, up to {cfg.maxXp} XP a stay. They level up here but only evolve once back in
        battle.
      </p>

      {free && eggPanel}
      <section className="flex flex-col gap-2" aria-label="Pokémon staying">
        <h2 className="text-3xl">
          Staying ({dc.residents.length}/{cfg.slots})
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {dc.residents.map((r) => (
            <ResidentCard key={r.inst.id} res={r} now={now} onPickUp={() => pickUp(r.inst.id)} />
          ))}
          {Array.from({ length: Math.max(0, cfg.slots - dc.residents.length) }, (_, i) => (
            <button
              key={`empty-${i}`}
              type="button"
              onClick={() => setDepositing(true)}
              className="flex min-h-[120px] flex-col items-center justify-center gap-1 border-[3px] border-dashed border-shadow text-2xl text-muted hover:bg-panel"
            >
              <span aria-hidden className="text-4xl leading-none">
                +
              </span>
              Leave a Pokémon
            </button>
          ))}
        </div>
      </section>

      {!free && eggPanel}

      <DepositModal open={depositing} onClose={() => setDepositing(false)} />
      <HatchModal hatch={hatch} onClose={() => setHatch(null)} />
      <Modal open={!!pickup} onClose={() => setPickup(null)} title={picked ? `${picked} is back!` : ''}>
        {pickup && (
          <div className="flex flex-col items-center gap-2 text-center">
            <SpriteImg dex={pickup.inst.dex} size={112} />
            <p className="text-xl">
              {pickup.levelsGained > 0
                ? `It gained ${pickup.xpGained} XP and grew ${pickup.levelsGained} level${pickup.levelsGained > 1 ? 's' : ''}, to Lv.${pickup.inst.level}.`
                : `It gained ${pickup.xpGained} XP.`}{' '}
              {pickup.joinedTeam ? 'It rejoined your team.' : 'Your team is full: it went to the Box.'}
            </p>
            <PixelButton variant="primary" onClick={() => setPickup(null)}>
              OK
            </PixelButton>
          </div>
        )}
      </Modal>
    </div>
  )
}
