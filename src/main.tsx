import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import { useWorkspace } from '@/store/workspace'
import { App } from '@/app/App'
import { initCloudAuth } from '@/store/cloud'
import { initLinkCapture } from '@/lib/link'
import { initPwa } from '@/lib/pwa'

// Whiteboard fonts are self-hosted next to the app (see vite.config.ts).
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', location.href).href

// A device link (#/link/…) is read and stripped from the address bar before anything else.
initLinkCapture()
initPwa()

// Finish any Supabase email-link / OAuth sign-in in the URL as early as possible.
void initCloudAuth()

// App-style layout: panels scroll, the document never does. Guard against anything
// (focus, scrollIntoView, find-in-page) nudging the whole UI sideways.
window.addEventListener('scroll', () => (window.scrollX || window.scrollY) && window.scrollTo(0, 0), { passive: true })

const root = createRoot(document.getElementById('root')!)

useWorkspace
  .getState()
  .load()
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
