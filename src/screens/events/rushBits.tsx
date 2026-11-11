// Type Rush's light pieces (docs/71 §3): the type over the picture, its tag, its line on Home. Apart from the pop-up
// (rush.tsx), so Home's cards and the battle screen's imports (world.tsx → live.tsx) don't load the gifts' art.
import { rushBoost, rushCards, rushType, type LiveEvent, type SaveData } from '@/engine'
import { Chip } from '@/components/Chip'
import { Die } from '@/components/Die'
import { TypeBadge } from '@/components/TypeBadge'
import { useT } from '@/i18n/react'
import { typeName } from '@/lib/format'
import { cx } from '@/theme/util'

const pct = (m: number) => Math.round((m - 1) * 100)

/** The type over the picture: its die (a six), its badge and the boost, "+20 %". */
export function RushArt({ e, big }: { e: LiveEvent; big?: boolean }) {
  const { t } = useT()
  const type = rushType(e)
  const boost = rushBoost([e])
  return (
    <span className={cx('lv-fx rush-art', big && 'big')} aria-hidden>
      <Die type={type} face={{ kind: 'number', value: 6 }} size={big ? 52 : 30} />
      <span className="grid justify-items-start gap-1">
        <TypeBadge type={type} />
        {boost && <span className="rush-boost">{t('ui.live.pct', { pct: pct(boost.multiplier) })}</span>}
      </span>
    </span>
  )
}

/** Its line on Home's square: what's waiting ("3 to collect!"), else the boost. */
export function rushSub(
  save: SaveData | null,
  e: LiveEvent,
  tr: (k: string, v?: Record<string, string | number>) => string,
): string {
  const ready = save ? rushCards(save, e).filter((c) => c.ready).length : 0
  if (ready) return tr('ui.live.rush.ready', { n: ready })
  return tr('ui.live.rush.sub', { type: typeName(rushType(e)), pct: pct(e.rush.boost) })
}

/** Type Rush's tag: its type's badge and +20 %. */
export function RushTag({ e, className }: { e: LiveEvent; className?: string }) {
  const { t } = useT()
  return (
    <Chip tone="red" className={cx('tracking-[0.04em]', className)}>
      {t('ui.live.pct', { pct: pct(e.rush.boost) })}
    </Chip>
  )
}
