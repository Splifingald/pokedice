// The Rotom Pokédex's pieces (docs/73, docs/15 §55): the form bar, Home's banner while the player stands in the Rotom
// Room, the line on the result card, and its rules (INFO at the foot of its page). Every rule and number is the
// engine's (engine/rotomRoom.ts); these only say them.
import { useNavigate } from 'react-router-dom'
import {
  ROTOM_DEX,
  ROTOM_FORMS,
  rotomDexOf,
  rotomDexOpen,
  rotomDexPaid,
  rotomFormOf,
  rotomPrizeLevel,
  rotomRoomBase,
  rotomRoomDone,
  rotomRoomReopensAt,
  rotomWeekForm,
} from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { dayTime } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { Chip } from './Chip'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'
import { MiniSprite, SpriteImg } from './SpriteImg'
import { TypeBadge } from './TypeBadge'

/** The Galactic Warehouse's lab, where the appliances wait. */
export const ROTOM_DEX_PICTURE: RulesPicture = { src: artUrl('lair-lab'), focus: '70% 45%' }

/** One cell per form, gold once caught, the week's one ringed: the page at a glance. */
export function RotomFormBar({
  found,
  week,
  className,
}: {
  found: readonly number[]
  week?: number | null
  className?: string
}) {
  const { t } = useT()
  const has = new Set(found)
  return (
    <span
      role="img"
      aria-label={t('ui.rotom.count', { n: has.size, total: ROTOM_FORMS.length })}
      className={cx('grid grid-cols-5 gap-px', className)}
    >
      {ROTOM_FORMS.map((f) => (
        <i
          key={f.dex}
          className={cx(
            'block h-2',
            has.has(f.dex) ? 'bg-gold' : 'bg-white/30',
            f.dex === week && !has.has(f.dex) && 'shadow-[inset_0_0_0_1px_#ffd75e]',
          )}
        />
      ))}
    </span>
  )
}

/**
 * Home's banner while the player stands in the Rotom Room (above the scene, as the Unown's): the lab, this week's form,
 * the count, a cell per form and the way to the page. Caught this week, when it comes back; all five, COMPLETE.
 */
export function RotomStripView({
  found,
  week,
  reopensAt,
  paid,
  prizeLevel,
  onOpen,
}: {
  found: readonly number[]
  /** This week's form (null: all owned, or no week pinned yet). */
  week: number | null
  /** Caught this week: when the room opens again with another form. */
  reopensAt: number | null
  paid: boolean
  prizeLevel: number
  onOpen: () => void
}) {
  const { t } = useT()
  const names = useGame((s) => s.data.species)
  const total = ROTOM_FORMS.length
  const done = found.length >= total
  const caughtThisWeek = week != null && found.includes(week)
  const shown = week ?? found[found.length - 1] ?? ROTOM_DEX
  const name = names[shown]?.name ?? ''
  return (
    <section
      aria-label={t('ui.rotom.title')}
      className="relative isolate flex items-center gap-2 px-2.5 py-2 shadow-[0_3px_0_rgb(var(--c-edge))]"
    >
      <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
        <img
          src={ROTOM_DEX_PICTURE.src}
          alt=""
          className="pixelated absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: ROTOM_DEX_PICTURE.focus }}
        />
      </span>
      {/* In colour even before it's caught: a silhouette is lost on the lab's dark picture. */}
      <MiniSprite dex={shown} size={30} alt={name} />
      <span className="grid min-w-0 flex-1 gap-1 leading-none">
        <span className="flex min-w-0 items-center gap-1.5">
          <b className="lv-ink truncate text-[22px] font-normal">{t('ui.rotom.title')}</b>
          {done && (
            <Chip tone="gold" className="shrink-0 uppercase tracking-[0.04em]">
              <PixelIcon name="star" size={11} />
              {t('ui.rotom.completeTag')}
            </Chip>
          )}
        </span>
        <RotomFormBar found={found} week={week} className="max-w-[200px]" />
        <small className="lv-ink truncate font-pixel-sm text-[16px] text-gold-light">
          {done
            ? paid
              ? t('ui.rotom.completePaid', { total, level: prizeLevel })
              : t('ui.rotom.stripDone', { total })
            : caughtThisWeek && reopensAt != null
              ? t('ui.rotom.stripBack', { date: dayTime(reopensAt) })
              : week != null
                ? `${t('ui.rotom.stripWeek', { name })} · ${t('ui.rotom.count', { n: found.length, total })}`
                : t('ui.rotom.count', { n: found.length, total })}
        </small>
      </span>
      <PixelButton size="sm" className="shrink-0" onClick={onOpen}>
        {t('ui.rotom.see')}
      </PixelButton>
    </section>
  )
}

