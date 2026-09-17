// Auth + cloud save sync + background content hot-swap. Never blocks the UI on the network.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { fetchContentUpdate } from '@/config/remote'
import { getSupabase } from '@/lib/supabase'
import { pickNewest, pullCloudSave, pushCloudSave, schedulePush } from '@/save/cloud'
import { flushWrite } from '@/save/storage'
import { commitSave, initialRun, onSaveCommitted, pushToast, setContent, tickRegen, useGame } from './game'

let syncedUser: string | null = null

async function handleSession(client: SupabaseClient, session: Session | null) {
  if (!session) {
    syncedUser = null
    useGame.setState({ auth: { status: 'signed_out', userId: null, email: null } })
    return
  }
  const { id, email, user_metadata: meta } = session.user
  const avatarUrl = (meta?.avatar_url ?? meta?.picture ?? null) as string | null
  useGame.setState({ auth: { status: 'signed_in', userId: id, email: email ?? null, avatarUrl } })
  if (syncedUser === id) return
  syncedUser = id
  try {
    const local = useGame.getState().save
    const cloud = await pullCloudSave(client, id)
    const { winner, save } = pickNewest(local, cloud)
    if (winner === 'cloud' && save) {
      commitSave(save, { silent: true, keepTimestamp: true })
      useGame.setState({ run: initialRun(), battle: null })
      pushToast('Cloud save loaded — it was newer', 'good')
    } else if (winner === 'local' && local) {
      await pushCloudSave(client, id, local)
      pushToast(cloud ? 'Local save kept — it was newer' : 'Save backed up to the cloud', 'good')
    }
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    pushToast('Cloud sync unavailable — playing locally', 'bad')
  }
}

export async function initAuth() {
  const client = await getSupabase()
  if (!client) {
    useGame.setState({ auth: { status: 'unavailable', userId: null, email: null } })
    return
  }
  onSaveCommitted((save) => {
    const { auth } = useGame.getState()
    if (!save || auth.status !== 'signed_in' || !auth.userId) return
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
    pushToast('Cloud backup is not configured on this site', 'bad')
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
  pushToast('Signed out — your local save is kept', 'info')
}

export async function checkContent() {
  const { data } = useGame.getState()
  const remote = await fetchContentUpdate(data.config.configVersion)
  if (!remote) return
  setContent(remote, 'remote')
  pushToast('Content updated', 'info')
}

let started = false
export function startBackgroundServices() {
  if (started) return
  started = true
  void initAuth()
  void checkContent()
  setInterval(() => tickRegen(), 60_000)
  window.addEventListener('pagehide', flushWrite)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushWrite()
    else tickRegen()
  })
}
