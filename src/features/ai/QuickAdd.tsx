import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { z } from 'zod'
import { create } from 'zustand'
import { format, parseISO } from 'date-fns'
import { CalendarDays, Clock, KeyRound, Sparkles, SquareCheckBig } from 'lucide-react'
import { cn, formatHours } from '@/lib/utils'
import { AiError, extract, useAi } from '@/lib/ai'
import { useHotkeys } from '@/lib/hotkeys'
import { codeName, isBillable, openCodes } from '@/lib/wbs'
import { ws } from '@/store/workspace'
import type { EventKind, Priority } from '@/store/types'
import { Dialog } from '@/components/ui/dialog'
import { Button, Spinner } from '@/components/ui/button'
import { Checkbox, Dot, Kbd } from '@/components/ui/misc'
import { Textarea } from '@/components/ui/field'

/**
 * Natural-language capture: “2.5h on 1234567 task 002 yesterday, drainage review;
 * remind me Friday to send the RFI log to Dana” → a time entry + a task, previewed
 * before anything is saved.
 */

interface QuickAddState {
  open: boolean
  text: string
  show: (text?: string) => void
  close: () => void
}
export const useQuickAdd = create<QuickAddState>((set) => ({
  open: false,
  text: '',
  show: (text = '') => set({ open: true, text }),
  close: () => set({ open: false }),
}))

const Action = z.object({
  type: z.enum(['time', 'task', 'event']),
  title: z.string().describe('time: work description; task/event: short title'),
  date: z.string().nullable().describe('yyyy-mm-dd — time entry date or event date'),
  hours: z.number().nullable(),
  projectId: z.string().nullable().describe('id from the project list, or null'),
  costCode: z.string().nullable().describe('task code from that project, or null'),
  billable: z.boolean().nullable(),
  due: z.string().nullable().describe('task due date yyyy-mm-dd'),
  assigneeId: z.string().nullable().describe('"me" or a person id'),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).nullable(),
  start: z.string().nullable().describe('event start HH:mm'),
  end: z.string().nullable().describe('event end HH:mm'),
  kind: z.enum(['meeting', 'deadline', 'site', 'milestone', 'personal']).nullable(),
  notes: z.string().nullable(),
})
const Schema = z.object({ actions: z.array(Action), clarification: z.string().nullable().describe('only if something essential is ambiguous') })
type Parsed = z.infer<typeof Action> & { key: string; keep: boolean; problem?: string }

function context() {
  const { tables, settings } = ws().doc
  const today = new Date()
  const projects = Object.values(tables.projects)
    .filter((p) => p.status !== 'complete')
    .map((p) => ({ id: p.id, number: p.number, name: p.name, client: p.client, codes: openCodes(p).map((c) => (codeName(p, c) ? `${c} (${codeName(p, c)})` : c)) }))
  const people = Object.values(tables.people).map((p) => ({ id: p.id, name: p.name, company: p.company }))
  return {
    text: JSON.stringify({ today: format(today, 'yyyy-MM-dd (EEEE)'), weekStartsOn: settings.weekStartsOn ? 'Monday' : 'Sunday', projects, people }),
  }
}

const SYSTEM = `You convert quick notes from an engineering consultant into records for their workspace.
- "time": hours worked (a timesheet entry). Needs date, hours (0.25–24, round to 0.25), projectId and costCode when they can be matched from the list (match by project number, name or client; match task codes by code or name). description = what was done.
- "task": something to do. due only if a date is stated or implied ("Friday" → next Friday). assigneeId "me" unless a listed person is clearly the assignee.
- "event": a meeting, site visit, deadline or milestone on a calendar date, with times if given.
Resolve relative dates against "today". Split multiple items. Never invent projects, codes or people that aren't in the list — use null instead.`

async function parse(text: string): Promise<{ items: Parsed[]; clarification: string | null }> {
  const out = await extract(Schema, { system: SYSTEM, content: `Workspace context:\n${context().text}\n\nNote:\n${text}`, effort: 'low' })
  const { tables } = ws().doc
  const items = out.actions.map((a, i) => {
    const p = a.projectId ? tables.projects[a.projectId] : undefined
    const fixed: Parsed = { ...a, key: `${i}`, keep: true, projectId: p ? a.projectId : null }
    if (a.type === 'time') {
      if (!p) fixed.problem = 'Pick a project'
      else if (!a.costCode || !p.costCodes.includes(a.costCode)) fixed.costCode = openCodes(p)[0] ?? null
      if (!a.hours || a.hours <= 0 || a.hours > 24) fixed.problem = 'Check the hours'
      fixed.hours = a.hours ? Math.round(a.hours * 4) / 4 : null
    }
    const okDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
    fixed.date = okDate(a.date) ?? (a.type !== 'task' ? format(new Date(), 'yyyy-MM-dd') : null)
    fixed.due = okDate(a.due)
    if (a.assigneeId && a.assigneeId !== 'me' && !tables.people[a.assigneeId]) fixed.assigneeId = 'me'
    if (fixed.problem) fixed.keep = false
    return fixed
  })
  return { items, clarification: out.clarification }
}

