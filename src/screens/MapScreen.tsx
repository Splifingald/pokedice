import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  badgeCase,
  conditionStatus,
  dayCareOf,
  dayCareXp,
  isDayCareOpen,
  isAreaUnlocked,
  linearAreas,
  progressOf,
  trainerSpecialty,
  type Area,
} from '@/engine'
import { AreaTypes } from '@/components/AreaTypes'
import { BadgeIcon } from '@/components/BadgeIcon'
import { Gauge } from '@/components/Gauge'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { useGame } from '@/store/game'
import { enterArea } from '@/store/run'
import { cx } from '@/theme/util'
import { AreaBanner } from '@/components/AreaBanner'
import { EggSprite } from './DayCareScreen'

/** How many areas of the main chain the map shows by default, from the one you're working on. */
const WINDOW = 3

function GymRow({ area }: { area: Area }) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  if (!area.gyms.length) return null
  const p = progressOf(save, area.id)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-base">
      {area.gyms.map((id) => {
        const t = data.trainers[id]
        if (!t) return null
        const beaten = p.gymsDefeated.includes(id)
        const type = trainerSpecialty(t, data)
        return (
          <span key={id} className={cx('flex items-center gap-1 border-2 border-ink px-1', beaten ? 'bg-hp-green/30' : 'bg-panel')}>
            {t.spriteUrl && <img src={t.spriteUrl} alt="" width={20} height={20} style={{ imageRendering: 'pixelated' }} />}
            <span>{t.role === 'leader' ? `Gym: ${t.name}` : t.name}</span>
            {type && <TypeBadge type={type} size="sm" />}
            {beaten && <PixelIcon name="check" size={12} title="beaten" />}
          </span>
        )
      })}
    </div>
  )
}

function AreaCard({ area, index, prevName, delay = 0 }: { area: Area; index: number | string; prevName?: string; delay?: number }) {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const runArea = useGame((s) => s.run.areaId)
  const navigate = useNavigate()
  const unlocked = isAreaUnlocked(save, area.id, data)
  const p = progressOf(save, area.id)
  const current = save.currentAreaId === area.id
  const bosses = area.legendaryBoss ?? []
  const species = [...new Set(area.wildPool.filter((w) => w.weight > 0).map((w) => w.dex))]
  const caught = species.filter((d) => save.pokedex.includes(d)).length
  const complete = species.length > 0 && caught === species.length
  const exploring = runArea === area.id
  return (
    <motion.li
      className={cx(
        'pixel-panel overflow-hidden p-0',
        !unlocked && 'grayscale',
        complete && 'outline outline-[3px] outline-offset-2 outline-hp-green',
      )}
      // Slide in from a visible start: a fade from 0 left cards half-drawn (and failing contrast) for a moment.
      initial={{ x: -16 }}
      animate={{ x: 0 }}
      transition={{ delay }}
    >
      <div className="relative">
        {area.bannerUrl && (
          <AreaBanner url={area.bannerUrl} className={cx('h-20 sm:h-28', !unlocked && 'opacity-40')} />
        )}
        <span className="absolute left-2 top-2 border-2 border-ink bg-panel px-2 text-xl leading-tight">{index}</span>
        <AreaTypes area={area} className={area.bannerUrl ? 'absolute left-12 right-2 top-2' : 'p-2 pl-12'} />
        {p.cleared && (
          <span className="absolute bottom-2 right-2 border-2 border-ink bg-hp-green px-2 text-lg leading-tight">
            CLEARED · rewards ×{area.backtrackMultiplier}
          </span>
        )}
        {!unlocked && prevName && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-panel/40 text-2xl">
            <PixelIcon name="lock" size={24} /> Clear {prevName}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 p-3">
        {/* On a phone the details take the full width and ENTER drops below them. */}
        <div className="min-w-0 flex-1 basis-[17rem]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="min-w-0 break-words text-3xl leading-none">{area.name}</h2>
            {current && (
              <span className="shrink-0 border-2 border-ink bg-gold px-1.5 text-lg leading-tight text-ink">◀ you are here</span>
            )}
            <span className="ml-auto shrink-0 text-2xl leading-none">
              {area.scalesToTeam ? 'Lv. = team' : `Lv.${area.minLevel}–${area.maxLevel}`}
            </span>
          </div>
          <div className="text-lg text-muted">
            {species.length ? (
              <span className={cx(complete && 'inline-flex items-center gap-1 text-good')}>
                {caught}/{species.length} species caught
                {complete && <PixelIcon name="check" size={16} title="Every species here is caught" />}
              </span>
            ) : (
              'trainers only'
            )}
            {area.trainerPool.length ? ` · ${area.trainerPool.length} trainers` : ''}
            {area.encounterWeights.casino > 0 ? ' · Game Corner' : ''}
            {area.scalesToTeam ? ' · endless, foes scale to your team' : ''}
            {area.easyMode ? ' · easy: a Center after any K.O.' : ''}
          </div>
          <GymRow area={area} />
          {bosses.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              {bosses.map((b) => {
                const beaten = p.bossesDefeated.includes(b.dex)
                return (
                  <span key={b.dex} className="flex items-center gap-1 text-base" title={beaten ? data.species[b.dex]?.name : 'A legendary awaits'}>
                    <MiniSprite dex={b.dex} size={36} silhouette={!beaten} />
                    {beaten ? data.species[b.dex]?.name : 'Legendary'}
                  </span>
                )
              })}
            </div>
          )}
        </div>
        <PixelButton
          variant="primary"
          className="w-full sm:w-auto"
          disabled={!unlocked}
          onClick={() => {
            if (exploring || enterArea(area.id)) navigate('/area')
          }}
        >
          {!unlocked ? 'LOCKED' : exploring ? 'CONTINUE' : 'ENTER'}
        </PixelButton>
        {unlocked && <Gauge value={p.xp} max={area.xpToUnlockNext} className="w-full" />}
      </div>
    </motion.li>
  )
}

