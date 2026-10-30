// Kitchen sink (dev only): hidden talents (docs/51) — the gem (a base talent, a super one, unknown; each size), the
// sheet's box (carried, known but not learnt, never met), the encounter's line (to learn, already learnt), the result
// cards (caught, passed, found evolving; Field Medic, Pickup), the battle log's lines, the trade toggle, and the rules
// (unlock and INFO).
import { useState, type ReactNode } from 'react'
import {
  TalentAfterWinCard,
  TalentBox,
  TalentFoundCard,
  TalentGem,
  TalentRulesModal,
  talentLogText,
  talentName,
} from '@/components/Talent'
import { InfoButton } from '@/components/RulesModal'
import { PixelButton } from '@/components/PixelButton'
import { Toggle } from '@/components/Toggle'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { TALENT_KEYS, type TalentKey } from '@/engine'

function Frame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-pixel-sm text-[16px] text-muted">{name}</span>
      {children}
    </div>
  )
}

export function TalentBits() {
  useT()
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const [withTalent, setWithTalent] = useState(true)
  const logs: { talent: TalentKey; amount?: number }[] = [
    { talent: 'leftovers', amount: 7 },
    { talent: 'opener', amount: 3 },
    { talent: 'mirror', amount: 6 },
    { talent: 'sturdy' },
    { talent: 'naturalCure' },
    { talent: 'thaw' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <Frame name="The gem · base · super · unknown, at 10, 12, 16 and 24">
        <div className="flex flex-wrap items-center gap-3 bg-paper p-2 shadow-ring-line">
          {[10, 12, 16, 24].map((size) => (
            <span key={size} className="flex items-center gap-1">
              <TalentGem talent="pickup" size={size} />
              <TalentGem talent="mirror" size={size} />
              <TalentGem talent="pickup" unknown size={size} />
            </span>
          ))}
        </div>
      </Frame>
      <Frame name="Every talent: its gem, name and text">
        <ul className="grid gap-1 sm:grid-cols-2">
          {TALENT_KEYS.map((k) => (
            <li key={k} className="max-w-md">
              <TalentBox talent={k} has known />
            </li>
          ))}
        </ul>
      </Frame>
      <div className="grid gap-3 sm:grid-cols-3">
        <Frame name="Sheet · carried">
          <TalentBox talent="leftovers" has known />
        </Frame>
        <Frame name="Sheet · known, not learnt">
          <TalentBox talent="pickup" has={false} known />
        </Frame>
        <Frame name="Sheet · never met">
          <TalentBox talent="pickup" has={false} known={false} />
        </Frame>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Frame name="Encounter · to learn">
          <p className="m-0 flex items-start gap-1.5 bg-gold-pale px-2 py-1 text-[17px] leading-tight shadow-ring-line">
            <TalentGem talent="pickup" size={16} className="mt-0.5" />
            <span>{t('ui.talent.preview.learn', { name: 'Rattata', talent: talentName('pickup') })}</span>
          </p>
        </Frame>
        <Frame name="Encounter · already learnt here">
          <p className="m-0 flex items-start gap-1.5 bg-gold-pale px-2 py-1 text-[17px] leading-tight shadow-ring-line">
            <TalentGem talent="mirror" size={16} className="mt-0.5" />
            <span>{t('ui.talent.preview.has', { name: 'Dratini', talent: talentName('mirror') })}</span>
          </p>
        </Frame>
      </div>
      <div className="grid max-w-xl gap-2">
        <Frame name="Result cards · caught · passed · found evolving">
          <TalentFoundCard uid="kit-a" dex={19} talent="pickup" how="caught" />
          <TalentFoundCard uid="kit-b" dex={20} talent="pickup" how="passed" />
          <TalentFoundCard uid="kit-c" dex={148} talent="mirror" how="evolved" />
        </Frame>
        <Frame name="After a win · Field Medic · Pickup">
          <TalentAfterWinCard uid="kit-d" dex={183} line={(name) => t('ui.talent.medic', { name, n: 12 })} />
          <TalentAfterWinCard
            uid="kit-e"
            dex={19}
            line={(name) => t('ui.talent.pickup', { name, item: 'Potion' })}
          />
        </Frame>
        <Frame name="Battle log lines">
          <ul className="grid gap-1 bg-paper p-2 shadow-ring-line">
            {logs.map((l) => (
              <li key={l.talent} className="flex items-center gap-1.5">
                <TalentGem talent={l.talent} />
                {talentLogText('Snorlax', l)}
              </li>
            ))}
          </ul>
        </Frame>
        <Frame name="Trades · asking for a species with its talent (on, off)">
          <Toggle
            label={t('ui.talent.trade.with')}
            hint={t('ui.talent.trade.withHint')}
            on={withTalent}
            onChange={setWithTalent}
          />
        </Frame>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PixelButton onClick={() => setRules('unlock')}>Rules · unlock</PixelButton>
        <InfoButton name={t('ui.talent.title')} onClick={() => setRules('info')} />
      </div>
      <TalentRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </div>
  )
}
