import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dayCareFullAt,
  dayCareOf,
  dayCareXp,
  isDayCareOpen,
  teamOf,
  versusReadyCount,
  versusUnlocked,
  VERSUS_TEAM_SIZE,
} from '@/engine'
import { useT } from '@/i18n/react'
import { conditionLabel } from '@/i18n/text'
import { Chip, NewTag } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { isSupabaseConfigured } from '@/lib/supabase'
import { opponentsOf, versusBoardCached, type VersusEntry } from '@/lib/versus'
import { useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { featuredSecret } from './areas'
import { AreaStrip } from '@/components/AreaStrip'
import { travelTo } from '@/store/travel'

/** A widget's frame: a framed panel, a small header row, and whatever it shows. */
function Widget({
  title,
  tag,
  label,
  onClick,
  children,
  className,
}: {
  title: string
  tag?: ReactNode
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx('pixel-panel flex min-w-0 flex-col gap-[5px] px-2.5 pb-2.5 pt-2 text-left', className)}
    >
      <span className="flex w-full items-center gap-1.5 font-pixel-sm text-[15px] leading-none text-muted">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {tag}
      </span>
      {children}
    </button>
  )
}

/** A thin progress meter: gold, green when full. */
function Meter({ value, max }: { value: number; max: number }) {
  const k = max > 0 ? Math.min(1, value / max) : 0
  return (
    <span className="relative block h-1.5 w-full bg-line shadow-ring-line-thin" aria-hidden>
      <i
        className={cx('absolute inset-y-0 left-0 block', k >= 1 ? 'bg-hp-green' : 'bg-gold')}
        style={{ width: `${k * 100}%` }}
      />
    </span>
  )
}

