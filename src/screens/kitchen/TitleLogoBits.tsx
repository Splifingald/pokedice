// Kitchen sink (dev only): the title's dice logo (docs/38 §9), whatever the Game feel switch says. Each motion level
// (the throw, the drop, the calm drop, at rest) with REPLAY, the throw frozen at a few moments (the white flash at
// 1.51 s), in two rows (a phone) or one (from 768 px). A tap on a logo throws it again, as on the title.
import { useState } from 'react'
import { DiceLogo } from '@/components/DiceLogo'
import { PixelButton } from '@/components/PixelButton'
import type { LogoMode } from '@/fx/dice/logo'
import type { LogoLayout } from '@/fx/dice/logoSize'

const MODES: { mode: LogoMode; name: string }[] = [
  {
    mode: 'throw',
    name: 'full: thrown in from the bottom right, rolling right to left, a white flash, gold rings',
  },
  {
    mode: 'drop',
    name: 'short: dropped in one after another (the trailer’s end card), the flash and the rings',
  },
  {
    mode: 'calm',
    name: 'the OS asks for less motion: each die two pixels up, one, down; no flash, no floor ring',
  },
  { mode: 'rest', name: 'off: at rest at once' },
]
const FROZEN = [0.3, 0.7, 1.2, 1.51, 1.8]

export function TitleLogoBits() {
  const [replay, setReplay] = useState(0)
  const [layout, setLayout] = useState<LogoLayout>('tall')
  const sample = (name: string, logo: JSX.Element) => (
    <div key={name} className="flex w-full flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {/* One row is 542 px wide: on a phone it scrolls here rather than the page. */}
      <div className="w-full overflow-x-auto bg-parchment shadow-ring">{logo}</div>
    </div>
  )
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <PixelButton variant="primary" size="sm" onClick={() => setReplay((n) => n + 1)}>
          Replay
        </PixelButton>
        <PixelButton size="sm" onClick={() => setLayout(layout === 'tall' ? 'wide' : 'tall')}>
          {layout === 'tall' ? 'Showing two rows (phone)' : 'Showing one row (768 px+)'}
        </PixelButton>
      </div>
      {MODES.map(({ mode, name }) =>
        sample(name, <DiceLogo sample mode={mode} layout={layout} replay={replay} />),
      )}
      {FROZEN.map((t) =>
        sample(`the throw frozen at ${t} s`, <DiceLogo sample mode="throw" layout={layout} freeze={t} />),
      )}
    </div>
  )
}
