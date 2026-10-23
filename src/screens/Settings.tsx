import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SupportModal } from '@/components/SupportModal'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { PushSettingsPanel } from '@/components/PushSettings'
import { PixelButton } from '@/components/PixelButton'
import { Seg } from '@/components/Segmented'
import { Toggle } from '@/components/Toggle'
import { donationEnabled, extremeOpen, isExtreme, missesTrades } from '@/engine'
import { LANG_LABELS, LANGS, type Lang } from '@/i18n'
import { multiExpText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, setSettings, useGame } from '@/store/game'
import { deleteSave, replaceSave } from '@/store/run'
import { useIsAdmin, useLockReason, useNavLock } from '@/store/hooks'
import { checkContent, deleteAllData, deleteExtremeSave, providerName } from '@/store/sync'
import { otherSave } from '@/store/extreme'
import { ExtremeRulesModal } from '@/components/Extreme'
import { PlayStylePanel } from '@/components/IdleMode'
import { AccountButton, ConnectedAccounts, DisconnectButton } from '@/components/AccountButton'
import { SaveFacts } from '@/components/SaveFacts'
import { backupSave, readBackups, soundOn } from '@/save/storage'
import { cx } from '@/theme/util'

export function SettingsScreen() {
  return <SettingsContent />
}

/**
 * Settings opened over the page under a lock (docs/15 §12): mid-fight, or in a portal run, the trainer menu opens them
 * here rather than on their route. The battle stays mounted under it, so closing lands back in the very same fight
 * (its animator, its log, its entrance already played), and the fight waits while it is open (BattleView `covered`).
 * What would end the fight stays listed, shut with the reason. `shut`/`fight`: the kitchen sink's, to show the lock
 * without a fight.
 */
export function SettingsOverlay({
  open,
  onClose,
  shut,
  fight,
}: {
  open: boolean
  onClose: () => void
  shut?: string | null
  fight?: boolean
}) {
  const { t } = useT()
  const inFight = useNavLock() === 'fight'
  const midFight = fight ?? inFight
  return (
    <Modal open={open} onClose={onClose} title={t('ui.settings.title')} className="max-w-2xl pb-0">
      {midFight && <p className="copy mb-3 mt-0 text-muted">{t('ui.settings.midFight')}</p>}
      <SettingsContent over shut={shut} />
      {/* The way back stays in reach however far down the settings go. */}
      <div className="sticky bottom-0 -mx-4 mt-4 bg-panel px-4 pb-4 pt-3 shadow-[0_-2px_0_rgb(var(--c-edge))]">
        <PixelButton variant="primary" className="w-full" onClick={onClose}>
          {t(midFight ? 'ui.settings.backToFight' : 'ui.common.back')}
        </PixelButton>
      </div>
    </Modal>
  )
}

/**
 * Everything Settings holds, on its route or over the page (`over`: the dialog's title names it, no page heading).
 * Under a lock (`shut`, by default `useLockReason`: a fight under way, a portal run), what would end the fight or
 * leave the page is shut and says why — signing in or out, linking an account, deleting a save, restoring a backup,
 * new content, the deploy guide — and the rest (sound, animations, theme, play style, notifications, language, copying
 * the save, the rules) works as ever.
 */
