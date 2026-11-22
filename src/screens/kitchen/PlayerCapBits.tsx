// Kitchen sink (dev only): the player cap's waiting line (docs/74) — first in line, far back, sent back for being
// idle, signed in (no sign-in line), still while the place is asked for, and its rules behind INFO.
import { useState, type ReactNode } from 'react'
import { PlayerCapRulesModal, QueueView, type QueueViewProps } from '@/components/PlayerCap'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-[380px] max-w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className="pixel-panel bg-panel p-4">{children}</div>
    </div>
  )
}

export function PlayerCapBits() {
  const [info, setInfo] = useState(false)
  const base: QueueViewProps = {
    position: 1,
    queueLength: 1,
    idle: false,
    idleMinutes: 10,
    signedIn: false,
    onSignIn: () => {},
    onInfo: () => setInfo(true),
    still: true,
  }
  return (
    <div className="flex flex-wrap gap-4">
      <Frame name="At start, first in line (the page's heading)">
        <QueueView {...base} heading />
      </Frame>
      <Frame name="Far back, signed in">
        <QueueView {...base} position={42} queueLength={300} signedIn />
      </Frame>
      <Frame name="Sent back for being idle">
        <QueueView {...base} position={7} queueLength={7} idle />
      </Frame>
      <Frame name="Asking for the place">
        <QueueView {...base} position={null} queueLength={null} />
      </Frame>
      <PlayerCapRulesModal open={info} onClose={() => setInfo(false)} />
    </div>
  )
}
