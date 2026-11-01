// A fight on a computer (docs/42 §3, the user's call of 2026-10-28): the stage on top and the dice under it in the middle
// column, the Bag's content at its left and the team at its right, with what a phone keeps behind the Bag button and
// the pips. Phones keep the button and the pips: these columns are for the room a wide screen has at the stage's sides.
import type { ReactNode } from 'react'
import { hasAnyStatus, type Battler, type ItemDef, type PokeType } from '@/engine'
import { sfx } from '@/audio/sfx'
import { HpBar } from '@/components/HpBar'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { MiniSprite } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { TypeBadge } from '@/components/TypeBadge'
import { attackEdge } from '@/components/TypeMatchups'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { useTypeHints } from '@/store/hooks'
import { cx } from '@/theme/util'

/** One thing in the Bag, as the column lists it. */
export interface BagEntry {
  key: string
  item: ItemDef
  count: number
  /** It would do something for one of the team right now. */
  useful: boolean
  /** What it does (or why it can't, under Extreme mode's rule). */
  does: string
}

/** A column's frame: its heading, then what it lists, scrolling inside itself when it holds more. */
function SideFrame({
  label,
  head,
  children,
  className,
}: {
  label: string
  head: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={label} className={cx('pixel-panel bt-side flex min-h-0 flex-col', className)}>
      <div className="flex min-h-[48px] items-center gap-2 px-3 pt-2">{head}</div>
      <div className="pixel-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3 pt-1">
        {children}
      </div>
    </section>
  )
}

/**
 * The Bag, open: every item that works in a fight, the ones that would help first. A tap uses an Ether on the one in
 * battle; anything else asks who (the team's column picks). One item a turn, and the turn goes on.
 */
export function BagColumn({
  entries,
  open,
  used,
  aim,
  onPick,
  shut,
  className,
}: {
  entries: readonly BagEntry[]
  /** An item can be used right now (the player's turn, none used yet). */
  open: boolean
  /** This turn's item is used. */
  used: boolean
  /** The item waiting for its Pokémon. */
  aim: string | null
  onPick: (key: string) => void
  /** Why the bag stays shut in this fight (the whiteout, docs/61 §4.3), said over its greyed items. */
  shut?: string | null
  className?: string
}) {
  const { t } = useT()
  return (
    <SideFrame
      className={className}
      label={t('ui.battle.itemsTitle')}
      head={
        <>
          <PixelIcon name="bag" size={20} />
          <h2 className="m-0 text-[20px] font-normal leading-none">{t('ui.battle.bag')}</h2>
          <span
            className={cx(
              'ml-auto text-right font-pixel-sm text-[16px] leading-tight',
              used ? 'text-ink' : 'text-muted',
            )}
          >
            {t('ui.battle.oneItemPerTurn')}
          </span>
        </>
      }
    >
      {shut && (
        <p className="m-0 flex items-start gap-1.5 bg-well p-2 font-pixel-sm text-[16px] leading-tight shadow-ring-line" role="note">
          <PixelIcon name="lock" size={14} className="mt-px shrink-0" />
          <span>{shut}</span>
        </p>
      )}
      {entries.length === 0 ? (
        <p className="m-0 py-2 text-center text-[18px] leading-tight text-muted">{t('ui.shop.bagEmpty')}</p>
      ) : (
        entries.map((e) => {
          const picked = aim === e.key
          return (
            <button
              key={e.key}
              type="button"
              disabled={!open || !e.useful}
              aria-pressed={picked}
              onClick={() => {
                sfx('button')
                onPick(e.key)
              }}
              className={cx(
                'flex min-h-[52px] w-full items-center gap-2 px-2 py-1 text-left disabled:opacity-50',
                picked ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
              )}
            >
              <ItemSprite item={e.item} size={32} className="shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[18px] leading-none">{e.item.name}</span>
                <span className="font-pixel-sm text-[16px] leading-tight text-muted">{e.does}</span>
              </span>
              <span className="shrink-0 font-pixel-sm text-[16px] tabular-nums">×{e.count}</span>
            </button>
          )
        })
      )}
    </SideFrame>
  )
}

/** Who the picked item goes to: the column turns into the Bag's "on whom", the ones it helps lit. */
export interface TeamAim {
  item: string
  helps: (b: Battler) => boolean
  /** Why it can't go to this one (a string key). */
  whyNot: (b: Battler) => string
  onUse: (b: Battler) => void
  onCancel: () => void
}

/** The switch's pick, made in the column (the middle panel says what it costs and has GO!). */
export interface TeamPick {
  value: string
  /** Those able to come in. */
  able: ReadonlySet<string>
  onChange: (uid: string) => void
}

/**
 * The team, every Pokémon on a row: its sprite, name, level, HP with its numbers, its statuses (its types too with More
 * details), the ones on the field tagged, and with the type hint on, a thumb for how its dice fare against the foe. A
 * tap opens the switch where the pips would, and in the switch picks the one GO! sends; with an item picked in the Bag,
 * a tap gives it the item.
 */
