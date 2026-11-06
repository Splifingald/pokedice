// Kitchen sink: the events' and onboarding's pieces from the deep pass (docs/43 §5.10, §5.11) — the stage-and-panel
// shape every event page uses, the wheel's tickets, the quiet INFO, an event's rules card, How to play's folded rules
// and the type chart's two views.
import { Chip } from '@/components/Chip'
import { PixelButton } from '@/components/PixelButton'
import { InfoButton } from '@/components/RulesModal'
import { HelpContent } from '@/screens/Help'
import { TypesContent } from '@/screens/Types'
import { StagePanel } from '@/screens/events/layout'
import { TicketsMeter } from '@/screens/events/WheelPage'
import { EventRules, eventRuleRows } from '@/screens/events/shared'
import { RulesCard } from '@/components/RulesCard'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'

export function EventsDeepBits() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <div className="flex w-full flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] font-normal">StagePanel (phone: stacked, dock pinned · from 1024 px: docked)</h3>
        <div className="bg-parchment p-3 shadow-ring-line">
          <StagePanel
            head={<div className="bg-night p-3 text-[22px] text-panel">The event's banner</div>}
            stage={<div className="grid h-48 place-items-center bg-well text-[20px] shadow-card">The stage</div>}
            panel={<div className="bg-paper p-3 text-[18px] shadow-card">What a player reads to act</div>}
            dock={
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <PixelButton variant="primary" size="lg">
                  The one action
                </PixelButton>
                <InfoButton compact name="the demo" onClick={() => undefined} />
              </div>
            }
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] font-normal">TicketsMeter (none, some, full, connecting)</h3>
        <div className="flex flex-wrap gap-3">
          {[0, 2, 4].map((n) => (
            <Chip key={n} tone="dark" className="gap-1.5 text-[17px]">
              <TicketsMeter held={n} cap={4} known />
            </Chip>
          ))}
          <Chip tone="dark" className="text-[17px]">
            <TicketsMeter held={0} cap={4} known={false} />
          </Chip>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] font-normal">INFO (full width, compact)</h3>
        <InfoButton name="Fortune Wheel" onClick={() => undefined} />
        <InfoButton compact name="Fortune Wheel" onClick={() => undefined} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] font-normal">An event's rules: the card at the top of its page, the rows</h3>
        <RulesCard
          title={t('ui.events.raid.name')}
          icon="star"
          rules={eventRuleRows('raid', data, t)}
          onDone={() => undefined}
        />
        <EventRules id="rebattle" data={data} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] font-normal">How to play: the cards, the folded rules (tap one)</h3>
        <div className="pixel-panel p-3">
          <HelpContent columns />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[22px] font-normal">The type chart: Pick a type · Type chart</h3>
        <div className="pixel-panel max-w-3xl p-3">
          <TypesContent />
        </div>
      </section>
    </div>
  )
}
