import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const MIME: Record<string, string> = {
  woff2: 'font/woff2',
  js: 'text/javascript',
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  bcmap: 'application/octet-stream',
  pfb: 'application/octet-stream',
  ttf: 'font/ttf',
  icc: 'application/octet-stream',
}

/**
 * Serves (dev) and emits (build) vendor assets from node_modules under a public prefix,
 * so heavy runtime assets load on demand from our own origin instead of a third-party CDN:
 * - Excalidraw's hand-drawn fonts (the 13 MB CJK fallback is skipped)
 * - pdf.js character maps, standard fonts and image-decoder wasm
 * - the Tesseract OCR worker and its LSTM wasm cores
 */
function selfHost(mounts: { prefix: string; dir: string; include?: (file: string) => boolean }[]): Plugin {
  const abs = (d: string) => fileURLToPath(new URL(`./node_modules/${d}`, import.meta.url))
  const files = (dir: string, root: string, include?: (f: string) => boolean): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return f === 'Xiaolai' ? [] : files(p, root, include)
      return !include || include(relative(root, p)) ? [p] : []
    })
  return {
    name: 'self-host-vendor-assets',
    configureServer(server) {
      for (const m of mounts) {
        const root = abs(m.dir)
        server.middlewares.use(`/${m.prefix}`, (req, res, next) => {
          const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
          const p = join(root, rel)
          if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory() || (m.include && !m.include(rel))) return next()
          res.setHeader('Content-Type', MIME[p.split('.').pop() ?? ''] ?? 'application/octet-stream')
          res.end(readFileSync(p))
        })
      }
    },
    generateBundle() {
      for (const m of mounts) {
        const root = abs(m.dir)
        if (!existsSync(root)) continue
        for (const f of files(root, root, m.include)) {
          this.emitFile({ type: 'asset', fileName: `${m.prefix}/${relative(root, f).replace(/\\/g, '/')}`, source: readFileSync(f) })
        }
      }
    },
  }
}

const vendorAssets = selfHost([
  { prefix: 'excalidraw/fonts', dir: '@excalidraw/excalidraw/dist/prod/fonts' },
  { prefix: 'pdfjs/cmaps', dir: 'pdfjs-dist/cmaps' },
  { prefix: 'pdfjs/standard_fonts', dir: 'pdfjs-dist/standard_fonts' },
  { prefix: 'pdfjs/wasm', dir: 'pdfjs-dist/wasm', include: (f) => /\.(wasm|js)$/.test(f) && !f.startsWith('quickjs') },
  { prefix: 'pdfjs/iccs', dir: 'pdfjs-dist/iccs' },
  { prefix: 'ocr', dir: 'tesseract.js/dist', include: (f) => f === 'worker.min.js' },
  { prefix: 'ocr/core', dir: 'tesseract.js-core', include: (f) => /lstm\.wasm\.js$/.test(f) },
])

// Relative base so the build works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), vendorAssets],
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
