import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { teamOf, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { sfx } from '@/audio/sfx'
import { BoxSortPicker, sortBox, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { MonCard } from '@/components/MonCard'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { putInTeam, removeFromTeam, reorderTeam } from '@/store/actions'
import { useGame } from '@/store/game'
import { finishCenter } from '@/store/run'

/** Pokémon Center: heal jingle, then team management — tap any Pokémon for its sheet and team actions. */
export function CenterView() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const [healed, setHealed] = useState(reduced)
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<BoxSort>('dex')

  useEffect(() => {
    sfx('heal')
    if (reduced) return
    const t = setTimeout(() => setHealed(true), 1400)
    return () => clearTimeout(t)
  }, [reduced])

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
    <div className="flex flex-col gap-4">
      <div className="pixel-panel flex items-center gap-3 p-3">
        <div className="flex shrink-0 gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={healed ? { opacity: 1 } : { opacity: [0.2, 1, 0.2] }}
              transition={healed ? {} : { duration: 0.35, repeat: 3, delay: i * 0.08 }}
            >
              <PixelIcon name="ball" size={24} />
            </motion.div>
          ))}
        </div>
        <div>
          <div className="text-3xl leading-none">{t(healed ? 'ui.center.fightingFit' : 'ui.center.healing')}</div>
          <div className="text-lg text-muted">{t('ui.center.backToFull')}</div>
        </div>
      </div>

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

      {/* Always on screen, above the phone bottom bar. */}
      <div className="sticky z-30 -mx-3 border-t-[3px] border-ink bg-parchment px-3 py-2" style={{ bottom: 'var(--bottom-nav)' }}>
        <PixelButton variant="primary" size="lg" className="w-full md:mx-auto md:flex md:w-80" onClick={finishCenter}>
          {t('ui.common.continue')}
        </PixelButton>
      </div>

      <SheetModal view={view} onClose={done} instExtra={teamActions} />
    </div>
  )
}
