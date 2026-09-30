import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { cn, uid } from '@/lib/utils'
import { heldStill, recognize } from '@/lib/ink'
import { useAuth } from '@/store/auth'
import type { PdfAnnot, PdfCalibration, PdfPageRef } from '@/store/types'
import { AnnotShape } from './AnnotShape'
import { getOcr, getPage, renderToCanvas, viewportFor, type TextRun } from './engine'
import {
  BOXY,
  VERTEX,
  annotBox,
  boxOf,
  dist,
  fitToBox,
  flat,
  hitDistance,
  pairs,
  round,
  stampSize,
  translate,
  type Box,
  type Pt,
} from './geometry'
import { addAnnots, patchAnnots, removeAnnots, styleFor, useStudio, type Tool } from './store'

const DRAG_TOOLS = new Set<Tool>(['rect', 'ellipse', 'cloud', 'line', 'arrow', 'length', 'redact', 'calibrate', 'callout'])
const POLY_TOOLS = new Set<Tool>(['polygon', 'polylength', 'area'])

type Gesture =
  | { type: 'ink'; samples: { x: number; y: number; t: number }[]; snapped: boolean }
  | { type: 'drag'; from: Pt }
  | { type: 'move'; from: Pt; originals: PdfAnnot[]; moved: boolean }
  | { type: 'resize'; orig: PdfAnnot; origBox: Box; fixed: Pt }
  | { type: 'vertex'; orig: PdfAnnot; index: number }
  | { type: 'erase'; erased: Set<string> }
  | { type: 'textsel' }

export interface PageHit {
  box: [number, number, number, number]
  active: boolean
}

interface Props {
  pref: PdfPageRef
  number: number
  scale: number
  near: boolean
  annots: PdfAnnot[]
  cal: PdfCalibration
  hits: PageHit[]
  baseSize: { w: number; h: number }
}

