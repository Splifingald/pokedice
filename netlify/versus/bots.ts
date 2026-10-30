// The Versus league bots' weekly teams (docs/44 §9), apart from Netlify and Supabase so the tests can drive it: ask
// the database whether this week still needs its set (the league not Off, none made yet), and if so draw it with the
// engine and store it. The database keeps a week's set once, so a second run, or the admin's button, changes nothing.
import { weekBotTeams, weekId, type BotTeamRow, type GameData } from '@/engine'

export interface BotJobDeps {
  /** Whether the week still needs its set. */
  due: (week: string) => Promise<boolean>
  /** The game data players get: the live content, else the bundled one. */
  data: () => Promise<GameData>
  /** Stores the week's set; how many teams were stored (0: it had one already). */
  put: (week: string, teams: BotTeamRow[]) => Promise<number>
}

export async function makeWeekBotTeams(
  deps: BotJobDeps,
  now: number,
): Promise<{ week: string; made: number }> {
  const week = weekId(now)
  // Asked first: most runs find the week's set made, and reading the content is many requests.
  if (!(await deps.due(week))) return { week, made: 0 }
  return { week, made: await deps.put(week, weekBotTeams(await deps.data(), week)) }
}
