// The legendary cinematics (docs/53): each legend's own entrance, by its dex. The raid intro plays a raid legend's
// (its words timed on its reveal); the battle plays a boss's (the name card and the send-out on its cues).
import type { BossCinema } from './boss'
import type { Cinema } from './kit'
import { articunoCinema } from './articuno'
import { moltresCinema } from './moltres'
import { celebiCinema } from './celebi'
import { enteiCinema } from './entei'
import { hoohCinema } from './hooh'
import { lugiaCinema } from './lugia'
import { mewCinema } from './mew'
import { mewtwoCinema } from './mewtwo'
import { raikouCinema } from './raikou'
import { suicuneCinema } from './suicune'
import { zapdosCinema } from './zapdos'

export { wordsAt } from './kit'
export type { Cinema, CinemaParams } from './kit'

/** The raids' cinematics: Kanto's legends first (the user's call, 2026-10-31: the rest once these are approved). */
export const RAID_CINEMAS: Readonly<Record<number, Cinema>> = {
  144: articunoCinema,
  145: zapdosCinema,
  146: moltresCinema,
  150: mewtwoCinema,
  249: lugiaCinema,
  250: hoohCinema,
}

/** The bosses' cinematics, on the battle stage with the name card and the send-out: Mew first. */
export const BOSS_CINEMAS: Readonly<Record<number, BossCinema>> = {
  151: mewCinema,
  243: raikouCinema,
  244: enteiCinema,
  245: suicuneCinema,
  251: celebiCinema,
}
