// Settings → Notifications (docs/25): push on or off on this device, each topic's switch, what this device is, and
// the INFO button with the rules. Nowhere while the admin's switch is off for this player.
import { useState } from 'react'
import { PUSH_TOPICS, pushOn, type PushTopic } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { pushSupport, type PushSupport } from '@/lib/platform'
import {
  disablePush,
  enablePush,
  setPushTopic,
  topicOn,
  usePush,
  VAPID_PUBLIC_KEY,
  type PushState,
} from '@/lib/push'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { Panel } from './Panel'
import { InstallSteps, toastEnable, useDeviceName, usePushRules } from './PushPrompt'
import { InfoButton, RulesModal } from './RulesModal'
import { Toggle } from './Toggle'

export function PushRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = usePushRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.push.title')}
      picture={{ src: artUrl('daycare'), focus: '50% 27%' }}
      icon="bell"
      rules={rules}
    />
  )
}

/** The panel as it stands: what the browser allows decides which of its states shows. */
export function PushSettingsView({
  support,
  push,
  device,
  onToggle,
  onTopic,
}: {
  support: PushSupport
  push: Pick<PushState, 'on' | 'topics' | 'permission'>
  device: string
  onToggle: (on: boolean) => void
  onTopic: (topic: PushTopic, on: boolean) => void
}) {
  const { t } = useT()
  const [info, setInfo] = useState(false)
  return (
    <Panel title={t('ui.push.title')} icon="bell">
      <p className="copy m-0 mb-1 text-muted">{t('ui.push.settings.device', { device })}</p>
      {support === 'no' ? (
        <p className="copy m-0">{t('ui.push.settings.unsupported')}</p>
      ) : support === 'install' ? (
        <InstallSteps />
      ) : push.permission === 'denied' ? (
        <p className="copy m-0">{t('ui.push.settings.blocked')}</p>
      ) : (
        <>
          <Toggle
            label={t('ui.push.settings.toggle')}
            hint={t('ui.push.settings.hint')}
            on={push.on}
            onChange={onToggle}
          />
          {push.on && (
            <div className="ml-3 border-l-2 border-dashed border-shadow pl-3">
              {PUSH_TOPICS.map((topic) => (
                <Toggle
                  key={topic}
                  label={t(`ui.push.rules.${topic}.title`)}
                  on={topicOn(push, topic)}
                  onChange={(v) => onTopic(topic, v)}
                />
              ))}
            </div>
          )}
        </>
      )}
      <InfoButton name={t('ui.push.title')} onClick={() => setInfo(true)} className="mt-3" />
      <PushRulesModal open={info} onClose={() => setInfo(false)} />
    </Panel>
  )
}

export function PushSettingsPanel() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const push = usePush()
  const device = useDeviceName()
  // The switch is off, or the cloud and the keys aren't set up: nothing to show. A browser that can't is told so.
  if (!pushOn(data) || !isSupabaseConfigured || !VAPID_PUBLIC_KEY) return null
  return (
    <PushSettingsView
      support={pushSupport()}
      push={push}
      device={device}
      onToggle={(v) => {
        if (push.busy) return
        if (v) void enablePush(null).then((r) => toastEnable(r, t))
        else void disablePush().then(() => pushToast(t('ui.push.toast.off')))
      }}
      onTopic={setPushTopic}
    />
  )
}
