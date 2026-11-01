// Welcome-back gifts (docs/58): the words of the developer's message the server writes when a player comes back after
// days away, in the player's language, from the numbers the server put in it (engine/welcomeBack.ts). It says only how
// long they were away: no rule line and no INFO, the user's call (2026-11-01). The pop-up, the wrapped gift and its
// opening are the developer's messages' own (ReplyPopup, Gifts).
import { type WelcomeBackNote } from '@/engine'
import { useT } from '@/i18n/react'

/** The message's words: how long they were away. */
export function useWelcomeWords() {
  const { tPlural } = useT()
  return (note: WelcomeBackNote) => tPlural('ui.welcome.body', note.days, { n: note.days })
}
