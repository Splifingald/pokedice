// Extreme mode's pieces (docs/22): its rules pop-up, the band that says which world is in play, a resting Pokémon's
// countdown, the resting team's panel, the welcome-back card and the switch between the two saves. Every number comes
// from the engine (engine/extreme); these only show them.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  badgeCase,
  boonCenters,
  buffLeft,
  extremeRules,
  firstComeback,
  getRegion,
  instanceMaxHp,
  koLeft,
  regionOf,
  teamOf,
  type PokemonInstance,
  type SaveData,
  type SaveMode,
} from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { countdown } from '@/lib/format'
import { closeAwayReport, markExtremeRulesSeen, useAwayReport } from '@/store/extreme'
import { useGame } from '@/store/game'
import { useServerNow } from '@/store/serverTime'
import { switchSave } from '@/store/sync'
import { typeName } from '@/lib/format'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { useMyTurn, useOnScreen } from './popupTurn'
import { PixelButton } from './PixelButton'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'
import { MiniSprite } from './SpriteImg'

/** The Indigo Plateau's champion hall at night: the last room of the main game, the first of this one. */
export const EXTREME_PICTURE: RulesPicture = { src: artUrl('champion'), focus: '50% 38%' }

export function useExtremeRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const r = extremeRules(data)
  // Its boon Centers (docs/47) say so: Centers there are, only they don't heal.
  const boons = boonCenters({ mode: 'extreme' }, data)
  return [
    // A race per region (docs/48): what Extreme mode is now, first.
    { icon: 'trophy', title: t('ui.xrun.rules.race.title'), text: t('ui.xrun.rules.race.text') },
    boons
      ? { icon: 'warning', title: t('ui.extreme.rules.centers.boonTitle'), text: t('ui.extreme.rules.centers.boonText') }
      : { icon: 'warning', title: t('ui.extreme.rules.centers.title'), text: t('ui.extreme.rules.centers.text') },
    {
      icon: 'moon',
      title: t('ui.extreme.rules.ko.title', { h: r.koHours }),
      text: t(r.items ? 'ui.extreme.rules.ko.text' : 'ui.extreme.rules.ko.textNoItems', { h: r.koHours, hp: r.koHp }),
    },
    {
      icon: 'heart',
      title: t('ui.extreme.rules.away.title'),
      text: r.awayPct > 0 ? t('ui.extreme.rules.away.text', { pct: r.awayPct }) : t('ui.extreme.rules.away.off'),
    },
  ]
}

/** The rules: once when Extreme mode opens (Later / Let's go!), and from INFO (OK). */
export function ExtremeRulesModal({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo?: () => void }) {
  const { t } = useT()
  const rules = useExtremeRules()
  return (
    <RulesModal open={open} onClose={onClose} title={t('ui.extreme.name')} picture={EXTREME_PICTURE} icon="skull" rules={rules} onGo={onGo} />
  )
}

/**
 * The main save beat the league that opens Extreme mode: once, between fights, its rules and a way straight in. It
 * takes its turn in the one-time pop-ups' queue (engine/popups.ts), never on Settings, where Extreme mode is.
 */
export function ExtremeUnlockPopup() {
  const open = useMyTurn('extreme')
  const navigate = useNavigate()
  useOnScreen('extreme', open)
  return (
    <ExtremeRulesModal
      open={open}
      onClose={markExtremeRulesSeen}
      onGo={() => {
        markExtremeRulesSeen()
        // Its page (docs/48): the regions open, their runs, the board; a run starts from there.
        navigate('/extreme')
      }}
    />
  )
}

/** Under the top bar while the Extreme save is played: the world in play is never in doubt. `show`: the kitchen sink's. */
export function ExtremeBand({ show }: { show?: boolean }) {
  const { t } = useT()
  const extreme = useGame((s) => s.save?.mode === 'extreme')
  if (!extreme && !show) return null
  return (
    <div className="light-scope flex h-[22px] items-center justify-center gap-1.5 bg-crimson px-2 text-[16px] uppercase leading-none tracking-[0.06em] text-panel">
      <PixelIcon name="skull" size={12} color="#ffffff" />
      {/* The mode's name alone (the user's call, 2026-10-29): its rules say what it changes. */}
      <span className="truncate">{t('ui.extreme.name')}</span>
    </div>
  )
}

