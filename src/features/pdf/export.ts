import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  beginText,
  degrees,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import type { PdfAnnot, PdfCalibration, PdfDoc } from '@/store/types'
import { getOcr, getPage, rasterize, readBytes } from './engine'
import {
  DEFAULT_CALIBRATION,
  LINE_HEIGHT,
  arrowHead,
  centroid,
  cloudPath,
  inkPath,
  measure,
  pairs,
  rectPoly,
  rot,
  stampSize,
  textSize,
  trimEnd,
  type Pt,
} from './geometry'

export interface ExportOptions {
  /** page keys to include (default: all, in document order) */
  pages?: string[]
  /** draw markups into the page content */
  markups?: boolean
  /** add OCR'd words as invisible, searchable text */
  ocrText?: boolean
  onProgress?: (done: number, total: number) => void
}

const color = (hex: string | undefined) => {
  const h = (hex ?? '#000000').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** SVG path data with y negated — pdf-lib's drawSvgPath flips y back into PDF space. */
const flipPts = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, -y])
const polyD = (pts: Pt[], close: boolean) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${-y}`).join('') + (close ? 'Z' : '')

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

/** Replaces characters Helvetica (WinAnsi) can't encode, so export never throws. */
const safeCache = new Map<string, boolean>()
function safe(font: PDFFont, s: string) {
  let out = ''
  for (const ch of s) {
    const key = font.name + ch
    let ok = safeCache.get(key)
    if (ok === undefined) {
      try {
        font.encodeText(ch)
        ok = true
      } catch {
        ok = false
      }
      safeCache.set(key, ok)
    }
    out += ok ? ch : ch === '’' || ch === '‘' ? "'" : ch === '“' || ch === '”' ? '"' : '?'
  }
  return out
}

function drawTextLines(page: PDFPage, text: string, at: Pt, size: number, angle: number, font: PDFFont, c: string, opacity = 1) {
  const { lines } = textSize(text, size)
  lines.forEach((line, i) => {
    const pos = rot([at[0] + 2, at[1] - 2 - size * (0.86 + i * LINE_HEIGHT)], at, angle)
    page.drawText(safe(font, line), { x: pos[0], y: pos[1], size, font, color: color(c), opacity, rotate: degrees(angle) })
  })
}

function drawLabel(page: PDFPage, at: Pt, text: string, angle: number, size: number, c: string, fonts: Fonts) {
  const s = Math.max(size, 7)
  const label = safe(fonts.bold, text)
  const w = fonts.bold.widthOfTextAtSize(label, s) + s * 0.9
  const h = s * 1.5
  const r = h / 2
  // Pill in local (y-down) coordinates centred on `at`.
  const d = `M${-w / 2 + r},${-h / 2} L${w / 2 - r},${-h / 2} A${r},${r} 0 0 1 ${w / 2 - r},${h / 2} L${-w / 2 + r},${h / 2} A${r},${r} 0 0 1 ${-w / 2 + r},${-h / 2} Z`
  page.drawSvgPath(d, { x: at[0], y: at[1], rotate: degrees(angle), color: color(c), borderWidth: 0 })
  const tw = fonts.bold.widthOfTextAtSize(label, s)
  const pos = rot([at[0] - tw / 2, at[1] - s * 0.36], at, angle)
  page.drawText(label, { x: pos[0], y: pos[1], size: s, font: fonts.bold, color: rgb(1, 1, 1), rotate: degrees(angle) })
}

function drawAnnot(page: PDFPage, a: PdfAnnot, fonts: Fonts, cal: PdfCalibration, upright: number, embed: (src: string) => Promise<Awaited<ReturnType<PDFDocument['embedPng']>>>) {
  const p = pairs(a.pts)
  const stroke = { borderColor: color(a.color), borderWidth: a.width, borderOpacity: a.opacity, borderLineCap: LineCapStyle.Round }
  const fill = a.fill ? { color: color(a.fill), opacity: 0.18 * a.opacity } : {}
  switch (a.kind) {
    case 'ink':
      page.drawSvgPath(inkPath(a, true), { color: color(a.color), opacity: a.opacity, borderWidth: 0 })
      return
    case 'highlight':
      page.drawSvgPath(inkPath(a, true), { color: color(a.color), opacity: a.opacity, borderWidth: 0, blendMode: BlendMode.Multiply })
      return
    case 'texthl':
      for (let i = 0; i + 1 < p.length; i += 2) {
        const [x0, y0] = p[i]
        const [x1, y1] = p[i + 1]
        const bx = Math.min(x0, x1)
        const by = Math.min(y0, y1)
        const bw = Math.abs(x1 - x0)
        const bh = Math.abs(y1 - y0)
        if (a.sub === 'underline' || a.sub === 'strike') {
          const y = a.sub === 'strike' ? by + bh / 2 : by + bh * 0.08
          page.drawLine({ start: { x: bx, y }, end: { x: bx + bw, y }, thickness: Math.max(0.8, a.width / 2), color: color(a.color), opacity: Math.max(0.85, a.opacity) })
        } else {
          page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: color(a.color), opacity: a.opacity, blendMode: BlendMode.Multiply })
        }
      }
      return
    case 'rect': {
      const [[x0, y0], [x1, y1]] = p
      page.drawRectangle({ x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), ...stroke, ...fill })
      return
    }
    case 'ellipse': {
      const [[x0, y0], [x1, y1]] = p
      page.drawEllipse({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, xScale: Math.abs(x1 - x0) / 2, yScale: Math.abs(y1 - y0) / 2, ...stroke, ...fill })
      return
    }
    case 'cloud': {
      const poly = p.length === 2 ? rectPoly(p[0], p[1]) : p
      const r = Math.max(4, Math.min(14, Math.sqrt(Math.abs((p[1][0] - p[0][0]) * (p[1][1] - p[0][1]))) / 8))
      page.drawSvgPath(cloudPath(flipPts(poly), r), { ...stroke, ...fill })
      return
    }
    case 'polygon':
      page.drawSvgPath(polyD(p, true), { ...stroke, ...fill })
      return
    case 'line':
      page.drawSvgPath(polyD(p, false), stroke)
      return
    case 'arrow': {
      const [from, tip] = [p[p.length - 2], p[p.length - 1]]
      page.drawSvgPath(polyD([...p.slice(0, -1), trimEnd(from, tip, a.width * 1.5)], false), stroke)
      page.drawSvgPath(polyD(arrowHead(from, tip, a.width), true), { color: color(a.color), opacity: a.opacity, borderColor: color(a.color), borderWidth: a.width * 0.5, borderOpacity: a.opacity })
      return
    }
    case 'text':
      drawTextLines(page, a.text ?? '', p[0], a.size ?? 12, a.angle ?? 0, fonts.regular, a.color, a.opacity)
      return
    case 'callout': {
      const [tip, at] = p
      const size = a.size ?? 11
      const { w, h } = textSize(a.text ?? '', size)
      const bw = w + 12
      const bh = h + 10
      const cx = Math.max(at[0], Math.min(tip[0], at[0] + bw))
      const cy = Math.max(at[1] - bh, Math.min(tip[1], at[1]))
      const inside = cx > at[0] && cx < at[0] + bw && cy > at[1] - bh && cy < at[1]
      const knee: Pt = inside ? [at[0], at[1] - bh / 2] : [cx, cy]
      const end = trimEnd(knee, tip, a.width * 1.5)
      page.drawLine({ start: { x: knee[0], y: knee[1] }, end: { x: end[0], y: end[1] }, thickness: a.width, color: color(a.color), opacity: a.opacity, lineCap: LineCapStyle.Round })
      page.drawSvgPath(polyD(arrowHead(knee, tip, a.width), true), { color: color(a.color), opacity: a.opacity, borderWidth: 0 })
      page.drawRectangle({ x: at[0], y: at[1] - bh, width: bw, height: bh, color: color(a.fill ?? '#ffffff'), borderColor: color(a.color), borderWidth: a.width, opacity: a.opacity, borderOpacity: a.opacity })
      const dark = a.fill && !/^#?f{3,6}$/i.test(a.fill)
      drawTextLines(page, a.text ?? '', [at[0] + 6, at[1] - 5], size, a.angle ?? 0, fonts.regular, dark ? '#ffffff' : '#1c2024', a.opacity)
      return
    }
    case 'stamp': {
      const { w, h } = stampSize(a)
      const size = a.size ?? 18
      const at = p[0]
      const ang = a.angle ?? 0
      const rr = (x: number, y: number, ww: number, hh: number, r: number) =>
        `M${x + r},${y} L${x + ww - r},${y} A${r},${r} 0 0 1 ${x + ww},${y + r} L${x + ww},${y + hh - r} A${r},${r} 0 0 1 ${x + ww - r},${y + hh} L${x + r},${y + hh} A${r},${r} 0 0 1 ${x},${y + hh - r} L${x},${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
      const c = color(a.color)
      page.drawSvgPath(rr(0, 0, w, h, size * 0.28), { x: at[0], y: at[1], rotate: degrees(ang), color: c, opacity: 0.06 * a.opacity, borderColor: c, borderWidth: size * 0.12, borderOpacity: a.opacity })
      page.drawSvgPath(rr(size * 0.16, size * 0.16, w - size * 0.32, h - size * 0.32, size * 0.18), { x: at[0], y: at[1], rotate: degrees(ang), borderColor: c, borderWidth: size * 0.04, borderOpacity: a.opacity })
      const main = safe(fonts.bold, a.text ?? '')
      const tw = fonts.bold.widthOfTextAtSize(main, size)
      const mp = rot([at[0] + w / 2 - tw / 2, at[1] - size * 1.05], at, ang)
      page.drawText(main, { x: mp[0], y: mp[1], size, font: fonts.bold, color: c, opacity: a.opacity, rotate: degrees(ang) })
      if (a.sub) {
        const sub = safe(fonts.regular, a.sub)
        const sw = fonts.regular.widthOfTextAtSize(sub, size * 0.5)
        const sp = rot([at[0] + w / 2 - sw / 2, at[1] - size * 1.7], at, ang)
        page.drawText(sub, { x: sp[0], y: sp[1], size: size * 0.5, font: fonts.regular, color: c, opacity: a.opacity, rotate: degrees(ang) })
      }
      return
    }
    case 'image':
      return embed(a.src!).then((img) => {
        const [[x0, y0], [x1, y1]] = p
        page.drawImage(img, { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), opacity: a.opacity })
      })
    case 'length':
    case 'polylength': {
      const m = measure(a, cal)
      const size = a.size ?? 10
      page.drawSvgPath(polyD(p, false), stroke)
      const tick = Math.max(4, size * 0.6)
      for (const [q, o] of [
        [p[0], p[1]],
        [p[p.length - 1], p[p.length - 2]],
      ] as [Pt, Pt][]) {
        const ang = Math.atan2(o[1] - q[1], o[0] - q[0]) + Math.PI / 2
        page.drawLine({ start: { x: q[0] - Math.cos(ang) * tick, y: q[1] - Math.sin(ang) * tick }, end: { x: q[0] + Math.cos(ang) * tick, y: q[1] + Math.sin(ang) * tick }, thickness: a.width, color: color(a.color), opacity: a.opacity, lineCap: LineCapStyle.Round })
      }
      const i = p.length === 2 ? 0 : Math.floor((p.length - 1) / 2)
      const mid: Pt = [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2]
      if (m) drawLabel(page, mid, m.label, upright, size, a.color, fonts)
      return
    }
    case 'area': {
      const m = measure(a, cal)
      page.drawSvgPath(polyD(p, true), { ...stroke, color: color(a.fill ?? a.color), opacity: 0.16 * a.opacity })
      if (m && p.length > 2) drawLabel(page, centroid(p), m.label, upright, a.size ?? 10, a.color, fonts)
      return
    }
    case 'count': {
      const r = a.size ?? 7
      p.forEach((q, i) => {
        page.drawCircle({ x: q[0], y: q[1], size: r, color: color(a.color), opacity: 0.9 * a.opacity, borderColor: rgb(1, 1, 1), borderWidth: r * 0.18 })
        const label = String(i + 1)
        const s = r * (i + 1 > 99 ? 0.8 : 1.05)
        const tw = fonts.bold.widthOfTextAtSize(label, s)
        const pos = rot([q[0] - tw / 2, q[1] - r * 0.38], q, upright)
        page.drawText(label, { x: pos[0], y: pos[1], size: s, font: fonts.bold, color: rgb(1, 1, 1), rotate: degrees(upright) })
      })
      return
    }
    default:
      return
  }
}