/** The banner shows: the page open, and the player stands in the Rotom Room. */
export function useRotomStrip(): boolean {
  return useGame(
    (s) => !!s.save && rotomDexOpen(s.save, s.data) && s.save.currentAreaId === rotomRoomBase(s.data)?.id,
  )
}

/** Home's banner, connected: nothing unless `useRotomStrip`. */
export function RotomStrip() {
  const navigate = useNavigate()
  const show = useRotomStrip()
  const save = useGame((s) => s.save)
  const prizeLevel = useGame((s) => rotomPrizeLevel(s.data))
  if (!show || !save) return null
  return (
    <RotomStripView
      found={rotomDexOf(save)}
      week={rotomRoomDone(save) ? null : rotomWeekForm(save)}
      reopensAt={rotomRoomReopensAt(save)}
      paid={rotomDexPaid(save)}
      prizeLevel={prizeLevel}
      onOpen={() => navigate('/pokedex?view=rotom')}
    />
  )
}

/** The week's form on the Rotom Pokédex's page: its sprite (a silhouette until caught), name and types. */
export function RotomWeekCard({ dex, caught }: { dex: number; caught: boolean }) {
  const { t } = useT()
  const sp = useGame((s) => s.data.species[dex])
  const f = rotomFormOf(dex)
  if (!sp || !f) return null
  return (
    <div className="flex items-center gap-3 bg-paper p-2 shadow-ring" data-rotom-week={dex}>
      <SpriteImg dex={dex} size={64} silhouette={!caught} alt={sp.name} />
      <span className="grid min-w-0 gap-1">
        <small className="font-pixel-sm text-[16px] uppercase leading-none text-muted">
          {t('ui.rotom.thisWeek')}
        </small>
        <b className="truncate text-xl font-normal leading-none">{sp.name}</b>
        <span className="flex gap-1">
          <TypeBadge type="electric" size="sm" />
          <TypeBadge type={f.type} size="sm" />
        </span>
      </span>
    </div>
  )
}

/** The result card's line for a form caught with the page open: its name, the count, and the shiny Rotom. */
export function RotomFormCard({
  dex,
  found,
  total,
  prizeLevel,
}: {
  dex: number
  found: number
  total: number
  prizeLevel?: number
}) {
  const { t } = useT()
  const name = useGame((s) => s.data.species[dex]?.name ?? '')
  return (
    <div
      className={cx(
        'flex items-center justify-center gap-2 p-2 text-center shadow-ring',
        prizeLevel ? 'bg-gold' : 'bg-gold-pale',
      )}
      data-rotom-form={dex}
    >
      {/* The last one shows the prize itself: the shiny Rotom. */}
      <SpriteImg dex={prizeLevel ? ROTOM_DEX : dex} shiny={!!prizeLevel} size={48} alt="" />
      <span className="grid gap-0.5 leading-tight">
        <span className="text-xl">{t('ui.rotom.newForm', { name })}</span>
        <span className="font-pixel-sm text-[16px]">
          {prizeLevel
            ? t('ui.rotom.prizeCard', { level: prizeLevel })
            : t('ui.rotom.count', { n: found, total })}
        </span>
      </span>
    </div>
  )
}

export function useRotomDexRules(): RuleRow[] {
  const { t } = useT()
  const level = useGame((s) => rotomPrizeLevel(s.data))
  return [
    { icon: 'calendar', title: t('ui.rules.rotomDex.week.title'), text: t('ui.rules.rotomDex.week.text') },
    { icon: 'dice', title: t('ui.rules.rotomDex.pool.title'), text: t('ui.rules.rotomDex.pool.text') },
    { icon: 'ball', title: t('ui.rules.rotomDex.boss.title'), text: t('ui.rules.rotomDex.boss.text') },
    {
      icon: 'sparkle',
      title: t('ui.rules.rotomDex.prize.title'),
      text: t('ui.rules.rotomDex.prize.text', { total: ROTOM_FORMS.length, level }),
    },
  ]
}

export function RotomDexRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useRotomDexRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.rotom.title')}
      picture={ROTOM_DEX_PICTURE}
      icon="navDex"
      rules={rules}
      onGo={onGo}
    />
  )
}
