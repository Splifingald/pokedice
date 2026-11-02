// Admin → Analytics → which players every panel counts (docs/57 §1.1): all, the logged-in ones (an account) or the ones
// not logged in (a guest, keyed by their device). A guest who signs in is merged into their account (0102).
import type { Who } from '@/analytics/retention'

/** The switch's choices, All first: the page opens on it. */
export const WHO: readonly { id: Who; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'logged_in', label: 'Logged in' },
  { id: 'guests', label: 'Not logged in' },
]

/** What each choice counts, as the panels say it. */
export const WHO_TEXT: Record<Who, string> = {
  all: 'All players',
  logged_in: 'Logged-in players only (a guest who signs in counts from their first day as a guest)',
  guests: 'Players not logged in only (guests who never signed in on that device)',
}

/** The migration that splits the numbers by who plays, named where it is missing. */
export const WHO_MIGRATION = 'supabase/migrations/0130_analytics_logged_in.sql'
