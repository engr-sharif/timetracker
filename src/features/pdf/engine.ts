// pdf.js's legacy build carries polyfills for newer JS built-ins (e.g. Map.getOrInsertComputed)
// that current Safari and some Chromium releases don't ship yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval'
import { getBlob } from '@/lib/files'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Vendor assets are self-hosted next to index.html (see vite.config.ts). */
const asset = (p: string) => new URL(p, document.baseURI).href

/* ------------------------------------------------------------------ */
/*  Documents                                                          */
/* ------------------------------------------------------------------ */

const docs = new Map<string, Promise<PDFDocumentProxy>>()

export async function readBytes(fileId: string) {
  const blob = await getBlob(fileId)
  if (!blob) throw new Error('This PDF isn’t on this device yet.')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Opens (and caches) the pdf.js document for a stored file. */
export function loadPdf(fileId: string, password?: string): Promise<PDFDocumentProxy> {
  let p = docs.get(fileId)
  if (!p) {
    p = readBytes(fileId).then(
      (data) =>
        pdfjs.getDocument({
          data,
          password,
          cMapUrl: asset('pdfjs/cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: asset('pdfjs/standard_fonts/'),
          wasmUrl: asset('pdfjs/wasm/'),
          iccUrl: asset('pdfjs/iccs/'),
        }).promise,
    )
    p.catch(() => docs.delete(fileId))
    docs.set(fileId, p)
  }
  return p
}

export function forgetPdf(fileId: string) {
  const p = docs.get(fileId)
  docs.delete(fileId)
  void p?.then((d) => d.loadingTask.destroy()).catch(() => {})
}

export const isPasswordError = (e: unknown) => e instanceof pdfjs.PasswordException

export async function getPage(fileId: string, index: number): Promise<PDFPageProxy> {
  return (await loadPdf(fileId)).getPage(index + 1)
}

/** Viewport for a page with Studio's extra rotation on top of the page's own. */
export function viewportFor(page: PDFPageProxy, scale: number, extraRotate: number): PageViewport {
  return page.getViewport({ scale, rotation: (page.rotate + extraRotate) % 360 })
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

export interface RenderHandle {
  cancel: () => void
  promise: Promise<void>
}

/** Renders a page into a canvas at `scale` CSS px per point, sharp on high-DPI screens. */
export function renderToCanvas(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, extraRotate: number, maxPixels = 16_000_000): RenderHandle {
  const vp = viewportFor(page, scale, extraRotate)
  let dpr = Math.min(window.devicePixelRatio || 1, 3)
  // Large drawings at high zoom can exceed the browser's canvas limits.
  while (vp.width * vp.height * dpr * dpr > maxPixels && dpr > 0.5) dpr *= 0.8
  const w = Math.floor(vp.width * dpr)
  const h = Math.floor(vp.height * dpr)
  const scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  const task = page.render({ canvas: scratch, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined, annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS })
  // Draw into an off-screen canvas then swap, so zooming never flashes blank.
  const promise = task.promise.then(() => {
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(scratch, 0, 0)
    scratch.width = scratch.height = 0
  })
  return { cancel: () => task.cancel(), promise }
}

/** Renders a page to a fresh canvas with a pixel budget (for thumbnails, OCR, compare, export). */
export async function rasterize(fileId: string, index: number, opts: { maxSide?: number; scale?: number; rotate?: number; background?: string } = {}) {
  const page = await getPage(fileId, index)
  const base = viewportFor(page, 1, opts.rotate ?? 0)
  const scale = opts.scale ?? Math.min(8, (opts.maxSide ?? 1200) / Math.max(base.width, base.height))
  const vp = viewportFor(page, scale, opts.rotate ?? 0)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(vp.width)
  canvas.height = Math.ceil(vp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = opts.background ?? '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
  return { canvas, viewport: vp, page }
}

const thumbCache = new Map<string, Promise<string>>()

/** Small JPEG data URL of a page (cached per page + rotation). */
export function thumbnail(fileId: string, index: number, rotate = 0, maxSide = 220) {
  const key = `${fileId}:${index}:${rotate}:${maxSide}`
  let p = thumbCache.get(key)
  if (!p) {
    p = rasterize(fileId, index, { maxSide: maxSide * Math.min(2, window.devicePixelRatio || 1), rotate }).then(({ canvas }) => {
      const url = canvas.toDataURL('image/jpeg', 0.82)
      canvas.width = canvas.height = 0
      return url
    })
    p.catch(() => thumbCache.delete(key))
    thumbCache.set(key, p)
  }
  return p
}

/* ------------------------------------------------------------------ */
/*  Text (native + OCR)                                                */
/* ------------------------------------------------------------------ */

/** A run of text on a page with its box in PDF user space (x0,y0 bottom-left; x1,y1 top-right). */
export interface TextRun {
  str: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** true when the run came from OCR */
  ocr?: boolean
}

const textCache = new Map<string, Promise<TextRun[]>>()

export function pageText(fileId: string, index: number): Promise<TextRun[]> {
  const key = `${fileId}:${index}`
  let p = textCache.get(key)
  if (!p) {
    p = (async () => {
      const page = await getPage(fileId, index)
      const tc = await page.getTextContent()
      const runs: TextRun[] = []
      for (const it of tc.items) {
        if (!('str' in it) || !it.str.trim()) continue
        const [a, b, , , e, f] = it.transform as number[]
        const h = it.height || Math.hypot(a, b)
        // Rotated text: approximate with its axis-aligned bounds.
        const ang = Math.atan2(b, a)
        const cos = Math.cos(ang)
        const sin = Math.sin(ang)
        const w = it.width
        const xs = [e, e + w * cos, e - h * sin, e + w * cos - h * sin]
        const ys = [f, f + w * sin, f + h * cos, f + w * sin + h * cos]
        runs.push({ str: it.str, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) })
      }
      const ocr = await getOcr(fileId, index)
      if (ocr) runs.push(...ocr.words)
      return runs
    })()
    p.catch(() => textCache.delete(key))
    textCache.set(key, p)
  }
  return p
}

export function invalidateText(fileId: string, index: number) {
  textCache.delete(`${fileId}:${index}`)
}

/** Whether a page has (enough) real text — scanned sheets usually don't. */
export async function hasNativeText(fileId: string, index: number) {
  const page = await getPage(fileId, index)
  const tc = await page.getTextContent()
  const chars = tc.items.reduce((n, it) => n + ('str' in it ? it.str.trim().length : 0), 0)
  return chars > 20
}

/* ------------------------------------------------------------------ */
/*  OCR (Tesseract, fully in the browser)                              */
/* ------------------------------------------------------------------ */

export interface OcrPage {
  words: TextRun[]
  confidence: number
  at: string
}

const ocrStore = createStore('workbench-ocr', 'pages')
export const getOcr = (fileId: string, index: number) => idbGet<OcrPage>(`${fileId}:${index}`, ocrStore)

type TessWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>
let workerP: Promise<TessWorker> | null = null
let workerLang = ''

async function ocrWorker(lang: string, onProgress?: (p: number, status: string) => void) {
  if (workerP && workerLang === lang) return workerP
  if (workerP) void (await workerP).terminate()
  workerLang = lang
  const { createWorker, OEM } = await import('tesseract.js')
  workerP = createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: asset('ocr/worker.min.js'),
    corePath: asset('ocr/core/'),
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => onProgress?.(m.progress, m.status),
  })
  workerP.catch(() => (workerP = null))
  return workerP
}

/**
 * OCRs one page: renders it at ~300 dpi (capped for huge sheets), recognizes words and
 * maps their boxes back into PDF space. Results are cached on this device.
 */
export async function ocrPage(fileId: string, index: number, opts: { lang?: string; onProgress?: (p: number, status: string) => void } = {}): Promise<OcrPage> {
  const worker = await ocrWorker(opts.lang ?? 'eng', opts.onProgress)
  const page = await getPage(fileId, index)
  const base = page.getViewport({ scale: 1, rotation: page.rotate })
  const scale = Math.min(300 / 72, 5000 / Math.max(base.width, base.height))
  const { canvas, viewport } = await rasterize(fileId, index, { scale })
  const { data } = await worker.recognize(canvas, {}, { blocks: true })
  canvas.width = canvas.height = 0
  const words: TextRun[] = []
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs)
      for (const line of para.lines)
        for (const w of line.words) {
          if (!w.text.trim() || w.confidence < 30) continue
          const [ax, ay] = viewport.convertToPdfPoint(w.bbox.x0, w.bbox.y0)
          const [bx, by] = viewport.convertToPdfPoint(w.bbox.x1, w.bbox.y1)
          words.push({ str: w.text, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by), ocr: true })
        }
  const result: OcrPage = { words, confidence: data.confidence, at: new Date().toISOString() }
  await idbSet(`${fileId}:${index}`, result, ocrStore)
  invalidateText(fileId, index)
  return result
}

/** OCRs a photo or scan image into paragraphs (used by the Speed Reader's camera import). */
export async function ocrImage(image: Blob, opts: { lang?: string; onProgress?: (p: number, status: string) => void } = {}) {
  const worker = await ocrWorker(opts.lang ?? 'eng', opts.onProgress)
  const { data } = await worker.recognize(image, {}, { blocks: true })
  const paragraphs: string[] = []
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs) {
      const text = para.lines
        .map((l) => l.words.filter((w) => w.confidence >= 30).map((w) => w.text).join(' '))
        .join('\n')
        .trim()
      if (text) paragraphs.push(text)
    }
  return { paragraphs, confidence: data.confidence }
}

export async function stopOcr() {
  if (!workerP) return
  const w = workerP
  workerP = null
  await (await w).terminate()
}

export { pdfjs }
