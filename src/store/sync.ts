// Auth + cloud save sync + background content hot-swap. Never blocks the UI on the network.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { startAnalytics } from '@/analytics/ping'
import { fetchContentUpdate } from '@/config/remote'
import { getSupabase } from '@/lib/supabase'
import {
  cancelPush,
  decideSync,
  flushPush,
  pullCloudSave,
  pushCloudSave,
  sameSave,
  schedulePush,
} from '@/save/cloud'
import type { SaveData } from '@/engine/types'
import { backupSave, flushWrite } from '@/save/storage'
import { commitSave, initialRun, onSaveCommitted, pushToast, setContent, tickFossils, useGame } from './game'
import { t } from '@/i18n'
import { rescueIfRegionDisabled } from './regions'

let syncedUser: string | null = null
/** Nothing is pushed until the first sync for the signed-in user is settled — no overwrite while we compare. */
let pushAllowed = false

/** After a successful sync, SYNC ONLINE can't be pressed again for this long. */
export const SYNC_COOLDOWN_MS = 5 * 60_000

/** What SYNC ONLINE shows: when this device and the cloud last matched, and whether a sync is running. */
export const useCloudSync = create<{ lastAt: number | null; busy: boolean }>(() => ({
  lastAt: null,
  busy: false,
}))
const markSynced = () => useCloudSync.setState({ lastAt: Date.now() })
/** The last push or sync attempt, failed or not: the next automatic push counts from here. */
let lastTry = 0

/** cloudSyncMinutes (admin → Config), in ms. */
const syncEveryMs = () => Math.max(1, Number(useGame.getState().data.config.cloudSyncMinutes) || 15) * 60_000

const resetRun = () => useGame.setState({ run: initialRun(), battle: null })
const inFight = () => {
  const phase = useGame.getState().run.phase
  return phase === 'battle' || phase === 'catch' || phase === 'victory'
}

async function push(client: SupabaseClient, userId: string, save: SaveData) {
  lastTry = Date.now()
  await pushCloudSave(client, userId, save)
  markSynced()
}

/**
 * Compares this device's save with the cloud copy and settles them: the newest wins, unless it has less progress —
 * then the player chooses (SyncConflictModal → resolveSyncConflict). Run at sign-in and by SYNC ONLINE. A save that
 * already matches the cloud costs the one read. Throws when the cloud can't be reached.
 */
async function reconcile(client: SupabaseClient, id: string): Promise<'loaded' | 'pushed' | 'same' | 'ask'> {
  pushAllowed = false
  cancelPush() // whatever was waiting goes out below, if this device wins
  lastTry = Date.now()
  const local = useGame.getState().save
  const cloud = await pullCloudSave(client, id)
  const decision = decideSync(local, cloud)
  if (decision === 'ask' && local && cloud) {
    useGame.setState({ syncConflict: { local, cloud } })
    return 'ask'
  }
  let outcome: 'loaded' | 'pushed' | 'same' = 'same'
  if (decision === 'cloud' && cloud && !(local && sameSave(local, cloud))) {
    if (local) backupSave(local, t('ui.sync.replacedByCloud'))
    commitSave(cloud, { silent: true, keepTimestamp: true })
    resetRun()
    pushToast(t('ui.toast.cloudNewer'), 'good')
    outcome = 'loaded'
  } else if (decision === 'local' && local && !(cloud && sameSave(local, cloud))) {
    if (cloud) backupSave(cloud, t('ui.sync.replacedByLocal'))
    await pushCloudSave(client, id, local)
    pushToast(t(cloud ? 'ui.toast.localNewer' : 'ui.toast.backedUp'), 'good')
    outcome = 'pushed'
  }
  markSynced()
  pushAllowed = true
  return outcome
}

async function handleSession(client: SupabaseClient, session: Session | null) {
  if (!session) {
    syncedUser = null
    pushAllowed = false
    cancelPush()
    useCloudSync.setState({ lastAt: null })
    useGame.setState({ auth: { status: 'signed_out', userId: null, email: null } })
    return
  }
  const { id, email, user_metadata: meta } = session.user
  const avatarUrl = (meta?.avatar_url ?? meta?.picture ?? null) as string | null
  useGame.setState({ auth: { status: 'signed_in', userId: id, email: email ?? null, avatarUrl } })
  if (syncedUser === id) return
  syncedUser = id
  try {
    await reconcile(client, id)
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    syncedUser = null // try again on the next auth event or SYNC ONLINE; stay local-only meanwhile
    pushToast(t('ui.toast.syncUnavailable'), 'bad')
  }
}

