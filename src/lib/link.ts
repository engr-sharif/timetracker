import type { Hue } from '@/store/types'
import type { CloudConfig } from './supabase'

/**
 * "Link a device": a signed-in device shows a QR code / link that carries its sync
 * settings, so a phone can join the same workspace without typing a token. The data
 * travels in the URL fragment (never sent to the web server) and is stripped from the
 * address bar as soon as the app reads it.
 */

export interface LinkPayload {
  v: 1
  /** expiry, ms since epoch */
  exp: number
  gist?: { token: string; login?: string; avatar?: string; gistId?: string }
  cloud?: CloudConfig
  profile?: { name: string; title?: string; company?: string; color: Hue }
}

const PREFIX = '#/link/'
const PENDING = 'wb.link'
export const LINK_TTL_MIN = 10

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))

export function makeLinkUrl(p: Omit<LinkPayload, 'v' | 'exp'>) {
  const payload: LinkPayload = { v: 1, exp: Date.now() + LINK_TTL_MIN * 60_000, ...p }
  return `${location.origin}${location.pathname}${PREFIX}${b64url(JSON.stringify(payload))}`
}

function parse(data: string): LinkPayload | null {
  try {
    const p = JSON.parse(unb64url(data)) as LinkPayload
    if (p?.v !== 1 || typeof p.exp !== 'number') return null
    if (p.gist && typeof p.gist.token !== 'string') return null
    if (p.cloud && (typeof p.cloud.url !== 'string' || typeof p.cloud.key !== 'string')) return null
    return p
  } catch {
    return null
  }
}

/**
 * Call once at startup: moves a link in the address bar into this tab's session
 * storage and cleans the URL. Returns 'expired' / 'invalid' so the UI can explain.
 */
export function captureLinkFromUrl(): 'none' | 'ok' | 'expired' | 'invalid' {
  if (!location.hash.startsWith(PREFIX)) return 'none'
  const p = parse(location.hash.slice(PREFIX.length))
  history.replaceState(null, '', `${location.origin}${location.pathname}#/`)
  if (!p) return 'invalid'
  if (p.exp < Date.now()) return 'expired'
  sessionStorage.setItem(PENDING, JSON.stringify(p))
  return 'ok'
}

/** Accepts a link pasted or scanned inside the app (e.g. the iPhone Home Screen app). */
export function acceptLinkText(text: string): 'ok' | 'expired' | 'invalid' {
  const i = text.indexOf(PREFIX)
  if (i < 0) return 'invalid'
  const p = parse(text.slice(i + PREFIX.length).trim().split(/\s/)[0])
  if (!p) return 'invalid'
  if (p.exp < Date.now()) return 'expired'
  sessionStorage.setItem(PENDING, JSON.stringify(p))
  return 'ok'
}

export function pendingLink(): LinkPayload | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as LinkPayload | null
    return p && p.exp > Date.now() - 60 * 60_000 ? p : null
  } catch {
    return null
  }
}

export const clearPendingLink = () => sessionStorage.removeItem(PENDING)

export let linkCaptureResult: ReturnType<typeof captureLinkFromUrl> = 'none'
export function initLinkCapture() {
  linkCaptureResult = captureLinkFromUrl()
}

/* ------------------------------------------------------------------ */
/*  Saved logins                                                       */
/* ------------------------------------------------------------------ */

/** Username under which the GitHub sync key is saved in password managers. */
export const gistLoginName = (login?: string) => `github:${login ?? 'sync'}`
export const parseGistLoginName = (s: string) => s.trim().replace(/^github:/i, '')

type PasswordCredentialCtor = new (init: { id: string; password: string; name?: string; iconURL?: string }) => Credential

/**
 * Asks the browser's password manager to save a login (Chrome/Edge/Android support this
 * directly; Safari offers to save when a login form is submitted instead).
 */
export async function rememberLogin(id: string, password: string, name?: string, iconURL?: string) {
  const Ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential
  if (!Ctor || !navigator.credentials?.store) return false
  try {
    await navigator.credentials.store(new Ctor({ id, password, name, iconURL }))
    return true
  } catch {
    return false
  }
}
