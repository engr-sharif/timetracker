/**
 * Ink → shape recognition, shared by PDF Studio and the whiteboard.
 * Works in any 2D coordinate space (y up or down). Heuristics tuned on quick
 * hand-drawn strokes: lines, arrows, rectangles, ellipses, triangles, diamonds.
 */

export type Pt = [number, number]

export type Recognized =
  | { type: 'line'; a: Pt; b: Pt; score: number }
  | { type: 'arrow'; a: Pt; b: Pt; score: number }
  | { type: 'rect'; min: Pt; max: Pt; score: number }
  | { type: 'ellipse'; center: Pt; rx: number; ry: number; score: number }
  | { type: 'triangle'; points: Pt[]; score: number }
  | { type: 'diamond'; points: Pt[]; min: Pt; max: Pt; score: number }
  | { type: 'polygon'; points: Pt[]; score: number }

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function pathLength(pts: Pt[]) {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i])
  return n
}

/** Evenly resamples a polyline to n points. */
export function resample(pts: Pt[], n = 64): Pt[] {
  if (pts.length < 2) return pts.slice()
  const total = pathLength(pts)
  if (total === 0) return [pts[0]]
  const step = total / (n - 1)
  const out: Pt[] = [pts[0]]
  let acc = 0
  let prev = pts[0]
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i]
    let d = dist(prev, cur)
    while (acc + d >= step && d > 0) {
      const t = (step - acc) / d
      const q: Pt = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]
      out.push(q)
      prev = q
      d = dist(prev, cur)
      acc = 0
    }
    acc += d
    prev = cur
    cur = pts[i]
  }
  while (out.length < n) out.push(pts[pts.length - 1])
  return out.slice(0, n)
}

function bbox(pts: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

function polygonArea(pts: Pt[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

function convexHull(points: Pt[]): Pt[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (!l2) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return dist(p, [a[0] + t * dx, a[1] + t * dy])
}

/** Douglas–Peucker simplification. */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice()
  let idx = 0
  let max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps))
}

/** Corners of a closed stroke: simplify, then merge near-collinear vertices. */
function corners(closed: Pt[], eps: number): Pt[] {
  let poly = simplify([...closed, closed[0]], eps).slice(0, -1)
  let changed = true
  while (changed && poly.length > 3) {
    changed = false
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i - 1 + poly.length) % poly.length]
      const b = poly[i]
      const c = poly[(i + 1) % poly.length]
      const ang = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]))
      const turn = Math.min(ang, 2 * Math.PI - ang)
      if (turn < 0.45 || dist(a, b) < eps * 1.5) {
        poly = poly.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return poly
}

/**
 * Recognizes a single stroke. Returns null when nothing fits confidently —
 * callers then keep the freehand ink.
 */
export function recognize(raw: Pt[]): Recognized | null {
  if (raw.length < 4) return null
  const len = pathLength(raw)
  const box = bbox(raw)
  const diag = Math.hypot(box.w, box.h)
  if (diag < 8) return null
  const pts = resample(raw, 96)
  const start = pts[0]
  const end = pts[pts.length - 1]

  // Straight line
  const chord = dist(start, end)
  if (chord / len > 0.94) return { type: 'line', a: start, b: end, score: chord / len }

  // Arrow: straight shaft to the far point, then a short hook (the head) near the tip.
  let tipIdx = 0
  let far = 0
  for (let i = 0; i < pts.length; i++) {
    const d = dist(start, pts[i])
    if (d > far) {
      far = d
      tipIdx = i
    }
  }
  // A head that doubles back over the tip can reach slightly further; take the first arrival.
  tipIdx = pts.findIndex((p) => dist(start, p) > far * 0.97)
  const tip = pts[tipIdx]
  const shaft = pathLength(pts.slice(0, tipIdx + 1))
  const tail = pts.slice(tipIdx)
  const tailLen = pathLength(tail)
  if (tipIdx > pts.length * 0.45 && far / shaft > 0.9 && tailLen > far * 0.08 && tailLen < far * 0.9 && tail.every((p) => dist(p, tip) < far * 0.4)) {
    return { type: 'arrow', a: start, b: tip, score: far / shaft }
  }

  // Closed shapes
  const gap = chord
  const closed = gap < Math.max(diag * 0.28, 12)
  if (!closed) return null
  const ring = pts.slice(0, -1)
  const hull = convexHull(ring)
  const hullArea = Math.abs(polygonArea(hull))
  const fill = hullArea / Math.max(1, box.w * box.h)
  const aspect = Math.min(box.w, box.h) / Math.max(box.w, box.h)
  if (aspect < 0.08) return null

  // Ellipse: points sit near the ellipse inscribed in the bounding box.
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const rx = box.w / 2
  const ry = box.h / 2
  let err = 0
  for (const [x, y] of ring) err += Math.abs(Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) - 1)
  err /= ring.length

  const cs = corners(ring, diag * 0.065)

  if (fill > 0.86 && cs.length >= 4 && cs.length <= 6) return { type: 'rect', min: [box.x0, box.y0], max: [box.x1, box.y1], score: fill }
  if (err < 0.1 && fill > 0.68 && fill < 0.88) return { type: 'ellipse', center: [cx, cy], rx, ry, score: 1 - err }
  if (cs.length === 3) return { type: 'triangle', points: cs, score: 0.8 }
  if (cs.length === 4) {
    // A diamond has its corners near the bbox edge midpoints.
    const mids: Pt[] = [[cx, box.y0], [box.x1, cy], [cx, box.y1], [box.x0, cy]]
    const near = mids.every((m) => cs.some((c) => dist(c, m) < diag * 0.14))
    if (near && fill < 0.7) {
      return { type: 'diamond', points: mids, min: [box.x0, box.y0], max: [box.x1, box.y1], score: 0.8 }
    }
    if (fill > 0.78) return { type: 'rect', min: [box.x0, box.y0], max: [box.x1, box.y1], score: fill }
    return { type: 'polygon', points: cs, score: 0.7 }
  }
  if (err < 0.14 && fill > 0.66) return { type: 'ellipse', center: [cx, cy], rx, ry, score: 1 - err }
  if (cs.length >= 5 && cs.length <= 8) return { type: 'polygon', points: cs, score: 0.6 }
  return null
}

/** True when the pointer has barely moved over the last `ms` of samples (hold-to-snap). */
export function heldStill(samples: { x: number; y: number; t: number }[], ms = 450, tolerance = 4) {
  if (samples.length < 2) return false
  const last = samples[samples.length - 1]
  if (last.t - samples[0].t < ms) return false
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]
    if (last.t - s.t > ms) return true
    if (Math.hypot(s.x - last.x, s.y - last.y) > tolerance) return false
  }
  return false
}
