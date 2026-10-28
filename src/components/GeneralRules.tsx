// The General upgrades' rules (docs/15 §20, docs/25): the special events' pop-up, once when the tab opens to the
// player, then from the INFO button at the bottom of the tab. The numbers come from the config, so a rebalance shows
// up in the text.
import { charmChanceAt, charmOn, generalCfg, generalMax } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { countdown, money, oneInText } from '@/lib/format'
import { markGeneralRulesSeen } from '@/store/actions'
import { useGame } from '@/store/game'
import { closeOfflineReport, useOfflineReport } from '@/store/general'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesCard } from './RulesCard'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'

/** The Battle Frontier's plaza at sunset: the grand, golden end of the game. */
export const GENERAL_PICTURE: RulesPicture = { src: artUrl('frontier'), focus: '50% 45%' }

/** The Shiny Charm's row: its odds from level 0 (game_config's own) to the top level. */
function useCharmRow(): RuleRow {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return {
    icon: 'sparkle',
    title: t('ui.general.charm.name'),
    text: t('ui.rules.gen.charm.text', {
      base: oneInText(charmChanceAt(data, 0) || 1),
      best: oneInText(charmChanceAt(data, generalMax(data, 'charm')) || 1),
    }),
  }
}

export function useGeneralRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const cfg = generalCfg(data)
  const charm = useCharmRow()
  const first = <T,>(l: T[]) => l[0]
  const last = <T,>(l: T[]) => l[l.length - 1]
  return [
    {
      icon: 'ball',
      title: t('ui.general.luck.name'),
      text: t('ui.rules.gen.luck.text', {
        min: first(cfg.luck)?.chance ?? 0,
        max: last(cfg.luck)?.chance ?? 0,
      }),
    },
    {
      icon: 'moon',
      title: t('ui.general.offline.name'),
      text: t('ui.rules.gen.offline.text', {
        min: money(first(cfg.offline)?.perHour ?? 0),
        max: money(last(cfg.offline)?.perHour ?? 0),
        hours: cfg.offlineMaxHours,
      }),
    },
    {
      icon: 'sparkle',
      title: t('ui.general.rich.name'),
      text: t('ui.rules.gen.rich.text', { price: money(cfg.richCost) }),
    },
    // Its own switch: only while it's on for this player.
    ...(charmOn(data) ? [charm] : []),
    { icon: 'coin', title: t('ui.rules.gen.all.title'), text: t('ui.rules.gen.all.text') },
  ]
}

/** The Shiny Charm on its own, for a player who read the tab's rules before it was switched on. */
export function useCharmRules(): RuleRow[] {
  const { t } = useT()
  return [
    useCharmRow(),
    { icon: 'dex', title: t('ui.rules.charm.where.title'), text: t('ui.rules.charm.where.text') },
    { icon: 'coin', title: t('ui.rules.gen.all.title'), text: t('ui.rules.charm.all.text') },
  ]
}

/**
 * The General upgrades' rules where they apply (docs/43 §7): a card at the top of the Mart's General view until GOT
 * IT, the same rows as INFO's pop-up (the Shiny Charm's alone for one who read the rest before it came).
 */
export function GeneralRulesCard({ charmOnly = false }: { charmOnly?: boolean }) {
  const { t } = useT()
  const all = useGeneralRules()
  const charm = useCharmRules()
  return (
    <RulesCard
      title={t(charmOnly ? 'ui.general.charm.name' : 'ui.upgrades.tabGeneral')}
      icon={charmOnly ? 'sparkle' : 'navUpgrades'}
      rules={charmOnly ? charm : all}
      onDone={markGeneralRulesSeen}
    />
  )
}

export function GeneralRulesModal({
  open,
  onClose,
  onGo,
  charmOnly = false,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
  /** The Shiny Charm's pop-up alone (it came after the tab's rules were read). */
  charmOnly?: boolean
}) {
  const { t } = useT()
  const all = useGeneralRules()
  const charm = useCharmRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t(charmOnly ? 'ui.general.charm.name' : 'ui.upgrades.tabGeneral')}
      picture={GENERAL_PICTURE}
      icon="navUpgrades"
      rules={charmOnly ? charm : all}
      onGo={onGo}
    />
  )
}

/**
 * "While you were away": what an absence of an hour or more earned (less is a toast). It waits for a fight to end, and
 * takes its turn in the one-time pop-ups' queue (engine/popups.ts: what you came back to goes first). `show`: the
 * kitchen sink's, which has no queue.
 */
export function OfflineReportModal({ show }: { show?: boolean }) {
  const { t } = useT()
  const report = useOfflineReport((s) => s.report)
  const hours = useGame((s) => generalCfg(s.data).offlineMaxHours)
  const open = (useMyTurn('offline') || !!show) && !!report
  useOnScreen('offline', open)
  return (
    <Modal open={open} onClose={closeOfflineReport} title={t('ui.extreme.away.title')} className="max-w-md">
      {report && (
        <div className="flex flex-col gap-3">
          <p className="copy m-0 text-muted">{t('ui.extreme.away.for', { time: countdown(report.ms) })}</p>
          <div className="flex items-center justify-center gap-2.5 bg-cream px-3 pb-3.5 pt-3 shadow-card-warm">
            <PixelIcon name="coin" size={28} />
            <b className="text-[32px] font-normal leading-none tabular-nums">+{money(report.gold)}</b>
          </div>
          <p className="copy m-0 text-[17px] text-muted">
            {t('ui.general.offline.rule', { rate: money(report.perHour), hours })}
          </p>
          <PixelButton variant="primary" onClick={closeOfflineReport}>
            {t('ui.common.ok')}
          </PixelButton>
        </div>
      )}
    </Modal>
  )
}
