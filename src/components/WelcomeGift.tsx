// A small world's starting gift (docs/64 §4.7, docs/15 §45b): right after the partner pick, a small blue present holding
// the world's starting bag and ₽. OPEN puts them in the bag (store/welcomeGift.ts) and lists them; OK closes. Closing
// before opening opens it too: it is the player's bag, nothing to refuse. Its turn comes in the one-time pop-ups'
// queue (engine/popups.ts: `welcomeGift`, owed at once). Every state is on /kitchen-sink (WelcomeGiftBits).
import { useState } from 'react'
import { motion } from 'framer-motion'
import { fxSound } from '@/audio/sfx'
import { welcomeGiftContents, welcomeGiftDue, type GiftItem } from '@/engine'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import { openStartingGift } from '@/store/welcomeGift'
import { worldName } from '@/store/worlds'
import { PresentImg, RewardList } from './GiftCard'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'

/** The pop-up as it looks: the present waiting (OPEN), or what came out of it (OK). */
export function WelcomeGiftView({
  open,
  world,
  contents,
  opened,
  onOpen,
  onClose,
}: {
  open: boolean
  world: string
  contents: GiftItem[]
  opened: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const still = calm || level === 'off'
  return (
    <Modal
      open={open}
      onClose={opened ? onClose : onOpen}
      title={t(opened ? 'ui.welcomeGift.openedTitle' : 'ui.welcomeGift.title')}
    >
      <div className="flex flex-col gap-3">
        {!opened ? (
          <>
            <p className="copy m-0 text-base">{t('ui.welcomeGift.body', { world })}</p>
            <div className="grid place-items-center py-2" role="img" aria-label={t('ui.welcomeGift.present')}>
              <motion.div
                animate={still ? undefined : { y: [0, -4, 0] }}
                transition={
                  still
                    ? undefined
                    : { duration: 1.6, repeat: Infinity, ease: (p: number) => Math.round(p * 4) / 4 }
                }
              >
                <PresentImg look="blue" level={2} scale={3} />
              </motion.div>
            </div>
            <div className="flex justify-end">
              <PixelButton variant="primary" onClick={onOpen}>
                {t('ui.welcomeGift.open')}
              </PixelButton>
            </div>
          </>
        ) : (
          <>
            <motion.div
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <RewardList items={contents} />
            </motion.div>
            <p className="copy m-0 text-base text-muted">{t('ui.welcomeGift.inBag')}</p>
            <div className="flex justify-end">
              <PixelButton variant="primary" onClick={onClose}>
                {t('ui.common.ok')}
              </PixelButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/** The pop-up in the game: on its turn while a present waits, and on after OPEN until OK. */
export function WelcomeGiftPopup() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const turn = useMyTurn('welcomeGift')
  const due = save ? welcomeGiftDue(save, data) : null
  // What came out, kept for the list once the save says it's opened (and the queue moves on).
  const [got, setGot] = useState<{ world: string; contents: GiftItem[] } | null>(null)
  const open = (!!due && turn) || !!got
  useOnScreen('welcomeGift', open)
  const onOpen = () => {
    if (!due) return
    const shown = { world: worldName(due.world, data), contents: welcomeGiftContents(due.gift) }
    if (!openStartingGift()) return
    fxSound('gift.pop')
    setGot(shown)
  }
  return (
    <WelcomeGiftView
      open={open}
      world={got?.world ?? (due ? worldName(due.world, data) : '')}
      contents={got?.contents ?? (due ? welcomeGiftContents(due.gift) : [])}
      opened={!!got}
      onOpen={onOpen}
      onClose={() => setGot(null)}
    />
  )
}
