import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createInstance, getSpecies } from '@/engine'
import { useT } from '@/i18n/react'
import { Dialogue } from '@/components/Dialogue'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { PokemonSheet } from '@/components/PokemonSheet'
import { SpriteImg } from '@/components/SpriteImg'
import { PLAYER_CHARACTERS, TrainerSprite } from '@/components/TrainerArt'
import { TypeBadge } from '@/components/TypeBadge'
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
  const [choice, setChoice] = useState<number | null>(null)
  const [info, setInfo] = useState<number | null>(null)
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
            <h1 className="sr-only">{t('ui.newGame.heading')}</h1>
            <motion.img
              src="/characters/prof-oak.png"
              alt={t('ui.newGame.oak')}
              width={168}
              height={168}
              className="mx-auto mb-2 block"
              style={{ imageRendering: 'pixelated' }}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            />
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
            <h1 className="text-center text-5xl">{t('ui.newGame.choosePartner')}</h1>
            <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-1.5 sm:gap-4">
              {starters.map((dex, i) => {
                const sp = getSpecies(data, dex)
                return (
                  <motion.div
                    key={dex}
                    className="pixel-panel relative flex flex-col items-center"
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.12 }}
                    whileHover={{ y: -4 }}
                  >
                    <button
                      type="button"
                      onClick={() => setChoice(dex)}
                      className="flex w-full flex-col items-center gap-1 px-1 pb-3 pt-2 hover:bg-white sm:gap-2 sm:p-4"
                    >
                      <SpriteImg dex={dex} size={144} className="aspect-square !h-auto !w-full max-w-[144px]" />
                      <span className="max-w-full truncate text-xl leading-none sm:text-4xl">{sp.name}</span>
                      <span className="flex flex-wrap justify-center gap-1">
                        <TypeBadge type={sp.type1} size="sm" />
                        {sp.type2 && <TypeBadge type={sp.type2} size="sm" />}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfo(dex)}
                      aria-label={t('ui.newGame.monInfo', { name: sp.name })}
                      title={t('ui.newGame.info')}
                      className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-panel text-xl leading-none shadow-hard-sm hover:bg-gold">
                        i
                      </span>
                    </button>
                  </motion.div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <Modal open={info != null} onClose={() => setInfo(null)} label={t('ui.newGame.details')}>
        {info != null && (
          <PokemonSheet dex={info} inst={createInstance(info, level, data, 'starter-preview', 0)}>
            <PixelButton
              variant="primary"
              className="self-center"
              onClick={() => {
                setInfo(null)
                setChoice(info)
              }}
            >
              {t('ui.newGame.choose', { name: data.species[info]?.name ?? '' })}
            </PixelButton>
          </PokemonSheet>
        )}
      </Modal>

      <Modal
        open={choice != null}
        onClose={() => setChoice(null)}
        title={choice ? t('ui.newGame.confirmTitle', { name: data.species[choice]?.name ?? '' }) : ''}
      >
        {choice && (
          <div className="flex flex-col items-center gap-3">
            <SpriteImg dex={choice} size={120} />
            <p className="text-xl">{t('ui.newGame.confirmBody', { name: data.species[choice]?.name ?? '' })}</p>
            <div className="flex gap-2">
              <PixelButton onClick={() => setChoice(null)}>{t('ui.newGame.notYet')}</PixelButton>
              <PixelButton variant="primary" onClick={() => begin(choice)}>
                {t('ui.newGame.yes')}
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
        <h1 className="text-center text-5xl">{t('ui.newGame.selectCharacter')}</h1>
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
        {t('ui.newGame.yourName')}
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
        {submitLabel ?? t('ui.newGame.next')}
      </PixelButton>
    </form>
  )
}
