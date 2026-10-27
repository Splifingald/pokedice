// Settings → Game, under Sound (docs/38 §5): the battle music (its switch and its volume) and the vibrations, each
// only where the admin has switched it on. They work over a fight too (`SettingsOverlay`): the music's volume
// changes as it plays.
import { musicOn } from '@/engine'
import { MUSIC_VOLUMES, volumeStep } from '@/audio/music'
import { useT } from '@/i18n/react'
import { haptic, useHapticsOffered } from '@/lib/haptics'
import { soundOn } from '@/save/storage'
import { setSettings, useGame } from '@/store/game'
import { Seg } from './Segmented'
import { Toggle } from './Toggle'

/** `always`: shown whatever the admin's switches say (the kitchen sink's, to show every row on any device). */
export function FeelSettings({ always }: { always?: boolean }) {
  const { t } = useT()
  const settings = useGame((s) => s.settings)
  const musicShown = useGame((s) => !!s.data && musicOn(s.data)) || !!always
  const hapticsShown = useHapticsOffered() || !!always
  const music = settings.music !== false
  return (
    <>
      {/* Music needs Sound: with Sound off, its rows go rather than a switch that would do nothing. */}
      {musicShown && soundOn(settings) && (
        <>
          <Toggle
            label={t('ui.settings.music')}
            on={music}
            onChange={(v) => setSettings({ music: v })}
          />
          {music && (
            <div className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="text-2xl">{t('ui.settings.musicVolume')}</span>
              <Seg
                label={t('ui.settings.musicVolume')}
                value={volumeStep(settings.musicVolume)}
                onChange={(v) => setSettings({ musicVolume: MUSIC_VOLUMES[v] })}
                options={[
                  { id: 'low', label: t('ui.settings.volLow') },
                  { id: 'mid', label: t('ui.settings.volMid') },
                  { id: 'high', label: t('ui.settings.volHigh') },
                ]}
                className="min-w-[11rem]"
              />
            </div>
          )}
        </>
      )}
      {hapticsShown && (
        <Toggle
          label={t('ui.settings.haptics')}
          on={settings.haptics !== false}
          onChange={(v) => {
            setSettings({ haptics: v })
            // Turned on: one tap to feel it (Android).
            if (v) haptic('tap')
          }}
        />
      )}
    </>
  )
}
