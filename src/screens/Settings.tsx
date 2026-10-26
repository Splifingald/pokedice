import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SupportModal } from '@/components/SupportModal'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { FeelSettings } from '@/components/FeelSettings'
import { PushSettingsPanel } from '@/components/PushSettings'
import { PixelButton } from '@/components/PixelButton'
import { Seg } from '@/components/Segmented'
import { Toggle } from '@/components/Toggle'
import { donationEnabled, extremeOpen, isExtreme } from '@/engine'
import { LANG_LABELS, LANGS, type Lang } from '@/i18n'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, setSettings, useGame } from '@/store/game'
import { deleteSave } from '@/store/run'
import { useIsAdmin, useLockReason, useNavLock, useTypeHints } from '@/store/hooks'
import { checkContent, deleteAllData, deleteExtremeSave, providerName } from '@/store/sync'
import { otherSave } from '@/store/extreme'
import { ExtremeRulesModal } from '@/components/Extreme'
import { PlayStylePanel } from '@/components/IdleMode'
import { AccountButton, ConnectedAccounts, DisconnectButton } from '@/components/AccountButton'
import { soundOn } from '@/save/storage'
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
 * leave the page is shut and says why — signing in or out, linking an account, deleting a save,
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
  const typeHints = useTypeHints()
  // Only when the admin has it switched on, with a Ko-fi link.
  const canDonate = donationEnabled(data)
  const [donating, setDonating] = useState(false)
  // White, here and over the fight: red stays for the game's own actions (docs/38 U5d).
  const support = canDonate && (
    <PixelButton size="sm" onClick={() => setDonating(true)}>
      {t('ui.support.button')}
    </PixelButton>
  )

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
          {support}
        </div>
      ) : (
        support && <div className="flex justify-end">{support}</div>
      )}

      {/* Titles only, no description lines (the user's call, 2026-10-25): each title says what it switches. */}
      <Panel title={t('ui.settings.game')}>
        <Toggle
          label={t('ui.settings.sound')}
          on={soundOn(settings)}
          onChange={(v) => setSettings({ sound: v, sfx: v })}
        />
        <FeelSettings />
        {/* Switched off by the game's config (no bench share), it would do nothing: not shown. */}
        {data.config.multiExpShare > 0 && (
          <Toggle
            label={t('ui.settings.multiExp')}
            on={settings.multiExp}
            onChange={(v) => setSettings({ multiExp: v })}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 py-1">
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
        <div className="flex flex-wrap items-center justify-between gap-2 py-1">
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
        {/* On until the first badge unless the player chose (docs/38 U1b); the type chart holds the same switch. */}
        <Toggle
          label={t('ui.settings.typeHints')}
          on={typeHints}
          onChange={(v) => setSettings({ typeHints: v })}
        />
        {/* Off by default (docs/42): the battle history, the HP and XP figures, the cards' types, for those who read them. */}
        <Toggle
          label={t('ui.settings.details')}
          on={settings.details === true}
          onChange={(v) => setSettings({ details: v || undefined })}
        />
        {/* No animations: admins only — but a player who already turned it on still sees it, so they can turn it off. */}
        {(isAdmin || settings.reducedMotion) && (
          <Toggle
            label={t('ui.settings.reducedMotion')}
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
        {/* Deleting it is the one Delete at the bottom of the page, with the other deletions (docs/38 U8b). */}
        <div className="mt-2 flex flex-wrap gap-2">
          <PixelButton size="sm" onClick={() => void copySave()} disabled={!save}>
            {t('ui.settings.copySave')}
          </PixelButton>
        </div>
        {/* No import here: the cloud save is what the trade server reads, so a pasted save would be a cheat that
            reaches other players (docs/23). Admins keep theirs in Dev Tools. */}
        </details>
      </Panel>

      <ExtremePanel />

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

      {/* One Disconnect (Cloud backup's, beside who is signed in) and, at the very bottom, one Delete that asks what. */}
      <DeleteData shut={why} />

      <SupportModal open={donating} onClose={() => setDonating(false)} />
    </div>
  )
}

/** What the one Delete can take: the save in play, the Extreme save (docs/22), or everything. */
export type DeleteChoice = 'save' | 'extreme' | 'all'

const CHOICES: Record<DeleteChoice, { label: string; desc: string }> = {
  save: { label: 'ui.settings.deleteSave', desc: 'ui.settings.deleteSaveDesc' },
  extreme: { label: 'ui.extreme.settings.delete', desc: 'ui.settings.deleteExtremeDesc' },
  all: { label: 'ui.settings.wipe', desc: 'ui.settings.wipeDesc' },
}

/**
 * The one Delete's question (docs/38 U8b): which deletion, each a row with what it takes. Nothing is deleted here: each
 * row goes on to its own pop-ups. White rows with red words, so the only red buttons are the confirmations'.
 */
export function DeleteChooser({
  open,
  onClose,
  choices,
  onPick,
}: {
  open: boolean
  onClose: () => void
  choices: readonly DeleteChoice[]
  onPick: (c: DeleteChoice) => void
}) {
  const { t } = useT()
  const id = useId()
  return (
    <Modal open={open} onClose={onClose} title={t('ui.settings.deleteWhat')}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {choices.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => onPick(c)}
              aria-label={t(CHOICES[c].label)}
              aria-describedby={`${id}-${c}`}
              className="flex min-h-[56px] w-full flex-col items-start gap-1 bg-paper px-3 pb-2.5 pt-2 text-left shadow-card"
            >
              <b className="text-[22px] font-normal leading-none text-danger">{t(CHOICES[c].label)}</b>
              <small id={`${id}-${c}`} className="font-pixel-sm text-[16px] leading-tight text-muted">
                {t(CHOICES[c].desc)}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <PixelButton onClick={onClose}>{t('ui.common.cancel')}</PixelButton>
      </div>
    </Modal>
  )
}

/**
 * The red button at the very bottom, the only Delete in Settings (docs/38 U8b): it asks what goes (`DeleteChooser`),
 * then each asks as it always did. The save in play: one pop-up, then the title screen. The Extreme save, or everything
 * the game keeps about the player in this browser and online (both saves, docs/22): two pop-ups in a row so it is never
 * a mis-tap, what goes then a last "really?", and a reload onto the title screen.
 */
function DeleteData({ shut }: { shut?: string | null }) {
  const { t } = useT()
  const navigate = useNavigate()
  const hasSave = useGame((s) => !!s.save)
  const online = useGame((s) => s.auth.status === 'signed_in')
  const playingExtreme = useGame((s) => isExtreme(s.save))
  const hasExtreme = playingExtreme || isExtreme(otherSave())
  const [asking, setAsking] = useState(false)
  const [choice, setChoice] = useState<DeleteChoice | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [busy, setBusy] = useState(false)
  const choices: DeleteChoice[] = [...(hasSave ? ['save' as const] : []), ...(hasExtreme ? ['extreme' as const] : []), 'all']
  const all = choice === 'all'
  const close = () => {
    if (!busy) setChoice(null)
  }
  const wipe = async () => {
    setBusy(true)
    // A reload, not a navigation: the stores still hold the old save, friends and events in memory.
    if (await (all ? deleteAllData() : deleteExtremeSave())) return window.location.assign('/')
    setBusy(false)
    setChoice(null)
    pushToast(t('ui.settings.wipeFailed'), 'bad')
  }
  const body = all
    ? [t(online ? 'ui.settings.wipeBodyOnline' : 'ui.settings.wipeBodyLocal'), hasExtreme ? t('ui.settings.wipeBothNote') : '']
        .filter(Boolean)
        .join(' ')
    : t('ui.extreme.settings.deleteBody')
  return (
    <div className="flex justify-center">
      {/* Full width on phones, so a long translation shrinks to fit instead of pushing the page sideways. */}
      <PixelButton variant="danger" className="w-full sm:w-auto" onClick={() => setAsking(true)} shut={shut}>
        {t('ui.settings.deleteAsk')}
      </PixelButton>

      <DeleteChooser
        open={asking}
        onClose={() => setAsking(false)}
        choices={choices}
        onPick={(c) => {
          setAsking(false)
          setStep(1)
          setChoice(c)
        }}
      />

      <Modal open={choice === 'save'} onClose={close} title={t('ui.settings.deleteTitle')}>
        <p className="copy mb-4 text-lg">
          {t('ui.settings.deleteBody', { cloud: online ? t('ui.settings.deleteCloudNote') : '' })}
        </p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.common.cancel')}</PixelButton>
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

      <Modal
        open={(choice === 'all' || choice === 'extreme') && step === 1}
        onClose={close}
        title={t(all ? 'ui.settings.wipeTitle' : 'ui.extreme.settings.deleteTitle')}
      >
        <p className="copy mb-4 text-lg">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" onClick={() => setStep(2)}>
            {t('ui.common.continue')}
          </PixelButton>
        </div>
      </Modal>

      <Modal
        open={(choice === 'all' || choice === 'extreme') && step === 2}
        onClose={close}
        dismissable={!busy}
        title={t('ui.settings.wipeSureTitle')}
      >
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

/**
 * Extreme mode (docs/22): what it is and its rules. Once it's open, or a save of it exists. Deleting its save is the
 * one Delete at the bottom of the page (docs/38 U8b).
 */
function ExtremePanel() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState(false)
  const extreme = isExtreme(save)
  const hasSave = extreme || isExtreme(otherSave())
  if (!extreme && !hasSave && !extremeOpen(save, data)) return null
  return (
    <Panel title={t('ui.extreme.name')}>
      <div className="flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules(true)} aria-label={t('ui.extreme.infoLabel')}>
          {t('ui.extreme.settings.rules')}
        </PixelButton>
      </div>
      <ExtremeRulesModal open={rules} onClose={() => setRules(false)} />
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
    </Panel>
  )
}
