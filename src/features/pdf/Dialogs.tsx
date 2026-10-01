import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { getStroke } from 'perfect-freehand'
import { Download, Eraser, FileDown, FolderInput, ImageUp, PenLine, Ruler, ScanText, Type } from 'lucide-react'
import { cn, download } from '@/lib/utils'
import { putBlob } from '@/lib/files'
import { ws } from '@/store/workspace'
import type { PdfDoc } from '@/store/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Segmented, Switch } from '@/components/ui/misc'
import { getOcr, hasNativeText, ocrPage, stopOcr } from './engine'
import { SCALE_PRESETS, UNITS, formatLength, knownCalibration, presetCalibration, type UnitId } from './geometry'
import { loadSignatures, saveSignatures, useStudio } from './store'

/** Stores a generated blob as a new file in Files (and syncs it like any upload). */
export async function saveToFiles(blob: Blob, name: string, opts: { projectId?: string; folder?: string } = {}) {
  const meta = ws().create('files', { name, size: blob.size, type: blob.type || 'application/pdf', projectId: opts.projectId, folder: opts.folder ?? 'PDF Studio', starred: false })
  await putBlob(meta.id, blob)
  return meta
}

/* ------------------------------------------------------------------ */
/*  Scale                                                              */
/* ------------------------------------------------------------------ */

