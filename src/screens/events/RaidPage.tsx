// Raid Battles' page (docs/18 §3, the Visual Lab's mockup): today's raid Pokémon on the picture of the area that
// unlocked it, the time left, the tries, a CAUGHT stamp once it's caught, and START right under it.
import type { ReactNode } from 'react'
import { type TodayRaid } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { artPlacement, battleWindow, pictureOf } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { pushToast, useGame } from '@/store/game'
import { useTodayRaid } from '@/store/raid'
import { cx } from '@/theme/util'

/** The raid's area picture, cut like a battle's (its middle 240 × 160, the horizon halfway down). */
export function RaidPicture({ areaId, className, children }: { areaId: string; className?: string; children?: ReactNode }) {
  const pic = pictureOf(areaId)
  return (
    <div className={cx('relative overflow-hidden bg-night', className)}>
      {pic && (
        <img
          src={pic.url}
          alt=""
          className="pixelated absolute max-w-none"
          style={{ ...artPlacement(battleWindow(pic)), imageRendering: 'pixelated' }}
        />
      )}
      {children}
    </div>
  )
}

/** The raid card: the raid Pokémon on its area, its name, level and bars, the time left; stamped once caught. */
export function RaidCard({ raid, msLeft }: { raid: TodayRaid; msLeft: number | null }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = data.config.events.raid
  const area = data.areas.find((a) => a.id === raid.areaId)
  const name = data.species[raid.dex]?.name ?? `#${raid.dex}`
  return (
    <RaidPicture areaId={raid.areaId} className="aspect-[3/2] w-full shadow-ring">
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 58%, #ffbe2e55 0 22%, transparent 48%), linear-gradient(#f2553f20, #24304fa0)' }}
      />
      {area && (
        <span className="absolute left-2 top-2 bg-panel/90 px-1.5 pb-0.5 font-pixel-sm text-[15px] text-ink shadow-ring-line">{area.name}</span>
      )}
      {msLeft != null && (
        <span className="absolute right-2 top-2 bg-night px-1.5 pb-0.5 font-pixel-sm text-[15px] text-gold-light">
          {t(raid.caught ? 'ui.events.raid.newIn' : 'ui.events.raid.endsIn', { time: countdown(msLeft) })}
        </span>
      )}
      <span className={cx('absolute left-1/2 top-[18%] -translate-x-1/2', !raid.caught && 'ev-bob')}>
        <SpriteImg dex={raid.dex} size={128} shiny={raid.shiny} className={raid.caught ? 'grayscale-[0.4]' : undefined} />
      </span>
      <span className="absolute bottom-2 left-2.5 grid gap-0.5 leading-none text-white [text-shadow:0_2px_0_#24304f]">
        <b className="text-[28px] font-normal">{raid.shiny ? t('ui.events.raid.shinyName', { name }) : name}</b>
        <small className="font-pixel-sm text-[15px] text-gold-light">{t('ui.events.raid.sub', { level: cfg.level, bars: cfg.bars })}</small>
      </span>
      <span className="absolute bottom-3 right-2.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: cfg.bars }, (_, i) => (
          <i key={i} className="block h-2 w-[18px] shadow-[0_0_0_2px_#24304f]" style={{ background: cfg.barColors[i % cfg.barColors.length] }} />
        ))}
      </span>
      {raid.caught && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 bg-white/85 px-3.5 pb-1.5 pt-1 text-[34px] leading-none tracking-[0.08em] text-forest shadow-[inset_0_0_0_3px_#34c97a,0_0_0_2px_#24304f]">
          {t('ui.events.raid.caught')}
        </span>
      )}
    </RaidPicture>
  )
}

export function RaidPage() {
  const { t, tPlural } = useT()
  const { raid, msLeft } = useTodayRaid()
  if (!raid) return <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.events.raid.loading')}</p>
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3">
      <RaidCard raid={raid} msLeft={msLeft} />
      {!raid.caught && (
        <PixelButton variant="primary" size="lg" className="w-full" onClick={() => pushToast(t('ui.events.building', { name: t('ui.events.raid.name') }))}>
          {t('ui.events.raid.start')}
        </PixelButton>
      )}
      <p className="m-0 text-center font-pixel-sm text-[15px] text-muted">{tPlural('ui.events.raid.tries', raid.tries, { n: raid.tries })}</p>
    </div>
  )
}
