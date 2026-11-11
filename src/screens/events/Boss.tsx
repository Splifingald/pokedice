// The Community Boss's page (docs/71 §4.4; docs/15 §54), reached from Home's card: the boss's HP gauges stacked by
// colour with their rewards, the arena (the boss big at the centre, about 20 Pokémon around it taking turns to hit:
// the player's own in front, their friends' next, others filling the ring), the player's 3 slots, their damage, the
// community's, the top players, INFO. The numbers are the server's (boss_state, read every minute); in between the
// page plays the hits and moves the bar on at the last hour's pace. Every rule is the engine's or the server's.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BOSS_COLOR_HEX,
  BOSS_FIELD,
  BOSS_SLOTS,
  BOSS_TURN_MS,
  bossCandidates,
  bossPlacedOf,
  bossStanding,
  liveEvents,
  liveLeft,
  livePopupDue,
  liveState,
  type LiveEvent,
} from '@/engine'
import { CalendarRewardIcon, useRewardText } from '@/components/Calendar'
import { Chip } from '@/components/Chip'
import { Modal } from '@/components/Modal'
import { BackButton } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { InfoButton, RulesModal, type RuleRow } from '@/components/RulesModal'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { useSeenOnOpen } from '@/lib/useSeenOnOpen'
import { markLivePopupSeen } from '@/store/live'
import { useGame } from '@/store/game'
import {
  BOSS_REFRESH_MS,
  loadBoss,
  placeBoss,
  takeBackBoss,
  useBoss,
  type BossFieldMon,
} from '@/store/communityBoss'
import { useServerNow } from '@/store/serverTime'
import { cx } from '@/theme/util'
import { LivePicture, liveName, liveTime } from './live'
import { bannerUrl } from './shared'

const n = (v: number) => Math.round(v).toLocaleString('en')
const aff = (a: number) => `×${a === 0.25 ? '¼' : a === 0.5 ? '½' : Math.round(a * 10) / 10}`

/** The boss's name: the species'. */
const useBossName = (e: LiveEvent) => useGame((s) => s.data.species[e.boss.dex]?.name ?? '?')

/** The Community Boss the page is for: the one asked for, else the one running (or the last to have run). */
function useBossEvent(): LiveEvent | null {
  const [params] = useSearchParams()
  const data = useGame((s) => s.data)
  const id = params.get('id')
  return useMemo(() => {
    const list = liveEvents(data).filter((e) => e.type === 'boss')
    return (
      list.find((e) => e.id === id) ??
      list.sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0] ??
      null
    )
  }, [data, id])
}

/** Its rules (INFO at the page's foot), with its numbers. */
export function useBossRules(e: LiveEvent, name: string): RuleRow[] {
  const { t } = useT()
  return [
    {
      icon: 'user',
      title: t('ui.boss.rules.place.title'),
      text: t('ui.boss.rules.place.text', { n: BOSS_SLOTS }),
    },
    { icon: 'sword', title: t('ui.boss.rules.hit.title'), text: t('ui.boss.rules.hit.text', { name }) },
    {
      icon: 'gift',
      title: t('ui.boss.rules.gauges.title'),
      text: t('ui.boss.rules.gauges.text', { n: e.boss.gauges.length }),
    },
    { icon: 'clock', title: t('ui.boss.rules.away.title'), text: t('ui.boss.rules.away.text') },
  ]
}

