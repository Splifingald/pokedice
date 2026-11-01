// The weather (docs/62 §2, docs/15 §44): its chip by the area's name (a tap shows the rules), its small twin and its
// particles on a fight's stage, the damage recap's × chip, and the rules pop-up. The engine decides the weather
// (`weatherAt`) and what it does; these only show it.
import { useEffect, useRef, useState } from 'react'
import {
  markFlavourSeen,
  nextWeatherChange,
  regionOfArea,
  weatherIsDaily,
  type RegionId,
  type Weather,
} from '@/engine'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { mutateSave, useGame } from '@/store/game'
import { useWeatherHere } from '@/store/flavours'
import { serverNow } from '@/store/serverTime'
import { cx } from '@/theme/util'
import { PixelIcon, type IconName } from './icons'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesModal, type RuleRow } from './RulesModal'

export const WEATHER_ICON: Record<Weather, IconName> = {
  clear: 'daySun',
  overcast: 'weatherCloud',
  rain: 'weatherRain',
  thunderstorm: 'weatherStorm',
  sun: 'daySun',
  sand: 'weatherSand',
  snow: 'weatherSnow',
  fog: 'weatherFog',
  ash: 'weatherAsh',
}

/** The raids' four have their names already (docs/40); the others are the flavours' own. */
const RAID_NAMED: ReadonlySet<Weather> = new Set(['rain', 'sun', 'snow', 'sand'])
export const weatherNameKey = (w: Weather): string => (RAID_NAMED.has(w) ? `ui.raid.x.weather.${w}.name` : `ui.weather.${w}.name`)

/** The weather's tile: a sky-blue one in fair weather, a grey one under clouds, sand or ash. */
export function WeatherChip({ weather, size = 22, className }: { weather: Weather; size?: number; className?: string }) {
  const fair = weather === 'clear' || weather === 'sun' || weather === 'snow' || weather === 'rain'
  return (
    <span
      className={cx('pixel-corners inline-flex items-center justify-center shadow-ring-line', fair ? 'bg-sky' : 'bg-parchment', className)}
      style={{ padding: Math.round(size / 5) }}
      data-weather={weather}
    >
      <PixelIcon name={WEATHER_ICON[weather]} size={size} />
    </span>
  )
}

/** The damage recap's factor (docs/62 §2): the weather's icon and its ×, never hidden in the type's. */
export function WeatherBoostChip({ kind, n, className }: { kind: Weather; n: number; className?: string }) {
  const { t } = useT()
  const label = t('ui.weather.boostLabel', { weather: t(weatherNameKey(kind)), n })
  return (
    <span role="img" aria-label={label} title={label} className={cx('inline-flex shrink-0 items-center gap-0.5', className)}>
      <PixelIcon name={WEATHER_ICON[kind]} size={16} />
      <span className="font-pixel-sm">×{n}</span>
    </span>
  )
}

/** "Rain in Routes 118 & 119", or Galar's "Today: Thunderstorm · changes in 5 h". */
export function useWeatherLine(weather: Weather, areaId: string): string {
  const { t } = useT()
  const area = useGame((s) => s.data.areas.find((a) => a.id === areaId))
  const daily = useGame((s) => !!area && weatherIsDaily(area, s.data))
  const name = t(weatherNameKey(weather))
  if (!daily) return t('ui.weather.now', { weather: name, area: area?.name ?? '' })
  const now = serverNow() ?? Date.now()
  const hours = Math.max(1, Math.ceil((nextWeatherChange(now) - now) / 3_600_000))
  return t('ui.weather.today', { weather: name, hours })
}

/** By the area's name in the top bar, while its weather is on: the chip. A tap shows the rules (its INFO). */
export function WeatherButton({ areaId }: { areaId: string }) {
  const { t } = useT()
  const weather = useWeatherHere(areaId)
  const region = useGame((s) => {
    const a = s.data.areas.find((x) => x.id === areaId)
    return a ? regionOfArea(a) : null
  })
  const [open, setOpen] = useState(false)
  const line = useWeatherLine(weather ?? 'clear', areaId)
  if (!weather || !region) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] shrink-0 items-center md:min-h-[36px]"
        aria-label={t('ui.dayNight.rulesLabel', { now: line })}
        title={line}
        data-weather-button={weather}
      >
        <WeatherChip weather={weather} size={18} />
      </button>
      <WeatherRulesModal open={open} onClose={() => setOpen(false)} region={region} />
    </>
  )
}

/**
 * A fight's indicator, on the stage's top right (where Johto's sun or moon goes; no region has both): the chip at a
 * small size, with the weather's name for screen readers.
 */
export function BattleWeather({ weather }: { weather: Weather }) {
  const { t } = useT()
  return (
    <span
      className="pointer-events-none absolute right-1 top-[calc(var(--strip,0px)+4px)] z-10 leading-[0]"
      role="img"
      aria-label={t(weatherNameKey(weather))}
      data-battle-weather={weather}
    >
      <WeatherChip weather={weather} size={14} />
    </span>
  )
}

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
}

/** How each weather falls on the stage: how many at once, how fast, which way, and its colours. */
const FALL: Partial<Record<Weather, { n: number; vx: [number, number]; vy: [number, number]; size: [number, number]; colors: string[] }>> = {
  rain: { n: 70, vx: [-60, -40], vy: [380, 460], size: [1, 1], colors: ['#a9dcff', '#7cc8f0'] },
  thunderstorm: { n: 90, vx: [-90, -60], vy: [420, 520], size: [1, 1], colors: ['#a9dcff', '#dfe7f2'] },
  snow: { n: 45, vx: [-24, -8], vy: [30, 60], size: [2, 3], colors: ['#ffffff', '#dfe7f2'] },
  sand: { n: 80, vx: [180, 260], vy: [10, 40], size: [1, 2], colors: ['#f0a060', '#d8783a', '#ffe7a8'] },
  ash: { n: 35, vx: [-10, 10], vy: [20, 40], size: [1, 2], colors: ['#8592ad', '#b6c3d9'] },
}

