import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Cloud, Crosshair, FileSearch, Upload } from 'lucide-react'
import { cn, uid } from '@/lib/utils'
import { putBlob } from '@/lib/files'
import { useList, ws } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import type { PdfDoc } from '@/store/types'
import { Button } from '@/components/ui/button'
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '@/components/ui/popover'
import { Segmented } from '@/components/ui/misc'
import { Spinner } from '@/components/ui/button'
import { getPage, loadPdf, rasterize } from './engine'
import { flat } from './geometry'
import { addAnnots, useStudio } from './store'

type Mode = 'overlay' | 'swipe' | 'side'

interface Raster {
  canvas: HTMLCanvasElement
  dark: Float32Array
  w: number
  h: number
  toPdf: (x: number, y: number) => [number, number]
}

/** Ink darkness 0..1 per pixel. */
function darkness(c: HTMLCanvasElement) {
  const { data } = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
  const out = new Float32Array(c.width * c.height)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) out[j] = 1 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
  return out
}

function downsample(r: Raster, f: number) {
  const w = Math.floor(r.w / f)
  const h = Math.floor(r.h / f)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) m = Math.max(m, r.dark[(y * f + yy) * r.w + x * f + xx])
      out[y * w + x] = m
    }
  return { d: out, w, h }
}

function score(a: Float32Array, b: Float32Array, w: number, h: number, dx: number, dy: number, step = 1) {
  let s = 0
  for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y += step)
    for (let x = Math.max(0, dx); x < Math.min(w, w + dx); x += step) {
      const va = a[y * w + x]
      const vb = b[(y - dy) * w + (x - dx)]
      s += va * vb
    }
  return s
}

/** Finds the (dx, dy) that best lines B up with A: coarse search on a downsampled image, then refine. */
function autoAlign(A: Raster, B: Raster): [number, number] {
  const f = Math.max(1, Math.round(A.w / 360))
  const a = downsample(A, f)
  const b = downsample(B, f)
  const w = Math.min(a.w, b.w)
  const h = Math.min(a.h, b.h)
  let best = [0, 0, -Infinity]
  const R = Math.round(w * 0.04)
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const s = score(a.d, b.d, w, h, dx, dy, 2)
      if (s > best[2]) best = [dx, dy, s]
    }
  let [bx, by] = [best[0] * f, best[1] * f]
  let top = -Infinity
  let out: [number, number] = [bx, by]
  for (let dy = by - f; dy <= by + f; dy++)
    for (let dx = bx - f; dx <= bx + f; dx++) {
      const s = score(A.dark, B.dark, Math.min(A.w, B.w), Math.min(A.h, B.h), dx, dy, 3)
      if (s > top) {
        top = s
        out = [dx, dy]
      }
    }
  ;[bx, by] = out
  return [bx, by]
}

interface Diff {
  overlay: HTMLCanvasElement
  changed: number
  boxes: { x0: number; y0: number; x1: number; y1: number }[]
}