/** The skull on the trainer's avatar in the top bar (the band says it in words). */
export function ExtremeMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx('light-scope grid h-[18px] w-[18px] place-items-center bg-crimson shadow-ring', className)}>
      <PixelIcon name="skull" size={12} color="#ffffff" />
    </span>
  )
}

/** The real time for a countdown (the device's while it's unknown: only for showing). */
function useClock(): number {
  return useServerNow(1000) ?? Date.now()
}

/** "K.O. · 11h 42m": a resting Pokémon's line, for pips, cards and lists. Nothing when it isn't resting. */
export function KoTag({ inst, className }: { inst: Pick<PokemonInstance, 'koAt'>; className?: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const now = useClock()
  const left = koLeft(inst, now, data)
  if (left == null) return null
  return (
    <span className={cx('inline-flex items-center gap-1 font-pixel-sm text-[16px] leading-none text-danger', className)}>
      <PixelIcon name="moon" size={10} />
      {t('ui.extreme.koShort', { time: countdown(left) })}
    </span>
  )
}

/** "+1 die · 23h 10m": a Pokébuff running (docs/47), for cards and sheets. Nothing when it has none. */
export function BuffTag({ inst, className }: { inst: Pick<PokemonInstance, 'buff'>; className?: string }) {
  const { t } = useT()
  const now = useClock()
  const left = buffLeft(inst, now)
  if (left == null || !inst.buff) return null
  const time = countdown(left)
  return (
    <span
      className={cx('inline-flex items-center gap-1 font-pixel-sm text-[16px] leading-none text-good', className)}
      title={t('ui.xcenter.buffLabel', { type: typeName(inst.buff.type), time })}
    >
      <PixelIcon name="dice" size={10} />
      {t('ui.xcenter.buffShort', { time })}
    </span>
  )
}

/** A resting Pokémon's sheet: how long until it comes back, on a 12-hour track, and what a Revive would do. */
export function KoPanel({ inst }: { inst: PokemonInstance }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const now = useClock()
  const left = koLeft(inst, now, data)
  if (left == null) return null
  const total = Math.max(1, data.config.extreme.koHours * 3_600_000)
  const done = Math.min(1, Math.max(0, 1 - left / total))
  const hp = Math.min(instanceMaxHp(inst, data), data.config.extreme.koReviveHp)
  return (
    <section className="light-scope flex flex-col gap-2 bg-night p-3 text-panel shadow-ring" aria-label={t('ui.extreme.koTitle')}>
      <div className="flex items-center gap-2.5">
        <PixelIcon name="moon" size={24} />
        <span className="grid gap-0.5">
          <b className="text-[22px] font-normal leading-none">{t('ui.extreme.koTitle')}</b>
          <span className="font-pixel-sm text-[17px] leading-none text-gold-light">
            {t('ui.extreme.koBack', { hp, time: countdown(left) })}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done * 100)}
        aria-label={t('ui.extreme.koTitle')}
        className="h-2.5 bg-[#141b30] shadow-[inset_0_0_0_2px_#7d8bb2]"
      >
        <div className="h-full bg-gold" style={{ width: `${done * 100}%` }} />
      </div>
      <p className="copy m-0 text-[17px] text-panel">{t('ui.extreme.koHint')}</p>
    </section>
  )
}

/**
 * Nobody can fight and no Center will come: when the first one is back, and the two ways out (Team, Poké Mart).
 * `demo`: a save of its own, for the kitchen sink.
 */
