import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { Dialogue } from '@/components/Dialogue'
import { PixelButton } from '@/components/PixelButton'
import { PartnerMoment } from '@/components/PartnerMoment'
import { PLAYER_CHARACTERS, TrainerSprite } from '@/components/TrainerArt'
import type { PlayerCharacter, PlayerProfile } from '@/engine'
import { cx } from '@/theme/util'
import { useGame } from '@/store/game'
import { enterArea, startNewGame } from '@/store/run'

const INTRO = ['ui.newGame.intro1', 'ui.newGame.intro2', 'ui.newGame.intro3', 'ui.newGame.intro4']

export function NewGame() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const [line, setLine] = useState(0)
  const [player, setPlayer] = useState<PlayerProfile | null>(null)
  const level = data.config.starterLevel
  const starters = data.config.starters.filter((d) => data.species[d])
  // A new game starts in the first region.
  const region = data.regions[0]
  const picking = line >= INTRO.length

  const begin = (dex: number) => {
    startNewGame(dex, player ?? undefined)
    const first = data.areas[0]
    if (first) enterArea(first.id)
    navigate('/home')
  }

  return (
    <main className="scanlines min-h-screen px-3 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {!picking ? (
          <div className="mx-auto mt-[12vh] w-full max-w-2xl">
            <h1 className="sr-only">{t('ui.newGame.heading')}</h1>
            <motion.div className="mb-2 flex justify-center" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <TrainerSprite src="/characters/prof-oak.png" alt={t('ui.newGame.oak')} size={168} />
            </motion.div>
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
            onClick={() => setCharacter(c)}
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
          onChange={(e) => setName(e.target.value.slice(0, 12))}
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