/** The newest secret area (one tap to travel), or the next one to open with how close it is. */
function SecretWidget({ onSecrets }: { onSecrets: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const f = featuredSecret(save, data)
  if (!f)
    return (
      <Widget title={t('ui.map.secretAreas')} label={t('ui.home.secretsAllLabel')} onClick={onSecrets}>
        <span className="text-[20px] leading-none">{t('ui.home.secretsAll')}</span>
      </Widget>
    )
  const cond = f.area.unlockConditions?.[0]
  if (f.fresh)
    return (
      <Widget
        title={t('ui.home.secretArea')}
        tag={<NewTag />}
        label={t('ui.home.secretNewLabel', { area: f.area.name })}
        onClick={() => travelTo(f.area)}
      >
        <span className="block w-full leading-[0] shadow-halo">
          <AreaStrip area={f.area} className="h-auto w-full" />
        </span>
        <span className="truncate text-[20px] leading-none">{f.area.name}</span>
        {cond && (
          <span className="truncate font-pixel-sm text-[15px] leading-none text-muted">
            {conditionLabel(cond, data)}
          </span>
        )}
      </Widget>
    )
  const label = cond ? conditionLabel(cond, data) : ''
  return (
    <Widget
      title={t('ui.home.nextSecret')}
      label={t('ui.home.secretNextLabel', {
        area: f.area.name,
        what: label,
        current: f.current,
        target: f.target,
      })}
      onClick={onSecrets}
    >
      <span className="relative block w-full leading-[0] shadow-halo">
        <AreaStrip area={f.area} className="h-auto w-full grayscale-[0.7]" />
        <PixelIcon
          name="lock"
          size={16}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      </span>
      <span className="truncate text-[20px] leading-none">{f.area.name}</span>
      <Meter value={f.current} max={f.target} />
      <span className="truncate font-pixel-sm text-[15px] leading-none text-muted">
        {Math.min(f.current, f.target)}/{f.target}
      </span>
    </Widget>
  )
}

const short = (ms: number) => {
  const m = Math.ceil(ms / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`
}

/** The Day Care: residents with their XP toward the cap and the time to full, READY when full; a free slot. */
function DayCareWidget() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const now = useNow(30_000)
  const cfg = data.config.dayCare
  if (!isDayCareOpen(save, data)) {
    const have = new Set(save.pokedex).size
    return (
      <div className="pixel-panel flex min-w-0 flex-col gap-[5px] px-2.5 pb-2.5 pt-2" role="note">
        <span className="font-pixel-sm text-[15px] leading-none text-muted">{t('ui.home.dayCare')}</span>
        <span className="flex items-center gap-1.5 text-[20px] leading-none">
          <PixelIcon name="lock" size={14} /> {t('ui.map.aSecretPlace')}
        </span>
        <Meter value={have} max={cfg.unlockPokedex} />
        <span className="font-pixel-sm text-[15px] leading-tight text-muted">
          {t('ui.unlock.pokedex', { count: cfg.unlockPokedex })} · {Math.min(have, cfg.unlockPokedex)}/
          {cfg.unlockPokedex}
        </span>
      </div>
    )
  }
  const dc = dayCareOf(save)
  const rows = dc.residents.map((r) => {
    const xp = dayCareXp(r, now, data)
    const full = xp >= cfg.maxXp
    const at = dayCareFullAt(r, data)
    return {
      r,
      xp,
      full,
      left: at != null ? Math.max(0, at - now) : 0,
      name: data.species[r.inst.dex]?.name ?? t('ui.common.pokemon'),
    }
  })
  const ready = rows.some((x) => x.full)
  const free = Math.max(0, cfg.slots - rows.length)
  const words = [
    ...rows.map((x) =>
      x.full
        ? t('ui.home.dcReady', { name: x.name })
        : t('ui.home.dcFullIn', { name: x.name, time: short(x.left) }),
    ),
    ...Array.from({ length: free }, () => t('ui.home.dcFree')),
    ...(!dc.eggClaimed ? [t('ui.home.dcEgg')] : []),
  ].join('. ')
  return (
    <Widget
      title={t('ui.home.dayCare')}
      tag={
        ready ? (
          <Chip tone="gold">{t('ui.home.ready')}</Chip>
        ) : !dc.eggClaimed ? (
          <Chip tone="gold">{t('ui.home.egg')}</Chip>
        ) : undefined
      }
      label={t('ui.home.dayCareLabel', { state: words })}
      onClick={() => navigate('/daycare')}
    >
      {rows.map((x) => (
        <span
          key={x.r.inst.id}
          className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-1.5"
        >
          <MiniSprite dex={x.r.inst.dex} size={32} />
          <span className="grid min-w-0 gap-[3px]">
            <span className="truncate text-[17px] leading-none">
              {x.name}
              {!x.full && (
                <span className="font-pixel-sm text-[14px] text-muted">
                  {' '}
                  {t('ui.common.level.short', { n: x.r.inst.level })}
                </span>
              )}
            </span>
            <Meter value={x.xp} max={cfg.maxXp} />
          </span>
          {x.full ? (
            <Chip tone="green">{t('ui.home.ready')}</Chip>
          ) : (
            <span className="font-pixel-sm text-[15px] text-muted">{short(x.left)}</span>
          )}
        </span>
      ))}
      {Array.from({ length: free }, (_, i) => (
        <span key={`free-${i}`} className="grid w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-1.5">
          <span className="ml-0.5 h-[22px] w-7 shadow-ring-line" aria-hidden />
          <span className="grid min-w-0 gap-[3px]">
            <span className="truncate text-[17px] leading-none">{t('ui.home.freeSlot')}</span>
            <span className="truncate font-pixel-sm text-[15px] leading-none text-muted">
              {t('ui.dayCare.leaveOne')}
            </span>
          </span>
        </span>
      ))}
    </Widget>
  )
}

/** Versus: locked (how close the team is), open (set a team), then teams to beat and defense wins. */
function VersusWidget() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const open = versusUnlocked(save, data)
  const [board, setBoard] = useState<VersusEntry[] | null>(null)
  useEffect(() => {
    if (!open || !signedIn || !isSupabaseConfigured) return
    let live = true
    versusBoardCached()
      .then((rows) => live && setBoard(rows))
      .catch(() => live && setBoard(null))
    return () => {
      live = false
    }
  }, [open, signedIn])

  const team = (
    <span className="flex pl-1" aria-hidden>
      {teamOf(save).map((p) => (
        <MiniSprite
          key={p.id}
          dex={p.dex}
          size={34}
          className={cx('-mx-1.5', !open && 'opacity-50 grayscale')}
        />
      ))}
    </span>
  )
  if (!open) {
    const n = Math.min(versusReadyCount(save, data), VERSUS_TEAM_SIZE)
    const best = Math.max(...save.box.map((p) => p.level))
    return (
      <Widget
        title={t('ui.versus.title')}
        tag={<PixelIcon name="lock" size={16} />}
        label={`${t('ui.versus.locked')} ${t('ui.versus.lockedCount', { n })}`}
        onClick={() => navigate('/versus')}
      >
        <span className="flex min-h-[30px] items-center">{team}</span>
        <span className="text-[20px] leading-none">{t('ui.versus.lockedCount', { n })}</span>
        <Meter value={n} max={VERSUS_TEAM_SIZE} />
        <span className="font-pixel-sm text-[15px] leading-none text-muted">
          {t('ui.home.bestLevel', { n: best })}
        </span>
      </Widget>
    )
  }
  const me = board?.find((r) => r.isMe)
  const set = !!me?.team.length
  const toBeat = board ? opponentsOf(board).filter((r) => !r.beaten).length : null
  const vs = (
    <span
      className="ml-auto text-[22px] leading-none text-gold [text-shadow:0_2px_0_#c4382a,2px_0_0_#c4382a]"
      aria-hidden
    >
      VS
    </span>
  )
  return (
    <Widget
      title={t('ui.versus.title')}
      tag={
        set ? (
          <span className="text-[14px]">
            {t(`ui.versus.defenseWins.${me!.defenseWins === 1 ? 'one' : 'other'}`, {
              count: me!.defenseWins,
            })}
          </span>
        ) : (
          <NewTag />
        )
      }
      label={
        set && toBeat != null
          ? t('ui.home.vsSetLabel', { n: toBeat, wins: me!.defenseWins })
          : t('ui.home.vsOpenLabel')
      }
      onClick={() => navigate('/versus')}
    >
      <span className="flex min-h-[30px] w-full items-center">
        {team}
        {vs}
      </span>
      <span className="text-[20px] leading-none">
        {set && toBeat != null
          ? t(`ui.home.vsToBeat.${toBeat === 1 ? 'one' : 'other'}`, { n: toBeat })
          : t('ui.home.vsOpen')}
      </span>
      <span className="flex w-full items-center justify-between gap-1.5">
        <span className="font-pixel-sm text-[15px] leading-none text-muted">{t('ui.home.vsAuto')}</span>
        <span className="bg-crimson px-2 pb-1.5 pt-1 text-[17px] leading-none text-white shadow-ring">
          {set ? t('ui.home.vsFight') : t('ui.home.vsSetTeam')}
        </span>
      </span>
    </Widget>
  )
}

/** A slot kept for what comes later. */
function EventsWidget() {
  const { t } = useT()
  return (
    <div
      role="note"
      aria-label={t('ui.home.eventsLabel')}
      className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 bg-panel/50 p-2.5 text-center text-faint outline-dashed outline-2 -outline-offset-2 outline-shadow"
    >
      <span className="font-pixel-sm text-[15px] leading-none text-muted">{t('ui.home.events')}</span>
      <PixelIcon name="star" size={24} style={{ filter: 'grayscale(1) opacity(0.4)' }} />
      <span className="font-pixel-sm text-[15px] leading-none text-muted">{t('ui.shop.comingLater')}</span>
    </div>
  )
}

/** Home's widgets, two by two: the secret area and the Day Care, then Versus and special events. */
export function Widgets({ onSecrets }: { onSecrets: () => void }) {
  return (
    <div className="grid grid-cols-2 content-start gap-2.5">
      <SecretWidget onSecrets={onSecrets} />
      <DayCareWidget />
      <VersusWidget />
      <EventsWidget />
    </div>
  )
}