function SettingsContent({ over = false, shut }: { over?: boolean; shut?: string | null }) {
  const { t } = useT()
  const lock = useLockReason()
  const why = shut === undefined ? lock : shut
  const settings = useGame((s) => s.settings)
  const save = useGame((s) => s.save)
  const auth = useGame((s) => s.auth)
  const isAdmin = useIsAdmin()
  const data = useGame((s) => s.data)
  const source = useGame((s) => s.contentSource)
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Only when the admin has it switched on, with a PayPal link.
  const canDonate = donationEnabled(data)
  const [donating, setDonating] = useState(false)

  const copySave = async () => {
    if (!save) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(save))
      pushToast(t('ui.settings.copied'), 'good')
    } catch {
      pushToast(t('ui.settings.clipboardOff'), 'bad')
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {!over ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[32px] leading-none">{t('ui.settings.title')}</h1>
          {canDonate && (
            <PixelButton variant="primary" size="sm" onClick={() => setDonating(true)}>
              {t('ui.support.button')}
            </PixelButton>
          )}
        </div>
      ) : (
        // Over the fight its red is BACK TO THE FIGHT's: SUPPORT ME goes white.
        canDonate && (
          <div className="flex justify-end">
            <PixelButton size="sm" onClick={() => setDonating(true)}>
              {t('ui.support.button')}
            </PixelButton>
          </div>
        )
      )}

      <Panel title={t('ui.settings.game')}>
        <Toggle
          label={t('ui.settings.sound')}
          hint={t('ui.settings.soundHint')}
          on={soundOn(settings)}
          onChange={(v) => setSettings({ sound: v, sfx: v })}
        />
        <Toggle
          label={t('ui.settings.multiExp')}
          hint={
            data.config.multiExpShare > 0
              ? t('ui.settings.multiExpHint', { share: multiExpText(data) })
              : t('ui.settings.multiExpOff')
          }
          on={settings.multiExp}
          onChange={(v) => setSettings({ multiExp: v })}
        />
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xl">{t('ui.settings.animations')}</span>
            <Seg
              label={t('ui.settings.animations')}
              value={settings.animations ?? 'full'}
              onChange={(v) => setSettings({ animations: v })}
              options={[
                { id: 'full', label: t('ui.settings.animFull') },
                { id: 'short', label: t('ui.settings.animShort') },
              ]}
              className="min-w-[12rem]"
            />
          </div>
          <span className="copy block text-muted">{t('ui.settings.animationsHint')}</span>
        </div>
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xl">{t('ui.settings.theme')}</span>
            <Seg
              label={t('ui.settings.theme')}
              value={settings.theme ?? 'light'}
              onChange={(v) => setSettings({ theme: v })}
              options={[
                { id: 'light', label: t('ui.settings.themeLight') },
                { id: 'dark', label: t('ui.settings.themeDark') },
                { id: 'auto', label: t('ui.settings.themeAuto') },
              ]}
              className="min-w-[15rem]"
            />
          </div>
          <span className="copy block text-muted">{t('ui.settings.themeHint')}</span>
        </div>
        {/* No animations: admins only — but a player who already turned it on still sees it, so they can turn it off. */}
        {(isAdmin || settings.reducedMotion) && (
          <Toggle
            label={t('ui.settings.reducedMotion')}
            hint={t('ui.settings.reducedMotionHint')}
            on={settings.reducedMotion}
            onChange={(v) => setSettings({ reducedMotion: v })}
          />
        )}
      </Panel>

      {/* Idle mode and the play styles (docs/36): switched any time. */}
      <PlayStylePanel />

      <PushSettingsPanel />

      <LanguagePanel />

      <Panel title={t('ui.settings.cloud')}>
        {!isSupabaseConfigured || auth.status === 'unavailable' ? (
          <p className="copy text-muted">
            {t('ui.settings.cloudOff')} <SetupLink shut={why}>{t('ui.settings.cloudHow')}</SetupLink>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="copy">
                {auth.status !== 'signed_in'
                  ? t('ui.settings.cloudConnect')
                  : auth.provider
                    ? t('ui.account.signedInWith', {
                        provider: providerName(auth.provider),
                        who: auth.email ?? t('ui.settings.yourGoogle'),
                      })
                    : t('ui.settings.cloudOn', { who: auth.email ?? t('ui.settings.yourGoogle') })}
              </span>
              {/* Signing in may load the cloud's save over this one; out, the save stops going there; linking leaves
                  the page: none of it mid-fight. */}
              {auth.status === 'signed_in' ? (
                <DisconnectButton size="sm" shut={why} />
              ) : (
                <AccountButton size="sm" shut={why} />
              )}
            </div>
            <ConnectedAccounts shut={why} />
          </div>
        )}
      </Panel>

      <Panel title={t('ui.settings.saveFile')}>
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xl">{t('ui.settings.saveAdvanced')}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <PixelButton size="sm" onClick={() => void copySave()} disabled={!save}>
            {t('ui.settings.copySave')}
          </PixelButton>
          <PixelButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={!save} shut={why}>
            {t('ui.settings.deleteSave')}
          </PixelButton>
        </div>
        {/* No import here: the cloud save is what the trade server reads, so a pasted save would be a cheat that
            reaches other players (docs/23). Admins keep theirs in Dev Tools. */}
        </details>
      </Panel>

      <ExtremePanel shut={why} />

      {/* Restoring a backup rewrites the cloud save the trade server reads, like an import: admins only (docs/23). */}
      {isAdmin && <BackupsPanel shut={why} />}

      <Panel title={t('ui.settings.content')}>
        <p className="text-lg">
          {t('ui.settings.gameData', {
            source: t(source === 'remote' ? 'ui.settings.sourceLive' : 'ui.settings.sourceBundled'),
            version: data.config.configVersion,
          })}
        </p>
        {/* New content swaps the game's data under the fight (an area, a species may go): after it. */}
        <PixelButton size="sm" className="mt-1" onClick={() => void checkContent()} shut={why}>
          {t('ui.settings.checkUpdates')}
        </PixelButton>
      </Panel>

      <p className="copy text-muted">
        {t('ui.settings.legal')} <SetupLink shut={why}>{t('ui.title.deployGuide')}</SetupLink>
      </p>

      {/* The bottom of the settings is where a disconnect belongs: out of the way, never a mis-tap. */}
      {auth.status === 'signed_in' && (
        <div className="flex justify-center">
          <DisconnectButton shut={why} />
        </div>
      )}

      <DeleteData shut={why} />

      <SupportModal open={donating} onClose={() => setDonating(false)} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('ui.settings.deleteTitle')}>
        <p className="copy mb-4 text-lg">
          {t('ui.settings.deleteBody', { cloud: auth.status === 'signed_in' ? t('ui.settings.deleteCloudNote') : '' })}
        </p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirmDelete(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton
            variant="danger"
            onClick={() => {
              deleteSave()
              navigate('/')
            }}
          >
            {t('ui.settings.delete')}
          </PixelButton>
        </div>
      </Modal>
    </div>
  )
}

