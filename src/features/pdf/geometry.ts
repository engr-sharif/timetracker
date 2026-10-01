import { getStroke } from 'perfect-freehand'
import type { PdfAnnot, PdfCalibration } from '@/store/types'

/**
 * Geometry for PDF markups. Everything is in PDF user space (points, y up), so
 * markups survive zoom, page rotation and export without conversion.
 */

export type Pt = [number, number]

export const pairs = (flat: number[]): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}
export const flat = (pts: Pt[]) => pts.flatMap(([x, y]) => [round(x), round(y)])
export const round = (n: number) => Math.round(n * 100) / 100

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const boxOf = (pts: Pt[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return { x0, y0, x1, y1 }
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (!l2) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return dist(p, [a[0] + t * dx, a[1] + t * dy])
}

export function polygonArea(pts: Pt[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

export function centroid(pts: Pt[]): Pt {
  const a = polygonArea(pts)
  if (Math.abs(a) < 1e-6) {
    const b = boxOf(pts)
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export const pathLen = (pts: Pt[]) => pts.reduce((n, p, i) => (i ? n + dist(pts[i - 1], p) : 0), 0)

function pointInPolygon([x, y]: Pt, poly: Pt[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/* ------------------------------------------------------------------ */
/*  Paths                                                              */
/* ------------------------------------------------------------------ */

const avg = (a: number, b: number) => (a + b) / 2

/** perfect-freehand outline → closed SVG path. */
function outlinePath(outline: number[][]) {
  if (outline.length < 4) return ''
  let [a, b, c] = outline
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`
  for (let i = 2; i < outline.length - 1; i++) {
    a = outline[i]
    b = outline[i + 1]
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `
  }
  return d + 'Z'
}

/** Pressure-sensitive pen (and flat highlighter) outline. Ink pts are [x, y, pressure] triples. */
export function inkPath(a: Pick<PdfAnnot, 'pts' | 'width' | 'kind'>, flipY = false) {
  const pts: number[][] = []
  const f = flipY ? -1 : 1
  for (let i = 0; i + 2 < a.pts.length + 1; i += 3) pts.push([a.pts[i], f * a.pts[i + 1], a.pts[i + 2] ?? 0.5])
  const hl = a.kind === 'highlight'
  const hasPressure = pts.some((p) => p[2] !== 0.5)
  const outline = getStroke(pts, {
    size: a.width * (hl ? 1 : 2),
    thinning: hl ? 0 : 0.55,
    smoothing: 0.6,
    streamline: 0.45,
    simulatePressure: !hl && !hasPressure,
    last: true,
    start: { cap: !hl },
    end: { cap: !hl },
  })
  // pdf-lib's SVG parser doesn't expand implicit repeated coordinates, so the exporter
  // gets an explicit polygon (the outline is dense enough to look identical).
  if (flipY) return outline.length > 2 ? outline.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('') + 'Z' : ''
  return outlinePath(outline)
}

export const inkPoints = (a: PdfAnnot): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i + 1 < a.pts.length; i += 3) out.push([a.pts[i], a.pts[i + 1]])
  return out
}

/** Revision cloud: outward scallops around a rectangle or polygon. */
export function cloudPath(poly: Pt[], radius: number) {
  const ring = [...poly, poly[0]]
  const sweep = polygonArea(poly) > 0 ? 1 : 0
  const peri = pathLen(ring)
  const n = Math.max(6, Math.round(peri / (radius * 2)))
  const step = peri / n
  const pts: Pt[] = []
  let seg = 0
  let segStart = 0
  for (let i = 0; i < n; i++) {
    const target = i * step
    while (seg < ring.length - 2 && segStart + dist(ring[seg], ring[seg + 1]) < target) {
      segStart += dist(ring[seg], ring[seg + 1])
      seg++
    }
    const l = dist(ring[seg], ring[seg + 1]) || 1
    const t = (target - segStart) / l
    pts.push([ring[seg][0] + t * (ring[seg + 1][0] - ring[seg][0]), ring[seg][1] + t * (ring[seg + 1][1] - ring[seg][1])])
  }
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length]
    const r = (dist(pts[i - 1], p) / 2) * 1.08
    d += ` A${r.toFixed(2)},${r.toFixed(2)} 0 0 ${sweep} ${p[0].toFixed(2)},${p[1].toFixed(2)}`
  }
  return d + ' Z'
}

export const rectPoly = (a: Pt, b: Pt): Pt[] => [
  [a[0], a[1]],
  [b[0], a[1]],
  [b[0], b[1]],
  [a[0], b[1]],
]

/** Filled arrowhead triangle at `tip`, pointing away from `from`. */
export function arrowHead(from: Pt, tip: Pt, width: number): Pt[] {
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const len = Math.max(6, width * 4.5)
  const spread = 0.42
  return [tip, [tip[0] - len * Math.cos(ang - spread), tip[1] - len * Math.sin(ang - spread)], [tip[0] - len * Math.cos(ang + spread), tip[1] - len * Math.sin(ang + spread)]]
}

/** Shortens a segment so a thick stroke doesn't poke through its arrowhead. */
export function trimEnd(a: Pt, b: Pt, by: number): Pt {
  const l = dist(a, b)
  if (l <= by) return b
  return [b[0] - ((b[0] - a[0]) / l) * by, b[1] - ((b[1] - a[1]) / l) * by]
}

/* ------------------------------------------------------------------ */
/*  Text metrics (approximate Helvetica, matched by the exporter)      */
/* ------------------------------------------------------------------ */

export const LINE_HEIGHT = 1.22

export function textSize(text: string, size: number) {
  const lines = (text || ' ').split('\n')
  const w = Math.max(...lines.map((l) => measureText(l, size)))
  return { w, h: lines.length * size * LINE_HEIGHT, lines }
}

let measureCtx: CanvasRenderingContext2D | null = null
export function measureText(s: string, size: number) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return s.length * size * 0.55
  measureCtx.font = `${size}px Helvetica, Arial, sans-serif`
  return measureCtx.measureText(s).width
}

export const STAMP_PAD = 0.55

export function stampSize(a: PdfAnnot) {
  const size = a.size ?? 16
  const main = measureText(a.text ?? '', size) * 1.06
  const sub = a.sub ? measureText(a.sub, size * 0.5) : 0
  const w = Math.max(main, sub) + size * STAMP_PAD * 2
  const h = size * (a.sub ? 1.95 : 1.45)
  return { w, h }
}

/** Rotates p about origin o by `deg` counter-clockwise (y-up). */
export function rot(p: Pt, o: Pt, deg: number): Pt {
  if (!deg) return p
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p[0] - o[0]
  const dy = p[1] - o[1]
  return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c]
}

