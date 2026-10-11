// The Raids page's setup (docs/18 §3 "Teams"): your raid team — three Pokémon from any region's Box, fighting as
// copies at the team cap — and your group: up to two friends whose raid teams fight beside you. Slots left empty stay
// empty here; NPC trainers only fill them once you start.
import { useMemo, useState } from 'react'
import { raidTeam, setRaidTeamIds, versusClosest, getRegion } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SearchField } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { fetchRaidFriends, type RaidFriend } from '@/lib/raid'
import { mutateSave, pushToast, useGame } from '@/store/game'
import { syncRaidTeam, toggleRaidFriend, useRaidGroup } from '@/store/raidBattle'
import { cx } from '@/theme/util'

const TEAM_SIZE = 3

/** Three Pokémon minis, in order. */
function Minis({ team }: { team: { dex: number; shiny?: boolean }[] }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      {team.map((m, i) => (
        <MiniSprite key={i} dex={m.dex} size={32} className="-my-1" />
      ))}
    </span>
  )
}

/** Your raid team, and the editor behind its button. */
export function RaidTeamSection() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [editing, setEditing] = useState(false)
  if (!save) return null
  const team = raidTeam(save, data)
  return (
    <section aria-labelledby="raid-team-h" className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <h2 id="raid-team-h" className="m-0 text-[22px] font-normal leading-none">
          {t('ui.raid.teamTitle')}
        </h2>
        <PixelButton size="sm" className="ml-auto" onClick={() => setEditing(true)}>
          {t('ui.raid.teamEdit')}
        </PixelButton>
      </div>
      <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
        {team.map((m) => (
          <li key={m.id} className="grid justify-items-center gap-0.5 bg-paper px-1 pb-1.5 pt-1 shadow-ring">
            <MiniSprite dex={m.dex} size={48} />
            <span className="max-w-full truncate text-[17px] leading-none">{data.species[m.dex]?.name}</span>
            <small className="font-pixel-sm text-[14px] leading-none text-muted">{t('ui.common.level.short', { n: m.level })}</small>
          </li>
        ))}
      </ul>
      <p className="m-0 font-pixel-sm text-[14px] leading-tight text-muted">{t('ui.raid.teamHint', { cap: data.config.events.raid.teamCap })}</p>
      {editing && <TeamEditor initial={team.map((m) => m.id)} onClose={() => setEditing(false)} />}
    </section>
  )
}

