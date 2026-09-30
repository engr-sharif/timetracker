import { create } from 'zustand'
import type { RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { authRedirectUrl, getSupabase, peekSupabase, readCloudConfig, writeCloudConfig, type CloudConfig } from '@/lib/supabase'
import { docHash, mergeDocs } from '@/lib/sync'
import { deleteBlob, getLocalBlob, setRemoteBlobSource } from '@/lib/files'
import { COLLECTIONS, type CollectionName, type WorkspaceDoc } from './types'
import { emptyDoc, useWorkspace } from './workspace'

/**
 * Supabase sync engine.
 * - Pull: rows with seq > cursor (server-assigned, clock independent), merged record-by-record.
 * - Push: local records/tombstones edited since the last push, via the wb_push RPC (last-writer-wins).
 * - Live: Postgres changes stream in over Realtime while the app is open.
 * - Files: blobs upload to a private bucket and download on demand on other devices.
 */

export type CloudStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline'

export interface CloudUser {
  id: string
  email?: string
  name?: string
  avatar?: string
}

interface CloudState {
  configured: boolean
  status: CloudStatus
  user: CloudUser | null
  live: boolean
  lastSyncedAt: string | null
  error: string | null
  pendingUploads: number
  connect: (cfg: CloudConfig) => void
  disconnect: () => Promise<void>
  signInPassword: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<'signed-in' | 'confirm-email'>
  signInMagic: (email: string) => Promise<void>
  signInGithub: () => Promise<void>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
}

const BUCKET = 'workbench-files'
const MAX_UPLOAD = 50 * 1024 * 1024
const PAGE = 1000
const OVERLAP = 200

interface Cursor {
  seq: number
  pushedAt: string
}

const cursorKey = (uid: string) => `wb.cloud.cursor.${uid}`
const readCursor = (uid: string): Cursor => {
  try {
    return { seq: 0, pushedAt: '', ...JSON.parse(localStorage.getItem(cursorKey(uid)) ?? '{}') }
  } catch {
    return { seq: 0, pushedAt: '' }
  }
}
const writeCursor = (uid: string, c: Cursor) => localStorage.setItem(cursorKey(uid), JSON.stringify(c))

const toUser = (u: User | null | undefined): CloudUser | null =>
  u
    ? {
        id: u.id,
        email: u.email,
        name: (u.user_metadata?.full_name as string) || (u.user_metadata?.user_name as string) || undefined,
        avatar: u.user_metadata?.avatar_url as string | undefined,
      }
    : null

/* ------------------------------------------------------------------ */
/*  Row <-> doc mapping                                                */
/* ------------------------------------------------------------------ */

interface Row {
  id: string
  collection: string
  data: Record<string, unknown> | null
  updated_at: string
  deleted: boolean
  seq?: number
}

const isCollection = (c: string): c is CollectionName => (COLLECTIONS as string[]).includes(c)

/** Merge a batch of server rows into the local workspace. Returns true if anything changed. */
function applyRows(rows: Row[]) {
  if (!rows.length) return false
  const remote: WorkspaceDoc = emptyDoc()
  const removedFiles: string[] = []
  const local = useWorkspace.getState().doc
  for (const r of rows) {
    // Postgres timestamptz comes back as "2026-01-01T00:00:00+00:00"; normalise to the app's ISO form.
    const ts = new Date(r.updated_at).toISOString()
    if (r.deleted) {
      remote.tombstones[r.id] = ts
      if (local.tables.files[r.id]) removedFiles.push(r.id)
    } else if (r.collection === '_settings' && r.data) {
      remote.settings = { ...remote.settings, ...(r.data as object), updatedAt: ts } as WorkspaceDoc['settings']
    } else if (r.collection === '_week' && r.data) {
      remote.submittedWeeks[r.id.replace(/^week:/, '')] = String(r.data.submittedAt ?? ts)
    } else if (isCollection(r.collection) && r.data) {
      ;(remote.tables[r.collection] as Record<string, unknown>)[r.id] = { ...r.data, id: r.id, updatedAt: ts }
    }
  }
  const current = useWorkspace.getState().doc
  const merged = mergeDocs(current, remote)
  const changed = docHash(merged) !== docHash(current)
  if (changed) useWorkspace.getState().replaceDoc(merged)
  for (const id of removedFiles) if (!merged.tables.files[id]) void deleteBlob(id)
  return changed
}

/** Everything edited locally at or after `since`, as push rows. */
function collectChanges(doc: WorkspaceDoc, since: string): Row[] {
  const rows: Row[] = []
  for (const col of COLLECTIONS) {
    for (const rec of Object.values(doc.tables[col]) as { id: string; updatedAt: string }[]) {
      if (rec.updatedAt >= since) rows.push({ id: rec.id, collection: col, data: rec as unknown as Record<string, unknown>, updated_at: rec.updatedAt, deleted: false })
    }
  }
  for (const [id, ts] of Object.entries(doc.tombstones)) {
    if (ts >= since) rows.push({ id, collection: '_deleted', data: null, updated_at: ts, deleted: true })
  }
  if (doc.settings.updatedAt >= since) {
    rows.push({ id: 'settings', collection: '_settings', data: doc.settings as unknown as Record<string, unknown>, updated_at: doc.settings.updatedAt, deleted: false })
  }
  for (const [week, ts] of Object.entries(doc.submittedWeeks)) {
    if (ts >= since) rows.push({ id: `week:${week}`, collection: '_week', data: { submittedAt: ts }, updated_at: ts, deleted: false })
  }
  return rows
}

/* ------------------------------------------------------------------ */
/*  Engine                                                             */
/* ------------------------------------------------------------------ */

let channel: RealtimeChannel | null = null
/** Sync only runs while the workspace is loaded and unlocked (see startCloudEngine). */
let engineRunning = false
let inFlight: Promise<void> | null = null
let rerun = false

async function pull(sb: SupabaseClient, uid: string) {
  const cursor = readCursor(uid)
  let from = Math.max(0, cursor.seq - OVERLAP)
  let maxSeq = cursor.seq
  for (;;) {
    const { data, error } = await sb
      .from('wb_records')
      .select('id,collection,data,updated_at,deleted,seq')
      .gt('seq', from)
      .order('seq', { ascending: true })
      .limit(PAGE)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Row[]
    applyRows(rows)
    for (const r of rows) maxSeq = Math.max(maxSeq, r.seq ?? 0)
    if (rows.length < PAGE) break
    from = rows[rows.length - 1].seq ?? from
  }
  writeCursor(uid, { ...readCursor(uid), seq: maxSeq })
}

async function push(sb: SupabaseClient, uid: string) {
  const cursor = readCursor(uid)
  const started = new Date().toISOString()
  const rows = collectChanges(useWorkspace.getState().doc, cursor.pushedAt)
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400).map(({ seq: _seq, ...r }) => r)
    const { error } = await sb.rpc('wb_push', { records: chunk })
    if (error) {
      if (/function .*wb_push|schema cache/i.test(error.message)) {
        throw new Error('Database not set up yet — run the Workbench SQL script in Supabase (Settings → Cloud).')
      }
      throw new Error(error.message)
    }
  }
  writeCursor(uid, { ...readCursor(uid), pushedAt: started })
}

