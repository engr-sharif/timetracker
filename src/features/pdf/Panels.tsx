import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowUp, CircleCheck, CircleDot, CircleX, Download, ListChecks, Search, X } from 'lucide-react'
import { cn, download } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import type { PdfAnnot, PdfDoc } from '@/store/types'
import { Input } from '@/components/ui/field'
import { Segmented } from '@/components/ui/misc'
import { pageText, thumbnail } from './engine'
import { markupsCsv } from './report'
import { DEFAULT_CALIBRATION, annotBox, formatArea, formatLength, isMeasure, measure } from './geometry'
import { patchAnnots, useStudio } from './store'
import { TOOL_META } from './ToolPalette'
import type { SearchHit } from './Viewer'

/* ------------------------------------------------------------------ */
/*  Pages                                                              */
/* ------------------------------------------------------------------ */

export function PagesPanel({ doc, onJump }: { doc: PdfDoc; onJump: (key: string) => void }) {
  const active = useStudio((s) => s.activePage)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of doc.annots) m.set(a.page, (m.get(a.page) ?? 0) + 1)
    return m
  }, [doc.annots])
  const listRef = useRef<HTMLDivElement>(null)
  // Scroll only the panel (scrollIntoView would also nudge the app's outer containers).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-thumb="${CSS.escape(active ?? '')}"]`)
    const sc = listRef.current?.parentElement
    if (!el || !sc) return
    const top = el.offsetTop - sc.offsetTop
    if (top < sc.scrollTop || top + el.offsetHeight > sc.scrollTop + sc.clientHeight) sc.scrollTo({ top: top - 16, behavior: 'smooth' })
  }, [active])
  return (
    <div ref={listRef} className="grid grid-cols-1 gap-4 p-4">
      {doc.pages.map((p, i) => (
        <button key={p.key} data-thumb={p.key} onClick={() => onJump(p.key)} className="group flex flex-col items-center gap-1.5">
          <div className={cn('relative w-full overflow-hidden rounded-md bg-white shadow-soft ring-offset-2 ring-offset-bg-elev transition-all', active === p.key ? 'ring-2 ring-accent' : 'ring-1 ring-border group-hover:ring-border-strong')}>
            <Thumb src={p.src} index={p.index} rotate={p.rotate} />
            {!!counts.get(p.key) && <span className="absolute top-1.5 right-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-fg shadow">{counts.get(p.key)}</span>}
          </div>
          <span className={cn('font-mono text-[11px]', active === p.key ? 'text-fg' : 'text-subtle')}>{i + 1}</span>
        </button>
      ))}
    </div>
  )
}

