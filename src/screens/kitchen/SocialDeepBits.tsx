// Kitchen sink: the Social and Settings family of the deep pass (docs/43 §5.8–§5.9). Board rows with their measure
// (a bar where the board has a ceiling, a count and its icon where it hasn't, the area being worked on), a compact row
// (a side column), Versus rows with the one red FIGHT and the navy ones; ScoreMeter on its way and full; a view's two
// columns (SocialColumns); the dock pinned at a phone's foot (SocialDock, shown on demand: it pins over this page); ADD
// FRIENDS' pop-up and adding a friend in it; a friend's card's BATTLE foot (online, offline, no record yet); the compact
// trainer card; the menu's foot tiles; the players online line above SYNC ONLINE and VIEW's list (docs/70: one, many;
// loading, failed, nobody, the list, the list cut to the 30 closest).
import { useState } from 'react'
import { BoardRow, ScoreMeter } from '@/components/BoardRow'
import { AddFriendForm } from '@/components/friends/AddFriendModal'
import { AddFriendsButton, AddFriendsSheet } from '@/components/friends/AddFriendsSheet'
import { FriendBattleFoot } from '@/components/friends/FriendProfileSheet'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { FootTile } from '@/components/PlayerMenu'
import { OnlinePlayersBody, PlayersOnlineView } from '@/components/PlayersOnline'
import type { OnlinePlayer } from '@/store/online'
import { SocialColumns, SocialDock } from '@/components/SocialTabs'
import { TrainerCard } from '@/components/TrainerCard'

const TEAM = [
  { dex: 6, level: 52 },
  { dex: 25, level: 50 },
  { dex: 9, level: 48 },
]

// VIEW's list (docs/70): most badges first, you among them; INVITE (an account), Sent, a friend, a guest (none).
const ONLINE: OnlinePlayer[] = [
  { name: 'Blue', look: 'green', team: TEAM, me: false, friend: false, invite: 'yes', id: 'ks-1' },
  { name: 'Sam', look: 'red', team: TEAM.slice(0, 2), me: true, friend: false, invite: null, id: null },
  { name: 'Misty', look: null, team: [{ dex: 121, level: 40 }, { dex: 54, level: 38, shiny: true }], me: false, friend: true, invite: null, id: null },
  { name: 'Brock', look: 'kanto/youngster', team: [{ dex: 95, level: 30 }], me: false, friend: false, invite: 'sent', id: 'ks-2' },
  { name: 'Trainer', look: 'johto/silver', team: [], me: false, friend: false, invite: null, id: null },
]

