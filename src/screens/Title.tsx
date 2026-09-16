import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Die } from '@/components/Die'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { signInWithGoogle, signOut } from '@/store/sync'
import type { DieType } from '@/engine/types'

const DECOR: DieType[] = ['fire', 'water', 'grass', 'electric', 'psychic']

export function Title() {
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth)
  const corrupt = useGame((s) => s.corruptSaveArchived)
  const runArea = useGame((s) => s.run.areaId)
  const [confirmNew, setConfirmNew] = useState(false)

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
        <p className="mt-3 text-2xl text-muted">A dice battler · the original 151</p>
      </motion.div>

      <div className="flex gap-3" aria-hidden>
        {DECOR.map((t, i) => (
          <Die key={t} type={t} face={data.diceTypes[t]?.faces[(i * 2 + 3) % 6] ?? null} size={48} rollKey={`t${i}`} delay={0.2 + i * 0.1} />
        ))}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {save && (
          <PixelButton variant="primary" size="lg" onClick={() => navigate(runArea ? '/area' : '/map')}>
            CONTINUE
          </PixelButton>
        )}
        <PixelButton size="lg" variant={save ? 'secondary' : 'primary'} onClick={() => (save ? setConfirmNew(true) : navigate('/new'))}>
          NEW GAME
        </PixelButton>
        <PixelButton size="md" variant="ghost" onClick={() => navigate('/help')}>
          HOW TO PLAY
        </PixelButton>
        {isSupabaseConfigured && auth.status === 'signed_out' && (
          <PixelButton size="md" variant="ghost" onClick={() => void signInWithGoogle()}>
            Back up your save (Google)
          </PixelButton>
        )}
        {auth.status === 'signed_in' && (
          <div className="text-center text-lg text-muted">
            Backed up as {auth.email} ·{' '}
            <button type="button" className="underline" onClick={() => void signOut()}>
              sign out
            </button>
          </div>
        )}
      </div>

      {corrupt && (
        <p className="copy max-w-md text-center text-danger">
          Your previous save could not be read. It was archived (pokedice.save.corrupt) and a fresh game is ready.
        </p>
      )}

      <footer className="copy mt-4 max-w-lg text-center text-muted">
        A personal, non-commercial fan project. Pokémon and all related names are trademarks of Nintendo, Game Freak
        and Creatures. Sprites are loaded from the public PokeAPI repository.
        <div className="mt-2 flex justify-center gap-4">
          <Link to="/setup" className="underline">
            Deployment guide
          </Link>
          {import.meta.env.DEV && (
            <Link to="/kitchen-sink" className="underline">
              Kitchen sink
            </Link>
          )}
        </div>
      </footer>

      <Modal open={confirmNew} onClose={() => setConfirmNew(false)} title="Start over?">
        <p className="copy mb-4 text-lg">
          This replaces your current save{auth.status === 'signed_in' ? ' here and in the cloud' : ''}. Pokédollars, catches and
          upgrades will be lost.
        </p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirmNew(false)}>Cancel</PixelButton>
          <PixelButton variant="danger" onClick={() => navigate('/new')}>
            Start over
          </PixelButton>
        </div>
      </Modal>
    </main>
  )
}
