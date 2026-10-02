import { useMemo, useState } from 'react'
import { InstallBanner } from '@/components/layout/InstallApp'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { format, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  CalendarDays,
  Clock,
  Lightbulb,
  NotebookPen,
  Plus,
  Send,
  Shapes,
  SquareCheckBig,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn, formatHours, hueColor } from '@/lib/utils'
import { dueTone, fromKey, greeting, relativeDay, timeAgo, todayKey, toKey, weekDays, weekStart } from '@/lib/dates'
import { eventMeta } from '@/lib/meta'
import { useAuth } from '@/store/auth'
import { useUI } from '@/store/ui'
import { useList, useSettings, useTable, ws } from '@/store/workspace'
import { Page, Stagger } from '@/components/layout/Page'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AnimatedNumber, Avatar, Checkbox, Dot, ProgressRing, Segmented } from '@/components/ui/misc'
import { PriorityIcon } from '@/components/ui/icons'
import { usePersonName } from '@/components/ui/pickers'
import { setTaskStatus } from '@/features/tasks/TaskSheet'
import { nextOrder } from '@/features/tasks/TaskForm'

export function HomePage() {
  const account = useAuth((s) => s.account)
  const openCapture = useUI((s) => s.openCapture)
  const first = account?.name.split(' ')[0] ?? ''

  return (
    <Page wide>
      <InstallBanner />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <p className="text-[13px] font-medium text-subtle">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="mt-1 font-serif text-[40px] leading-[1.05] tracking-tight sm:text-[48px]">
            {greeting()}
            {first && <span className="text-muted">, </span>}
            <span className="shimmer-text">{first}</span>
            <span className="text-accent">.</span>
          </h1>
        </motion.div>
        <div className="flex gap-2">
          <Button icon={<Clock className="size-4" />} onClick={() => openCapture('time')}>
            Log time
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openCapture('task')}>
            New task
          </Button>
        </div>
      </header>

      <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        <WeekCard />
        <FocusCard />
        <CaptureCard />
        <UpcomingCard />
        <DelegatedCard />
        <ProjectMixCard />
        <RecentCard />
      </Stagger>
    </Page>
  )
}

/* ------------------------------------------------------------------ */

function useWeekStats() {
  const entries = useList('entries')
  const settings = useSettings()
  return useMemo(() => {
    const start = weekStart(new Date(), settings.weekStartsOn)
    const days = weekDays(start).map(toKey)
    const inWeek = entries.filter((e) => days.includes(e.date))
    const perDay = days.map((d) => inWeek.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0))
    const total = perDay.reduce((a, b) => a + b, 0)
    const billable = inWeek.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0)
    const byProject = new Map<string, number>()
    for (const e of inWeek) byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + e.hours)
    return { days, perDay, total, billable, byProject, target: settings.weeklyTarget }
  }, [entries, settings])
}

