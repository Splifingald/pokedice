// Kitchen sink: the raid pieces of docs/24. The NPC partners pop-up in each of its states (one or two empty slots,
// none picked, one picked, ready to start, a trainer with no class to name it), and a progression raid's card open and
// caught.
import { useMemo, useState } from 'react'
import { raidNpcOffer, type TodayRaid } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { pushToast, useGame } from '@/store/game'
import { RaidCard } from '@/screens/events/RaidPage'
import { RaidNpcPicker } from '@/screens/events/RaidNpcPicker'

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
