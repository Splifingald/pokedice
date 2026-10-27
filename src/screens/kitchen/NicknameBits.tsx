// Kitchen sink: nicknames. The name at the top of a Pokémon's sheet (a button with a pencil), and the dialog it
// opens: a Pokémon without a nickname (empty field, its species as the placeholder) and one with a nickname.
import { useState } from 'react'
import { NicknameButton, NicknameModal } from '@/components/Nickname'
import { PixelButton } from '@/components/PixelButton'
import { SheetModal } from '@/components/SheetModal'
import type { PokemonInstance } from '@/engine'
import { useGame } from '@/store/game'

const mon = (over: Partial<PokemonInstance>): PokemonInstance => ({
  id: 'ks-nick',
  dex: 4,
  level: 12,
  xp: 0,
  currentHp: 30,
  caughtAt: 0,
  ...over,
})

const PLAIN = mon({})
const NAMED = mon({ id: 'ks-nick-2', dex: 25, nickname: 'Sparky' })
const LONG = mon({ id: 'ks-nick-3', dex: 130, nickname: 'Twelve chars' })

export function NicknameBits() {
  const save = useGame((s) => s.save)
  const [open, setOpen] = useState<PokemonInstance | null>(null)
  const [sheet, setSheet] = useState(false)
  const first = save?.box[0]
  return (
    <div className="grid w-full max-w-md gap-2">
      {/* As the sheet's header shows it: the h2's own size, the line under it. */}
      {[
        { inst: PLAIN, name: 'Charmander', sub: '#004 · Lv.12 · Lead' },
        { inst: NAMED, name: 'Sparky', sub: 'Pikachu · #025 · Lv.12 · In the Box' },
        { inst: LONG, name: 'Twelve chars', sub: 'Gyarados · #130 · Lv.12 · Team slot 2' },
      ].map((r) => (
        <div key={r.inst.id} className="bg-panel px-3.5 py-2 shadow-ring-line">
          <h3 className="m-0 min-w-0 text-title leading-none">
            <NicknameButton name={r.name} onClick={() => setOpen(r.inst)} />
          </h3>
          <p className="mt-0.5 font-pixel-sm text-[16px] leading-tight text-muted">{r.sub}</p>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setOpen(PLAIN)}>
          No nickname yet
        </PixelButton>
        <PixelButton size="sm" onClick={() => setOpen(NAMED)}>
          Has a nickname
        </PixelButton>
        {first && (
          <PixelButton size="sm" onClick={() => setSheet(true)}>
            Your Box's first Pokémon
          </PixelButton>
        )}
      </div>
      <NicknameModal inst={open} onClose={() => setOpen(null)} />
      <SheetModal
        view={sheet && first ? { kind: 'inst', id: first.id } : null}
        onClose={() => setSheet(false)}
      />
    </div>
  )
}