/** Parses "12'-6 1/2"", "12' 6"", "12.5" (feet) etc. for ft-in; plain numbers otherwise. */
export function parseLength(s: string, unit: UnitId): number | null {
  const t = s.trim()
  if (!t) return null
  if (unit === 'ft-in') {
    const m = t.match(/^(?:(\d+(?:\.\d+)?)\s*(?:'|ft|’)\s*-?\s*)?(?:(\d+(?:\.\d+)?)?(?:\s+|-)?(?:(\d+)\s*\/\s*(\d+))?\s*(?:"|in|”)?)?$/i)
    if (m && (m[1] || m[2] || m[3])) {
      const ft = Number(m[1] ?? 0)
      const inch = Number(m[2] ?? 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0)
      if (!m[1] && !/["”]|in/i.test(t)) return ft + Number(m[2] ?? 0) // bare number = feet
      return ft + inch / 12
    }
    return null
  }
  const n = Number(t.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function CalibrateDialog({ doc, open, onClose }: { doc: PdfDoc; open: boolean; onClose: () => void }) {
  const calibrating = useStudio((s) => s.calibrating)
  const activePage = useStudio((s) => s.activePage)
  const [tab, setTab] = useState<'preset' | 'known'>(calibrating ? 'known' : 'preset')
  const [preset, setPreset] = useState(SCALE_PRESETS[2].label)
  const [unit, setUnit] = useState<UnitId>('ft-in')
  const [value, setValue] = useState('')
  const [scope, setScope] = useState<'all' | 'page'>('all')
  useEffect(() => {
    if (open && calibrating) setTab('known')
  }, [open, calibrating])

  const apply = (cal: ReturnType<typeof presetCalibration>) => {
    const page = calibrating?.page ?? activePage
    useStudio.getState().commit((d) =>
      scope === 'page' && page ? { pageScales: { ...(d.pageScales ?? {}), [page]: cal } } : { scale: cal, pageScales: {} },
    )
    useStudio.getState().set({ calibrating: null })
    toast.success(`Scale set · ${cal.label}`)
    onClose()
  }

  const parsed = parseLength(value, unit)
  const groups = [...new Set(SCALE_PRESETS.map((p) => p.group))]

  return (
    <Dialog
      open={open}
      onClose={() => {
        useStudio.getState().set({ calibrating: null })
        onClose()
      }}
      title="Set drawing scale"
      description={`Measurements use this scale — set it for the whole set, or per sheet for details at other scales. Current: ${(activePage && doc.pageScales?.[activePage]?.label) || doc.scale?.label || 'not set'}.`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Segmented
            size="xs"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All pages' },
              { value: 'page', label: 'This page' },
            ]}
          />
          {tab === 'preset' ? (
            <Button variant="primary" onClick={() => apply(presetCalibration(SCALE_PRESETS.find((p) => p.label === preset)!))}>
              Apply scale
            </Button>
          ) : calibrating ? (
            <Button variant="primary" disabled={!parsed} onClick={() => parsed && apply(knownCalibration(calibrating.points, parsed, unit))}>
              Calibrate
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Ruler className="size-4" />}
              onClick={() => {
                useStudio.getState().setTool('calibrate')
                onClose()
                toast('Draw a line over a known dimension', { description: 'Then enter its real length.' })
              }}
            >
              Draw on sheet
            </Button>
          )}
        </div>
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'preset', label: 'Standard scale' },
          { value: 'known', label: 'Known distance' },
        ]}
      />
      {tab === 'preset' ? (
        <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">{g}</div>
              <div className="flex flex-wrap gap-1.5">
                {SCALE_PRESETS.filter((p) => p.group === g).map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPreset(p.label)}
                    className={cn('rounded-lg border px-2.5 py-1.5 font-mono text-[12px] transition-colors', preset === p.label ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border text-muted hover:border-border-strong hover:text-fg')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11.5px] text-subtle">Standard scales assume the PDF is at full sheet size. Use “Known distance” for reduced prints or scans.</p>
        </div>
      ) : calibrating ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Real length of the line you drew" hint={unit === 'ft-in' ? `e.g. 12'-6", 20', 8 1/2"` : undefined}>
            <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={unit === 'ft-in' ? `24'-0"` : '10'} className="font-mono" onKeyDown={(e) => e.key === 'Enter' && parsed && apply(knownCalibration(calibrating.points, parsed, unit))} />
          </Field>
          <Field label="Units">
            <select value={unit} onChange={(e) => setUnit(e.target.value as UnitId)} className="h-9 w-full rounded-[10px] border border-border bg-surface px-2.5 text-[13px]">
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
          {parsed && <p className="text-xs text-muted sm:col-span-2">= {formatLength(parsed, unit)} over {calibrating.points.toFixed(1)} pt on the sheet</p>}
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-4 text-[13px] text-muted">
          <Ruler className="mt-0.5 size-4 shrink-0 text-accent-strong" />
          Draw a line along a dimension you know — a gridline spacing, a dimensioned wall, a graphic scale bar — then type its real length. Works on scans and reduced prints.
        </div>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Signature                                                          */
/* ------------------------------------------------------------------ */

export function SignatureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [strokes, setStrokes] = useState<number[][][]>([])
  const [typed, setTyped] = useState('')
  const [uploaded, setUploaded] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = useRef<number[][] | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    if (!open) {
      setStrokes([])
      setTyped('')
      setUploaded(null)
    }
  }, [open])

  // Redraw the pad.
  useEffect(() => {
    const c = canvasRef.current
    if (!c || mode !== 'draw') return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = r.width * dpr
    c.height = r.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#10131a'
    for (const s of [...strokes, ...(current.current ? [current.current] : [])]) {
      const outline = getStroke(s, { size: 3.4, thinning: 0.62, smoothing: 0.6, streamline: 0.5, simulatePressure: !s.some((p) => p[2] !== 0.5) })
      if (!outline.length) continue
      ctx.beginPath()
      ctx.moveTo(outline[0][0], outline[0][1])
      for (const [x, y] of outline.slice(1)) ctx.lineTo(x, y)
      ctx.closePath()
      ctx.fill()
    }
  })

  const toPng = async (): Promise<string | null> => {
    const out = document.createElement('canvas')
    const ctx = out.getContext('2d')!
    if (mode === 'draw') {
      if (!strokes.length) return null
      const all = strokes.flat()
      const pad = 8
      const x0 = Math.min(...all.map((p) => p[0])) - pad
      const y0 = Math.min(...all.map((p) => p[1])) - pad
      const x1 = Math.max(...all.map((p) => p[0])) + pad
      const y1 = Math.max(...all.map((p) => p[1])) + pad
      const k = 3
      out.width = (x1 - x0) * k
      out.height = (y1 - y0) * k
      ctx.scale(k, k)
      ctx.translate(-x0, -y0)
      ctx.fillStyle = '#10131a'
      for (const s of strokes) {
        const o = getStroke(s, { size: 3.4, thinning: 0.62, smoothing: 0.6, streamline: 0.5, simulatePressure: !s.some((p) => p[2] !== 0.5) })
        if (!o.length) continue
        ctx.beginPath()
        ctx.moveTo(o[0][0], o[0][1])
        for (const [x, y] of o.slice(1)) ctx.lineTo(x, y)
        ctx.fill()
      }
      return out.toDataURL('image/png')
    }
    if (mode === 'type') {
      if (!typed.trim()) return null
      const font = `italic 600 96px "Snell Roundhand", "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`
      ctx.font = font
      const w = ctx.measureText(typed).width
      out.width = w + 60
      out.height = 150
      ctx.font = font
      ctx.fillStyle = '#10131a'
      ctx.fillText(typed, 30, 110)
      return out.toDataURL('image/png')
    }
    return uploaded
  }

  const save = async () => {
    const png = await toPng()
    if (!png) return
    const list = [png, ...loadSignatures().filter((s) => s !== png)]
    saveSignatures(list)
    useStudio.getState().set({ signature: png })
    useStudio.getState().setTool('image')
    onClose()
    toast('Click the page to place your signature')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your signature"
      description="Saved on this device only — never synced."
      footer={
        <div className="flex w-full justify-between">
          <Button variant="ghost" icon={<Eraser className="size-4" />} onClick={() => (mode === 'draw' ? setStrokes([]) : mode === 'type' ? setTyped('') : setUploaded(null))}>
            Clear
          </Button>
          <Button variant="primary" onClick={save}>
            Use signature
          </Button>
        </div>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        className="mb-3"
        options={[
          { value: 'draw', label: 'Draw', icon: <PenLine /> },
          { value: 'type', label: 'Type', icon: <Type /> },
          { value: 'upload', label: 'Image', icon: <ImageUp /> },
        ]}
      />
      {mode === 'draw' && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-white">
          <canvas
            ref={canvasRef}
            className="block h-44 w-full touch-none"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              e.currentTarget.setPointerCapture(e.pointerId)
              current.current = [[e.clientX - r.left, e.clientY - r.top, e.pointerType === 'pen' ? e.pressure : 0.5]]
              force((n) => n + 1)
            }}
            onPointerMove={(e) => {
              if (!current.current) return
              const r = e.currentTarget.getBoundingClientRect()
              for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) current.current.push([ev.clientX - r.left, ev.clientY - r.top, ev.pointerType === 'pen' ? ev.pressure : 0.5])
              force((n) => n + 1)
            }}
            onPointerUp={() => {
              if (current.current && current.current.length > 1) setStrokes((s) => [...s, current.current!])
              current.current = null
            }}
          />
          <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dashed border-neutral-300" />
          {!strokes.length && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-neutral-400">Sign here</span>}
        </div>
      )}
      {mode === 'type' && (
        <div className="space-y-3">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Your full name" autoFocus />
          <div className="grid h-28 place-items-center overflow-hidden rounded-xl border border-border bg-white text-4xl text-neutral-900 italic" style={{ fontFamily: '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive' }}>
            {typed || <span className="text-base text-neutral-400 not-italic">Preview</span>}
          </div>
        </div>
      )}
      {mode === 'upload' && (
        <label className="grid h-44 cursor-pointer place-items-center rounded-xl border border-dashed border-border-strong bg-surface-2/40 text-sm text-muted hover:text-fg">
          {uploaded ? <img src={uploaded} alt="" className="max-h-36 max-w-[90%] object-contain" /> : 'Choose a PNG of your signature (transparent background works best)'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const r = new FileReader()
              r.onload = () => setUploaded(String(r.result))
              r.readAsDataURL(f)
            }}
          />
        </label>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  OCR                                                                */
/* ------------------------------------------------------------------ */

const LANGS = [
  { id: 'eng', label: 'English' },
  { id: 'fra', label: 'French' },
  { id: 'spa', label: 'Spanish' },
  { id: 'deu', label: 'German' },
  { id: 'ita', label: 'Italian' },
  { id: 'por', label: 'Portuguese' },
  { id: 'nld', label: 'Dutch' },
  { id: 'ara', label: 'Arabic' },
  { id: 'chi_sim', label: 'Chinese (Simplified)' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'hin', label: 'Hindi' },
  { id: 'urd', label: 'Urdu' },
]

export function OcrDialog({ doc, open, onClose }: { doc: PdfDoc; open: boolean; onClose: () => void }) {
  const activePage = useStudio((s) => s.activePage)
  const [scope, setScope] = useState<'auto' | 'all' | 'page'>('auto')
  const [lang, setLang] = useState('eng')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ page: 0, total: 0, sub: 0, status: '' })
  const [done, setDone] = useState<{ words: number; pages: number; conf: number } | null>(null)
  const cancel = useRef(false)

  useEffect(() => {
    if (open) setDone(null)
  }, [open])

  const run = async () => {
    cancel.current = false
    setRunning(true)
    setDone(null)
    let targets = scope === 'page' ? doc.pages.filter((p) => p.key === activePage) : doc.pages
    if (scope === 'auto') {
      const flags = await Promise.all(targets.map(async (p) => !(await hasNativeText(p.src, p.index).catch(() => false)) && !(await getOcr(p.src, p.index))))
      targets = targets.filter((_, i) => flags[i])
      if (!targets.length) {
        toast.success('Every page already has text', { description: 'Choose “All pages” to OCR anyway.' })
        setRunning(false)
        return
      }
    }
    let words = 0
    let confSum = 0
    let n = 0
    try {
      for (const p of targets) {
        if (cancel.current) break
        setProgress({ page: n + 1, total: targets.length, sub: 0, status: 'Starting' })
        const r = await ocrPage(p.src, p.index, { lang, onProgress: (sub, status) => setProgress((s) => ({ ...s, sub, status })) })
        words += r.words.length
        confSum += r.confidence
        n++
        useStudio.setState((s) => ({ ocrVersion: s.ocrVersion + 1 }))
      }
      setDone({ words, pages: n, conf: n ? confSum / n : 0 })
    } catch (e) {
      toast.error('OCR failed', { description: e instanceof Error ? e.message : String(e) })
    }
    setRunning(false)
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (running) {
          cancel.current = true
          void stopOcr()
        }
        onClose()
      }}
      title="Recognize text (OCR)"
      description="Turns scanned sheets into searchable, selectable text. Runs entirely in your browser — nothing is uploaded."
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[11.5px] text-subtle">First run downloads the language model (~4–10 MB).</span>
          {running ? (
            <Button
              onClick={() => {
                cancel.current = true
              }}
            >
              Stop after this page
            </Button>
          ) : done ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <Button variant="primary" icon={<ScanText className="size-4" />} onClick={run}>
              Start OCR
            </Button>
          )}
        </div>
      }
    >
      {!running && !done && (
        <div className="space-y-4">
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'auto', label: 'Pages without text' },
              { value: 'all', label: `All ${doc.pages.length} pages` },
              { value: 'page', label: 'Current page' },
            ]}
          />
          <Field label="Document language">
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-9 w-full rounded-[10px] border border-border bg-surface px-2.5 text-[13px]">
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {running && (
        <div className="space-y-3 py-2">
          <div className="flex justify-between text-[13px]">
            <span>
              Page {progress.page} of {progress.total}
            </span>
            <span className="text-subtle capitalize">{progress.status}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${((progress.page - 1 + progress.sub) / Math.max(1, progress.total)) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
          </div>
        </div>
      )}
      {done && (
        <div className="grid grid-cols-3 gap-3 py-2 text-center">
          {[
            ['Pages', done.pages],
            ['Words', done.words.toLocaleString()],
            ['Confidence', `${Math.round(done.conf)}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-surface-2/40 py-3">
              <div className="text-xl font-semibold tabular-nums">{v}</div>
              <div className="text-[11px] text-subtle">{k}</div>
            </div>
          ))}
          <p className="col-span-3 text-left text-[12px] text-muted">Search now finds recognized words, you can select and copy them, and exported PDFs carry an invisible text layer.</p>
        </div>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

export function ExportDialog({ doc, open, onClose, pages: preset }: { doc: PdfDoc; open: boolean; onClose: () => void; pages?: string[] }) {
  const [markups, setMarkups] = useState(true)
  const [ocrText, setOcrText] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const redactions = doc.annots.filter((a) => a.kind === 'redact').length
  const keys = preset ?? doc.pages.map((p) => p.key)
  useEffect(() => {
    if (open) setName(`${doc.name}${preset ? ` (pages)` : doc.annots.length ? ' (marked up)' : ''}.pdf`)
  }, [open, doc.name, doc.annots.length, preset])

  const build = async () => {
    const { exportPdf } = await import('./export')
    const bytes = await exportPdf(doc, { pages: keys, markups, ocrText, onProgress: (d, t) => setProgress(d / t) })
    return new Blob([bytes as BlobPart], { type: 'application/pdf' })
  }
  const run = async (target: 'files' | 'download') => {
    setBusy(target)
    setProgress(0)
    try {
      const blob = await build()
      const fname = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
      if (target === 'download') download(fname, blob, 'application/pdf')
      else {
        await saveToFiles(blob, fname, { projectId: doc.projectId })
        toast.success('Saved to Files', { description: fname })
      }
      onClose()
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : String(e) })
    }
    setBusy(null)
  }

  const summary = useMemo(() => `${keys.length} page${keys.length === 1 ? '' : 's'}`, [keys.length])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export PDF"
      description={summary}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button icon={<FolderInput className="size-4" />} loading={busy === 'files'} disabled={!!busy} onClick={() => run('files')}>
            Save to Files
          </Button>
          <Button variant="primary" icon={<Download className="size-4" />} loading={busy === 'download'} disabled={!!busy} onClick={() => run('download')}>
            Download
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="File name">
          <Input value={name} onChange={(e) => setName(e.target.value)} icon={<FileDown />} />
        </Field>
        <label className="flex items-center justify-between gap-4 text-[13px]">
          <span>
            Flatten markups into the pages
            <span className="block text-xs text-subtle">Everyone sees them in any PDF viewer.</span>
          </span>
          <Switch checked={markups} onChange={setMarkups} label="Flatten markups" />
        </label>
        <label className="flex items-center justify-between gap-4 text-[13px]">
          <span>
            Include OCR text layer
            <span className="block text-xs text-subtle">Makes scanned pages searchable everywhere.</span>
          </span>
          <Switch checked={ocrText} onChange={setOcrText} label="OCR text" />
        </label>
        {markups && redactions > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger/8 p-3 text-[12.5px]">
            <b className="text-danger">{redactions} redaction{redactions > 1 ? 's' : ''} will be applied permanently.</b> Pages with redactions are re-rendered as images so the hidden content is removed from the file, not just covered.
          </div>
        )}
        {busy && (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full bg-accent" animate={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
    </Dialog>
  )
}