/** Invisible OCR words so scanned pages become searchable and selectable in any viewer. */
function addOcrText(page: PDFPage, words: { str: string; x0: number; y0: number; x1: number; y1: number }[], font: PDFFont, rotation: number) {
  const key = page.node.newFontDictionary(font.name, font.ref)
  const r = (rotation * Math.PI) / 180
  const base: Pt = [Math.cos(r), Math.sin(r)]
  const down: Pt = [Math.sin(r), -Math.cos(r)]
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)]
  for (const w of words) {
    const str = safe(font, w.str)
    if (!str.trim()) continue
    const corners: Pt[] = [[w.x0, w.y0], [w.x1, w.y0], [w.x1, w.y1], [w.x0, w.y1]]
    const along = (c: Pt) => c[0] * base[0] + c[1] * base[1]
    const across = (c: Pt) => c[0] * down[0] + c[1] * down[1]
    const origin = corners.reduce((best, c) => (along(c) - across(c) < along(best) - across(best) ? c : best))
    const width = Math.max(...corners.map(along)) - Math.min(...corners.map(along))
    const height = Math.max(...corners.map(across)) - Math.min(...corners.map(across))
    if (width <= 0 || height <= 0) continue
    const size = height
    const natural = font.widthOfTextAtSize(str, size) || 1
    const hs = width / natural
    const ox = origin[0] - down[0] * height * 0.2
    const oy = origin[1] - down[1] * height * 0.2
    ops.push(setFontAndSize(key, size), setTextMatrix(base[0] * hs, base[1] * hs, -base[1], base[0], ox, oy), showText(font.encodeText(str)))
  }
  ops.push(endText(), popGraphicsState())
  page.pushOperators(...ops)
}

