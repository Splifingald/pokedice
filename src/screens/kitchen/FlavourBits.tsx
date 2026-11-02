// Kitchen sink (dev only): the region flavours (docs/62) — every weather's chip, its recap factor and its fall over a
// stage; Castform's forms; a horde's banner, an island trial's card, a Titan's card (Klawf's, and Dondozo's with Tatsugiri); a Totem's and
// a Titan's aura; the fights' lines; each one's rules.
import { useState, type ReactNode } from 'react'
import { WEATHER_KINDS, type Encounter, type RegionId, type Weather } from '@/engine'
import { useT } from '@/i18n/react'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { WeatherBoostChip, WeatherChip, WeatherLayer, WeatherRulesModal, weatherNameKey } from '@/components/Weather'
import { FlavourRulesModal, HordeBanner, TitanCard, TrialCard } from '@/screens/area/FlavourCards'
import { StageBackground } from '@/screens/battle/BattleStage'

function Stage({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid w-full max-w-[390px] gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      <div className="relative isolate aspect-[3/2] overflow-hidden shadow-ledge">
        <StageBackground art={null} zones={false} />
        {children}
      </div>
    </div>
  )
}

const HORDE: Extract<Encounter, { kind: 'wild' }> = {
  kind: 'wild',
  dex: 16,
  level: 9,
  isNew: false,
  horde: [
    { dex: 16, level: 9, isNew: false },
    { dex: 16, level: 8, isNew: false, shiny: true },
    { dex: 16, level: 9, isNew: false },
    { dex: 661, level: 8, isNew: true },
  ],
}

const TRIAL: Extract<Encounter, { kind: 'gym' }> = {
  kind: 'gym',
  trainerId: '4f91ae65-c2ed-5625-8493-cc888560e844',
  name: 'Captain Ilima',
  spriteUrl: '/trainers/classes/alola/ilima.png',
  team: [
    { dex: 735, level: 12 },
    { dex: 734, level: 10 },
    { dex: 734, level: 10 },
  ],
  role: 'leader',
  badge: 'Normalium Z',
  index: 1,
  total: 1,
  trial: 'trial-verdant-cavern',
}

export function FlavourBits() {
  const { t } = useT()
  const [rules, setRules] = useState<'hoenn' | 'galar' | 'hordes' | 'trials' | 'titans' | null>(null)
  const falls: Weather[] = ['rain', 'thunderstorm', 'sun', 'sand', 'snow', 'fog', 'ash', 'overcast']
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {WEATHER_KINDS.map((w) => (
          <span key={w} className="flex items-center gap-1.5 font-pixel-sm text-[16px]">
            <WeatherChip weather={w} size={18} />
            {t(weatherNameKey(w))}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 font-pixel-sm text-[18px]">
        <span>Recap:</span>
        <WeatherBoostChip kind="rain" n={1.25} />
        <WeatherBoostChip kind="rain" n={0.75} />
        <WeatherBoostChip kind="sun" n={1.25} />
        <WeatherBoostChip kind="thunderstorm" n={1.25} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {falls.map((w) => (
          <Stage key={w} name={`On the stage: ${t(weatherNameKey(w))}`}>
            <WeatherLayer weather={w} />
            <span className="absolute left-1 top-1 z-30 leading-[0]">
              <WeatherChip weather={w} size={14} />
            </span>
          </Stage>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {/* Castform's Forecast (docs/62 §3): the form each weather brings. */}
        {(
          [
            [351, null],
            [10013, 'sun'],
            [10014, 'rain'],
            [10015, 'snow'],
          ] as const
        ).map(([dex, w]) => (
          <span key={dex} className="flex flex-col items-center gap-1 font-pixel-sm text-[16px]">
            <SpriteImg dex={dex} size={72} />
            <span className="flex items-center gap-1">
              {w && <WeatherChip weather={w} size={12} />}
              {w ? t(weatherNameKey(w)) : 'Castform'}
            </span>
          </span>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Stage name="A Totem's aura (Gumshoos), a Titan's (Klawf)">
          <span className="foe-aura-totem absolute left-[12%] top-[18%] z-10" style={{ transform: 'scale(1.3)' }}>
            <SpriteImg dex={735} size={96} />
          </span>
          <span className="foe-aura-titan absolute right-[10%] top-[10%] z-10" style={{ transform: 'scale(1.55)' }}>
            <SpriteImg dex={950} size={96} />
          </span>
        </Stage>
        <div className="flex flex-col gap-1.5">
          {[
            t('ui.log.startHorde', { foe: 'Pidgey', go: t('ui.log.goPair', { a: 'Froakie', b: 'Fennekin' }) }),
            t('ui.log.hordeNext', { name: 'Fletchling' }),
            t('ui.log.startTotem', { foe: 'Gumshoos', go: t('ui.log.goName', { name: 'Litten' }) }),
            t('ui.log.sos', { name: 'Gumshoos', ally: 'Yungoos' }),
            t('ui.log.allyFled', { name: 'Yungoos' }),
            t('ui.log.startTitan', { foe: 'Klawf', go: t('ui.log.goName', { name: 'Sprigatito' }) }),
            t('ui.log.titanRise', { name: 'Klawf' }),
            t('ui.log.titanCommander', { name: 'Dondozo' }),
            t('ui.raid.x.tick.sand', { name: 'Kirlia' }),
            t('ui.raid.x.tick.snow', { name: 'Charizard' }),
          ].map((line) => (
            <p key={line} className="pixel-dialogue m-0 px-3 py-1.5 text-[18px] leading-[1.15]">
              {line}
            </p>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <div className="pixel-panel p-3">
          <HordeBanner enc={HORDE} auto={false} />
        </div>
        <div className="pixel-panel-dark p-3">
          <TrialCard enc={TRIAL} auto={false} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="pixel-panel-dark p-3">
            <TitanCard enc={{ kind: 'boss', dex: 950, level: 16, titan: true }} boss={{ dex: 950, level: 16, titan: {} }} auto={false} />
          </div>
          <div className="pixel-panel-dark p-3">
            <TitanCard
              enc={{ kind: 'boss', dex: 977, level: 56, titan: true }}
              boss={{ dex: 977, level: 56, titan: { partner: { dex: 978, level: 57 } } }}
              auto={false}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['hoenn', 'galar', 'hordes', 'trials', 'titans'] as const).map((k) => (
          <PixelButton key={k} size="sm" onClick={() => setRules(k)}>
            Rules: {k}
          </PixelButton>
        ))}
      </div>
      {(rules === 'hoenn' || rules === 'galar') && (
        <WeatherRulesModal open region={rules as RegionId} onClose={() => setRules(null)} />
      )}
      {(rules === 'hordes' || rules === 'trials' || rules === 'titans') && (
        <FlavourRulesModal open flavour={rules} onClose={() => setRules(null)} />
      )}
    </div>
  )
}
