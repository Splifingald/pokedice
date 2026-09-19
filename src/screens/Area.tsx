import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  deckSize,
  dueBoss,
  dueGym,
  asSeenBy,
  gymsFor,
  playerSideOf,
  instanceMaxHp,
  isAreaUnlocked,
  progressOf,
  scaledLevelSpan,
  teamAverageLevel,
  teamOf,
  type Area,
  type AreaProgress,
  type DeckCard,
  type PokemonInstance,
} from '@/engine'
import { AreaTypes } from '@/components/AreaTypes'
import { BadgeIcon } from '@/components/BadgeIcon'
import { HpBar } from '@/components/HpBar'
import { PixelIcon, type IconName } from '@/components/icons'
import { ItemPanel } from '@/components/ItemPanel'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { MiniSprite, preloadSprites } from '@/components/SpriteImg'
import { countdown, trainerTitle } from '@/lib/format'
import { OakTip, useOneTimeTip } from '@/components/OakTip'
import { setSettings, useGame } from '@/store/game'
import { challenge, enterArea, leaveArea, outOfEnergy, rollNext } from '@/store/run'
import { useEnergy } from '@/store/hooks'
import { cx } from '@/theme/util'
import { BattleView } from './battle/BattleView'
import { CasinoView } from './area/CasinoView'
import { CenterView } from './area/CenterView'
import { EncounterPreview } from './area/EncounterPreview'
import { AreaBanner } from '@/components/AreaBanner'

const CARD_ICON: Record<DeckCard, IconName> = {
  wild: 'ball',
  trainer: 'vs',
  center: 'heart',
  item: 'box',
  casino: 'coin',
  legend: 'masterball',
}
const CARD_NAME: Record<DeckCard, string> = {
  wild: 'a wild Pokémon',
  trainer: 'a trainer',
  center: 'a Pokémon Center',
  item: 'a find',
  casino: 'the Game Corner',
  legend: 'a legendary',
}

/**
 * The round gauge, under the area name (no label): one tile per card of the current round's deck · n/total.
 * Met cards show their icon, the next one has a gold edge, the rest stay dark (nothing ahead is given away). A lost
 * round (wipe) or a finished one leaves the next round waiting, empty. Hidden with game_config.showRoundGauge, or when
 * encounters aren't dealt from a deck.
 */