/**
 * Builds a new PDF from the Studio document: pages in their current order and rotation,
 * markups flattened into the content, redacted areas truly removed (those pages are
 * re-rendered as images), and OCR text embedded invisibly.
 */
export async function exportPdf(doc: PdfDoc, opts: ExportOptions = {}): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const fonts: Fonts = { regular: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold) }
  const sources = new Map<string, Promise<PDFDocument>>()
  const src = (id: string) => {
    let p = sources.get(id)
    if (!p) sources.set(id, (p = readBytes(id).then((b) => PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false }))))
    return p
  }
  const images = new Map<string, ReturnType<PDFDocument['embedPng']>>()
  const embed = (dataUrl: string) => {
    let p = images.get(dataUrl)
    if (!p) images.set(dataUrl, (p = /^data:image\/jpe?g/.test(dataUrl) ? out.embedJpg(dataUrl) : out.embedPng(dataUrl)))
    return p
  }

  const refs = opts.pages ? opts.pages.map((k) => doc.pages.find((p) => p.key === k)!).filter(Boolean) : doc.pages
  const markups = opts.markups ?? true
  let done = 0
  for (const ref of refs) {
    const annots = doc.annots.filter((a) => a.page === ref.key)
    const redactions = markups ? annots.filter((a) => a.kind === 'redact') : []
    const cal = doc.pageScales?.[ref.key] ?? doc.scale ?? DEFAULT_CALIBRATION
    let page: PDFPage
    let rotation: number

    if (redactions.length) {
      // Re-render the page as an image with the redactions burned in, so the hidden
      // content (text, vectors, images) is gone from the file — not just covered.
      const pj = await getPage(ref.src, ref.index)
      const [vx0, vy0, vx1, vy1] = pj.view
      const { canvas, viewport } = await rasterize(ref.src, ref.index, { scale: 200 / 72, rotate: (360 - pj.rotate) % 360 })
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#000'
      for (const r of redactions) {
        const [a, b] = pairs(r.pts)
        const [ax, ay] = viewport.convertToViewportPoint(a[0], a[1])
        const [bx, by] = viewport.convertToViewportPoint(b[0], b[1])
        ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
      }
      const jpg = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9))
      canvas.width = canvas.height = 0
      const img = await out.embedJpg(await jpg.arrayBuffer())
      page = out.addPage([vx1 - vx0, vy1 - vy0])
      page.setMediaBox(vx0, vy0, vx1 - vx0, vy1 - vy0)
      page.drawImage(img, { x: vx0, y: vy0, width: vx1 - vx0, height: vy1 - vy0 })
      rotation = (pj.rotate + ref.rotate) % 360
      page.setRotation(degrees(rotation))
    } else {
      const source = await src(ref.src)
      const [copied] = await out.copyPages(source, [ref.index])
      page = out.addPage(copied)
      rotation = (copied.getRotation().angle + ref.rotate) % 360
      page.setRotation(degrees(rotation))
      if (opts.ocrText ?? true) {
        const ocr = await getOcr(ref.src, ref.index)
        if (ocr?.words.length) addOcrText(page, ocr.words, fonts.regular, rotation)
      }
    }

    if (markups) {
      for (const a of annots) {
        if (a.kind === 'redact') continue
        await drawAnnot(page, a, fonts, cal, rotation, embed)
      }
    }
    opts.onProgress?.(++done, refs.length)
  }

  out.setTitle(doc.name)
  out.setProducer('Workbench PDF Studio')
  out.setCreator('Workbench')
  out.setModificationDate(new Date())
  return out.save({ useObjectStreams: true })
}

