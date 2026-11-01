// Kitchen sink (dev only): outfits (docs/59) — the chip on the Pokémon sheet (a tap: the rules as INFO), the hat that
// marks a tile or a gift (each size), Santa Pikachu's sprite in each view (our sprite copy only: without
// VITE_SPRITES_HOST every view is the plain Pikachu, as players would see it), and the rules pop-up.
import { useState, type ReactNode } from 'react'
import { PixelIcon } from '@/components/icons'
import { OutfitChip, OutfitRulesModal } from '@/components/Outfit'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { ownSpritesServed } from '@/lib/outfitSprites'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

export function OutfitBits() {
  const [rules, setRules] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-6">
        <Frame name="Chip (tap: rules)">
          <OutfitChip outfit="santa" />
        </Frame>
        <Frame name="Hat marker">
          <span className="flex items-end gap-3">
            {[10, 12, 14, 20, 28].map((n) => (
              <PixelIcon key={n} name="santaHat" size={n} />
            ))}
          </span>
        </Frame>
        <Frame name="Rules pop-up">
          <PixelButton size="sm" onClick={() => setRules(true)}>
            Show
          </PixelButton>
        </Frame>
      </div>
      <Frame
        name={
          ownSpritesServed
            ? 'Santa Pikachu (from our sprite copy)'
            : 'Santa Pikachu: no sprite copy here, so plain'
        }
      >
        <span className="flex flex-wrap gap-3">
          <SpriteImg dex={25} size={96} outfit="santa" />
          <SpriteImg dex={25} size={96} outfit="santa" back />
          <SpriteImg dex={25} size={96} outfit="santa" shiny />
          <SpriteImg dex={25} size={96} outfit="santa" shiny back />
          <SpriteImg dex={26} size={96} outfit="santa" />
        </span>
      </Frame>
      <OutfitRulesModal open={rules} onClose={() => setRules(false)} onGo={() => setRules(false)} />
    </div>
  )
}
