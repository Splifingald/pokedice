// Auth + cloud save sync + background content hot-swap. Never blocks the UI on the network.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { startAnalytics, trackLogin } from '@/analytics/track'
import { fetchContentUpdate } from '@/config/remote'
import { getSupabase } from '@/lib/supabase'
import { decideSync, pullCloudSave, pushCloudSave, sameSave, schedulePush } from '@/save/cloud'
import { backupSave, flushWrite } from '@/save/storage'
import { commitSave, initialRun, onSaveCommitted, pushToast, setContent, tickFossils, useGame } from './game'
import { t } from '@/i18n'
import { rescueIfRegionDisabled } from './regions'

let syncedUser: string | null = null
/** Nothing is pushed until the first sync for the signed-in user is settled — no overwrite while we compare. */
let pushAllowed = false

const resetRun = () => useGame.setState({ run: initialRun(), battle: null })

async function handleSession(client: SupabaseClient, session: Session | null) {
  if (!session) {
    syncedUser = null
    pushAllowed = false
    useGame.setState({ auth: { status: 'signed_out', userId: null, email: null } })
    return
  }
  const { id, email, user_metadata: meta } = session.user
  const avatarUrl = (meta?.avatar_url ?? meta?.picture ?? null) as string | null
  useGame.setState({ auth: { status: 'signed_in', userId: id, email: email ?? null, avatarUrl } })
  trackLogin(id)
  if (syncedUser === id) return
  syncedUser = id
  pushAllowed = false
  try {
    const local = useGame.getState().save
    const cloud = await pullCloudSave(client, id)
    const decision = decideSync(local, cloud)
    if (decision === 'ask' && local && cloud) {
      // The newer save has less progress: the player chooses (SyncConflictModal → resolveSyncConflict).
      useGame.setState({ syncConflict: { local, cloud } })
      return
    }
    if (decision === 'cloud' && cloud) {
      if (local && !sameSave(local, cloud)) backupSave(local, t('ui.sync.replacedByCloud'))
      commitSave(cloud, { silent: true, keepTimestamp: true })
      resetRun()
      pushToast(t('ui.toast.cloudNewer'), 'good')
    } else if (decision === 'local' && local) {
      if (cloud && !sameSave(local, cloud)) backupSave(cloud, t('ui.sync.replacedByLocal'))
      await pushCloudSave(client, id, local)
      pushToast(t(cloud ? 'ui.toast.localNewer' : 'ui.toast.backedUp'), 'good')
    }
    pushAllowed = true
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    syncedUser = null // try again on the next auth event; stay local-only meanwhile
    pushToast(t('ui.toast.syncUnavailable'), 'bad')
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
  } else {
    backupSave(cloud, t('ui.sync.cloudPicked'))
    const kept = { ...local, updatedAt: Date.now() }
    commitSave(kept, { silent: true, keepTimestamp: true })
    const client = await getSupabase()
    if (client && auth.userId) {
      try {
        await pushCloudSave(client, auth.userId, kept)
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
    schedulePush(() => pushCloudSave(client, userId, save))
  })
  client.auth.onAuthStateChange((_event, session) => {
    // Defer: supabase-js warns against awaiting other calls inside this callback.
    setTimeout(() => void handleSession(client, session), 0)
  })
  const { data } = await client.auth.getSession()
  await handleSession(client, data.session)
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

/** Back after this long away (tab hidden, or the device asleep): a new session, so the page reloads for the latest build and content. */
const NEW_SESSION_MS = 24 * 60 * 60 * 1000
let lastSeen = Date.now()
let reloading = false

/** Reload now — or, mid-fight, as soon as the fight is over (a reload would lose it). The save is written first. */
function reloadForNewSession() {
  if (reloading) return
  reloading = true
  const inFight = () => {
    const phase = useGame.getState().run.phase
    return phase === 'battle' || phase === 'catch' || phase === 'victory'
  }
  const go = () => {
    flushWrite()
    window.location.reload()
  }
  if (!inFight()) return go()
  const stop = useGame.subscribe(() => {
    if (inFight()) return
    stop()
    go()
  })
}

/** Called while the page is visible (on return, and every minute): a gap of a day or more starts a new session. */
function checkNewSession() {
  const now = Date.now()
  if (now - lastSeen >= NEW_SESSION_MS) reloadForNewSession()
  else lastSeen = now
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
    // A timer that fires a day late means the device slept: same as coming back to the tab.
    if (document.visibilityState === 'visible') checkNewSession()
    tickFossils()
  }, 60_000)
  window.addEventListener('pagehide', flushWrite)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastSeen = Date.now()
      flushWrite()
    } else {
      checkNewSession()
      tickFossils()
    }
  })
}
