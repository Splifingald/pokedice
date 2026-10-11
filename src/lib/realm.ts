// Which world the database calls are about (docs/20, migration 0039): the main save's, or the Extreme one's.
import { activeSlot } from '@/save/storage'

/**
 * The realm argument for the database's functions: nothing at all for the main world (every function defaults to it),
 * so a database that hasn't run 0039 yet still answers the main game as before.
 */
export const realmArgs = (): { p_realm?: 'extreme' } => (activeSlot() === 'extreme' ? { p_realm: 'extreme' } : {})
