// Kitchen sink (dev only): taps, haptics and music (docs/38 §5), whatever the admin's switches say. A PixelButton
// pressed (the look it takes the moment a finger lands); the haptics test pad, a tile per cue (Android vibrates it, an
// iPhone gives its system tap through the invisible switch); Settings' rows in every state; the battle loop.
import { useState, type ReactNode } from 'react'
import { FeelSettings } from '@/components/FeelSettings'
import { HapticSwitch, PixelButton } from '@/components/PixelButton'
import { musicPlaying, startMusic, stopMusic } from '@/audio/music'
import { canVibrate, HAPTICS, hapticsReady, IOS_SWITCH, type HapticCue } from '@/lib/haptics'
import { soundOn } from '@/save/storage'
import { useGame } from '@/store/game'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-md flex-col gap-1.5">
      <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
      {children}
    </div>
  )
}

/** A tile per cue: its pattern played straight on the device, past the switch and the setting (it's a test pad). */
function HapticPad() {
  const [last, setLast] = useState<HapticCue | null>(null)
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
      {(Object.keys(HAPTICS) as HapticCue[]).map((cue) => (
        <button
          key={cue}
          type="button"
          onClick={() => {
            setLast(cue)
            try {
              navigator.vibrate?.(HAPTICS[cue])
            } catch {
              /* a test pad */
            }
          }}
          className={`pixel-btn flex min-h-[56px] flex-col items-center justify-center px-1 leading-none ${last === cue ? 'frame-gold' : ''}`}
        >
          <span className="text-[18px]">{cue}</span>
          <span className="font-pixel-sm text-[12px]">{JSON.stringify(HAPTICS[cue])} ms</span>
          {IOS_SWITCH && <HapticSwitch />}
        </button>
      ))}
    </div>
  )
}

export function FeelBits() {
  const sound = useGame((s) => soundOn(s.settings))
  const [, redraw] = useState(0)
  return (
    <>
      <Frame name="PixelButton pressed (data-down: set on pointerdown, before the click; sound and Android haptic then too)">
        <div className="flex flex-wrap gap-3">
          <PixelButton data-down="">pressed</PixelButton>
          <PixelButton variant="primary" data-down="">
            primary pressed
          </PixelButton>
          <PixelButton variant="primary">primary: tap (haptic)</PixelButton>
        </div>
      </Frame>
      <Frame
        name={`Haptics test pad. This device: vibrate ${canVibrate() ? 'yes' : 'no'} · iOS switch ${IOS_SWITCH ? 'yes' : 'no'} · haptic() would play ${hapticsReady() ? 'yes' : 'no'}`}
      >
        <HapticPad />
      </Frame>
      <Frame name="Settings → Game: as the game shows them (the admin's switches)">
        <FeelSettings />
      </Frame>
      <Frame name="Settings → Game: every row (music's only while Sound is on)">
        <FeelSettings always />
      </Frame>
      <Frame name={`Battle music (needs Sound: ${sound ? 'on' : 'off'})`}>
        <div className="flex flex-wrap gap-3">
          <PixelButton
            disabled={!sound}
            onClick={() => {
              startMusic(useGame.getState().settings.musicVolume)
              redraw((n) => n + 1)
            }}
          >
            Play
          </PixelButton>
          <PixelButton
            onClick={() => {
              stopMusic()
              redraw((n) => n + 1)
            }}
          >
            Fade out
          </PixelButton>
          <span className="self-center font-pixel-sm text-[14px]">
            {musicPlaying() ? 'playing' : 'stopped'}
          </span>
        </div>
      </Frame>
    </>
  )
}
