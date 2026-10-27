import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { PixelButton } from '@/components/PixelButton'
import { PartnerMoment } from '@/components/PartnerMoment'
import { PLAYER_CHARACTERS, TrainerSprite } from '@/components/TrainerArt'
import type { PlayerCharacter, PlayerProfile } from '@/engine'
import { cx } from '@/theme/util'
import { useGame } from '@/store/game'
import { exploreFirstArea, startNewGame } from '@/store/run'

/** Each character's own name in the games, the field's default (the same keys as their trainer looks). */
const DEFAULT_NAMES: Record<PlayerCharacter, string> = { red: 'trainerName.red', green: 'trainerName.leaf' }

/**
 * A new game (docs/43 §5.10): straight into Prof. Oak's lab — no monologue screen and no character screen first (the
 * look and the name change on the trainer card). Oak speaks in the lab while the balls drop; a ball, its PICK, and the
 * first area's first fight is under way: NEW GAME → a ball → PICK → the dice (Let's go! loads by itself).
 */
export function NewGame() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const level = data.config.starterLevel
  const starters = data.config.starters.filter((d) => data.species[d])
  // A new game starts in the first region.
  const region = data.regions[0]

  const begin = (dex: number) => {
    startNewGame(dex, { name: t(DEFAULT_NAMES.red), character: 'red' })
    // Into the first area at once, its first fight under way; Home comes later.
    navigate(exploreFirstArea(data.areas[0]?.id) ? '/area' : '/home')
  }

  return (
    <main className="scanlines min-h-screen px-3 py-8">
      <h1 className="sr-only">{t('ui.newGame.choosePartner')}</h1>
      <PartnerMoment
        starters={starters}
        regionId={region?.id ?? 'kanto'}
        regionName={region?.name ?? ''}
        level={level}
        onPick={begin}
        oak
      />
    </main>
  )
}

/** "Select your character": one of the two trainer sprites, and a name. */
export function CharacterSelect({
  onDone,
  initial,
  submitLabel,
  compact = false,
}: {
  onDone: (p: PlayerProfile) => void
  initial?: PlayerProfile
  submitLabel?: string
  /** Inside a panel (Settings): no page heading. */
  compact?: boolean
}) {
  const { t } = useT()
  const [character, setCharacter] = useState<PlayerCharacter>(initial?.character ?? 'red')
  // Null until the player types: the field then shows the character's own name (Red, Leaf, as each language has them),
  // so NEXT works without a phone's keyboard and a switch of character brings its name along (docs/38 U1f).
  const [typed, setTyped] = useState<string | null>(initial?.name || null)
  const name = typed ?? t(DEFAULT_NAMES[character]).slice(0, 12)
  const trimmed = name.trim()
  return (
    <form
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onDone({ name: trimmed, character })
      }}
    >
      {compact ? (
        <p className="text-center text-2xl">{t('ui.newGame.selectCharacter')}</p>
      ) : (
        <h1 className="text-center text-[36px] leading-none">{t('ui.newGame.selectCharacter')}</h1>
      )}
      <div role="radiogroup" aria-label={t('ui.newGame.character')} className="flex justify-center gap-4">
        {PLAYER_CHARACTERS.map((c, i) => (
          <motion.button
            key={c}
            type="button"
            role="radio"
            aria-checked={character === c}
            aria-label={t('ui.newGame.characterN', { n: i + 1 })}
            onClick={() => {
              setCharacter(c)
              // A field left empty takes the new character's name too; one the player wrote stays theirs.
              if (!typed?.trim()) setTyped(null)
            }}
            className={cx('pixel-panel p-2', character === c ? 'bg-gold' : 'hover:bg-paper')}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: character === c ? -6 : 0, opacity: 1 }}
            transition={{ delay: i * 0.08 }}
          >
            <TrainerSprite src={`/characters/${c}.png`} size={compact ? 96 : 128} />
          </motion.button>
        ))}
      </div>
      <label className="flex w-full max-w-xs flex-col gap-1 text-xl">
        {t('ui.newGame.yourName')}
        <input
          value={name}
          onChange={(e) => setTyped(e.target.value.slice(0, 12))}
          maxLength={12}
          autoComplete="nickname"
          className="min-h-[44px] w-full bg-paper shadow-field px-2 text-2xl"
          required
        />
      </label>
      <PixelButton type="submit" variant="primary" size="lg" disabled={!trimmed}>
        {submitLabel ?? t('ui.newGame.next')}
      </PixelButton>
    </form>
  )
}