export const PageView = memo(function PageView({ pref, number, scale, near, annots, cal, hits, baseSize }: Props) {
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)

  const tool = useStudio((s) => s.tool)
  const selection = useStudio((s) => s.selection)
  const editing = useStudio((s) => s.editing)
  const flash = useStudio((s) => (s.flash?.page === pref.key ? s.flash : null))
  const ocrVersion = useStudio((s) => s.ocrVersion)

  const [draft, setDraft] = useState<PdfAnnot | null>(null)
  const [live, setLive] = useState<Record<string, PdfAnnot>>({})
  const [hover, setHover] = useState<Pt | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [ocr, setOcr] = useState<TextRun[] | null>(null)

  useEffect(() => {
    if (!near || page) return
    getPage(pref.src, pref.index).then(setPage, (e) => setErr(e instanceof Error ? e.message : 'Could not load page'))
  }, [near, page, pref.src, pref.index])

  const vp = useMemo<PageViewport | null>(() => (page ? viewportFor(page, scale, pref.rotate) : null), [page, scale, pref.rotate])
  const upright = page ? (page.rotate + pref.rotate) % 360 : 0
  const w = vp ? vp.width : baseSize.w * scale
  const h = vp ? vp.height : baseSize.h * scale

  // Canvas: re-render (debounced) on zoom; the old bitmap stretches meanwhile.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!near || !page || !canvas) return
    let handle: ReturnType<typeof renderToCanvas> | null = null
    const t = setTimeout(
      () => {
        handle = renderToCanvas(page, canvas, scale, pref.rotate)
        handle.promise.then(() => setRendered(true)).catch(() => {})
      },
      rendered ? 140 : 0,
    )
    return () => {
      clearTimeout(t)
      handle?.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, page, scale, pref.rotate])

  // Free the bitmap when the page scrolls far away.
  useEffect(() => {
    if (near) return
    const c = canvasRef.current
    if (c) c.width = c.height = 0
    setRendered(false)
  }, [near])

  // Native text layer (selection, copy, text highlights).
  useEffect(() => {
    const el = textRef.current
    if (!near || !page || !el || !vp) return
    el.replaceChildren()
    el.style.setProperty('--total-scale-factor', String(scale))
    el.style.setProperty('--scale-round-x', '1px')
    el.style.setProperty('--scale-round-y', '1px')
    const layer = new TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true }), container: el, viewport: vp })
    const t = setTimeout(() => void layer.render().catch(() => {}), 60)
    return () => {
      clearTimeout(t)
      layer.cancel()
    }
  }, [near, page, vp, scale])

  useEffect(() => {
    if (!near) return
    let alive = true
    void getOcr(pref.src, pref.index).then((o) => alive && setOcr(o?.words ?? null))
    return () => {
      alive = false
    }
  }, [near, pref.src, pref.index, ocrVersion])

  /* ---------------- coordinates ---------------- */

  const toPdf = (e: { clientX: number; clientY: number }): Pt => {
    const r = rootRef.current!.getBoundingClientRect()
    const [x, y] = vp!.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top)
    return [x, y]
  }
  const toScreen = (p: Pt): Pt => {
    const [x, y] = vp!.convertToViewportPoint(p[0], p[1])
    return [x, y]
  }
  const screenBox = (b: Box) => {
    const a = toScreen([b.x0, b.y0])
    const c = toScreen([b.x1, b.y1])
    return { left: Math.min(a[0], c[0]), top: Math.min(a[1], c[1]), width: Math.abs(c[0] - a[0]), height: Math.abs(c[1] - a[1]) }
  }

  const shown = useMemo(() => annots.map((a) => live[a.id] ?? a), [annots, live])
  const tol = 6 / scale

  const hitTest = (p: Pt) => {
    for (let i = shown.length - 1; i >= 0; i--) if (hitDistance(shown[i], p) <= tol) return shown[i]
    return null
  }

  const newAnnot = (kind: PdfAnnot['kind'], pts: number[], extra: Partial<PdfAnnot> = {}): PdfAnnot => {
    const st = useStudio.getState()
    const s = styleFor(st.tool, st.styles)
    return {
      id: uid('m'),
      page: pref.key,
      kind,
      pts,
      color: s.color,
      width: s.width,
      opacity: s.opacity,
      fill: s.fill ?? undefined,
      size: s.size,
      angle: upright || undefined,
      author: useAuth.getState().account?.name,
      status: 'open',
      createdAt: new Date().toISOString(),
      ...extra,
    }
  }

  const constrain = (from: Pt, to: Pt, shift: boolean, square: boolean): Pt => {
    if (!shift) return to
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    if (square) {
      const m = Math.max(Math.abs(dx), Math.abs(dy))
      return [from[0] + Math.sign(dx || 1) * m, from[1] + Math.sign(dy || 1) * m]
    }
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12)
    const l = Math.hypot(dx, dy)
    return [from[0] + Math.cos(ang) * l, from[1] + Math.sin(ang) * l]
  }

  /* ---------------- smart ink ---------------- */

  const inkToShape = (a: PdfAnnot): PdfAnnot | null => {
    const pts: Pt[] = []
    for (let i = 0; i + 1 < a.pts.length; i += 3) pts.push([a.pts[i], a.pts[i + 1]])
    const r = recognize(pts)
    if (!r) return null
    const base = { ...a, fill: undefined }
    switch (r.type) {
      case 'line':
        return { ...base, kind: 'line', pts: flat([r.a, r.b]) }
      case 'arrow':
        return { ...base, kind: 'arrow', pts: flat([r.a, r.b]) }
      case 'rect':
        return { ...base, kind: 'rect', pts: flat([r.min, r.max]) }
      case 'ellipse':
        return { ...base, kind: 'ellipse', pts: flat([[r.center[0] - r.rx, r.center[1] - r.ry], [r.center[0] + r.rx, r.center[1] + r.ry]]) }
      case 'triangle':
      case 'diamond':
      case 'polygon':
        return { ...base, kind: 'polygon', pts: flat(r.points) }
    }
  }

  /* ---------------- pointer handling ---------------- */

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!vp || e.button === 1 || e.button === 2) return
    const st = useStudio.getState()
    if (st.activePage !== pref.key) st.set({ activePage: pref.key })
    if (tool === 'hand') return
    if ((e.target as HTMLElement).closest('[data-handle], textarea')) return
    const p = toPdf(e)
    const onText = !!(e.target as HTMLElement).closest('.textLayer span, .ocrLayer span')

    if (tool === 'select') {
      const hit = hitTest(p)
      if (hit) {
        e.preventDefault()
        const ids = e.shiftKey ? (st.selection.includes(hit.id) ? st.selection.filter((i) => i !== hit.id) : [...st.selection, hit.id]) : st.selection.includes(hit.id) ? st.selection : [hit.id]
        st.select(ids)
        gesture.current = { type: 'move', from: p, originals: annots.filter((a) => ids.includes(a.id)), moved: false }
        rootRef.current!.setPointerCapture(e.pointerId)
        return
      }
      if (!onText) st.select([])
      gesture.current = { type: 'textsel' }
      return
    }

    if (tool === 'highlight' && onText) {
      gesture.current = { type: 'textsel' }
      return
    }

    e.preventDefault()
    rootRef.current!.setPointerCapture(e.pointerId)

    if (tool === 'eraser') {
      gesture.current = { type: 'erase', erased: new Set() }
      const hit = hitTest(p)
      if (hit) gesture.current.erased.add(hit.id)
      setLive({})
      return
    }
    if (tool === 'pen' || tool === 'highlight') {
      const pr = e.pointerType === 'pen' ? e.pressure : 0.5
      gesture.current = { type: 'ink', samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], snapped: false }
      setDraft(newAnnot(tool === 'pen' ? 'ink' : 'highlight', [round(p[0]), round(p[1]), pr]))
      return
    }
    if (DRAG_TOOLS.has(tool)) {
      gesture.current = { type: 'drag', from: p }
      const kind = tool === 'calibrate' ? 'length' : (tool as PdfAnnot['kind'])
      setDraft(newAnnot(kind, flat([p, p]), tool === 'calibrate' ? { color: '#e5484d' } : tool === 'callout' ? { text: '' } : {}))
      return
    }
    if (POLY_TOOLS.has(tool)) {
      if (draft && POLY_TOOLS.has(tool)) {
        const first = pairs(draft.pts)[0]
        if (tool !== 'polylength' && draft.pts.length >= 6 && dist(first, p) < 8 / scale) return finishPoly()
        setDraft({ ...draft, pts: [...draft.pts, round(p[0]), round(p[1])] })
      } else {
        setDraft(newAnnot(tool as PdfAnnot['kind'], flat([p])))
      }
      return
    }
    if (tool === 'count') {
      const cur = st.countId ? annots.find((a) => a.id === st.countId) : null
      if (cur) patchAnnots({ [cur.id]: { pts: [...cur.pts, round(p[0]), round(p[1])] } })
      else {
        const a = newAnnot('count', flat([p]), { text: '' })
        addAnnots([a])
        st.set({ countId: a.id })
      }
      return
    }
    if (tool === 'text') {
      const a = newAnnot('text', flat([[p[0], p[1] + (st.styles.text?.size ?? 12) * 0.6]]), { text: '' })
      addAnnots([a], { select: true })
      useStudio.setState({ editing: a.id, tool: 'select' })
      return
    }
    if (tool === 'stamp') {
      const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      const who = useAuth.getState().account?.name
      const a = newAnnot('stamp', [], { text: st.stamp.text, color: st.stamp.color, sub: `${who ? who + ' · ' : ''}${today}`, opacity: 0.92 })
      const { w: sw, h: sh } = stampSize(a)
      a.pts = flat([[p[0] - sw / 2, p[1] + sh / 2]])
      addAnnots([a], { select: true })
      return
    }
    if (tool === 'image' && st.signature) {
      const img = new Image()
      img.onload = () => {
        const bw = 150
        const bh = (bw * img.naturalHeight) / Math.max(1, img.naturalWidth)
        addAnnots([newAnnot('image', flat([[p[0] - bw / 2, p[1] - bh / 2], [p[0] + bw / 2, p[1] + bh / 2]]), { src: st.signature!, opacity: 1 })], { select: true })
        useStudio.getState().setTool('select')
      }
      img.src = st.signature
    }
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!vp) return
    const g = gesture.current
    const p = toPdf(e)
    if (!g) {
      if (POLY_TOOLS.has(tool) && draft) setHover(p)
      else if (tool === 'select' && e.pointerType === 'mouse') {
        const hit = hitTest(p)
        rootRef.current!.style.cursor = hit ? 'move' : ''
      }
      return
    }
    switch (g.type) {
      case 'ink': {
        if (!draft) return
        const events = (e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) as PointerEvent[]
        const add: number[] = []
        for (const ev of events) {
          const q = toPdf(ev)
          add.push(round(q[0]), round(q[1]), ev.pointerType === 'pen' ? ev.pressure : 0.5)
          g.samples.push({ x: ev.clientX, y: ev.clientY, t: ev.timeStamp })
        }
        if (g.snapped) return
        setDraft({ ...draft, pts: [...draft.pts, ...add] })
        const sm = useStudio.getState().smartInk
        if (sm === 'hold' && draft.kind === 'ink') {
          clearTimeout(holdTimer.current)
          holdTimer.current = setTimeout(() => {
            if (gesture.current !== g) return
            setDraft((d) => {
              if (!d) return d
              const shape = inkToShape(d)
              if (!shape) return d
              g.snapped = true
              navigator.vibrate?.(8)
              return shape
            })
          }, 480)
        }
        return
      }
      case 'drag': {
        if (!draft) return
        const square = tool === 'rect' || tool === 'ellipse' || tool === 'cloud' || tool === 'redact'
        const to = constrain(g.from, p, e.shiftKey, square)
        setDraft({ ...draft, pts: tool === 'callout' ? flat([g.from, to]) : flat([g.from, to]) })
        return
      }
      case 'move': {
        let dx = p[0] - g.from[0]
        let dy = p[1] - g.from[1]
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
        if (!g.moved && Math.hypot(dx, dy) < 2 / scale) return
        g.moved = true
        setLive(Object.fromEntries(g.originals.map((a) => [a.id, translate(a, dx, dy)])))
        return
      }
      case 'resize': {
        const nb = { x0: Math.min(g.fixed[0], p[0]), y0: Math.min(g.fixed[1], p[1]), x1: Math.max(g.fixed[0], p[0]), y1: Math.max(g.fixed[1], p[1]) }
        if (e.shiftKey || g.orig.kind === 'image') {
          const ar = (g.origBox.x1 - g.origBox.x0) / (g.origBox.y1 - g.origBox.y0 || 1)
          const wNew = nb.x1 - nb.x0
          const hNew = wNew / ar
          if (p[1] < g.fixed[1]) nb.y0 = g.fixed[1] - hNew
          else nb.y1 = g.fixed[1] + hNew
        }
        if (nb.x1 - nb.x0 < 2 || nb.y1 - nb.y0 < 2) return
        setLive({ [g.orig.id]: fitToBox(g.orig, g.origBox, nb) })
        return
      }
      case 'vertex': {
        const pts = g.orig.pts.slice()
        pts[g.index * 2] = round(p[0])
        pts[g.index * 2 + 1] = round(p[1])
        setLive({ [g.orig.id]: { ...g.orig, pts } })
        return
      }
      case 'erase': {
        const hit = hitTest(p)
        if (hit && !g.erased.has(hit.id)) {
          g.erased.add(hit.id)
          setLive((l) => ({ ...l, [hit.id]: { ...hit, opacity: 0.15 } }))
        }
        return
      }
    }
  }

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    gesture.current = null
    clearTimeout(holdTimer.current)
    if (!g || !vp) return
    const st = useStudio.getState()
    switch (g.type) {
      case 'ink': {
        if (!draft) return
        let a = draft
        if (!g.snapped && a.kind === 'ink') {
          if (st.smartInk === 'always' || (st.smartInk === 'hold' && heldStill(g.samples, 450, 5))) a = inkToShape(a) ?? a
        }
        setDraft(null)
        if (a.pts.length >= 6 || a.kind !== 'ink') addAnnots([a])
        return
      }
      case 'drag': {
        if (!draft) return
        const [a, b] = pairs(draft.pts)
        setDraft(null)
        if (dist(a, b) < 3 / scale) {
          if (tool !== 'callout') return
          draft.pts = flat([a, [a[0] + 40, a[1] + 30]])
        }
        if (tool === 'calibrate') {
          st.set({ calibrating: { page: pref.key, points: dist(a, b) } })
          return
        }
        if (tool === 'callout') {
          const [tip, box] = pairs(draft.pts)
          const c = { ...draft, pts: flat([tip, [box[0], box[1]]]) }
          addAnnots([c], { select: true })
          useStudio.setState({ editing: c.id })
          return
        }
        addAnnots([draft])
        return
      }
      case 'move': {
        if (g.moved) {
          patchAnnots(Object.fromEntries(Object.values(live).map((a) => [a.id, { pts: a.pts }])))
        }
        setLive({})
        return
      }
      case 'resize':
      case 'vertex': {
        const a = live[g.orig.id]
        if (a) patchAnnots({ [a.id]: { pts: a.pts } })
        setLive({})
        return
      }
      case 'erase': {
        setLive({})
        removeAnnots([...g.erased])
        return
      }
      case 'textsel': {
        if (tool === 'highlight') setTimeout(() => highlightSelection(), 0)
        void e
        return
      }
    }
  }

  /** Converts the current text selection on this page into a text highlight. */
  const highlightSelection = (variant?: 'underline' | 'strike') => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !rootRef.current || !vp) return
    const pageRect = rootRef.current.getBoundingClientRect()
    const rects: Box[] = []
    for (let i = 0; i < sel.rangeCount; i++) {
      for (const r of sel.getRangeAt(i).getClientRects()) {
        if (r.width < 1 || r.height < 1) continue
        if (r.right < pageRect.left || r.left > pageRect.right || r.bottom < pageRect.top || r.top > pageRect.bottom) continue
        const a = toPdf({ clientX: r.left, clientY: r.top })
        const b = toPdf({ clientX: r.right, clientY: r.bottom })
        const box = boxOf([a, b])
        // Merge boxes on the same line.
        const same = rects.find((q) => Math.abs(q.y0 - box.y0) < 2 && Math.abs(q.y1 - box.y1) < 2 && box.x0 <= q.x1 + 3 && box.x1 >= q.x0 - 3)
        if (same) {
          same.x0 = Math.min(same.x0, box.x0)
          same.x1 = Math.max(same.x1, box.x1)
        } else rects.push(box)
      }
    }
    if (!rects.length) return
    const st = useStudio.getState()
    const s = styleFor('highlight', st.styles)
    const text = sel.toString().trim()
    sel.removeAllRanges()
    addAnnots([
      newAnnot('texthl', rects.flatMap((b) => [round(b.x0), round(b.y0), round(b.x1), round(b.y1)]), {
        color: variant ? (variant === 'strike' ? '#e5484d' : '#0090ff') : s.color,
        opacity: variant ? 1 : 0.45,
        width: 1.4,
        sub: variant,
        text,
      }),
    ])
  }

  // Exposed for the selection toolbar.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    ;(el as HTMLDivElement & { highlightSelection?: typeof highlightSelection }).highlightSelection = highlightSelection
  })

  const finishPoly = () => {
    if (!draft) return
    // A double-click lands its point twice; drop consecutive duplicates.
    const pts = pairs(draft.pts).filter((q, i, arr) => i === 0 || dist(q, arr[i - 1]) > 2 / scale)
    const min = draft.kind === 'polylength' ? 2 : 3
    if (pts.length >= min) addAnnots([{ ...draft, pts: flat(pts) }])
    setDraft(null)
    setHover(null)
  }

  // Keyboard for in-progress polygons.
  useEffect(() => {
    if (!draft || !POLY_TOOLS.has(tool)) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishPoly()
      else if (e.key === 'Escape') {
        setDraft(null)
        setHover(null)
      } else if (e.key === 'Backspace') {
        setDraft((d) => (d && d.pts.length > 2 ? { ...d, pts: d.pts.slice(0, -2) } : null))
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Abandon half-drawn polygons when the tool changes.
  useEffect(() => {
    setDraft(null)
    setHover(null)
  }, [tool])

  /* ---------------- handles ---------------- */

  const selectedHere = tool === 'select' ? shown.filter((a) => selection.includes(a.id)) : []
  const single = selectedHere.length === 1 && selection.length === 1 ? selectedHere[0] : null

  const startHandle = (e: RPointerEvent, g: Gesture) => {
    e.stopPropagation()
    e.preventDefault()
    rootRef.current!.setPointerCapture(e.pointerId)
    gesture.current = g
  }

  const draftShown = draft && hover && POLY_TOOLS.has(tool) ? { ...draft, pts: [...draft.pts, round(hover[0]), round(hover[1])] } : draft

  const cursor =
    tool === 'hand' ? 'grab' : tool === 'select' ? undefined : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair'

  const editingAnnot = editing ? shown.find((a) => a.id === editing) : null

  return (
    <div
      ref={rootRef}
      data-page-key={pref.key}
      data-page-number={number}
      className={cn('pdf-page relative mx-auto bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2),0_8px_28px_-6px_rgb(0_0_0/0.35)]', tool !== 'select' && tool !== 'highlight' && 'no-text-select')}
      style={{ width: w, height: h, cursor, touchAction: tool === 'hand' || tool === 'select' ? 'pan-x pan-y' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={(e) => {
        if (!vp) return
        if (POLY_TOOLS.has(tool) && draft) return finishPoly()
        if (tool === 'select') {
          const hit = hitTest(toPdf(e))
          if (hit && (hit.kind === 'text' || hit.kind === 'callout' || hit.kind === 'stamp')) useStudio.setState({ selection: [hit.id], editing: hit.id })
        }
      }}
    >
      <canvas ref={canvasRef} className={cn('absolute inset-0 size-full transition-opacity duration-300', rendered ? 'opacity-100' : 'opacity-0')} />
      {!rendered && (
        <div className="absolute inset-0 grid place-items-center">
          {err ? <span className="px-4 text-center text-xs text-neutral-500">{err}</span> : <div className="pdf-shimmer absolute inset-0" />}
        </div>
      )}
      <div ref={textRef} className="textLayer" style={{ pointerEvents: tool === 'select' || tool === 'highlight' ? 'auto' : 'none' }} />
      {ocr && vp && <OcrLayer words={ocr} vp={vp} active={tool === 'select' || tool === 'highlight'} />}
      {vp && (
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={w} height={h}>
          <g transform={`matrix(${vp.transform.join(',')})`}>
            {hits.map((hh, i) => (
              <rect key={i} x={hh.box[0]} y={hh.box[1]} width={hh.box[2] - hh.box[0]} height={hh.box[3] - hh.box[1]} fill={hh.active ? '#ff8b00' : '#ffd400'} fillOpacity={hh.active ? 0.55 : 0.35} style={{ mixBlendMode: 'multiply' }} rx={1} />
            ))}
            {shown.map((a) =>
              editing === a.id && a.kind === 'text' ? null : <AnnotShape key={a.id} a={a} cal={cal} upright={upright} scale={scale} />,
            )}
            {draftShown && <AnnotShape a={draftShown} cal={cal} upright={upright} scale={scale} />}
            {flash && (
              <rect
                key={flash.at}
                x={flash.box[0] - 4}
                y={flash.box[1] - 4}
                width={flash.box[2] - flash.box[0] + 8}
                height={flash.box[3] - flash.box[1] + 8}
                fill="none"
                stroke="var(--color-accent, #7c5cff)"
                strokeWidth={3 / scale}
                rx={4 / scale}
                className="pdf-flash"
              />
            )}
          </g>
        </svg>
      )}

      {vp &&
        selectedHere.map((a) => {
          const b = screenBox(annotBox(a))
          return <div key={a.id} className="pointer-events-none absolute rounded-[3px] outline-[1.5px] outline-accent outline-dashed" style={{ left: b.left - 3, top: b.top - 3, width: b.width + 6, height: b.height + 6 }} />
        })}

      {vp && single && BOXY.has(single.kind) && (() => {
        const bx = annotBox(single)
        const corners: [Pt, Pt][] = [
          [[bx.x0, bx.y0], [bx.x1, bx.y1]],
          [[bx.x1, bx.y0], [bx.x0, bx.y1]],
          [[bx.x1, bx.y1], [bx.x0, bx.y0]],
          [[bx.x0, bx.y1], [bx.x1, bx.y0]],
        ]
        const pad = single.width / 2
        const inner = { x0: bx.x0 + pad, y0: bx.y0 + pad, x1: bx.x1 - pad, y1: bx.y1 - pad }
        return corners.map(([c, fixed], i) => {
          const [sx, sy] = toScreen(c)
          return (
            <Handle
              key={i}
              x={sx}
              y={sy}
              onPointerDown={(e) => startHandle(e, { type: 'resize', orig: annots.find((a) => a.id === single.id)!, origBox: inner, fixed: [fixed[0] + (fixed[0] === bx.x0 ? pad : -pad), fixed[1] + (fixed[1] === bx.y0 ? pad : -pad)] })}
            />
          )
        })
      })()}
      {vp &&
        single &&
        VERTEX.has(single.kind) &&
        pairs(single.pts).map((q, i) => {
          const [sx, sy] = toScreen(q)
          return <Handle key={i} x={sx} y={sy} round onPointerDown={(e) => startHandle(e, { type: 'vertex', orig: annots.find((a) => a.id === single.id)!, index: i })} />
        })}

      {vp && editingAnnot && (editingAnnot.kind === 'text' || editingAnnot.kind === 'callout' || editingAnnot.kind === 'stamp') && (
        <InlineEditor key={editingAnnot.id} a={editingAnnot} vp={vp} scale={scale} />
      )}

      <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10.5px] text-subtle select-none">{number}</div>
    </div>
  )
})

function Handle({ x, y, round: isRound, onPointerDown }: { x: number; y: number; round?: boolean; onPointerDown: (e: RPointerEvent) => void }) {
  return (
    <div
      data-handle
      onPointerDown={onPointerDown}
      className={cn('absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 border-[1.5px] border-accent bg-white shadow-sm', isRound ? 'rounded-full' : 'rounded-[3px]')}
      style={{ left: x, top: y, cursor: 'grab', touchAction: 'none' }}
    />
  )
}

/** Transparent, selectable spans over OCR'd words so scanned pages behave like text. */
function OcrLayer({ words, vp, active }: { words: TextRun[]; vp: PageViewport; active: boolean }) {
  const spans = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d')!
    return words.map((wd) => {
      const [ax, ay] = vp.convertToViewportPoint(wd.x0, wd.y1)
      const [bx, by] = vp.convertToViewportPoint(wd.x1, wd.y0)
      const left = Math.min(ax, bx)
      const top = Math.min(ay, by)
      const width = Math.abs(bx - ax)
      const height = Math.abs(by - ay)
      ctx.font = `${height}px sans-serif`
      const natural = ctx.measureText(wd.str).width || 1
      return { left, top, width, height, sx: width / natural, str: wd.str }
    })
  }, [words, vp])
  return (
    <div className="ocrLayer absolute inset-0" style={{ pointerEvents: active ? 'auto' : 'none' }}>
      {spans.map((s, i) => (
        <span key={i} style={{ left: s.left, top: s.top, fontSize: s.height, transform: `scaleX(${s.sx})` }}>
          {s.str + ' '}
        </span>
      ))}
    </div>
  )
}

