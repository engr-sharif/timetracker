import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowLeftRight, Calculator, Clipboard, Copy, Hourglass, Pause, Play, Plus, RotateCcw, Ruler, Search, Shapes, Trash, type LucideIcon } from 'lucide-react'
import { cn, copyText } from '@/lib/utils'
import { formatClock } from '@/lib/dates'
import { useList, ws } from '@/store/workspace'
import { useUI } from '@/store/ui'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, IconButton } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { EmptyState, ProgressRing, Segmented } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/dialog'
import { ProjectPicker } from '@/components/ui/pickers'
import { evaluateSheet, formatNumber } from './calc'
import { UNIT_CATEGORIES, convert } from './units'

const TOOLS: { id: string; title: string; body: string; icon: LucideIcon; hue: number; href?: string }[] = [
  { id: 'snippets', title: 'Snippets', body: 'Your clipboard library — boilerplate, emails, project details. One click to copy.', icon: Clipboard, hue: 285 },
  { id: 'units', title: 'Unit converter', body: 'Length, flow, stress, force, moment, line load and more — SI ⇄ US customary.', icon: Ruler, hue: 190 },
  { id: 'calc', title: 'Calc pad', body: 'A scratchpad that calculates as you type. Variables, trig in degrees, running totals.', icon: Calculator, hue: 160 },
  { id: 'focus', title: 'Focus timer', body: 'Deep-work sprints with breaks. Log the session to a project when you’re done.', icon: Hourglass, hue: 45 },
  { id: 'boards', title: 'Whiteboards', body: 'Sketch flowcharts and diagrams on an infinite canvas.', icon: Shapes, hue: 10, href: '/boards' },
]

export default function ToolsPage() {
  const { tool } = useParams()
  const navigate = useNavigate()
  if (tool) {
    const meta = TOOLS.find((t) => t.id === tool)
    return (
      <Page wide>
        <Link to="/tools" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" /> Tools
        </Link>
        <PageHeader title={meta?.title ?? 'Tool'} subtitle={meta?.body} />
        {tool === 'snippets' && <Snippets />}
        {tool === 'units' && <UnitConverter />}
        {tool === 'calc' && <CalcPad />}
        {tool === 'focus' && <FocusTimer />}
      </Page>
    )
  }
  return (
    <Page wide>
      <PageHeader title="Tools" subtitle="Small, sharp utilities for everyday engineering work." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((t, i) => (
          <motion.button
            key={t.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05, type: 'spring', stiffness: 300, damping: 28 } }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(t.href ?? `/tools/${t.id}`)}
            className="group relative overflow-hidden rounded-3xl border border-border bg-surface/80 p-6 text-left transition-colors hover:border-border-strong"
          >
            <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-70" style={{ background: `oklch(0.7 0.16 ${t.hue})` }} />
            <div className="relative mb-10 grid size-12 place-items-center rounded-2xl border border-border-strong bg-surface-2 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]" style={{ color: `oklch(0.78 0.14 ${t.hue})` }}>
              <t.icon className="size-5" />
            </div>
            <div className="relative text-[17px] font-semibold tracking-tight">{t.title}</div>
            <p className="relative mt-1.5 text-[13px] leading-relaxed text-muted">{t.body}</p>
          </motion.button>
        ))}
      </div>
    </Page>
  )
}

/* ------------------------------------------------------------------ */