export function SocialDeepBits() {
  const [dock, setDock] = useState(false)
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex w-full flex-col gap-4">
      <h3 className="m-0 text-[20px] font-normal">
        Board rows: level (bar), Pokédex (count and bar), progression (area and bar), shinies (count and star)
      </h3>
      <ol className="m-0 grid w-full max-w-[720px] list-none gap-1.5 p-0">
        <BoardRow
          rank={1}
          look="/characters/red.png"
          name="Blue"
          team={TEAM}
          value={
            <span className="grid justify-items-end gap-1">
              Lv.70
              <ScoreMeter value={0.7} className="w-14" />
            </span>
          }
        />
        <BoardRow
          rank={2}
          look="/characters/green.png"
          name="Sam"
          isMe
          team={TEAM}
          value={
            <span className="grid justify-items-end gap-1">
              151
              <ScoreMeter value={1} className="w-14" />
            </span>
          }
        />
        <BoardRow
          rank={3}
          look="/characters/red.png"
          name="Misty"
          isFriend
          team={TEAM}
          sub={
            <span className="flex min-w-0 items-center gap-2">
              <small className="truncate font-pixel-sm text-[16px] text-muted">Cerulean Cape</small>
              <ScoreMeter value={0.35} className="w-16 shrink-0" />
            </span>
          }
        />
        <BoardRow
          rank={4}
          look="/characters/red.png"
          name="Leaf"
          team={TEAM}
          value={
            <span role="img" aria-label="3 shinies" className="inline-flex items-center gap-1.5">
              3
              <PixelIcon name="star" size={18} />
            </span>
          }
        />
      </ol>

      <h3 className="m-0 text-[20px] font-normal">
        A compact row (the PC side column) · Versus: the one red FIGHT, a navy one, beaten
      </h3>
      <ol className="m-0 grid w-full max-w-[420px] list-none gap-1.5 p-0">
        <BoardRow rank={5} look="/characters/red.png" name="Brock" team={TEAM} compact value="4" />
        <BoardRow look="/characters/red.png" name="Erika" team={TEAM}>
          <PixelButton variant="primary" size="sm" className="shrink-0 px-3">
            FIGHT
          </PixelButton>
        </BoardRow>
        <BoardRow look="/characters/green.png" name="Koga" team={TEAM}>
          <PixelButton variant="dark" size="sm" className="shrink-0 px-3">
            FIGHT
          </PixelButton>
        </BoardRow>
        <BoardRow look="/characters/red.png" name="Lance" team={TEAM} dim value="Beaten" />
      </ol>

      <h3 className="m-0 text-[20px] font-normal">ScoreMeter: empty, on its way, full</h3>
      <div className="flex items-center gap-3">
        <ScoreMeter value={0} className="w-20" />
        <ScoreMeter value={0.5} className="w-20" />
        <ScoreMeter value={1} className="w-20" />
      </div>

      <h3 className="m-0 text-[20px] font-normal">
        SocialColumns: the view on the left, its side column from 1024 px (stacked below)
      </h3>
      <SocialColumns
        main={
          <p className="copy m-0 bg-paper p-3 shadow-card">
            The list (the ranking, the opponents, the board).
          </p>
        }
        side={
          <p className="copy m-0 bg-gold-pale p-3 shadow-card-gold">
            What goes with it (your place, your team, your listings).
          </p>
        }
      />

      <h3 className="m-0 text-[20px] font-normal">SocialDock: a view's actions pinned at a phone's foot</h3>
      <PixelButton size="sm" className="self-start" onClick={() => setDock((v) => !v)}>
        {dock ? 'Hide the dock' : 'Show the dock'}
      </PixelButton>
      {dock && (
        <SocialDock>
          <PixelButton variant="primary" className="w-full" onClick={() => setDock(false)}>
            Add friends
          </PixelButton>
        </SocialDock>
      )}

      <h3 className="m-0 text-[20px] font-normal">
        ADD FRIENDS (no reward waiting; 2 ready, small as on PC) and its pop-up: the invite rewards (signed in, while on), your ID and COPY, adding one, reset, SHARE (the
        kitchen has no account: no ID, SHARE greyed)
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <AddFriendsButton onClick={() => setAdding(true)} readyCount={0} />
        <AddFriendsButton size="sm" onClick={() => setAdding(true)} readyCount={2} />
      </div>
      <AddFriendsSheet open={adding} onClose={() => setAdding(false)} />

      <h3 className="m-0 text-[20px] font-normal">
        A friend's card's foot with Friend Battles: online with a record · online, never fought · offline
      </h3>
      <div className="grid w-full max-w-[1100px] gap-3 md:grid-cols-3">
        {[
          { online: true, record: 'You lead 4–3' },
          { online: true, record: null },
          { online: false, record: 'Kiro leads 1–0' },
        ].map((b, i) => (
          <div key={i} className="bg-panel p-3 shadow-ring">
            <FriendBattleFoot battle={{ ...b, onBattle: () => undefined }} name="Kiro" />
          </div>
        ))}
      </div>

      <h3 className="m-0 text-[20px] font-normal">Adding a friend in the page (the field, the hint, ADD)</h3>
      <div className="w-full max-w-[420px]">
        <AddFriendForm />
      </div>

      <h3 className="m-0 text-[20px] font-normal">
        The trainer card, compact (Stats folded; open with More details) · the menu's foot
      </h3>
      <div className="flex w-full flex-wrap items-start gap-3">
        <div className="w-[360px] max-w-full bg-parchment p-3 shadow-ring">
          <TrainerCard />
        </div>
        <div className="grid w-[360px] max-w-full auto-cols-fr grid-flow-col gap-1.5 bg-panel p-3 shadow-ring">
          <FootTile icon="discord" label="Join the Discord" />
          <FootTile icon="heart" label="SUPPORT ME" />
          <FootTile icon="pencil" label="Contact the developer" />
        </div>
      </div>

      <h3 className="m-0 text-[20px] font-normal">
        Players online, above SYNC ONLINE in the menu (one player, many; hidden until the server has a count)
      </h3>
      <div className="grid w-[360px] max-w-full gap-1.5 bg-panel p-3 shadow-ring">
        <PlayersOnlineView count={1} onView={() => {}} />
        <PlayersOnlineView count={128} onView={() => {}} />
      </div>

      <h3 className="m-0 text-[20px] font-normal">
        VIEW's pop-up, inside: loading, failed, nobody yet, the list (you, INVITE, Sent, a friend, a guest), cut to the 30 closest
      </h3>
      <div className="flex w-full flex-wrap items-start gap-3">
        <div className="w-[360px] max-w-full bg-parchment p-3 shadow-ring">
          <OnlinePlayersBody state={{ status: 'loading' }} count={3} />
        </div>
        <div className="w-[360px] max-w-full bg-parchment p-3 shadow-ring">
          <OnlinePlayersBody state={{ status: 'error', message: "Couldn't load the list. Try again in a moment." }} count={3} />
        </div>
        <div className="w-[360px] max-w-full bg-parchment p-3 shadow-ring">
          <OnlinePlayersBody state={{ status: 'ready', players: [] }} count={1} />
        </div>
        <div className="w-[360px] max-w-full bg-parchment p-3 shadow-ring">
          <OnlinePlayersBody state={{ status: 'ready', players: ONLINE.slice(0, 3) }} count={3} />
        </div>
        <div className="w-[360px] max-w-full bg-parchment p-3 shadow-ring">
          <OnlinePlayersBody state={{ status: 'ready', players: ONLINE }} count={128} />
        </div>
      </div>
    </div>
  )
}
