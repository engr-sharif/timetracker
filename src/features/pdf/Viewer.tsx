import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PdfAnnot, PdfDoc } from '@/store/types'
import { DEFAULT_CALIBRATION } from './geometry'
import { PageView, type PageHit } from './PageView'
import { useStudio } from './store'

const GAP = 34
const PAD = 40

export interface SearchHit {
  page: string
  box: [number, number, number, number]
}

export function Viewer({ doc, sizes, hits, activeHit, scrollRef }: { doc: PdfDoc; sizes: Record<string, { w: number; h: number }>; hits: SearchHit[]; activeHit: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const zoom = useStudio((s) => s.zoom)
  const fit = useStudio((s) => s.fit)
  const tool = useStudio((s) => s.tool)
  const setZoom = useStudio((s) => s.setZoom)
  const [near, setNear] = useState<Set<string>>(new Set())
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const anchor = useRef<{ x: number; y: number; cx: number; cy: number; k: number } | null>(null)
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const pinch = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ d: number; zoom: number } | null>(null)
  const [space, setSpace] = useState(false)

  const byPage = useMemo(() => {
    const m = new Map<string, PdfAnnot[]>()
    for (const a of doc.annots) {
      const l = m.get(a.page)
      if (l) l.push(a)
      else m.set(a.page, [a])
    }
    return m
  }, [doc.annots])

  const hitsByPage = useMemo(() => {
    const m = new Map<string, PageHit[]>()
    hits.forEach((h, i) => {
      const l = m.get(h.page) ?? []
      l.push({ box: h.box, active: i === activeHit })
      m.set(h.page, l)
    })
    return m
  }, [hits, activeHit])

  const maxW = Math.max(1, ...doc.pages.map((p) => sizes[p.key]?.w ?? 612))
  const firstH = sizes[doc.pages[0]?.key]?.h ?? 792

  // Fit modes recompute zoom when the viewport or document changes.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth)
      setHeight(el.clientHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollRef])

  useEffect(() => {
    if (!fit || !width) return
    const zw = (width - PAD * 2) / maxW
    const z = fit === 'width' ? zw : Math.min(zw, (height - PAD * 2) / firstH)
    if (Math.abs(z - zoom) > 0.001) setZoom(Math.min(4, Math.max(0.1, z)), fit)
  }, [fit, width, height, maxW, firstH, zoom, setZoom])

  // Keep the point under the cursor fixed while zooming.
  useLayoutEffect(() => {
    const a = anchor.current
    const el = scrollRef.current
    if (!a || !el) return
    anchor.current = null
    el.scrollLeft = (a.cx + PAD) * a.k - PAD - a.x
    el.scrollTop = a.cy * a.k - a.y
  }, [zoom, scrollRef])

  const zoomAt = (next: number, clientX: number, clientY: number) => {
    const el = scrollRef.current
    if (!el) return
    const z = Math.min(8, Math.max(0.1, next))
    const r = el.getBoundingClientRect()
    const x = clientX - r.left
    const y = clientY - r.top
    anchor.current = { x, y, cx: el.scrollLeft + x - PAD, cy: el.scrollTop + y, k: z / zoom }
    setZoom(z, null)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAt(useStudio.getState().zoom * Math.exp(-dy * 0.0022), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // Space-to-pan, like every design tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input, textarea, [contenteditable]')) {
        if (!space) setSpace(true)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [space])

  // Render only pages near the viewport.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev)
          for (const e of entries) {
            const k = (e.target as HTMLElement).dataset.slot!
            if (e.isIntersecting) next.add(k)
            else next.delete(k)
          }
          return next
        })
      },
      { root, rootMargin: '120% 0px' },
    )
    root.querySelectorAll('[data-slot]').forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [doc.pages, scrollRef])

  // Track the page in view.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const mid = root.scrollTop + root.clientHeight * 0.4
        let best: string | null = null
        for (const n of root.querySelectorAll<HTMLElement>('[data-slot]')) {
          if (n.offsetTop <= mid) best = n.dataset.slot!
          else break
        }
        if (best && best !== useStudio.getState().activePage) useStudio.getState().set({ activePage: best })
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [scrollRef, doc.pages])

  const panning = tool === 'hand' || space

  return (
    <div
      ref={scrollRef}
      className="pdf-stage absolute inset-0 overflow-auto overscroll-contain"
      style={{ cursor: panning ? (pan.current ? 'grabbing' : 'grab') : undefined }}
      onPointerDownCapture={(e) => {
        if (e.pointerType === 'touch') {
          pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch.current.size === 2) {
            const [a, b] = [...pinch.current.values()]
            pinchStart.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom }
          }
        }
        if (panning || e.button === 1) {
          e.preventDefault()
          e.stopPropagation()
          const el = scrollRef.current!
          pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
          el.setPointerCapture(e.pointerId)
        }
      }}
      onPointerMoveCapture={(e) => {
        if (pinch.current.has(e.pointerId)) {
          pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch.current.size === 2 && pinchStart.current) {
            const [a, b] = [...pinch.current.values()]
            const d = Math.hypot(a.x - b.x, a.y - b.y)
            zoomAt(pinchStart.current.zoom * (d / pinchStart.current.d), (a.x + b.x) / 2, (a.y + b.y) / 2)
            e.stopPropagation()
            return
          }
        }
        const p = pan.current
        if (!p) return
        const el = scrollRef.current!
        el.scrollLeft = p.sl - (e.clientX - p.x)
        el.scrollTop = p.st - (e.clientY - p.y)
      }}
      onPointerUpCapture={(e) => {
        pinch.current.delete(e.pointerId)
        if (pinch.current.size < 2) pinchStart.current = null
        pan.current = null
      }}
      onPointerCancelCapture={(e) => {
        pinch.current.delete(e.pointerId)
        pinchStart.current = null
        pan.current = null
      }}
    >
      <div className="flex min-w-full flex-col items-center" style={{ padding: `${PAD}px ${PAD}px ${PAD + 120}px`, gap: GAP, width: 'max-content', minWidth: '100%' }}>
        {doc.pages.map((p, i) => {
          const size = sizes[p.key] ?? { w: 612, h: 792 }
          return (
            <div key={p.key} data-slot={p.key} style={{ width: size.w * zoom, height: size.h * zoom }} className={panning ? 'pointer-events-none' : undefined}>
              <PageView
                pref={p}
                number={i + 1}
                scale={zoom}
                near={near.has(p.key)}
                annots={byPage.get(p.key) ?? EMPTY}
                cal={doc.pageScales?.[p.key] ?? doc.scale ?? DEFAULT_CALIBRATION}
                hits={hitsByPage.get(p.key) ?? NO_HITS}
                baseSize={size}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const EMPTY: PdfAnnot[] = []
const NO_HITS: PageHit[] = []

/** Scrolls so that a PDF-space box on a page is centred in view. */
export function scrollToBox(root: HTMLElement, pageKey: string, box?: [number, number, number, number], smooth = true) {
  const slot = root.querySelector<HTMLElement>(`[data-slot="${CSS.escape(pageKey)}"]`)
  if (!slot) return
  if (!box) {
    root.scrollTo({ top: slot.offsetTop - 24, behavior: smooth ? 'smooth' : 'auto' })
    return
  }
  // The page's flash overlay is drawn in PDF space, so it lands correctly for any
  // zoom or rotation; centre on it once the page has rendered.
  useStudio.getState().set({ flash: { page: pageKey, box, at: Date.now() } })
  const rootRect = root.getBoundingClientRect()
  const slotRect = slot.getBoundingClientRect()
  if (slotRect.bottom < rootRect.top || slotRect.top > rootRect.bottom) root.scrollTo({ top: slot.offsetTop - 24 })
  let tries = 0
  const centre = () => {
    const r = slot.querySelector('rect.pdf-flash')?.getBoundingClientRect()
    if (!r) return ++tries < 20 && setTimeout(centre, 50)
    const rr = root.getBoundingClientRect()
    root.scrollTo({
      top: root.scrollTop + r.top - rr.top - root.clientHeight / 2 + r.height / 2,
      left: root.scrollLeft + r.left - rr.left - root.clientWidth / 2 + r.width / 2,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }
  setTimeout(centre, 30)
}