function compose(A: Raster, B: Raster, dx: number, dy: number): Diff {
  const w = A.w
  const h = A.h
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const px = img.data
  const cell = Math.max(12, Math.round(w / 90))
  const cw = Math.ceil(w / cell)
  const ch = Math.ceil(h / cell)
  const hot = new Uint16Array(cw * ch)
  let ink = 0
  let changed = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const da = A.dark[i]
      const bx = x - dx
      const by = y - dy
      const db = bx >= 0 && by >= 0 && bx < B.w && by < B.h ? B.dark[by * B.w + bx] : 0
      // A-only → red, B-only → blue, both → dark grey.
      const o = i * 4
      px[o] = 255 * (1 - db)
      px[o + 1] = 255 * (1 - Math.max(da, db)) * 0.92 + 20 * (1 - Math.max(da, db))
      px[o + 2] = 255 * (1 - da)
      px[o + 3] = 255
      if (da > 0.25 || db > 0.25) {
        ink++
        if (Math.abs(da - db) > 0.45) {
          changed++
          hot[Math.floor(y / cell) * cw + Math.floor(x / cell)]++
        }
      }
    }
  ctx.putImageData(img, 0, 0)
  // Group hot cells into change regions (connected components with a 1-cell bridge).
  const thresh = Math.max(4, cell * cell * 0.02)
  const seen = new Uint8Array(cw * ch)
  const boxes: Diff['boxes'] = []
  for (let i = 0; i < hot.length; i++) {
    if (seen[i] || hot[i] < thresh) continue
    const stack = [i]
    seen[i] = 1
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, mass = 0
    while (stack.length) {
      const j = stack.pop()!
      const cx = j % cw
      const cy = Math.floor(j / cw)
      x0 = Math.min(x0, cx)
      y0 = Math.min(y0, cy)
      x1 = Math.max(x1, cx)
      y1 = Math.max(y1, cy)
      mass += hot[j]
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -2; xx <= 2; xx++) {
          const nx = cx + xx
          const ny = cy + yy
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
          const k = ny * cw + nx
          if (!seen[k] && hot[k] >= thresh) {
            seen[k] = 1
            stack.push(k)
          }
        }
    }
    if (mass < thresh * 2) continue
    boxes.push({ x0: x0 * cell - cell * 0.6, y0: y0 * cell - cell * 0.6, x1: (x1 + 1) * cell + cell * 0.6, y1: (y1 + 1) * cell + cell * 0.6 })
  }
  return { overlay: out, changed: ink ? changed / ink : 0, boxes }
}

