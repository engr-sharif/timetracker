import type { SupabaseClient } from '@supabase/supabase-js'

/** Where the Supabase project lives. Only the public (publishable/anon) key — never the secret key. */
export interface CloudConfig {
  url: string
  key: string
}

const KEY = 'wb.cloud'

export function readCloudConfig(): CloudConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return c?.url && c?.key ? c : null
  } catch {
    return null
  }
}

export function writeCloudConfig(cfg: CloudConfig | null) {
  if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg))
  else localStorage.removeItem(KEY)
  client = null
  loading = null
}

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null

/** The client if it has already been created (never triggers a load). */
export const peekSupabase = () => client

/**
 * Lazily loads supabase-js and creates the client, so devices that never use
 * Workbench Cloud don't download it.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (client) return Promise.resolve(client)
  const cfg = readCloudConfig()
  if (!cfg) return Promise.resolve(null)
  loading ??= import('@supabase/supabase-js')
    .then(({ createClient }) => {
      // The config may have changed while the module was loading.
      if (!readCloudConfig()) return null
      client = createClient(cfg.url, cfg.key, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'wb.cloud.session',
        },
        realtime: { params: { eventsPerSecond: 20 } },
      })
      return client
    })
    .finally(() => {
      loading = null
    })
  return loading
}

/** Validates a URL + key pair by hitting the auth health endpoint. */
export async function probeCloud(cfg: CloudConfig) {
  const url = cfg.url.replace(/\/+$/, '')
  if (!/^https:\/\/.+/.test(url)) throw new Error('The project URL should start with https://')
  if (/^sb_secret_|service_role/i.test(cfg.key) || decodeRole(cfg.key) === 'service_role') {
    throw new Error('That is a secret key. Use the publishable (anon) key — never the secret one.')
  }
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: cfg.key } }).catch(() => null)
  if (!res) throw new Error('Could not reach that Supabase project. Check the URL.')
  if (res.status === 401 || res.status === 403) throw new Error('Supabase rejected that key.')
  if (!res.ok) throw new Error(`Supabase returned ${res.status}.`)
  const settings = (await res.json()) as { external?: Record<string, boolean> }
  return { url, github: !!settings.external?.github, email: settings.external?.email !== false }
}

/** Reads the `role` claim of a legacy JWT-style key without verifying it. */
function decodeRole(key: string) {
  const part = key.split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role as string
  } catch {
    return null
  }
}

/** The page URL auth emails and OAuth should come back to (no hash, no query). */
export const authRedirectUrl = () => `${location.origin}${location.pathname}`
