// The trainer card, opened from the avatar in the top bar: your look at 2×, your name (Change), an ID number, the
// numbers that say how far you are, your team, the badge case of every region you've reached, and the look other
// trainers see on the leaderboard and in Versus.
import { useEffect, useState } from 'react'
import { linearAreas, regionCases, regionOf, regionSpecies, teamOf, versusUnlocked } from '@/engine'
import { slug } from '@/i18n/names'
import { useT } from '@/i18n/react'
import { AVATAR_GROUPS, avatarOf, playerAvatarId } from '@/lib/avatars'
import { money } from '@/lib/format'
import { fetchVersusBoard } from '@/lib/versus'
import { CharacterSelect } from '@/screens/NewGame'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { BadgeIcon, CrownIcon } from './BadgeIcon'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'
import { playerOf } from './TrainerArt'
import { TrainerLook } from './TrainerLook'

/** A five-digit ID number, the same every time for the same trainer. */
function idNumber(seed: string): string {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100_000
  return String(h).padStart(5, '0')
}

/** Your Versus record, read once from the board when the card opens (signed in, Versus open). */
function useVersusRecord(enabled: boolean): { won: number; held: number } | null {
  const [rec, setRec] = useState<{ won: number; held: number } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetchVersusBoard()
      .then((rows) => {
        const me = rows?.find((r) => r.isMe)
        if (live) setRec({ won: me?.attackWins ?? 0, held: me?.defenseWins ?? 0 })
      })
      .catch(() => live && setRec(null))
    return () => {
      live = false
    }
  }, [enabled])
  return rec
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-pixel-sm text-[15px] text-muted">{label}</dt>
      <dd className="m-0 truncate border-b border-dotted border-shadow text-right text-[17px] leading-[1.1]">
        {value}
      </dd>
    </>
  )
}

