import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  deckSize,
  dueBoss,
  dueGym,
  instanceMaxHp,
  isAreaUnlocked,
  progressOf,
  teamAverageLevel,
  teamOf,
  type Area,
  type AreaProgress,
  type DeckCard,
  type PokemonInstance,
} from '@/engine'
import { AreaTypes } from '@/components/AreaTypes'
import { BadgeIcon } from '@/components/BadgeIcon'
import { Gauge } from '@/components/Gauge'
import { HpBar } from '@/components/HpBar'
import { PixelIcon, type IconName } from '@/components/icons'
import { ItemPanel } from '@/components/ItemPanel'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { preloadSprites, SpriteImg } from '@/components/SpriteImg'
import { trainerTitle } from '@/lib/format'
import { useGame } from '@/store/game'
import { challenge, enterArea, leaveArea, rollNext } from '@/store/run'
import { cx } from '@/theme/util'
import { BattleView } from './battle/BattleView'
import { CenterView } from './area/CenterView'
import { EncounterPreview } from './area/EncounterPreview'

const CARD_ICON: Record<DeckCard, IconName> = { wild: 'ball', trainer: 'vs', center: 'heart', item: 'box', legend: 'masterball' }
const CARD_NAME: Record<DeckCard, string> = {
  wild: 'a wild Pokémon',
  trainer: 'a trainer',
  center: 'a Pokémon Center',
  item: 'a find',
  legend: 'a legendary',
}

/** The round's start on the area gauge — only while a round is under way and the gauge isn't full. */
function roundMark(area: Area, progress: AreaProgress): number | null {
  const full = area.xpToUnlockNext != null && progress.xp >= area.xpToUnlockNext
  if (full || !progress.deck?.length) return null
  return progress.roundStartXp ?? 0
}

/** Both gauges share a label column so their bars line up. */
const GAUGE_LABEL = 'w-[6.5rem] shrink-0'

/**
 * The round gauge, laid out like the area gauge above it: ROUND n · one tile per card of the area's deck · n/total.
 * Met cards show their icon, the next one has a gold edge, the rest stay dark (nothing ahead is given away). A lost
 * round (wipe) or a finished one leaves the next round waiting, empty. Hidden with game_config.showRoundGauge, or when
 * encounters aren't dealt from a deck.
 */
