import { CaptureUpdateAction, convertToExcalidrawElements, exportToBlob } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { heldStill, recognize, type Pt } from '@/lib/ink'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Whiteboard intelligence: turns quick freehand strokes into clean shapes and
 * connectors (hold at the end of a stroke, or always), binds arrows to the shapes
 * they point at, and drops generated elements into view.
 */

export type SmartInkMode = 'hold' | 'always' | 'off'

const KEY = 'wb.board.smartInk'
export const readSmartInk = (): SmartInkMode => (localStorage.getItem(KEY) as SmartInkMode) || 'hold'
export const writeSmartInk = (m: SmartInkMode) => localStorage.setItem(KEY, m)

type El = any

const BINDABLE = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image', 'frame'])

function absPoints(el: El): Pt[] {
  return (el.points as [number, number][]).map(([x, y]) => [el.x + x, el.y + y])
}

/** The shape (if any) whose outline is near p — used to bind recognized arrows. */
function shapeNear(elements: readonly El[], p: Pt, exclude: Set<string>, pad = 28): El | null {
  let best: El | null = null
  let bestD = Infinity
  for (const e of elements) {
    if (e.isDeleted || exclude.has(e.id) || !BINDABLE.has(e.type) || e.containerId) continue
    const x0 = Math.min(e.x, e.x + e.width)
    const y0 = Math.min(e.y, e.y + e.height)
    const x1 = Math.max(e.x, e.x + e.width)
    const y1 = Math.max(e.y, e.y + e.height)
    const dx = Math.max(x0 - p[0], 0, p[0] - x1)
    const dy = Math.max(y0 - p[1], 0, p[1] - y1)
    const d = Math.hypot(dx, dy)
    if (d <= pad && d < bestD) {
      best = e
      bestD = d
    }
  }
  return best
}

/**
 * Tracks pointer samples so we can tell whether the user paused at the end of
 * a stroke (the "hold to snap" gesture).
 */
export function createInkTracker() {
  let samples: { x: number; y: number; t: number }[] = []
  let down = false
  return {
    update(p: { pointer: { x: number; y: number }; button: 'down' | 'up' }) {
      const now = performance.now()
      if (p.button === 'down') {
        if (!down) samples = []
        down = true
        samples.push({ x: p.pointer.x, y: p.pointer.y, t: now })
        if (samples.length > 400) samples = samples.slice(-200)
      } else if (down) {
        down = false
        // One final sample at release time so a pause before lifting counts.
        const last = samples[samples.length - 1]
        if (last) samples.push({ x: last.x, y: last.y, t: now })
      }
    },
    /** Call at pointer-up: records the release time so a pause before lifting counts. */
    release() {
      down = false
      const last = samples[samples.length - 1]
      if (last) samples.push({ x: last.x, y: last.y, t: performance.now() })
    },
    held(zoom: number) {
      return heldStill(samples, 450, 5 / Math.max(0.2, zoom))
    },
  }
}

/**
 * If `el` (a just-finished freedraw stroke) looks like a shape, replace it with
 * the clean Excalidraw element. Returns true when it converted something.
 */
