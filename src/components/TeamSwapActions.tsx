// The team's changes where they are open (engine/run.ts teamSwapsOpen): inside a Pokémon Center, and at a portal
// area's way in before READY! (docs/28). In a Pokémon's sheet: make it lead or send it to the Box, or bring one from
// the Box in (in place of whom, when the team is full).
import { monName, teamOf, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { putInTeam, removeFromTeam, reorderTeam } from '@/store/actions'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'

export function TeamSwapActions({ inst, onDone }: { inst: PokemonInstance; onDone: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const team = teamOf(save)
  const full = team.length >= data.config.maxTeamSize
  const inTeam = save.team.includes(inst.id)
  return (
    <section className="flex flex-col gap-2 border-t-[3px] border-dashed border-shadow pt-3">
      <h3 className="text-xl">{t('ui.center.team')}</h3>
      {inTeam ? (
        <div className="flex flex-wrap gap-2">
          {save.team[0] !== inst.id && (
            <PixelButton
              variant="primary"
              onClick={() => reorderTeam([inst.id, ...save.team.filter((x) => x !== inst.id)])}
            >
              {t('ui.team.makeLead')}
            </PixelButton>
          )}
          <PixelButton
            disabled={team.length <= 1}
            onClick={() => {
              removeFromTeam(inst.id)
              onDone()
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
            onDone()
          }}
        >
          {t('ui.center.addToTeam')}
        </PixelButton>
      ) : (
        <>
          <p className="copy text-muted">{t('ui.center.swapFor', { name: monName(inst, data) })}</p>
          {team.map((p) => (
            <PixelButton
              key={p.id}
              // The label spans the button: who leaves on the left, the swap arrow at the far right.
              className="[&>span]:w-full [&>span]:justify-between"
              onClick={() => {
                putInTeam(inst.id, p.id)
                onDone()
              }}
            >
              {/* Who leaves: its icon (still, the mini), name and level; the swap arrow at the far end. */}
              <span className="flex min-w-0 items-center gap-2">
                <MiniSprite dex={p.dex} size={24} className="shrink-0" />
                <span className="truncate">
                  {monName(p, data)} {t('ui.common.level.short', { n: p.level })}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-base">{t('ui.center.goesToBox')}</span>
                <PixelIcon name="reroll" size={20} />
              </span>
            </PixelButton>
          ))}
        </>
      )}
    </section>
  )
}
