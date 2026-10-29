// Kitchen sink (dev only): the weekly Versus league (docs/44) — its header (no group yet, ranked), the 3 opponents
// (one red FIGHT; the admin's BOT tag; a phone's width; none on offer), the matchup mark, the group's board (this
// week, the top 10's rewards, the admin's view with bots, a phone's width; empty; last week empty; the global board,
// its switch and line, long and empty), the result card
// (a win, a loss under the safe line, a loss above it, a leave, waiting on the server, not recorded), the reward
// message's words, the Raid Ball, its throw's ball and the raid catch that offers it, and the rules card and INFO.
import { useState, type ReactNode } from 'react'
import {
  BotTag,
  Choices,
  EdgeMark,
  LeagueHeader,
  LeagueResultCard,
  LeagueRows,
  RewardMark,
  TrophyCount,
} from '@/screens/versus/League'
import { useVersusRules, VersusRulesModal } from '@/components/FeatureRules'
import { ItemSprite } from '@/components/ItemSprite'
import { CatchPanel } from '@/screens/battle/CatchPanel'
import { ReplyBox } from '@/components/ContactModal'
import { PixelButton } from '@/components/PixelButton'
import { RulesCard } from '@/components/RulesCard'
import { Seg } from '@/components/Segmented'
import { InfoButton } from '@/components/RulesModal'
import { ballOfItem } from '@/fx/scenes'
import { useT } from '@/i18n/react'
import type { VersusEntry } from '@/lib/versus'
import type { LeagueChoice, LeagueRow } from '@/lib/versusLeague'
import { useGame } from '@/store/game'