/** A locked area of the chain: one line, no banner — there's nothing to do there yet. */
function LockedRow({ area, index, prevName }: { area: Area; index: number; prevName?: string }) {
  return (
    <li className="hatched flex flex-wrap items-center gap-x-3 gap-y-1 border-[3px] px-3 py-2">
      <span className="border-2 border-ink bg-panel px-2 text-xl leading-tight text-ink">{index}</span>
      <span className="min-w-0 flex-1 text-2xl leading-tight">{area.name}</span>
      <span className="text-lg">{area.scalesToTeam ? 'Lv. = team' : `Lv.${area.minLevel}–${area.maxLevel}`}</span>
      {prevName && (
        <span className="flex w-full items-center gap-1.5 text-base sm:w-auto">
          <PixelIcon name="lock" size={14} /> Clear {prevName}
        </span>
      )}
    </li>
  )
}

function SecretCard({ area }: { area: Area }) {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  if (isAreaUnlocked(save, area.id, data)) return <AreaCard area={area} index="★" />
  const conds = (area.unlockConditions ?? []).map((c) => conditionStatus(c, save, data))
  return (
    <li className="pixel-panel-dark overflow-hidden p-0">
      <div className="relative h-20 overflow-hidden sm:h-28">
        {area.bannerUrl && (
          <AreaBanner url={area.bannerUrl} className="h-full opacity-25 blur-[1px] grayscale" />
        )}
        <div className="absolute inset-0 flex items-center justify-center text-5xl text-gold">???</div>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="text-2xl">A secret area</div>
        {conds.map((c, i) => (
          <div key={i} className="text-lg">
            <div className="flex justify-between gap-2">
              <span>{c.label}</span>
              <span className="font-mono text-base">
                {Math.min(c.current, c.target)}/{c.target}
              </span>
            </div>
            <div className="mt-0.5 h-2 border border-panel bg-ink">
              <div className="h-full bg-gold" style={{ width: `${Math.min(100, (c.current / c.target) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </li>
  )
}

/** The Day Care sits with the secret areas: a locked card until enough species are caught, then its own screen. */
function DayCareCard() {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const cfg = data.config.dayCare
  if (!isDayCareOpen(save, data)) {
    const current = new Set(save.pokedex).size
    return (
      <li className="pixel-panel-dark flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3">
          <EggSprite size={40} className="opacity-40 grayscale" />
          <div className="text-2xl">A secret place</div>
        </div>
        <div className="text-lg">
          <div className="flex justify-between gap-2">
            <span>Catch {cfg.unlockPokedex} Pokémon</span>
            <span className="font-mono text-base">
              {Math.min(current, cfg.unlockPokedex)}/{cfg.unlockPokedex}
            </span>
          </div>
          <div className="mt-0.5 h-2 border border-panel bg-ink">
            <div className="h-full bg-gold" style={{ width: `${Math.min(100, (current / Math.max(1, cfg.unlockPokedex)) * 100)}%` }} />
          </div>
        </div>
      </li>
    )
  }
  const dc = dayCareOf(save)
  const now = Date.now()
  const full = dc.residents.filter((r) => dayCareXp(r, now, data) >= cfg.maxXp).length
  return (
    <li className="pixel-panel flex flex-wrap items-center gap-3 p-3">
      <EggSprite size={48} />
      <div className="min-w-0 flex-1 basis-[12rem]">
        <h2 className="text-3xl leading-none">Pokémon Day Care</h2>
        <div className="text-lg text-muted">
          {dc.residents.length}/{cfg.slots} staying
          {full > 0 && ` · ${full} ready to pick up`}
          {!dc.eggClaimed ? ' · an Egg is waiting for you!' : ` · Eggs ₽${cfg.eggPrice}`}
        </div>
        {dc.residents.length > 0 && (
          <div className="mt-1 flex gap-1">
            {dc.residents.map((r) => (
              <MiniSprite key={r.inst.id} dex={r.inst.dex} size={32} />
            ))}
          </div>
        )}
      </div>
      <PixelButton variant="primary" className="w-full sm:w-auto" onClick={() => navigate('/daycare')}>
        ENTER
      </PixelButton>
    </li>
  )
}

export function MapScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [showAll, setShowAll] = useState(false)
  if (!save) return null
  const chain = linearAreas(data)
  const secrets = data.areas.filter((a) => a.hidden)
  const badges = badgeCase(save, data)
  const earned = badges.filter((b) => b.earned).length
  // The frontier is the furthest area you've opened; the map shows it and the next ones.
  const frontier = chain.reduce((last, a, i) => (isAreaUnlocked(save, a.id, data) ? i : last), 0)
  const start = Math.max(0, Math.min(frontier, chain.length - WINDOW))
  const shown = showAll ? chain.map((a, i) => ({ a, i })) : chain.slice(start, start + WINDOW).map((a, k) => ({ a, i: start + k }))
  const hidden = chain.length - shown.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-5xl">Kanto</h1>
        {badges.length > 0 && (
          <div className="pixel-panel flex flex-wrap items-center gap-1.5 px-2 py-1" aria-label={`Badges: ${earned} of ${badges.length}`}>
            <span className="mr-1 text-lg">Badges {earned}/{badges.length}</span>
            {badges.map((b) => (
              <BadgeIcon key={b.trainerId} badge={b.badge} earned={b.earned} size={22} />
            ))}
          </div>
        )}
      </div>
      {!showAll && hidden > 0 && (
        <p className="text-lg text-muted">
          Areas {start + 1}–{start + shown.length} of {chain.length} — your next stages.
        </p>
      )}
      <ol className="flex flex-col gap-4">
        {shown.map(({ a, i }, k) =>
          isAreaUnlocked(save, a.id, data) ? (
            <AreaCard key={a.id} area={a} index={i + 1} prevName={chain[i - 1]?.name} delay={Math.min(k, 8) * 0.04} />
          ) : (
            <LockedRow key={a.id} area={a} index={i + 1} prevName={chain[i - 1]?.name} />
          ),
        )}
      </ol>
      {chain.length > WINDOW && (
        <PixelButton className="self-center" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? `SHOW THE NEXT ${WINDOW} ONLY` : `VIEW ALL ${chain.length} AREAS`}
        </PixelButton>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-4xl">Secret areas</h2>
        <p className="copy text-muted">Hidden places open up once you meet their conditions — keep catching and training.</p>
        <ol className="grid gap-4 md:grid-cols-2">
          {secrets.map((a) => (
            <SecretCard key={a.id} area={a} />
          ))}
          <DayCareCard />
        </ol>
      </section>
    </div>
  )
}
