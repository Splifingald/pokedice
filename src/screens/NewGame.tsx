import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { effectiveStats, getSpecies } from '@/engine'
import { Dialogue } from '@/components/Dialogue'
import { DiceSet } from '@/components/DiceSet'
import { DieFaces } from '@/components/Die'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { useGame } from '@/store/game'
import { enterArea, startNewGame } from '@/store/run'

const INTRO = [
  'Welcome to the world of POKÉDICE!',
  'Here, Pokémon battle with dice. Every Pokémon carries its own set — typed dice hit harder against the right foes.',
  'Throw, keep the dice you like, reroll the rest… then ATTACK. Pairs, straights and full houses add bonus damage.',
  'Trainers pay in Pokédollars (₽). Spend them on upgrades that make every die and combo stronger. Now — choose your first partner!',
]

export function NewGame() {
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const [line, setLine] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)
  const level = data.config.starterLevel
  const starters = data.config.starters.filter((d) => data.species[d])
  const picking = line >= INTRO.length

  const begin = (dex: number) => {
    startNewGame(dex)
    const first = data.areas[0]
    if (first) enterArea(first.id)
    navigate('/area')
  }

  return (
    <main className="scanlines min-h-screen px-3 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {!picking ? (
          <div className="mx-auto mt-[20vh] w-full max-w-2xl">
            <h1 className="sr-only">New game</h1>
            <Dialogue key={line} text={INTRO[line]} />
            <div className="mt-3 flex justify-between">
              <PixelButton size="sm" variant="ghost" onClick={() => setLine(INTRO.length)}>
                Skip intro
              </PixelButton>
              <PixelButton variant="primary" onClick={() => setLine((l) => l + 1)}>
                NEXT ▸
              </PixelButton>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-center text-5xl">Choose your partner</h1>
            <div className="grid gap-4 md:grid-cols-3">
              {starters.map((dex, i) => {
                const sp = getSpecies(data, dex)
                const stats = effectiveStats(sp, level, data)
                return (
                  <motion.button
                    key={dex}
                    type="button"
                    onClick={() => setChoice(dex)}
                    className="pixel-panel flex flex-col items-center gap-2 p-4 text-left hover:bg-white"
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.12 }}
                    whileHover={{ y: -4 }}
                  >
                    <SpriteImg dex={dex} size={144} />
                    <div className="text-4xl leading-none">{sp.name}</div>
                    <div className="flex gap-1">
                      <TypeBadge type={sp.type1} />
                      {sp.type2 && <TypeBadge type={sp.type2} />}
                    </div>
                    <div className="text-xl">
                      Lv.{level} · HP {stats.maxHp} · Speed {sp.speed}
                    </div>
                    <div className="flex items-center gap-2">
                      <DiceSet dice={stats.dice} size={28} />
                      <span className="text-xl">🎲×{stats.rerolls}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {[...new Set(stats.dice)].map((t) => (
                        <div key={t} className="flex items-center gap-2">
                          <span className="w-12 text-sm uppercase">{t}</span>
                          <DieFaces type={t} faces={data.diceTypes[t]?.faces ?? []} size={22} />
                        </div>
                      ))}
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <Modal open={choice != null} onClose={() => setChoice(null)} title={choice ? `${data.species[choice]?.name}?` : ''}>
        {choice && (
          <div className="flex flex-col items-center gap-3">
            <SpriteImg dex={choice} size={120} />
            <p className="text-xl">Set off with {data.species[choice]?.name} as your partner?</p>
            <div className="flex gap-2">
              <PixelButton onClick={() => setChoice(null)}>Not yet</PixelButton>
              <PixelButton variant="primary" onClick={() => begin(choice)}>
                YES!
              </PixelButton>
            </div>
          </div>
        )}
      </Modal>
    </main>
  )
}
