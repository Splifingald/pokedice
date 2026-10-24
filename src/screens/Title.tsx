import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Die } from '@/components/Die'
import { DiceLogo } from '@/components/DiceLogo'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { extremeOn, extremeOpen, gameFeelOn, isExtreme, teamOf } from '@/engine'
import { ExtremeMark, ExtremeTitleCard, SwitchSaveModal } from '@/components/Extreme'
import { otherSave } from '@/store/extreme'
import { useT } from '@/i18n/react'
import { readInvite } from '@/lib/friendInvite'
import { lookupCode, type FriendNotice } from '@/lib/friends'
import { isSupabaseConfigured } from '@/lib/supabase'
import { avatarOf } from '@/lib/avatars'
import { TrainerLook } from '@/components/TrainerLook'
import { activeSlot } from '@/save/storage'
import { useGame } from '@/store/game'
import { useIsAdmin } from '@/store/hooks'
import { takeResumeLanding } from '@/store/resume'
import { AccountButton } from '@/components/AccountButton'
import type { DieType } from '@/engine/types'

const DECOR: DieType[] = ['fire', 'water', 'grass', 'electric', 'psychic']

/** An invite link was opened (docs/16): who sent it, under the logo, until there is a game to become friends in. */
function InviteRibbon() {
  const { t } = useT()
  const [who, setWho] = useState<FriendNotice | null>(null)
  useEffect(() => {
    const code = isSupabaseConfigured ? readInvite() : null
    if (!code) return
    let live = true
    lookupCode(code)
      .then((w) => live && setWho(w))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  if (!who) return null
  return (
    <p className="m-0 flex w-full max-w-xs items-center gap-2.5 bg-sky py-1 pl-1.5 pr-3 shadow-[inset_0_0_0_2px_#5b8def]">
      <TrainerLook src={avatarOf(who.avatar).src} w={44} h={48} />
      <span className="text-[20px] leading-[1.1]">{t('ui.friends.ribbon', { name: who.name })}</span>
    </p>
  )
}

export function Title() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth)
  const corrupt = useGame((s) => s.corruptSaveArchived)
  const isAdmin = useIsAdmin()
  // The game feel (docs/38 §9): the title forms with dice, as in the trailer, in place of the wordmark and its row.
  const feel = useGame((st) => gameFeelOn(st.data))
  const [confirmNew, setConfirmNew] = useState(false)
  const [toMain, setToMain] = useState(false)
  const lead = save ? teamOf(save)[0] : undefined
  // Extreme mode (docs/22): this page plays one of two saves; the other one is a card (or a button) away.
  const extreme = isExtreme(save) || activeSlot() === 'extreme'
  const other = otherSave()
  const mainSave = extreme ? other : save
  const showExtremeCard = !extreme && extremeOn(data) && (!!other || extremeOpen(mainSave, data))

  return (
    <main className="scanlines flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      {feel ? (
        // Full width: the dice come in from the screen's edge.
        <DiceLogo className="-mx-4 self-stretch" />
      ) : (
        <motion.div
          className="text-center"
          initial={{ y: -30 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 12 }}
        >
          <h1
            className="text-7xl leading-none tracking-widest sm:text-8xl"
            style={{ textShadow: '4px 4px 0 #b6c3d9, 8px 8px 0 #24304f' }}
          >
            POKÉ<span className="text-danger">DICE</span>
          </h1>
        </motion.div>
      )}

      <InviteRibbon />

      {!feel && (
        <div className="flex gap-3" aria-hidden>
          {DECOR.map((t, i) => (
            <Die key={t} type={t} face={data.diceTypes[t]?.faces[(i * 2 + 3) % 6] ?? null} size={48} rollKey={`t${i}`} delay={0.2 + i * 0.1} />
          ))}
        </div>
      )}

      <div className="flex w-full max-w-xs flex-col gap-3">
        {save && (
          <PixelButton
            variant="primary"
            size="lg"
            // An encounter left under way (store/resume.ts) is where CONTINUE goes: straight back into it.
            onClick={() => {
              const { run } = useGame.getState()
              navigate(takeResumeLanding(run) || run.phase !== 'idle' ? '/area' : '/home')
            }}
            aria-label={lead ? t('ui.title.continueWith', { name: data.species[lead.dex]?.name ?? '' }) : t('ui.common.continue')}
          >
            {lead && <MiniSprite dex={lead.dex} size={48} className="-my-3 -ml-2" />}
            {t('ui.common.continue')}
            {extreme && <ExtremeMark />}
          </PixelButton>
        )}
        {showExtremeCard && <ExtremeTitleCard save={other} />}
        {extreme && mainSave && (
          <PixelButton size="md" onClick={() => setToMain(true)}>
            {t('ui.extreme.card.continueMain')}
          </PixelButton>
        )}
        <PixelButton size="lg" variant={save ? 'secondary' : 'primary'} onClick={() => (save ? setConfirmNew(true) : navigate('/new'))}>
          {t('ui.title.newGame')}
        </PixelButton>
        <PixelButton size="md" variant="ghost" onClick={() => navigate('/help')}>
          {t('ui.title.howToPlay')}
        </PixelButton>
        {isSupabaseConfigured && <AccountButton />}
      </div>

      {corrupt && (
        <p className="copy max-w-md text-center text-danger">{t('ui.title.corruptSave')}</p>
      )}

      <footer className="copy mt-4 max-w-lg text-center text-muted">
        {t('ui.title.legal')}
        <div className="mt-2 flex justify-center gap-4">
          {/* The deploy guide is for whoever runs the game, not for players: in dev and for the admin only. */}
          {(import.meta.env.DEV || isAdmin) && (
            <Link to="/setup" className="underline">
              {t('ui.title.deployGuide')}
            </Link>
          )}
          {import.meta.env.DEV && (
            <Link to="/kitchen-sink" className="underline">
              {t('ui.title.kitchenSink')}
            </Link>
          )}
        </div>
      </footer>

      <SwitchSaveModal to="main" open={toMain} onClose={() => setToMain(false)} />

      <Modal open={confirmNew} onClose={() => setConfirmNew(false)} title={t('ui.title.startOver')}>
        <p className="copy mb-4 text-lg">
          {t('ui.title.startOverBody', { where: auth.status === 'signed_in' ? t('ui.title.hereAndCloud') : '' })}
        </p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirmNew(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" onClick={() => navigate('/new')}>
            {t('ui.title.startOverAction')}
          </PixelButton>
        </div>
      </Modal>
    </main>
  )
}
