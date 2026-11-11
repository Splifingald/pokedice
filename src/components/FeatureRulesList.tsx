// How to play's last section (the user's ask, 2026-11-02): every game feature with rules of its own, as a button that
// opens them. The rules pop-ups that used to open by themselves are gone, so this is where a player finds them all.
// A feature shows only while its switch is on for the player; nothing in the list decides a rule.
import { useState, type ReactElement } from 'react'
import {
  areaVersusOn,
  dayNightOn,
  EVENT_IDS,
  eventOn,
  extremeOn,
  friendBattlesOn,
  friendshipOn,
  galarWeatherOn,
  generalOn,
  giftOn,
  giftsOn,
  hoennWeatherOn,
  idleModeOn,
  inviteRewardsOn,
  looksOn,
  outfitsOn,
  siteMoveOn,
  POWER_KINDS,
  powerRulesOn,
  talentsOn,
  tradesOn,
  trickOn,
  unownDexOn,
  versusLeagueFor,
  type GameData,
  type PowerKind,
  type SaveData,
} from '@/engine'
import { useT } from '@/i18n/react'
import { EVENT_ICON, EventRulesModal } from '@/screens/events/shared'
import { useGame } from '@/store/game'
import { AreaVersusRulesModal } from './AreaVersus'
import { DayNightRulesModal } from './DayNight'
import { DevGiftRulesModal } from './DevGiftRules'
import { ExtremeRulesModal } from './Extreme'
import { DayCareRulesModal, VersusRulesModal } from './FeatureRules'
import { FriendshipRulesModal } from './friends/Friendship'
import { FriendBattleRulesModal } from './pvp/FriendBattleBits'
import { InviteRulesModal } from './friends/InviteRewards'
import { GeneralRulesModal } from './GeneralRules'
import { GiftRulesModal as GiftCardRulesModal } from './GiftCard'
import { PixelIcon, type IconName } from './icons'
import { IdleRulesModal } from './IdleMode'
import { OutfitRulesModal } from './Outfit'
import { PowerRulesModal } from './PowersRules'
import { ShinyDexRulesModal } from './ShinyDexRules'
import { MovedRulesModal } from './SiteMove'
import { TalentRulesModal } from './Talent'
import { TradesRulesModal } from './trades/TradeRules'
import { LooksRulesModal } from './TrainerLooks'
import { TrickRulesModal } from './TrickOrTreat'
import { UnownDexRulesModal } from './UnownDex'
import { WeatherRulesModal } from './Weather'

type Close = { open: boolean; onClose: () => void }

interface Feature {
  id: string
  /** The button's name: the rules pop-up's own title. */
  name: string
  icon: IconName
  on: boolean
  rules: (p: Close) => ReactElement
}

const POWER_TITLE: Record<PowerKind, string> = {
  mega: 'ui.powers.mega.title',
  gmax: 'ui.powers.gmax.title',
  z: 'ui.powers.z.title',
}

