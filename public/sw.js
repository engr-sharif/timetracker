// Workbench service worker.
// - App shell: navigations are network-first with a cached fallback, so the app opens offline.
// - Hashed build assets and self-hosted vendor files (PDF, OCR, whiteboard fonts) are
//   cache-first once used, so PDF Studio, OCR and boards keep working offline.
// - Share target: files/text shared to the installed app (Android, desktop) are parked in a
//   cache and the app is opened on #/share to decide what to do with them.
const CACHE = 'workbench-v1'
const VENDOR = 'workbench-vendor-v1'
const SHARE = 'workbench-share'
const VENDOR_PATHS = ['/pdfjs/', '/ocr/', '/excalidraw/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg', './apple-touch-icon.png', './icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE, VENDOR, SHARE])
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const cacheFirst = (cacheName, req) =>
  caches.match(req).then(
    (hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(cacheName).then((c) => c.put(req, copy))
        }
        return res
      }),
  )

async function receiveShare(request) {
  const form = await request.formData()
  const cache = await caches.open(SHARE)
  for (const key of await cache.keys()) await cache.delete(key)
  const files = form.getAll('files').filter((f) => typeof f !== 'string' && f.size > 0)
  const meta = {
    title: form.get('title') || '',
    text: form.get('text') || '',
    url: form.get('url') || '',
    files: files.map((f, i) => ({ name: f.name || `shared-${i + 1}`, type: f.type, size: f.size, key: `./share/file/${i}` })),
    at: Date.now(),
  }
  await Promise.all(files.map((f, i) => cache.put(meta.files[i].key, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }))))
  await cache.put('./share/meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }))
  return Response.redirect('./#/share', 303)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(req).catch(() => Response.redirect('./#/', 303)))
    return
  }
  if (req.method !== 'GET') return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html')),
    )
    return
  }

  if (url.pathname.includes('/assets/')) return event.respondWith(cacheFirst(CACHE, req))
  if (VENDOR_PATHS.some((p) => url.pathname.includes(p))) return event.respondWith(cacheFirst(VENDOR, req))
})