async function uploadFiles(sb: SupabaseClient, uid: string) {
  const pending = Object.values(useWorkspace.getState().doc.tables.files).filter((f) => !f.synced)
  useCloud.setState({ pendingUploads: pending.length })
  for (const f of pending) {
    const blob = await getLocalBlob(f.id)
    if (!blob) continue // lives on another device
    if (blob.size > MAX_UPLOAD) continue
    const { error } = await sb.storage.from(BUCKET).upload(`${uid}/${f.id}`, blob, { upsert: true, contentType: f.type || 'application/octet-stream' })
    if (error && !/exists/i.test(error.message)) throw new Error(`File upload failed: ${error.message}`)
    useWorkspace.getState().update('files', f.id, { synced: true })
    useCloud.setState((s) => ({ pendingUploads: Math.max(0, s.pendingUploads - 1) }))
  }
}

async function runCloudSync() {
  const sb = await getSupabase()
  if (!sb) return useCloud.setState({ status: 'off' })
  if (!engineRunning || !useWorkspace.getState().ready) return
  const { data } = await sb.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return useCloud.setState({ status: 'signed-out', live: false })
  if (!navigator.onLine) return useCloud.setState({ status: 'offline' })
  useCloud.setState({ status: 'syncing', error: null })
  try {
    await pull(sb, uid)
    await push(sb, uid)
    await uploadFiles(sb, uid)
    useCloud.setState({ status: 'idle', lastSyncedAt: new Date().toISOString() })
  } catch (e) {
    useCloud.setState({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed' })
  }
}

function subscribeLive(sb: SupabaseClient, uid: string) {
  if (channel) void sb.removeChannel(channel)
  channel = sb
    .channel(`wb-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wb_records', filter: `user_id=eq.${uid}` }, (payload) => {
      const row = payload.new as Row
      if (!row?.id) return
      applyRows([row])
      const c = readCursor(uid)
      if ((row.seq ?? 0) > c.seq) writeCursor(uid, { ...c, seq: row.seq! })
      useCloud.setState({ lastSyncedAt: new Date().toISOString() })
    })
    .subscribe((status) => useCloud.setState({ live: status === 'SUBSCRIBED' }))
}

function unsubscribeLive() {
  const sb = peekSupabase()
  if (channel && sb) void sb.removeChannel(channel)
  channel = null
  useCloud.setState({ live: false })
}

export const useCloud = create<CloudState>((set) => ({
  configured: !!readCloudConfig(),
  status: readCloudConfig() ? 'signed-out' : 'off',
  user: null,
  live: false,
  lastSyncedAt: null,
  error: null,
  pendingUploads: 0,

  connect(cfg) {
    writeCloudConfig(cfg)
    set({ configured: true, status: 'signed-out', error: null })
    void initCloudAuth()
  },

  async disconnect() {
    unsubscribeLive()
    await (await getSupabase())?.auth.signOut({ scope: 'local' }).catch(() => {})
    writeCloudConfig(null)
    authInitialised = false
    set({ configured: false, status: 'off', user: null, error: null })
  },

  async signInPassword(email, password) {
    const sb = await getSupabase()
    if (!sb) throw new Error('Connect a Supabase project first')
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  },

  async signUp(email, password) {
    const sb = await getSupabase()
    if (!sb) throw new Error('Connect a Supabase project first')
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } })
    if (error) throw new Error(error.message)
    return data.session ? 'signed-in' : 'confirm-email'
  },

  async signInMagic(email) {
    const sb = await getSupabase()
    if (!sb) throw new Error('Connect a Supabase project first')
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } })
    if (error) throw new Error(error.message)
  },

  async signInGithub() {
    const sb = await getSupabase()
    if (!sb) throw new Error('Connect a Supabase project first')
    const { error } = await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: authRedirectUrl() } })
    if (error) throw new Error(error.message)
  },

  async signOut() {
    unsubscribeLive()
    await (await getSupabase())?.auth.signOut()
    set({ user: null, status: 'signed-out' })
  },

  async syncNow() {
    if (inFlight) {
      rerun = true
      return inFlight
    }
    inFlight = (async () => {
      do {
        rerun = false
        await runCloudSync()
      } while (rerun)
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  },
}))

/* ------------------------------------------------------------------ */
/*  Bootstrapping                                                      */
/* ------------------------------------------------------------------ */

let authInitialised = false

/**
 * Creates the client (which also completes an email-link / OAuth sign-in from the URL)
 * and tracks the session. Safe to call more than once.
 */
export async function initCloudAuth() {
  if (authInitialised || !readCloudConfig()) return
  authInitialised = true
  const sb = await getSupabase()
  if (!sb) {
    authInitialised = false
    return
  }

  setRemoteBlobSource(async (id) => {
    const user = useCloud.getState().user
    if (!user) return null
    const { data, error } = await sb.storage.from(BUCKET).download(`${user.id}/${id}`)
    return error ? null : data
  })

  sb.auth.onAuthStateChange((event, session) => {
    const user = toUser(session?.user)
    const prev = useCloud.getState().user
    useCloud.setState({ user, status: user ? useCloud.getState().status === 'signed-out' ? 'idle' : useCloud.getState().status : 'signed-out' })
    if (user && user.id !== prev?.id && engineRunning) {
      subscribeLive(sb, user.id)
      void useCloud.getState().syncNow()
      if (event === 'SIGNED_IN' && prev === null && document.visibilityState === 'visible') {
        toast.success('Signed in to Workbench Cloud', { description: user.email })
      }
    }
    if (!user) unsubscribeLive()
  })

  // Tidy the ?code=… / #access_token… left behind by an auth redirect.
  void sb.auth.getSession().then(() => {
    const url = new URL(location.href)
    if (url.searchParams.has('code') || url.searchParams.has('error_description')) {
      const desc = url.searchParams.get('error_description')
      if (desc) toast.error(desc)
      history.replaceState(null, '', `${url.origin}${url.pathname}${url.hash.startsWith('#/') ? url.hash : '#/'}`)
    }
  })
}

/** Background sync while the app is unlocked. Returns a stop function. */
export function startCloudEngine() {
  void initCloudAuth()
  engineRunning = true
  const sb = peekSupabase()
  const user = useCloud.getState().user
  if (sb && user) subscribeLive(sb, user.id)
  let debounce: ReturnType<typeof setTimeout> | undefined
  const kick = (delay = 0) => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      if (useCloud.getState().user) void useCloud.getState().syncNow()
    }, delay)
  }
  const unsub = useWorkspace.subscribe((s, prev) => {
    if (s.revision !== prev.revision) kick(1200)
  })
  const onVisible = () => document.visibilityState === 'visible' && kick(200)
  const onOnline = () => kick(200)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  const interval = setInterval(() => kick(0), 5 * 60_000)
  kick(0)
  return () => {
    engineRunning = false
    unsubscribeLive()
    unsub()
    clearInterval(interval)
    clearTimeout(debounce)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  }
}

/** Removes a file's cloud copy (called when a file is deleted). */
export async function deleteCloudBlob(id: string) {
  const sb = peekSupabase()
  const user = useCloud.getState().user
  if (!sb || !user) return
  await sb.storage.from(BUCKET).remove([`${user.id}/${id}`])
}
