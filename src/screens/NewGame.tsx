import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { Dialogue } from '@/components/Dialogue'
import { PixelButton } from '@/components/PixelButton'
import { PartnerMoment } from '@/components/PartnerMoment'
import { PLAYER_CHARACTERS, TrainerSprite } from '@/components/TrainerArt'
import { PlayStylePrompt } from '@/components/IdleMode'
import { newGameAsksStyle, type PlayerCharacter, type PlayerProfile, type PlayStyle } from '@/engine'
import { cx } from '@/theme/util'
import { useGame } from '@/store/game'
import { choosePlayStyle } from '@/store/autopilot'
import { enterArea, startNewGame } from '@/store/run'

const INTRO = ['ui.newGame.intro1', 'ui.newGame.intro2', 'ui.newGame.intro3', 'ui.newGame.intro4']

/** Each character's own name in the games, the field's default (the same keys as their trainer looks). */
const DEFAULT_NAMES: Record<PlayerCharacter, string> = { red: 'trainerName.red', green: 'trainerName.leaf' }

export function NewGame() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const [line, setLine] = useState(0)
  const [player, setPlayer] = useState<PlayerProfile | null>(null)
  // How to play (docs/36), asked before everything else when there is a choice (the idle mode's switch is on).
  const asks = newGameAsksStyle(data)
  const [style, setStyle] = useState<PlayStyle | null>(null)
  const level = data.config.starterLevel
  const starters = data.config.starters.filter((d) => data.species[d])
  // A new game starts in the first region.
  const region = data.regions[0]
  const picking = line >= INTRO.length

  const begin = (dex: number) => {
    startNewGame(dex, player ?? undefined)
    if (style) choosePlayStyle(style)
    const first = data.areas[0]
    if (first) enterArea(first.id)
    navigate('/home')
  }

  // Prof. Oak's intro: Oak in the room, the text box and its buttons at the bottom of the screen like the Game Boy's,
  // under the thumb (docs/38 P2a), above the home indicator.
  if (!(asks && !style) && !picking)
    return (
      <main
        className="scanlines flex min-h-[100dvh] flex-col px-3 pt-6"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <h1 className="sr-only">{t('ui.newGame.heading')}</h1>
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
          <motion.div
            className="flex flex-1 items-center justify-center pb-4"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            <TrainerSprite src="/characters/prof-oak.png" alt={t('ui.newGame.oak')} size={168} />
          </motion.div>
          <div>
            <div className="font-pixel-sm mb-1 inline-block bg-ink px-2 py-0.5 text-lg text-parchment">{t('ui.newGame.oakTag')}</div>
            <Dialogue key={line} text={t(INTRO[line] ?? '')} />
            <div className="mt-3 flex justify-between">
              <PixelButton size="sm" variant="ghost" onClick={() => setLine(INTRO.length)}>
                {t('ui.newGame.skipIntro')}
              </PixelButton>
              <PixelButton variant="primary" onClick={() => setLine((l) => l + 1)}>
                {t('ui.newGame.next')}
              </PixelButton>
            </div>
          </div>
        </div>
      </main>
    )

  return (
    <main className="scanlines min-h-screen px-3 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {asks && !style ? (
          <PlayStylePrompt onPick={setStyle} />
        ) : !player ? (
          <CharacterSelect onDone={setPlayer} />
        ) : (
          <>
            <h1 className="sr-only">{t('ui.newGame.choosePartner')}</h1>
            <PartnerMoment
              starters={starters}
              regionId={region?.id ?? 'kanto'}
              regionName={region?.name ?? ''}
              level={level}
              onPick={begin}
            />
          </>
        )}
      </div>
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