/** Pick up to three, from every region's Box, strongest first; Save keeps them (and tells the server, signed in). */
function TeamEditor({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const cap = data.config.events.raid.teamCap
  const [picks, setPicks] = useState(initial)
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const candidates = useMemo(() => versusClosest(save, data, Number.MAX_SAFE_INTEGER), [save, data])
  const manyRegions = new Set(candidates.map((c) => c.region)).size > 1
  const needle = searchFold(q)
  const shown = needle ? candidates.filter((c) => searchFold(data.species[c.inst.dex]?.name ?? '').includes(needle)) : candidates
  const valid = picks.filter((id) => candidates.some((c) => c.inst.id === id))
  const toggle = (id: string) =>
    setPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= TEAM_SIZE ? cur : [...cur, id]))
  const submit = async () => {
    if (!valid.length || saving) return
    setSaving(true)
    mutateSave((s) => setRaidTeamIds(s, valid))
    const online = signedIn ? await syncRaidTeam(true) : true
    setSaving(false)
    if (online) pushToast(t('ui.raid.teamSaved'), 'good')
    onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={t('ui.raid.teamTitle')}
      footer={
        <div className="grid grid-cols-[1fr_1.6fr] gap-2.5">
          <PixelButton disabled={!valid.length || saving} onClick={() => setPicks([])}>
            {t('ui.versus.clear')}
          </PixelButton>
          <PixelButton variant="primary" disabled={!valid.length || saving} onClick={() => void submit()}>
            {saving ? t('ui.common.loading') : t('ui.raid.teamSave')}
          </PixelButton>
        </div>
      }
    >
      <div className="grid gap-2">
        <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{t('ui.raid.teamPick', { cap })}</p>
        <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0" aria-label={t('ui.raid.teamTitle')}>
          {Array.from({ length: TEAM_SIZE }, (_, i) => {
            const c = candidates.find((x) => x.inst.id === valid[i])
            return (
              <li
                key={i}
                className={cx(
                  'relative grid min-h-[96px] place-items-center px-1 pb-1.5 pt-[18px] text-center',
                  c ? 'bg-paper shadow-card' : 'bg-well font-pixel-sm text-[14px] text-ink shadow-ring-line',
                )}
              >
                <span className="light-scope absolute left-1.5 top-[5px] bg-night px-[5px] pb-0.5 pt-px font-pixel-sm text-[14px] leading-none text-gold-light">
                  {i + 1}
                </span>
                {c ? (
                  <span className="grid justify-items-center gap-0.5">
                    <SpriteImg dex={c.inst.dex} size={48} shiny={c.inst.shiny} />
                    <small className="font-pixel-sm text-[13px] text-muted">{t('ui.common.level.short', { n: Math.min(c.inst.level, cap) })}</small>
                  </span>
                ) : (
                  t('ui.versus.slotEmpty')
                )}
              </li>
            )
          })}
        </ol>
        <SearchField id="raid-team-q" value={q} onChange={setQ} label={t('ui.versus.searchLabel')} placeholder={t('ui.versus.search')} />
        {shown.length === 0 && <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.search.noMatch')}</p>}
        <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
          {shown.map(({ inst: p, region }) => {
            const order = valid.indexOf(p.id)
            const name = data.species[p.dex]?.name ?? t('ui.common.pokemon')
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={order >= 0}
                  onClick={() => toggle(p.id)}
                  className={cx(
                    'flex min-h-[52px] w-full items-center gap-2 py-1.5 pl-1.5 pr-2.5 text-left',
                    order >= 0 ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
                  )}
                >
                  <MiniSprite dex={p.dex} size={40} className="-my-1" />
                  <span className="grid min-w-0 flex-1 leading-[1.05]">
                    <b className="truncate text-[18px] font-normal">{name}</b>
                    <small className="font-pixel-sm text-[14px] text-muted">
                      {t('ui.common.level.short', { n: Math.min(p.level, cap) })}
                      {p.level > cap && ` (${p.level})`}
                      {manyRegions && ` · ${getRegion(data, region)?.name ?? region}`}
                    </small>
                  </span>
                  {order >= 0 && (
                    <span className="light-scope grid h-7 w-7 shrink-0 place-items-center bg-night text-[18px] leading-none text-gold-light">
                      {order + 1}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Sheet>
  )
}

type FriendsLoad = { state: 'loading' } | { state: 'ready'; rows: RaidFriend[] } | { state: 'offline' }

/** Your group: you, then a slot per friend (an empty one waits for an NPC trainer, who only comes at the start). */
export function RaidGroupSection() {
  const { t, tPlural } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const friends = useRaidGroup((s) => s.friends)
  const [picking, setPicking] = useState(false)
  const [load, setLoad] = useState<FriendsLoad>({ state: 'loading' })
  if (!save) return null
  const slots = Math.min(2, data.config.events.raid.maxFriends)
  const open = async () => {
    setPicking(true)
    setLoad({ state: 'loading' })
    const rows = await fetchRaidFriends()
    setLoad(rows ? { state: 'ready', rows: rows.filter((r) => r.team.length > 0) } : { state: 'offline' })
  }
  return (
    <section aria-labelledby="raid-group-h" className="grid gap-1.5">
      <h2 id="raid-group-h" className="m-0 text-[22px] font-normal leading-none">
        {t('ui.raid.groupTitle')}
      </h2>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        <li className="flex min-h-[52px] items-center gap-2 bg-paper py-1 pl-1 pr-2.5 shadow-ring">
          <TrainerSprite src={avatarOf(playerAvatarId(save.player)).src} size={44} />
          <b className="min-w-0 flex-1 truncate text-[18px] font-normal">{t('ui.raid.you')}</b>
          <Minis team={raidTeam(save, data)} />
        </li>
        {Array.from({ length: slots }, (_, i) => {
          const f = friends[i]
          if (f)
            return (
              <li key={f.userId} className="flex min-h-[52px] items-center gap-2 bg-paper py-1 pl-1 pr-1 shadow-ring">
                <TrainerSprite src={avatarOf(f.avatar).src} size={44} />
                <span className="grid min-w-0 flex-1 leading-[1.05]">
                  <b className="truncate text-[18px] font-normal">{f.name}</b>
                  <small className="font-pixel-sm text-[13px] text-muted">{tPlural('ui.raid.helped', f.helped)}</small>
                </span>
                <Minis team={f.team} />
                <button
                  type="button"
                  onClick={() => toggleRaidFriend(f)}
                  aria-label={t('ui.raid.removeFriend', { name: f.name })}
                  className="grid min-h-[44px] min-w-[44px] place-items-center text-xl text-muted"
                >
                  ✕
                </button>
              </li>
            )
          return (
            <li key={`slot-${i}`}>
              <button
                type="button"
                onClick={() => (signedIn ? void open() : pushToast(t('ui.raid.friendsSignIn'), 'info'))}
                className="flex min-h-[52px] w-full items-center gap-2 bg-well px-2.5 text-left shadow-ring-line"
              >
                <span className="grid h-9 w-9 place-items-center bg-paper text-[22px] leading-none shadow-ring-line" aria-hidden>
                  +
                </span>
                <span className="grid min-w-0 flex-1 leading-[1.05]">
                  <b className="truncate text-[18px] font-normal">{t('ui.raid.addFriend')}</b>
                  <small className="font-pixel-sm text-[13px] text-muted">{t('ui.raid.slotNpc')}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Sheet open={picking} onClose={() => setPicking(false)} title={t('ui.raid.friendsTitle')}>
        <div className="grid gap-2">
          <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{t('ui.raid.friendsHint')}</p>
          {load.state === 'loading' && <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.common.loading')}</p>}
          {load.state === 'offline' && <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.raid.friendsOffline')}</p>}
          {load.state === 'ready' && load.rows.length === 0 && (
            <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.raid.friendsEmpty')}</p>
          )}
          {load.state === 'ready' && (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {load.rows.map((f) => {
                const on = friends.some((x) => x.userId === f.userId)
                const full = !on && friends.length >= slots
                return (
                  <li key={f.userId}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={full}
                      onClick={() => toggleRaidFriend(f)}
                      className={cx(
                        'flex min-h-[56px] w-full items-center gap-2 py-1 pl-1 pr-2.5 text-left disabled:opacity-50',
                        on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
                      )}
                    >
                      <TrainerSprite src={avatarOf(f.avatar).src} size={44} />
                      <span className="grid min-w-0 flex-1 leading-[1.05]">
                        <b className="truncate text-[18px] font-normal">{f.name}</b>
                        <small className="font-pixel-sm text-[13px] text-muted">{tPlural('ui.raid.helped', f.helped)}</small>
                      </span>
                      <Minis team={f.team} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <PixelButton variant="primary" onClick={() => setPicking(false)}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      </Sheet>
    </section>
  )
}
