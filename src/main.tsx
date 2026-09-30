import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import { useWorkspace } from '@/store/workspace'
import { App } from '@/app/App'
import { initCloudAuth } from '@/store/cloud'

// Whiteboard fonts are self-hosted next to the app (see vite.config.ts).
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', location.href).href

// Finish any Supabase email-link / OAuth sign-in in the URL as early as possible.
void initCloudAuth()

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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
