// Kitchen sink (dev only): How to play's animated cards (docs/38 §8b), whatever the Game feel switch says — playing (a
// loop), as a calm screen draws them (a still with PLAY, which plays once) and with animations off (PLAY shows the
// end); the button pictures they're drawn with, up and pressed.
import { ButtonLook } from '@/components/PixelButton'
import { HowToPlay, type HowToMode } from '@/screens/help/HowToPlay'

const MODES: HowToMode[] = ['loop', 'still', 'off']

export function HowToBits() {
  return (
    <>
      <div className="flex w-full flex-wrap gap-3">
        <ButtonLook>Reroll (3)</ButtonLook>
        <ButtonLook down>Reroll (3)</ButtonLook>
        <ButtonLook variant="primary">Attack</ButtonLook>
        <ButtonLook variant="primary" down>
          Attack
        </ButtonLook>
      </div>
      {MODES.map((m) => (
        <div key={m} className="flex w-full flex-col gap-1">
          <span className="font-pixel-sm text-[16px] text-muted">{m}</span>
          <HowToPlay mode={m} />
        </div>
      ))}
    </>
  )
}