/** The HP gauges stacked by colour: the current in front ("×3" left behind it), its HP, each gauge's reward. */
export function BossGauges({ e, total }: { e: LiveEvent; total: number }) {
  const { t } = useT()
  const text = useRewardText()
  const st = bossStanding(e, total)
  const cur = st.current != null ? e.boss.gauges[st.current] : null
  const next = st.current != null ? e.boss.gauges[st.current + 1] : null
  const share = cur ? st.left / st.of : 0
  const behind = st.current != null ? e.boss.gauges.length - st.current - 1 : 0
  return (
    <section
      aria-label={t('ui.boss.gaugesLabel', { broken: st.broken, total: e.boss.gauges.length })}
      className="grid gap-1.5"
      data-testid="boss-gauges"
    >
      <div className="flex items-center gap-2">
        <span
          className="boss-bar relative block h-5 flex-1"
          style={{ background: next ? BOSS_COLOR_HEX[next.color] : undefined }}
          aria-hidden
        >
          {cur && <i style={{ width: `${share * 100}%`, background: BOSS_COLOR_HEX[cur.color] }} />}
        </span>
        {behind > 0 && <span className="font-pixel-sm text-[18px] leading-none">×{behind + 1}</span>}
      </div>
      <div className="flex items-baseline justify-between gap-2 font-pixel-sm text-[16px] leading-none text-muted">
        <span>{cur ? t('ui.boss.hpLeft', { left: n(st.left), of: n(st.of) }) : t('ui.boss.allBroken')}</span>
        <span>{t('ui.boss.broken', { broken: st.broken, total: e.boss.gauges.length })}</span>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {e.boss.gauges.map((g, i) => (
          <li
            key={i}
            className={cx('boss-reward', i < st.broken && 'got')}
            style={{
              boxShadow: `inset 0 -4px 0 ${BOSS_COLOR_HEX[g.color]}, inset 0 0 0 2px rgb(var(--c-edge))`,
            }}
            title={text(g.reward)}
          >
            <span className="sr-only">
              {t(i < st.broken ? 'ui.boss.rewardGot' : 'ui.boss.rewardFor', {
                n: i + 1,
                reward: text(g.reward),
              })}
            </span>
            <CalendarRewardIcon reward={g.reward} size={22} />
            {i < st.broken && <PixelIcon name="check" size={12} className="boss-got" />}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Where each of the field's Pokémon stands around the boss: the first ones in front (bottom centre), then outwards. */
function ringSpot(i: number, count: number): { left: string; top: string } {
  // Alternating left and right of the bottom, going round the ellipse to the top.
  const step = Math.PI / Math.max(1, Math.ceil(count / 2))
  const k = Math.floor((i + 1) / 2)
  const side = i % 2 === 0 ? 1 : -1
  const a = Math.PI / 2 + side * k * step * 0.95
  return { left: `${50 + Math.cos(a) * 42}%`, top: `${54 + Math.sin(a) * 36}%` }
}

/**
 * The arena: the area's picture, the boss big at the centre (it never attacks), the field around it taking turns.
 * The player's own hit at their real rhythm (one every 3 s), gold; the others one every ~0.6 s, a show of their real
 * hits. A tap names one. Nothing moves without motion.
 */
export function BossArena({
  e,
  field,
  onHit,
}: {
  e: LiveEvent
  field: readonly BossFieldMon[]
  onHit?: (amount: number) => void
}) {
  const { t } = useT()
  const { level } = useMotion()
  const mons = field.slice(0, BOSS_FIELD)
  const own = mons.map((m, i) => (m.own ? i : -1)).filter((i) => i >= 0)
  const others = mons.map((m, i) => (m.own ? -1 : i)).filter((i) => i >= 0)
  const [striking, setStriking] = useState<number | null>(null)
  const [pops, setPops] = useState<{ id: number; amount: number; own: boolean }[]>([])
  const [named, setNamed] = useState<number | null>(null)
  useEffect(() => {
    if (level === 'off' || !mons.length) return
    let a = 0
    let b = 0
    let id = 0
    const strike = (i: number | undefined) => {
      if (i == null) return
      const m = mons[i]!
      setStriking(i)
      const pop = { id: ++id, amount: m.hit, own: !!m.own }
      setPops((p) => [...p.slice(-4), pop])
      if (m.own) onHit?.(m.hit)
    }
    const mine = own.length ? setInterval(() => strike(own[a++ % own.length]), BOSS_TURN_MS) : null
    const rest = others.length ? setInterval(() => strike(others[b++ % others.length]), 600) : null
    return () => {
      if (mine) clearInterval(mine)
      if (rest) clearInterval(rest)
    }
    // The field changes once a minute: the turns start again with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, level])
  const name = useBossName(e)
  const data = useGame((s) => s.data)
  return (
    <section
      aria-label={t('ui.boss.arenaLabel', { name, n: mons.length })}
      className="boss-arena relative -mx-3 overflow-hidden lg:mx-0"
      data-testid="boss-arena"
    >
      <LivePicture e={e} className="absolute inset-0" />
      <span className="boss-big absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <SpriteImg dex={e.boss.dex} shiny={e.boss.shiny} size={132} />
      </span>
      {pops.map((p) => (
        <span key={p.id} className={cx('boss-pop', p.own && 'own')} aria-hidden>
          −{n(p.amount)}
        </span>
      ))}
      <ul className="m-0 list-none p-0">
        {mons.map((m, i) => {
          const spot = ringSpot(i, mons.length)
          const mon = data.species[m.dex]?.name ?? '?'
          const label = t('ui.boss.tag', { level: m.level, mon, trainer: m.name })
          return (
            <li
              key={i}
              className={cx('boss-mon', m.own && 'own', m.friend && 'friend', striking === i && 'strike')}
              style={spot}
            >
              <button
                type="button"
                className="grid place-items-center"
                onClick={() => setNamed(named === i ? null : i)}
                aria-label={
                  m.own
                    ? `${label} · ${t('ui.boss.yours')}`
                    : m.friend
                      ? `${label} · ${t('ui.boss.friend')}`
                      : label
                }
                data-testid={m.own ? 'boss-own' : m.friend ? 'boss-friend' : 'boss-other'}
              >
                <MiniSprite dex={m.dex} size={m.own ? 30 : 24} />
                {m.friend && <PixelIcon name="heart" size={10} className="boss-friend-mark" />}
              </button>
              {named === i && (
                <span className="boss-tag" role="status">
                  {label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Picks the Pokémon for a slot: every region's Box, the best hit first, its affinity and hit on each. */
function BossPicker({ e, slot, onClose }: { e: LiveEvent; slot: number | null; onClose: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const busy = useBoss((s) => s.busy)
  const list = slot != null && save ? bossCandidates(save, data, e.boss.dex) : []
  return (
    <Modal
      open={slot != null}
      onClose={onClose}
      title={t('ui.boss.pickTitle', { n: (slot ?? 0) + 1 })}
      className="max-w-md"
    >
      <p className="m-0 mb-2 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.boss.pickLine')}</p>
      {list.length ? (
        <ul className="m-0 grid max-h-[60vh] list-none gap-1.5 overflow-y-auto p-0" data-testid="boss-picker">
          {list.map((m) => (
            <li key={m.inst.id}>
              <button
                type="button"
                disabled={busy}
                className="flex min-h-[48px] w-full items-center gap-2 bg-paper px-2 py-1 text-left shadow-ring-line"
                onClick={async () => {
                  if (slot != null && (await placeBoss(e, slot, m.inst.id))) onClose()
                }}
              >
                <MiniSprite dex={m.inst.dex} size={28} />
                <span className="grid min-w-0 flex-1 leading-none">
                  <b className="truncate text-[18px] font-normal">
                    {m.inst.nickname || data.species[m.inst.dex]?.name}
                  </b>
                  <small className="font-pixel-sm text-[15px] text-muted">
                    {t('ui.common.level.short', { n: m.inst.level })}
                  </small>
                </span>
                <Chip tone={m.affinity > 1 ? 'green' : m.affinity < 1 ? 'lock' : 'plain'}>
                  {aff(m.affinity)}
                </Chip>
                <span className="w-20 text-right font-pixel-sm text-[16px]">
                  {t('ui.boss.perHit', { n: n(m.hit) })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted">{t('ui.boss.noneToPlace')}</p>
      )}
    </Modal>
  )
}

export function BossScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const e = useBossEvent()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const now = useServerNow(1000)
  const { state, failed, at, busy } = useBoss()
  const [picking, setPicking] = useState<number | null>(null)
  const [info, setInfo] = useState(false)
  const [mine, setMine] = useState(0)
  const id = e?.id
  useEffect(() => {
    if (!id) return
    void loadBoss(id)
    setMine(0)
    const timer = setInterval(() => void loadBoss(id), BOSS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [id])
  // The hits played since the last read add to the player's damage on screen; the next read sets it right.
  useEffect(() => setMine(0), [state])
  // Its page open is its pop-up seen (docs/15 §20): the queue won't bring it over the page, nor later.
  useSeenOnOpen(!!e && !!save && livePopupDue(save, e), () => e && markLivePopupSeen(e))
  const name = e ? (data.species[e.boss.dex]?.name ?? '?') : ''
  const rules = useBossRules(e ?? ({ boss: { gauges: [] } } as unknown as LiveEvent), name)
  if (!e || now == null || !save) {
    return (
      <div className="flex flex-col gap-3 pb-4">
        <p className="copy m-0 text-muted">{now == null ? t('ui.common.loading') : t('ui.boss.none')}</p>
        <PixelButton variant="primary" onClick={() => navigate('/home')}>
          {t('ui.ug.home')}
        </PixelButton>
      </div>
    )
  }
  const st = liveState(e, now)
  const left = liveLeft(e, now)
  const ended = st === 'ended'
  // The community's damage moves on at the last hour's pace between reads, never past the next read's.
  const since = Math.max(0, Date.now() - at)
  const total = state
    ? state.total + (ended ? 0 : Math.min(since, BOSS_REFRESH_MS) * (state.lastHour / 3_600_000)) + mine
    : 0
  const myDamage = (state?.me?.damage ?? 0) + mine
  const placed = bossPlacedOf(save, e.id)
  const slots = Array.from({ length: BOSS_SLOTS }, (_, i) => ({
    i,
    placed: placed.find((p) => p.slot === i) ?? null,
    server: state?.me?.slots.find((s) => s.slot === i) ?? null,
  }))
  const share = state && total > 0 ? Math.round((myDamage / total) * 1000) / 10 : 0
  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="relative -mx-3 -mt-4 h-[96px] shadow-[0_2px_0_rgb(var(--c-edge))] lg:mx-0 lg:mt-0 lg:shadow-card">
        <LivePicture e={e} className="absolute inset-0" />
        <div className="pixel-plate absolute left-2 top-2 z-[1] flex max-w-[calc(100%-16px)] items-center gap-0.5 pb-1.5 pl-1 pr-2.5 pt-0.5">
          <BackButton onClick={() => navigate('/home')} />
          <span className="grid min-w-0 gap-0.5">
            <h1 className="m-0 truncate text-[24px] font-normal leading-none">{liveName(e)}</h1>
            <small className="truncate text-[16px] leading-none text-muted">
              {ended
                ? t('ui.boss.ended')
                : st === 'scheduled'
                  ? t('ui.boss.soon')
                  : t('ui.live.endsIn', { time: liveTime(left.ms) })}
            </small>
          </span>
        </div>
      </div>

      {failed && !state && (
        <p className="m-0 text-muted" role="status">
          {t('ui.boss.offline')}
        </p>
      )}

      <BossGauges e={e} total={total} />

      <BossArena e={e} field={state?.field ?? []} onHit={(h) => !ended && setMine((m) => m + h)} />

      {ended && (
        <p
          className="m-0 bg-cream p-3 text-[18px] leading-tight shadow-card-gold"
          role="status"
          data-testid="boss-ended"
        >
          {t('ui.boss.endedLine', { broken: state?.result?.broken ?? bossStanding(e, total).broken })}
        </p>
      )}

      <section aria-labelledby="boss-slots" className="grid gap-2">
        <h2 id="boss-slots" className="m-0 text-[22px] font-normal leading-none">
          {t('ui.boss.slots')}
        </h2>
        {!signedIn ? (
          <p className="m-0 text-muted">{t('ui.boss.signIn')}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-3" data-testid="boss-slots">
            {slots.map(({ i, placed: p, server }) => (
              <li key={i} className="flex min-h-[64px] items-center gap-2 bg-paper p-2 shadow-ring-line">
                {p ? (
                  <>
                    <MiniSprite dex={p.inst.dex} size={30} />
                    <span className="grid min-w-0 flex-1 gap-0.5 leading-none">
                      <b className="truncate text-[18px] font-normal">
                        {p.inst.nickname || data.species[p.inst.dex]?.name}
                      </b>
                      <small className="font-pixel-sm text-[15px] text-muted">
                        {server
                          ? t('ui.boss.slotHit', {
                              level: server.level,
                              aff: aff(server.affinity),
                              hit: n(server.hit),
                            })
                          : t('ui.common.level.short', { n: p.inst.level })}
                      </small>
                    </span>
                    {!ended && (
                      <span className="flex shrink-0 gap-1">
                        <PixelButton size="sm" disabled={busy} onClick={() => setPicking(i)}>
                          {t('ui.boss.swap')}
                        </PixelButton>
                        <PixelButton size="sm" disabled={busy} onClick={() => void takeBackBoss(e, i)}>
                          {t('ui.boss.takeBack')}
                        </PixelButton>
                      </span>
                    )}
                  </>
                ) : (
                  <PixelButton
                    variant="primary"
                    className="w-full"
                    disabled={busy || st !== 'live'}
                    onClick={() => setPicking(i)}
                  >
                    {t('ui.boss.place', { n: i + 1 })}
                  </PixelButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2">
        <section className="grid gap-1 bg-paper p-2.5 shadow-ring-line" aria-labelledby="boss-mine">
          <h2 id="boss-mine" className="m-0 font-pixel-sm text-[16px] font-normal leading-none text-muted">
            {t('ui.boss.yourDamage')}
          </h2>
          <b className="text-[24px] font-normal leading-none" data-testid="boss-my-damage">
            {n(myDamage)}
          </b>
          <small className="font-pixel-sm text-[15px] text-muted">{t('ui.boss.share', { pct: share })}</small>
        </section>
        <section className="grid gap-1 bg-paper p-2.5 shadow-ring-line" aria-labelledby="boss-all">
          <h2 id="boss-all" className="m-0 font-pixel-sm text-[16px] font-normal leading-none text-muted">
            {t('ui.boss.community')}
          </h2>
          <b className="text-[24px] font-normal leading-none" data-testid="boss-trainers">
            {t('ui.boss.trainers', { n: state?.participants ?? 0 })}
          </b>
          <small className="font-pixel-sm text-[15px] text-muted">
            {t('ui.boss.lastHour', { n: n(state?.lastHour ?? 0) })}
          </small>
        </section>
      </div>

      <section aria-labelledby="boss-top" className="grid gap-1.5">
        <h2 id="boss-top" className="m-0 text-[22px] font-normal leading-none">
          {t('ui.boss.top')}
        </h2>
        <ol className="m-0 grid list-none gap-1 p-0" data-testid="boss-top">
          {(state?.top ?? []).map((r, i) => (
            <li
              key={i}
              className={cx('flex items-center gap-2 px-2 py-1', r.me ? 'bg-gold-pale' : 'bg-paper')}
            >
              <span className="w-6 font-pixel-sm text-[16px] text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[18px]">{r.name}</span>
              <span className="font-pixel-sm text-[16px]">{n(r.damage)}</span>
            </li>
          ))}
          {state?.me && state.me.rank > 10 && (
            <li className="flex items-center gap-2 bg-gold-pale px-2 py-1">
              <span className="w-6 font-pixel-sm text-[16px] text-muted">{state.me.rank}</span>
              <span className="min-w-0 flex-1 truncate text-[18px]">{t('ui.boss.you')}</span>
              <span className="font-pixel-sm text-[16px]">{n(state.me.damage)}</span>
            </li>
          )}
        </ol>
        {state && !state.top.length && <p className="m-0 text-muted">{t('ui.boss.nobodyYet')}</p>}
      </section>

      <InfoButton name={liveName(e)} onClick={() => setInfo(true)} />
      <RulesModal
        open={info}
        onClose={() => setInfo(false)}
        title={liveName(e)}
        picture={{ src: bannerUrl(e.banner) }}
        icon="sword"
        rules={rules}
      />
      <BossPicker e={e} slot={picking} onClose={() => setPicking(null)} />
    </div>
  )
}
