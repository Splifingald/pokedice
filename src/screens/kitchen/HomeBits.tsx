// Kitchen sink (dev only): Home's pieces from the game-feel pass (docs/38 §6) — the "Coming up" line for each thing
// still to open, the big button as CONTINUE, a challenge, greyed out and GO TO (with "Stay here" under it), and Prof.
// Oak's leaderboard tip with its Later.
import { useState, type ReactNode } from 'react'
import type { ComingUp, ConditionStatus } from '@/engine'
import { LeaderboardTipModal } from '@/components/LeaderboardTutorial'
import { PixelButton } from '@/components/PixelButton'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { ContinueButton, StayHere } from '@/screens/home/ContinueBar'
import { ComingUpView } from '@/screens/home/Widgets'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-1">
      <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
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
  const [tip, setTip] = useState(false)
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
  return (
    <div className="flex w-full flex-wrap items-start gap-4">
      {lines.map(([name, next]) => (
        <Frame key={name} name={`Coming up: ${name}`}>
          <ComingUpView next={next} />
        </Frame>
      ))}
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
      <Frame name="Prof. Oak's leaderboard tip (Later and ✕ end it)">
        <PixelButton size="sm" onClick={() => setTip(true)}>
          The leaderboard tip
        </PixelButton>
      </Frame>
      <LeaderboardTipModal open={tip} onClose={() => setTip(false)} onGo={() => setTip(false)} />
    </div>
  )
}
