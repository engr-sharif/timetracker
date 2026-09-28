import { create } from 'zustand'
import { hashPassword, legacySha256, randomSalt, safeEqual } from '@/lib/crypto'
import { readLegacyLocal } from '@/lib/migrate'
import type { Hue } from './types'

export interface Account {
  name: string
  email?: string
  title?: string
  company?: string
  employeeId?: string
  avatar?: string
  color: Hue
  salt: string
  hash: string
  createdAt: string
}

export interface SyncConfig {
  token: string
  gistId?: string
  login?: string
  avatar?: string
}

type Status = 'setup' | 'locked' | 'unlocked'

const ACCOUNT_KEY = 'wb.account'
const SYNC_KEY = 'wb.sync'
const SESSION_KEY = 'wb.session'
const REMEMBER_DAYS = 14

const readJSON = <T,>(key: string, store: Storage = localStorage): T | null => {
  try {
    return JSON.parse(store.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function sessionValid() {
  const s = readJSON<{ until: number }>(SESSION_KEY, sessionStorage) ?? readJSON<{ until: number }>(SESSION_KEY)
  return !!s && s.until > Date.now()
}

function initialStatus(): Status {
  const account = readJSON<Account>(ACCOUNT_KEY)
  if (!account) return readLegacyLocal() ? 'locked' : 'setup'
  return sessionValid() ? 'unlocked' : 'locked'
}

interface AuthState {
  status: Status
  account: Account | null
  sync: SyncConfig | null
  /** set when a v3 TimeTracker login exists but hasn't been upgraded yet */
  legacy: ReturnType<typeof readLegacyLocal>
  createAccount: (input: { name: string; password: string; email?: string; title?: string; company?: string; color: Hue; remember: boolean }) => Promise<void>
  unlock: (password: string, remember: boolean) => Promise<boolean>
  lock: () => void
  updateAccount: (patch: Partial<Omit<Account, 'salt' | 'hash'>>) => void
  changePassword: (current: string, next: string) => Promise<boolean>
  setSync: (cfg: SyncConfig | null) => void
  resetEverything: () => Promise<void>
}

function startSession(remember: boolean) {
  const until = Date.now() + (remember ? REMEMBER_DAYS * 86400_000 : 12 * 3600_000)
  const value = JSON.stringify({ until })
  sessionStorage.setItem(SESSION_KEY, value)
  if (remember) localStorage.setItem(SESSION_KEY, value)
  else localStorage.removeItem(SESSION_KEY)
}

export const useAuth = create<AuthState>((set, get) => ({
  status: initialStatus(),
  account: readJSON<Account>(ACCOUNT_KEY),
  sync: readJSON<SyncConfig>(SYNC_KEY),
  legacy: readJSON<Account>(ACCOUNT_KEY) ? null : readLegacyLocal(),

  async createAccount({ password, remember, ...profile }) {
    const salt = randomSalt()
    const account: Account = {
      ...profile,
      salt,
      hash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
    startSession(remember)
    set({ account, status: 'unlocked' })
  },

  async unlock(password, remember) {
    const { account, legacy } = get()
    if (account) {
      const ok = safeEqual(await hashPassword(password, account.salt), account.hash)
      if (ok) {
        startSession(remember)
        set({ status: 'unlocked' })
      }
      return ok
    }
    if (legacy) {
      // One-time upgrade from the v3 TimeTracker: verify the old hash, then re-hash with PBKDF2.
      if (!safeEqual(await legacySha256(password), legacy.passwordHash)) return false
      const salt = randomSalt()
      const upgraded: Account = {
        name: legacy.name || 'Engineer',
        employeeId: legacy.employeeId,
        avatar: legacy.avatar,
        color: 'violet',
        salt,
        hash: await hashPassword(password, salt),
        createdAt: new Date().toISOString(),
      }
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(upgraded))
      if (legacy.token) {
        const sync: SyncConfig = { token: legacy.token, gistId: legacy.gistId, login: legacy.login, avatar: legacy.avatar }
        localStorage.setItem(SYNC_KEY, JSON.stringify(sync))
        set({ sync })
      }
      startSession(remember)
      set({ account: upgraded, legacy: null, status: 'unlocked' })
      return true
    }
    return false
  },

  lock() {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
    set({ status: get().account || get().legacy ? 'locked' : 'setup' })
  },

  updateAccount(patch) {
    const account = get().account
    if (!account) return
    const next = { ...account, ...patch }
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next))
    set({ account: next })
  },

  async changePassword(current, next) {
    const account = get().account
    if (!account) return false
    if (!safeEqual(await hashPassword(current, account.salt), account.hash)) return false
    const salt = randomSalt()
    const updated = { ...account, salt, hash: await hashPassword(next, salt) }
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(updated))
    set({ account: updated })
    return true
  },

  setSync(cfg) {
    if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(SYNC_KEY)
    set({ sync: cfg })
  },

  async resetEverything() {
    for (const k of Object.keys(localStorage)) if (k.startsWith('wb.') || k.startsWith('jtt_')) localStorage.removeItem(k)
    sessionStorage.clear()
    await Promise.all(
      ['workbench', 'workbench-blobs'].map(
        (name) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name)
            req.onsuccess = req.onerror = req.onblocked = () => resolve()
          }),
      ),
    )
    location.reload()
  },
}))