export function TeamColumn({
  team,
  hpOf,
  onField,
  canSwitch,
  calling,
  onPick,
  aim,
  pick,
  foe,
  className,
}: {
  team: readonly Battler[]
  hpOf: (b: Battler) => number
  onField: (b: Battler) => boolean
  canSwitch: boolean
  calling: boolean
  onPick: (b: Battler) => void
  aim: TeamAim | null
  pick?: TeamPick | null
  /** The foe in front's types, for the thumbs. */
  foe?: readonly PokeType[]
  className?: string
}) {
  const { t } = useT()
  const reduced = useGame((s) => s.settings.reducedMotion)
  const details = useGame((s) => s.settings.details === true)
  const data = useGame((s) => s.data)
  const items = data.items
  const hints = useTypeHints()
  const itemName = aim ? (items[aim.item]?.name ?? aim.item) : ''
  return (
    <SideFrame
      className={className}
      label={aim ? t('ui.battle.useItemOn', { item: itemName }) : t('ui.battle.switchGroup')}
      head={
        aim ? (
          <>
            <h2 className="m-0 min-w-0 flex-1 text-[20px] font-normal leading-tight">
              {t('ui.battle.useItemOn', { item: itemName })}
            </h2>
            <button
              type="button"
              aria-label={t('ui.common.cancel')}
              aria-keyshortcuts="Escape"
              onClick={() => {
                sfx('button')
                aim.onCancel()
              }}
              className="grid min-h-[44px] min-w-[44px] place-items-center bg-paper shadow-ring"
            >
              <PixelIcon name="close" size={14} />
            </button>
          </>
        ) : (
          <>
            <PixelIcon name="navTeam" size={20} />
            <h2 className="m-0 text-[20px] font-normal leading-none">{t('ui.nav.team')}</h2>
          </>
        )
      }
    >
      {team.map((b) => {
        const hp = hpOf(b)
        const out = hp <= 0
        const here = onField(b)
        const target = !!aim && aim.helps(b)
        const able = !!pick && pick.able.has(b.uid)
        const chosen = !!pick && pick.value === b.uid
        const open = aim ? target : pick ? able : canSwitch && !here && !out
        const edge = hints && foe?.length && !out ? attackEdge(data, b.dice, foe) : 1
        // In the switch's pick the row keeps its own words (GO! is "Send out …"); aria-pressed says it's the one picked.
        const label = aim
          ? t('ui.battle.useOn', { item: itemName, name: b.name })
          : out
            ? t('ui.battle.pipFainted', { name: b.name })
            : t(here ? 'ui.battle.pipActive' : 'ui.battle.pipSwitch', { name: b.name, hp, max: b.maxHp })
        return (
          <button
            key={b.uid}
            type="button"
            onClick={
              open
                ? () => {
                    sfx('button')
                    if (aim) aim.onUse(b)
                    // In a pick (the send-out's lead, a K.O.'s, a switch's) a click picks, as 1–6 do; GO! sends it
                    // (a player's feedback, 2026-10-30: the send-out's lead couldn't be changed with the mouse).
                    else if (pick) pick.onChange(b.uid)
                    else onPick(b)
                  }
                : undefined
            }
            aria-disabled={!open}
            aria-pressed={pick ? chosen : undefined}
            aria-label={label}
            className={cx(
              'flex min-h-[64px] w-full items-center gap-2 px-2 py-1.5 text-left',
              (here && !aim && !pick) || chosen ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
              aim && target && 'shadow-card-gold',
              chosen && 'outline outline-[3px] outline-offset-0 outline-gold',
              (out && !target) || (aim && !target) || (pick && !able) ? 'opacity-55' : null,
              out && !target && 'grayscale',
              !open && 'cursor-default',
              calling && open && !chosen && !reduced && 'bt-call',
            )}
          >
            <MiniSprite dex={b.dex} size={40} className="-my-1 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-1.5">
                {/* The whole name, never "Charmel…" (docs/15): a long one wraps. */}
                <span className="min-w-0 text-[18px] leading-none [overflow-wrap:anywhere]">{b.name}</span>
                <span className="shrink-0 font-pixel-sm text-[16px] leading-none">
                  {t('ui.common.level.short', { n: b.level })}
                </span>
                {edge !== 1 && (
                  <PixelIcon
                    name={edge > 1 ? 'thumbUp' : 'thumbDown'}
                    size={16}
                    title={t(edge > 1 ? 'ui.lead.strong' : 'ui.lead.weak')}
                    className="shrink-0"
                  />
                )}
              </span>
              <HpBar hp={hp} max={b.maxHp} compact height={8} />
              {aim && !target ? (
                <span className="font-pixel-sm text-[16px] leading-tight text-ink">{t(aim.whyNot(b))}</span>
              ) : (
                ((here && !aim) || hasAnyStatus(b.status) || details) && (
                  <span className="flex flex-wrap items-center gap-1">
                    {here && !aim && (
                      <span className="bg-gold px-1 py-0.5 font-pixel-sm text-[16px] leading-none text-ink shadow-ring-thin">
                        {t('ui.battle.inBattle')}
                      </span>
                    )}
                    {details && b.types.map((x) => <TypeBadge key={x} type={x} size="sm" />)}
                    <StatusIcons status={b.status} />
                  </span>
                )
              )}
            </span>
          </button>
        )
      })}
    </SideFrame>
  )
}
