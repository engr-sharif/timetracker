import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Clock, Copy, Ellipsis, FileText, Lightbulb, MessagesSquare, Pencil, Play, Plus, Shapes, Trash } from 'lucide-react'
import { copyText, cn, formatHours, hueColor, hueVars } from '@/lib/utils'
import { fromKey, relativeDay, timeAgo } from '@/lib/dates'
import { PROJECT_STATUSES } from '@/lib/meta'
import { useUI } from '@/store/ui'
import { useTimer } from '@/store/timer'
import { useList, useRecord, ws } from '@/store/workspace'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Checkbox, EmptyState, ProgressRing } from '@/components/ui/misc'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/popover'
import { PriorityIcon } from '@/components/ui/icons'
import { usePersonName } from '@/components/ui/pickers'
import { confirm } from '@/components/ui/dialog'
import { setTaskStatus } from '@/features/tasks/TaskSheet'
import { useCreateActions } from '@/components/layout/CreateMenu'
import { ProjectFormDialog } from './ProjectForm'
import { useProjectStats } from './projectStats'

const TABS = ['Overview', 'Tasks', 'Time', 'Knowledge'] as const
type Tab = (typeof TABS)[number]

export default function ProjectDetail() {
  const { id } = useParams()
  const project = useRecord('projects', id)
  const stats = useProjectStats().get(id ?? '')
  const navigate = useNavigate()
  const openCapture = useUI((s) => s.openCapture)
  const startTimer = useTimer((s) => s.start)
  const [tab, setTab] = useState<Tab>('Overview')
  const [editing, setEditing] = useState(false)

  if (!project) {
    return (
      <Page>
        <EmptyState icon={<FileText />} title="Project not found" body="It may have been deleted." action={<Button onClick={() => navigate('/projects')}>Back to projects</Button>} />
      </Page>
    )
  }

  const status = PROJECT_STATUSES.find((s) => s.value === project.status)!
  const burn = project.budgetHours ? (stats?.total ?? 0) / project.budgetHours : 0

  const remove = async () => {
    if (stats?.total) {
      toast.error('This project has logged time', { description: 'Mark it complete instead so your timesheet history stays intact.' })
      return
    }
    if (!(await confirm({ title: `Delete ${project.name}?`, body: 'Tasks and notes linked to it will be kept but unlinked.', confirmLabel: 'Delete project', danger: true }))) return
    const removed = ws().remove('projects', project.id)
    navigate('/projects')
    toast('Project deleted', { action: { label: 'Undo', onClick: () => ws().restore('projects', removed) } })
  }

  return (
    <Page wide>
      <div style={hueVars(project.color)}>
        <Link to="/projects" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-subtle transition-colors hover:text-fg">
          <ArrowLeft className="size-3.5" /> Projects
        </Link>

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-border bg-surface/70 p-6 backdrop-blur-sm sm:p-8">
          <div className="pointer-events-none absolute -top-24 -left-10 h-64 w-[60%] rounded-full opacity-50 blur-3xl" style={{ background: hueColor(project.color, 0.35) }} />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={async () => {
                    await copyText(project.number)
                    toast.success('Project number copied')
                  }}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-[var(--hue-border)] bg-[var(--hue-soft)] px-2 py-1 font-mono text-[13px] font-semibold text-[var(--hue)]"
                  title="Copy project number"
                >
                  {project.number || 'No number'}
                  <Copy className="size-3 opacity-50 group-hover:opacity-100" />
                </button>
                <Badge hue={status.hue} dot>
                  {status.label}
                </Badge>
              </div>
              <h1 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.03em] sm:text-[34px]">{project.name}</h1>
              <p className="mt-1 text-[14px] text-muted">
                {[project.client, project.location, project.manager && `PM: ${project.manager}`].filter(Boolean).join(' · ')}
              </p>
              {project.description && <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted">{project.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button icon={<Play className="size-3.5" fill="currentColor" />} onClick={() => { startTimer({ projectId: project.id }); toast.success('Timer started') }}>
                Timer
              </Button>
              <Button variant="primary" icon={<Clock className="size-4" />} onClick={() => openCapture('time', { projectId: project.id })}>
                Log time
              </Button>
              <Popover
                role="menu"
                placement="bottom-end"
                trigger={
                  <Button variant="ghost" size="md" aria-label="More">
                    <Ellipsis className="size-4" />
                  </Button>
                }
              >
                <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
                  Edit project
                </MenuItem>
                <MenuItem icon={<Plus />} onSelect={() => openCapture('task', { projectId: project.id })}>
                  Add task
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash />} danger onSelect={remove}>
                  Delete project
                </MenuItem>
              </Popover>
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <HeaderStat label="Hours this week" value={formatHours(stats?.week ?? 0)} />
            <HeaderStat label="Hours to date" value={formatHours(stats?.total ?? 0)} />
            <HeaderStat label="Billable" value={`${stats?.total ? Math.round(((stats.billable ?? 0) / stats.total) * 100) : 0}%`} />
            <HeaderStat label="Open tasks" value={String(stats?.openTasks ?? 0)} />
          </div>
        </header>

        <div className="relative mb-6 flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('relative px-3.5 pb-3 text-[13.5px] font-medium transition-colors', tab === t ? 'text-fg' : 'text-subtle hover:text-muted')}>
              {t}
              {tab === t && <motion.span layoutId="project-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--hue)]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            {tab === 'Overview' && <Overview projectId={project.id} burn={burn} budget={project.budgetHours} total={stats?.total ?? 0} byCode={stats?.byCode} costCodes={project.costCodes} />}
            {tab === 'Tasks' && <ProjectTasks projectId={project.id} />}
            {tab === 'Time' && <ProjectTime projectId={project.id} />}
            {tab === 'Knowledge' && <Knowledge projectId={project.id} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <ProjectFormDialog open={editing} onClose={() => setEditing(false)} project={project} />
    </Page>
  )
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg/40 px-4 py-3">
      <div className="font-mono text-2xl font-medium tracking-tight tabular">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-subtle">{label}</div>
    </div>
  )
}