function RoundGauge({ area, progress }: { area: Area; progress: AreaProgress }) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = data.config
  if (!cfg.showRoundGauge || cfg.encounterMode !== 'deck') return null
  const remaining = progress.deck?.length ?? 0
  const met = progress.drawn ?? []
  const inRound = remaining > 0
  const justDone = !inRound && met.length > 0 // the round's last card was just met
  // Saves from before rounds were tracked know how many cards are left, not which were met.
  const total = inRound ? (progress.drawn ? met.length + remaining : Math.max(deckSize(area), remaining)) : justDone ? met.length : deckSize(area)
  const metCount = inRound ? total - remaining : justDone ? total : 0
  const unknown = Math.max(0, metCount - met.length)
  // Preview (admin option): the deck is drawn from the end, so the next card is its last one.
  const ahead = cfg.showRoundPreview && inRound ? [...progress.deck!].reverse() : []
  const side = save ? playerSideOf(save) : null
  const gymId = cfg.showRoundPreview ? gymsFor(area, data, side).find((id) => !progress.gymsDefeated.includes(id) && data.trainers[id]) : undefined
  const gym = gymId ? asSeenBy(data.trainers[gymId]!, side) : undefined
  const boss = cfg.showRoundPreview && !gym ? (area.legendaryBoss ?? []).find((b) => !progress.bossesDefeated.includes(b.dex)) : undefined
  const finale = gym ? (gym.badge ? `${gym.name} (${gym.badge})` : gym.name) : boss ? (data.species[boss.dex]?.name ?? 'a legendary') : null
  const gauge = (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={justDone ? 'This round is complete' : `This round: ${metCount} of ${total} encounters done`}
    >
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
        <span className="sr-only">Ahead</span>
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
        <span className="flex min-w-[6ch] justify-end" title={finale ? `When every round is done: ${finale}` : undefined}>
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

/** Encounter types, a slim banner, then the name with its round (or a checkmark) and levels, and the round gauge. */
function AreaHeader({ area, progress, teamAvg }: { area: Area; progress: AreaProgress; teamAvg: number }) {
  const data = useGame((s) => s.data)
  const span = area.scalesToTeam ? scaledLevelSpan(area, teamAvg, data) : { min: area.minLevel, max: area.maxLevel }
  const notes = [
    area.scalesToTeam && 'Foes scale to your team',
    progress.cleared && `Cleared — rewards ×${area.backtrackMultiplier}`,
  ].filter(Boolean)
  // "Round 2/3" while rounds are still needed; a checkmark once they're all done (secret areas: nothing).
  const need = area.roundsToClear
  const done = progress.roundsDone ?? 0
  return (
    <section className="pixel-panel overflow-hidden p-0" aria-labelledby="area-title">
      {/* The encounter types sit on the banner's top right corner. */}
      <div className="relative">
        {area.bannerUrl && (
          <AreaBanner url={area.bannerUrl} className="h-14 sm:h-24" />
        )}
        <AreaTypes area={area} className={area.bannerUrl ? 'absolute left-2 right-2 top-2' : 'px-3 pt-2'} />
      </div>
      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            <h1 id="area-title" className="min-w-0 text-4xl leading-none">
              {area.name}
            </h1>
            {need != null &&
              (done >= need ? (
                <span
                  className="self-center border-2 border-ink bg-hp-green px-1.5 text-xl leading-tight text-ink"
                  style={{ borderRadius: 2 }}
                  title={`All ${need} round${need === 1 ? '' : 's'} done`}
                  aria-label={`All ${need} round${need === 1 ? '' : 's'} done`}
                >
                  ✓
                </span>
              ) : (
                <span className="shrink-0 text-2xl leading-none text-muted">
                  Round {Math.min(done + 1, need)}/{need}
                </span>
              ))}
          </div>
          <span className="shrink-0 text-2xl leading-none">
            {span.min === span.max ? `Lv.${span.min}` : `Lv.${span.min}–${span.max}`}
          </span>
        </div>
        {notes.length > 0 && <div className="text-lg leading-tight text-muted">{notes.join(' · ')}</div>}
        <RoundGauge area={area} progress={progress} />
      </div>
    </section>
  )
}

// Professor Oak explains auto-mode the first time a cleared area offers it (per device).
const AUTO_TIP_KEY = 'pokedice.tip.auto'

/** Cleared areas only: fights play themselves on both sides while it's on. Off by default; the choice is saved. */
function AutoModeToggle() {
  const on = useGame((s) => !!s.settings.autoMode)
  const [tip, closeTip] = useOneTimeTip(AUTO_TIP_KEY)
  return (
    <>
      {tip && (
        <OakTip onClose={closeTip}>
          You've cleared this area, so <b>AUTO-MODE</b> is open to you here! Turn it on and your Pokémon fight by
          themselves: they roll, reroll, attack and switch in on their own, just like the foes do. Items stay in your
          bag, and catches and rewards still wait for you. Tap AUTO-MODE again, or STOP in a battle, to take back
          control.
        </OakTip>
      )}
      <PixelButton
        size="sm"
        variant={on ? 'success' : 'ghost'}
        aria-pressed={on}
        onClick={() => setSettings({ autoMode: !on })}
      >
        <PixelIcon name="dice" size={16} />
        AUTO-MODE: {on ? 'ON' : 'OFF'}
      </PixelButton>
    </>
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
                {/* Sprite (nudged up — party icons sit low in their box) and name, level on the right; the level
                    only wraps under them when a narrow card has no room for it. */}
                <span className="flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                  <span className="flex min-w-0 items-center gap-0.5">
                    <MiniSprite dex={p.dex} size={36} className={cx('relative -top-[3px] -my-2', fainted && 'grayscale')} />
                    <span className="min-w-0 truncate text-left text-lg leading-none">{data.species[p.dex]?.name}</span>
                  </span>
                  <span className="ml-auto shrink-0 pr-0.5 text-base leading-none">Lv.{p.level}</span>
                </span>
                <HpBar hp={p.currentHp} max={instanceMaxHp(p, data)} height={6} className="w-full" collapsible />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** NEXT ENCOUNTER (EXPLORE on arrival): costs 1 energy; out of energy, it waits with a countdown. */
function NextEncounterButton({ secondary }: { secondary: boolean }) {
  const run = useGame((s) => s.run)
  const energy = useEnergy()
  // Re-checked every second (useEnergy ticks): a Center the game sends next is free even at 0.
  const empty = !!energy && energy.value < 1 && outOfEnergy()
  return (
    <div className="flex flex-col items-center gap-1">
      <PixelButton variant={secondary ? 'secondary' : 'primary'} size="lg" onClick={rollNext} disabled={run.phase !== 'idle' || empty}>
        {run.firstInArea ? 'EXPLORE' : 'NEXT ENCOUNTER'}
      </PixelButton>
      {empty && energy.nextAt != null && (
        <p className="text-lg leading-tight text-danger" role="status">
          Out of energy · next in {countdown(energy.nextAt - energy.now)}
        </p>
      )}
    </div>
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
  const side = playerSideOf(save)
  const gym = dueGym(area, progress, data, side)
  const boss = dueBoss(area, progress, teamAvg)
  // The gym battle waiting once every round is done (before they are).
  const nextGymId = !gym ? gymsFor(area, data, side).find((id) => !progress.gymsDefeated.includes(id) && data.trainers[id]) : undefined
  const nextGym = nextGymId ? asSeenBy(data.trainers[nextGymId]!, side) : undefined
  const between = run.phase === 'idle' || run.phase === 'preview'

  return (
    <div className="flex flex-col gap-4">
      <AreaHeader area={area} progress={progress} teamAvg={teamAvg} />

      {between && (
        <div className="pixel-panel flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-2xl">
            {gym
              ? `Every round done — ${trainerTitle(gym)} is ready when you are.`
              : boss
                ? 'The ground trembles. Something powerful is waiting…'
                : run.firstInArea
                  ? 'The path ahead is quiet. For now.'
                  : 'Where to next?'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {/* Finishing the rounds never forces the fight: challenge now, or keep exploring (the rounds stay done). */}
            {(gym || boss) && (
              <PixelButton variant="primary" size="lg" onClick={challenge} disabled={run.phase !== 'idle'}>
                <PixelIcon name="sword" size={22} />
                {gym ? `CHALLENGE ${gym.name.toUpperCase()}` : 'FACE IT'}
              </PixelButton>
            )}
            <NextEncounterButton secondary={!!(gym || boss)} />
          </div>
          <PixelButton
            size="sm"
            variant="ghost"
            className="self-center"
            disabled={run.phase !== 'idle'}
            onClick={() => {
              leaveArea()
              navigate('/map')
            }}
          >
            <PixelIcon name="map" size={16} />
            BACK TO MAP
          </PixelButton>
          {progress.cleared && <AutoModeToggle />}
          {(gym || boss) && <p className="text-lg leading-tight text-muted">Or keep exploring first — your rounds stay done.</p>}
          {nextGym && (
            <p className="text-lg leading-tight">
              {trainerTitle(nextGym)} waits after round {area.roundsToClear ?? '∞'} ({progress.roundsDone ?? 0}/{area.roundsToClear ?? '∞'} done)
            </p>
          )}
        </div>
      )}
      {between && <TeamStrip onOpen={(p) => setView({ kind: 'inst', id: p.id })} />}
      {run.phase === 'preview' && run.encounter && <EncounterPreview enc={run.encounter} />}
      {run.phase === 'center' && <CenterView />}
      {run.phase === 'casino' && <CasinoView />}

      <SheetModal view={view} onClose={() => setView(null)} instExtra={(p) => <ItemPanel inst={p} />} />
    </div>
  )
}
