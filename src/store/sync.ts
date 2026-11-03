// Auth + cloud save sync + background content hot-swap. Never blocks the UI on the network.
import type { AuthError, RealtimeChannel, Session, SupabaseClient, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { startAnalytics } from '@/analytics/ping'
import { checkContentVersion } from '@/config/remote'
import { AUTH_PROVIDERS, loadAuthProviders } from '@/lib/authProviders'
import { loadFriendStatus } from '@/lib/friends'
import { loadFriendship } from './friendship'
import { fetchRaidsDone } from '@/lib/raid'
import { isOffline, offlineOr } from '@/lib/online'
import { getSupabase } from '@/lib/supabase'
import { disablePush, usePush } from '@/lib/push'
import {
  cancelPush,
  cloudSaveAt,
  cloudUnchanged,
  decideSync,
  flushPush,
  isRateLimited,
  pullCloudSave,
  PUSH_GAP_MS,
  pushCloudSave,
  pushesSettled,
  pushGapLeft,
  pushKey,
  sameSave,
  SaveConflictError,
  schedulePush,
  sendSaveOnLeave,
  writtenSincePlayedAt,
} from '@/save/cloud'
import {
  keepGemsHeld,
  keepGeneralBought,
  keepLooksEarned,
  keepRaidsDone,
  keepRebattleTiers,
  keepWorldsDone,
} from '@/engine'
import type { SaveData, SaveMode } from '@/engine/types'
import {
  activeSlot,
  backupSave,
  flushWrite,
  peekSave,
  readCloudMark,
  readSave,
  saveKeyOf,
  wipePlayerData,
  wipeSlot,
  writeCloudMark,
  writeSlot,
} from '@/save/storage'
import {
  commitSave,
  initialRun,
  mutateSave,
  onSaveCommitted,
  pushToast,
  setContent,
  tickFossils,
  useGame,
  type AuthProvider,
} from './game'
import { t } from '@/i18n'
import { rescueIfRegionDisabled } from './regions'
import { startWorldClock } from './worlds'
import { armDayCareTimer, tickDayCare } from './daycare'
import { comeBack, markAway, settleExtreme, startExtremeClocks } from './extreme'
import { collectOfflineGold, markOfflineAway, startOfflineClock } from './general'
import { startWelcomeBack } from './welcomeBack'

let syncedUser: string | null = null
/** Nothing is pushed until the first sync for the signed-in user is settled — no overwrite while we compare. */
let pushAllowed = false
/** The signed-in player's save and the cloud copy are settled: what changes now goes up (trades wait for this). */
export const syncSettled = () => pushAllowed
/** Settled or not, as the sign-in's sync decides it; published (useCloudSync `settled`) for what waits for it. */
function settleSync(on: boolean) {
  pushAllowed = on
  if (useCloudSync.getState().settled !== on) useCloudSync.setState({ settled: on })
}
/** pushKey of the save the cloud holds, as far as this device knows; null when it doesn't. A push of the same is skipped. */
let cloudKey: string | null = null

/** After a successful sync, SYNC ONLINE can't be pressed again for this long. */
export const SYNC_COOLDOWN_MS = 5 * 60_000

/**
 * What SYNC ONLINE shows: when this device and the cloud last matched, and whether a sync is running; `settled`: the
 * sign-in's sync is over and pushes go up (the trades check waits for it).
 */
export const useCloudSync = create<{ lastAt: number | null; busy: boolean; settled: boolean }>(() => ({
  lastAt: null,
  busy: false,
  settled: false,
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

/**
 * One copy replacing another keeps what either bought (General upgrades, Mega Gems), was granted (event looks, written
 * into the cloud copy by SQL) or won for good (raids, rebattle tiers, small worlds finished): none of it is progress
 * the compare counts, so the copy that wins it may not have it.
 */
const keepBoth = (save: SaveData, other: SaveData | null | undefined): SaveData => {
  const bought = keepGemsHeld(keepLooksEarned(keepGeneralBought(save, other), other), other)
  return keepWorldsDone(keepRebattleTiers(keepRaidsDone(bought, other?.events?.raidsDone), other), other)
}

const realmOf = (save: SaveData): SaveMode => (save.mode === 'extreme' ? 'extreme' : 'main')

/** The cloud copy now holds the save with this key, stamped `at`: kept on the device for the next load. */
function rememberCloud(user: string, realm: SaveMode, at: number | null, key: string, pushedAt?: number) {
  const known = readCloudMark(realm)
  writeCloudMark(realm, { user, at, key, pushedAt: pushedAt ?? (known?.user === user ? known.pushedAt : 0) })
}

/** A refused upload found mid-play tries again this much later, when the cloud copy may be loaded. */
const CONFLICT_RETRY_MS = 30_000
/**
 * The cloud copy moved under this device (an upload was refused): uploads stop until the two are compared again, with
 * no request for each — a save is 30–400 kB.
 */
let cloudMoved = false
/** Something on screen that loading the cloud copy would cut short: a fight, an encounter, a catch decision, Versus. */
const playing = () => {
  const { run } = useGame.getState()
  return inFight() || !!run.encounter || !!run.pendingCatchId || useReloadHolds.getState().count > 0
}

/**
 * Push the save as it is when the timer fires, not one captured when it was set: the save may have changed since
 * without a commit of this page's own (another tab's, taken in by adoptStoredSave). Refused because another device
 * wrote the cloud copy since (SaveConflictError): the two are compared again, as at sign-in, never written over.
 */
async function pushLatest(client: SupabaseClient, userId: string): Promise<void> {
  const save = useGame.getState().save
  if (!save) return
  try {
    await push(client, userId, save)
  } catch (err) {
    if (!(err instanceof SaveConflictError)) throw err
    cloudMoved = true
    // The cloud copy may win, and loading it would end what's on screen.
    if (playing()) schedulePush(() => pushLatest(client, userId), CONFLICT_RETRY_MS)
    else await resync(client, userId)
  }
}

/** The stamp of the cloud copy this device last matched for `user`; null when it knows of none. */
function knownAt(user: string, realm: SaveMode): number | null {
  const mark = readCloudMark(realm)
  return mark?.user === user ? mark.at : null
}

/** Uploads over the cloud copy this device last matched only (`pushCloudSave`); SaveConflictError if it moved. */
async function push(client: SupabaseClient, userId: string, save: SaveData) {
  if (cloudMoved) throw new SaveConflictError()
  lastTry = Date.now()
  const key = pushKey(save)
  // Nothing changed since the cloud last matched (only timestamps): the upload would rewrite the same row.
  if (key !== cloudKey) {
    const at = await pushCloudSave(client, userId, save, knownAt(userId, realmOf(save)))
    cloudKey = key
    rememberCloud(userId, realmOf(save), at, key, Date.now())
  }
  markSynced()
}

/**
 * Another device wrote the cloud copy under this one: compare and settle again, unless a sync is already running.
 * False when it couldn't: pushes then wait for the next sign-in event or SYNC ONLINE, as after a failed sign-in sync.
 */
async function resync(client: SupabaseClient, userId: string): Promise<boolean> {
  if (useCloudSync.getState().busy) return false
  useCloudSync.setState({ busy: true })
  try {
    await reconcile(client, userId)
    return true
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    syncedUser = null
    return false
  } finally {
    useCloudSync.setState({ busy: false })
  }
}

/**
 * Upload now — or, if the database says this player uploaded too often (0040), once PUSH_GAP_MS is over. The save
 * stays on the device meanwhile, and the sync carries on.
 */
async function pushOrWait(client: SupabaseClient, userId: string, save: SaveData) {
  try {
    await push(client, userId, save)
  } catch (err) {
    if (!isRateLimited(err)) throw err
    schedulePush(() => pushLatest(client, userId), PUSH_GAP_MS)
  }
}

/**
 * Compares this device's save with the cloud copy and settles them, with no question asked: the one with more progress
 * wins (`decideSync`), and the other is kept as a backup on this device. Run at sign-in and by SYNC ONLINE (`manual`).
 * Throws when the cloud can't be reached.
 *
 * The copy's stamp is read first, and the save is downloaded only when something else wrote it (another device, the
 * admin) since this device last matched it. Otherwise the cloud holds what this device already has, or had before
 * playing on, and what changed since goes up — automatically at most once per PUSH_GAP_MS, reloads included. A page
 * reloaded every few seconds used to download the whole save and upload it again on every load.
 */
export async function reconcile(client: SupabaseClient, id: string, manual = false): Promise<'loaded' | 'pushed' | 'same'> {
  settleSync(false)
  cloudKey = null
  cloudMoved = false
  cancelPush() // whatever was waiting goes out below, if this device wins
  lastTry = Date.now()
  const before = useGame.getState().save
  // The save this page plays: the main one, or the Extreme one beside it (docs/22).
  const realm = activeSlot()
  const known = readCloudMark(realm)
  if (before && known?.user === id && cloudUnchanged(known, id, await cloudSaveAt(client, id, realm))) {
    cloudKey = known.key
    // The save as it is now, not as it was before the wait: a purchase made meanwhile goes up too.
    const local = useGame.getState().save ?? before
    if (pushKey(local) !== known.key) {
      const wait = manual ? 0 : pushGapLeft(known, id)
      if (wait) schedulePush(() => pushLatest(client, id), wait)
      else await pushOrWait(client, id, local)
    }
    markSynced()
    settleSync(true)
    return 'same'
  }
  const { save: cloud, at } = await pullCloudSave(client, id, realm)
  // Read again after the downloads: what was committed while they ran (a purchase, the offline pay) is part of this
  // device's save, and building on the copy read before would undo it.
  const local = useGame.getState().save
  const decision = decideSync(local, cloud)
  let outcome: 'loaded' | 'pushed' | 'same' = 'same'
  if (decision === 'cloud' && cloud && !(local && sameSave(local, cloud))) {
    if (local) backupSave(local, t('ui.sync.replacedByCloud'))
    // What this device bought or was granted stays (keepBoth): the cloud copy then gets it too, stamped past itself.
    const merged = keepBoth(cloud, local)
    const loaded = merged === cloud ? cloud : { ...merged, updatedAt: Math.max(Date.now(), cloud.updatedAt + 1) }
    commitSave(loaded, { silent: true, keepTimestamp: true })
    resetRun()
    pushToast(t('ui.toast.cloudLoaded'), 'good')
    outcome = 'loaded'
    cloudKey = pushKey(cloud)
    rememberCloud(id, realm, at, cloudKey)
    if (loaded !== cloud) await pushOrWait(client, id, useGame.getState().save ?? loaded)
  } else if (decision === 'local' && local && !(cloud && sameSave(local, cloud))) {
    if (cloud) backupSave(cloud, t('ui.sync.replacedByLocal'))
    // The copy just read is the one to write over (and none at all without a row): a device writing in between wins
    // the next compare instead of being overwritten.
    rememberCloud(id, realm, at, cloud ? pushKey(cloud) : '')
    // What the cloud copy bought or was granted stays (keepBoth). Kept over a copy stamped later: stamped past it, so
    // the cloud row's stamp never goes back (an older page still lets the newest stamp win; another device's clock may
    // be ahead of this one).
    const merged = keepBoth(local, cloud)
    const kept =
      cloud && cloud.updatedAt >= merged.updatedAt
        ? { ...merged, updatedAt: Math.max(Date.now(), cloud.updatedAt + 1) }
        : merged
    if (kept !== local) commitSave(kept, { silent: true, keepTimestamp: true })
    await pushOrWait(client, id, kept)
    pushToast(t(cloud ? 'ui.toast.localKept' : 'ui.toast.backedUp'), 'good')
    outcome = 'pushed'
  } else if (at != null) {
    // A row that can't be read is still a row: the next upload goes over it, not beside it.
    cloudKey = cloud ? pushKey(cloud) : null
    rememberCloud(id, realm, at, cloudKey ?? '')
  }
  markSynced()
  settleSync(true)
  return outcome
}

/** The session's access token, kept at hand: a page closing can't wait for supabase-js to read it (uploadOnLeave). */
let accessToken: string | null = null

async function handleSession(client: SupabaseClient, session: Session | null) {
  accessToken = session?.access_token ?? null
  if (!session) {
    syncedUser = null
    settleSync(false)
    cloudKey = null
    cancelPush()
    useCloudSync.setState({ lastAt: null })
    useGame.setState({ auth: { status: 'signed_out', userId: null, email: null } })
    return
  }
  const { id, email, user_metadata: meta, app_metadata: app } = session.user
  const avatarUrl = (meta?.avatar_url ?? meta?.picture ?? null) as string | null
  useGame.setState({
    auth: {
      status: 'signed_in',
      userId: id,
      email: email ?? null,
      avatarUrl,
      provider: asProvider(app?.provider),
      providers: providersOf(session.user),
    },
  })
  if (syncedUser === id) return
  syncedUser = id
  try {
    await reconcile(client, id)
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    syncedUser = null // try again on the next auth event or SYNC ONLINE; stay local-only meanwhile
    pushToast(offlineOr(t('ui.toast.syncUnavailable')), 'bad')
    return
  }
  void restoreRaidsDone()
}

/**
 * Raids the server saw this player win and the save lost come back into it (0089). Pages left open from a build
 * before 2026-10-22 wrote saves back without them (2026-10-29), and the raids opened again. Only ever adds; goes up with
 * the next upload like any change.
 */
export async function restoreRaidsDone(): Promise<void> {
  const done = await fetchRaidsDone()
  if (!done?.length) return
  mutateSave(
    (s) => {
      const next = keepRaidsDone(s, done)
      return next === s ? null : next
    },
    { auto: true },
  )
}

/** Why SYNC ONLINE can't be pressed right now, or null when it can. */
export function syncBlockedBy(
  now = Date.now(),
): 'signedOut' | 'busy' | 'fight' | 'cooldown' | null {
  const { auth } = useGame.getState()
  const { busy, lastAt } = useCloudSync.getState()
  if (auth.status !== 'signed_in' || !auth.userId) return 'signedOut'
  if (busy) return 'busy'
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
    if ((await reconcile(client, userId, true)) === 'same') pushToast(t('ui.toast.synced'), 'good')
  } catch (err) {
    console.warn('[cloud] sync failed', err)
    settleSync(was.pushAllowed)
    syncedUser = was.syncedUser
    pushToast(offlineOr(t('ui.toast.syncFailed')), 'bad')
  } finally {
    useCloudSync.setState({ busy: false })
  }
}

export async function initAuth() {
  const client = await getSupabase()
  if (!client) {
    useGame.setState({ auth: { status: 'unavailable', userId: null, email: null } })
    return
  }
  void loadAuthProviders()
  sayReturnedAuthError()
  onSaveCommitted((save) => {
    const { auth } = useGame.getState()
    if (!save || !pushAllowed || auth.status !== 'signed_in' || !auth.userId) return
    const userId = auth.userId
    // At most once per cloudSyncMinutes, counted from the last sync or attempt, and never within PUSH_GAP_MS of this
    // device's last upload.
    const since = Math.max(useCloudSync.getState().lastAt ?? 0, lastTry)
    const gap = pushGapLeft(readCloudMark(realmOf(save)), userId)
    schedulePush(() => pushLatest(client, userId), Math.max(0, since + syncEveryMs() - Date.now(), gap))
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
  try {
    await push(client, auth.userId, save)
  } catch (err) {
    if (!(err instanceof SaveConflictError)) throw err
    // Settled again, the cloud holds whichever save won.
    return resync(client, auth.userId)
  }
  return true
}

const asProvider = (p: unknown): AuthProvider | null =>
  (AUTH_PROVIDERS as unknown[]).includes(p) ? (p as AuthProvider) : null

/** Every provider linked to the account, from its identities (and the provider list Auth keeps in app_metadata). */
export function providersOf(user: Pick<User, 'identities' | 'app_metadata'>): AuthProvider[] {
  const seen = [...(user.identities ?? []).map((i) => i.provider), ...((user.app_metadata?.providers as unknown[]) ?? [])]
  return AUTH_PROVIDERS.filter((p) => seen.includes(p))
}

export const providerName = (p: AuthProvider) => t(p === 'discord' ? 'ui.account.providerDiscord' : 'ui.account.providerGoogle')

/** Back where the player was, after the provider's page. */
const here = () => `${window.location.origin}${window.location.pathname}`

/** Linking: remembered across the provider's page, so an error coming back can name it. */
const LINKING_KEY = 'pokedice.linking'

/** Auth's error codes the player can act on, in words; anything else as Auth says it. */
export function authErrorText(code: string | null | undefined, provider: AuthProvider | null, fallback: string): string {
  if (code === 'identity_already_exists' && provider) return t('ui.account.err.alreadyLinked', { provider: providerName(provider) })
  if (code === 'manual_linking_disabled') return t('ui.account.err.linkingOff')
  return fallback
}

const errorCode = (error: AuthError) => (error as AuthError & { code?: string }).code ?? null

/** Sign in with Google or Discord: the provider's page, then back here. */
export async function signIn(provider: AuthProvider = 'google') {
  const client = await getSupabase()
  if (!client) {
    pushToast(t('ui.toast.cloudNotConfigured'), 'bad')
    return
  }
  // Offline, the provider's page can't load: say so here rather than leave the game for a browser error.
  if (isOffline()) return pushToast(t('ui.common.offline'), 'bad')
  flushWrite()
  const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: here() } })
  if (error) pushToast(authErrorText(errorCode(error), provider, error.message), 'bad')
}

/** The admin panel's sign-in: the admin's Google account. */
export const signInWithGoogle = () => signIn('google')

/** Adds another way in to the signed-in account (Settings → Connected accounts): the provider's page, then back. */
export async function linkProvider(provider: AuthProvider) {
  const client = await getSupabase()
  if (!client) return
  if (isOffline()) return pushToast(t('ui.common.offline'), 'bad')
  flushWrite()
  try {
    sessionStorage.setItem(LINKING_KEY, provider)
  } catch {
    /* the error, if any, just won't name the provider */
  }
  const { error } = await client.auth.linkIdentity({ provider, options: { redirectTo: here() } })
  if (error) pushToast(authErrorText(errorCode(error), provider, error.message), 'bad')
}

/** Removes a way in. Auth refuses to remove the last one, and so does the Settings screen. */
export async function unlinkProvider(provider: AuthProvider) {
  const client = await getSupabase()
  if (!client) return
  const { data, error } = await client.auth.getUserIdentities()
  const identity = data?.identities.find((i) => i.provider === provider)
  if (error || !identity) {
    pushToast(error?.message ?? t('ui.toast.syncUnavailable'), 'bad')
    return
  }
  const res = await client.auth.unlinkIdentity(identity)
  if (res.error) {
    pushToast(authErrorText(errorCode(res.error), provider, res.error.message), 'bad')
    return
  }
  // The session's copy of the user still lists it: refresh, and the auth listener updates Settings.
  await client.auth.refreshSession()
  pushToast(t('ui.account.unlinked', { provider: providerName(provider) }), 'info')
}

/** An error Auth sent back on the return from a provider's page (`?error_code=…`): said once, then taken off the URL. */
function sayReturnedAuthError() {
  if (typeof window === 'undefined') return
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = search.get('error_code') ?? hash.get('error_code')
  const description = search.get('error_description') ?? hash.get('error_description')
  if (!code && !description) return
  let provider: AuthProvider | null = null
  try {
    provider = asProvider(sessionStorage.getItem(LINKING_KEY))
    sessionStorage.removeItem(LINKING_KEY)
  } catch {
    /* storage blocked */
  }
  pushToast(authErrorText(code, provider, description ?? code ?? ''), 'bad')
  for (const k of ['error', 'error_code', 'error_description']) search.delete(k)
  const rest = search.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
}

/**
 * Settings → Delete all my data: signed in, every row the online database keeps about the player
 * (`delete_my_data()`, migration 0038), then everything the game keeps on this device but its settings. Online first:
 * a local delete alone would get the save back from the cloud at the next sync, so if the online one fails nothing is
 * deleted and this returns false. The caller reloads the page, which clears what the stores still hold in memory.
 */
export async function deleteAllData(): Promise<boolean> {
  const { auth } = useGame.getState()
  // Not known yet whether a session is stored, or a sync running: either could bring a cloud save straight back.
  if (auth.status === 'unknown' || useCloudSync.getState().busy) return false
  if (auth.status === 'signed_in' && auth.userId) {
    const client = await getSupabase()
    if (!client) return false
    const was = pushAllowed
    // No push may land after the delete: the waiting one goes now, the next ones wait for the answer.
    pushAllowed = false
    await pushesSettled()
    let error: unknown = null
    try {
      error = (await client.rpc('delete_my_data')).error
    } catch (err) {
      error = err
    }
    if (error) {
      console.warn('[cloud] delete failed', error)
      pushAllowed = was
      return false
    }
    cloudKey = null
  }
  // Push notifications stop too (docs/27): this browser's subscription and, for a guest, the server's copy of it.
  if (usePush.getState().on) await disablePush()
  // Out of the store too, so nothing commits the old save again before the reload.
  useGame.setState({ save: null })
  resetRun()
  wipePlayerData()
  return true
}

/**
 * Play the other save (docs/22). The one being left is written and goes to the cloud first, and counts as left (an
 * Extreme save heals for the time spent away from it); then the page reloads on the other one, since every store
 * holds one save's friends, events and Versus in memory.
 */
export async function switchSave(to: SaveMode): Promise<boolean> {
  if (activeSlot() === to) return false
  markAway()
  markOfflineAway()
  flushWrite()
  try {
    // A slow network doesn't hold the switch: closing the page sends what's still waiting anyway.
    await Promise.race([pushSaveNow(), new Promise((done) => setTimeout(done, 4000))])
  } catch (err) {
    console.warn('[cloud] push before switching failed', err)
  }
  writeSlot(to)
  // Without a save on this device, the title: the sign-in sync may still bring the cloud's (a new game there would
  // write over it).
  window.location.assign(readSave(to).save ? '/home' : '/')
  return true
}

/**
 * Settings → Delete my Extreme save (docs/22): its rows online (`delete_my_data('extreme')`), then the save on this
 * device. The main save and everything shared (the account, friends) stay. Online first, for the same reason as
 * deleteAllData. Playing it now: the page goes back to the main save (the caller reloads).
 */
export async function deleteExtremeSave(): Promise<boolean> {
  const { auth } = useGame.getState()
  if (auth.status === 'unknown' || useCloudSync.getState().busy) return false
  const playing = activeSlot() === 'extreme'
  if (auth.status === 'signed_in' && auth.userId) {
    const client = await getSupabase()
    if (!client) return false
    const was = pushAllowed
    if (playing) {
      pushAllowed = false
      await pushesSettled()
    }
    let error: unknown = null
    try {
      error = (await client.rpc('delete_my_data', { p_realm: 'extreme' })).error
    } catch (err) {
      error = err
    }
    if (error) {
      console.warn('[cloud] delete failed', error)
      pushAllowed = was
      return false
    }
    if (playing) cloudKey = null
  }
  if (playing) {
    useGame.setState({ save: null })
    resetRun()
    writeSlot('main')
  }
  wipeSlot('extreme')
  return true
}

/** Sign-out keeps the local save. */
export async function signOut() {
  const client = await getSupabase()
  await client?.auth.signOut()
  pushToast(t('ui.toast.signedOut'), 'info')
}

export async function checkContent() {
  const { data } = useGame.getState()
  const res = await checkContentVersion(data.config.configVersion)
  useGame.setState({ contentAsked: true })
  if (!res) return
  if (res.bundle) {
    setContent(res.bundle, 'remote')
    pushToast(t('ui.toast.contentUpdated'), 'info')
  }
  // The content in play is the latest: what it doesn't hold is really gone (a small world the admin deleted).
  useGame.setState({ contentChecked: true })
}

// ---------------------------------------------------------------- staying on the latest build
// A tab can stay open for days, and it keeps running the build it loaded. Three things bring it up to date:
// - version.json, written next to each build (vite.config.ts): checked when the player comes back to the tab, and every
//   hour while it stays open. A different build there means a reload. One small Netlify request, no Supabase.
// - Admin → "Reload all players" (force_reload, migration 0029), heard at once over Realtime by every open tab.
// - a page more than a day old reloads anyway, in case neither gets through.
// Either way the reload waits for a safe moment: never mid-fight, mid-encounter or mid-catch decision.

/** A page older than this reloads (for the latest build and content). */
const MAX_PAGE_AGE_MS = 24 * 60 * 60 * 1000
/** version.json is checked on return to the tab at most this often… */
const VERSION_ON_RETURN_MS = 10 * 60_000
/** …and this often while the tab stays visible. */
const VERSION_WHILE_OPEN_MS = 60 * 60_000
const loadedAt = Date.now()
let lastVersionCheck = Date.now()
let reloadPending = false
let reloading = false

/** Screens that keep the page from reloading though the run is idle: a Versus fight plays outside the run. */
const useReloadHolds = create<{ count: number }>(() => ({ count: 0 }))

/** Keeps the page from reloading until the returned function is called. */
export function holdReload(): () => void {
  useReloadHolds.setState((s) => ({ count: s.count + 1 }))
  let released = false
  return () => {
    if (released) return
    released = true
    useReloadHolds.setState((s) => ({ count: s.count - 1 }))
  }
}

/** The admin panel and the setup guide have unsaved work of their own: they wait until the admin leaves them. */
function onToolPage(): boolean {
  const path = globalThis.location?.pathname ?? ''
  return path.startsWith('/admin') || path.startsWith('/setup')
}

/** Nothing would be lost by reloading now: no fight, encounter or pending catch on screen. */
export function safeToReload(): boolean {
  if (onToolPage()) return false
  const { run } = useGame.getState()
  return useReloadHolds.getState().count === 0 && run.phase === 'idle' && !run.encounter && !run.pendingCatchId
}

/** The reload asked for, if now is a safe moment. The save is written first. */
function reloadIfSafe() {
  if (!reloadPending || reloading || !safeToReload()) return
  reloading = true
  flushWrite()
  window.location.reload()
}

/** Reload as soon as it's safe. `tell`: say so if it has to wait. */
function reloadWhenSafe(tell = false) {
  if (reloadPending) return
  reloadPending = true
  if (safeToReload()) return reloadIfSafe()
  if (tell && !onToolPage()) pushToast(t('ui.toast.reloadSoon'), 'info', 6000)
  useGame.subscribe(reloadIfSafe)
  useReloadHolds.subscribe(reloadIfSafe)
  // Leaving the admin panel changes no store: the minute timer in startBackgroundServices catches that.
}

/** Is a newer build out? Quiet on failure (offline, dev server without version.json). */
async function checkForNewBuild() {
  lastVersionCheck = Date.now()
  if (import.meta.env.DEV || import.meta.env.VITE_PROTO) return
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const { build } = (await res.json()) as { build?: string }
    if (build && build !== __BUILD_ID__) reloadWhenSafe()
  } catch {
    /* try again later */
  }
}

// ---------------------------------------------------------------- Admin → "Reload all players"
// The request is broadcast on the private Realtime channel 'app' and kept in app_signals ('reload' row). A tab that
// hears it live reloads. A tab that wasn't listening (offline, in the background, Realtime down) reads the row when it
// listens again, and reloads if it was loaded before the request. Only visible tabs stay on the channel, to keep the
// number of Realtime connections down.

/** The reload this tab already went through, kept across the reload (per tab) so a request never loops. */
const RELOAD_SIGNAL_KEY = 'pokedice.reloadSignal'
/** A dropped or refused channel is joined again at most this often. */
const RELISTEN_MS = 5 * 60_000
/** A tab hidden this long leaves the channel; it catches up from app_signals when it comes back. */
const HIDDEN_LEAVE_MS = 5 * 60_000
/**
 * A new page joins only once it has stayed this long: each join is a connection and a policy check on the database, and
 * a page reloaded over and over (seen live: every 1–2 s for hours) would otherwise open one per load.
 */
const JOIN_AFTER_LOAD_MS = 30_000
let channel: RealtimeChannel | null = null
let lastListen = 0
let leaveTimer: ReturnType<typeof setTimeout> | undefined

/** Postgres timestamps carry microseconds, which not every browser parses: keep milliseconds. */
const signalMs = (at: string) => Date.parse(at.replace(/(\.\d{3})\d+/, '$1'))

/** A reload asked for at `at`. `live`: heard as it went out, so this page is older than the request. */
function onReloadSignal(at: unknown, live: boolean) {
  if (typeof at !== 'string') return
  const ms = signalMs(at)
  if (!Number.isFinite(ms)) return
  let seen: string | null = null
  try {
    seen = sessionStorage.getItem(RELOAD_SIGNAL_KEY)
  } catch {
    /* storage blocked: the page age below still guards */
  }
  if (seen === String(ms)) return
  if (!live && ms <= loadedAt) return // this page was loaded after the request
  try {
    sessionStorage.setItem(RELOAD_SIGNAL_KEY, String(ms))
  } catch {
    /* see above */
  }
  reloadWhenSafe(true)
}

/** Reads the last request: for a tab that may have missed it. */
async function checkReloadSignal(client: SupabaseClient) {
  const { data } = await client.from('app_signals').select('at').eq('id', 'reload').maybeSingle()
  if (data) onReloadSignal((data as { at?: unknown }).at, false)
}

/** Joins the 'app' channel. `catchUp`: also read the request this tab may have missed while away. */
async function listenForReload(catchUp: boolean) {
  if (channel) return
  lastListen = Date.now()
  const client = await getSupabase()
  if (!client || channel) return
  if (catchUp) void checkReloadSignal(client).catch(() => {})
  const ch = client
    .channel('app', { config: { private: true } })
    .on('broadcast', { event: 'reload' }, ({ payload }) =>
      onReloadSignal((payload as { at?: unknown })?.at, true),
    )
  channel = ch
  ch.subscribe((status) => {
    // Dropped (connection lost) or refused (migration 0029 not run): leave it, and join again later rather than let
    // supabase-js retry every few seconds.
    if (status !== 'SUBSCRIBED' && channel === ch) leaveChannel()
  })
}

function leaveChannel() {
  const ch = channel
  channel = null
  if (ch) void getSupabase().then((client) => client?.removeChannel(ch))
}

/** Back on the tab, or the minute timer while it's visible: listen again if the channel was left or dropped. */
function relisten() {
  if (!channel && Date.now() - lastListen >= RELISTEN_MS) void listenForReload(true)
}

/** On return to the tab (`returning`), and every minute while it's visible. */
function checkFreshness(returning: boolean) {
  reloadIfSafe()
  relisten()
  // New friends, on the way back to the tab (at most every 5 minutes): no Realtime for friends (docs/16 §1.7).
  if (returning) {
    void loadFriendStatus()
    void loadFriendship()
  }
  if (Date.now() - loadedAt >= MAX_PAGE_AGE_MS) return reloadWhenSafe()
  if (Date.now() - lastVersionCheck >= (returning ? VERSION_ON_RETURN_MS : VERSION_WHILE_OPEN_MS))
    void checkForNewBuild()
}

/**
 * Another tab of the game (or the installed app beside a browser tab) stored a newer save: this tab plays on from it.
 * Each tab keeps its own copy in memory, so an old tab brought back (its offline pay, a fossil, any tap) used to write
 * its stale copy over the newer one, here and in the cloud, and undo what was played in the other tab (General upgrades
 * lost, 2026-10-16). What either bought or was granted stays (keepBoth). `raw`: a storage event's value.
 */
export function adoptStoredSave(raw?: string | null): boolean {
  const { save } = useGame.getState()
  const stored = peekSave(raw)
  if (!stored || (save && stored.updatedAt <= save.updatedAt)) return false
  // A page left open from before 2026-10-22 wrote it: the same save with every part its build never knew gone, stamped
  // now (2026-10-29). This tab plays on from its own, which its next change stores again; writing it back at once
  // would also undo a page that is only just starting on the copy it stored. A reload in between starts from that
  // copy, and the sign-in's sync then prefers the cloud's (decideSync).
  if (save && writtenSincePlayedAt(save) && !writtenSincePlayedAt(stored)) return false
  // Kept at the other tab's stamp: written back here unchanged, it is no news to that tab (it only takes a newer one).
  // With a level only this tab had, it is: stamped now, so that tab takes it in turn.
  const merged = keepBoth(stored, save)
  commitSave(merged === stored ? stored : { ...merged, updatedAt: Math.max(Date.now(), stored.updatedAt + 1) }, {
    silent: true,
    keepTimestamp: true,
  })
  // The fight or run this tab was in belongs to the copy it played; the Pokémon in it may have moved on since.
  resetRun()
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') pushToast(t('ui.toast.otherTab'), 'info')
  return true
}

/**
 * The page is hidden or closing: what was played since the last upload goes up now. It used to wait for the next
 * automatic sync (cloudSyncMinutes after the last one), and the push tried as the page closed went through supabase-js,
 * which reads its session asynchronously first, so it never left a closing page. A game added to the home screen keeps
 * a save of its own, apart from the browser's (iPhone), so what it played stayed there and the browser opened on the
 * older cloud copy (2026-10-23). Phones hide the page all the time: at most once per PUSH_GAP_MS, and only when the save
 * changed, as for automatic uploads. A save too big for a request that outlives the page goes the usual way, which
 * still gets through when the page is only hidden.
 */
export function uploadOnLeave() {
  const { auth, save } = useGame.getState()
  const user = auth.userId
  if (!save || !pushAllowed || cloudMoved || auth.status !== 'signed_in' || !user) return
  const realm = realmOf(save)
  const mark = readCloudMark(realm)
  const key = pushKey(save)
  if (key === cloudKey || (mark?.user === user && key === mark.key) || pushGapLeft(mark, user) > 0) return
  if (accessToken && sendSaveOnLeave(user, accessToken, save, knownAt(user, realm))) {
    cancelPush()
    lastTry = Date.now()
    // Taken as written. If it wasn't (refused, lost), the cloud's stamp isn't this one: the next load or upload sees
    // it and compares, as for any copy moved elsewhere.
    cloudKey = key
    rememberCloud(user, realm, save.updatedAt, key, Date.now())
    return
  }
  void getSupabase().then((client) => {
    if (!client) return
    cancelPush()
    schedulePush(() => pushLatest(client, user), 0)
    flushPush()
  })
}

let started = false
export function startBackgroundServices() {
  if (started) return
  started = true
  // A region may have been switched off in admin while this player was standing in it.
  rescueIfRegionDisabled()
  // A small world ends on the server's clock (docs/21): it closes, or sends the player out when switched off.
  startWorldClock()
  startAnalytics()
  // Welcome-back gifts (docs/58): the server is asked once a day whether the player is back from days away.
  startWelcomeBack()
  void initAuth()
  void checkContent()
  // Catching up covers a request sent before the join; hidden by then, it joins when the player comes back (relisten).
  setTimeout(() => {
    if (document.visibilityState === 'visible') void listenForReload(true)
  }, JOIN_AFTER_LOAD_MS)
  tickDayCare()
  // Extreme mode (docs/22): K.O. rests end on the clock, and time out of the game heals.
  startExtremeClocks()
  // Offline earnings (docs/25): an absence left open by the last visit pays now.
  startOfflineClock()
  setInterval(() => {
    if (document.visibilityState === 'visible') checkFreshness(false)
    tickFossils()
    settleExtreme()
  }, 60_000)
  // The Day Care's timer is set from the save as it was; whatever changes it later (a resident left, a friend's
  // Pokémon invited) sets it again here.
  useGame.subscribe((s, prev) => s.save?.dayCare !== prev.save?.dayCare && armDayCareTimer())
  // Another tab of the game stored a newer save (adoptStoredSave).
  window.addEventListener('storage', (e) => {
    if (e.key === saveKeyOf(activeSlot()) && e.newValue) adoptStoredSave(e.newValue)
  })
  // Hiding or closing the page sends what the automatic sync hasn't yet (uploadOnLeave).
  window.addEventListener('pagehide', () => {
    markAway()
    markOfflineAway()
    flushWrite()
    uploadOnLeave()
  })
  document.addEventListener('visibilitychange', () => {
    clearTimeout(leaveTimer)
    if (document.visibilityState === 'hidden') {
      markAway()
      markOfflineAway()
      flushWrite()
      uploadOnLeave()
      leaveTimer = setTimeout(leaveChannel, HIDDEN_LEAVE_MS)
    } else {
      // First: a frozen tab may not have heard another tab's writes, and what follows commits this tab's save.
      adoptStoredSave()
      checkFreshness(true)
      tickFossils()
      tickDayCare()
      void comeBack()
      void collectOfflineGold(true)
    }
  })
}
