// The Day Care unlock tutorial: once enough species are in the Pokédex, Professor Oak sends the player there. The
// pop-up can't be dismissed — its only button goes to the Day Care, and the first visit ends it (saved, so it syncs).
import { useLocation, useNavigate } from 'react-router-dom'
import { dayCareTutorialDue } from '@/engine'
import { useGame } from '@/store/game'
import { EggSprite } from '@/screens/DayCareScreen'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'

export function DayCareTutorial() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const data = useGame((s) => s.data)
  const due = useGame((s) => !!s.save && dayCareTutorialDue(s.save, s.data))
  // Only between fights, never on top of a battle, a catch, the results or the Game Corner.
  const idle = useGame((s) => s.run.phase === 'idle')
  const open = due && idle && pathname !== '/daycare'
  return (
    <Modal open={open} dismissable={false} title="The Day Care is open!">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <img
            src="/characters/prof-oak.png"
            alt="Professor Oak"
            width={64}
            height={64}
            className="shrink-0"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="text-xl leading-snug">
            <b>PROF. OAK:</b> {data.config.dayCare.unlockPokedex} species in your Pokédex — well done! The{' '}
            <b>Pokémon Day Care</b> will now look after your Pokémon: leave one there and it trains on its own, even
            while you're away. And the couple has <b>a free Egg</b> waiting for you. Go and see them!
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <EggSprite size={40} />
          <PixelButton variant="primary" size="lg" onClick={() => navigate('/daycare')}>
            GO TO THE DAY CARE
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
