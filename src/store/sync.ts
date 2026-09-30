import { create } from 'zustand'
import { createGist, findGist, readGistDoc, writeGistFiles, DOC_FILE } from '@/lib/gist'
import { docHash, mergeDocs } from '@/lib/sync'
import { migrateV3 } from '@/lib/migrate'
import { useAuth } from './auth'
import { normalizeDoc, useWorkspace } from './workspace'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'offline'

interface SyncState {
  status: SyncStatus
  lastSyncedAt: string | null
  error: string | null
  syncNow: () => Promise<void>
}

let inFlight: Promise<void> | null = null
let rerun = false

async function runSync() {
  const cfg = useAuth.getState().sync
  if (!cfg?.token) {
    useSync.setState({ status: 'off' })
    return
  }
  if (!navigator.onLine) {
    useSync.setState({ status: 'offline' })
    return
  }
  useSync.setState({ status: 'syncing', error: null })
  try {
    let gistId = cfg.gistId
    if (!gistId) {
      gistId = (await findGist(cfg.token)) ?? undefined
      if (!gistId) gistId = await createGist(cfg.token, JSON.stringify(useWorkspace.getState().doc))
      useAuth.getState().setSync({ ...cfg, gistId })
    }

    const remote = await readGistDoc(cfg.token, gistId)
    const remoteDoc = remote.doc ? normalizeDoc(remote.doc) : remote.legacy ? migrateV3(remote.legacy) : null
    const remoteHash = remote.doc ? docHash(remoteDoc!) : ''

    // Merge against the *current* local doc (it may have changed while we awaited).
    const local = useWorkspace.getState().doc
    const merged = remoteDoc ? mergeDocs(local, remoteDoc) : local
    const mergedHash = docHash(merged)
    if (mergedHash !== docHash(local)) useWorkspace.getState().replaceDoc(merged)

    if (mergedHash !== remoteHash) {
      await writeGistFiles(cfg.token, gistId, { [DOC_FILE]: JSON.stringify(merged) })
    }
    useSync.setState({ status: 'idle', lastSyncedAt: new Date().toISOString() })
  } catch (e) {
    useSync.setState({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed' })
  }
}

export const useSync = create<SyncState>(() => ({
  status: useAuth.getState().sync?.token ? 'idle' : 'off',
  lastSyncedAt: null,
  error: null,
  async syncNow() {
    if (inFlight) {
      rerun = true
      return inFlight
    }
    inFlight = (async () => {
      do {
        rerun = false
        await runSync()
      } while (rerun)
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  },
}))

/** Wire up background sync: after local edits, on an interval, on focus and when back online. */
export function startSyncEngine() {
  let debounce: ReturnType<typeof setTimeout> | undefined
  const kick = (delay = 0) => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void useSync.getState().syncNow(), delay)
  }

  const unsubWs = useWorkspace.subscribe((s, prev) => {
    if (s.revision !== prev.revision) kick(2500)
  })
  const unsubAuth = useAuth.subscribe((s, prev) => {
    if (s.sync?.token !== prev.sync?.token) kick(0)
  })
  const onFocus = () => document.visibilityState === 'visible' && kick(300)
  const onOnline = () => kick(300)
  document.addEventListener('visibilitychange', onFocus)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', () => useSync.setState({ status: 'offline' }))
  const interval = setInterval(() => kick(0), 90_000)
  kick(0)

  return () => {
    unsubWs()
    unsubAuth()
    clearInterval(interval)
    clearTimeout(debounce)
    document.removeEventListener('visibilitychange', onFocus)
    window.removeEventListener('online', onOnline)
  }
}
