import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Die } from '@/components/Die'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { teamOf } from '@/engine'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import type { DieType } from '@/engine/types'

const DECOR: DieType[] = ['fire', 'water', 'grass', 'electric', 'psychic']

export function Title() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth)
  const corrupt = useGame((s) => s.corruptSaveArchived)
  const runArea = useGame((s) => s.run.areaId)
  const [confirmNew, setConfirmNew] = useState(false)
  const lead = save ? teamOf(save)[0] : undefined

  return (
    <main className="scanlines flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10">
      <motion.div
        className="text-center"
        initial={{ y: -30 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 12 }}
      >
        <h1
          className="text-7xl leading-none tracking-widest sm:text-8xl"
          style={{ textShadow: '4px 4px 0 #6b6480, 8px 8px 0 #2a2438' }}
        >
          POKÉ<span className="text-danger">DICE</span>
        </h1>
      </motion.div>

      <div className="flex gap-3" aria-hidden>
        {DECOR.map((t, i) => (
          <Die key={t} type={t} face={data.diceTypes[t]?.faces[(i * 2 + 3) % 6] ?? null} size={48} rollKey={`t${i}`} delay={0.2 + i * 0.1} />
        ))}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {save && (
          <PixelButton
            variant="primary"
            size="lg"
            onClick={() => navigate(runArea ? '/area' : '/map')}
            aria-label={lead ? t('ui.title.continueWith', { name: data.species[lead.dex]?.name ?? '' }) : t('ui.common.continue')}
          >
            {lead && <MiniSprite dex={lead.dex} size={48} className="-my-3 -ml-2" />}
            {t('ui.common.continue')}
          </PixelButton>
        )}
        <PixelButton size="lg" variant={save ? 'secondary' : 'primary'} onClick={() => (save ? setConfirmNew(true) : navigate('/new'))}>
          {t('ui.title.newGame')}
        </PixelButton>
        <PixelButton size="md" variant="ghost" onClick={() => navigate('/help')}>
          {t('ui.title.howToPlay')}
        </PixelButton>
        {isSupabaseConfigured && <GoogleAccountButton />}
      </div>

      {corrupt && (
        <p className="copy max-w-md text-center text-danger">{t('ui.title.corruptSave')}</p>
      )}

      <footer className="copy mt-4 max-w-lg text-center text-muted">
        {t('ui.title.legal')}
        <div className="mt-2 flex justify-center gap-4">
          <Link to="/setup" className="underline">
            {t('ui.title.deployGuide')}
          </Link>
          {import.meta.env.DEV && (
            <Link to="/kitchen-sink" className="underline">
              {t('ui.title.kitchenSink')}
            </Link>
          )}
        </div>
      </footer>

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
