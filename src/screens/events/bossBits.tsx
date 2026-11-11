// The Community Boss's light pieces (docs/71 §4.4): its art over a picture and its line on Home. Apart from its page
// (Boss.tsx), so Home's cards and the battle screen's imports (world.tsx → live.tsx) don't load the gifts' art.
import type { LiveEvent } from '@/engine'
import { MiniSprite } from '@/components/SpriteImg'

/** Its art over a picture (Home's card, the pop-up): the boss's menu icon, big, standing on it. */
export function BossArt({ e, big }: { e: LiveEvent; big?: boolean }) {
  return (
    <span className="lv-fx grid place-items-center" aria-hidden>
      <MiniSprite dex={e.boss.dex} size={big ? 64 : 36} />
    </span>
  )
}