export function RestingPanel({ className, demo }: { className?: string; demo?: SaveData }) {
  const { t } = useT()
  const navigate = useNavigate()
  const stored = useGame((s) => s.save)
  const save = demo ?? stored
  const data = useGame((s) => s.data)
  const now = useClock()
  if (!save) return null
  const first = firstComeback(save, data)
  const able = save.box.filter((p) => p.currentHp > 0 && !save.team.includes(p.id)).length
  const pct = data.config.extreme.awayHealPctPerHour
  return (
    <section className={cx('light-scope flex flex-col gap-2 bg-night p-3 text-panel shadow-card', className)} aria-labelledby="resting-title">
      <div className="flex items-center gap-2.5">
        <PixelIcon name="moon" size={28} />
        <span className="grid gap-0.5">
          <b id="resting-title" className="text-[26px] font-normal uppercase leading-none tracking-[0.04em]">
            {t('ui.extreme.resting.title')}
          </b>
          {first && (
            <span className="font-pixel-sm text-[17px] leading-none text-gold-light">
              {t('ui.extreme.resting.first', {
                name: data.species[first.inst.dex]?.name ?? '',
                time: countdown(first.at - now),
                hp: data.config.extreme.koReviveHp,
              })}
            </span>
          )}
        </span>
      </div>
      {pct > 0 && <p className="copy m-0 text-[17px] text-panel">{t('ui.extreme.resting.hint', { pct })}</p>}
      <div className="grid grid-cols-2 gap-2">
        <PixelButton onClick={() => navigate('/team')}>
          {t('ui.nav.team')}
          {able > 0 && <span className="font-pixel-sm text-[16px] normal-case">({able})</span>}
        </PixelButton>
        <PixelButton onClick={() => navigate('/shop')}>{t('ui.nav.shop')}</PixelButton>
      </div>
    </section>
  )
}