/**
 * The red button at the very bottom: everything the game keeps about the player, in this browser and online, deleted
 * (both saves, docs/22). Two pop-ups in a row so it is never a mis-tap: what goes, then a last "really?". Then the
 * title screen, from scratch. `extreme`: the Extreme save only, from its own section.
 */
function DeleteData({ scope = 'all', shut }: { scope?: 'all' | 'extreme'; shut?: string | null }) {
  const { t } = useT()
  const online = useGame((s) => s.auth.status === 'signed_in')
  const playingExtreme = useGame((s) => isExtreme(s.save))
  const hasExtreme = playingExtreme || isExtreme(otherSave())
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [busy, setBusy] = useState(false)
  const all = scope === 'all'
  const close = () => {
    if (!busy) setStep(0)
  }
  const wipe = async () => {
    setBusy(true)
    // A reload, not a navigation: the stores still hold the old save, friends and events in memory.
    if (await (all ? deleteAllData() : deleteExtremeSave())) return window.location.assign('/')
    setBusy(false)
    setStep(0)
    pushToast(t('ui.settings.wipeFailed'), 'bad')
  }
  const body = all
    ? [t(online ? 'ui.settings.wipeBodyOnline' : 'ui.settings.wipeBodyLocal'), hasExtreme ? t('ui.settings.wipeBothNote') : '']
        .filter(Boolean)
        .join(' ')
    : t('ui.extreme.settings.deleteBody')
  return (
    <div className={all ? 'flex justify-center' : 'flex'}>
      {/* Full width on phones, so a long translation shrinks to fit instead of pushing the page sideways. */}
      <PixelButton
        variant="danger"
        size={all ? 'md' : 'sm'}
        className={all ? 'w-full sm:w-auto' : undefined}
        onClick={() => setStep(1)}
        shut={shut}
      >
        {t(all ? 'ui.settings.wipe' : 'ui.extreme.settings.delete')}
      </PixelButton>

      <Modal open={step === 1} onClose={close} title={t(all ? 'ui.settings.wipeTitle' : 'ui.extreme.settings.deleteTitle')}>
        <p className="copy mb-4 text-lg">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" onClick={() => setStep(2)}>
            {t('ui.common.continue')}
          </PixelButton>
        </div>
      </Modal>

      <Modal open={step === 2} onClose={close} dismissable={!busy} title={t('ui.settings.wipeSureTitle')}>
        <p className="copy mb-4 text-lg">{t('ui.settings.wipeSureBody')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <PixelButton onClick={close} disabled={busy}>
            {t('ui.common.cancel')}
          </PixelButton>
          <PixelButton variant="danger" onClick={() => void wipe()} disabled={busy}>
            {t(busy ? 'ui.settings.wiping' : 'ui.settings.wipeConfirm')}
          </PixelButton>
        </div>
      </Modal>
    </div>
  )
}

/** Extreme mode (docs/22): what it is, its rules, and deleting its save. Once it's open, or a save of it exists. */
function ExtremePanel({ shut }: { shut?: string | null }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState(false)
  const extreme = isExtreme(save)
  const other = otherSave()
  const hasSave = extreme || isExtreme(other)
  if (!extreme && !hasSave && !extremeOpen(save, data)) return null
  return (
    <Panel title={t('ui.extreme.name')}>
      <p className="copy text-muted">{t('ui.extreme.settings.hint')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules(true)} aria-label={t('ui.extreme.infoLabel')}>
          {t('ui.extreme.settings.rules')}
        </PixelButton>
        {hasSave && <DeleteData scope="extreme" shut={shut} />}
      </div>
      <ExtremeRulesModal open={rules} onClose={() => setRules(false)} />
    </Panel>
  )
}

/** Saves replaced by a cloud sync (or a restore) on this device — a wrong choice can be undone here. */
function BackupsPanel({ shut }: { shut?: string | null }) {
  const { t } = useT()
  const current = useGame((s) => s.save)
  const [list, setList] = useState(() => readBackups())
  const [confirm, setConfirm] = useState<number | null>(null)
  if (!list.length) return null
  return (
    <Panel title={t('ui.settings.backups')}>
      <p className="copy mb-2 text-muted">{t('ui.settings.backupsHint')}</p>
      <ul className="flex flex-col gap-2">
        {list.map((b) => {
          // Going back to before a trade would give back the Pokémon traded away: a duplicate (docs/23).
          const traded = !!current && missesTrades(b.save, current)
          return (
            <li key={b.at} className="flex flex-wrap items-center gap-3 bg-paper p-2 shadow-ring">
              <div className="min-w-0 flex-1">
                <div className="text-lg leading-tight">{b.reason}</div>
                <div className="text-base text-muted">{t('ui.settings.setAside', { when: new Date(b.at).toLocaleString() })}</div>
                <SaveFacts save={b.save} />
                {traded && <div className="copy text-muted">{t('ui.settings.restoreTraded')}</div>}
              </div>
              <PixelButton
                size="sm"
                variant={confirm === b.at ? 'danger' : 'secondary'}
                disabled={traded}
                shut={shut}
                onClick={() => {
                  if (confirm !== b.at) return setConfirm(b.at)
                  if (current) backupSave(current, t('ui.settings.beforeRestore'))
                  replaceSave({ ...b.save, updatedAt: Date.now() })
                  setConfirm(null)
                  setList(readBackups())
                  pushToast(t('ui.settings.restored'), 'good')
                }}
              >
                {t(confirm === b.at ? 'ui.settings.replaceMine' : 'ui.settings.restore')}
              </PixelButton>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/**
 * The deploy guide (/setup), a page of its own: under a lock it would leave the fight, so it stays in the sentence,
 * shut as the header's links are (focusable, the reason in its name, a toast on a tap).
 */
function SetupLink({ shut, children }: { shut?: string | null; children: string }) {
  return (
    <Link
      to={shut ? '#' : '/setup'}
      onClick={(e) => {
        if (!shut) return
        e.preventDefault()
        pushToast(shut, 'info')
      }}
      aria-disabled={shut ? true : undefined}
      aria-label={shut ? `${children}. ${shut}` : undefined}
      title={shut ?? undefined}
      className={cx('underline', shut && 'cursor-not-allowed text-muted')}
    >
      {children}
    </Link>
  )
}

/** The whole game — menus, Pokémon, trainers, items — follows this. */
function LanguagePanel() {
  const { t } = useT()
  const lang = useGame((s) => s.settings.lang)
  return (
    <Panel title={t('ui.settings.language')}>
      <div role="radiogroup" aria-label={t('ui.settings.language')} className="flex flex-wrap gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            lang={l}
            onClick={() => setSettings({ lang: l as Lang })}
            // font-pixel re-reads --font-cjk here, so each label draws in its own language's CJK face (`lang` alone
            // would inherit the page's: a font stack is resolved once, on <body>).
            className={`pixel-btn font-pixel min-h-[44px] px-3 py-1 text-2xl leading-none ${lang === l ? 'bg-gold' : 'bg-parchment'}`}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="copy mt-2 text-muted">{t('ui.settings.languageHint')}</p>
    </Panel>
  )
}