/** Corners of a text-like box anchored at its top-left `at`, extending right and down, rotated by angle. */
export function anchoredBox(at: Pt, w: number, h: number, angle = 0): Pt[] {
  return [at, [at[0] + w, at[1]], [at[0] + w, at[1] - h], [at[0], at[1] - h]].map((p) => rot(p as Pt, at, angle))
}

/* ------------------------------------------------------------------ */
/*  Bounds, hit testing, transforms                                    */
/* ------------------------------------------------------------------ */

/** The outline polygon used for bounds and hit testing. */
export function shapeOf(a: PdfAnnot): Pt[] {
  const p = pairs(a.pts)
  switch (a.kind) {
    case 'ink':
    case 'highlight':
      return inkPoints(a)
    case 'text': {
      const { w, h } = textSize(a.text ?? '', a.size ?? 12)
      return anchoredBox(p[0], w + 4, h + 4, a.angle)
    }
    case 'callout': {
      const { w, h } = textSize(a.text ?? '', a.size ?? 12)
      return [p[0], ...anchoredBox(p[1], w + 12, h + 10, a.angle)]
    }
    case 'stamp': {
      const { w, h } = stampSize(a)
      return anchoredBox(p[0], w, h, a.angle)
    }
    case 'texthl': {
      return p
    }
    default:
      return p
  }
}

export function annotBox(a: PdfAnnot): Box {
  if (a.kind === 'count') {
    const b = boxOf(pairs(a.pts))
    const r = (a.size ?? 7) + 2
    return { x0: b.x0 - r, y0: b.y0 - r, x1: b.x1 + r, y1: b.y1 + r }
  }
  const b = boxOf(shapeOf(a))
  const pad = a.width / 2
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
}

