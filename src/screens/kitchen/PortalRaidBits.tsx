// Kitchen sink: Giratina's area raid in Distortion World's look (docs/15 §27): the themed raid page's pieces (the
// portal banner with its plate, the card open and caught, the lock, START, the team and the ball odds) in the violet
// night, its NPC partners pop-up (the portal and Giratina distorted as its banner, tearing in), and the raid's stage
// (the Distortion World, Giratina distorted on its island, a bar breaking into a tear). The entrance is on
// /kitchen-sink/fx; the page's own ground and the screen's tears are the game's (DistortionGround, DistortionFx).
import { useMemo, useState } from 'react'
import { makeBattler, raidNpcOffer, type TodayRaid } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import type { Fx } from '../battle/useBattleAnimator'
import { PortalRaidBanner } from '../events/PortalRaid'
import { BallOdds, RaidCard } from '../events/RaidPage'
import { RaidNpcPicker } from '../events/RaidNpcPicker'
import { RaidTeamSection } from '../events/RaidSetup'
import { StageTear } from '@/components/Portal'

const GIRATINA = 487

export function PortalRaidBits() {
  const data = useGame((s) => s.data)
  const player = useGame((s) => s.save?.player)
  const [picker, setPicker] = useState(false)
  const [tear, setTear] = useState<number | null>(null)
  const offer = useMemo(() => raidNpcOffer(data, ['kanto'], 20261015), [data])
  const areaId = data.areas[0]?.id ?? ''
  const card = (caught: boolean): TodayRaid => ({
    day: '',
    dex: GIRATINA,
    shiny: true,
    areaId,
    caught,
    tries: 0,
  })
  const { own, foe } = useMemo(
    () => ({
      own: makeBattler({ uid: 'k-dw-own', dex: 445, level: 100, hp: 300 }, data),
      foe: {
        ...makeBattler({ uid: 'k-dw-foe', dex: GIRATINA, level: 100, hp: 600, shiny: true }, data),
        mega: false,
      },
    }),
    [data],
  )
  const fx: Fx = {
    cursor: 0,
    message: '',
    hp: {},
    activeUid: own.uid,
    foeUid: 'enemy',
    fainted: {},
    dex: {},
    wornOut: {},
    tray: null,
    pop: null,
    banner: null,
    shake: null,
    flash: null,
    status: null,
    fly: null,
    scene: null,
    chip: null,
    cry: null,
  }
  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setPicker(true)}>
          Its pop-up: NPC partners (themed)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setTear((n) => (n ?? 0) + 1)}>
          A bar breaks: the stage tears
        </PixelButton>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {/* The page, as Giratina's raid page shows it (on the void, which here is a plain night box). */}
        <div className="dw-scope grid max-w-[560px] gap-3 bg-[#07020d] p-3">
          <PortalRaidBanner className="-mx-3 -mt-3 h-[132px]">
            <div className="pixel-plate absolute left-2 top-2 z-[1] grid gap-0.5 px-2.5 pb-1.5 pt-1 leading-normal">
              <b className="text-[24px] font-normal leading-none">Legendary raid</b>
              <small className="font-pixel-sm text-[16px] leading-none text-muted">
                Distortion World · Haunted Hollow
              </small>
            </div>
          </PortalRaidBanner>
          <RaidCard raid={card(false)} msLeft={null} kind="progress" portal />
          <div
            role="note"
            className="flex items-start gap-2.5 bg-gold-pale p-2.5 shadow-[inset_0_0_0_2px_#d99a1e]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center bg-paper shadow-ring-line" aria-hidden>
              <PixelIcon name="lock" size={18} />
            </span>
            <span className="grid gap-0.5 leading-tight">
              <b className="text-[19px] font-normal leading-none">Close every portal of Distortion World</b>
              <small className="font-pixel-sm text-[16px] text-ink">The lock, before the run is won.</small>
            </span>
          </div>
          <PixelButton variant="primary" size="lg" className="sheen w-full" onClick={() => setPicker(true)}>
            Start
          </PixelButton>
          <RaidTeamSection portal boss={GIRATINA} />
          <BallOdds dex={GIRATINA} />
          <RaidCard raid={card(true)} msLeft={null} kind="progress" portal />
        </div>
        {/* The fight's stage: the Distortion World behind, Giratina distorted on its island. */}
        <div className="dw-scope grid max-w-[560px] content-start gap-2 bg-[#07020d] p-3">
          <BattleStage
            own={own}
            foe={foe}
            fx={fx}
            ownShown
            foeShown
            trainer={null}
            overlay={null}
            onContact={() => {}}
            onSceneDone={() => {}}
            tapLabel={(b) => b.name}
            label="Giratina's raid stage"
            world="distortion"
            distorted
          >
            <StageTear id={tear} />
          </BattleStage>
          <p className="pixel-dialogue m-0 px-3 py-1.5 text-[20px]">
            The raid&apos;s message box, in the violet night.
          </p>
        </div>
      </div>
      {picker && (
        <RaidNpcPicker
          open
          offer={offer}
          need={2}
          group={[{ name: 'You', look: avatarOf(playerAvatarId(player)).src }]}
          level={100}
          boss={GIRATINA}
          onBack={() => setPicker(false)}
          onStart={() => setPicker(false)}
          portal={GIRATINA}
        />
      )}
    </div>
  )
}
