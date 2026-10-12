// What the progression raids' screens share (docs/24): where a raid's page is.
import type { ProgressRaid } from '@/engine'

/** A progression raid's page: its area and its Pokémon (the key's two halves, so the link reads). */
export const progressRaidPath = (raid: Pick<ProgressRaid, 'areaId' | 'dex'>): string =>
  `/raid/${raid.areaId}/${raid.dex}`
