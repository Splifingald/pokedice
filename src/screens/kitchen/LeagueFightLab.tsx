// Dev only (/kitchen-sink/league-fight): a weekly league match (docs/44) fought on the battle screen without the server,
// your Versus team (or three Pokémon of the party) against a bot of tier 2. At the end the result can't be sent here,
// so the card says it wasn't recorded: the rest is the real fight, AUTO and the battle powers included.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildBotTeam, createRng, teamOf, VERSUS_LEVEL } from '@/engine'
import { useGame } from '@/store/game'
import { LeagueFightView } from '../versus/League'

export function LeagueFightLab() {
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const [n, setN] = useState(1)
  const bot = useMemo(() => buildBotTeam(data, 2, createRng(7 + n)), [data, n])
  const team = (save ? teamOf(save) : [])
    .slice(0, 3)
    .map((p) => ({ dex: p.dex, level: VERSUS_LEVEL, shiny: !!p.shiny }))
  const mine = team.length === 3 ? team : [6, 9, 3].map((dex) => ({ dex, level: VERSUS_LEVEL, shiny: false }))
  return (
    <LeagueFightView
      key={n}
      start={{
        matchId: 0,
        seed: 1234 + n,
        foe: {
          slot: 1,
          name: 'Kenta07',
          avatar: 'johto/schoolboy',
          team: bot.team,
          powers: bot.powers,
          trophies: 120,
          rich: false,
          bot: null,
        },
      }}
      team={mine}
      trophiesBefore={120}
      onExit={() => (n < 3 ? setN(n + 1) : navigate('/kitchen-sink'))}
    />
  )
}
