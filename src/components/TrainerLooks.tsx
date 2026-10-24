// Trainer looks (docs/31, docs/15 §17): the row under the trainer card, the menu it opens (the unlocked looks as a
// grid to pick from, then the locked ones with what each takes) and its rules pop-up. What is unlocked, and how far
// each goal stands, is the engine's (engine/looks); this only shows it.
import { useState } from 'react'
import { lookStates, newLooks, regionOf, type GameData, type LookState } from '@/engine'
import { useT } from '@/i18n/react'
import { avatarName, avatarOf, playerAvatarId } from '@/lib/avatars'
import { looksProgress, markRulesSeen, markSeen, useNewLooks, wear } from '@/store/looks'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { NewTag } from './Chip'
import { PixelIcon } from './icons'
import { InfoButton, RulesModal, type RuleRow } from './RulesModal'
import { Seg } from './Segmented'
import { Sheet } from './Sheet'
import { TrainerLook } from './TrainerLook'
import { SortSelect } from './TypeSelect'

type T = ReturnType<typeof useT>['t']

/** A red dot with a number: looks unlocked since the menu was last opened (also in the button's name). */
export function LooksDot({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid h-[18px] min-w-[18px] place-items-center bg-crimson px-0.5 font-pixel-sm text-[13px] leading-none text-white shadow-ring',
        className,
      )}
    >
      {n > 9 ? '9+' : n}
    </span>
  )
}

/** What a locked look takes, in words: "Catch 45 Johto Pokémon", "Reach Silph Co.". */
export function lookGoal(t: T, s: LookState, data: GameData): string {
  const u = s.def.unlock
  const region = data.regions.find((r) => r.id === s.def.region)?.name ?? ''
  switch (u.kind) {
    case 'start':
      return t('ui.looks.goal.start')
    case 'catch':
      return t('ui.looks.goal.catch', { n: u.count, region })
    case 'reach':
      return t('ui.looks.goal.reach', { area: data.areas.find((a) => a.id === u.areaId)?.name ?? '' })
    case 'champion':
      return t('ui.looks.goal.champion', { region })
    case 'complete':
      return t('ui.looks.goal.complete', { region })
    case 'event':
      return t(`ui.looks.goal.event.${u.event}`)
  }
}

/** The row under the trainer card: the look you wear, how many are unlocked, and the red dot. */
export function LooksRow({ onOpen }: { onOpen: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const fresh = useNewLooks()
  if (!save) return null
  // The list's own length: an event's look counts once won (engine/looks).
  const states = lookStates(looksProgress(save), data)
  const unlocked = states.filter((s) => s.open).length
  const label = t('ui.looks.title')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={fresh ? t('ui.looks.rowNew', { name: label, n: fresh }) : label}
      className="flex min-h-[56px] w-full items-center gap-2.5 bg-paper pb-2 pl-2 pr-3 pt-1.5 text-left text-ink shadow-card"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden bg-sky shadow-ring">
        <TrainerLook src={avatarOf(playerAvatarId(save.player)).src} w={36} h={38} above={2} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate text-[20px] font-normal leading-none">{label}</b>
        <small className="font-pixel-sm text-[14px] leading-[1.1] text-muted">
          {t('ui.looks.count', { n: unlocked, total: states.length })}
        </small>
      </span>
      {fresh > 0 && <LooksDot n={fresh} className="h-6 min-w-6 text-[15px]" />}
    </button>
  )
}

export function useLooksRules(): RuleRow[] {
  const { t } = useT()
  return [
    {
      icon: 'user',
      title: t('ui.looks.rules.start.title', { red: t('trainerName.red'), leaf: t('trainerName.leaf') }),
      text: t('ui.looks.rules.start.text'),
    },
    { icon: 'ball', title: t('ui.looks.rules.play.title'), text: t('ui.looks.rules.play.text') },
    { icon: 'crown', title: t('ui.looks.rules.top.title'), text: t('ui.looks.rules.top.text') },
    { icon: 'trophy', title: t('ui.looks.rules.seen.title'), text: t('ui.looks.rules.seen.text') },
  ]
}