export function Thumb({ src, index, rotate, className }: { src: string; index: number; rotate: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        void thumbnail(src, index, rotate).then((u) => alive && setUrl(u), () => {})
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [src, index, rotate])
  return (
    <div ref={ref} className={cn('grid min-h-24 place-items-center', className)}>
      {url ? <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={url} alt="" className="block w-full" draggable={false} /> : <div className="pdf-shimmer aspect-[8.5/11] w-full" />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Search                                                             */
/* ------------------------------------------------------------------ */

export interface SearchResult extends SearchHit {
  n: number
  snippet: [string, string, string]
}

export function useSearch(doc: PdfDoc | undefined, query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const ocrVersion = useStudio((s) => s.ocrVersion)
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!doc || q.length < 2) {
      setResults([])
      return
    }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const out: SearchResult[] = []
      for (let i = 0; i < doc.pages.length && alive; i++) {
        const p = doc.pages[i]
        const runs = await pageText(p.src, p.index).catch(() => [])
        for (const r of runs) {
          const s = r.str.toLowerCase()
          let at = s.indexOf(q)
          while (at >= 0) {
            const w = r.x1 - r.x0
            const len = Math.max(1, r.str.length)
            out.push({
              page: p.key,
              n: i + 1,
              box: [r.x0 + (w * at) / len, r.y0, r.x0 + (w * (at + q.length)) / len, r.y1],
              snippet: [r.str.slice(Math.max(0, at - 28), at), r.str.slice(at, at + q.length), r.str.slice(at + q.length, at + q.length + 40)],
            })
            at = s.indexOf(q, at + q.length)
          }
        }
        if (i % 4 === 3 && alive) setResults([...out])
      }
      if (alive) {
        setResults(out)
        setBusy(false)
      }
    }, 180)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [doc?.pages, query, ocrVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  return { results, busy }
}

export function SearchPanel({ query, setQuery, results, busy, active, setActive }: { query: string; setQuery: (q: string) => void; results: SearchResult[]; busy: boolean; active: number; setActive: (i: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const step = (d: number) => results.length && setActive((active + d + results.length) % results.length)
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Search text & OCR…"
          icon={<Search />}
          suffix={query ? <button onClick={() => setQuery('')} aria-label="Clear"><X className="size-3.5" /></button> : undefined}
        />
        <div className="flex items-center justify-between text-[11px] text-subtle">
          <span>{busy ? 'Searching…' : query.trim().length < 2 ? 'Type at least 2 characters' : `${results.length} match${results.length === 1 ? '' : 'es'}`}</span>
          <span className="flex gap-0.5">
            <button onClick={() => step(-1)} className="rounded p-1 hover:bg-surface-2" aria-label="Previous"><ArrowUp className="size-3.5" /></button>
            <button onClick={() => step(1)} className="rounded p-1 hover:bg-surface-2" aria-label="Next"><ArrowDown className="size-3.5" /></button>
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.map((r, i) => (
          <button key={i} onClick={() => setActive(i)} className={cn('mb-0.5 block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] leading-snug', i === active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
            <span className="mr-1.5 font-mono text-[10.5px] text-subtle">p{r.n}</span>
            <span className="text-muted">{r.snippet[0]}</span>
            <mark className="rounded bg-[oklch(0.86_0.16_90/0.5)] px-0.5 text-fg">{r.snippet[1]}</mark>
            <span className="text-muted">{r.snippet[2]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Markups                                                            */
/* ------------------------------------------------------------------ */

const STATUS = {
  open: { icon: CircleDot, tone: 'text-subtle', label: 'Open' },
  accepted: { icon: CircleCheck, tone: 'text-success', label: 'Accepted' },
  rejected: { icon: CircleX, tone: 'text-danger', label: 'Rejected' },
  done: { icon: ListChecks, tone: 'text-accent-strong', label: 'Done' },
} as const

export function kindLabel(a: PdfAnnot) {
  if (a.kind === 'texthl') return a.sub === 'underline' ? 'Underline' : a.sub === 'strike' ? 'Strikethrough' : 'Text highlight'
  if (a.kind === 'ink') return 'Pen'
  if (a.kind === 'image') return 'Signature'
  return TOOL_META[a.kind as keyof typeof TOOL_META]?.label ?? a.kind
}

export function MarkupsPanel({ doc, onJump }: { doc: PdfDoc; onJump: (a: PdfAnnot) => void }) {
  const selection = useStudio((s) => s.selection)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')
  const order = useMemo(() => new Map(doc.pages.map((p, i) => [p.key, i + 1])), [doc.pages])
  const list = useMemo(
    () =>
      doc.annots
        .filter((a) => filter === 'all' || (filter === 'open' ? (a.status ?? 'open') === 'open' : (a.status ?? 'open') !== 'open'))
        .sort((a, b) => (order.get(a.page) ?? 0) - (order.get(b.page) ?? 0) || a.createdAt.localeCompare(b.createdAt)),
    [doc.annots, filter, order],
  )
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <Segmented
          size="xs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${doc.annots.length}` },
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
        <button onClick={() => download(`${doc.name} markups.csv`, markupsCsv(doc), 'text/csv')} className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg" title="Export markups (CSV)">
          <Download className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!list.length && <p className="p-6 text-center text-xs text-subtle">No markups yet. Pick a tool below and draw on the sheet.</p>}
        {list.map((a) => {
          const Icon = (TOOL_META[a.kind as keyof typeof TOOL_META] ?? TOOL_META.pen).icon
          const st = STATUS[a.status ?? 'open']
          const cal = doc.pageScales?.[a.page] ?? doc.scale ?? DEFAULT_CALIBRATION
          const m = measure(a, cal)
          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => onJump(a)}
              className={cn('group mb-0.5 flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2', selection.includes(a.id) ? 'bg-accent-soft' : 'hover:bg-surface-2')}
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklab, ${a.color} 18%, transparent)`, color: a.color }}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12.5px]">
                  <span className="font-medium">{kindLabel(a)}</span>
                  <span className="font-mono text-[10.5px] text-subtle">p{order.get(a.page)}</span>
                </div>
                {(a.text || m || a.comment) && <div className="line-clamp-2 text-[12px] text-muted">{m ? m.label : a.text}{a.comment ? ` — ${a.comment}` : ''}</div>}
                <div className="text-[10.5px] text-subtle">
                  {a.author ?? 'You'} · {timeAgo(a.createdAt)}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const next = { open: 'accepted', accepted: 'rejected', rejected: 'done', done: 'open' } as const
                  patchAnnots({ [a.id]: { status: next[a.status ?? 'open'] } })
                }}
                className={cn('self-start rounded p-0.5', st.tone)}
                title={`${st.label} — click to change`}
              >
                <st.icon className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Measurements (takeoff)                                             */
/* ------------------------------------------------------------------ */

export function MeasurePanel({ doc, onJump, onCalibrate }: { doc: PdfDoc; onJump: (a: PdfAnnot) => void; onCalibrate: () => void }) {
  const order = useMemo(() => new Map(doc.pages.map((p, i) => [p.key, i + 1])), [doc.pages])
  const items = doc.annots.filter((a) => isMeasure(a.kind))
  const calFor = (a: PdfAnnot) => doc.pageScales?.[a.page] ?? doc.scale ?? DEFAULT_CALIBRATION
  // Totals by unit so mixed scales don't get summed together.
  const totals = new Map<string, { length: number; area: number; count: number; unit: string }>()
  for (const a of items) {
    const cal = calFor(a)
    const m = measure(a, cal)
    if (!m) continue
    const t = totals.get(cal.unit) ?? { length: 0, area: 0, count: 0, unit: cal.unit }
    if (a.kind === 'area') t.area += m.value
    else if (a.kind === 'count') t.count += m.value
    else t.length += m.value
    totals.set(cal.unit, t)
  }
  const exportCsv = () => {
    const rows = [['Page', 'Type', 'Label', 'Value', 'Unit', 'Scale']]
    for (const a of items) {
      const cal = calFor(a)
      const m = measure(a, cal)
      rows.push([String(order.get(a.page)), a.kind, a.text ?? '', m ? String(Math.round(m.value * 1000) / 1000) : '', a.kind === 'count' ? 'ea' : a.kind === 'area' ? `${cal.unit}²` : cal.unit, cal.label])
    }
    download(`${doc.name} takeoff.csv`, rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n'), 'text/csv')
  }
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <button onClick={onCalibrate} className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-left text-[12.5px] hover:border-border-strong">
          <span className="text-muted">Scale</span>
          <span className={cn('font-medium', !doc.scale && 'text-warning')}>{doc.scale?.label ?? 'Not set — paper units'}</span>
        </button>
        {[...totals.values()].map((t) => (
          <div key={t.unit} className="grid grid-cols-3 gap-2">
            <Stat label="Length" value={t.length ? formatLength(t.length, t.unit) : '—'} />
            <Stat label="Area" value={t.area ? formatArea(t.area, t.unit) : '—'} />
            <Stat label="Count" value={t.count ? String(t.count) : '—'} />
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!items.length && <p className="p-6 text-center text-xs text-subtle">Set the scale, then use Length, Area or Count to build a takeoff.</p>}
        {items.map((a) => {
          const m = measure(a, calFor(a))
          const Icon = TOOL_META[a.kind as keyof typeof TOOL_META].icon
          return (
            <button key={a.id} onClick={() => onJump(a)} className="mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2">
              <Icon className="size-3.5 shrink-0" style={{ color: a.color }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{a.text || TOOL_META[a.kind as keyof typeof TOOL_META].label}</span>
              <span className="font-mono text-[11.5px] tabular-nums">{m?.label}</span>
              <span className="font-mono text-[10px] text-subtle">p{order.get(a.page)}</span>
            </button>
          )
        })}
      </div>
      {!!items.length && (
        <div className="border-t border-border p-2">
          <button onClick={exportCsv} className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted hover:bg-surface-2 hover:text-fg">
            <Download className="size-3.5" /> Export takeoff (CSV)
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-2 py-1.5">
      <div className="text-[10px] tracking-wide text-subtle uppercase">{label}</div>
      <div className="truncate font-mono text-[12px] tabular-nums">{value}</div>
    </div>
  )
}

export const boxTuple = (a: PdfAnnot): [number, number, number, number] => {
  const b = annotBox(a)
  return [b.x0, b.y0, b.x1, b.y1]
}