export function TrainerCard() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth)
  const [renaming, setRenaming] = useState(false)
  const [picking, setPicking] = useState(false)
  const versusOpen = !!save && versusUnlocked(save, data)
  const record = useVersusRecord(versusOpen && auth.status === 'signed_in')
  if (!save) return null
  const me = playerOf(save)
  const look = avatarOf(playerAvatarId(save.player))
  const lookName = t(look.labelKey)
  const region = regionOf(save)
  const species = regionSpecies(data, region)
  const areas = linearAreas(data, region)
  const best = Math.max(0, ...save.box.map((p) => p.level))
  const regions = regionCases(save, data)

  if (renaming)
    return (
      <CharacterSelect
        initial={save.player}
        submitLabel={t('ui.settings.save')}
        compact
        onDone={(player) => {
          // Keeps the look: it is chosen on its own.
          mutateSave((s) => ({ ...s, player: { ...s.player, ...player } }))
          setRenaming(false)
        }}
      />
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 bg-[linear-gradient(rgb(var(--c-sky)),rgb(var(--c-paper))_60%)] px-2.5 pb-3 pt-2 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_5px_#5b8def,inset_0_0_0_7px_rgb(var(--c-edge)),inset_0_-10px_0_rgb(var(--c-sky-line))]">
        <div className="flex justify-between px-1.5 pt-1 font-pixel-sm text-[14px] uppercase tracking-[0.06em] text-[#2f5fb8] dark:text-[#8fb4ff]">
          <span>{t('ui.profile.title')}</span>
          <span>{t('ui.card.idNo', { n: idNumber(auth.userId ?? `${me.name}|${me.character}`) })}</span>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2.5 px-1">
          <TrainerLook src={look.src} w={96} h={124} zoom={2} className="bg-paper shadow-ring" />
          <div className="grid min-w-0 gap-1.5">
            <p className="m-0 flex min-w-0 items-center gap-2">
              <b className="min-w-0 truncate text-[26px] font-normal leading-none">
                {me.name || t('ui.settings.noName')}
              </b>
              <PixelButton
                size="sm"
                className="ml-auto shrink-0"
                aria-label={t('ui.card.rename')}
                onClick={() => setRenaming(true)}
              >
                {t('ui.settings.change')}
              </PixelButton>
            </p>
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
              <Stat label={t('ui.card.money')} value={money(save.gold)} />
              <Stat
                label={t('ui.card.dex')}
                value={`${save.pokedex.filter((d) => species.has(d)).length}/${species.size}`}
              />
              <Stat label={t('ui.card.best')} value={t('ui.common.level.short', { n: best })} />
              <Stat
                label={t('ui.card.areas')}
                value={`${areas.filter((a) => save.areaProgress[a.id]?.cleared).length}/${areas.length}`}
              />
              <Stat label={t('ui.card.shinies')} value={String(save.box.filter((p) => p.shiny).length)} />
              <Stat
                label={t('ui.card.versus')}
                value={
                  !versusOpen
                    ? t('ui.card.locked')
                    : record
                      ? t('ui.card.versusRecord', { won: record.won, held: record.held })
                      : '—'
                }
              />
            </dl>
          </div>
        </div>
        <ul
          className="m-0 flex list-none justify-center gap-1 border-t-2 border-sky-line p-0 pt-1"
          aria-label={t('ui.team.title')}
        >
          {teamOf(save).map((p) => (
            <li key={p.id} className="grid justify-items-center">
              <MiniSprite dex={p.dex} size={40} alt={data.species[p.dex]?.name ?? ''} />
              <small className="-mt-1 font-pixel-sm text-[13px] text-muted">
                {t('ui.common.level.short', { n: p.level })}
              </small>
            </li>
          ))}
        </ul>
      </div>

      {regions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[24px] font-normal leading-none">{t('ui.profile.badgeCase')}</h3>
          {regions.map((r) => (
            <div key={r.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] leading-none">{r.name}</span>
                <span className="ml-auto font-pixel-sm text-[15px] text-muted">
                  {t('ui.map.badges', { earned: r.earned, total: r.badges.length })}
                </span>
              </div>
              <ul
                aria-label={t('ui.map.badgesLabel', { earned: r.earned, total: r.badges.length })}
                className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-x-1 gap-y-2 bg-[#2b3a63] px-2 py-2.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_4px_0_#1b2647]"
              >
                {r.badges.map((b) => (
                  <li key={b.trainerId} className="grid justify-items-center gap-[3px] text-center">
                    <span className={cx(!b.earned && 'opacity-40')}>
                      <BadgeIcon badge={b.badge} earned={b.earned} size={36} />
                    </span>
                    <span
                      aria-hidden
                      className={cx(
                        'font-pixel-sm text-[13px] leading-none',
                        b.earned ? 'text-[#e3e9f2]' : 'text-[#b6c3d9]',
                      )}
                    >
                      {t(`badge.${slug(b.badge)}`)}
                    </span>
                  </li>
                ))}
                <li className="grid justify-items-center gap-[3px] text-center">
                  <span className={cx(!r.endgameCleared && 'opacity-40')}>
                    <CrownIcon
                      earned={r.endgameCleared}
                      size={36}
                      label={
                        r.endgameCleared
                          ? t('ui.card.crown')
                          : t('ui.profile.badgeLocked', { badge: t('ui.card.crown') })
                      }
                    />
                  </span>
                  <span
                    aria-hidden
                    className={cx(
                      'font-pixel-sm text-[13px] leading-none',
                      r.endgameCleared ? 'text-[#e3e9f2]' : 'text-[#b6c3d9]',
                    )}
                  >
                    {t('ui.card.crown')}
                  </span>
                </li>
              </ul>
            </div>
          ))}
          <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
            {t('ui.profile.crownHint')}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[24px] font-normal leading-none">{t('ui.profile.look')}</h3>
        <div className="flex items-center gap-2.5 bg-paper py-1 pl-1 pr-2 shadow-ring-line">
          <span role="img" aria-label={lookName} className="shrink-0">
            <TrainerLook src={look.src} w={44} h={48} />
          </span>
          <p className="m-0 min-w-0 flex-1 font-pixel-sm text-[15px] leading-[1.15] text-muted">
            {t('ui.card.lookIs', { look: lookName })}
          </p>
          <PixelButton
            size="sm"
            className="shrink-0"
            aria-label={t('ui.profile.lookTitle')}
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
          >
            {picking ? t('ui.card.done') : t('ui.settings.change')}
          </PixelButton>
        </div>
        {picking &&
          AVATAR_GROUPS.map(({ group, avatars }) => {
            const name = t(group === 'default' ? 'ui.profile.lookDefault' : `region.${group}`)
            return (
              <section key={group} className="flex flex-col gap-1.5">
                <h4 className="m-0 text-[19px] font-normal leading-none">{name}</h4>
                <div
                  role="radiogroup"
                  aria-label={name}
                  className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5"
                >
                  {avatars.map((a) => {
                    const label = t(a.labelKey)
                    const on = a.id === look.id
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={label}
                        title={label}
                        onClick={() =>
                          mutateSave((s) => (s.player ? { ...s, player: { ...s.player, avatar: a.id } } : s))
                        }
                        className={cx(
                          'grid min-h-[60px] place-items-center pt-1',
                          on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-ring-line',
                        )}
                      >
                        <TrainerLook src={a.src} w={44} h={52} />
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
      </section>
    </div>
  )
}
