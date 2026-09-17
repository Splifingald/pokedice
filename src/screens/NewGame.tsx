import { motion } from 'framer-motion'
import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { effectiveStats, getSpecies } from '@/engine'
import { Dialogue } from '@/components/Dialogue'
import { DiceSet } from '@/components/DiceSet'
import { DieFaces } from '@/components/Die'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { StatChip } from '@/components/StatChip'
import { PLAYER_CHARACTERS, TrainerSprite } from '@/components/TrainerArt'
import { TypeBadge } from '@/components/TypeBadge'
import type { PlayerCharacter, PlayerProfile } from '@/engine'
import { cx } from '@/theme/util'
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
  const [player, setPlayer] = useState<PlayerProfile | null>(null)
  const level = data.config.starterLevel
  const starters = data.config.starters.filter((d) => data.species[d])
  const picking = line >= INTRO.length

  const begin = (dex: number) => {
    startNewGame(dex, player ?? undefined)
    const first = data.areas[0]
    if (first) enterArea(first.id)
    navigate('/area')
  }

  return (
    <main className="scanlines min-h-screen px-3 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {!picking ? (
          <div className="mx-auto mt-[12vh] w-full max-w-2xl">
            <h1 className="sr-only">New game</h1>
            <motion.img
              src="/characters/prof-oak.png"
              alt="Professor Oak"
              width={168}
              height={168}
              className="mx-auto mb-2 block"
              style={{ imageRendering: 'pixelated' }}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            />
            <div className="font-pixel-sm mb-1 inline-block bg-ink px-2 py-0.5 text-lg text-parchment">PROF. OAK</div>
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
        ) : !player ? (
          <CharacterSelect onDone={setPlayer} />
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
                    <div className="flex items-center gap-4 text-xl">
                      <span>Lv.{level}</span>
                      <StatChip stat="hp" value={stats.maxHp} size={18} />
                      <StatChip stat="speed" value={sp.speed} size={18} />
                      <StatChip stat="rerolls" value={stats.rerolls} size={18} />
                    </div>
                    <div className="grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-1">
                      <span className="text-sm uppercase">Dice</span>
                      <DiceSet dice={stats.dice} size={28} />
                      {[...new Set(stats.dice)].map((t) => (
                        <Fragment key={t}>
                          <span className="text-sm uppercase">{t}</span>
                          <div>
                            <DieFaces type={t} faces={data.diceTypes[t]?.faces ?? []} size={22} />
                            {data.diceTypes[t]?.description && (
                              <div className="copy text-sm text-muted">{data.diceTypes[t]!.description}</div>
                            )}
                          </div>
                        </Fragment>
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

/** "Select your character": one of the two trainer sprites, and a name. */
export function CharacterSelect({
  onDone,
  initial,
  submitLabel = 'NEXT ▸',
  compact = false,
}: {
  onDone: (p: PlayerProfile) => void
  initial?: PlayerProfile
  submitLabel?: string
  /** Inside a panel (Settings): no page heading. */
  compact?: boolean
}) {
  const [character, setCharacter] = useState<PlayerCharacter>(initial?.character ?? 'red')
  const [name, setName] = useState(initial?.name ?? '')
  const trimmed = name.trim()
  return (
    <form
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onDone({ name: trimmed, character })
      }}
    >
      {compact ? <p className="text-center text-2xl">Select your character</p> : <h1 className="text-center text-5xl">Select your character</h1>}
      <div role="radiogroup" aria-label="Character" className="flex justify-center gap-4">
        {PLAYER_CHARACTERS.map((c, i) => (
          <motion.button
            key={c}
            type="button"
            role="radio"
            aria-checked={character === c}
            aria-label={`Character ${i + 1}`}
            onClick={() => setCharacter(c)}
            className={cx('pixel-panel p-2', character === c ? 'bg-gold' : 'hover:bg-white')}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: character === c ? -6 : 0, opacity: 1 }}
            transition={{ delay: i * 0.08 }}
          >
            <TrainerSprite src={`/characters/${c}.png`} size={compact ? 96 : 128} />
          </motion.button>
        ))}
      </div>
      <label className="flex w-full max-w-xs flex-col gap-1 text-xl">
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 12))}
          maxLength={12}
          autoComplete="nickname"
          className="min-h-[44px] w-full border-[3px] border-ink bg-panel px-2 text-2xl"
          required
        />
      </label>
      <PixelButton type="submit" variant="primary" size="lg" disabled={!trimmed}>
        {submitLabel}
      </PixelButton>
    </form>
  )
}
