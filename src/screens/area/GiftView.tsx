// A gift Pokémon (docs/61 §5.3), as a step on the stage of its own (as a find is, FindView): the area's ground, the
// giver walking in from the left with what they hold (a Poké Ball or an Egg) and their line; the choices when there are
// several (Hitmonlee or Hitmonchan, a Kanto starter); TAKE IT (or BUY and NO THANKS for the Magikarp salesman). Taken,
// the ball springs open in the middle of the stage and the Pokémon stands there (an Egg is handed over and wobbles), and
// the panel says where it went. The engine decides everything (engine/moments.ts); this only shows it.
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { giftChoices, type GameData, type GiftMoment } from '@/engine'
import { AutoButton } from '@/components/AutoButton'
import { EggSprite } from '@/components/EggSprite'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { TypeBadge } from '@/components/TypeBadge'
import { pictureOf } from '@/fx/areaArt'
import { getLang } from '@/i18n'
import { localizeTrainerName } from '@/i18n/data'
import { useT } from '@/i18n/react'
import { money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { StageBackground } from '@/screens/battle/BattleStage'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { SprungThing } from '@/screens/area/FindView'
import { StagePanel } from '@/screens/area/StagePanel'
import { useGame, type GiftRun } from '@/store/game'
import { declineGiftHere, finishGift, takeGift } from '@/store/run'
import { cx } from '@/theme/util'

/** The giver's name in the player's language: a trainer's class and name, as the trainers' are. */
export function useGiverName(giver: string): string {
  // Re-read as the language changes.
  useGame((s) => s.settings.lang)
  return localizeTrainerName(getLang(), giver)
}

/** The giver's line, before anything is taken. */
export function giftLine(t: (k: string, v?: Record<string, string | number>) => string, g: GiftMoment, giver: string, name: string) {
  if (g.egg) return t('ui.gift.offerEgg', { giver })
  if ((g.price ?? 0) > 0) return t('ui.gift.offerSale', { giver, name, price: money(g.price!) })
  if (g.dex.length > 1 && !g.byStarter) return t('ui.gift.offerChoice', { giver })
  return t('ui.gift.offer', { giver, name })
}

/** The stage: the giver walking in, what they hold, and once taken the Pokémon springing out (or the Egg). */
export function GiftStage({
  areaId,
  g,
  received,
  dex,
}: {
  areaId: string | null
  g: GiftMoment
  received: GiftRun['received']
  /** The Pokémon shown springing out once taken. */
  dex: number
}) {
  const art = useMemo(() => pictureOf(areaId), [areaId])
  const ball = useGame((s) => s.data.items['poke-ball'])
  const { level, calm } = useMotion()
  const still = level === 'off' || calm
  return (
    <div className="relative isolate aspect-[3/2] w-full select-none overflow-hidden shadow-ledge">
      <StageBackground art={art} zones={false} />
      <RunRoundGauge strip className="absolute inset-x-0 top-0 z-30" />
      <motion.div
        className="absolute bottom-[10%] left-[6%] z-10 w-[34%]"
        initial={still ? false : { x: '-120%' }}
        animate={{ x: '0%' }}
        transition={{ duration: still ? 0 : 0.55, ease: 'easeOut' }}
      >
        <TrainerSprite src={g.sprite} size={160} className="h-auto w-full" />
        {!received && (
          <motion.span
            className="absolute -right-[18%] top-[48%] block w-[34%]"
            animate={still ? undefined : { y: ['0%', '-8%', '0%'] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            {g.egg ? <EggSprite size={44} /> : <ItemSprite item={ball} size={40} />}
          </motion.span>
        )}
      </motion.div>
      {received && received.placed !== 'egg' && <SprungThing itemKey="poke-ball" dex={dex} shiny={received.shiny} />}
      {received?.placed === 'egg' && (
        <motion.div
          className="absolute left-1/2 top-[72%] z-20 -translate-x-1/2 -translate-y-full"
          initial={still ? false : { x: '-180%', y: '-140%', rotate: -20, opacity: 0.6 }}
          animate={still ? { opacity: 1 } : { x: '-50%', y: '-100%', rotate: [0, -8, 8, 0], opacity: 1 }}
          transition={{ duration: still ? 0 : 0.8 }}
        >
          <EggSprite size={72} shake={!still} />
        </motion.div>
      )}
    </div>
  )
}

/** One choice of a pick-one gift: its sprite, name and types, as a button. */
function Choice({ dex, data, picked, onPick }: { dex: number; data: GameData; picked: boolean; onPick: () => void }) {
  const sp = data.species[dex]
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={picked}
      className={cx(
        'pixel-panel flex min-w-0 flex-1 flex-col items-center gap-1 p-2',
        picked && 'outline outline-[3px] outline-offset-2 outline-gold',
      )}
    >
      <SpriteImg dex={dex} size={72} />
      <span className="truncate text-xl leading-none">{sp?.name ?? `#${dex}`}</span>
      <span className="flex gap-1">
        {sp && <TypeBadge type={sp.type1} size="sm" />}
        {sp?.type2 && <TypeBadge type={sp.type2} size="sm" />}
      </span>
    </button>
  )
}

export function GiftView() {
  const { t } = useT()
  const run = useGame((s) => s.run)
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const g = data.config.giftMoments?.gifts.find((x) => x.id === run.gift?.id)
  const giver = useGiverName(g?.giver ?? '')
  const choices = g && save ? giftChoices(g, save) : []
  const [pick, setPick] = useState<number | null>(null)
  if (!g || !save) return null
  const received = run.gift?.received ?? null
  const chosen = pick ?? (choices.length === 1 ? choices[0]! : null)
  const shown = received?.dex ?? chosen ?? choices[0] ?? g.dex[0]!
  const name = data.species[shown]?.name ?? `#${shown}`
  const price = g.price ?? 0
  const hours = data.config.giftMoments?.eggHours ?? 6
  const stage = <GiftStage areaId={run.areaId} g={g} received={received} dex={shown} />

  if (received) {
    const got =
      received.placed === 'egg'
        ? t('ui.gift.receivedEgg')
        : t(received.shiny ? 'ui.gift.receivedShiny' : 'ui.gift.received', { name })
    const where =
      received.placed === 'egg'
        ? t('ui.gift.eggBox', { hours })
        : t(`ui.trick.placed.${received.placed}`, { level: received.replacedLevel ?? 0 })
    return (
      <StagePanel
        scene={stage}
        bar={
          <AutoButton variant="primary" size="lg" className="w-full" paused="byDialogs" onClick={finishGift}>
            {t('ui.common.continue')}
          </AutoButton>
        }
      >
        <div className="flex flex-col items-center gap-2 py-2 text-center" role="status">
          <p className="m-0 text-[26px] leading-tight">{got}</p>
          <p className="copy m-0 text-muted">{where}</p>
        </div>
      </StagePanel>
    )
  }

  const pickable = choices.length > 1
  const take = () => chosen != null && takeGift(chosen)
  return (
    <StagePanel
      scene={stage}
      bar={
        price > 0 ? (
          <div className="flex gap-2">
            <PixelButton variant="primary" size="lg" className="flex-1" disabled={save.gold < price} onClick={take}>
              {t('ui.gift.buy', { price: money(price) })}
            </PixelButton>
            <PixelButton size="lg" className="flex-1" onClick={declineGiftHere}>
              {t('ui.gift.noThanks')}
            </PixelButton>
          </div>
        ) : pickable ? (
          <PixelButton variant="primary" size="lg" className="w-full" disabled={chosen == null} onClick={take}>
            {t('ui.gift.take')}
          </PixelButton>
        ) : (
          <AutoButton variant="primary" size="lg" className="w-full" paused="byDialogs" onClick={take}>
            {t('ui.gift.take')}
          </AutoButton>
        )
      }
    >
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <p className="pixel-dialogue m-0 w-full px-3 py-1.5 text-left text-[20px] leading-[1.15]" role="status">
          {giftLine(t, g, giver, name)}
        </p>
        {pickable && (
          <div className="flex w-full gap-2" role="group" aria-label={t('ui.gift.choose')}>
            {choices.map((d) => (
              <Choice key={d} dex={d} data={data} picked={chosen === d} onPick={() => setPick(d)} />
            ))}
          </div>
        )}
        {price > 0 && save.gold < price && (
          <p className="copy m-0 text-danger">{t('ui.gift.tooPoor', { price: money(price) })}</p>
        )}
      </div>
    </StagePanel>
  )
}