function RoundGauge({ area, progress }: { area: Area; progress: AreaProgress }) {
  const data = useGame((s) => s.data)
  const cfg = data.config
  if (!cfg.showRoundGauge || cfg.encounterMode !== 'deck') return null
  const remaining = progress.deck?.length ?? 0
  const met = progress.drawn ?? []
  const inRound = remaining > 0
  const justDone = !inRound && met.length > 0 // the round's last card was just met
  const round = inRound || justDone ? (progress.round ?? 1) : (progress.round ?? 0) + 1
  // Saves from before rounds were tracked know how many cards are left, not which were met.
  const total = inRound ? (progress.drawn ? met.length + remaining : Math.max(deckSize(area), remaining)) : justDone ? met.length : deckSize(area)
  const metCount = inRound ? total - remaining : justDone ? total : 0
  const unknown = Math.max(0, metCount - met.length)
  // Preview (admin option): the deck is drawn from the end, so the next card is its last one.
  const ahead = cfg.showRoundPreview && inRound ? [...progress.deck!].reverse() : []
  const gymId = cfg.showRoundPreview ? area.gyms.find((id) => !progress.gymsDefeated.includes(id) && data.trainers[id]) : undefined
  const gym = gymId ? data.trainers[gymId] : undefined
  const boss = cfg.showRoundPreview && !gym ? (area.legendaryBoss ?? []).find((b) => !progress.bossesDefeated.includes(b.dex)) : undefined
  const finale = gym ? (gym.badge ? `${gym.name} (${gym.badge})` : gym.name) : boss ? (data.species[boss.dex]?.name ?? 'a legendary') : null
  const gauge = (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={justDone ? `Round ${round} complete` : `Round ${round}: ${metCount} of ${total} encounters done`}
    >
      <span className={cx('text-sm leading-none', GAUGE_LABEL)} aria-hidden>
        ROUND {round}
      </span>
      <ol className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => {
          const done = i < metCount
          const next = !justDone && i === metCount
          const card = done && i >= unknown ? met[i - unknown] : undefined
          return (
            <li
              key={i}
              title={done ? (card ? CARD_NAME[card] : 'met') : next ? 'next' : 'still to come'}
              className={cx(
                'flex h-6 min-w-0 flex-1 items-center justify-center border-2',
                done ? 'border-ink bg-panel' : next ? 'border-gold bg-[#3e3552]' : 'border-ink bg-[#3e3552]',
              )}
              style={{ borderRadius: 2 }}
            >
              {card && <PixelIcon name={CARD_ICON[card]} size={14} />}
            </li>
          )
        })}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {justDone ? '✓' : `${metCount}/${total}`}
      </span>
    </div>
  )
  if (!ahead.length && !finale) return gauge
  return (
    <>
      {gauge}
      <div className="flex items-center gap-2">
        <span className={cx('text-sm leading-none', GAUGE_LABEL)}>AHEAD</span>
        <ol
          className="flex min-w-0 flex-1 gap-[2px]"
          aria-label={`Still to come this round: ${ahead.map((c) => CARD_NAME[c]).join(', ') || 'nothing'}`}
        >
          {Array.from({ length: total }, (_, i) => {
            const card = i >= metCount ? ahead[i - metCount] : undefined
            return (
              <li key={i} className="flex h-6 min-w-0 flex-1 items-center justify-center" title={card ? CARD_NAME[card] : undefined}>
                {card && <PixelIcon name={CARD_ICON[card]} size={16} />}
              </li>
            )
          })}
        </ol>
        <span className="flex min-w-[6ch] justify-end" title={finale ? `When exploration is complete: ${finale}` : undefined}>
          {gym?.badge ? (
            <BadgeIcon badge={gym.badge} earned size={18} />
          ) : gym ? (
            <PixelIcon name="vs" size={18} title={`Gym: ${gym.name}`} />
          ) : boss ? (
            <PixelIcon name="masterball" size={18} title={`Legendary: ${finale}`} />
          ) : null}
        </span>
      </div>
    </>
  )
}

