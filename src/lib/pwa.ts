import { create } from 'zustand'

/**
 * Installed-app ("Add to Home Screen") support: install prompts, standalone detection,
 * service-worker updates, and files arriving from the OS (share sheet / "Open with").
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isMobile = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820

interface PwaState {
  /** Android/desktop Chromium: the deferred install prompt */
  prompt: BeforeInstallPromptEvent | null
  installed: boolean
  install: () => Promise<boolean>
}

export const usePwa = create<PwaState>((set, get) => ({
  prompt: null,
  installed: typeof window !== 'undefined' && isStandalone(),
  async install() {
    const p = get().prompt
    if (!p) return false
    await p.prompt()
    const { outcome } = await p.userChoice
    set({ prompt: null, installed: outcome === 'accepted' || get().installed })
    return outcome === 'accepted'
  },
}))

/* ------------------------------------------------------------------ */
/*  Incoming files and text                                            */
/* ------------------------------------------------------------------ */

const SHARE = 'workbench-share'

export interface SharedItem {
  title: string
  text: string
  url: string
  files: File[]
}

/** Reads (and clears) whatever was last shared or opened into the app. */
export async function takeShared(): Promise<SharedItem | null> {
  if (!('caches' in window)) return null
  const cache = await caches.open(SHARE)
  const metaRes = await cache.match('./share/meta')
  if (!metaRes) return null
  const meta = (await metaRes.json()) as { title: string; text: string; url: string; files: { name: string; type: string; key: string }[] }
  const files: File[] = []
  for (const f of meta.files) {
    const r = await cache.match(f.key)
    if (r) files.push(new File([await r.blob()], f.name, { type: f.type }))
  }
  for (const key of await cache.keys()) await cache.delete(key)
  return { title: meta.title, text: meta.text, url: meta.url, files }
}

/** Parks files the same way the service worker does, so one screen handles both. */
async function parkFiles(files: File[]) {
  const cache = await caches.open(SHARE)
  for (const key of await cache.keys()) await cache.delete(key)
  const meta = { title: '', text: '', url: '', files: files.map((f, i) => ({ name: f.name, type: f.type, key: `./share/file/${i}` })) }
  await Promise.all(files.map((f, i) => cache.put(meta.files[i].key, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }))))
  await cache.put('./share/meta', new Response(JSON.stringify(meta)))
}

/* ------------------------------------------------------------------ */
/*  Startup                                                            */
/* ------------------------------------------------------------------ */

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    usePwa.setState({ prompt: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, prompt: null }))

  // After a deploy, an open tab may ask for a code-split chunk that no longer exists.
  // Reload once to pick up the new build instead of showing a broken screen.
  window.addEventListener('vite:preloadError', (e) => {
    const key = 'wb.reloadedForUpdate'
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    e.preventDefault()
    location.reload()
  })

  // Desktop "Open with Workbench" (file_handlers in the manifest).
  const lq = (window as unknown as { launchQueue?: { setConsumer: (fn: (p: { files: { getFile: () => Promise<File> }[] }) => void) => void } }).launchQueue
  lq?.setConsumer(async (params) => {
    if (!params.files?.length) return
    const files = await Promise.all(params.files.map((h) => h.getFile()))
    await parkFiles(files)
    location.hash = '#/share'
  })

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          // Installed apps can stay open for days: look for a new version when brought back.
          document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update().catch(() => {}))
        })
        .catch(() => {})
    })
  }
}