/** Why SYNC ONLINE can't be pressed right now, or null when it can. */
export function syncBlockedBy(
  now = Date.now(),
): 'signedOut' | 'busy' | 'fight' | 'conflict' | 'cooldown' | null {
  const { auth, syncConflict } = useGame.getState()
  const { busy, lastAt } = useCloudSync.getState()
  if (auth.status !== 'signed_in' || !auth.userId) return 'signedOut'
  if (busy) return 'busy'
  if (syncConflict) return 'conflict'
  // Loading the cloud save would end the fight.
  if (inFight()) return 'fight'
  if (lastAt != null && now - lastAt < SYNC_COOLDOWN_MS) return 'cooldown'
  return null
}

/** SYNC ONLINE: compare with the cloud now and settle, as at sign-in. Then 5 minutes before it can run again. */
export async function syncNow() {
  if (syncBlockedBy()) return
  const userId = useGame.getState().auth.userId!
  const client = await getSupabase()
  if (!client) return
  useCloudSync.setState({ busy: true })
  // A failed attempt leaves things as they were: pushing on if the saves were already settled, held back if the
  // sign-in sync never got through (the cloud may hold more progress than this device).
  const was = { pushAllowed, syncedUser }
  try {
    syncedUser = userId
    if ((await reconcile(client, userId)) === 'same') pushToast(t('ui.toast.synced'), 'good')
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    pushAllowed = was.pushAllowed
    syncedUser = was.syncedUser
    pushToast(t('ui.toast.syncFailed'), 'bad')
  } finally {
    useCloudSync.setState({ busy: false })
  }
}

/** The player's answer to "Two saves found". The other save is kept as a backup on this device. */
export async function resolveSyncConflict(keep: 'local' | 'cloud') {
  const { syncConflict, auth, save } = useGame.getState()
  if (!syncConflict) return
  const local = save ?? syncConflict.local
  const { cloud } = syncConflict
  if (keep === 'cloud') {
    backupSave(local, t('ui.sync.localPicked'))
    commitSave(cloud, { silent: true, keepTimestamp: true })
    resetRun()
    markSynced()
  } else {
    backupSave(cloud, t('ui.sync.cloudPicked'))
    const kept = { ...local, updatedAt: Date.now() }
    commitSave(kept, { silent: true, keepTimestamp: true })
    const client = await getSupabase()
    if (client && auth.userId) {
      try {
        await push(client, auth.userId, kept)
      } catch (err) {
        console.warn('[cloud] push failed', err)
      }
    }
  }
  useGame.setState({ syncConflict: null })
  pushAllowed = true
  pushToast(t(keep === 'cloud' ? 'ui.toast.cloudLoaded' : 'ui.toast.localKept'), 'good')
}

export async function initAuth() {
  const client = await getSupabase()
  if (!client) {
    useGame.setState({ auth: { status: 'unavailable', userId: null, email: null } })
    return
  }
  onSaveCommitted((save) => {
    const { auth } = useGame.getState()
    if (!save || !pushAllowed || auth.status !== 'signed_in' || !auth.userId) return
    const userId = auth.userId
    // At most once per cloudSyncMinutes, counted from the last sync or attempt.
    const since = Math.max(useCloudSync.getState().lastAt ?? 0, lastTry)
    schedulePush(() => push(client, userId, save), Math.max(0, since + syncEveryMs() - Date.now()))
  })
  client.auth.onAuthStateChange((_event, session) => {
    // Defer: supabase-js warns against awaiting other calls inside this callback.
    setTimeout(() => void handleSession(client, session), 0)
  })
  const { data } = await client.auth.getSession()
  await handleSession(client, data.session)
}

