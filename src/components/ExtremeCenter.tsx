// Extreme mode's Pokémon Centers (docs/47, docs/15 §19): the boons to pick one from instead of the healing machine,
// who a full heal or Team Rocket's trade goes to, Team Rocket's reveal, the Center a K.O. sends (it only swaps), and
// the rules. Every boon, number and outcome comes from the engine (engine/extremeCenters.ts); these pieces show them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  boonTargets,
  centerBoonRules,
  instanceMaxHp,
  monName,
  type CenterBoon,
  type GameData,
  type PokemonInstance,
} from '@/engine'
import { useT } from '@/i18n/react'
import { money, typeName } from '@/lib/format'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { HpBar } from './HpBar'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { ExtraDie } from './Portal'
import { InfoButton, RulesModal, type RuleRow, type RulesPicture } from './RulesModal'
import { MiniSprite, SpriteImg } from './SpriteImg'

/** The Center's own room: the rules' banner. */
const CENTER_PICTURE: RulesPicture = { src: '/backgrounds/pokemon-center.png', focus: '50% 40%' }

type T = (key: string, vars?: Record<string, string | number>) => string

/** The rules rows, with the admin's numbers. */
export function useCenterRules(): RuleRow[] {
  const { t } = useT()
  const r = centerBoonRules(useGame((s) => s.data))
  return [
    {
      icon: 'heart',
      title: t('ui.xcenter.rules.boon.title'),
      text: t('ui.xcenter.rules.boon.text', { n: r.offers, pct: r.heal }),
    },
    { icon: 'map', title: t('ui.xcenter.rules.where.title'), text: t('ui.xcenter.rules.where.text') },
    { icon: 'skull', title: t('ui.xcenter.rules.wipe.title'), text: t('ui.xcenter.rules.wipe.text') },
    {
      icon: 'star',
      title: t('ui.xcenter.rules.finds.title'),
      text: t('ui.xcenter.rules.finds.text', { h: r.buffHours }),
    },
  ]
}

/** The rules: once, at the first boon Center, and from its INFO (OK both times). */
export function CenterRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useCenterRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.xcenter.name')}
      picture={CENTER_PICTURE}
      icon="heart"
      rules={rules}
    />
  )
}

export interface BoonView {
  boon: CenterBoon
  icon: ReactNode
  title: string
  text: string
}

/** What a boon says: who and what it names, its numbers. Team Rocket's says only what kind of trade it is. */
export function describeBoon(
  boon: CenterBoon,
  save: { box: PokemonInstance[] },
  data: GameData,
  t: T,
): BoonView {
  const r = centerBoonRules(data)
  switch (boon.kind) {
    case 'heal':
      return {
        boon,
        icon: <PixelIcon name="heart" size={28} />,
        title: t('ui.xcenter.heal.title', { pct: boon.percent }),
        text: t('ui.xcenter.heal.text', { pct: boon.percent }),
      }
    case 'full':
      return {
        boon,
        icon: <PixelIcon name="potion" size={28} />,
        title: t('ui.xcenter.full.title'),
        text: t('ui.xcenter.full.text'),
      }
    case 'item': {
      const item = data.items[boon.itemKey]
      return {
        boon,
        icon: <ItemSprite item={item} size={30} />,
        title: item?.name ?? boon.itemKey,
        text: t('ui.xcenter.item.text'),
      }
    }
    case 'buff': {
      const p = save.box.find((x) => x.id === boon.uid)
      const name = p ? monName(p, data) : '?'
      return {
        boon,
        icon: <ExtraDie type={boon.type} />,
        title: t('ui.xcenter.buff.title', { name }),
        text: t('ui.xcenter.buff.text', { type: typeName(boon.type), h: r.buffHours }),
      }
    }
    case 'donor':
      return {
        boon,
        icon: <PixelIcon name="coin" size={28} />,
        title: t('ui.xcenter.donor.title'),
        text: t('ui.xcenter.donor.text', { amount: money(boon.gold) }),
      }
    case 'rocket':
      return {
        boon,
        icon: <PixelIcon name="trade" size={28} />,
        title: t('ui.xcenter.rocket.title'),
        text: t('ui.xcenter.rocket.text', { n: r.rocketLevels }),
      }
  }
}

