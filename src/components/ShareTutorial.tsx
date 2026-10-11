// Prof. Oak's "invite a friend" prompt: once per region, when the player holds its 2nd badge (between fights). INVITE
// shares the player's friend invite link (opening it makes the two of them friends, docs/16); signed out there is no
// friend ID, so it shares the game's own link. The native share sheet on phones, or a copied link where there is none
// (desktop). Remembered in localStorage. The donation pop-up and a special event's unlock pop-up go first when they're
// waiting too.
import { useEffect, useState } from 'react'
import { badgeCase, dayCareTutorialDue, donationDue, eventUnlockDue, leaderboardTutorialDue, regionOf, versusRulesDue } from '@/engine'
import { useT } from '@/i18n/react'
import { formatCode, inviteUrl, loadMyCode, useFriends } from '@/lib/friends'
import { shareOrCopy } from '@/lib/share'
import { useGame } from '@/store/game'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'

const seenKey = (region: string) => `pokedice.sharePrompt.${region}`
const seen = (region: string) => {
  try {
    return localStorage.getItem(seenKey(region)) === '1'
  } catch {
    return true
  }
}

export function ShareTutorial() {
  const { t } = useT()
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  const due = useGame(
    (s) =>
      !!s.save &&
      badgeCase(s.save, s.data).filter((b) => b.earned).length >= 2 &&
      !dayCareTutorialDue(s.save, s.data) &&
      !leaderboardTutorialDue(s.save, s.data) &&
      !donationDue(s.save, s.data) &&
      !eventUnlockDue(s.save, s.data) &&
      // Versus's rules pop-up goes first: one pop-up at a time.
      !versusRulesDue(s.save, s.data),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  const [closed, setClosed] = useState<string[]>([])
  const open = !!region && due && idle && !closed.includes(region) && !seen(region)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const code = useFriends((s) => s.code)
  // Fetched as the pop-up opens, not on the tap: a share sheet must open straight from the tap that asked for it.
  useEffect(() => {
    if (open && signedIn) void loadMyCode().catch(() => null)
  }, [open, signedIn])

  const close = () => {
    if (!region) return
    try {
      localStorage.setItem(seenKey(region), '1')
    } catch {
      /* private mode: may show again next visit */
    }
    setClosed((c) => [...c, region])
  }

  const share = async () => {
    const invite = signedIn && code
    const shared = invite
      ? await shareOrCopy(
          { title: 'Pokédice', text: t('ui.friends.shareText', { code: formatCode(code) }), url: inviteUrl(code) },
          t('ui.friends.linkCopied'),
        )
      : await shareOrCopy({ title: 'Pokédice', text: t('ui.share.text'), url: window.location.origin }, t('ui.share.copied'))
    // A cancelled share sheet keeps the pop-up.
    if (shared) close()
  }

  return (
    <Modal open={open} onClose={close} title={t('ui.share.title')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <TrainerSprite src="/characters/prof-oak.png" alt={t('ui.newGame.oak')} size={64} className="shrink-0" />
          <p className="text-xl leading-snug">
            <b>{t('ui.oak.prefix')}</b> {t('ui.share.body')}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.share.later')}</PixelButton>
          <PixelButton variant="primary" size="lg" onClick={() => void share()}>
            {t('ui.share.button')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
