// Kitchen sink: onboarding, menus and copy (docs/38 §8). The character pick with its default name (Red; switch to
// Leaf and it follows; type and it stays yours), Settings' one Delete and its question (every deletion, a save and
// everything, everything only), the trainer menu's Inbox (My messages on its own), and the lead picker's SENT OUT
// (the device's team; a team of one shows nothing).
import { useState } from 'react'
import { ContactModal, InboxModal } from '@/components/ContactModal'
import { LeadPicker } from '@/components/LeadPicker'
import { PixelButton } from '@/components/PixelButton'
import { CharacterSelect } from '@/screens/NewGame'
import { DeleteChooser, type DeleteChoice } from '@/screens/Settings'
import { pushToast } from '@/store/game'

const ASKS: Record<string, DeleteChoice[]> = {
  'Delete: every choice': ['save', 'extreme', 'all'],
  'Delete: a save, everything': ['save', 'all'],
  'Delete: everything only': ['all'],
}

export function OnboardingBits() {
  const [ask, setAsk] = useState<DeleteChoice[] | null>(null)
  const [inbox, setInbox] = useState(false)
  const [contact, setContact] = useState(false)
  const [lead, setLead] = useState<string | null>(null)
  return (
    <div className="grid w-full max-w-xl gap-4">
      <div className="pixel-panel p-3">
        <CharacterSelect compact onDone={(p) => pushToast(`${p.character}: ${p.name}`, 'info')} />
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(ASKS).map(([label, choices]) => (
          <PixelButton key={label} size="sm" onClick={() => setAsk(choices)}>
            {label}
          </PixelButton>
        ))}
        <PixelButton size="sm" onClick={() => setInbox(true)}>
          Inbox (My messages)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setContact(true)}>
          Contact the developer
        </PixelButton>
      </div>
      <LeadPicker value={lead} onChange={setLead} />
      <DeleteChooser
        open={!!ask}
        onClose={() => setAsk(null)}
        choices={ask ?? []}
        onPick={(c) => {
          setAsk(null)
          pushToast(`Picked: ${c}`, 'info')
        }}
      />
      <InboxModal open={inbox} onClose={() => setInbox(false)} />
      <ContactModal open={contact} onClose={() => setContact(false)} />
    </div>
  )
}