function InlineEditor({ a, vp, scale }: { a: PdfAnnot; vp: PageViewport; scale: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(a.text ?? '')
  const p = pairs(a.pts)
  const anchor: Pt = a.kind === 'callout' ? [p[1][0] + 6, p[1][1] - 5] : a.kind === 'stamp' ? p[0] : [p[0][0] + 2, p[0][1] - 2]
  const [left, top] = vp.convertToViewportPoint(anchor[0], anchor[1])
  const size = (a.size ?? 12) * scale

  // Focus after the browser's own mousedown focus handling has run, or it steals focus back.
  const ready = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus({ preventScroll: true })
      ref.current?.select()
      ready.current = true
    }, 0)
    return () => clearTimeout(t)
  }, [])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
    el.style.width = '0px'
    el.style.width = `${Math.max(size * 4, el.scrollWidth + 4)}px`
  }, [value, size])

  // Commit exactly once — on blur, Esc/⌘↵, or when the editor unmounts because the
  // selection changed (a click elsewhere can unmount us before blur fires).
  const latest = useRef(value)
  latest.current = value
  const committed = useRef(false)
  const commit = () => {
    if (committed.current) return
    committed.current = true
    const text = latest.current.replace(/\s+$/, '')
    if (!text && a.kind === 'text') return removeAnnots([a.id])
    if (text !== (a.text ?? '')) patchAnnots({ [a.id]: { text: a.kind === 'stamp' ? text.toUpperCase() : text } })
  }
  const done = () => {
    commit()
    if (useStudio.getState().editing === a.id) useStudio.setState({ editing: null })
  }
  useEffect(() => () => commit(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => ready.current && done()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          ref.current?.blur()
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      spellCheck
      wrap="off"
      placeholder="Type…"
      className="absolute z-20 resize-none overflow-hidden rounded-[3px] bg-white/90 p-0 leading-[1.22] text-neutral-900 caret-accent shadow-[0_0_0_2px_var(--color-accent)] outline-none placeholder:text-neutral-400"
      style={{ left, top, fontSize: size, fontFamily: 'Helvetica, Arial, sans-serif', color: a.kind === 'text' ? a.color : undefined, minHeight: size * 1.3 }}
    />
  )
}