/** Distance (in points) from p to the markup; 0 when inside a filled/boxy markup. */
export function hitDistance(a: PdfAnnot, p: Pt): number {
  const pts = pairs(a.pts)
  switch (a.kind) {
    case 'ink':
    case 'highlight': {
      const ip = inkPoints(a)
      let m = Infinity
      for (let i = 1; i < ip.length; i++) m = Math.min(m, segDist(p, ip[i - 1], ip[i]))
      if (ip.length === 1) m = dist(p, ip[0])
      return Math.max(0, m - a.width / 2)
    }
    case 'line':
    case 'arrow':
    case 'length':
    case 'polylength': {
      let m = Infinity
      for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i]))
      return Math.max(0, m - a.width / 2)
    }
    case 'count':
      return Math.max(0, Math.min(...pts.map((q) => dist(p, q))) - (a.size ?? 7))
    case 'texthl': {
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const b = boxOf([pts[i], pts[i + 1]])
        if (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1) return 0
      }
      return Infinity
    }
    case 'rect':
    case 'ellipse':
    case 'cloud': {
      const b = boxOf(pts)
      const inside = p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1
      if (a.fill && inside) return 0
      const edge = Math.min(Math.abs(p[0] - b.x0), Math.abs(p[0] - b.x1), Math.abs(p[1] - b.y0), Math.abs(p[1] - b.y1))
      return inside ? Math.max(0, edge - a.width / 2 - (a.kind === 'cloud' ? 6 : 0)) : outsideDist(p, b)
    }
    case 'area': {
      if (pointInPolygon(p, pts)) return 0
      let m = Infinity
      for (let i = 0; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i], pts[(i + 1) % pts.length]))
      return m
    }
    default: {
      const poly = shapeOf(a)
      if (poly.length >= 3 && pointInPolygon(p, poly)) return 0
      return outsideDist(p, annotBox(a))
    }
  }
}

function outsideDist(p: Pt, b: Box) {
  const dx = Math.max(b.x0 - p[0], 0, p[0] - b.x1)
  const dy = Math.max(b.y0 - p[1], 0, p[1] - b.y1)
  return Math.hypot(dx, dy)
}

export function translate(a: PdfAnnot, dx: number, dy: number): PdfAnnot {
  if (a.kind === 'ink' || a.kind === 'highlight') {
    const pts = a.pts.slice()
    for (let i = 0; i + 1 < pts.length; i += 3) {
      pts[i] = round(pts[i] + dx)
      pts[i + 1] = round(pts[i + 1] + dy)
    }
    return { ...a, pts }
  }
  return { ...a, pts: a.pts.map((v, i) => round(v + (i % 2 ? dy : dx))) }
}

/** Scales a markup's points into a new box (for resize handles). */
export function fitToBox(a: PdfAnnot, from: Box, to: Box): PdfAnnot {
  const sx = (to.x1 - to.x0) / (from.x1 - from.x0 || 1)
  const sy = (to.y1 - to.y0) / (from.y1 - from.y0 || 1)
  const map = (x: number, y: number): Pt => [to.x0 + (x - from.x0) * sx, to.y0 + (y - from.y0) * sy]
  if (a.kind === 'ink' || a.kind === 'highlight') {
    const pts = a.pts.slice()
    for (let i = 0; i + 1 < pts.length; i += 3) {
      const [x, y] = map(pts[i], pts[i + 1])
      pts[i] = round(x)
      pts[i + 1] = round(y)
    }
    return { ...a, pts }
  }
  const out: number[] = []
  for (let i = 0; i + 1 < a.pts.length; i += 2) out.push(...map(a.pts[i], a.pts[i + 1]).map(round))
  return { ...a, pts: out }
}

/** Markup kinds whose box can be resized by dragging corner handles. */
export const BOXY = new Set(['rect', 'ellipse', 'cloud', 'redact', 'image', 'ink', 'highlight'])
/** Markup kinds edited by dragging their vertices. */
export const VERTEX = new Set(['line', 'arrow', 'length', 'polylength', 'area', 'callout'])

/* ------------------------------------------------------------------ */
/*  Measurement                                                        */
/* ------------------------------------------------------------------ */

export const UNITS = [
  { id: 'ft-in', label: 'Feet & inches', short: 'ft', area: 'sq ft' },
  { id: 'ft', label: 'Feet (decimal)', short: 'ft', area: 'sq ft' },
  { id: 'in', label: 'Inches', short: 'in', area: 'sq in' },
  { id: 'm', label: 'Metres', short: 'm', area: 'm²' },
  { id: 'mm', label: 'Millimetres', short: 'mm', area: 'mm²' },
  { id: 'cm', label: 'Centimetres', short: 'cm', area: 'cm²' },
] as const

export type UnitId = (typeof UNITS)[number]['id']

