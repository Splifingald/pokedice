// Kitchen sink: the raid pieces of docs/24. The NPC partners pop-up in each of its states (one or two empty slots,
// none picked, one picked, ready to start, a trainer with no class to name it), and a progression raid's card open and
// caught. The raid overhaul's (docs/40): each kind of raid's rules, the fight's marks, the rules pop-up.
import { useMemo, useState } from 'react'
import { MEGA_RAIDS, raidNpcOffer, type TodayRaid } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { pushToast, useGame } from '@/store/game'
import { RaidCard } from '@/screens/events/RaidPage'
import { RaidNpcPicker } from '@/screens/events/RaidNpcPicker'
import { RaidRulesInfo, raidRuleRows } from '@/screens/events/RaidRules'
import { RaidMarks } from '@/screens/events/RaidView'
import { RuleList } from '@/components/RulesModal'
import { useT } from '@/i18n/react'

/** The pop-up's raid Pokémon: the green thumbs on the NPCs' Pokémon that hit it super effectively. */
const MEWTWO = 150

interface PickerState {
  label: string
  need: number
  initial: number[]
  friends: number
  nameless?: boolean
}

const STATES: PickerState[] = [
  { label: 'Two empty slots', need: 2, initial: [], friends: 0 },
  { label: 'One of two picked', need: 2, initial: [1], friends: 0 },
  { label: 'Both picked: START', need: 2, initial: [0, 2], friends: 0 },
  { label: 'One empty slot (a friend in)', need: 1, initial: [], friends: 1 },
  { label: 'Unnamed trainers', need: 2, initial: [3], friends: 0, nameless: true },
]

export function RaidBits() {
  const data = useGame((s) => s.data)
  const player = useGame((s) => s.save?.player)
  const [open, setOpen] = useState<PickerState | null>(null)
  // A fixed seed: the same four every time the page opens, like a player's offer across a refresh.
  const offer = useMemo(() => raidNpcOffer(data, ['kanto'], 20261012), [data])
  const shown = open?.nameless ? offer.map((o) => ({ ...o, owner: null })) : offer
  const group = [
    { name: 'You', look: avatarOf(playerAvatarId(player)).src },
    ...(open?.friends ? [{ name: 'Mika', look: avatarOf('johto/silver').src }] : []),
  ]
  const card = (dex: number, areaName: string, caught: boolean): TodayRaid => ({
    day: '',
    dex,
    shiny: false,
    areaId: data.areas.find((a) => a.name === areaName)?.id ?? data.areas[0]?.id ?? '',
    caught,
    tries: 0,
  })
  return (
    <div className="grid w-full max-w-md gap-3">
      <div className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <PixelButton key={s.label} size="sm" onClick={() => setOpen(s)}>
            {s.label}
          </PixelButton>
        ))}
      </div>
      {open && (
        <RaidNpcPicker
          key={open.label}
          open
          offer={shown}
          need={open.need}
          group={group}
          level={data.config.events.raid.progress.teamCap}
          initial={open.initial}
          boss={MEWTWO}
          onBack={() => setOpen(null)}
          onStart={(picked) => {
            setOpen(null)
            pushToast(`Start with ${picked.length} NPC`, 'info')
          }}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <RaidCard raid={card(144, 'Seafoam Islands', false)} msLeft={null} kind="progress" />
        <RaidCard raid={card(150, 'Cerulean Cave', true)} msLeft={null} kind="progress" />
      </div>
    </div>
  )
}

/** The raid overhaul's pieces (docs/40) in each state, the switch on for this page only. */
const OVERHAUL_RAIDS: { label: string; dex: number; kind: 'progress' | 'daily' }[] = [
  { label: 'Trio: Articuno (snow, +1 die)', dex: 144, kind: 'progress' },
  { label: 'Box legend: Lugia (rain, halved first hit, charged attack)', dex: 249, kind: 'progress' },
  { label: 'Apex: Mewtwo (combo shield, charged attack, spread last bar)', dex: 150, kind: 'progress' },
  { label: 'Ultra Beast: Stakataka (Beast Boost, Trick Room)', dex: 805, kind: 'progress' },
  { label: 'Arceus, the daily raid (plates)', dex: 493, kind: 'daily' },
  { label: 'Mega raid: Mega Mewtwo X', dex: 10043, kind: 'progress' },
  { label: 'Kyurem (no last bar)', dex: 646, kind: 'progress' },
]

const MARKS: { label: string; fx: Parameters<typeof RaidMarks>[0]['fx'] }[] = [
  { label: 'Nothing yet', fx: { raidField: { weather: null, terrain: null }, charge: null, shield: null, final: false } },
  { label: 'Rain', fx: { raidField: { weather: 'rain', terrain: null }, charge: null, shield: null, final: false } },
  { label: 'Grassy terrain, charging', fx: { raidField: { weather: null, terrain: 'grassy' }, charge: { move: 'spread', fires: 3 }, shield: null, final: false } },
  { label: 'Shield 42 of 120', fx: { raidField: { weather: null, terrain: null }, charge: null, shield: { hp: 42, max: 120 }, final: false } },
  { label: 'Sun, last bar', fx: { raidField: { weather: 'sun', terrain: null }, charge: null, shield: null, final: true } },
]

export function RaidOverhaulBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [info, setInfo] = useState(false)
  const areaOf = (dex: number) =>
    data.areas.find((a) => a.legendaryBoss?.some((b) => b.dex === (MEGA_RAIDS[dex]?.base ?? dex) && b.raid))?.id
  return (
    <div className="grid gap-3">
      <PixelButton onClick={() => setInfo(true)}>Rules pop-up (INFO)</PixelButton>
      <RaidRulesInfo open={info} onClose={() => setInfo(false)} />
      <div className="flex flex-wrap gap-3">
        {MARKS.map((m) => (
          <div key={m.label} className="grid gap-1">
            <small className="text-muted">{m.label}</small>
            <span className="flex min-h-[20px] flex-wrap items-center gap-1 bg-panel p-1.5 shadow-ring-line">
              <RaidMarks fx={m.fx} />
            </span>
          </div>
        ))}
      </div>
      {OVERHAUL_RAIDS.map((r) => (
        <div key={r.label} className="grid gap-1.5 bg-paper p-3 shadow-card">
          <b className="text-[18px] font-normal">{r.label}</b>
          <RuleList rules={raidRuleRows(data, r.dex, r.kind, r.kind === 'daily' ? undefined : areaOf(r.dex), t) ?? []} />
        </div>
      ))}
    </div>
  )
}