function WeekCard() {
  const { days, perDay, total, billable, target } = useWeekStats()
  const navigate = useNavigate()
  const max = Math.max(8, ...perDay)
  const today = todayKey()
  return (
    <Card className="md:col-span-3 xl:col-span-4" interactive onClick={() => navigate('/timesheet')}>
      <CardHeader title="This week" icon={<Clock />} action={<ArrowUpRight className="size-4 text-subtle transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5" />} />
      <div className="flex items-center gap-6 px-5 pb-5">
        <ProgressRing value={total / target} size={128} stroke={11}>
          <div className="text-center">
            <div className="font-mono text-3xl font-medium tracking-tight">
              <AnimatedNumber value={total} decimals={2} />
            </div>
            <div className="text-[11px] text-subtle">of {target}h</div>
          </div>
        </ProgressRing>
        <div className="flex-1">
          <div className="flex h-24 items-end gap-1.5">
            {perDay.map((h, i) => (
              <div key={days[i]} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="relative flex h-20 w-full items-end">
                  <motion.div
                    className={cn('w-full rounded-md', days[i] === today ? 'bg-accent' : 'bg-surface-3')}
                    style={days[i] === today ? { boxShadow: '0 0 16px var(--accent-glow)' } : undefined}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(4, (h / max) * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.1 + i * 0.04 }}
                    title={`${formatHours(h)}h`}
                  />
                </div>
                <span className={cn('text-[10.5px]', days[i] === today ? 'font-semibold text-fg' : 'text-subtle')}>{format(fromKey(days[i]), 'EEEEE')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs whitespace-nowrap text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success" />
              {total ? Math.round((billable / total) * 100) : 0}% billable
            </span>
            <span className="text-subtle">·</span>
            <span>{formatHours(Math.max(0, target - total))}h to go</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function FocusCard() {
  const tasks = useList('tasks')
  const projects = useTable('projects')
  const openTask = useUI((s) => s.openTask)
  const focus = useMemo(
    () =>
      tasks
        .filter((t) => t.assigneeId === 'me' && (t.status !== 'done' || (t.completedAt && isSameDay(new Date(t.completedAt), new Date()))))
        .filter((t) => t.status === 'doing' || ['overdue', 'soon'].includes(dueTone(t.due)) || t.priority === 'urgent' || t.status === 'done')
        .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due ?? '9').localeCompare(b.due ?? '9'))
        .slice(0, 6),
    [tasks],
  )
  const open = focus.filter((t) => t.status !== 'done').length
  return (
    <Card className="md:col-span-3 xl:col-span-5">
      <CardHeader
        title="Focus"
        icon={<SquareCheckBig />}
        action={
          <Link to="/tasks" className="text-xs text-subtle hover:text-fg">
            {open} open · View all
          </Link>
        }
      />
      <div className="px-2 pb-3">
        {focus.length === 0 && <p className="px-3 py-8 text-center text-sm text-subtle">Nothing urgent. Enjoy the calm ☕</p>}
        <AnimatePresence initial={false}>
          {focus.map((t) => {
            const tone = dueTone(t.due)
            const project = t.projectId ? projects[t.projectId] : undefined
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2/70"
              >
                <Checkbox round checked={t.status === 'done'} onChange={(v) => setTaskStatus(t, v ? 'done' : 'todo')} />
                <button onClick={() => openTask(t.id)} className="min-w-0 flex-1 text-left">
                  <div className={cn('truncate text-[13.5px] transition-colors', t.status === 'done' && 'text-subtle line-through')}>{t.title}</div>
                  {project && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-subtle">
                      <Dot hue={project.color} className="size-1.5" /> {project.name}
                    </div>
                  )}
                </button>
                <PriorityIcon priority={t.priority} />
                {t.due && (
                  <span className={cn('text-[11.5px] tabular', tone === 'overdue' ? 'text-danger' : tone === 'soon' ? 'text-warning' : 'text-subtle')}>
                    {relativeDay(t.due)}
                  </span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Card>
  )
}

function CaptureCard() {
  const [kind, setKind] = useState<'idea' | 'task'>('idea')
  const [text, setText] = useState('')
  const submit = () => {
    const t = text.trim()
    if (!t) return
    if (kind === 'idea') {
      ws().create('ideas', { text: t, stage: 'spark', color: 'amber', tags: Array.from(t.matchAll(/#([\w-]+)/g), (m) => m[1]), pinned: false })
      toast.success('Idea captured ✨')
    } else {
      ws().create('tasks', { title: t, notes: '', status: 'todo', priority: 'none', assigneeId: 'me', assignedById: 'me', labels: [], subtasks: [], order: nextOrder('todo') })
      toast.success('Task added')
    }
    setText('')
  }
  return (
    <Card className="md:col-span-6 xl:col-span-3">
      <CardHeader title="Quick capture" icon={<Lightbulb />} action={<Segmented size="xs" value={kind} onChange={setKind} options={[{ value: 'idea', label: 'Idea' }, { value: 'task', label: 'Task' }]} />} />
      <div className="px-5 pb-5">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={kind === 'idea' ? 'A thought worth keeping…' : 'Something to do…'}
            className="h-[118px] w-full resize-none rounded-xl border border-border bg-surface-2/50 p-3 pr-11 font-serif text-lg leading-snug outline-none transition-[border-color,box-shadow] placeholder:text-subtle/70 focus:border-accent/50 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <AnimatePresence>
            {text.trim() && (
              <motion.button
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                onClick={submit}
                className="absolute right-2.5 bottom-3.5 grid size-8 place-items-center rounded-lg bg-accent text-accent-fg"
              >
                <Send className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-2 text-[11px] text-subtle">Enter to save · Shift+Enter for a new line</p>
      </div>
    </Card>
  )
}

function UpcomingCard() {
  const events = useList('events')
  const tasks = useList('tasks')
  const projects = useTable('projects')
  const openCapture = useUI((s) => s.openCapture)
  const items = useMemo(() => {
    const today = todayKey()
    const horizon = toKey(new Date(Date.now() + 14 * 86400000))
    const ev = events.filter((e) => e.date >= today && e.date <= horizon).map((e) => ({ kind: 'event' as const, date: e.date, e }))
    const deadlines = tasks
      .filter((t) => t.due && t.status !== 'done' && t.due >= today && t.due <= horizon && t.priority !== 'none')
      .map((t) => ({ kind: 'task' as const, date: t.due!, t }))
    return [...ev, ...deadlines].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'event' ? (a.e.start ?? '') : '').localeCompare(b.kind === 'event' ? (b.e.start ?? '') : '')).slice(0, 6)
  }, [events, tasks])

  return (
    <Card className="md:col-span-3 xl:col-span-4">
      <CardHeader
        title="Coming up"
        icon={<CalendarDays />}
        action={
          <Link to="/calendar" className="text-xs text-subtle hover:text-fg">
            Calendar
          </Link>
        }
      />
      <div className="space-y-1 px-3 pb-4">
        {items.length === 0 && <p className="px-2 py-8 text-center text-sm text-subtle">Clear horizon for the next two weeks.</p>}
        {items.map((it) => {
          const d = fromKey(it.date)
          const hue = it.kind === 'event' ? eventMeta(it.e.kind).hue : 'rose'
          const project = it.kind === 'event' ? (it.e.projectId ? projects[it.e.projectId] : undefined) : it.t.projectId ? projects[it.t.projectId] : undefined
          return (
            <button
              key={it.kind + (it.kind === 'event' ? it.e.id : it.t.id)}
              onClick={() => (it.kind === 'event' ? openCapture('event', { eventId: it.e.id }) : useUI.getState().openTask(it.t.id))}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2/70"
            >
              <div className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-border bg-surface-2/60 py-1">
                <span className="text-[9.5px] font-semibold tracking-wide text-subtle uppercase">{format(d, 'EEE')}</span>
                <span className="text-[15px] leading-none font-semibold tabular">{format(d, 'd')}</span>
              </div>
              <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: hueColor(hue) }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px]">{it.kind === 'event' ? it.e.title : it.t.title}</div>
                <div className="truncate text-[11.5px] text-subtle">
                  {it.kind === 'event' ? (it.e.start ? `${it.e.start}${it.e.end ? `–${it.e.end}` : ''}` : eventMeta(it.e.kind).label) : 'Task due'}
                  {project && ` · ${project.number || project.name}`}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function DelegatedCard() {
  const tasks = useList('tasks')
  const nameOf = usePersonName()
  const openTask = useUI((s) => s.openTask)
  const delegated = useMemo(
    () => tasks.filter((t) => t.assignedById === 'me' && t.assigneeId !== 'me' && t.status !== 'done').sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9')).slice(0, 5),
    [tasks],
  )
  return (
    <Card className="md:col-span-3 xl:col-span-4">
      <CardHeader title="Waiting on others" icon={<Users />} />
      <div className="space-y-1 px-3 pb-4">
        {delegated.length === 0 && <p className="px-2 py-8 text-center text-sm text-subtle">Nothing delegated. Assign a task to a teammate and track it here.</p>}
        {delegated.map((t) => {
          const who = nameOf(t.assigneeId)
          const tone = dueTone(t.due)
          return (
            <button key={t.id} onClick={() => openTask(t.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2/70">
              <Avatar name={who.name} hue={who.hue} size={26} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px]">{t.title}</div>
                <div className="text-[11.5px] text-subtle">{who.name}</div>
              </div>
              {t.due && <span className={cn('text-[11.5px]', tone === 'overdue' ? 'text-danger' : 'text-subtle')}>{relativeDay(t.due)}</span>}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function ProjectMixCard() {
  const { byProject, total } = useWeekStats()
  const projects = useTable('projects')
  const rows = [...byProject.entries()].sort((a, b) => b[1] - a[1])
  return (
    <Card className="md:col-span-3 xl:col-span-4">
      <CardHeader title="Where the week went" icon={<TrendingUp />} />
      <div className="px-5 pb-5">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-subtle">No hours logged this week yet.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
              {rows.map(([pid, h], i) => (
                <motion.div
                  key={pid}
                  initial={{ width: 0 }}
                  animate={{ width: `${(h / total) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.1 + i * 0.05 }}
                  style={{ background: hueColor(projects[pid]?.color) }}
                  className="h-full border-r-2 border-surface last:border-r-0"
                />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {rows.slice(0, 5).map(([pid, h]) => (
                <div key={pid} className="flex items-center gap-2.5 text-[13px]">
                  <Dot hue={projects[pid]?.color} />
                  <span className="flex-1 truncate">{projects[pid]?.name ?? 'Unknown project'}</span>
                  <span className="font-mono text-xs text-muted tabular">{formatHours(h)}h</span>
                  <span className="w-9 text-right text-[11px] text-subtle tabular">{Math.round((h / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function RecentCard() {
  const notes = useList('notes')
  const boards = useList('boards')
  const items = useMemo(
    () =>
      [
        ...notes.map((n) => ({ id: n.id, to: `/notes/${n.id}`, title: n.title || 'Untitled', icon: <span className="text-base">{n.icon}</span>, at: n.updatedAt, kind: 'Note' })),
        ...boards.map((b) => ({ id: b.id, to: `/boards/${b.id}`, title: b.name, icon: <Shapes className="size-4 text-accent-strong" />, at: b.updatedAt, kind: 'Board' })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6),
    [notes, boards],
  )
  return (
    <Card className="md:col-span-6 xl:col-span-12">
      <CardHeader title="Jump back in" icon={<NotebookPen />} />
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {items.length === 0 && <p className="col-span-full py-6 text-center text-sm text-subtle">Your recent notes and whiteboards will show up here.</p>}
        {items.map((it) => (
          <Link
            key={it.id}
            to={it.to}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-3 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3/70">{it.icon}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{it.title}</div>
              <div className="text-[11px] text-subtle">
                {it.kind} · {timeAgo(it.at)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  )
}