/** Real length represented by one paper inch, per preset (in the preset's unit). */
export const SCALE_PRESETS: { label: string; unit: UnitId; perPaperInch: number; group: string }[] = [
  { group: 'Architectural', label: '1/16" = 1\'-0"', unit: 'ft-in', perPaperInch: 16 },
  { group: 'Architectural', label: '3/32" = 1\'-0"', unit: 'ft-in', perPaperInch: 32 / 3 },
  { group: 'Architectural', label: '1/8" = 1\'-0"', unit: 'ft-in', perPaperInch: 8 },
  { group: 'Architectural', label: '3/16" = 1\'-0"', unit: 'ft-in', perPaperInch: 16 / 3 },
  { group: 'Architectural', label: '1/4" = 1\'-0"', unit: 'ft-in', perPaperInch: 4 },
  { group: 'Architectural', label: '3/8" = 1\'-0"', unit: 'ft-in', perPaperInch: 8 / 3 },
  { group: 'Architectural', label: '1/2" = 1\'-0"', unit: 'ft-in', perPaperInch: 2 },
  { group: 'Architectural', label: '3/4" = 1\'-0"', unit: 'ft-in', perPaperInch: 4 / 3 },
  { group: 'Architectural', label: '1" = 1\'-0"', unit: 'ft-in', perPaperInch: 1 },
  { group: 'Architectural', label: '1-1/2" = 1\'-0"', unit: 'ft-in', perPaperInch: 2 / 3 },
  { group: 'Architectural', label: '3" = 1\'-0"', unit: 'ft-in', perPaperInch: 1 / 3 },
  ...[10, 20, 30, 40, 50, 60, 100, 200].map((n) => ({ group: 'Engineering', label: `1" = ${n}'`, unit: 'ft' as UnitId, perPaperInch: n })),
  ...[1, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].map((n) => ({ group: 'Metric', label: `1:${n}`, unit: 'm' as UnitId, perPaperInch: (0.0254 * n) })),
]

/** Converts a preset into real units per PDF point (72 points per paper inch). */
export function presetCalibration(p: (typeof SCALE_PRESETS)[number]): PdfCalibration {
  // ft-in presets are "paper inches per foot": perPaperInch is in feet.
  return { factor: p.perPaperInch / 72, unit: p.unit, label: p.label }
}

/** From a known distance drawn on the sheet. */
export function knownCalibration(points: number, realLength: number, unit: UnitId): PdfCalibration {
  const factor = realLength / points
  return { factor, unit, label: `Calibrated · ${formatLength(realLength, unit)}` }
}

export const DEFAULT_CALIBRATION: PdfCalibration = { factor: 1 / 72, unit: 'in', label: 'Paper (1:1)' }

function fraction(inches: number, denom = 16) {
  let whole = Math.floor(inches)
  let num = Math.round((inches - whole) * denom)
  if (num === denom) {
    whole += 1
    num = 0
  }
  if (!num) return `${whole}`
  let d = denom
  while (num % 2 === 0 && d > 1) {
    num /= 2
    d /= 2
  }
  return whole ? `${whole} ${num}/${d}` : `${num}/${d}`
}

export function formatLength(v: number, unit: string) {
  switch (unit) {
    case 'ft-in': {
      const neg = v < 0
      let ft = Math.floor(Math.abs(v))
      let inch = (Math.abs(v) - ft) * 12
      if (Math.round(inch * 16) / 16 >= 12) {
        ft += 1
        inch = 0
      }
      return `${neg ? '-' : ''}${ft}'-${fraction(inch)}"`
    }
    case 'ft':
      return `${v.toFixed(2)} ft`
    case 'in':
      return `${v.toFixed(2)} in`
    case 'm':
      return `${v.toFixed(3)} m`
    case 'mm':
      return `${Math.round(v)} mm`
    case 'cm':
      return `${v.toFixed(1)} cm`
    default:
      return `${v.toFixed(2)} ${unit}`
  }
}

export function formatArea(v: number, unit: string) {
  const u = UNITS.find((x) => x.id === unit)?.area ?? `${unit}²`
  const digits = unit === 'mm' ? 0 : unit === 'm' || unit === 'cm' ? 2 : 1
  return `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${u}`
}

export interface Measure {
  value: number
  label: string
  /** perimeter for areas */
  secondary?: string
}

export function measure(a: PdfAnnot, cal: PdfCalibration): Measure | null {
  const pts = pairs(a.pts)
  switch (a.kind) {
    case 'length':
    case 'polylength': {
      const v = pathLen(pts) * cal.factor
      return { value: v, label: formatLength(v, cal.unit) }
    }
    case 'area': {
      const v = Math.abs(polygonArea(pts)) * cal.factor * cal.factor
      const per = pathLen([...pts, pts[0]]) * cal.factor
      return { value: v, label: formatArea(v, cal.unit), secondary: `Perimeter ${formatLength(per, cal.unit)}` }
    }
    case 'count':
      return { value: pts.length, label: `${pts.length} ${a.text || 'count'}` }
    default:
      return null
  }
}

export const isMeasure = (k: string) => k === 'length' || k === 'polylength' || k === 'area' || k === 'count'