/** Encounter types, a slim banner, then the name with its levels, the gauge and the round gauge. */
function AreaHeader({ area, progress, teamAvg }: { area: Area; progress: AreaProgress; teamAvg: number }) {
  const spread = useGame((s) => s.data.config.scaleLevelSpread)
  const notes = [
    area.scalesToTeam && 'Foes scale to your team',
    progress.cleared && `Cleared — rewards ×${area.backtrackMultiplier}`,
    area.easyMode && 'Easy: a Center comes after any K.O.',
  ].filter(Boolean)
  return (
    <section className="pixel-panel overflow-hidden p-0" aria-labelledby="area-title">
      <AreaTypes area={area} className="border-b-[3px] border-ink bg-parchment px-3 py-1.5" />
      {area.bannerUrl && (
        <img
          src={area.bannerUrl}
          alt=""
          className="pixelated block h-14 w-full object-cover sm:h-20"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 id="area-title" className="min-w-0 text-4xl leading-none">
            {area.name}
          </h1>
          <span className="shrink-0 text-2xl leading-none">
            {area.scalesToTeam ? `Lv.${Math.round(teamAvg)} ±${spread}` : `Lv.${area.minLevel}–${area.maxLevel}`}
          </span>
        </div>
        {notes.length > 0 && <div className="text-lg leading-tight text-muted">{notes.join(' · ')}</div>}
        <Gauge
          value={progress.xp}
          max={area.xpToUnlockNext}
          className="w-full"
          labelClassName={GAUGE_LABEL}
          // The red mark: where a wipe would bring the gauge back (the start of this round). A full gauge stays full.
          mark={roundMark(area, progress)}
          markText={`a wipe brings it back to ${progress.roundStartXp ?? 0}, where this round began`}
        />
        <RoundGauge area={area} progress={progress} />
      </div>
    </section>
  )
}

/** The team at a glance between fights: HP for each, tap to open the sheet (and heal). */
function TeamStrip({ onOpen }: { onOpen: (p: PokemonInstance) => void }) {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  return (
    <section aria-labelledby="team-strip" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="team-strip" className="text-2xl">
          Your team
        </h2>
        <span className="text-base text-muted">Tap one to heal it or check it</span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {teamOf(save).map((p) => {
          const fainted = p.currentHp <= 0
          return (
            <li key={p.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(p)}
                className={cx('pixel-panel flex w-full flex-col items-center gap-1 p-1.5 hover:bg-white', fainted && 'hatched')}
              >
                <SpriteImg dex={p.dex} size={48} className={fainted ? 'grayscale' : ''} />
                <span className="w-full truncate text-center text-lg leading-none">{data.species[p.dex]?.name}</span>
                <span className="text-base leading-none">Lv.{p.level}</span>
                <HpBar hp={p.currentHp} max={instanceMaxHp(p, data)} height={6} className="w-full" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function AreaScreen() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const battle = useGame((s) => s.battle)
  const navigate = useNavigate()
  const [view, setView] = useState<SheetView | null>(null)

  // Arriving without an active run (reload, HUD link): resume the save's current area.
  useEffect(() => {
    if (!run.areaId && save && isAreaUnlocked(save, save.currentAreaId, data)) enterArea(save.currentAreaId)
  }, [run.areaId, save, data])

  const area = data.areas.find((a) => a.id === (run.areaId ?? save?.currentAreaId))
  useEffect(() => {
    if (area) preloadSprites(area.wildPool.map((w) => w.dex))
  }, [area])

  if (!save) return <Navigate to="/" replace />
  if (!area) return <Navigate to="/map" replace />
  if (battle) return <BattleView key={battle.id} battle={battle} />

  const progress = progressOf(save, area.id)
  const teamAvg = teamAverageLevel(save)
  const gym = dueGym(area, progress, data)
  const boss = dueBoss(area, progress, teamAvg)
  // The gym battle waiting at the end of the gauge (before it's full).
  const nextGymId = !gym ? area.gyms.find((id) => !progress.gymsDefeated.includes(id) && data.trainers[id]) : undefined
  const nextGym = nextGymId ? data.trainers[nextGymId] : undefined
  const between = run.phase === 'idle' || run.phase === 'preview'

  return (
    <div className="flex flex-col gap-4">
      <AreaHeader area={area} progress={progress} teamAvg={teamAvg} />

      {between && (
        <div className="pixel-panel flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-2xl">
            {gym
              ? `Exploration complete — ${trainerTitle(gym)} is ready when you are.`
              : boss
                ? 'The ground trembles. Something powerful is waiting…'
                : run.firstInArea
                  ? 'The path ahead is quiet. For now.'
                  : 'Where to next?'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {/* A full gauge never forces the fight: challenge now, or keep exploring (the gauge stays full). */}
            {(gym || boss) && (
              <PixelButton variant="primary" size="lg" onClick={challenge} disabled={run.phase !== 'idle'}>
                <PixelIcon name="sword" size={22} />
                {gym ? `CHALLENGE ${gym.name.toUpperCase()}` : 'FACE IT'}
              </PixelButton>
            )}
            <PixelButton variant={gym || boss ? 'secondary' : 'primary'} size="lg" onClick={rollNext} disabled={run.phase !== 'idle'}>
              {run.firstInArea ? 'EXPLORE' : 'NEXT ENCOUNTER'}
            </PixelButton>
            <PixelButton
              size="lg"
              disabled={run.phase !== 'idle'}
              onClick={() => {
                leaveArea()
                navigate('/map')
              }}
            >
              MAP
            </PixelButton>
          </div>
          {(gym || boss) && <p className="text-lg leading-tight text-muted">Or keep exploring first — your exploration stays complete.</p>}
          {nextGym && (
            <p className="text-lg leading-tight">
              {trainerTitle(nextGym)} waits at the end of the exploration ({progress.xp}/{area.xpToUnlockNext ?? '∞'})
            </p>
          )}
        </div>
      )}
      {between && <TeamStrip onOpen={(p) => setView({ kind: 'inst', id: p.id })} />}
      {run.phase === 'preview' && run.encounter && <EncounterPreview enc={run.encounter} />}
      {run.phase === 'center' && <CenterView />}

      <SheetModal view={view} onClose={() => setView(null)} instExtra={(p) => <ItemPanel inst={p} />} />
    </div>
  )
}
