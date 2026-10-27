// The Unown Pokédex's pieces (docs/41, docs/15 §37): a letter's sprite, the page's grid, Home's banner while the player
// stands where Unown live, the line on the result card, and its rules (once, then from INFO). Every rule and number is
// the engine's (engine/unownDex.ts); these only say them.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  isAreaUnlocked,
  letterText,
  UNOWN_DEX,
  UNOWN_LETTERS,
  unownDexOf,
  unownDexOpen,
  unownDexPaid,
  unownLivesIn,
  unownReward,
  type UnownLetter,
} from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { SHOWDOWN_SPRITES } from '@/lib/showdown'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { Chip } from './Chip'
import { PixelIcon } from './icons'
import { DexGridList, DexTile } from './DexGrid'
import { PixelButton } from './PixelButton'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'
import { spriteUrlFor } from './SpriteImg'

/** Showdown's id for a letter: the A is plain Unown, the others its formes (`unown-b`, `unown-exclamation`). */
const showdownId = (l: UnownLetter) =>
  l === 'a' ? 'unown' : `unown-${l === '!' ? 'exclamation' : l === '?' ? 'question' : l}`

/** A letter's animated sprite (Black and White drew all 28), on Showdown's CDN like every other Pokémon. */
export const unownSpriteUrl = (l: UnownLetter) => `${SHOWDOWN_SPRITES}/gen5ani/${showdownId(l)}.gif`

/**
 * One letter of Unown. Showdown trims its GIFs to the art, so each is scaled to fit the box (never past ×2): a slim I
 * and a wide W read alike. Offline, the local sprite (the A) stands in, then "?".
 */
export function UnownSprite({
  letter,
  size = 60,
  silhouette = false,
  className,
}: {
  letter: UnownLetter
  size?: number
  silhouette?: boolean
  className?: string
}) {
  const { t } = useT()
  const chain = [unownSpriteUrl(letter), spriteUrlFor(UNOWN_DEX)]
  const [state, setState] = useState<{ letter: UnownLetter; step: number; dims: [number, number] | null }>({
    letter,
    step: 0,
    dims: null,
  })
  const s = state.letter === letter ? state : { letter, step: 0, dims: null }
  const src = chain[s.step]
  const k = s.dims ? Math.min(2, size / Math.max(s.dims[0], s.dims[1], 1)) : 1
  return (
    <span
      className={cx('relative inline-grid shrink-0 place-items-center overflow-hidden', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={t('ui.unown.name', { letter: letterText(letter) })}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) =>
            setState({
              letter,
              step: s.step,
              dims: [e.currentTarget.naturalWidth, e.currentTarget.naturalHeight],
            })
          }
          onError={() => setState({ letter, step: s.step + 1, dims: null })}
          className="pixelated max-w-none select-none"
          style={{
            ...(s.dims && { width: s.dims[0] * k, height: s.dims[1] * k }),
            imageRendering: 'pixelated',
            filter: silhouette ? 'var(--silhouette)' : undefined,
            opacity: s.dims ? 1 : 0,
          }}
        />
      ) : (
        <span className="text-2xl text-muted">?</span>
      )}
    </span>
  )
}

/**
 * The page's grid on its own (the kitchen sink; the Pokédex builds the same tiles into its own grid): the 28 letters in
 * the games' order, each in its colours once found, a silhouette until then, as the Pokédex's tiles (`DexTile`).
 */
export function UnownDexGrid({ found, onOpen }: { found: readonly UnownLetter[]; onOpen: () => void }) {
  const { t } = useT()
  const has = new Set(found)
  return (
    <DexGridList label={t('ui.unown.title')}>
      {UNOWN_LETTERS.map((l, i) => {
        const got = has.has(l)
        const name = t('ui.unown.name', { letter: letterText(l) })
        return (
          <li key={l}>
            <DexTile
              dex={UNOWN_DEX}
              icon={<UnownSprite letter={l} size={48} silhouette={!got} />}
              name={letterText(l)}
              missing={!got}
              label={`${name}, ${t(got ? 'ui.unown.found' : 'ui.unown.missing')}`}
              nearLabel=""
              newLabel=""
              tabIndex={i === 0 ? 0 : -1}
              onClick={onOpen}
            />
          </li>
        )
      })}
    </DexGridList>
  )
}

/** One cell per letter, gold once found: the page at a glance. */
export function UnownLetterBar({ found, className }: { found: readonly UnownLetter[]; className?: string }) {
  const { t } = useT()
  const has = new Set(found)
  return (
    <span
      role="img"
      aria-label={t('ui.unown.count', { n: has.size, total: UNOWN_LETTERS.length })}
      className={cx('grid grid-cols-[repeat(28,minmax(0,1fr))] gap-px', className)}
    >
      {UNOWN_LETTERS.map((l) => (
        <i key={l} className={cx('block h-2', has.has(l) ? 'bg-gold' : 'bg-white/30')} />
      ))}
    </span>
  )
}

/** The Ruins of Alph: the chambers whose walls the Unown are drawn on. */
export const UNOWN_DEX_PICTURE: RulesPicture = { src: artUrl('lair-ruins'), focus: '50% 40%' }

