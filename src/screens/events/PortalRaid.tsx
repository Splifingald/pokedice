// Giratina's area raid in Distortion World's look (docs/15 §27, docs/28 §6; the user's ask of 2026-10-15): only for a
// raid whose area is in portal mode. Its page and pop-ups wear the violet night (`.dw-scope`), the portal turning as
// their banner, Giratina distorted on its card; the effects themselves are PortalFx's. Nothing here decides a rule.
import { useEffect, useState, type ReactNode } from 'react'
import { catchValueOf, portalModeOf, type RaidRules, type TodayRaid } from '@/engine'
import { GlitchSprite, PortalScene, RaidStageArt } from '@/components/Portal'
import { PixelIcon } from '@/components/icons'
import { SpriteImg } from '@/components/SpriteImg'
import { statHint, statLabel } from '@/components/StatChip'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { distortionLevel } from '@/fx/timelines/portal'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** The raid's area is in portal mode (Distortion World's Giratina): its page, pop-ups and fight are themed. */
export function usePortalRaid(areaId: string | null | undefined): boolean {
  return useGame(
    (s) =>
      !!portalModeOf(
        s.data.areas.find((a) => a.id === areaId),
        s.data,
      ),
  )
}

/**
 * A pop-up of Giratina's raid tearing in as it opens: the UI glitch's look (`.ui-glitch`) once, on the panel, then it
 * stays put while it's read. Motion off: nothing; short: the copies only.
 */
export function useTearIn(open: boolean): string | undefined {
  const { level, calm } = useMotion()
  const dl = distortionLevel(level, calm)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!open || dl === 'off') return
    setOn(true)
    const timer = setTimeout(() => setOn(false), 400)
    return () => clearTimeout(timer)
  }, [open, dl])
  return on ? (dl === 'short' ? 'ui-glitch-short' : 'ui-glitch') : undefined
}

/**
 * The banner of Giratina's raid page and pop-up: the Distortion World, its rocks drifting, the portal turning, and
 * shiny Giratina distorted in front of it (`mon`: its dex; none on the page's own banner, its card shows it).
 */
export function PortalRaidBanner({
  mon,
  className,
  children,
}: {
  mon?: number
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cx(
        'relative overflow-hidden bg-[#07020d] leading-[0] shadow-[inset_0_-3px_0_#e8384a,0_2px_0_#07020d]',
        className,
      )}
    >
      <PortalScene />
      {mon != null && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2" aria-hidden>
          <GlitchSprite dex={mon} size={88} shiny />
        </span>
      )}
      {children}
    </div>
  )
}

/**
 * The raid card in the Distortion World (RaidCard's, docs/24): the raid's stage (the void, the portal right behind,
 * its island), shiny Giratina wearing the distortion on it, a red-and-gold glow; its name, level and bars; stamped
 * CAUGHT once caught (still then).
 */
export function PortalRaidCard({
  raid,
  rules,
  name,
  areaName,
}: {
  raid: TodayRaid
  rules: RaidRules
  name: string
  areaName: string
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const colors = data.config.events.raid.barColors
  return (
    <div
      data-glitch
      className="dw-scope relative aspect-[3/2] w-full overflow-hidden bg-[#07020d] shadow-[0_0_0_2px_#07020d,inset_0_0_0_2px_#8f72c8]"
    >
      <RaidStageArt kind="card" />
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, #e8384a30 0 18%, transparent 44%), linear-gradient(transparent 58%, #07020dc8)',
        }}
      />
      {areaName && (
        <span className="absolute left-2 top-2 bg-panel/90 px-1.5 pb-0.5 font-pixel-sm text-[15px] text-ink shadow-ring-line">
          {areaName}
        </span>
      )}
      <span
        className="absolute left-2 top-[34px] flex items-center gap-1 bg-paper/95 px-1.5 pb-0.5 font-pixel-sm text-[15px] text-ink shadow-ring-line"
        title={statHint('catch')}
      >
        <PixelIcon name="ball" size={14} />
        {statLabel('catch')} <b className="font-normal tabular-nums">{catchValueOf(data, raid.dex)}</b>
      </span>
      <span className="absolute bottom-[28%] left-1/2 -translate-x-1/2">
        {raid.caught ? (
          <SpriteImg dex={raid.dex} size={128} shiny={raid.shiny} className="grayscale-[0.4]" />
        ) : (
          <GlitchSprite dex={raid.dex} size={128} shiny={raid.shiny} />
        )}
      </span>
      <span className="absolute bottom-2 left-2.5 grid gap-0.5 leading-none text-white [text-shadow:0_2px_0_#07020d,2px_0_0_#07020d]">
        <b className="text-[28px] font-normal">
          {raid.shiny ? t('ui.events.raid.shinyName', { name }) : name}
        </b>
        <small className="font-pixel-sm text-[15px] text-[#ffc94a]">
          {t('ui.events.raid.sub', { level: rules.level, bars: rules.bars })}
        </small>
      </span>
      <span className="absolute bottom-3 right-2.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: rules.bars }, (_, i) => (
          <i
            key={i}
            className="block h-2 w-[18px] shadow-[0_0_0_2px_#07020d]"
            style={{ background: colors[i % colors.length] }}
          />
        ))}
      </span>
      {raid.caught && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 bg-white/85 px-3.5 pb-1.5 pt-1 text-[34px] leading-none tracking-[0.08em] text-forest shadow-[inset_0_0_0_3px_#34c97a,0_0_0_2px_#24304f]">
          {t('ui.events.raid.caught')}
        </span>
      )}
    </div>
  )
}
