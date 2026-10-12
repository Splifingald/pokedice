import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { teamOf, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { BoxSortPicker, sortBox, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { StageCanvas } from '@/components/StageCanvas'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { loadCenterArt } from '@/fx/scenes'
import { centerTimeline } from '@/fx/timelines/center'
import { useMotion } from '@/lib/motion'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { putInTeam, removeFromTeam, reorderTeam } from '@/store/actions'
import { useGame } from '@/store/game'
import { continueExploring, finishCenter, markHealShown } from '@/store/run'

/** Chansey, behind the healing machine's counter. */
const NURSE = 113

/** Pokémon Center: heal jingle, then team management — tap any Pokémon for its sheet and team actions. */
export function CenterView() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { level } = useMotion()
  // Nothing to watch with animations off, or when it already played (back from Home): straight to the Center.
  const [healed, setHealed] = useState(() => level === 'off' || !!useGame.getState().run.healShown)
  const skip = useRef<HTMLButtonElement>(null)
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<BoxSort>('dex')
  const teamSize = useGame((s) => s.save?.team.length ?? 1)
  // The machine's jingle plays once, on arrival (short motion: the quick version).
  const [scene] = useState(() => ({
    ready: Promise.all([loadSprite(NURSE, false), loadCenterArt()]),
    timeline: centerTimeline({ balls: teamSize, nurse: spriteKey(NURSE, false), short: level !== 'full' }),
  }))
  // The team is healed already (engage): once the jingle has started, leaving and coming back doesn't play it again.
  useEffect(() => markHealShown(), [])
  // SKIP has the focus, so Enter, Space and Escape all end it.
  useEffect(() => {
    if (!healed) skip.current?.focus()
  }, [healed])

  if (!save) return null
  const team = teamOf(save)
  const box = sortBox(save.box.filter((p) => !save.team.includes(p.id)), sort, data)
  const full = team.length >= data.config.maxTeamSize
  const name = (p: PokemonInstance) => data.species[p.dex]?.name ?? t('ui.common.unknown')
  const open = (p: PokemonInstance) => setView({ kind: 'inst', id: p.id })
  const done = () => setView(null)

  const teamActions = (inst: PokemonInstance) => {
    const inTeam = save.team.includes(inst.id)
    return (
      <section className="flex flex-col gap-2 border-t-[3px] border-dashed border-shadow pt-3">
        <h3 className="text-xl">{t('ui.center.team')}</h3>
        {inTeam ? (
          <div className="flex flex-wrap gap-2">
            {save.team[0] !== inst.id && (
              <PixelButton variant="primary" onClick={() => reorderTeam([inst.id, ...save.team.filter((x) => x !== inst.id)])}>
                {t('ui.team.makeLead')}
              </PixelButton>
            )}
            <PixelButton
              disabled={team.length <= 1}
              onClick={() => {
                removeFromTeam(inst.id)
                done()
              }}
            >
              {t('ui.center.sendToBox')}
            </PixelButton>
          </div>
        ) : inst.revivesAt != null ? (
          <p className="copy text-muted">{t('ui.center.stillReviving')}</p>
        ) : !full ? (
          <PixelButton
            variant="primary"
            onClick={() => {
              putInTeam(inst.id, null)
              done()
            }}
          >
            {t('ui.center.addToTeam')}
          </PixelButton>
        ) : (
          <>
            <p className="copy text-muted">{t('ui.center.swapFor', { name: name(inst) })}</p>
            {team.map((p) => (
              <PixelButton
                key={p.id}
                className="justify-between"
                onClick={() => {
                  putInTeam(inst.id, p.id)
                  done()
                }}
              >
                <span>
                  {name(p)} {t('ui.common.level.short', { n: p.level })}
                </span>
                <span className="text-base">{t('ui.center.goesToBox')}</span>
              </PixelButton>
            ))}
          </>
        )}
      </section>
    )
  }

  return (
    // Phones: room at the bottom for the action bar, which is pinned over the tab bar.
    <div className="flex flex-col gap-4 pb-[108px] md:pb-0">
      {/* The healing plays over everything (on <body>, so nothing on the page can sit over it), as big as the screen
          allows; it closes itself once done. SKIP just closes it: the team is already healed, and jumping the timeline
          to its end would play every note left of the jingle at once. */}
      {!healed &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('ui.center.healing')}
            className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-night/80 p-3"
            onKeyDown={(e) => e.key === 'Escape' && setHealed(true)}
          >
            <div className="pixel-panel w-[min(100%,calc((100dvh-120px)*1.5))] overflow-hidden p-0">
              <StageCanvas
                timeline={scene.timeline}
                ready={scene.ready}
                onEnd={() => setTimeout(() => setHealed(true), 400)}
                label={t('ui.center.healing')}
              />
            </div>
            <PixelButton ref={skip} size="lg" className="min-w-[200px]" onClick={() => setHealed(true)}>
              {t('ui.victory.skip')}
            </PixelButton>
          </div>,
          document.body,
        )}

      {/* Then, before going on: where you are and what you can do here. */}
      <p className="pixel-dialogue m-0 flex items-center gap-3 px-3 py-2.5 text-[20px] leading-[1.15]" aria-live="polite">
        <PixelIcon name="heart" size={24} className="shrink-0" />
        <span>{t('ui.center.restHere')}</span>
      </p>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-3xl">{t('ui.center.teamCount', { count: team.length, max: data.config.maxTeamSize })}</h2>
          <span className="text-base text-muted">{t('ui.center.tapTeam')}</span>
        </div>
        <ol className="grid gap-2 md:grid-cols-3">
          {team.map((p, i) => (
            <li key={p.id}>
              <MonCard
                inst={p}
                onClick={() => open(p)}
                badge={i === 0 ? <PixelIcon name="crown" size={20} title={t('ui.team.lead')} /> : null}
              />
            </li>
          ))}
          {Array.from({ length: Math.max(0, data.config.maxTeamSize - team.length) }, (_, i) => (
            <li key={`empty-${i}`} className="flex min-h-[80px] items-center justify-center border-[3px] border-dashed border-shadow text-lg text-muted">
              {t('ui.center.emptySlot')}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <h2 className="text-3xl">{t('ui.team.box', { count: box.length })}</h2>
          {box.length > 0 && <span className="text-base text-muted">{t('ui.center.tapBox')}</span>}
          {box.length > 1 && <BoxSortPicker sort={sort} onChange={setSort} />}
        </div>
        {box.length === 0 && <p className="copy text-muted">{t('ui.center.boxEmpty')}</p>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {box.map((p) => (
            <li key={p.id}>
              <MonCard inst={p} onClick={() => open(p)} />
            </li>
          ))}
        </ul>
      </section>

      {/* Always on screen: phones pin it right above the tab bar, even when the page is short; from 768px it follows
          the content column (the side nav is there) and sticks to the bottom. */}
      <div
        className="fixed inset-x-0 z-30 border-t-[3px] border-edge bg-parchment px-3 py-2 md:sticky md:inset-x-auto md:-mx-3"
        style={{ bottom: 'var(--bottom-nav)' }}
      >
        <div className="flex flex-col gap-1.5 md:mx-auto md:max-w-md">
          <RunRoundGauge />
          {/* Healed: back Home, or straight on to this area's next encounter. */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <PixelButton
              size="lg"
              className="whitespace-nowrap px-2"
              onClick={() => {
                finishCenter()
                navigate('/home')
              }}
            >
              {t('ui.nav.home')}
            </PixelButton>
            <PixelButton
              variant="primary"
              size="lg"
              className="whitespace-nowrap px-2"
              onClick={() => {
                finishCenter()
                continueExploring()
              }}
            >
              {t('ui.common.continue')}
            </PixelButton>
          </div>
        </div>
      </div>

      <SheetModal view={view} onClose={done} instExtra={teamActions} />
    </div>
  )
}