/**
 * Home's banner while the player stands where Unown live (above the scene, as a small world's strip): the ruins, the
 * last letter found, the count, a cell per letter, and the way to the page. Complete, a gold COMPLETE and the prize.
 */
export function UnownStripView({
  found,
  paid,
  reward,
  onOpen,
}: {
  found: readonly UnownLetter[]
  /** The prize for the last letter was paid (`unownDexPaid`). */
  paid: boolean
  reward: number
  onOpen: () => void
}) {
  const { t } = useT()
  const total = UNOWN_LETTERS.length
  const done = found.length >= total
  const last = found[found.length - 1] ?? 'a'
  return (
    <section
      aria-label={t('ui.unown.title')}
      className="relative isolate flex items-center gap-2 px-2.5 py-2 shadow-[0_3px_0_rgb(var(--c-edge))]"
    >
      <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
        <img
          src={UNOWN_DEX_PICTURE.src}
          alt=""
          className="pixelated absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: UNOWN_DEX_PICTURE.focus }}
        />
      </span>
      <UnownSprite letter={last} size={44} silhouette={!found.length} />
      <span className="grid min-w-0 flex-1 gap-1 leading-none">
        <span className="flex min-w-0 items-center gap-1.5">
          <b className="lv-ink truncate text-[22px] font-normal">{t('ui.unown.title')}</b>
          {done && (
            <Chip tone="gold" className="shrink-0 uppercase tracking-[0.04em]">
              <PixelIcon name="star" size={11} />
              {t('ui.unown.completeTag')}
            </Chip>
          )}
        </span>
        <UnownLetterBar found={found} className="max-w-[360px]" />
        <small className="lv-ink truncate font-pixel-sm text-[16px] text-gold-light">
          {done
            ? paid && reward > 0
              ? t('ui.unown.stripPaid', { amount: money(reward) })
              : t('ui.unown.stripDone', { total })
            : reward > 0
              ? t('ui.unown.stripPrize', { n: found.length, total, amount: money(reward) })
              : t('ui.unown.count', { n: found.length, total })}
        </small>
      </span>
      <PixelButton size="sm" className="shrink-0" onClick={onOpen}>
        {t('ui.unown.see')}
      </PixelButton>
    </section>
  )
}

/** The banner shows: the page open, and the area the player stands in is one where Unown live (and opened). */
export function useUnownStrip(): boolean {
  return useGame((s) => {
    if (!s.save || !unownDexOpen(s.save, s.data)) return false
    const area = s.data.areas.find((a) => a.id === s.save!.currentAreaId)
    return !!area && unownLivesIn(area) && isAreaUnlocked(s.save, area.id, s.data)
  })
}

/** Home's banner, connected: nothing unless `useUnownStrip`. */
export function UnownStrip() {
  const navigate = useNavigate()
  const show = useUnownStrip()
  const save = useGame((s) => s.save)
  const reward = useGame((s) => unownReward(s.data))
  if (!show || !save) return null
  return (
    <UnownStripView
      found={unownDexOf(save)}
      paid={unownDexPaid(save)}
      reward={reward}
      onOpen={() => navigate('/pokedex?view=unown')}
    />
  )
}

/** The result card's line for an Unown caught with the page open: its letter, new or not, and the prize. */
export function UnownLetterCard({
  letter,
  isNew,
  found,
  total,
  reward,
}: {
  letter: UnownLetter
  isNew: boolean
  found: number
  total: number
  reward?: number
}) {
  const { t } = useT()
  const name = t('ui.unown.name', { letter: letterText(letter) })
  return (
    <div
      className={cx(
        'flex items-center justify-center gap-2 p-2 text-center shadow-ring',
        reward ? 'bg-gold' : 'bg-gold-pale',
      )}
    >
      <UnownSprite letter={letter} size={40} />
      <span className="grid gap-0.5 leading-tight">
        <span className="text-xl">
          {isNew ? t('ui.unown.newLetter', { name }) : t('ui.unown.knownLetter', { name })}
        </span>
        <span className="font-pixel-sm text-[16px]">
          {reward
            ? t('ui.unown.completeReward', { amount: money(reward) })
            : t('ui.unown.count', { n: found, total })}
        </span>
      </span>
    </div>
  )
}

export function useUnownDexRules(): RuleRow[] {
  const { t } = useT()
  const reward = useGame((s) => unownReward(s.data))
  return [
    {
      icon: 'navDex',
      title: t('ui.rules.unownDex.letters.title', { total: UNOWN_LETTERS.length }),
      text: t('ui.rules.unownDex.letters.text'),
    },
    { icon: 'ball', title: t('ui.rules.unownDex.new.title'), text: t('ui.rules.unownDex.new.text') },
    { icon: 'box', title: t('ui.rules.unownDex.box.title'), text: t('ui.rules.unownDex.box.text') },
    ...(reward > 0
      ? [
          {
            icon: 'coin' as const,
            title: t('ui.rules.unownDex.prize.title'),
            text: t('ui.rules.unownDex.prize.text', { amount: money(reward), total: UNOWN_LETTERS.length }),
          },
        ]
      : []),
  ]
}

export function UnownDexRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useUnownDexRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.unown.title')}
      picture={UNOWN_DEX_PICTURE}
      icon="navDex"
      rules={rules}
      onGo={onGo}
    />
  )
}