/**
 * Push the save to the cloud now rather than at the next automatic sync, for what reads the cloud copy right after (a
 * Versus team is built from it). False when there is nothing to push to yet: signed out, or the first sync not settled.
 */
export async function pushSaveNow(): Promise<boolean> {
  const client = await getSupabase()
  const { auth, save } = useGame.getState()
  if (!client || !save || !pushAllowed || auth.status !== 'signed_in' || !auth.userId) return false
  cancelPush()
  await push(client, auth.userId, save)
  return true
}

export async function signInWithGoogle() {
  const client = await getSupabase()
  if (!client) {
    pushToast(t('ui.toast.cloudNotConfigured'), 'bad')
    return
  }
  flushWrite()
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) pushToast(error.message, 'bad')
}

/** Sign-out keeps the local save. */
export async function signOut() {
  const client = await getSupabase()
  await client?.auth.signOut()
  pushToast(t('ui.toast.signedOut'), 'info')
}

export async function checkContent() {
  const { data } = useGame.getState()
  const remote = await fetchContentUpdate(data.config.configVersion)
  if (!remote) return
  setContent(remote, 'remote')
  pushToast(t('ui.toast.contentUpdated'), 'info')
}

// ---------------------------------------------------------------- staying on the latest build
// A tab can stay open for days, and it keeps running the build it loaded. Two things bring it up to date:
// - version.json, written next to each build (vite.config.ts): checked when the player comes back to the tab, and every
//   hour while it stays open. A different build there means a reload. One small Netlify request, no Supabase.
// - a page more than a day old reloads anyway, in case that check never gets through.
// Either way the reload waits for a safe moment: never mid-fight, mid-encounter or mid-catch decision.

/** A page older than this reloads (for the latest build and content). */
const MAX_PAGE_AGE_MS = 24 * 60 * 60 * 1000
/** version.json is checked on return to the tab at most this often… */
const VERSION_ON_RETURN_MS = 10 * 60_000
/** …and this often while the tab stays visible. */
const VERSION_WHILE_OPEN_MS = 60 * 60_000
const loadedAt = Date.now()
let lastVersionCheck = Date.now()
let reloading = false

/** Nothing would be lost by reloading now: no fight, encounter, pending catch or save conflict on screen. */
export function safeToReload(): boolean {
  const { run, syncConflict } = useGame.getState()
  return run.phase === 'idle' && !run.encounter && !run.pendingCatchId && !syncConflict
}

/** Reload as soon as it's safe. The save is written first. */
function reloadWhenSafe() {
  if (reloading) return
  reloading = true
  const go = () => {
    flushWrite()
    window.location.reload()
  }
  if (safeToReload()) return go()
  const stop = useGame.subscribe(() => {
    if (!safeToReload()) return
    stop()
    go()
  })
}

/** Is a newer build out? Quiet on failure (offline, dev server without version.json). */
async function checkForNewBuild() {
  lastVersionCheck = Date.now()
  if (import.meta.env.DEV) return
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const { build } = (await res.json()) as { build?: string }
    if (build && build !== __BUILD_ID__) reloadWhenSafe()
  } catch {
    /* try again later */
  }
}

/** On return to the tab (`returning`), and every minute while it's visible. */
function checkFreshness(returning: boolean) {
  if (Date.now() - loadedAt >= MAX_PAGE_AGE_MS) return reloadWhenSafe()
  if (Date.now() - lastVersionCheck >= (returning ? VERSION_ON_RETURN_MS : VERSION_WHILE_OPEN_MS))
    void checkForNewBuild()
}

let started = false
export function startBackgroundServices() {
  if (started) return
  started = true
  // A region may have been switched off in admin while this player was standing in it.
  rescueIfRegionDisabled()
  startAnalytics()
  void initAuth()
  void checkContent()
  setInterval(() => {
    if (document.visibilityState === 'visible') checkFreshness(false)
    tickFossils()
  }, 60_000)
  // Closing the page sends what the automatic sync hasn't yet. Merely switching away doesn't: on phones that happens
  // all the time, and the local save keeps everything until the next sync.
  window.addEventListener('pagehide', () => {
    flushWrite()
    flushPush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushWrite()
    } else {
      checkFreshness(true)
      tickFossils()
    }
  })
}
