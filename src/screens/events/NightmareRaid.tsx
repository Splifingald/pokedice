// Darkrai's area raid in the nightmare's look (docs/15 §29, docs/30; as Giratina's wears the Distortion World): only for
// a raid whose area is in nightmare mode. Its page and pop-ups wear the moonlit night (`.nm-scope`), the full moon as
// their banner, Darkrai on its card in front of the moon; the effects themselves are NightmareFx's. Nothing here
// decides a rule.
import type { ReactNode } from 'react'
import { catchValueOf, nightmareModeOf, type RaidRules, type TodayRaid } from '@/engine'
import { MoonScene, NightStageArt } from '@/components/Nightmare'
import { PixelIcon } from '@/components/icons'
import { SpriteImg } from '@/components/SpriteImg'
import { statHint, statLabel } from '@/components/StatChip'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** The raid's area is in nightmare mode (Newmoon Island's Darkrai): its page, pop-ups and fight are themed. */
export function useNightmareRaid(areaId: string | null | undefined): boolean {
  return useGame(
    (s) =>
      !!nightmareModeOf(
        s.data.areas.find((a) => a.id === areaId),
        s.data,
      ),
  )
}

/**
 * The banner of Darkrai's raid page and pop-up: the night, the full moon, the smoke, and Darkrai in front of the moon
 * (`mon`: its dex; none on the page's own banner, its card shows it).
 */
export function NightmareRaidBanner({
  mon,
  shiny = true,
  className,
  children,
}: {
  mon?: number
  shiny?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cx(
        'relative overflow-hidden bg-[#03040c] leading-[0] shadow-[inset_0_-3px_0_#f3efd6,0_2px_0_#03040c]',
        className,
      )}
    >
      <MoonScene />
      {mon != null && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2" aria-hidden>
          <SpriteImg dex={mon} size={88} shiny={shiny} />
        </span>
      )}
      {children}
    </div>
  )
}

/**
 * The raid card under the full moon (RaidCard's, docs/24): the nightmare's stage (the night, the moon right behind,
 * its rock, smoke rising off it), shiny Darkrai on it, a cold glow; its name, level and bars; stamped CAUGHT once
 * caught.
 */
export function NightmareRaidCard({
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
      className="nm-scope relative aspect-[3/2] w-full overflow-hidden bg-[#03040c] shadow-[0_0_0_2px_#03040c,inset_0_0_0_2px_#8b95d6]"
    >
      <NightStageArt kind="card" />
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, #5ad8ff22 0 18%, transparent 44%), linear-gradient(transparent 58%, #03040cc8)',
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
        <SpriteImg
          dex={raid.dex}
          size={128}
          shiny={raid.shiny}
          className={raid.caught ? 'grayscale-[0.4]' : undefined}
        />
      </span>
      <span className="absolute bottom-2 left-2.5 grid gap-0.5 leading-none text-white [text-shadow:0_2px_0_#03040c,2px_0_0_#03040c]">
        <b className="text-[28px] font-normal">
          {raid.shiny ? t('ui.events.raid.shinyName', { name }) : name}
        </b>
        <small className="font-pixel-sm text-[15px] text-[#c8f4ff]">
          {t('ui.events.raid.sub', { level: rules.level, bars: rules.bars })}
        </small>
      </span>
      <span className="absolute bottom-3 right-2.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: rules.bars }, (_, i) => (
          <i
            key={i}
            className="block h-2 w-[18px] shadow-[0_0_0_2px_#03040c]"
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