export function snapStroke(api: ExcalidrawImperativeAPI, el: El): boolean {
  const pts = absPoints(el)
  const r = recognize(pts)
  if (!r) return false
  const scene = api.getSceneElementsIncludingDeleted() as El[]
  const style = {
    strokeColor: el.strokeColor,
    backgroundColor: 'transparent',
    strokeWidth: Math.max(1, Math.min(4, Math.round(el.strokeWidth / 1.5))),
    roughness: 1,
    opacity: el.opacity,
  }
  let skeleton: any[] = []
  let bindStart: El | null = null
  let bindEnd: El | null = null
  switch (r.type) {
    case 'rect':
      skeleton = [{ type: 'rectangle', x: r.min[0], y: r.min[1], width: r.max[0] - r.min[0], height: r.max[1] - r.min[1], roundness: { type: 3 }, ...style }]
      break
    case 'ellipse':
      skeleton = [{ type: 'ellipse', x: r.center[0] - r.rx, y: r.center[1] - r.ry, width: r.rx * 2, height: r.ry * 2, ...style }]
      break
    case 'diamond':
      skeleton = [{ type: 'diamond', x: r.min[0], y: r.min[1], width: r.max[0] - r.min[0], height: r.max[1] - r.min[1], ...style }]
      break
    case 'line':
    case 'arrow': {
      const isArrow = r.type === 'arrow'
      bindStart = isArrow ? shapeNear(scene, r.a, new Set([el.id])) : null
      bindEnd = isArrow ? shapeNear(scene, r.b, new Set([el.id, bindStart?.id ?? ''])) : null
      skeleton = [{ type: isArrow ? 'arrow' : 'line', x: r.a[0], y: r.a[1], points: [[0, 0], [r.b[0] - r.a[0], r.b[1] - r.a[1]]], endArrowhead: isArrow ? 'arrow' : null, ...style }]
      break
    }
    case 'triangle':
    case 'polygon': {
      const [x0, y0] = r.points[0]
      skeleton = [{ type: 'line', x: x0, y: y0, points: [...r.points, r.points[0]].map(([x, y]) => [x - x0, y - y0]), ...style }]
      break
    }
  }
  const [created] = convertToExcalidrawElements(skeleton, { regenerateIds: true }) as El[]
  if (!created) return false
  let next = scene.map((e) => (e.id === el.id ? { ...e, isDeleted: true } : e))
  let shape: El = created
  if (created.type === 'arrow' && (bindStart || bindEnd)) {
    shape = {
      ...created,
      startBinding: bindStart ? { elementId: bindStart.id, focus: 0, gap: 6 } : null,
      endBinding: bindEnd ? { elementId: bindEnd.id, focus: 0, gap: 6 } : null,
    }
    next = next.map((e) =>
      e.id === bindStart?.id || e.id === bindEnd?.id ? { ...e, boundElements: [...(e.boundElements ?? []), { id: shape.id, type: 'arrow' }], version: e.version + 1, versionNonce: (e.versionNonce ?? 0) + 1 } : e,
    )
  }
  api.updateScene({ elements: [...next, shape], appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  return true
}

/** Scene coordinates of the viewport centre. */
export function viewCenter(api: ExcalidrawImperativeAPI): Pt {
  const s = api.getAppState()
  return [-s.scrollX + s.width / 2 / s.zoom.value, -s.scrollY + s.height / 2 / s.zoom.value]
}

/** Adds elements centred at `at` (default: viewport centre), selects them and scrolls to them. */
export function placeElements(api: ExcalidrawImperativeAPI, elements: El[], at?: Pt, opts: { replace?: string[] } = {}) {
  if (!elements.length) return
  const xs = elements.flatMap((e) => [e.x, e.x + (e.width ?? 0)])
  const ys = elements.flatMap((e) => [e.y, e.y + (e.height ?? 0)])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const [tx, ty] = at ?? viewCenter(api)
  const moved = elements.map((e) => ({ ...e, x: e.x + tx - cx, y: e.y + ty - cy }))
  const replace = new Set(opts.replace ?? [])
  const scene = (api.getSceneElementsIncludingDeleted() as El[]).map((e) => (replace.has(e.id) ? { ...e, isDeleted: true } : e))
  api.updateScene({
    elements: [...scene, ...moved],
    appState: { selectedElementIds: Object.fromEntries(moved.filter((e) => !e.containerId).map((e) => [e.id, true])) },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  })
  api.scrollToContent(moved, { fitToViewport: false, animate: true })
}

/** Converts Mermaid source into Excalidraw elements (+ image files for non-flowchart types). */
export async function mermaidToElements(code: string) {
  const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw')
  const { elements, files } = await parseMermaidToExcalidraw(code, { themeVariables: { fontSize: '18px' } } as any)
  return { elements: convertToExcalidrawElements(elements as any, { regenerateIds: true }) as El[], files: files ?? {} }
}

export const selectedElements = (api: ExcalidrawImperativeAPI): El[] => {
  const ids = api.getAppState().selectedElementIds
  return (api.getSceneElements() as El[]).filter((e) => ids[e.id] || (e.containerId && ids[e.containerId]))
}

/** PNG of some elements on white, for vision prompts. Long side capped for upload size. */
export async function elementsPng(api: ExcalidrawImperativeAPI, elements: El[]) {
  const blob = await exportToBlob({
    elements,
    files: api.getFiles(),
    mimeType: 'image/png',
    exportPadding: 24,
    appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: '#ffffff', exportWithDarkMode: false },
    getDimensions: (w: number, h: number) => {
      const scale = Math.min(2, 1568 / Math.max(w, h))
      return { width: w * scale, height: h * scale, scale }
    },
  } as any)
  return blob
}

export function boundsOf(elements: El[]) {
  const xs = elements.flatMap((e) => [e.x, e.x + (e.width ?? 0)])
  const ys = elements.flatMap((e) => [e.y, e.y + (e.height ?? 0)])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}
