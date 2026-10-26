// The team's changes where they are open (engine/run.ts teamSwapsOpen): inside a Pokémon Center, and at a portal
// area's way in before READY! (docs/28). In a Pokémon's sheet: make it lead or send it to the Box, or bring one from
// the Box in (in place of whom, when the team is full).
import type { ReactNode } from 'react'
import { monName, teamOf, type PokemonInstance } from '@/engine'
import { useT } from '@/i18n/react'
import { putInTeam, removeFromTeam, reorderTeam } from '@/store/actions'
import { pushToast, useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'

/** Two buttons side by side, a quiet one and the main one, sharing the row without either running off it. */
export function SheetActionRow({ quiet, main }: { quiet?: ReactNode; main?: ReactNode }) {
  if (!quiet && !main) return null
  if (!quiet || !main) return <div className="grid">{quiet || main}</div>
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">{quiet}{main}</div>
}

/**
 * The Center's moves at a Pokémon sheet's foot (docs/43 §5.4: the sheet's actions are its footer, one main one). In
 * the team: Make lead (red, not the lead) beside `useItem`, and Send to the Box as a small quiet link (not the last
 * one). In the Box: Add to team (red); the team full, "Swap it in for" a member — each member a button, one tap
 * (who leaves: its mini, name and level). A fossil still reviving: a line saying so.
 */
export function TeamSwapDock({
  inst,
  useItem,
  onDone,
}: {
  inst: PokemonInstance
  /** The sheet's Use an item (a quiet button), or nothing. */
  useItem?: ReactNode
  onDone: () => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  const team = teamOf(save)
  const full = team.length >= data.config.maxTeamSize
  const name = monName(inst, data)
  if (save.team.includes(inst.id))
    return (
      <div className="flex flex-col gap-1">
        <SheetActionRow
          quiet={useItem}
          main={
            save.team[0] !== inst.id && (
              <PixelButton
                variant="primary"
                size="lg"
                className="min-w-0"
                onClick={() => {
                  reorderTeam([inst.id, ...save.team.filter((x) => x !== inst.id)])
                  pushToast(t('ui.team.leadsNow', { name }), 'good')
                  onDone()
                }}
              >
                <PixelIcon name="crown" size={20} />
                {t('ui.team.makeLead')}
              </PixelButton>
            )
          }
        />
        {team.length > 1 && (
          <button
            type="button"
            className="min-h-[44px] self-end px-1 text-[20px] text-muted underline md:min-h-[36px]"
            onClick={() => {
              removeFromTeam(inst.id)
              onDone()
            }}
          >
            {t('ui.center.sendToBox')}
          </button>
        )}
      </div>
    )
  if (inst.revivesAt != null)
    return (
      <div className="flex flex-col gap-2">
        <p className="font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.center.stillReviving')}</p>
        <SheetActionRow quiet={useItem} />
      </div>
    )
  if (!full)
    return (
      <SheetActionRow
        quiet={useItem}
        main={
          <PixelButton
            variant="primary"
            size="lg"
            className="min-w-0"
            onClick={() => {
              putInTeam(inst.id, null)
              onDone()
            }}
          >
            {t('ui.center.addToTeam')}
          </PixelButton>
        }
      />
    )
  return (
    <div className="flex flex-col gap-2">
      <p className="font-pixel-sm text-[16px] leading-tight">{t('ui.center.swapFor', { name })}</p>
      {/* The pick is the swap: one tap on who leaves. */}
      <ul className="grid grid-cols-3 gap-1.5">
        {team.map((p) => (
          <li key={p.id} className="grid">
            <button
              type="button"
              aria-label={t('ui.team.swapInFor', { name, out: monName(p, data) })}
              className="pixel-btn flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 bg-paper px-1 pb-1.5 pt-1 text-ink"
              onClick={() => {
                putInTeam(inst.id, p.id)
                onDone()
              }}
            >
              <span className="flex items-center gap-1">
                <MiniSprite dex={p.dex} size={24} className="shrink-0" />
                <PixelIcon name="reroll" size={14} />
              </span>
              <span className="max-w-full truncate text-[18px] leading-none">{monName(p, data)}</span>
            </button>
          </li>
        ))}
      </ul>
      <SheetActionRow quiet={useItem} />
    </div>
  )
}

/** The Center's moves inside a sheet's body (the Pokémon Center's own sheet, the kitchen sink). */
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