/** The rules pop-up's banner: a line-up of heroes from every generation on the night sky. */
export function LooksBanner() {
  const cast = [
    'red',
    'johto/lyra',
    'hoenn/brendan',
    'sinnoh/dawn',
    'unova/hilbert',
    'kalos/serena',
    'galar/victor',
  ]
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-0 bg-[linear-gradient(#24304f,#3a5a9a)]">
      {cast.map((id) => (
        <TrainerLook key={id} src={avatarOf(id).src} w={52} h={104} zoom={1.3} above={4} className="-mx-1" />
      ))}
    </div>
  )
}

export function LooksRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.looks.title')}
      picture={<LooksBanner />}
      icon="user"
      rules={useLooksRules()}
      onGo={onGo}
    />
  )
}

/** One locked look: its silhouette, its name, and what it takes with how far along it is. */
export function LockedLook({ s }: { s: LookState }) {
  const { t } = useT()
  const data = useGame((st) => st.data)
  const a = avatarOf(s.def.id)
  const goal = lookGoal(t, s, data)
  return (
    <li className="grid grid-cols-[46px_minmax(0,1fr)] items-center gap-2 bg-well py-1 pl-1 pr-2 shadow-ring-line">
      <span className="grid h-12 w-[46px] place-items-center overflow-hidden bg-well-deep">
        <TrainerLook src={a.src} w={44} h={48} style={{ filter: 'var(--silhouette)' }} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <b className="truncate text-[19px] font-normal leading-none">{avatarName(a, t)}</b>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-pixel-sm text-[15px] leading-tight text-muted">
          <span>{goal}</span>
          {s.need != null && s.have != null && (
            <span className="flex min-w-[96px] flex-1 items-center gap-1.5">
              <span
                aria-hidden
                className="relative h-2 flex-1 bg-night shadow-[0_0_0_1px_rgb(var(--c-edge))]"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-gold"
                  style={{ width: `${Math.min(100, (100 * s.have) / Math.max(1, s.need))}%` }}
                />
              </span>
              <span className="tabular-nums text-ink">
                {t('ui.looks.progress', { have: s.have, need: s.need })}
              </span>
            </span>
          )}
          {s.areasAway != null && (
            <span className="bg-sky px-1.5 text-[13px] text-ink shadow-ring-line-thin">
              {t(s.areasAway === 1 ? 'ui.looks.away.one' : 'ui.looks.away.other', { n: s.areasAway })}
            </span>
          )}
        </span>
      </span>
    </li>
  )
}

/** One unlocked look in the list: its sprite, its name, and how it was won ("Catch 45 Johto Pokémon"). */
export function OwnedLook({ s }: { s: LookState }) {
  const { t } = useT()
  const data = useGame((st) => st.data)
  const a = avatarOf(s.def.id)
  return (
    <li className="grid grid-cols-[46px_minmax(0,1fr)] items-center gap-2 bg-well py-1 pl-1 pr-2 shadow-ring-line">
      <span className="grid h-12 w-[46px] place-items-center overflow-hidden bg-sky">
        <TrainerLook src={a.src} w={44} h={48} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <b className="truncate text-[19px] font-normal leading-none">{avatarName(a, t)}</b>
        <span className="flex min-w-0 items-center gap-1.5 font-pixel-sm text-[15px] leading-tight text-muted">
          <PixelIcon name="check" size={14} className="shrink-0" />
          <span>{lookGoal(t, s, data)}</span>
        </span>
      </span>
    </li>
  )
}

/** How close a locked look is, 0–1, for the order of the list: the nearest goals first. */
function closeness(s: LookState): number {
  if (s.need) return (s.have ?? 0) / s.need
  if (s.areasAway != null) return 1 / (1 + s.areasAway)
  return 0
}

/**
 * The looks by region: the one being played first, then the others in order. Locked ones nearest goal first;
 * unlocked ones in the ladder's order, so they read as the way they were won.
 */
