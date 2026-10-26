// Kitchen sink: the deep pass's shell (docs/43 §3–§4). The Social tab's strip on each of its views, and SplitView: a
// list with its detail docked beside it (a Sheet drawn in the pane), and the pane empty. Below 1024 px the detail is the
// usual bottom sheet, so this shows the docked shape only on a wide window.
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { RulesCard } from '@/components/RulesCard'
import { Sheet } from '@/components/Sheet'
import { SocialTabs, type SocialView } from '@/components/SocialTabs'
import { SplitView } from '@/components/SplitView'

const VIEWS: SocialView[] = ['board', 'versus', 'friends', 'trades']

export function DeepShellBits() {
  const [open, setOpen] = useState<number | null>(1)
  return (
    <div className="flex w-full flex-col gap-4">
      <RulesCard
        title="Versus"
        icon="vs"
        rules={[
          {
            icon: 'navTeam',
            title: 'Three Pokémon at Lv.50',
            text: 'Everyone fights at Lv.50, whatever their level.',
          },
          { icon: 'vs', title: 'It plays itself', text: 'Your team fights theirs on auto, to the end.' },
        ]}
        onDone={() => undefined}
      />
      {VIEWS.map((v) => (
        <SocialTabs key={v} current={v} title={v} />
      ))}
      <SplitView
        main={
          <ul className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <li key={n}>
                <PixelButton
                  variant={open === n ? 'gold' : 'secondary'}
                  className="w-full"
                  onClick={() => setOpen(n)}
                >
                  Item {n}
                </PixelButton>
              </li>
            ))}
          </ul>
        }
        detail={
          open != null ? (
            <Sheet
              open
              onClose={() => setOpen(null)}
              title={`Item ${open}`}
              footer={
                <PixelButton variant="primary" className="w-full">
                  Use
                </PixelButton>
              }
            >
              <p className="copy">The detail of item {open}, docked beside the list on a wide screen.</p>
            </Sheet>
          ) : undefined
        }
        empty={<p className="copy p-4 text-muted">Nothing picked: the pane waits.</p>}
      />
    </div>
  )
}
