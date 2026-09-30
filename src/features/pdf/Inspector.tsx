import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpToLine, Copy, CopyPlus, Highlighter, ListPlus, Strikethrough, Trash2, Underline, X } from 'lucide-react'
import { cn, copyText, uid } from '@/lib/utils'
import { ws } from '@/store/workspace'
import type { PdfAnnot, PdfDoc } from '@/store/types'
import { Textarea } from '@/components/ui/field'
import { DEFAULT_CALIBRATION, measure, translate } from './geometry'
import { kindLabel } from './Panels'
import { HIGHLIGHTS, PALETTE, addAnnots, patchAnnots, removeAnnots, useStudio } from './store'

const STATUSES = ['open', 'accepted', 'rejected', 'done'] as const

export function Inspector({ doc }: { doc: PdfDoc }) {
  const selection = useStudio((s) => s.selection)
  const tool = useStudio((s) => s.tool)
  const sel = doc.annots.filter((a) => selection.includes(a.id))
  const a = sel[0]
  const [comment, setComment] = useState('')
  useEffect(() => setComment(a?.comment ?? ''), [a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchAll = (patch: Partial<PdfAnnot>) => patchAnnots(Object.fromEntries(sel.map((x) => [x.id, patch])))
  const pageNo = a ? doc.pages.findIndex((p) => p.key === a.page) + 1 : 0
  const cal = a ? doc.pageScales?.[a.page] ?? doc.scale ?? DEFAULT_CALIBRATION : DEFAULT_CALIBRATION
  const m = a ? measure(a, cal) : null
  const colors = a?.kind === 'highlight' || (a?.kind === 'texthl' && !a.sub) ? HIGHLIGHTS : PALETTE

  const makeTask = () => {
    if (!a) return
    const title = (a.comment || a.text || `${kindLabel(a)} on ${doc.name} p${pageNo}`).split('\n')[0].slice(0, 120)
    ws().create('tasks', {
      title,
      notes: `From PDF Studio markup on “${doc.name}”, page ${pageNo}.${m ? `\nMeasurement: ${m.label}` : ''}${a.text && a.text !== title ? `\n\n${a.text}` : ''}\n\n[Open markup](#/pdf/${doc.fileId}?page=${pageNo}&markup=${a.id})`,
      projectId: doc.projectId,
      assigneeId: 'me',
      assignedById: 'me',
      status: 'todo',
      priority: 'medium',
      labels: ['markup'],
      subtasks: [],
      order: Date.now(),
    })
    toast.success('Task created from markup', { description: title })
  }

  return (
    <AnimatePresence>
      {a && tool === 'select' && (
        <motion.aside
          key="inspector"
          initial={{ opacity: 0, x: 16, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute top-3 right-3 z-20 w-64 overflow-hidden rounded-2xl border border-border-strong bg-bg-elev/90 shadow-float backdrop-blur-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <div>
              <div className="text-[13px] font-semibold">{sel.length > 1 ? `${sel.length} markups` : kindLabel(a)}</div>
              <div className="text-[11px] text-subtle">
                Page {pageNo}
                {a.author && ` · ${a.author}`}
              </div>
            </div>
            <button onClick={() => useStudio.getState().select([])} className="rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Deselect">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="space-y-3 p-3.5">
            {m && sel.length === 1 && (
              <div className="rounded-xl bg-surface-2/60 px-3 py-2">
                <div className="font-mono text-[15px] font-semibold tabular-nums">{m.label}</div>
                {m.secondary && <div className="font-mono text-[11px] text-muted">{m.secondary}</div>}
                <div className="text-[10.5px] text-subtle">{cal.label}</div>
              </div>
            )}
            {a.kind !== 'image' && a.kind !== 'redact' && (
              <div className="flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <button key={c} onClick={() => patchAll({ color: c, ...(a.kind === 'area' ? { fill: c } : {}) })} className={cn('size-5 rounded-full border border-black/10', a.color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-bg-elev')} style={{ background: c }} aria-label={c} />
                ))}
              </div>
            )}
            {!['text', 'image', 'redact', 'count', 'stamp', 'texthl'].includes(a.kind) && (
              <Range label="Weight" value={a.width} min={0.5} max={a.kind === 'highlight' ? 40 : 12} step={0.5} onChange={(width) => patchAll({ width })} />
            )}
            {['text', 'callout', 'length', 'polylength', 'area', 'stamp', 'count'].includes(a.kind) && (
              <Range label={a.kind === 'count' ? 'Marker' : 'Size'} value={a.size ?? 12} min={3} max={64} step={1} onChange={(size) => patchAll({ size })} />
            )}
            {a.kind !== 'redact' && <Range label="Opacity" value={Math.round(a.opacity * 100)} min={10} max={100} step={5} onChange={(v) => patchAll({ opacity: v / 100 })} />}
            {a.kind === 'count' && (
              <input
                value={a.text ?? ''}
                onChange={(e) => patchAnnots({ [a.id]: { text: e.target.value } }, { record: false })}
                placeholder="What are you counting? (e.g. Doors)"
                className="h-8 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px] outline-none focus:border-accent"
              />
            )}
            {sel.length === 1 && (
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onBlur={() => comment !== (a.comment ?? '') && patchAnnots({ [a.id]: { comment } })}
                placeholder="Add a comment…"
                rows={2}
                autoGrow
                className="text-[12.5px]"
              />
            )}
            <div className="flex rounded-lg border border-border p-0.5">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => patchAll({ status: s })} className={cn('flex-1 rounded-md py-1 text-[11px] font-medium capitalize', (a.status ?? 'open') === s ? 'bg-surface-3 text-fg' : 'text-subtle hover:text-muted')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-0.5 border-t border-border px-2 py-1.5">
            <Act label="Create task" onClick={makeTask} icon={ListPlus} />
            <Act
              label="Duplicate"
              icon={CopyPlus}
              onClick={() => {
                const copies = sel.map((x) => ({ ...translate(x, 10, -10), id: uid('m'), createdAt: new Date().toISOString() }))
                addAnnots(copies, { select: true })
              }}
            />
            <Act label="Bring to front" icon={ArrowUpToLine} onClick={() => useStudio.getState().commit((d) => ({ annots: [...d.annots.filter((x) => !selection.includes(x.id)), ...d.annots.filter((x) => selection.includes(x.id))] }))} />
            <Act label="Send to back" icon={ArrowDownToLine} onClick={() => useStudio.getState().commit((d) => ({ annots: [...d.annots.filter((x) => selection.includes(x.id)), ...d.annots.filter((x) => !selection.includes(x.id))] }))} />
            <span className="flex-1" />
            <Act label="Delete" icon={Trash2} danger onClick={() => removeAnnots(selection)} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function Act({ label, icon: Icon, onClick, danger }: { label: string; icon: typeof Copy; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={cn('grid size-8 place-items-center rounded-lg', danger ? 'text-subtle hover:bg-danger/10 hover:text-danger' : 'text-subtle hover:bg-surface-2 hover:text-fg')}>
      <Icon className="size-4" />
    </button>
  )
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="flex items-center gap-2 text-[11px] text-subtle">
      <span className="w-12">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== value && onChange(v)}
        onKeyUp={() => v !== value && onChange(v)}
        className="h-1 flex-1 cursor-pointer accent-[var(--accent)]"
      />
      <span className="w-8 text-right font-mono text-[10.5px] text-muted tabular-nums">{v}</span>
    </label>
  )
}

/** Floating actions for selected PDF text: highlight, underline, strike, copy, ask. */
export function TextSelectionBar({ onAsk }: { onAsk?: (text: string) => void }) {
  const [state, setState] = useState<{ x: number; y: number; page: HTMLElement; text: string } | null>(null)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.rangeCount) return setState(null)
        const node = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode?.parentElement
        const page = node?.closest<HTMLElement>('.pdf-page')
        if (!page || !node?.closest('.textLayer, .ocrLayer')) return setState(null)
        const r = sel.getRangeAt(0).getBoundingClientRect()
        const host = page.closest('[data-studio-main]')?.getBoundingClientRect()
        if (!host || !r.width) return setState(null)
        setState({ x: r.left + r.width / 2 - host.left, y: r.top - host.top, page, text: sel.toString() })
      }, 120)
    }
    document.addEventListener('selectionchange', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      clearTimeout(t)
    }
  }, [])
  const tool = useStudio((s) => s.tool)
  if (!state || tool !== 'select') return null
  const apply = (variant?: 'underline' | 'strike') => {
    const el = state.page as HTMLElement & { highlightSelection?: (v?: 'underline' | 'strike') => void }
    el.highlightSelection?.(variant)
    setState(null)
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute z-30 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-0.5 rounded-xl border border-border-strong bg-bg-elev/95 p-1 shadow-float backdrop-blur-xl"
      style={{ left: state.x, top: state.y }}
      onPointerDown={(e) => e.preventDefault()}
    >
      <BarBtn label="Highlight" onClick={() => apply()} icon={Highlighter} />
      <BarBtn label="Underline" onClick={() => apply('underline')} icon={Underline} />
      <BarBtn label="Strikethrough" onClick={() => apply('strike')} icon={Strikethrough} />
      <span className="mx-0.5 h-5 w-px bg-border" />
      <BarBtn
        label="Copy"
        onClick={() => {
          void copyText(state.text)
          toast.success('Copied')
        }}
        icon={Copy}
      />
      {onAsk && (
        <button onClick={() => onAsk(state.text)} className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-accent-strong hover:bg-accent-soft">
          Ask AI
        </button>
      )}
    </motion.div>
  )
}

function BarBtn({ label, icon: Icon, onClick }: { label: string; icon: typeof Copy; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
      <Icon className="size-4" />
    </button>
  )
}