function regionGroups(states: LookState[], live: string, data: GameData) {
  const regions = [...data.regions]
    .filter((r) => states.some((s) => s.def.region === r.id))
    .sort((a, b) => (a.id === live ? -1 : b.id === live ? 1 : a.orderIndex - b.orderIndex))
  return regions.map((r) => {
    const own = states.filter((s) => s.def.region === r.id)
    const locked = own.filter((s) => !s.open).sort((a, b) => closeness(b) - closeness(a))
    const unlocked = own.filter((s) => s.open)
    return { region: r, started: own.some((s) => s.started), locked, unlocked, total: own.length }
  })
}

export type LooksListView = 'locked' | 'unlocked'

/**
 * The menu's body: the look you wear, every unlocked look as a grid (tap to wear it; NEW on the ones not seen yet),
 * then a list by region: the locked looks with their goals, or the unlocked ones with how each was won, narrowed to
 * one region from a dropdown. `fresh`: the looks to tag NEW.
 */
export function LooksMenu({
  states,
  liveRegion,
  wearing,
  fresh,
  onWear,
  onInfo,
  initialView = 'locked',
}: {
  states: LookState[]
  /** The region being played: its locked looks come first. */
  liveRegion: string
  wearing: string
  fresh: ReadonlySet<string>
  onWear: (id: string) => void
  onInfo: () => void
  /** The list's view on opening (the kitchen sink shows both). */
  initialView?: LooksListView
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const [view, setView] = useState(initialView)
  const [region, setRegion] = useState('all')
  const look = avatarOf(wearing)
  const unlocked = states.filter((s) => s.open)
  const groups = regionGroups(states, liveRegion, data)
  const lockedCount = groups.reduce((n, g) => n + g.locked.length, 0)
  const listOf = (g: (typeof groups)[number]) => (view === 'locked' ? g.locked : g.unlocked)
  const listed = groups.filter((g) => listOf(g).length)
  // The dropdown holds the started regions with something to list; a region it no longer holds (after switching
  // views) falls back to all of them.
  const picks = listed.filter((g) => g.started)
  const pick = picks.some((g) => g.region.id === region) ? region : 'all'
  const shown = listed.filter((g) => pick === 'all' || g.region.id === pick)
  // Red and Leaf belong to no region: first in the unlocked list, with every region only. So do the event looks won,
  // under their own heading after them (an event's look is never listed locked).
  const loose = view === 'unlocked' && pick === 'all' ? unlocked.filter((s) => !s.def.region) : []
  const starters = loose.filter((s) => s.def.unlock.kind !== 'event')
  const events = loose.filter((s) => s.def.unlock.kind === 'event')
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 bg-sky p-2 shadow-ring-line">
        <TrainerLook src={look.src} w={64} h={72} zoom={1.25} className="bg-paper shadow-ring" />
        <span className="grid min-w-0 gap-1">
          <b className="truncate text-[24px] font-normal leading-none">{avatarName(look, t)}</b>
          <small className="font-pixel-sm text-[15px] leading-tight text-muted">
            {t('ui.looks.wearing')}
          </small>
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-[22px] font-normal leading-none">{t('ui.looks.unlocked')}</h3>
        <span className="font-pixel-sm text-[15px] tabular-nums text-muted">
          {t('ui.looks.progress', { have: unlocked.length, need: states.length })}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t('ui.looks.unlocked')}
        className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5"
      >
        {unlocked.map((s) => {
          const a = avatarOf(s.def.id)
          const name = avatarName(a, t)
          const on = a.id === look.id
          const isNew = fresh.has(a.id)
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={isNew ? `${name} · ${t('ui.common.new')}` : name}
              title={name}
              onClick={() => onWear(a.id)}
              className={cx(
                'relative grid min-h-[60px] place-items-center pt-1',
                on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-ring-line',
              )}
            >
              <TrainerLook src={a.src} w={44} h={52} />
              {isNew && <NewTag className="absolute -right-1 -top-1.5 px-1 text-[11px]" />}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Seg
          label={t('ui.looks.show')}
          value={view}
          onChange={setView}
          className="flex-[1_0_auto]"
          options={[
            { id: 'locked', label: t('ui.looks.locked'), count: lockedCount },
            { id: 'unlocked', label: t('ui.looks.unlocked'), count: unlocked.length },
          ]}
        />
        {picks.length > 0 && (
          <SortSelect
            label={t('ui.looks.region')}
            value={pick}
            onChange={setRegion}
            className="min-w-[160px] flex-1"
            options={[
              {
                id: 'all',
                label: t('ui.looks.regionCount', {
                  region: t('ui.looks.all'),
                  n: view === 'locked' ? lockedCount : unlocked.length,
                }),
              },
              ...picks.map((g) => ({
                id: g.region.id,
                label: t('ui.looks.regionCount', { region: g.region.name, n: listOf(g).length }),
              })),
            ]}
          />
        )}
      </div>
      {view === 'locked' && lockedCount === 0 ? (
        <p className="m-0 flex items-center gap-2 bg-gold-pale px-3 py-2 shadow-card-gold">
          <PixelIcon name="crown" size={20} />
          {t('ui.looks.allDone')}
        </p>
      ) : (
        <>
          {starters.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {starters.map((s) => (
                <OwnedLook key={s.def.id} s={s} />
              ))}
            </ul>
          )}
          {events.length > 0 && (
            <section className="flex flex-col gap-1.5" aria-label={t('ui.looks.events')}>
              <h4 className="m-0 font-pixel-sm text-[14px] uppercase tracking-[0.07em] text-muted">
                {t('ui.looks.events')}
              </h4>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {events.map((s) => (
                  <OwnedLook key={s.def.id} s={s} />
                ))}
              </ul>
            </section>
          )}
          {shown.map((g) =>
            g.started ? (
              <section key={g.region.id} className="flex flex-col gap-1.5" aria-label={g.region.name}>
                <h4 className="m-0 font-pixel-sm text-[14px] uppercase tracking-[0.07em] text-muted">
                  {g.region.id === liveRegion
                    ? t('ui.looks.playing', { region: g.region.name })
                    : g.region.name}
                </h4>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {listOf(g).map((s) =>
                    s.open ? <OwnedLook key={s.def.id} s={s} /> : <LockedLook key={s.def.id} s={s} />,
                  )}
                </ul>
              </section>
            ) : (
              // A region not started yet keeps its looks a surprise: one line, no list.
              <p
                key={g.region.id}
                className="m-0 flex flex-wrap items-baseline gap-x-2 bg-well px-2.5 py-2 shadow-ring-line"
              >
                <b className="text-[19px] font-normal leading-none">{g.region.name}</b>
                <small className="font-pixel-sm text-[15px] text-muted">
                  {t('ui.looks.notStarted', { n: g.total, region: g.region.name })}
                </small>
              </p>
            ),
          )}
        </>
      )}
      <InfoButton name={t('ui.looks.title')} onClick={onInfo} className="mt-1" />
    </div>
  )
}

/** The menu as a sheet over the trainer card. Closing it marks the new looks seen, and the red dot goes. */
export function LooksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState(false)
  if (!save) return null
  const progress = looksProgress(save)
  // Nothing unlocks in the Extreme save, so nothing there is new either.
  const fresh = new Set(progress === save ? newLooks(save, progress, data) : [])
  const close = () => {
    markSeen()
    onClose()
  }
  return (
    <>
      <Sheet open={open} onClose={close} title={t('ui.looks.title')}>
        <LooksMenu
          states={lookStates(progress, data)}
          liveRegion={regionOf(save)}
          wearing={playerAvatarId(save.player)}
          fresh={fresh}
          onWear={wear}
          onInfo={() => setRules(true)}
        />
      </Sheet>
      <LooksRulesModal open={rules} onClose={() => setRules(false)} />
    </>
  )
}

/**
 * The row and what it opens: the rules the first time (Later / Let's go!, which goes on to the menu), the menu every
 * time after.
 */
export function TrainerLooks() {
  const save = useGame((s) => s.save)
  const [sheet, setSheet] = useState(false)
  const [rules, setRules] = useState(false)
  const seenRules = !!save?.looks?.rulesSeen
  return (
    <>
      <LooksRow onOpen={() => (seenRules ? setSheet(true) : setRules(true))} />
      <LooksRulesModal
        open={rules}
        onClose={() => {
          markRulesSeen()
          setRules(false)
        }}
        onGo={() => {
          markRulesSeen()
          setRules(false)
          setSheet(true)
        }}
      />
      <LooksSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  )
}
