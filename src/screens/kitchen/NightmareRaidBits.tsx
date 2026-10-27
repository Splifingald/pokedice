// Kitchen sink: Darkrai's area raid in the nightmare's look (docs/15 §29): the themed raid page's pieces (the moon
// banner with its plate, the card open and caught, the lock, START, the team and the ball odds) in the moonlit night,
// its NPC partners pop-up (the moon and Darkrai as its banner, coming out of the shadow), and the raid's stage (the
// night under the full moon, a bar breaking into a shadow sweeping it), and the screen's vignette with the shadow
// passing over the page (NightmareFx: the raid's only, the area has none). The entrance is on /kitchen-sink/fx; the
// page's own ground is the game's (NightGround).
import { useMemo, useState } from 'react'
import { makeBattler, raidNpcOffer, type TodayRaid } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import { NightmareFx, StageShadow } from '@/components/Nightmare'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { useGame } from '@/store/game'
import { BattleStage } from '../battle/BattleStage'
import type { Fx } from '../battle/useBattleAnimator'
import { NightmareRaidBanner } from '../events/NightmareRaid'
import { BallOdds, RaidCard } from '../events/RaidPage'
import { RaidNpcPicker } from '../events/RaidNpcPicker'
import { RaidTeamSection } from '../events/RaidSetup'

const DARKRAI = 491

export function NightmareRaidBits() {
  const data = useGame((s) => s.data)
  const player = useGame((s) => s.save?.player)
  const [picker, setPicker] = useState(false)
  const [sweep, setSweep] = useState<number | null>(null)
  const [vignette, setVignette] = useState(false)
  const offer = useMemo(() => raidNpcOffer(data, ['kanto'], 20261016), [data])
  const areaId = data.areas[0]?.id ?? ''
  const card = (caught: boolean): TodayRaid => ({
    day: '',
    dex: DARKRAI,
    shiny: true,
    areaId,
    caught,
    tries: 0,
  })
  const { own, foe } = useMemo(
    () => ({
      own: makeBattler({ uid: 'k-nm-own', dex: 448, level: 70, hp: 250 }, data),
      foe: {
        ...makeBattler({ uid: 'k-nm-foe', dex: DARKRAI, level: 70, hp: 600, shiny: true }, data),
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
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap gap-2 [&>*]:max-w-full [&>*]:whitespace-normal">
        <PixelButton size="sm" onClick={() => setPicker(true)}>
          Its pop-up: NPC partners (themed)
        </PixelButton>
        <PixelButton size="sm" onClick={() => setSweep((n) => (n ?? 0) + 1)}>
          A bar breaks: a shadow sweeps the stage
        </PixelButton>
        <PixelButton size="sm" onClick={() => setVignette((v) => !v)}>
          Screen vignette and the shadow over the page {vignette ? 'off' : 'on'}
        </PixelButton>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {/* The page, as Darkrai's raid page shows it (on the night, which here is a plain night box). */}
        <div className="nm-scope grid max-w-[560px] gap-3 bg-[#03040c] p-3">
          <NightmareRaidBanner className="-mx-3 -mt-3 h-[132px]">
            <div className="pixel-plate absolute left-2 top-2 z-[1] grid gap-0.5 px-2.5 pb-1.5 pt-1 leading-normal">
              <b className="text-[24px] font-normal leading-none">Legendary raid</b>
              <small className="font-pixel-sm text-[16px] leading-none text-muted">
                Newmoon Island · Haunted Hollow
              </small>
            </div>
          </NightmareRaidBanner>
          <RaidCard raid={card(false)} msLeft={null} kind="progress" nightmare />
          <div
            role="note"
            className="flex items-start gap-2.5 bg-gold-pale p-2.5 shadow-[inset_0_0_0_2px_#d99a1e]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center bg-paper shadow-ring-line" aria-hidden>
              <PixelIcon name="lock" size={18} />
            </span>
            <span className="grid gap-0.5 leading-tight">
              <b className="text-[19px] font-normal leading-none">
                Wake up from Newmoon Island&apos;s nightmare
              </b>
              <small className="font-pixel-sm text-[16px] text-ink">
                The lock, before the nightmare is over.
              </small>
            </span>
          </div>
          <PixelButton variant="primary" size="lg" className="sheen w-full" onClick={() => setPicker(true)}>
            Start
          </PixelButton>
          <RaidTeamSection nightmare />
          <BallOdds dex={DARKRAI} />
          <RaidCard raid={card(true)} msLeft={null} kind="progress" nightmare />
        </div>
        {/* The fight's stage: the night under the full moon, smoke rising off Darkrai's rock. */}
        <div className="nm-scope grid max-w-[560px] content-start gap-2 bg-[#03040c] p-3">
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
            label="Darkrai's raid stage"
            world="nightmare"
          >
            <StageShadow id={sweep} />
          </BattleStage>
          <p className="pixel-dialogue m-0 px-3 py-1.5 text-[20px]">
            The raid&apos;s message box, in the moonlit night.
          </p>
        </div>
      </div>
      {picker && (
        <RaidNpcPicker
          open
          offer={offer}
          need={2}
          group={[{ name: 'You', look: avatarOf(playerAvatarId(player)).src }]}
          level={70}
          onBack={() => setPicker(false)}
          onStart={() => setPicker(false)}
          nightmare={DARKRAI}
        />
      )}
      {vignette && <NightmareFx />}
    </div>
  )
}