/** Back in the game: what the absence healed, once. `show`: the kitchen sink's, which has no queue. */
export function AwayReportModal({ show }: { show?: boolean }) {
  const { t } = useT()
  const report = useAwayReport((s) => s.report)
  const data = useGame((s) => s.data)
  // Between fights, first in the one-time pop-ups' queue (engine/popups.ts): what you came back to.
  const open = (useMyTurn('away') || !!show) && !!report
  useOnScreen('away', open)
  const now = useClock()
  const pct = data.config.extreme.awayHealPctPerHour
  return (
    <Modal open={open} onClose={closeAwayReport} title={t('ui.extreme.away.title')} className="max-w-md">
      {report && (
        <div className="flex flex-col gap-3">
          <p className="copy m-0 text-muted">{t('ui.extreme.away.for', { time: countdown(report.minutes * 60_000) })}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {report.changes.map((c) => {
              const name = data.species[c.dex]?.name ?? ''
              const gained = Math.round(((c.to - Math.max(0, c.from)) / Math.max(1, c.max)) * 100)
              const before = Math.round((Math.max(0, c.from) / Math.max(1, c.max)) * 100)
              const after = Math.round((c.to / Math.max(1, c.max)) * 100)
              const resting = c.resting ? useGame.getState().save?.box.find((p) => p.id === c.id) : undefined
              return (
                <li key={c.id} className={cx('flex items-center gap-2.5 p-1.5 shadow-ring', c.resting ? 'bg-well-deep' : 'bg-paper')}>
                  <MiniSprite dex={c.dex} size={32} className={c.resting ? 'opacity-50 grayscale' : undefined} />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <b className="truncate text-[19px] font-normal leading-none">{name}</b>
                      <span className={cx('shrink-0 font-pixel-sm text-[16px] leading-none', c.resting ? 'text-danger' : 'text-good')}>
                        {c.resting
                          ? resting
                            ? t('ui.extreme.koShort', { time: countdown(koLeft(resting, now, data) ?? 0) })
                            : t('ui.extreme.koTitle')
                          : c.back
                            ? t('ui.extreme.away.back', { pct: gained })
                            : c.to >= c.max
                              ? t('ui.extreme.away.full', { pct: gained })
                              : t('ui.extreme.away.healed', { pct: gained, from: before, to: after })}
                      </span>
                    </div>
                    <div className="relative h-2.5 bg-night shadow-[inset_0_0_0_2px_rgb(var(--c-edge))]" aria-hidden>
                      <div className="absolute inset-y-0 left-0 bg-hp-green" style={{ width: `${before}%` }} />
                      <div className="absolute inset-y-0 bg-good-pale" style={{ left: `${before}%`, width: `${Math.max(0, after - before)}%` }} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {pct > 0 && <p className="copy m-0 text-[17px] text-muted">{t('ui.extreme.away.rule', { pct })}</p>}
          <PixelButton variant="primary" onClick={closeAwayReport}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}

/** "Play Extreme mode?" / "Back to the main game?": the save is kept, the page reloads on the other one. */
export function SwitchSaveModal({ to, open, onClose }: { to: SaveMode; open: boolean; onClose: () => void }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={t(to === 'extreme' ? 'ui.extreme.switch.toExtremeTitle' : 'ui.extreme.switch.toMainTitle')}
    >
      <p className="copy mb-4 text-lg">{t('ui.extreme.switch.body')}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <PixelButton onClick={onClose} disabled={busy}>
          {t('ui.common.cancel')}
        </PixelButton>
        <PixelButton
          variant={to === 'extreme' ? 'danger' : 'primary'}
          disabled={busy}
          onClick={() => {
            setBusy(true)
            // Already on that save (nothing to switch): the dialog closes rather than wait forever.
            void switchSave(to).then((switched) => {
              if (switched) return
              setBusy(false)
              onClose()
            })
          }}
        >
          {busy ? t('ui.common.loading') : t('ui.extreme.switch.go')}
        </PixelButton>
      </div>
    </Modal>
  )
}

/**
 * The title screen's Extreme card, under the main save's CONTINUE: the Extreme save (trainer, region, badges, its team
 * and who's resting) and PLAY EXTREME, or NEW EXTREME GAME after the rules. INFO shows the rules.
 */
export function ExtremeTitleCard({ save }: { save: SaveData | null }) {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const now = useClock()
  const [rules, setRules] = useState<'info' | 'start' | null>(null)
  const [switching, setSwitching] = useState(false)
  const team = save ? teamOf(save) : []
  const resting = save ? firstComeback(save, data) : null
  const facts = save
    ? t('ui.extreme.card.facts', {
        region: getRegion(data, regionOf(save))?.name ?? '',
        badges: badgeCase(save, data).filter((b) => b.earned).length,
        dex: save.pokedex.length,
      })
    : null
  return (
    <section className="light-scope w-full bg-night text-panel shadow-card" aria-labelledby="extreme-card-title">
      <div className="flex items-center gap-2 bg-crimson px-3 py-1.5">
        <PixelIcon name="skull" size={18} color="#ffffff" />
        <h2 id="extreme-card-title" className="m-0 text-[24px] font-normal uppercase leading-none tracking-[0.06em] text-panel">
          {t('ui.extreme.name')}
        </h2>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        {save ? (
          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 gap-1">
              <b className="truncate text-[22px] font-normal leading-none">{save.player?.name || t('ui.profile.title')}</b>
              <span className="font-pixel-sm text-[16px] leading-tight text-gold-light">{facts}</span>
            </div>
            {team.slice(0, 3).map((p) => (
              <MiniSprite key={p.id} dex={p.dex} size={32} className={p.currentHp <= 0 ? 'opacity-50 grayscale' : undefined} />
            ))}
          </div>
        ) : (
          <p className="copy m-0 text-[17px] text-panel">{t('ui.extreme.settings.hint')}</p>
        )}
        {resting && (
          <p className="m-0 flex items-center gap-1.5 font-pixel-sm text-[16px] leading-tight text-panel">
            <PixelIcon name="moon" size={12} />
            {t('ui.extreme.card.resting', { name: data.species[resting.inst.dex]?.name ?? '', time: countdown(resting.at - now) })}
          </p>
        )}
        <div className="flex gap-2">
          {/* `min-w-0`: a flex item is never narrower than its label, so "NOUVELLE PARTIE EXTRÊME" pushed INFO out of the
              card; allowed to shrink, the label fits itself to what INFO leaves (PixelButton's fit). */}
          <PixelButton className="min-w-0 flex-1" onClick={() => (save ? setSwitching(true) : setRules('start'))}>
            {t(save ? 'ui.extreme.card.play' : 'ui.extreme.card.new')}
          </PixelButton>
          <PixelButton className="shrink-0 bg-sky" onClick={() => setRules('info')} aria-label={t('ui.extreme.infoLabel')}>
            {t('ui.events.info')}
          </PixelButton>
        </div>
      </div>
      <ExtremeRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={
          rules === 'start'
            ? () => {
                markExtremeRulesSeen()
                // Its page (docs/48), where a region's run starts: the main save plays it, so the game's pages.
                navigate('/extreme')
              }
            : undefined
        }
      />
      <SwitchSaveModal to="extreme" open={switching} onClose={() => setSwitching(false)} />
    </section>
  )
}