function Overview({ projectId, burn, budget, total, byCode, costCodes }: { projectId: string; burn: number; budget?: number; total: number; byCode?: Map<string, number>; costCodes: string[] }) {
  const tasks = useList('tasks')
  const open = tasks.filter((t) => t.projectId === projectId && t.status !== 'done').sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9')).slice(0, 6)
  const openTask = useUI((s) => s.openTask)
  const codes = [...new Set([...costCodes, ...(byCode?.keys() ?? [])])]
  const max = Math.max(1, ...codes.map((c) => byCode?.get(c) ?? 0))
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-2xl border border-border bg-surface/70 p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-muted">Budget</h3>
        {budget ? (
          <div className="flex flex-col items-center">
            <ProgressRing value={burn} size={150} stroke={12} color={burn > 1 ? 'var(--danger)' : 'var(--hue)'}>
              <div className="text-center">
                <div className="font-mono text-3xl font-medium">{Math.round(burn * 100)}%</div>
                <div className="text-[11px] text-subtle">used</div>
              </div>
            </ProgressRing>
            <p className="mt-4 text-center text-[13px] text-muted">
              {formatHours(total)}h of {budget}h · <span className={burn > 1 ? 'text-danger' : 'text-fg'}>{formatHours(Math.abs(budget - total))}h {budget - total >= 0 ? 'remaining' : 'over'}</span>
            </p>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-subtle">No budget set. Edit the project to add one.</p>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-surface/70 p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-muted">Hours by cost code</h3>
        <div className="space-y-3">
          {codes.length === 0 && <p className="py-8 text-center text-sm text-subtle">No cost codes yet.</p>}
          {codes.map((c, i) => {
            const h = byCode?.get(c) ?? 0
            return (
              <div key={c}>
                <div className="mb-1 flex justify-between text-[12.5px]">
                  <span className="font-mono text-muted">{c}</span>
                  <span className="font-mono tabular">{formatHours(h)}h</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full bg-[var(--hue)]" initial={{ width: 0 }} animate={{ width: `${(h / max) * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 20, delay: i * 0.04 }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-surface/70 p-5">
        <h3 className="mb-3 text-[13px] font-semibold text-muted">Next up</h3>
        {open.length === 0 && <p className="py-8 text-center text-sm text-subtle">No open tasks.</p>}
        <div className="-mx-2 space-y-0.5">
          {open.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
              <Checkbox round size={16} checked={false} onChange={() => setTaskStatus(t, 'done')} />
              <button onClick={() => openTask(t.id)} className="min-w-0 flex-1 truncate text-left text-[13px]">
                {t.title}
              </button>
              <PriorityIcon priority={t.priority} />
              {t.due && <span className="text-[11px] text-subtle">{relativeDay(t.due)}</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function ProjectTasks({ projectId }: { projectId: string }) {
  const tasks = useList('tasks')
  const list = tasks.filter((t) => t.projectId === projectId).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due ?? '9').localeCompare(b.due ?? '9'))
  const openTask = useUI((s) => s.openTask)
  const openCapture = useUI((s) => s.openCapture)
  const nameOf = usePersonName()
  return (
    <div className="rounded-2xl border border-border bg-surface/70">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[13px] text-muted">{list.length} tasks</span>
        <Button size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={() => openCapture('task', { projectId })}>
          Add task
        </Button>
      </div>
      {list.length === 0 && <p className="py-12 text-center text-sm text-subtle">No tasks on this project yet.</p>}
      <AnimatePresence initial={false}>
        {list.map((t) => {
          const who = nameOf(t.assigneeId)
          return (
            <motion.div layout key={t.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0 hover:bg-surface-2/40">
              <Checkbox round checked={t.status === 'done'} onChange={(v) => setTaskStatus(t, v ? 'done' : 'todo')} />
              <PriorityIcon priority={t.priority} />
              <button onClick={() => openTask(t.id)} className={cn('min-w-0 flex-1 truncate text-left text-[13.5px]', t.status === 'done' && 'text-subtle line-through')}>
                {t.title}
              </button>
              {t.due && <span className="text-xs text-subtle">{relativeDay(t.due)}</span>}
              <Avatar name={who.name} hue={who.hue} size={22} />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

function ProjectTime({ projectId }: { projectId: string }) {
  const entries = useList('entries')
  const openCapture = useUI((s) => s.openCapture)
  const list = useMemo(() => entries.filter((e) => e.projectId === projectId).sort((a, b) => b.date.localeCompare(a.date)), [entries, projectId])
  const byMonth = useMemo(() => {
    const m = new Map<string, typeof list>()
    for (const e of list) {
      const k = e.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()]
  }, [list])
  if (!list.length) return <EmptyState icon={<Clock />} title="No time logged yet" action={<Button variant="primary" onClick={() => openCapture('time', { projectId })}>Log time</Button>} />
  return (
    <div className="space-y-6">
      {byMonth.map(([month, items]) => (
        <div key={month}>
          <div className="mb-2 flex items-center gap-3 text-[12.5px]">
            <span className="font-semibold">{format(fromKey(month + '-01'), 'MMMM yyyy')}</span>
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-muted">{formatHours(items.reduce((s, e) => s + e.hours, 0))}h</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface/70">
            {items.map((e) => (
              <button key={e.id} onClick={() => openCapture('time', { entryId: e.id })} className="flex w-full items-center gap-4 border-b border-border/60 px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-2/40">
                <span className="w-20 text-[12px] text-subtle">{format(fromKey(e.date), 'EEE MMM d')}</span>
                <span className="w-28 truncate font-mono text-[11.5px] text-muted">{e.costCode}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.description || <span className="text-subtle italic">No description</span>}</span>
                <span className="font-mono text-[13px] font-semibold">{formatHours(e.hours)}h</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Knowledge({ projectId }: { projectId: string }) {
  const notes = useList('notes').filter((n) => n.projectId === projectId)
  const ideas = useList('ideas').filter((i) => i.projectId === projectId)
  const boards = useList('boards').filter((b) => b.projectId === projectId)
  const channels = useList('channels').filter((c) => c.projectId === projectId)
  const files = useList('files').filter((f) => f.projectId === projectId)
  const create = useCreateActions()
  const openCapture = useUI((s) => s.openCapture)
  const items = [
    ...notes.map((n) => ({ id: n.id, to: `/notes/${n.id}`, icon: <span>{n.icon}</span>, title: n.title || 'Untitled', meta: `Note · ${timeAgo(n.updatedAt)}` })),
    ...boards.map((b) => ({ id: b.id, to: `/boards/${b.id}`, icon: <Shapes className="size-4" />, title: b.name, meta: `Whiteboard · ${timeAgo(b.updatedAt)}` })),
    ...channels.map((c) => ({ id: c.id, to: `/messages/${c.id}`, icon: <MessagesSquare className="size-4" />, title: `#${c.name}`, meta: 'Channel' })),
    ...files.map((f) => ({ id: f.id, to: `/files?focus=${f.id}`, icon: <FileText className="size-4" />, title: f.name, meta: `File · ${timeAgo(f.createdAt)}` })),
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="mb-3 flex gap-2">
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => create.note(projectId)}>
            Note
          </Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => create.board(projectId)}>
            Whiteboard
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.length === 0 && <p className="col-span-full rounded-2xl border border-dashed border-border py-12 text-center text-sm text-subtle">Link notes, boards, channels and files to this project and they’ll gather here.</p>}
          {items.map((it) => (
            <Link key={it.id} to={it.to} className="flex items-center gap-3 rounded-xl border border-border bg-surface/70 p-3 transition-all hover:-translate-y-0.5 hover:border-border-strong">
              <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-[var(--hue)]">{it.icon}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{it.title}</div>
                <div className="text-[11px] text-subtle">{it.meta}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-surface/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-muted">
            <Lightbulb className="size-4" /> Ideas
          </h3>
          <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => openCapture('idea', { projectId })}>
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {ideas.length === 0 && <p className="py-6 text-center text-xs text-subtle">No ideas linked yet.</p>}
          {ideas.map((i) => (
            <div key={i.id} className="rounded-xl p-3 font-serif text-[15px] leading-snug" style={{ background: hueColor(i.color, 0.12), boxShadow: `inset 3px 0 0 ${hueColor(i.color)}` }}>
              {i.text}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
