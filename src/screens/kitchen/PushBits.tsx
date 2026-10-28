// Kitchen sink: push notifications (docs/27) — each feature's question (Day Care, raids, live events), as it asks on a
// computer or Android and on an iPhone in a Safari tab (the Home Screen steps), then Settings' panel in each state:
// off, on with its topics, blocked by the browser, an iPhone tab, a browser that can't.
import { useState } from 'react'
import { PUSH_TOPICS, type PushTopic } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { PushAskModal, pushPicture } from '@/components/PushPrompt'
import { PushSettingsView } from '@/components/PushSettings'
import type { PushSupport } from '@/lib/platform'
import type { PushState } from '@/lib/push'
import { useGame } from '@/store/game'

const PANELS: {
  label: string
  support: PushSupport
  push: Pick<PushState, 'on' | 'topics' | 'permission'>
  device: string
}[] = [
  { label: 'off', support: 'yes', push: { on: false, topics: {}, permission: 'default' }, device: 'Android' },
  {
    label: 'on, raids off',
    support: 'yes',
    push: { on: true, topics: { raid: false }, permission: 'granted' },
    device: 'Windows',
  },
  { label: 'blocked', support: 'yes', push: { on: false, topics: {}, permission: 'denied' }, device: 'Mac' },
  {
    label: 'iPhone tab',
    support: 'install',
    push: { on: false, topics: {}, permission: 'unsupported' },
    device: 'iPhone or iPad',
  },
  {
    label: "can't",
    support: 'no',
    push: { on: false, topics: {}, permission: 'unsupported' },
    device: 'this browser',
  },
]

export function PushBits() {
  const data = useGame((s) => s.data)
  const [ask, setAsk] = useState<{ topic: PushTopic; install: boolean } | null>(null)
  const [panels, setPanels] = useState(PANELS)
  const banners = { raid: data.config.events.raid.banner, live: null }
  return (
    <div className="grid w-full max-w-2xl gap-3">
      <div className="flex flex-wrap gap-2">
        {PUSH_TOPICS.flatMap((topic) =>
          [false, true].map((install) => (
            <PixelButton key={`${topic}-${install}`} size="sm" onClick={() => setAsk({ topic, install })}>
              Ask: {topic}
              {install ? ' (iPhone tab)' : ''}
            </PixelButton>
          )),
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {panels.map((p, i) => (
          <div key={p.label} className="grid gap-1">
            <span className="font-pixel-sm text-[16px] text-muted">{p.label}</span>
            <PushSettingsView
              support={p.support}
              push={p.push}
              device={p.device}
              onToggle={(on) =>
                setPanels((all) => all.map((x, j) => (j === i ? { ...x, push: { ...x.push, on } } : x)))
              }
              onTopic={(topic, on) =>
                setPanels((all) =>
                  all.map((x, j) =>
                    j === i ? { ...x, push: { ...x.push, topics: { ...x.push.topics, [topic]: on } } } : x,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>
      {ask && (
        <PushAskModal
          open
          topic={ask.topic}
          install={ask.install}
          picture={pushPicture(ask.topic, banners)}
          onYes={() => setAsk(null)}
          onNo={() => setAsk(null)}
        />
      )}
    </div>
  )
}