function useFeatures(save: SaveData, data: GameData): Feature[] {
  const { t } = useT()
  const league = versusLeagueFor(save, data)
  return [
    {
      id: 'dayCare',
      name: t('ui.home.dayCare'),
      icon: 'heart',
      on: true,
      rules: (p) => <DayCareRulesModal {...p} />,
    },
    {
      id: 'versus',
      name: t(league ? 'ui.league.title' : 'ui.versus.title'),
      icon: 'vs',
      on: true,
      rules: (p) => <VersusRulesModal {...p} />,
    },
    {
      id: 'areaVersus',
      name: t('ui.areaVersus.rulesTitle'),
      icon: 'user',
      on: areaVersusOn(data),
      rules: (p) => <AreaVersusRulesModal {...p} />,
    },
    {
      id: 'talents',
      name: t('ui.talent.title'),
      icon: 'talent',
      on: talentsOn(data),
      rules: (p) => <TalentRulesModal {...p} />,
    },
    ...POWER_KINDS.map((kind): Feature => ({
      id: `power-${kind}`,
      name: t(POWER_TITLE[kind]),
      icon: kind === 'z' ? 'sword' : 'up',
      on: powerRulesOn(data, kind),
      rules: (p) => <PowerRulesModal kind={kind} {...p} />,
    })),
    {
      id: 'general',
      name: t('ui.upgrades.tabGeneral'),
      icon: 'navUpgrades',
      on: generalOn(data),
      rules: (p) => <GeneralRulesModal {...p} />,
    },
    {
      id: 'shinyDex',
      name: t('ui.dex.shinyTitle'),
      icon: 'sparkle',
      on: true,
      rules: (p) => <ShinyDexRulesModal {...p} />,
    },
    {
      id: 'unownDex',
      name: t('ui.unown.title'),
      icon: 'navDex',
      on: unownDexOn(data),
      rules: (p) => <UnownDexRulesModal {...p} />,
    },
    ...EVENT_IDS.map((id): Feature => ({
      id: `event-${id}`,
      name: t(`ui.events.${id}.name`),
      icon: EVENT_ICON[id],
      on: eventOn(data, id),
      rules: (p) => <EventRulesModal id={id} {...p} />,
    })),
    {
      id: 'trades',
      name: t('ui.trades.title'),
      icon: 'trade',
      on: tradesOn(data),
      rules: (p) => <TradesRulesModal {...p} />,
    },
    {
      id: 'friendship',
      name: t('ui.fship.title'),
      icon: 'heart',
      on: friendshipOn(data),
      rules: (p) => <FriendshipRulesModal {...p} />,
    },
    {
      id: 'friendBattles',
      name: t('ui.pvp.title'),
      icon: 'vs',
      on: friendBattlesOn(data),
      rules: (p) => <FriendBattleRulesModal {...p} />,
    },
    {
      id: 'invites',
      name: t('ui.invite.title'),
      icon: 'gift',
      on: inviteRewardsOn(data),
      rules: (p) => <InviteRulesModal {...p} />,
    },
    {
      id: 'gifts',
      name: t('ui.rules.gift.title'),
      icon: 'gift',
      on: giftsOn(data),
      rules: (p) => <DevGiftRulesModal {...p} />,
    },
    {
      id: 'giftCard',
      name: t('ui.giftCard.title'),
      icon: 'gift',
      on: giftOn(data),
      rules: (p) => <GiftCardRulesModal {...p} />,
    },
    {
      id: 'outfits',
      name: t('ui.outfit.title'),
      icon: 'gift',
      on: outfitsOn(data),
      rules: (p) => <OutfitRulesModal {...p} />,
    },
    {
      id: 'looks',
      name: t('ui.looks.title'),
      icon: 'user',
      on: looksOn(data),
      rules: (p) => <LooksRulesModal {...p} />,
    },
    {
      id: 'dayNight',
      name: t('ui.dayNight.title'),
      icon: 'nightMoon',
      on: dayNightOn(data),
      rules: (p) => <DayNightRulesModal {...p} />,
    },
    {
      id: 'weatherHoenn',
      name: t('ui.weather.titleHoenn'),
      icon: 'weatherRain',
      on: hoennWeatherOn(data),
      rules: (p) => <WeatherRulesModal region="hoenn" {...p} />,
    },
    {
      id: 'weatherGalar',
      name: t('ui.weather.titleGalar'),
      icon: 'weatherRain',
      on: galarWeatherOn(data),
      rules: (p) => <WeatherRulesModal region="galar" {...p} />,
    },
    {
      id: 'trick',
      name: t('ui.trick.title'),
      icon: 'pumpkin',
      on: trickOn(data),
      rules: (p) => <TrickRulesModal {...p} />,
    },
    {
      id: 'idle',
      name: t('ui.playStyle.idle'),
      icon: 'dice',
      on: idleModeOn(data),
      rules: (p) => <IdleRulesModal {...p} />,
    },
    {
      id: 'extreme',
      name: t('ui.extreme.name'),
      icon: 'skull',
      on: extremeOn(data),
      rules: (p) => <ExtremeRulesModal {...p} />,
    },
    {
      id: 'siteMove',
      name: t('ui.move.title'),
      icon: 'map',
      on: siteMoveOn(data),
      rules: (p) => <MovedRulesModal {...p} />,
    },
  ]
}

/** The list: a button per feature that's on, each opening its rules (OK). Only in a game: some rules read the save. */
export function FeatureRulesList() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  if (!save) return null
  return (
    <FeatureButtons save={save} data={data} title={t('ui.help.features')} hint={t('ui.help.featuresHint')} />
  )
}

function FeatureButtons({
  save,
  data,
  title,
  hint,
}: {
  save: SaveData
  data: GameData
  title: string
  hint: string
}) {
  const features = useFeatures(save, data).filter((f) => f.on)
  const [open, setOpen] = useState<string | null>(null)
  const shown = features.find((f) => f.id === open)
  return (
    <section aria-labelledby="help-features" className="flex flex-col gap-3">
      <h2 id="help-features" className="text-[34px] leading-none">
        {title}
      </h2>
      <p className="m-0 text-[20px] leading-tight text-muted">{hint}</p>
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
        {features.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setOpen(f.id)}
              className="flex min-h-[52px] w-full items-center gap-2.5 bg-paper px-3 py-1.5 text-left text-[24px] leading-none shadow-card hover:shadow-card-gold focus-visible:shadow-card-gold"
            >
              <PixelIcon name={f.icon} size={20} className="shrink-0" />
              <span className="min-w-0 flex-1">{f.name}</span>
              <span aria-hidden className="text-[18px] text-muted">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown?.rules({ open: true, onClose: () => setOpen(null) })}
    </section>
  )
}
