// Kitchen sink (dev only): real-player battles in areas (docs/53) — the intro (replayed), the card (a stranger, a rich
// friend with a shiny and a talent, three Pokémon), the tag, the rules (the first time and INFO), the result's part (won
// or lost; the request to send, sending, sent, failed, friends at once, already friends, signed out) and the Friends
// page's requests (one, several).
import { useEffect, useState, type ReactNode } from 'react'
import {
  AreaVersusRulesModal,
  DuelResult,
  FriendRequests,
  PlayerFoeCard,
  RealPlayerIntro,
  RealPlayerTag,
} from '@/components/AreaVersus'
import { PixelButton } from '@/components/PixelButton'
import { foeEncounter, type AreaFoe } from '@/engine'
import { avatarOf } from '@/lib/avatars'
import { useAreaVersus, type FriendRequest } from '@/store/areaVersus'
import { useGame } from '@/store/game'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const DAY = 86_400_000
const foe = (id: string, over: Partial<AreaFoe> = {}): AreaFoe => ({
  id,
  name: 'Misty',
  avatar: 'kanto/lass',
  sprite: avatarOf('kanto/lass').src,
  playedAt: Date.now() - 2 * DAY,
  team: [
    { dex: 25, level: 18 },
    { dex: 16, level: 15 },
  ],
  comboLevels: {},
  dieLevels: {},
  ...over,
})
const STRANGER = foe('ks-stranger')
const FRIEND = foe('ks-friend', {
  name: 'Kenta07',
  avatar: 'green',
  sprite: avatarOf('green').src,
  rich: true,
  friend: true,
  playedAt: Date.now() - 3 * 3600_000,
  team: [
    { dex: 6, level: 36 },
    { dex: 130, level: 34, shiny: true },
    { dex: 65, level: 33, talent: true },
  ],
})
const REQUESTS: FriendRequest[] = [
  { id: 'ks-r1', name: 'Lina', avatar: 'red', rich: false, areaId: null, at: Date.now() - DAY },
  { id: 'ks-r2', name: 'Kenta07', avatar: 'green', rich: true, areaId: null, at: Date.now() - 2 * DAY },
  { id: 'ks-r3', name: 'Theo', avatar: 'kanto/lass', rich: false, areaId: null, at: Date.now() - 3 * DAY },
]

export function AreaVersusBits() {
  const data = useGame((s) => s.data)
  const area = data.areas.find((a) => (a.encounterWeights.versus ?? 0) > 0)
  const [replay, setReplay] = useState(0)
  // The intro playing (its run's number), or 0.
  const [playing, setPlaying] = useState(0)
  useEffect(() => {
    if (replay) setPlaying(replay)
  }, [replay])
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  // The result's states, each under its own foe: the store holds what became of a request.
  useEffect(() => {
    useAreaVersus.setState((s) => ({
      sent: {
        ...s.sent,
        'ks-sending': 'sending',
        'ks-sent': 'sent',
        'ks-error': 'error',
        'ks-added': 'added',
      },
    }))
  }, [])
  const card = (f: AreaFoe) => {
    const enc = foeEncounter(f, data)
    return enc ? <PlayerFoeCard enc={enc} areaId={area?.id} firstRules={false} intro={false} /> : null
  }
  const withId = (id: string) => ({ ...STRANGER, id })
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Frame name="The intro, over the whole screen (a tap ends it)">
        <PixelButton size="sm" className="self-start" onClick={() => setReplay((n) => n + 1)}>
          Play the intro
        </PixelButton>
        {playing > 0 && <RealPlayerIntro key={playing} foe={STRANGER} onDone={() => setPlaying(0)} />}
      </Frame>
      <Frame name="The tag">
        <RealPlayerTag className="self-start" />
      </Frame>
      <Frame name="The card: a stranger, 2 Pokémon">
        <div className="pixel-panel p-3">{card(STRANGER)}</div>
      </Frame>
      <Frame name="The card: a rich friend, 3 Pokémon (a shiny, a talent), played today">
        <div className="pixel-panel p-3">{card(FRIEND)}</div>
      </Frame>
      <Frame name="The card, with its intro">
        <div className="pixel-panel p-3">
          {(() => {
            const enc = foeEncounter(STRANGER, data)
            return enc ? (
              <PlayerFoeCard key={`i${replay}`} enc={enc} areaId={area?.id} firstRules={false} />
            ) : null
          })()}
        </div>
      </Frame>
      <Frame name="The rules">
        <div className="flex gap-2">
          <PixelButton size="sm" onClick={() => setRules('unlock')}>
            The first time
          </PixelButton>
          <PixelButton size="sm" onClick={() => setRules('info')}>
            INFO
          </PixelButton>
        </div>
        <AreaVersusRulesModal
          open={rules != null}
          onClose={() => setRules(null)}
          onGo={rules === 'unlock' ? () => setRules(null) : undefined}
        />
      </Frame>
      <Frame name="Won: the request to send">
        <DuelResult outcome="won" foe={withId('ks-to-send')} signedInAs />
      </Frame>
      <Frame name="Won: sending">
        <DuelResult outcome="won" foe={withId('ks-sending')} signedInAs />
      </Frame>
      <Frame name="Won: sent">
        <DuelResult outcome="won" foe={withId('ks-sent')} signedInAs />
      </Frame>
      <Frame name="Won: couldn't send">
        <DuelResult outcome="won" foe={withId('ks-error')} signedInAs />
      </Frame>
      <Frame name="Lost: friends at once (they had asked)">
        <DuelResult outcome="lost" foe={withId('ks-added')} signedInAs />
      </Frame>
      <Frame name="Lost: a friend already">
        <DuelResult outcome="lost" foe={FRIEND} signedInAs />
      </Frame>
      <Frame name="Lost: signed out">
        <DuelResult outcome="lost" foe={withId('ks-guest')} />
      </Frame>
      <Frame name="Friends page: one request">
        <FriendRequests requests={REQUESTS.slice(0, 1)} />
      </Frame>
      <Frame name="Friends page: several requests">
        <FriendRequests requests={REQUESTS} />
      </Frame>
    </div>
  )
}
