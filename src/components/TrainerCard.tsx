// The trainer card, opened from the avatar in the top bar: your look at 2×, your name (Change), an ID number (your
// friend ID once you have one), the numbers that say how far you are (the badges counted across every region), your
// team, and the look other trainers see on the leaderboard and in Versus. A friend's card (docs/16) is drawn with the
// same pieces: CardFrame, Stat and CardTeam.
import { useEffect, useState, type ReactNode } from 'react'
import { badgesHeld, isRich, linearAreas, looksOn, regionOf, regionSpecies, teamOf, versusUnlocked } from '@/engine'
import { useT } from '@/i18n/react'
import { AVATAR_GROUPS, avatarName, avatarOf, playerAvatarId } from '@/lib/avatars'
import { money } from '@/lib/format'
import { formatCode, useFriends } from '@/lib/friends'
import { fetchVersusBoard } from '@/lib/versus'
import { CharacterSelect } from '@/screens/NewGame'
import { mutateSave, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelButton } from './PixelButton'
import { MiniSprite } from './SpriteImg'
import { playerOf } from './TrainerArt'
import { TrainerLook } from './TrainerLook'
import { TrainerLooks } from './TrainerLooks'
import { TrainerName } from './TrainerName'

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

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-pixel-sm text-[16px] text-muted">{label}</dt>
      <dd className="m-0 truncate border-b border-dotted border-shadow text-right text-[17px] leading-[1.1]">
        {value}
      </dd>
    </>
  )
}

/** The blue trainer card: a small caps label and a note on top (an ID, "friends since"), then whatever it holds. */
export function CardFrame({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 bg-[linear-gradient(rgb(var(--c-sky)),rgb(var(--c-paper))_60%)] px-2.5 pb-3 pt-2 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_5px_#5b8def,inset_0_0_0_7px_rgb(var(--c-edge)),inset_0_-10px_0_rgb(var(--c-sky-line))]">
      <div className="flex justify-between gap-2 px-1.5 pt-1 font-pixel-sm text-[16px] uppercase tracking-[0.06em] text-[#2f5fb8] dark:text-[#8fb4ff]">
        <span>{label}</span>
        {note && <span className="truncate">{note}</span>}
      </div>
      {children}
    </div>
  )
}

/** A team under the card's numbers: menu icons with their levels. */
export function CardTeam({ team, label }: { team: { dex: number; level: number }[]; label: string }) {
  const { t } = useT()
  const species = useGame((s) => s.data.species)
  return (
    <ul className="m-0 flex list-none justify-center gap-1 border-t-2 border-sky-line p-0 pt-1" aria-label={label}>
      {team.map((p, i) => (
        <li key={i} className="grid justify-items-center">
          <MiniSprite dex={p.dex} size={40} alt={species[p.dex]?.name ?? ''} />
          <small className="-mt-1 font-pixel-sm text-[16px] text-muted">{t('ui.common.level.short', { n: p.level })}</small>
        </li>
      ))}
    </ul>
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
  // Your friend ID stands in for the ID number once this device knows it (docs/16).
  const friendCode = useFriends((st) => (st.userId && st.userId === auth.userId ? st.code : null))
  if (!save) return null
  const me = playerOf(save)
  const look = avatarOf(playerAvatarId(save.player))
  const lookName = avatarName(look, t)
  const region = regionOf(save)
  const species = regionSpecies(data, region)
  const areas = linearAreas(data, region)
  const best = Math.max(0, ...save.box.map((p) => p.level))

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
      <CardFrame
        label={t('ui.profile.title')}
        note={
          friendCode
            ? t('ui.card.idNo', { n: formatCode(friendCode) })
            : t('ui.card.idNo', { n: idNumber(auth.userId ?? `${me.name}|${me.character}`) })
        }
      >
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2.5 px-1">
          <TrainerLook src={look.src} w={96} h={124} zoom={2} className="bg-paper shadow-ring" />
          <div className="grid min-w-0 gap-1.5">
            <p className="m-0 flex min-w-0 items-center gap-2">
              <b className="min-w-0 truncate text-[26px] font-normal leading-none">
                <TrainerName name={me.name || t('ui.settings.noName')} rich={!!save && isRich(save, data)} />
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
              <Stat label={t('ui.card.badges')} value={String(badgesHeld(save, data))} />
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
        <CardTeam team={teamOf(save)} label={t('ui.team.title')} />
      </CardFrame>

      {/* Trainer looks (docs/31) take the free picker's place while the admin's switch is on. */}
      {looksOn(data) ? (
        <TrainerLooks />
      ) : (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[24px] font-normal leading-none">{t('ui.profile.look')}</h3>
          <div className="flex items-center gap-2.5 bg-paper py-1 pl-1 pr-2 shadow-ring-line">
            <span role="img" aria-label={lookName} className="shrink-0">
              <TrainerLook src={look.src} w={44} h={48} />
            </span>
            <p className="m-0 min-w-0 flex-1 font-pixel-sm text-[16px] leading-[1.15] text-muted">
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
          {/* Every look in one grid, no region headings; picking one closes it. */}
          {picking && (
            <div
              role="radiogroup"
              aria-label={t('ui.profile.lookTitle')}
              className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5"
            >
              {AVATAR_GROUPS.flatMap(({ avatars }) => avatars).map((a) => {
                const label = avatarName(a, t)
                const on = a.id === look.id
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={label}
                    title={label}
                    onClick={() => {
                      mutateSave((s) => (s.player ? { ...s, player: { ...s.player, avatar: a.id } } : s))
                      setPicking(false)
                    }}
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
          )}
        </section>
      )}
    </div>
  )
}