export function Compare({ doc }: { doc: PdfDoc }) {
  const activePage = useStudio((s) => s.activePage)
  const pdfFiles = useList('files').filter((f) => (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) && f.id !== doc.fileId)
  const [otherId, setOtherId] = useState<string | null>(null)
  const [otherPages, setOtherPages] = useState(0)
  const [pageA, setPageA] = useState(activePage ?? doc.pages[0].key)
  const [pageB, setPageB] = useState(0)
  const [mode, setMode] = useState<Mode>('overlay')
  const [A, setA] = useState<Raster | null>(null)
  const [B, setB] = useState<Raster | null>(null)
  const [offset, setOffset] = useState<[number, number]>([0, 0])
  const [busy, setBusy] = useState(false)
  const [swipe, setSwipe] = useState(0.5)
  const [showBoxes, setShowBoxes] = useState(true)
  const upload = useRef<HTMLInputElement>(null)
  const otherName = useList('files').find((f) => f.id === otherId)?.name

  useEffect(() => {
    if (!otherId) return
    void loadPdf(otherId).then((p) => {
      setOtherPages(p.numPages)
      const idx = doc.pages.findIndex((x) => x.key === pageA)
      setPageB(Math.min(p.numPages - 1, Math.max(0, idx)))
    }, () => toast.error('Could not open that PDF'))
  }, [otherId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rasterize both pages at the same pixel width.
  useEffect(() => {
    const ref = doc.pages.find((p) => p.key === pageA)
    if (!ref || !otherId) return
    let alive = true
    setBusy(true)
    ;(async () => {
      const a = await rasterize(ref.src, ref.index, { maxSide: 2200, rotate: ref.rotate })
      const pb = await getPage(otherId, pageB)
      const vb = pb.getViewport({ scale: 1, rotation: pb.rotate })
      const b = await rasterize(otherId, pageB, { scale: a.canvas.width / vb.width })
      if (!alive) return
      const ra: Raster = { canvas: a.canvas, dark: darkness(a.canvas), w: a.canvas.width, h: a.canvas.height, toPdf: (x, y) => a.viewport.convertToPdfPoint(x, y) as [number, number] }
      const rb: Raster = { canvas: b.canvas, dark: darkness(b.canvas), w: b.canvas.width, h: b.canvas.height, toPdf: (x, y) => b.viewport.convertToPdfPoint(x, y) as [number, number] }
      setA(ra)
      setB(rb)
      setOffset([0, 0])
      setBusy(false)
    })().catch((e) => {
      setBusy(false)
      toast.error('Compare failed', { description: e instanceof Error ? e.message : undefined })
    })
    return () => {
      alive = false
    }
  }, [pageA, pageB, otherId, doc.pages])

  const diff = useMemo(() => (A && B ? compose(A, B, offset[0], offset[1]) : null), [A, B, offset])

  // Arrow keys nudge the other revision.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key.startsWith('Arrow') || (e.target as HTMLElement).closest('input, textarea')) return
      e.preventDefault()
      e.stopPropagation()
      const d = e.shiftKey ? 10 : 1
      setOffset(([x, y]) => (e.key === 'ArrowLeft' ? [x - d, y] : e.key === 'ArrowRight' ? [x + d, y] : e.key === 'ArrowUp' ? [x, y - d] : [x, y + d]))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const align = () => {
    if (!A || !B) return
    setBusy(true)
    setTimeout(() => {
      setOffset(autoAlign(A, B))
      setBusy(false)
    }, 20)
  }

  const cloudChanges = () => {
    if (!A || !diff?.boxes.length) return
    const who = useAuth.getState().account?.name
    const annots = diff.boxes.map((b) => {
      const p0 = A.toPdf(b.x0, b.y1)
      const p1 = A.toPdf(b.x1, b.y0)
      return {
        id: uid('m'),
        page: pageA,
        kind: 'cloud' as const,
        pts: flat([p0, p1]),
        color: '#e5484d',
        width: 1.6,
        opacity: 1,
        author: who,
        comment: `Changed vs ${otherName ?? 'other revision'}`,
        status: 'open' as const,
        createdAt: new Date().toISOString(),
      }
    })
    addAnnots(annots)
    toast.success(`Added ${annots.length} revision cloud${annots.length > 1 ? 's' : ''}`, { description: 'Switch to Markup to review them.' })
  }

  if (!otherId) {
    return (
      <div className="pdf-stage absolute inset-0 grid place-items-center p-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-2xl border border-border bg-bg-elev/90 p-6 shadow-float backdrop-blur-xl">
          <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
            <FileSearch className="size-4 text-accent-strong" /> Compare revisions
          </div>
          <p className="mb-4 text-[13px] text-muted">Overlay another revision of this set. Unchanged linework turns grey; what only exists here shows red, what only exists in the other revision shows blue. Changes can be clouded automatically.</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {pdfFiles.map((f) => (
              <button key={f.id} onClick={() => setOtherId(f.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
          <Button className="mt-3 w-full" icon={<Upload className="size-4" />} onClick={() => upload.current?.click()}>
            Upload another revision
          </Button>
          <UploadInput inputRef={upload} projectId={doc.projectId} onDone={setOtherId} />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elev/40 px-4 py-2.5 text-[12.5px]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff2d2d]" /> This PDF
        </span>
        <select value={pageA} onChange={(e) => setPageA(e.target.value)} className="h-7 rounded-md border border-border bg-surface px-1.5">
          {doc.pages.map((p, i) => (
            <option key={p.key} value={p.key}>
              p{i + 1}
            </option>
          ))}
        </select>
        <span className="text-subtle">vs</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#2d6bff]" />
          <Popover role="menu" trigger={<button className="max-w-[22ch] truncate underline decoration-dotted underline-offset-4">{otherName}</button>}>
            <MenuLabel>Compare against</MenuLabel>
            {pdfFiles.map((f) => (
              <MenuItem key={f.id} onSelect={() => setOtherId(f.id)} active={f.id === otherId}>
                <span className="truncate">{f.name}</span>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Upload className="size-4" />} onSelect={() => upload.current?.click()}>
              Upload…
            </MenuItem>
          </Popover>
        </span>
        <select value={pageB} onChange={(e) => setPageB(Number(e.target.value))} className="h-7 rounded-md border border-border bg-surface px-1.5">
          {Array.from({ length: otherPages }, (_, i) => (
            <option key={i} value={i}>
              p{i + 1}
            </option>
          ))}
        </select>
        <Segmented
          size="xs"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'overlay', label: 'Overlay' },
            { value: 'swipe', label: 'Swipe' },
            { value: 'side', label: 'Side by side' },
          ]}
        />
        <Button size="xs" variant="ghost" icon={<Crosshair className="size-3.5" />} onClick={align} disabled={busy}>
          Auto-align
        </Button>
        <span className="font-mono text-[11px] text-subtle" title="Arrow keys nudge · Shift for 10px">
          Δ {offset[0]}, {offset[1]}px
        </span>
        <span className="flex-1" />
        {diff && (
          <>
            <label className="flex items-center gap-1.5 text-subtle">
              <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} className="accent-[var(--accent)]" /> Change regions
            </label>
            <span className={cn('rounded-md px-2 py-0.5 font-mono text-[11px]', diff.changed < 0.01 ? 'bg-success/12 text-success' : 'bg-warning/12 text-warning')}>{(diff.changed * 100).toFixed(1)}% changed</span>
            <Button size="xs" variant="primary" icon={<Cloud className="size-3.5" />} disabled={!diff.boxes.length} onClick={cloudChanges}>
              Cloud {diff.boxes.length} change{diff.boxes.length === 1 ? '' : 's'}
            </Button>
          </>
        )}
        <UploadInput inputRef={upload} projectId={doc.projectId} onDone={setOtherId} />
      </div>
      <div className="pdf-stage relative min-h-0 flex-1 overflow-auto p-6">
        {busy && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-bg/40 backdrop-blur-[2px]">
            <Spinner className="size-5" />
          </div>
        )}
        {A && B && diff && (
          <div className={cn('mx-auto', mode === 'side' ? 'grid max-w-[1800px] grid-cols-2 gap-4' : 'max-w-[1400px]')}>
            {mode === 'overlay' && <CanvasView canvas={diff.overlay} boxes={showBoxes ? diff.boxes : []} w={A.w} h={A.h} />}
            {mode === 'swipe' && (
              <div className="relative select-none">
                <CanvasView canvas={A.canvas} w={A.w} h={A.h} />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${swipe * 100}%)` }}>
                  <div style={{ transform: `translate(${(offset[0] / A.w) * 100}%, ${(offset[1] / A.h) * 100}%)` }}>
                    <CanvasView canvas={B.canvas} w={A.w} h={B.h} />
                  </div>
                </div>
                <div className="absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_0_1px_white]" style={{ left: `${swipe * 100}%` }} />
                <input type="range" min={0} max={1} step={0.001} value={swipe} onChange={(e) => setSwipe(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" aria-label="Swipe position" />
              </div>
            )}
            {mode === 'side' && (
              <>
                <CanvasView canvas={A.canvas} w={A.w} h={A.h} label="This PDF" />
                <CanvasView canvas={B.canvas} w={B.w} h={B.h} label={otherName} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CanvasView({ canvas, w, h, boxes = [], label }: { canvas: HTMLCanvasElement; w: number; h: number; boxes?: Diff['boxes']; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    canvas.style.display = 'block'
    el.replaceChildren(canvas)
  }, [canvas])
  return (
    <div className="relative overflow-hidden rounded-md bg-white shadow-float">
      <div ref={ref} style={{ aspectRatio: `${w} / ${h}` }} />
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {boxes.map((b, i) => (
          <rect key={i} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="none" stroke="#e5484d" strokeWidth={Math.max(2, w / 700)} strokeDasharray={`${w / 200} ${w / 300}`} rx={w / 300} />
        ))}
      </svg>
      {label && <span className="absolute top-2 left-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] text-white">{label}</span>}
    </div>
  )
}

function UploadInput({ inputRef, projectId, onDone }: { inputRef: React.RefObject<HTMLInputElement | null>; projectId?: string; onDone: (id: string) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      className="hidden"
      onChange={async (e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        const meta = ws().create('files', { name: f.name, size: f.size, type: 'application/pdf', projectId, folder: 'PDF Studio', starred: false })
        await putBlob(meta.id, f)
        onDone(meta.id)
      }}
    />
  )
}
