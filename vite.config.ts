import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Self-host Excalidraw's hand-drawn fonts (served at ./excalidraw/fonts/…) so the
 * whiteboard works offline and without a third-party CDN. The 13 MB CJK fallback
 * font is skipped; Excalidraw falls back to its CDN for it only when needed.
 */
function excalidrawFonts(): Plugin {
  const root = fileURLToPath(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (f === 'Xiaolai') return []
      return statSync(p).isDirectory() ? files(p) : [p]
    })
  return {
    name: 'excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts', (req, res, next) => {
        const p = join(root, decodeURIComponent((req.url ?? '').split('?')[0]))
        if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) return next()
        res.setHeader('Content-Type', 'font/woff2')
        res.end(readFileSync(p))
      })
    },
    generateBundle() {
      if (!existsSync(root)) return
      for (const f of files(root)) {
        this.emitFile({ type: 'asset', fileName: `excalidraw/fonts/${relative(root, f).replace(/\\/g, '/')}`, source: readFileSync(f) })
      }
    },
  }
}

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), excalidrawFonts()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
})
