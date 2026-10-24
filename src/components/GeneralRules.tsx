// The General upgrades' rules (docs/15 §20, docs/25): the special events' pop-up, once when the tab opens to the
// player, then from the INFO button at the bottom of the tab. The numbers come from the config, so a rebalance shows
// up in the text.
import { useNavigate } from 'react-router-dom'
import { generalCfg } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { countdown, money } from '@/lib/format'
import { markGeneralRulesSeen } from '@/store/actions'
import { useGame } from '@/store/game'
import { closeOfflineReport, useOfflineReport } from '@/store/general'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RulesModal, type RuleRow, type RulesPicture } from './RulesModal'

/** The Battle Frontier's plaza at sunset: the grand, golden end of the game. */
export const GENERAL_PICTURE: RulesPicture = { src: artUrl('frontier'), focus: '50% 45%' }

export function useGeneralRules(): RuleRow[] {
  const { t } = useT()
  const cfg = generalCfg(useGame((s) => s.data))
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
    { icon: 'coin', title: t('ui.rules.gen.all.title'), text: t('ui.rules.gen.all.text') },
  ]
}

export function GeneralRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useGeneralRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.upgrades.tabGeneral')}
      picture={GENERAL_PICTURE}
      icon="navUpgrades"
      rules={rules}
      onGo={onGo}
    />
  )
}

/**
 * The General tab has opened (the admin's switch, a first badge): once, between fights, its rules and a button straight
 * to it. It takes its turn in the one-time pop-ups' queue (engine/popups.ts), never on the Upgrades page.
 */
export function GeneralUnlockPopup() {
  const navigate = useNavigate()
  const open = useMyTurn('general')
  useOnScreen('general', open)
  return (
    <GeneralRulesModal
      open={open}
      onClose={markGeneralRulesSeen}
      onGo={() => {
        markGeneralRulesSeen()
        navigate('/upgrades?tab=general')
      }}
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
    <Modal
      open={open}
      onClose={closeOfflineReport}
      title={t('ui.extreme.away.title')}
      className="max-w-md"
    >
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
