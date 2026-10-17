// The Underground's team (docs/31 §3), on its page: three seats, one orb colour each. Solo, every orb is the player's.
import { ORB_COLOURS, type UgTeam } from '@/engine'
import { OrbArt, UgNote } from '@/components/Underground'
import { useT } from '@/i18n/react'
import { useUgTeam } from '@/store/underground'
import { cx } from '@/theme/util'

/** The three seats: who holds each colour (you, a friend, or free), and the line under them. */
export function UgTeamSeats({ team }: { team: UgTeam | null }) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none gap-2 p-0">
        {ORB_COLOURS.map((c) => {
          const seat = team?.seats[c]
          const me = team?.me === c
          return (
            <li
              key={c}
              className={cx(
                'flex min-w-0 flex-1 flex-col items-center gap-1 p-1.5',
                seat ? 'bg-paper shadow-card' : 'bg-well shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
              )}
            >
              <OrbArt colour={c} px={22} className={cx(!seat && 'opacity-50')} />
              <span className="max-w-full truncate text-[18px] leading-none">
                {me ? t('ui.ug.you') : (seat?.name ?? (team ? t('ui.ug.freeSeat') : '—'))}
              </span>
              <span className="font-pixel-sm text-[14px] text-muted">{t(`ui.ug.colour.${c}`)}</span>
            </li>
          )
        })}
      </ul>
      <UgNote>{team ? t('ui.ug.teamNote') : t('ui.ug.teamSolo')}</UgNote>
    </div>
  )
}

export function UgTeamPanel() {
  const { t } = useT()
  const team = useUgTeam((s) => s.team)
  return (
    <section aria-labelledby="ug-team" className="pixel-panel flex flex-col gap-2 p-3">
      <h2 id="ug-team" className="m-0 text-[24px] font-normal leading-none">
        {t('ui.ug.team')}
      </h2>
      <UgTeamSeats team={team} />
    </section>
  )
}