function save(items: Parsed[]) {
  const { tables, settings } = ws().doc
  let n = 0
  for (const a of items.filter((x) => x.keep)) {
    if (a.type === 'time' && a.projectId && a.hours) {
      const p = tables.projects[a.projectId]
      ws().create('entries', {
        date: a.date!,
        projectId: a.projectId,
        costCode: a.costCode ?? '',
        hours: a.hours,
        description: a.title,
        billable: a.billable ?? isBillable(p, a.costCode ?? '', settings.defaultBillable),
      })
      n++
    } else if (a.type === 'task') {
      ws().create('tasks', {
        title: a.title,
        notes: a.notes ?? '',
        projectId: a.projectId ?? undefined,
        assigneeId: a.assigneeId ?? 'me',
        assignedById: 'me',
        status: 'todo',
        priority: (a.priority ?? 'none') as Priority,
        due: a.due ?? undefined,
        labels: [],
        subtasks: [],
        order: Date.now() + n,
      })
      n++
    } else if (a.type === 'event' && a.date) {
      ws().create('events', { title: a.title, date: a.date, start: a.start ?? undefined, end: a.end ?? undefined, kind: (a.kind ?? 'meeting') as EventKind, projectId: a.projectId ?? undefined, notes: a.notes ?? undefined })
      n++
    }
  }
  return n
}

const ICON = { time: Clock, task: SquareCheckBig, event: CalendarDays }

export function QuickAddHost() {
  const { open, text: seed, show, close } = useQuickAdd()
  const hasKey = useAi((s) => !!s.key)
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Parsed[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const ran = useRef('')

  useHotkeys([{ combo: 'mod+j', handler: () => show(), allowInInputs: true }])

  const run = async (t: string) => {
    if (!t.trim() || busy) return
    ran.current = t
    setBusy(true)
    setItems(null)
    setNote(null)
    try {
      const r = await parse(t)
      setItems(r.items)
      setNote(r.clarification)
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : 'Could not understand that')
    }
    setBusy(false)
  }

  useEffect(() => {
    if (!open) return
    setText(seed)
    setItems(null)
    setNote(null)
    if (seed.trim() && hasKey) void run(seed)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const projects = ws().doc.tables.projects
  const people = ws().doc.tables.people
  const kept = items?.filter((i) => i.keep).length ?? 0

  return (
    <Dialog
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-strong" /> Quick add
        </span>
      }
      description="Describe time, tasks or meetings in your own words."
      className="max-w-xl"
      footer={
        items && items.length ? (
          <div className="flex w-full items-center justify-between">
            <button onClick={() => setItems(null)} className="text-[12.5px] text-subtle hover:text-fg">
              Edit text
            </button>
            <Button
              variant="primary"
              disabled={!kept}
              onClick={() => {
                const n = save(items)
                toast.success(`Added ${n} item${n === 1 ? '' : 's'}`)
                close()
              }}
            >
              Add {kept} item{kept === 1 ? '' : 's'}
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11.5px] text-subtle">
              <Kbd>⌘/Ctrl</Kbd>
              <Kbd>J</Kbd> anywhere
            </span>
            <Button variant="primary" loading={busy} disabled={!text.trim() || !hasKey} onClick={() => void run(text)}>
              Preview
            </Button>
          </div>
        )
      }
    >
      {!hasKey ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/40 p-4 text-[13px] text-muted">
          Quick add uses your Claude API key.
          <Button
            size="sm"
            icon={<KeyRound className="size-3.5" />}
            onClick={() => {
              close()
              navigate('/settings#ai')
            }}
          >
            Add key
          </Button>
        </div>
      ) : !items ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void run(text)
              }
            }}
            rows={3}
            placeholder="e.g. 3.5h yesterday on 1234567 task 002 checking footing calcs; site visit Thursday 9–11 at Riverside; remind me Friday to send the RFI log to Dana"
            className="text-[13.5px]"
          />
          {busy && (
            <div className="flex items-center gap-2 text-[12px] text-subtle">
              <Spinner className="size-3.5" /> Understanding…
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {!items.length && <p className="py-6 text-center text-sm text-subtle">Nothing to add from that.</p>}
          {note && <p className="rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] text-warning">{note}</p>}
          <AnimatePresence initial>
            {items.map((a, i) => {
              const Icon = ICON[a.type]
              const p = a.projectId ? projects[a.projectId] : undefined
              return (
                <motion.label
                  key={a.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn('flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors', a.keep ? 'border-accent/40 bg-accent-soft/40' : 'border-border opacity-70')}
                >
                  <Checkbox checked={a.keep} onChange={(keep) => setItems(items.map((x) => (x.key === a.key ? { ...x, keep } : x)))} />
                  <Icon className="mt-0.5 size-4 shrink-0 text-accent-strong" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{a.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
                      {a.type === 'time' && a.hours != null && <span className="font-mono text-fg">{formatHours(a.hours)}h</span>}
                      {a.type !== 'task' && a.date && <span>{format(parseISO(a.date), 'EEE d MMM')}</span>}
                      {a.type === 'event' && a.start && (
                        <span>
                          {a.start}
                          {a.end && `–${a.end}`}
                        </span>
                      )}
                      {a.type === 'task' && a.due && <span>due {format(parseISO(a.due), 'EEE d MMM')}</span>}
                      {p && (
                        <span className="flex items-center gap-1">
                          <Dot hue={p.color} /> <span className="font-mono">{p.number}</span>
                          {a.costCode && <span className="font-mono">· {a.costCode}</span>}
                          {a.costCode && codeName(p, a.costCode) && <span>{codeName(p, a.costCode)}</span>}
                        </span>
                      )}
                      {a.type === 'task' && a.assigneeId && a.assigneeId !== 'me' && people[a.assigneeId] && <span>→ {people[a.assigneeId].name}</span>}
                      {a.priority && a.priority !== 'none' && <span className="capitalize">{a.priority}</span>}
                    </div>
                    {a.problem && <div className="mt-1 text-[11.5px] text-warning">{a.problem} — open Timesheet to finish it</div>}
                  </div>
                </motion.label>
              )
            })}
          </AnimatePresence>
          <p className="pt-1 text-[11.5px] text-subtle">From: “{ran.current}”</p>
        </div>
      )}
    </Dialog>
  )
}