function Frame({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={
        wide ? 'flex w-[560px] max-w-full flex-col gap-1' : 'flex w-[360px] max-w-full flex-col gap-1'
      }
    >
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

const mon = (dex: number, shiny = false) => ({ dex, level: 50, shiny })
const NO_POWERS = { gems: [], gmax: false, z: false }
const CHOICES: LeagueChoice[] = [
  {
    slot: 1,
    name: 'MISTY',
    avatar: 'kanto/lass',
    team: [mon(121), mon(131), mon(130)],
    powers: NO_POWERS,
    trophies: 42,
    rich: false,
    bot: null,
  },
  {
    slot: 2,
    name: 'Kenta07',
    avatar: 'johto/schoolboy',
    team: [mon(248), mon(212), mon(149, true)],
    powers: NO_POWERS,
    trophies: 55,
    rich: true,
    bot: null,
  },
  {
    slot: 3,
    name: 'Lina',
    avatar: 'green',
    team: [mon(3), mon(59), mon(94)],
    powers: NO_POWERS,
    trophies: 38,
    rich: false,
    bot: null,
  },
]
const ME: VersusEntry = {
  userId: 'me',
  isMe: true,
  name: 'RED',
  avatar: 'red',
  team: [mon(6), mon(9), mon(26)],
  ids: null,
  version: 1,
  attackWins: 0,
  defenseWins: 0,
  beaten: false,
  rich: false,
  powers: NO_POWERS,
}
const NAMES = [
  'Sora',
  'MISTY',
  'Kenta07',
  'RED',
  'Lina',
  'PikaFan12',
  'Theo',
  'Mila',
  'BROCK',
  'Haruto',
  'jules',
  'Emma',
]
const ROWS: LeagueRow[] = NAMES.map((name, i) => ({
  id: `row-${i}`,
  isMe: name === 'RED',
  name,
  avatar: i % 3 ? 'red' : 'green',
  team: [mon(25 + i), mon(130 - i), mon(240 + i)],
  trophies: [180, 152, 152, 120, 96, 80, 66, 50, 41, 30, 12, 0][i]!,
  rank: [1, 2, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12][i]!,
  rich: i === 2,
  bot: null,
}))
const RAID_CATCH = {
  dex: 150,
  level: 70,
  kind: 'boss' as const,
  target: { mode: 'new' as const },
  result: null,
}
const ADMIN_ROWS = ROWS.map((r, i) => ({ ...r, bot: i === 0 || i === 6 || i === 9 }))
// The global board: 130 players of every group, you at #121 (its top 100, you and the 10 either side).
const GLOBAL_ROWS: LeagueRow[] = Array.from({ length: 130 }, (_, i) => ({
  id: `global-${i}`,
  isMe: i === 120,
  name: i === 120 ? 'RED' : `${NAMES[i % NAMES.length]}${i}`,
  avatar: i % 3 ? 'red' : 'green',
  team: [mon(1 + (i % 150)), mon(152 + (i % 99)), mon(252 + (i % 134))],
  trophies: 400 - i * 3,
  rank: i + 1,
  rich: i === 4,
  bot: null,
}))

export function LeagueBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const rules = useVersusRules()
  const [info, setInfo] = useState(false)
  const noop = () => {}
  const ends = Date.now() + 3 * 86_400_000 + 5 * 3_600_000
  const ball = data.items['raid-ball']
  return (
    <>
      <Frame name="LeagueHeader · no group yet (no match this week)">
        <LeagueHeader trophies={0} rank={null} size={0} endsAt={ends} />
      </Frame>
      <Frame name="LeagueHeader · ranked, the last hours">
        <LeagueHeader trophies={152} rank={2} size={20} endsAt={Date.now() + 2 * 3_600_000} />
      </Frame>
      <Frame name="Choices · 3 opponents, one red FIGHT (the best matchup)" wide>
        <Choices choices={CHOICES} mine={ME} busy={false} onFight={noop} />
      </Frame>
      <Frame name="Choices · the admin's view: the bot tagged" wide>
        <Choices
          choices={CHOICES.map((c, i) => ({ ...c, bot: i === 2 }))}
          mine={ME}
          busy={false}
          onFight={noop}
        />
      </Frame>
      <Frame name="Choices · a phone's width, the admin's view">
        <Choices
          choices={CHOICES.map((c, i) => ({ ...c, bot: i === 2 }))}
          mine={ME}
          busy={false}
          onFight={noop}
        />
      </Frame>
      <Frame name="Choices · starting a match (busy)" wide>
        <Choices choices={CHOICES} mine={ME} busy onFight={noop} />
      </Frame>
      <Frame name="Choices · none on offer">
        <Choices choices={[]} mine={ME} busy={false} onFight={noop} />
      </Frame>
      <Frame name="LeagueRows · this week: ties share a rank, the top 10's rewards" wide>
        <LeagueRows rows={ROWS} empty="" />
      </Frame>
      <Frame name="LeagueRows · the admin's view (BOT on bots)" wide>
        <LeagueRows rows={ADMIN_ROWS.slice(0, 7)} empty="" />
      </Frame>
      <Frame name="LeagueRows · in PC's side column (the same rows, narrower)">
        <LeagueRows rows={ROWS.slice(0, 5)} empty="" />
      </Frame>
      <Frame name="LeagueRows · a phone's width, the admin's view (the rewards wrap before the team does)">
        <LeagueRows rows={ADMIN_ROWS.slice(0, 5)} empty="" />
      </Frame>
      <Frame name="LeagueRows · no group yet / last week not played / nobody this week (global)">
        <LeagueRows rows={[]} empty={t('ui.league.boardEmpty')} />
        <LeagueRows rows={[]} empty={t('ui.league.lastEmpty')} />
        <LeagueRows rows={[]} empty={t('ui.league.globalEmpty')} global />
      </Frame>
      <Frame name="LeagueBoard's switch · This week / Last week / Global, and the global board's line">
        <Seg
          label={t('ui.league.whichWeek')}
          value="global"
          onChange={noop}
          options={[
            { id: 'this', label: t('ui.league.thisWeek') },
            { id: 'last', label: t('ui.league.lastWeek') },
            { id: 'global', label: t('ui.league.global') },
          ]}
        />
        <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">{t('ui.league.globalNote')}</p>
      </Frame>
      <Frame
        name="LeagueRows · global: every group's players, no rewards; its top 100, then you among yours"
        wide
      >
        <LeagueRows rows={GLOBAL_ROWS} empty="" global />
      </Frame>
      <Frame name="RewardMark · 1st, 2nd, 3rd, 4th, 6th, 11th (nothing)">
        <div className="flex flex-wrap items-center gap-3">
          {[1, 2, 3, 4, 6, 11].map((r) => (
            <span key={r} className="flex items-center gap-1">
              #{r} <RewardMark rank={r} />
            </span>
          ))}
        </div>
      </Frame>
      <Frame name="EdgeMark · 3, 2 (green), 1, 0 (red) of 3">
        <div className="flex items-center gap-4">
          {[3, 2, 1, 0].map((e) => (
            <EdgeMark key={e} edge={e} total={3} />
          ))}
        </div>
      </Frame>
      <Frame name="TrophyCount · BotTag">
        <div className="flex items-center gap-3">
          <TrophyCount n={0} />
          <TrophyCount n={152} size={20} />
          <BotTag />
        </div>
      </Frame>
      <Frame name="Result · a win with 2 left (+6)">
        <LeagueResultCard
          outcome="won"
          name="MISTY"
          avatar="kanto/lass"
          delta={6}
          trophies={46}
          onExit={noop}
        />
      </Frame>
      <Frame name="Result · a loss under the safe line (nothing taken)">
        <LeagueResultCard
          outcome="lost"
          name="Kenta07"
          avatar="johto/schoolboy"
          delta={0}
          trophies={40}
          safe={100}
          onExit={noop}
        />
      </Frame>
      <Frame name="Result · a loss from 100 on (−3)">
        <LeagueResultCard outcome="lost" name="Lina" avatar="green" delta={-3} trophies={117} onExit={noop} />
      </Frame>
      <Frame name="Result · a leave (the flag) from 100 on (−10)">
        <LeagueResultCard
          outcome="left"
          name="Lina"
          avatar="green"
          delta={-10}
          trophies={110}
          onExit={noop}
        />
      </Frame>
      <Frame name="Result · waiting on the server">
        <LeagueResultCard
          outcome="won"
          name="MISTY"
          avatar="kanto/lass"
          delta={null}
          trophies={null}
          onExit={noop}
        />
      </Frame>
      <Frame name="Result · not recorded (the leave stands)">
        <LeagueResultCard
          outcome="won"
          name="MISTY"
          avatar="kanto/lass"
          delta={null}
          trophies={null}
          failed
          onExit={noop}
        />
      </Frame>
      <Frame name="The week's reward message (My messages, the pop-up), in the player's language">
        <ReplyBox
          reply={`@versus_league:${JSON.stringify({ week: '2026-10-26', rank: 2, trophies: 152, size: 20 })}`}
          at={new Date().toISOString()}
          fromDev
        />
      </Frame>
      <Frame name={`The Raid Ball · its picture, and its throw's ball (${ballOfItem('raid-ball')})`}>
        <div className="flex items-center gap-3">
          {ball && <ItemSprite item={ball} size={32} />}
          {ball && <ItemSprite item={ball} size={64} />}
          <span className="font-pixel-sm text-[16px] text-muted">{t('itemDesc.raid-ball')}</span>
        </div>
      </Frame>
      <Frame name="CatchPanel in a raid: the Raid Ball offered with the other balls (the bag's, here the kitchen save's)">
        <CatchPanel c={RAID_CATCH} onThrow={noop} revealed={false} raid />
      </Frame>
      <Frame name="A live league match, offline (dev page: the fight is real, the result can't be sent)">
        <a className="text-[18px] underline" href="/kitchen-sink/league-fight">
          /kitchen-sink/league-fight
        </a>
      </Frame>
      <Frame name="Rules · the card at the top of Versus, and INFO" wide>
        <RulesCard title={t('ui.league.title')} icon="trophy" rules={rules} onDone={noop} />
        <InfoButton name={t('ui.league.title')} onClick={() => setInfo(true)} />
        <PixelButton size="sm" onClick={() => setInfo(true)}>
          Open the rules pop-up
        </PixelButton>
        <VersusRulesModal open={info} onClose={() => setInfo(false)} />
      </Frame>
    </>
  )
}
