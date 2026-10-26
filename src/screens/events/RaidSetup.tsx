// The Raids page's setup (docs/18 §3 "Teams"): your raid team — three Pokémon from any region's Box, fighting
// as copies at the team cap (their own dice) — and your group: up to two friends whose raid teams fight beside you. Slots
// left empty stay empty here; NPC trainers only fill them once you start. A progression raid's (docs/24) are its
// own: the team left on it, from its region's Box only, and the friends who left a team on it.
import { useState } from 'react'
import {
  getRegion,
  POKE_TYPES,
  progressRaidOf,
  progressRaidTeam,
  raidRecommended,
  raidTeam,
  raidTeamCap,
  RAID_RECOMMENDED_LEVEL,
  regionBox,
  setProgressRaidTeam,
  setRaidTeamIds,
  versusClosest,
  type GameData,
  type PokemonInstance,
  type PokeType,
  type RaidMon,
  type SaveData,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { RecommendedThumb } from '@/components/RecommendedThumb'
import { SearchField } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { speciesTypes } from '@/components/TypeMatchups'
import { SortSelect, TypeSelect } from '@/components/TypeSelect'
import { getLang, searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { fetchProgressRaidFriends, fetchRaidFriends, type RaidFriend } from '@/lib/raid'
import { mutateSave, pushToast, useGame } from '@/store/game'
import {
  groupOf,
  raidFriendSlots,
  sourceKey,
  syncProgressRaidTeam,
  syncRaidTeam,
  toggleRaidFriend,
  useRaidGroup,
  type RaidSource,
} from '@/store/raidBattle'
import { cx } from '@/theme/util'
import { TrainerName } from '@/components/TrainerName'
import { useTearIn } from './PortalRaid'
import { useShadowIn } from '@/components/Nightmare'

const TEAM_SIZE = 3

type TeamSort = 'recommended' | 'level' | 'dex' | 'az'

type Mon = { dex: number; level: number }

/** Three Pokémon minis, in order; the green thumb on those `recommended` says are worth bringing. */
function Minis({ team, recommended }: { team: (Mon & { shiny?: boolean })[]; recommended?: (m: Mon) => boolean }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      {team.map((m, i) => (
        <span key={i} className="relative">
          <MiniSprite dex={m.dex} size={32} className="-my-1" />
          {recommended?.(m) && <RecommendedThumb overlay size={12} />}
        </span>
      ))}
    </span>
  )
}

/** The engine's green-thumb rule for one raid (none without its raid Pokémon). */
const recommender = (data: GameData, boss: number | undefined, cap: number) => (m: Mon) =>
  boss != null && raidRecommended(data, m, boss, cap)

/** A raid's team (the day's raid's, or the one left on a progression raid) and what its editor offers. */
interface TeamSetup {
  team: RaidMon[]
  cap: number
  title: string
  hint: string
  /** The editor's instruction: which Box the three come from, and their cap. */
  pick: string
  /** The Pokémon the editor lists, with their region. */
  candidates: { inst: PokemonInstance; region: string }[]
  /** The raid Pokémon, for the green thumbs and the Recommended sort. */
  boss?: number
  save: (ids: string[]) => Promise<boolean>
}

function teamSetup(
  source: RaidSource,
  save: SaveData,
  data: GameData,
  t: (key: string, vars?: Record<string, string | number>) => string,
  boss?: number,
): TeamSetup | null {
  if (source.kind === 'daily') {
    const cap = boss != null ? raidTeamCap(data, boss, 'daily') : data.config.events.raid.teamCap
    return {
      team: raidTeam(save, data),
      cap,
      title: t('ui.raid.teamTitle'),
      hint: t('ui.raid.teamHint', { cap }),
      pick: t('ui.raid.teamPick', { cap }),
      candidates: versusClosest(save, data, Number.MAX_SAFE_INTEGER),
      boss,
      save: async (ids) => {
        mutateSave((s) => setRaidTeamIds(s, ids))
        return useGame.getState().auth.status === 'signed_in' ? syncRaidTeam(true) : true
      },
    }
  }
  const raid = progressRaidOf(data, source.key)
  if (!raid) return null
  const cap = raidTeamCap(data, raid.dex, 'progress', raid.areaId)
  const region = getRegion(data, raid.region)?.name ?? raid.region
  return {
    team: progressRaidTeam(save, data, raid),
    cap,
    title: t('ui.raid.progress.teamTitle', { region }),
    hint: t('ui.raid.progress.teamHint', { cap, region }),
    pick: t('ui.raid.progress.teamHint', { cap, region }),
    candidates: [...regionBox(save, raid.region)]
      .filter((p) => !!data.species[p.dex])
      .sort((a, b) => b.level - a.level)
      .map((inst) => ({ inst, region: raid.region })),
    boss: raid.dex,
    save: async (ids) => {
      mutateSave((s) => setProgressRaidTeam(s, raid.key, ids))
      return useGame.getState().auth.status === 'signed_in' ? syncProgressRaidTeam(raid, true) : true
    },
  }
}

/** A raid's team, and the editor behind its button. */
export function RaidTeamSection({
  source = { kind: 'daily' },
  boss,
  portal = false,
  nightmare = false,
}: {
  source?: RaidSource
  /** The day's raid Pokémon (a progression raid knows its own). */
  boss?: number
  /** Giratina's raid (docs/15 §27): its editor in the Distortion World's violet night, its cards glitching now and then. */
  portal?: boolean
  /** Darkrai's raid (docs/15 §29): its editor in the moonlit night, its cards darkening as the shadow passes. */
  nightmare?: boolean
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [editing, setEditing] = useState(false)
  if (!save) return null
  const setup = teamSetup(source, save, data, t, boss)
  if (!setup) return null
  const team = setup.team
  const recommended = recommender(data, setup.boss, setup.cap)
  return (
    <section aria-labelledby="raid-team-h" className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <h2 id="raid-team-h" className="m-0 text-[22px] font-normal leading-none">
          {setup.title}
        </h2>
        <PixelButton size="sm" className="ml-auto" onClick={() => setEditing(true)}>
          {t('ui.raid.teamEdit')}
        </PixelButton>
      </div>
      <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
        {team.map((m) => (
          <li
            key={m.id}
            data-glitch={portal || nightmare || undefined}
            className="grid justify-items-center gap-0.5 bg-paper px-1 pb-1.5 pt-1 shadow-ring"
          >
            <span className="relative">
              <MiniSprite dex={m.dex} size={48} />
              {recommended(m) && <RecommendedThumb overlay />}
            </span>
            <span className="max-w-full truncate text-[17px] leading-none">{data.species[m.dex]?.name}</span>
            <small className="font-pixel-sm text-[16px] leading-none text-muted">{t('ui.common.level.short', { n: m.level })}</small>
          </li>
        ))}
      </ul>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{setup.hint}</p>
      {editing && (
        <TeamEditor
          setup={setup}
          initial={team.map((m) => m.id)}
          onClose={() => setEditing(false)}
          portal={portal}
          nightmare={nightmare}
        />
      )}
    </section>
  )
}

/**
 * Pick up to three (the day's raid: every region's Box; a progression raid: its region's), strongest first unless the
 * sort says otherwise; Save keeps them (and tells the server, signed in).
 */
function TeamEditor({
  setup,
  initial,
  onClose,
  portal = false,
  nightmare = false,
}: {
  setup: TeamSetup
  initial: string[]
  onClose: () => void
  portal?: boolean
  nightmare?: boolean
}) {
  const { t } = useT()
  const tear = useTearIn(portal)
  const shade = useShadowIn(nightmare)
  const data = useGame((s) => s.data)
  const cap = setup.cap
  const [picks, setPicks] = useState(initial)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<TeamSort>(setup.boss != null ? 'recommended' : 'level')
  const [type, setType] = useState<PokeType | 'all'>('all')
  const [saving, setSaving] = useState(false)
  const candidates = setup.candidates
  const manyRegions = new Set(candidates.map((c) => c.region)).size > 1
  const types = POKE_TYPES.filter((ty) => candidates.some((c) => speciesTypes(data, c.inst.dex).includes(ty)))
  const name = (dex: number) => data.species[dex]?.name ?? ''
  const isRecommended = recommender(data, setup.boss, cap)
  const recommended = new Set(candidates.filter((c) => isRecommended(c.inst)).map((c) => c.inst.id))
  const collator = new Intl.Collator(getLang())
  const needle = searchFold(q)
  // The search and the type narrow the list; picks they hide stay picked. Every order falls back to the next key so
  // two copies of a species always read the same way. Recommended: the green thumbs first by Pokédex No. (the user's
  // rule, 2026-10-16), then the rest strongest first.
  const shown = candidates
    .filter(
      (c) =>
        (!needle || searchFold(name(c.inst.dex)).includes(needle)) &&
        (type === 'all' || speciesTypes(data, c.inst.dex).includes(type)),
    )
    .sort(
      ({ inst: a }, { inst: b }) =>
        (sort === 'recommended'
          ? Number(recommended.has(b.id)) - Number(recommended.has(a.id)) ||
            (recommended.has(a.id) ? a.dex - b.dex : b.level - a.level)
          : 0) ||
        (sort === 'az' ? collator.compare(name(a.dex), name(b.dex)) : 0) ||
        (sort === 'level' ? b.level - a.level : 0) ||
        a.dex - b.dex ||
        b.level - a.level,
    )
  const valid = picks.filter((id) => candidates.some((c) => c.inst.id === id))
  const toggle = (id: string) =>
    setPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= TEAM_SIZE ? cur : [...cur, id]))
  const submit = async () => {
    if (!valid.length || saving) return
    setSaving(true)
    const online = await setup.save(valid)
    setSaving(false)
    if (online) pushToast(t('ui.raid.teamSaved'), 'good')
    onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={setup.title}
      className={portal ? cx('dw-scope dw-modal', tear) : nightmare ? cx('nm-scope nm-modal', shade) : undefined}
      footer={
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2.5">
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
        <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{setup.pick}</p>
        <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0" aria-label={setup.title}>
          {Array.from({ length: TEAM_SIZE }, (_, i) => {
            const c = candidates.find((x) => x.inst.id === valid[i])
            return (
              <li
                key={i}
                className={cx(
                  'relative grid min-h-[96px] place-items-center px-1 pb-1.5 pt-[18px] text-center',
                  c ? 'bg-paper shadow-card' : 'bg-well font-pixel-sm text-[16px] text-ink shadow-ring-line',
                )}
              >
                <span className="light-scope absolute left-1.5 top-[5px] bg-night px-[5px] pb-0.5 pt-px font-pixel-sm text-[16px] leading-none text-gold-light">
                  {i + 1}
                </span>
                {c ? (
                  <span className="grid justify-items-center gap-0.5">
                    <span className="relative">
                      <SpriteImg dex={c.inst.dex} size={48} shiny={c.inst.shiny} />
                      {recommended.has(c.inst.id) && <RecommendedThumb overlay />}
                    </span>
                    <small className="font-pixel-sm text-[16px] text-muted">{t('ui.common.level.short', { n: Math.min(c.inst.level, cap) })}</small>
                  </span>
                ) : (
                  t('ui.versus.slotEmpty')
                )}
              </li>
            )
          })}
        </ol>
        <SearchField id="raid-team-q" value={q} onChange={setQ} label={t('ui.versus.searchLabel')} placeholder={t('ui.versus.search')} />
        {candidates.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <SortSelect
              label={t('ui.board.sortBy')}
              value={sort}
              onChange={setSort}
              options={[
                ...(setup.boss != null ? [{ id: 'recommended' as const, label: t('ui.raid.sortRecommended') }] : []),
                { id: 'level', label: t('ui.raid.sortLevel') },
                { id: 'dex', label: t('ui.raid.sortDex') },
                { id: 'az', label: t('ui.raid.sortAz') },
              ]}
              className="min-w-0 flex-[1_1_140px]"
            />
            {types.length > 1 && (
              <TypeSelect value={type} onChange={setType} types={types} className="min-w-0 flex-[1_1_140px]" />
            )}
          </div>
        )}
        {setup.boss != null && (
          <p className="m-0 flex items-start gap-1.5 font-pixel-sm text-[16px] leading-tight text-muted">
            <RecommendedThumb />
            {t('ui.raid.recommendedNote', {
              level: Math.min(RAID_RECOMMENDED_LEVEL, cap),
              name: data.species[setup.boss]?.name ?? '',
            })}
          </p>
        )}
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
                    <small className="font-pixel-sm text-[16px] text-muted">
                      {t('ui.common.level.short', { n: Math.min(p.level, cap) })}
                      {p.level > cap && ` (${p.level})`}
                      {manyRegions && ` · ${getRegion(data, region)?.name ?? region}`}
                    </small>
                  </span>
                  {recommended.has(p.id) && <RecommendedThumb size={18} />}
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

/**
 * Your group: you, then a slot per friend (an empty one waits for an NPC trainer, picked at the start). A progression
 * raid's friends are the ones who left a team on it.
 */
export function RaidGroupSection({
  source = { kind: 'daily' },
  boss,
  portal = false,
  nightmare = false,
}: {
  source?: RaidSource
  /** The day's raid Pokémon (a progression raid knows its own). */
  boss?: number
  /** Giratina's raid (docs/15 §27): its friends' sheet in the Distortion World's violet night. */
  portal?: boolean
  /** Darkrai's raid (docs/15 §29): its friends' sheet in the moonlit night. */
  nightmare?: boolean
}) {
  const { t, tPlural } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const key = sourceKey(source)
  const group = useRaidGroup()
  const friends = groupOf(key, group)
  const [picking, setPicking] = useState(false)
  const [load, setLoad] = useState<FriendsLoad>({ state: 'loading' })
  if (!save) return null
  const slots = raidFriendSlots()
  const progress = source.kind === 'progress'
  const raid = progress ? progressRaidOf(data, source.key) : null
  const myTeam = progress ? (raid ? progressRaidTeam(save, data, raid) : []) : raidTeam(save, data)
  // Friends' teams come at their own levels (0065), like yours: the fight caps them, all but their dice.
  const recommended = raid
    ? recommender(data, raid.dex, raidTeamCap(data, raid.dex, 'progress', raid.areaId))
    : recommender(data, progress ? undefined : boss, boss != null ? raidTeamCap(data, boss, 'daily') : data.config.events.raid.teamCap)
  const toggle = (f: RaidFriend) => toggleRaidFriend(f, key)
  const open = async () => {
    setPicking(true)
    setLoad({ state: 'loading' })
    const rows = progress ? await fetchProgressRaidFriends(source.key) : await fetchRaidFriends()
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
          <Minis team={myTeam} recommended={recommended} />
        </li>
        {Array.from({ length: slots }, (_, i) => {
          const f = friends[i]
          if (f)
            return (
              <li key={f.userId} className="flex min-h-[52px] items-center gap-2 bg-paper py-1 pl-1 pr-1 shadow-ring">
                <TrainerSprite src={avatarOf(f.avatar).src} size={44} />
                <span className="grid min-w-0 flex-1 leading-[1.05]">
                  <b className="truncate text-[18px] font-normal">
                    <TrainerName name={f.name} rich={f.rich} />
                  </b>
                  <small className="font-pixel-sm text-[16px] text-muted">{tPlural('ui.raid.helped', f.helped)}</small>
                </span>
                <Minis team={f.team} recommended={recommended} />
                <button
                  type="button"
                  onClick={() => toggle(f)}
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
                  <small className="font-pixel-sm text-[16px] text-muted">{t('ui.raid.slotNpc')}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t('ui.raid.friendsTitle')}
        className={portal ? 'dw-scope dw-modal' : nightmare ? 'nm-scope nm-modal' : undefined}
      >
        <div className="grid gap-2">
          <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{t(progress ? 'ui.raid.progress.friendsHint' : 'ui.raid.friendsHint')}</p>
          {load.state === 'loading' && <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.common.loading')}</p>}
          {load.state === 'offline' && <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.raid.friendsOffline')}</p>}
          {load.state === 'ready' && load.rows.length === 0 && (
            <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t(progress ? 'ui.raid.progress.friendsEmpty' : 'ui.raid.friendsEmpty')}</p>
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
                      onClick={() => toggle(f)}
                      className={cx(
                        'flex min-h-[56px] w-full items-center gap-2 py-1 pl-1 pr-2.5 text-left disabled:opacity-50',
                        on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
                      )}
                    >
                      <TrainerSprite src={avatarOf(f.avatar).src} size={44} />
                      <span className="grid min-w-0 flex-1 leading-[1.05]">
                        <b className="truncate text-[18px] font-normal">
                    <TrainerName name={f.name} rich={f.rich} />
                  </b>
                        <small className="font-pixel-sm text-[16px] text-muted">{tPlural('ui.raid.helped', f.helped)}</small>
                      </span>
                      <Minis team={f.team} recommended={recommended} />
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