const between = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0])

/**
 * The weather over a fight's stage (docs/62 §2): rain streaks, snowflakes, blowing sand, falling ash; the sun's glare,
 * a fog band, an overcast dimming. At Motion level 0 nothing moves: a still frame stays (the chip says the rest).
 */
export function WeatherLayer({ weather }: { weather: Weather | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { calm } = useMotion()
  const fall = weather ? FALL[weather] : undefined
  useEffect(() => {
    const cv = ref.current
    if (!cv || !fall || !weather) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const W = cv.width
    const H = cv.height
    const make = (spread: boolean): Drop => ({
      x: Math.random() * (W + 80) - 40,
      y: spread ? Math.random() * H : -6,
      vx: between(fall.vx),
      vy: between(fall.vy),
      size: Math.round(between(fall.size)),
      color: fall.colors[Math.floor(Math.random() * fall.colors.length)]!,
    })
    const drops = Array.from({ length: fall.n }, () => make(true))
    // Sand blows from the left: it enters from that side rather than from the top.
    const respawn = (d: Drop) => {
      Object.assign(d, make(false))
      if (weather === 'sand') {
        d.x = -10
        d.y = Math.random() * H
      }
    }
    const streak = weather === 'rain' || weather === 'thunderstorm'
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const d of drops) {
        ctx.fillStyle = d.color
        if (streak) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 5)
        else ctx.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size)
      }
    }
    if (calm) {
      draw()
      return
    }
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      for (const d of drops) {
        d.x += d.vx * dt
        d.y += d.vy * dt
        if (d.y > H + 6 || d.x > W + 40 || d.x < -50) respawn(d)
      }
      draw()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [weather, fall, calm])
  if (!weather || weather === 'clear') return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden" data-weather-layer={weather}>
      {weather === 'sun' && <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_8%,rgba(255,231,168,0.55),transparent_45%)]" />}
      {(weather === 'overcast' || weather === 'thunderstorm' || weather === 'rain') && <div className="absolute inset-0 bg-ink/10" />}
      {weather === 'sand' && <div className="absolute inset-0 bg-[#d8783a]/15" />}
      {weather === 'fog' && (
        <div className="absolute inset-x-0 bottom-0 top-1/3 bg-gradient-to-t from-white/60 via-white/35 to-transparent" />
      )}
      {fall && <canvas ref={ref} width={300} height={200} className="pixelated absolute inset-0 h-full w-full" />}
    </div>
  )
}

/** The rules: what the weather is, rain and sun, sandstorm and snow, then the region's own. */
export function useWeatherRules(region: RegionId): RuleRow[] {
  const { t } = useT()
  return [
    { icon: 'weatherRain', title: t('ui.weather.rules.what.title'), text: t('ui.weather.rules.what.text') },
    { icon: 'daySun', title: t('ui.weather.rules.boost.title'), text: t('ui.weather.rules.boost.text') },
    { icon: 'weatherSand', title: t('ui.weather.rules.wear.title'), text: t('ui.weather.rules.wear.text') },
    region === 'galar'
      ? { icon: 'calendar', title: t('ui.weather.rules.galar.title'), text: t('ui.weather.rules.galar.text') }
      : { icon: 'map', title: t('ui.weather.rules.hoenn.title'), text: t('ui.weather.rules.hoenn.text') },
  ]
}

/** The rules' banner: rain on one side, a sandstorm on the other. */
function WeatherBanner() {
  return (
    <div className="absolute inset-0 grid grid-cols-3" aria-hidden>
      <span className="grid place-items-center bg-sky">
        <PixelIcon name="weatherRain" size={56} />
      </span>
      <span className="grid place-items-center bg-gold-pale">
        <PixelIcon name="daySun" size={56} />
      </span>
      <span className="grid place-items-center bg-parchment">
        <PixelIcon name="weatherSand" size={56} />
      </span>
    </div>
  )
}

/** Its rules (docs/15 §20): once, the first time the player is in an area with weather, then from its chip. */
export function WeatherRulesModal({
  open,
  onClose,
  onGo,
  region,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
  region: RegionId
}) {
  const { t } = useT()
  const rules = useWeatherRules(region)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t(region === 'galar' ? 'ui.weather.titleGalar' : 'ui.weather.titleHoenn')}
      picture={<WeatherBanner />}
      icon="weatherRain"
      rules={rules}
      onGo={onGo}
    />
  )
}

/**
 * Once, between fights, the first time the player is in an area with weather (Hoenn's and Galar's each). It takes its
 * turn in the one-time pop-ups' queue (engine/popups.ts).
 */
export function WeatherRulesPopup() {
  const open = useMyTurn('weather')
  useOnScreen('weather', open)
  const region = useGame((s) => {
    const a = s.save ? s.data.areas.find((x) => x.id === s.save!.currentAreaId) : undefined
    return a ? regionOfArea(a) : null
  })
  const key = region === 'galar' ? 'galarWeather' : 'hoennWeather'
  const seen = () => mutateSave((s) => markFlavourSeen(s, key))
  return <WeatherRulesModal open={open && !!region} onClose={seen} onGo={seen} region={region ?? 'hoenn'} />
}