function Snippets() {
  const snippets = useList('snippets')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const list = useMemo(() => {
    const n = q.toLowerCase()
    return snippets.filter((s) => !n || `${s.title} ${s.body} ${s.tags.join(' ')}`.toLowerCase().includes(n)).sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title))
  }, [snippets, q])
  const current = editing && editing !== 'new' ? snippets.find((s) => s.id === editing) : undefined

  const copy = async (id: string, body: string, uses: number) => {
    await copyText(body)
    ws().update('snippets', id, { uses: uses + 1 })
    setCopied(id)
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400)
  }

  return (
    <>
      <div className="mb-5 flex gap-2">
        <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search snippets…" className="max-w-sm flex-1" />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          New snippet
        </Button>
      </div>
      {snippets.length === 0 ? (
        <EmptyState icon={<Clipboard />} title="Nothing saved yet" body="Save text you paste often — project addresses, email templates, spec clauses — and copy it with one click." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {list.map((s) => (
              <motion.div layout key={s.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="group relative flex flex-col rounded-2xl border border-border bg-surface/80 p-4 transition-colors hover:border-border-strong">
                <div className="mb-2 flex items-center gap-2">
                  <button onClick={() => setEditing(s.id)} className="min-w-0 flex-1 truncate text-left text-[14px] font-medium hover:text-accent-strong">
                    {s.title}
                  </button>
                  <span className="text-[11px] text-subtle">{s.uses}×</span>
                </div>
                <pre className="line-clamp-4 flex-1 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted">{s.body}</pre>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void copy(s.id, s.body, s.uses)}
                  className={cn('mt-3 flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium transition-colors', copied === s.id ? 'bg-success/15 text-success' : 'bg-surface-2 text-fg hover:bg-surface-3')}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={copied === s.id ? 'done' : 'copy'} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -6, opacity: 0 }} className="flex items-center gap-1.5">
                      {copied === s.id ? '✓ Copied' : (
                        <>
                          <Copy className="size-3.5" /> Copy
                        </>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <SnippetDialog key={editing ?? 'none'} open={!!editing} snippet={current} onClose={() => setEditing(null)} />
    </>
  )
}

function SnippetDialog({ open, snippet, onClose }: { open: boolean; snippet?: import('@/store/types').Snippet; onClose: () => void }) {
  const [title, setTitle] = useState(snippet?.title ?? '')
  const [body, setBody] = useState(snippet?.body ?? '')
  const save = () => {
    if (!title.trim() || !body) return
    if (snippet) ws().update('snippets', snippet.id, { title, body })
    else ws().create('snippets', { title, body, tags: [], uses: 0 })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={snippet ? 'Edit snippet' : 'New snippet'}
      footer={
        <>
          {snippet && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash className="size-3.5" />} onClick={() => { ws().remove('snippets', snippet.id); onClose() }}>
              Delete
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={!title.trim() || !body}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Site address — Riverside" />
        </Field>
        <Field label="Content">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40 font-mono text-[13px]" />
        </Field>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function UnitConverter() {
  const [cat, setCat] = useState(UNIT_CATEGORIES[0].id)
  const category = UNIT_CATEGORIES.find((c) => c.id === cat)!
  const [fromId, setFrom] = useState(category.units[0].id)
  const [value, setValue] = useState('1')
  const from = category.units.find((u) => u.id === fromId) ?? category.units[0]
  const v = parseFloat(value)

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div className="flex flex-wrap gap-1 lg:flex-col">
        {UNIT_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setCat(c.id)
              setFrom(c.units[0].id)
            }}
            className={cn('relative rounded-lg px-3 py-2 text-left text-[13px] transition-colors', cat === c.id ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}
          >
            {cat === c.id && <motion.span layoutId="unit-cat" className="absolute inset-0 rounded-lg border border-border bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative">{c.label}</span>
          </button>
        ))}
      </div>
      <div>
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border-strong bg-surface/80 p-4">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            className="w-48 bg-transparent font-mono text-4xl font-medium tracking-tight outline-none"
          />
          <select value={from.id} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none">
            {category.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <ArrowLeftRight className="ml-auto size-5 text-subtle" />
        </div>
        <motion.div key={cat} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.025 } } }} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {category.units
            .filter((u) => u.id !== from.id)
            .map((u) => {
              const out = isNaN(v) ? NaN : convert(v, from, u)
              return (
                <motion.button
                  key={u.id}
                  variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                  onClick={async () => {
                    await copyText(formatNumber(out))
                    toast.success(`Copied ${formatNumber(out)} ${u.id}`)
                  }}
                  className="group rounded-xl border border-border bg-surface/70 p-4 text-left transition-colors hover:border-accent/40"
                >
                  <div className="font-mono text-xl font-medium tracking-tight tabular">{isNaN(out) ? '—' : formatNumber(out)}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-subtle">
                    {u.label}
                    <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </motion.button>
              )
            })}
        </motion.div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const CALC_KEY = 'wb.calcpad'
const CALC_DEFAULT = `// Calc pad — results appear on the right
span = 42
w = 1.2 * 0.85 + 1.6 * 0.4   // kip/ft
M = w * span^2 / 8
sqrt(3^2 + 4^2)
sin(30)`

function CalcPad() {
  const [text, setText] = useState(() => localStorage.getItem(CALC_KEY) ?? CALC_DEFAULT)
  useEffect(() => localStorage.setItem(CALC_KEY, text), [text])
  const results = useMemo(() => evaluateSheet(text), [text])
  const lines = text.split('\n')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const sum = results.reduce((s, r) => s + (r.value ?? 0), 0)
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface/80">
      <div className="relative grid grid-cols-[1fr_minmax(140px,30%)] font-mono text-[14.5px] leading-7">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="min-h-[420px] resize-none bg-transparent p-5 leading-7 outline-none"
          style={{ height: Math.max(420, lines.length * 28 + 40) }}
        />
        <div className="border-l border-border bg-surface-2/40 p-5">
          {results.map((r, i) => (
            <div key={i} className="h-7 truncate text-right">
              {r.value !== null ? (
                <button onClick={() => void copyText(formatNumber(r.value!)).then(() => toast.success('Copied'))} className="font-medium text-accent-strong hover:underline">
                  {formatNumber(r.value)}
                </button>
              ) : r.error && lines[i].trim() ? (
                <span className="text-xs text-danger/70">{r.error}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-subtle">
        <span>Variables with <code className="text-muted">x = …</code> · <code className="text-muted">ans</code> = previous · trig in degrees · <code className="text-muted">//</code> comments</span>
        <span className="font-mono">Σ {formatNumber(sum)}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function FocusTimer() {
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [minutes, setMinutes] = useState(50)
  const [breakMin, setBreakMin] = useState(10)
  const [remaining, setRemaining] = useState(minutes * 60_000)
  const [running, setRunning] = useState(false)
  const [projectId, setProjectId] = useState<string>()
  const [sessions, setSessions] = useState(0)
  const endAt = useRef(0)
  const openCapture = useUI((s) => s.openCapture)
  const total = (mode === 'focus' ? minutes : breakMin) * 60_000

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const left = endAt.current - Date.now()
      if (left <= 0) {
        setRunning(false)
        setRemaining(0)
        if (mode === 'focus') {
          setSessions((s) => s + 1)
          toast.success('Focus session complete 🎯', { action: { label: 'Log time', onClick: () => openCapture('time', { hours: Math.round((minutes / 60) * 4) / 4, projectId }) } })
          if ('Notification' in window && Notification.permission === 'granted') new Notification('Focus session complete', { body: 'Time for a break.' })
          setMode('break')
          setRemaining(breakMin * 60_000)
        } else {
          toast('Break over — back at it')
          setMode('focus')
          setRemaining(minutes * 60_000)
        }
      } else setRemaining(left)
    }, 250)
    return () => clearInterval(id)
  }, [running, mode, minutes, breakMin, projectId, openCapture])

  const start = () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    endAt.current = Date.now() + remaining
    setRunning(true)
  }
  const reset = () => {
    setRunning(false)
    setRemaining((mode === 'focus' ? minutes : breakMin) * 60_000)
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border border-border bg-surface/80 p-8">
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m)
          setRunning(false)
          setRemaining((m === 'focus' ? minutes : breakMin) * 60_000)
        }}
        options={[{ value: 'focus', label: 'Focus' }, { value: 'break', label: 'Break' }]}
      />
      <div className="my-8">
        <ProgressRing value={1 - remaining / total} size={260} stroke={14} color={mode === 'break' ? 'var(--success)' : 'var(--accent)'}>
          <div className="text-center">
            <div className="font-mono text-6xl font-medium tracking-tight tabular">{formatClock(remaining)}</div>
            <div className="mt-1 text-sm text-subtle">{mode === 'focus' ? `Session ${sessions + 1}` : 'Breathe'}</div>
          </div>
        </ProgressRing>
      </div>
      <div className="flex items-center gap-3">
        <IconButton label="Reset" size="md" onClick={reset}>
          <RotateCcw />
        </IconButton>
        <motion.button whileTap={{ scale: 0.94 }} onClick={running ? () => setRunning(false) : start} className="grid size-16 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_10px_30px_-8px_var(--accent-glow)]">
          {running ? <Pause className="size-6" fill="currentColor" /> : <Play className="size-6 translate-x-0.5" fill="currentColor" />}
        </motion.button>
        <div className="w-9" />
      </div>
      <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-3 border-t border-border pt-6 text-[13px] text-muted">
        <label className="flex items-center gap-2">
          Focus
          <Input type="number" value={minutes} onChange={(e) => { const m = Math.max(1, +e.target.value || 1); setMinutes(m); if (!running && mode === 'focus') setRemaining(m * 60_000) }} className="h-8 w-16 text-center" />
          min
        </label>
        <label className="flex items-center gap-2">
          Break
          <Input type="number" value={breakMin} onChange={(e) => { const m = Math.max(1, +e.target.value || 1); setBreakMin(m); if (!running && mode === 'break') setRemaining(m * 60_000) }} className="h-8 w-16 text-center" />
          min
        </label>
        <ProjectPicker value={projectId} onChange={setProjectId} placeholder="Project (for logging)" />
      </div>
    </div>
  )
}
