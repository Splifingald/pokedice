// Kitchen sink (dev only): a small world's starting gift (docs/64 §4.7, docs/15 §45b) — the blue present at each size,
// and its pop-up waiting (OPEN) and opened (what came out, OK), with Snowglobe Valley's contents.
import { useState } from 'react'
import { MONEY, type GiftItem } from '@/engine'
import { PresentImg } from '@/components/GiftCard'
import { PixelButton } from '@/components/PixelButton'
import { WelcomeGiftView } from '@/components/WelcomeGift'

const CONTENTS: GiftItem[] = [
  { key: MONEY, qty: 10 },
  { key: 'potion', qty: 2 },
  { key: 'poke-ball', qty: 5 },
  { key: 'ice-heal', qty: 2 },
]

export function WelcomeGiftBits() {
  const [state, setState] = useState<'closed' | 'waiting' | 'opened'>('closed')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        {[1, 2, 3].map((level) => (
          <PresentImg key={level} look="blue" level={level} scale={3} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setState('waiting')}>
          Pop-up: waiting
        </PixelButton>
        <PixelButton size="sm" onClick={() => setState('opened')}>
          Pop-up: opened
        </PixelButton>
      </div>
      <WelcomeGiftView
        open={state !== 'closed'}
        world="Snowglobe Valley"
        contents={CONTENTS}
        opened={state === 'opened'}
        onOpen={() => setState('opened')}
        onClose={() => setState('closed')}
      />
    </div>
  )
}