/** A boon's icon in its tile: 44 px square, wider for a long one. */
function BoonIcon({ icon }: { icon: ReactNode }) {
  return (
    <span
      className="relative grid h-11 min-w-11 shrink-0 place-items-center bg-line px-1 shadow-ring-line"
      aria-hidden
    >
      {icon}
    </span>
  )
}

/** A boon's face: its icon, title and line (a tile, the pop-ups). */
function BoonFace({ view }: { view: BoonView }) {
  return (
    <>
      <BoonIcon icon={view.icon} />
      <span className="grid min-w-0 gap-0.5">
        <b className="text-[21px] font-normal leading-none">{view.title}</b>
        <small className="font-pixel-sm text-[16px] leading-tight text-muted">{view.text}</small>
      </span>
    </>
  )
}

/** Taking a boon, asked once more: BACK (or Esc) goes back to the boons with nothing spent, CONFIRM (the focus) takes it. */
export function CenterBoonConfirm({
  view,
  onBack,
  onConfirm,
}: {
  view: BoonView | null
  onBack: () => void
  onConfirm: () => void
}) {
  const { t } = useT()
  const ok = useRef<HTMLButtonElement>(null)
  // The last boon stays while the pop-up closes.
  const last = useRef(view)
  if (view) last.current = view
  const shown = view ?? last.current
  useEffect(() => {
    if (view) ok.current?.focus()
  }, [view])
  return (
    <Modal open={!!view} onClose={onBack} title={t('ui.portal.confirmTitle')} className="max-w-sm">
      {shown && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-paper p-3 shadow-ring-line">
            <BoonFace view={shown} />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
            <PixelButton onClick={onBack}>{t('ui.common.back')}</PixelButton>
            <PixelButton ref={ok} variant="primary" onClick={onConfirm}>
              {t('ui.portal.confirm')}
            </PixelButton>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * Who a full heal or Team Rocket's trade goes to: the Pokémon it can go to, each a button with its HP; a tap takes the
 * boon for it. BACK goes back to the boons with nothing spent.
 */
export function BoonTargetPicker({
  view,
  targets,
  onBack,
  onPick,
}: {
  view: BoonView | null
  targets: PokemonInstance[]
  onBack: () => void
  onPick: (uid: string) => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const rocket = view?.boon.kind === 'rocket'
  return (
    <Modal
      open={!!view}
      onClose={onBack}
      title={t(rocket ? 'ui.xcenter.pickRocket' : 'ui.xcenter.pickFull')}
      className="max-w-md"
    >
      <div className="flex flex-col gap-3">
        {rocket && (
          <p className="m-0 flex items-start gap-2 bg-paper p-2.5 font-pixel-sm text-[16px] leading-tight text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-danger))]">
            <PixelIcon name="warning" size={18} className="mt-0.5 shrink-0" />
            {t('ui.xcenter.rocketWarn')}
          </p>
        )}
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {targets.map((p) => {
            const name = monName(p, data)
            const max = instanceMaxHp(p, data)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  className="pixel-btn flex w-full items-center gap-2.5 bg-paper px-2.5 py-2 text-left"
                >
                  <MiniSprite dex={p.dex} size={40} />
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="truncate text-[19px] font-normal leading-none">{name}</b>
                      <span className="text-base leading-none">
                        {t('ui.common.level.short', { n: p.level })}
                      </span>
                    </span>
                    <HpBar hp={p.currentHp} max={max} showNumbers={false} height={8} />
                    <span className={cx('font-mono text-sm leading-none', p.currentHp <= 0 && 'text-danger')}>
                      {p.currentHp <= 0 ? t('ui.mon.fainted') : t('ui.lead.hp', { hp: p.currentHp, max })}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <PixelButton onClick={onBack}>{t('ui.common.back')}</PixelButton>
      </div>
    </Modal>
  )
}

/**
 * A boon Center's choice: the Center's sign, a line on why, the boons as big buttons (one column on a phone, three
 * from 768 px), INFO under them. A tap asks first: who for (a full heal, Team Rocket), else CONFIRM; only then
 * `onPick` (with who it is for).
 */
export function BoonChoiceView({
  views,
  save,
  onPick,
  onInfo,
}: {
  views: BoonView[]
  /** Whose Pokémon the full heal and Team Rocket may go to (the kitchen sink passes a sample). */
  save: Parameters<typeof boonTargets>[0]
  onPick: (index: number, target: string | null) => void
  onInfo: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [asked, setAsked] = useState<number | null>(null)
  const view = asked == null ? null : (views[asked] ?? null)
  const needsTarget = view?.boon.kind === 'full' || view?.boon.kind === 'rocket'
  const targets = view && needsTarget ? boonTargets(save, data, view.boon.kind) : []
  const take = (target: string | null) => {
    const i = asked
    setAsked(null)
    if (i != null) onPick(i, target)
  }
  return (
    <section
      className="pixel-panel flex flex-col gap-3 p-3 shadow-[inset_0_3px_0_#f2829f]"
      aria-labelledby="center-boons"
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-[52px] w-[52px] shrink-0 place-items-center bg-line shadow-ring-line"
          aria-hidden
        >
          <PixelIcon name="heart" size={30} />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 id="center-boons" className="m-0 text-[28px] font-normal leading-none">
            {t('ui.xcenter.choiceTitle')}
          </h2>
          <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
            {t('ui.xcenter.choiceBody')}
          </p>
        </div>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-3">
        {views.map((v, i) => (
          <li key={`${v.boon.kind}-${i}`}>
            <button
              type="button"
              onClick={() => setAsked(i)}
              aria-label={t('ui.xcenter.pickLabel', { title: v.title })}
              aria-haspopup="dialog"
              className="pixel-btn flex h-full min-h-[64px] w-full items-center gap-3 bg-paper px-3 py-2 text-left md:flex-col md:items-start"
            >
              <BoonFace view={v} />
            </button>
          </li>
        ))}
      </ul>
      <InfoButton name={t('ui.xcenter.name')} onClick={onInfo} />
      <CenterBoonConfirm
        view={needsTarget ? null : view}
        onBack={() => setAsked(null)}
        onConfirm={() => take(null)}
      />
      <BoonTargetPicker
        view={needsTarget ? view : null}
        targets={targets}
        onBack={() => setAsked(null)}
        onPick={take}
      />
    </section>
  )
}

/** Team Rocket's trade, revealed: who left, who came (its sprite, shiny or not), at what level. OK closes it. */
export function RocketReveal({
  trade,
  onClose,
}: {
  trade: { gave: PokemonInstance; got: PokemonInstance } | null
  onClose: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const last = useRef(trade)
  if (trade) last.current = trade
  const shown = trade ?? last.current
  return (
    <Modal open={!!trade} onClose={onClose} title={t('ui.xcenter.rocket.revealTitle')} className="max-w-sm">
      {shown && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <MiniSprite dex={shown.gave.dex} size={48} className="opacity-60" />
            <PixelIcon name="trade" size={24} />
            <SpriteImg dex={shown.got.dex} shiny={shown.got.shiny} size={96} alt={monName(shown.got, data)} />
          </div>
          <p className="m-0 text-[20px] leading-tight">
            {t('ui.xcenter.rocket.reveal', {
              gave: monName(shown.gave, data),
              got: monName(shown.got, data),
              level: shown.got.level,
            })}
          </p>
          {shown.got.shiny && <PixelIcon name="star" size={18} title={t('ui.mon.shiny')} />}
          <PixelButton variant="primary" className="w-full" onClick={onClose}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}

/** The Center a K.O. sends (docs/47): no boon and no heal, only the team to change; a line says so. */
export function WipeCenterNote() {
  const { t } = useT()
  return (
    <section className="pixel-panel flex items-start gap-3 p-3 shadow-[inset_0_3px_0_rgb(var(--c-danger))]">
      <span className="grid h-11 w-11 shrink-0 place-items-center bg-line shadow-ring-line" aria-hidden>
        <PixelIcon name="skull" size={24} />
      </span>
      <span className="grid gap-1">
        <b className="text-[22px] font-normal leading-none">{t('ui.xcenter.wipe.title')}</b>
        <span className="font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.xcenter.wipe.text')}
        </span>
      </span>
    </section>
  )
}
