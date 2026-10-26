// Kitchen sink (dev only): Home's pieces (docs/43 §5.2) — the area button (plain, a secret area new, shut by the
// nightmare), the big button as CONTINUE, a challenge, greyed out and GO TO (with "Stay here" under
// it), Home's one card (plain, gold, with a gauge), the notices that replaced the arrival pop-ups (Prof. Oak's
// leaderboard tip, his invite with and without the gauge's room, Support me, a new region on offer), and the "Coming
// up" line for each thing still to open.
import { type ReactNode } from 'react'
import type { ComingUp, ConditionStatus } from '@/engine'
import { AreaStrip } from '@/components/AreaStrip'
import { Chip, NewTag } from '@/components/Chip'
import { LeaderboardNoticeView } from '@/components/LeaderboardTutorial'
import { ConnectHint, ShareNoticeView } from '@/components/ShareTutorial'
import { SupportNoticeView } from '@/components/SupportModal'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { AreaButton, ContinueButton, StayHere } from '@/screens/home/ContinueBar'
import { RegionOfferNotice } from '@/screens/home/Notices'
import { CARD_STRIP_H, HomeCard, Meter } from '@/screens/home/Widget'
import { ComingUpView } from '@/screens/home/Widgets'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const status = (cond: ConditionStatus['cond'], current: number, target: number): ConditionStatus => ({
  cond,
  met: false,
  current,
  target,
  label: '',
})

export function HomeBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const hasSave = useGame((s) => !!s.save)
  const secret = data.areas.find((a) => a.hidden) ?? data.areas[0]!
  const route = data.areas.find((a) => !a.hidden) ?? data.areas[0]!
  const lines: [string, ComingUp][] = [
    ['the Day Care', { kind: 'dayCare', current: 7, target: data.config.dayCare.unlockPokedex }],
    ['the special events', { kind: 'events', areaId: route.id }],
    ['Versus', { kind: 'versus', current: 1, target: 3 }],
    [
      'a secret area (a level)',
      { kind: 'secret', area: secret, status: status({ kind: 'maxLevel', level: 70 }, 45, 70) },
    ],
    [
      'a secret area (the Pokédex)',
      { kind: 'secret', area: secret, status: status({ kind: 'pokedex', count: 60 }, 41, 60) },
    ],
  ]
  const noop = () => undefined
  const strip = (area = route) => (
    <AreaStrip area={area} h={CARD_STRIP_H} className="absolute inset-0 h-full w-full object-cover" />
  )
  return (
    <div className="flex w-full flex-wrap items-start gap-4">
      {/* The area button reads the save (its rounds, its levels): only with a game under way. */}
      {hasSave && (
        <>
          <Frame name="Area button">
            <AreaButton area={route} areasState="plain" heldWhy={null} onOpen={noop} />
          </Frame>
          <Frame name="Area button: a secret area opened">
            <AreaButton area={route} areasState="new" heldWhy={null} onOpen={noop} />
          </Frame>
          <Frame name="Area button: shut by the nightmare (a tap says why)">
            <AreaButton
              area={route}
              areasState="plain"
              heldWhy={t('ui.nightmare.locked', { area: route.name })}
              onOpen={noop}
            />
          </Frame>
        </>
      )}
      <Frame name="CONTINUE">
        <ContinueButton
          label={t('ui.common.continue')}
          sub={t('ui.home.roundOf', { n: 2, total: 5 })}
          icon="play"
          onClick={noop}
        />
      </Frame>
      <Frame name="A challenge waiting">
        <ContinueButton
          label={t('ui.area.faceIt')}
          sub={t('ui.home.legendReady')}
          icon="sword"
          onClick={noop}
        />
      </Frame>
      <Frame name="Greyed out (it says why on a tap)">
        <ContinueButton
          label={t('ui.common.continue')}
          sub={t('ui.home.closed')}
          icon="play"
          off
          onClick={noop}
        />
      </Frame>
      <Frame name="Behind in the region: GO TO, and Stay here">
        <ContinueButton
          label={t('ui.victory.goToArea', { name: route.name })}
          sub={t('ui.home.roundOf', { n: 1, total: 5 })}
          icon="map"
          onClick={noop}
        />
        <StayHere sub={t('ui.home.freePlay')} onClick={noop} />
      </Frame>
      <Frame name="Home's card: a secret area">
        <HomeCard
          picture={strip(secret)}
          name={secret.name}
          tag={<NewTag />}
          status={t('ui.home.stTitle.new')}
          label={secret.name}
          onClick={noop}
        />
      </Frame>
      <Frame name="Home's card: gold, with a tag and a gauge">
        <HomeCard
          tone="gold"
          picture={strip()}
          name={t('ui.events.wheel.name')}
          tag={<Chip tone="gold">3</Chip>}
          status={t('ui.events.wheel.nextTicket', { time: '1h 20m' })}
          meter={<Meter value={2} max={3} />}
          label={t('ui.events.wheel.name')}
          onClick={noop}
        />
      </Frame>
      <Frame name="Home's card: a long name">
        <HomeCard
          picture={strip()}
          name="Diglett's Cave & Route 11 & Route 12"
          tag={<Chip tone="done">+3 Lv</Chip>}
          status={t('ui.home.dcNoPair')}
          label="Long"
          onClick={noop}
        />
      </Frame>
      <Frame name="Notice: Prof. Oak's leaderboard tip (✕ ends it)">
        <LeaderboardNoticeView onClose={noop} onGo={noop} />
      </Frame>
      <Frame name="Notice: Prof. Oak's invite (signed out, rewards on)">
        <ShareNoticeView onClose={noop} onShare={noop} extra={<ConnectHint />} />
      </Frame>
      <Frame name="Notice: Prof. Oak's invite (no rewards)">
        <ShareNoticeView onClose={noop} onShare={noop} />
      </Frame>
      <Frame name="Notice: Support me (SUPPORT ME opens the three asks)">
        <SupportNoticeView onClose={noop} onOpen={noop} />
      </Frame>
      <Frame name="Notice: a new region on offer (no ✕: it waits)">
        <RegionOfferNotice name="Johto" picture="/region-art/johto.png" onSee={noop} />
      </Frame>
      <Frame name="Notice: a new region without its picture">
        <RegionOfferNotice name="Hoenn" onSee={noop} />
      </Frame>
      {lines.map(([name, next]) => (
        <Frame key={name} name={`Coming up: ${name}`}>
          <ComingUpView next={next} />
        </Frame>
      ))}
    </div>
  )
}
