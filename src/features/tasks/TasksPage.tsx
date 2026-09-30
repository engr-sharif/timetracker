import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, Kanban, List, Plus, Search, SquareCheckBig } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dueTone, relativeDay } from '@/lib/dates'
import { TASK_STATUSES, priorityMeta } from '@/lib/meta'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { useList, useTable, ws } from '@/store/workspace'
import type { Task, TaskStatus } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Avatar, Checkbox, Dot, EmptyState, Segmented } from '@/components/ui/misc'
import { PriorityIcon, StatusIcon } from '@/components/ui/icons'
import { PersonPicker, ProjectPicker, usePersonName } from '@/components/ui/pickers'
import { TaskCard } from './TaskCard'
import { setTaskStatus } from './TaskSheet'

type Scope = 'all' | 'mine' | 'delegated'

export default function TasksPage() {
  const tasks = useList('tasks')
  const view = usePrefs((s) => s.tasksView)
  const setPrefs = usePrefs((s) => s.set)
  const openCapture = useUI((s) => s.openCapture)
  const [scope, setScope] = useState<Scope>('all')
  const [projectId, setProjectId] = useState<string>()
  const [assignee, setAssignee] = useState<string>()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (scope === 'mine' && t.assigneeId !== 'me') return false
      if (scope === 'delegated' && !(t.assignedById === 'me' && t.assigneeId !== 'me')) return false
      if (projectId && t.projectId !== projectId) return false
      if (assignee && t.assigneeId !== assignee) return false
      if (needle && !`${t.title} ${t.notes} ${t.labels.join(' ')}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [tasks, scope, projectId, assignee, q])

  const open = filtered.filter((t) => t.status !== 'done').length

  return (
    <Page wide className="flex h-full flex-col">
      <PageHeader
        title="Tasks"
        subtitle={`${open} open · ${filtered.length - open} done`}
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => setPrefs({ tasksView: v })}
              options={[
                { value: 'board', label: 'Board', icon: <Kanban /> },
                { value: 'list', label: 'List', icon: <List /> },
              ]}
            />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openCapture('task', { projectId })}>
              New task
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All' },
            { value: 'mine', label: 'Assigned to me' },
            { value: 'delegated', label: 'I delegated' },
          ]}
        />
        <ProjectPicker value={projectId} onChange={setProjectId} placeholder="Any project" />
        <PersonPicker value={assignee} onChange={(id) => setAssignee(id === assignee ? undefined : id)} label="Anyone" />
        {(projectId || assignee) && (
          <button onClick={() => { setProjectId(undefined); setAssignee(undefined) }} className="text-xs text-subtle hover:text-fg">
            Clear filters
          </button>
        )}
        <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks…" className="ml-auto w-full sm:w-60" />
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<SquareCheckBig />}
          title="No tasks yet"
          body="Capture what needs doing — for you or someone you’re delegating to. Press C anywhere."
          action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openCapture('task')}>Create a task</Button>}
        />
      ) : view === 'board' ? (
        <Board tasks={filtered} />
      ) : (
        <ListView tasks={filtered} />
      )}
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/*  Board                                                              */
/* ------------------------------------------------------------------ */

type Columns = Record<TaskStatus, string[]>

function buildColumns(tasks: Task[]): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, [] as string[]])) as unknown as Columns
  for (const t of [...tasks].sort((a, b) => a.order - b.order)) cols[t.status].push(t.id)
  return cols
}

function Board({ tasks }: { tasks: Task[] }) {
  const projects = useTable('projects')
  const byId = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks])
  const [cols, setCols] = useState<Columns>(() => buildColumns(tasks))
  const [activeId, setActiveId] = useState<string | null>(null)
  const openTask = useUI((s) => s.openTask)

  useEffect(() => {
    if (!activeId) setCols(buildColumns(tasks))
  }, [tasks, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findCol = (id: string): TaskStatus | undefined =>
    (id in cols ? (id as TaskStatus) : (Object.keys(cols) as TaskStatus[]).find((k) => cols[k].includes(id)))

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const from = findCol(String(active.id))
    const to = findCol(String(over.id))
    if (!from || !to || from === to) return
    setCols((c) => {
      const fromItems = c[from].filter((x) => x !== active.id)
      const overIndex = c[to].indexOf(String(over.id))
      const toItems = [...c[to]]
      toItems.splice(overIndex < 0 ? toItems.length : overIndex, 0, String(active.id))
      return { ...c, [from]: fromItems, [to]: toItems }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    const col = findCol(id)
    let next = cols
    if (over && col) {
      const overCol = findCol(String(over.id))
      if (overCol === col) {
        const oldIndex = cols[col].indexOf(id)
        const newIndex = cols[col].indexOf(String(over.id))
        if (newIndex >= 0 && oldIndex !== newIndex) next = { ...cols, [col]: arrayMove(cols[col], oldIndex, newIndex) }
      }
    }
    setCols(next)
    setActiveId(null)
    if (!col) return
    // Persist order + status for the column the card landed in.
    next[col].forEach((tid, index) => {
      const t = byId[tid]
      if (!t) return
      if (t.status !== col) setTaskStatus(t, col)
      if (t.order !== index) ws().update('tasks', tid, { order: index })
    })
  }

  const active = activeId ? byId[activeId] : null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        {TASK_STATUSES.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} ids={cols[s.value]}>
            {cols[s.value].map((id) =>
              byId[id] ? (
                <SortableCard key={id} task={byId[id]} project={byId[id].projectId ? projects[byId[id].projectId!] : undefined} onOpen={() => openTask(id)} />
              ) : null,
            )}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {active ? <TaskCard task={active} project={active.projectId ? projects[active.projectId] : undefined} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ status, label, ids, children }: { status: TaskStatus; label: string; ids: string[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const openCapture = useUI((s) => s.openCapture)
  return (
    <div className="flex w-[290px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1.5">
        <StatusIcon status={status} />
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-xs text-subtle tabular">{ids.length}</span>
        <button onClick={() => openCapture('task', { status })} className="ml-auto grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Add to ${label}`}>
          <Plus className="size-3.5" />
        </button>
      </div>
      <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-32 flex-1 flex-col gap-2 rounded-2xl border border-transparent bg-surface-2/30 p-2 transition-colors',
            isOver && 'border-accent/30 bg-accent-soft',
          )}
        >
          {children}
          {ids.length === 0 && <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border py-8 text-xs text-subtle">Drop here</div>}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({ task, project, onOpen }: { task: Task; project?: import('@/store/types').Project; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      project={project}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

function ListView({ tasks }: { tasks: Task[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true })
  const projects = useTable('projects')
  const openTask = useUI((s) => s.openTask)
  const nameOf = usePersonName()

  return (
    <div className="space-y-4">
      {TASK_STATUSES.map((s) => {
        const list = tasks
          .filter((t) => t.status === s.value)
          .sort((a, b) => priorityMeta(b.priority).rank - priorityMeta(a.priority).rank || (a.due ?? '9').localeCompare(b.due ?? '9'))
        if (!list.length) return null
        const isCollapsed = collapsed[s.value]
        return (
          <section key={s.value} className="overflow-hidden rounded-2xl border border-border bg-surface/70">
            <button onClick={() => setCollapsed((c) => ({ ...c, [s.value]: !c[s.value] }))} className="flex w-full items-center gap-2.5 bg-surface-2/40 px-4 py-2.5 text-left">
              <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }}>
                <ChevronRight className="size-3.5 text-subtle" />
              </motion.span>
              <StatusIcon status={s.value} />
              <span className="text-[13px] font-semibold">{s.label}</span>
              <span className="text-xs text-subtle">{list.length}</span>
            </button>
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }} className="overflow-hidden">
                  {list.map((t) => {
                    const p = t.projectId ? projects[t.projectId] : undefined
                    const who = nameOf(t.assigneeId)
                    const tone = dueTone(t.due)
                    return (
                      <motion.div layout key={t.id} className="group flex items-center gap-3 border-t border-border/60 px-4 py-2.5 transition-colors hover:bg-surface-2/50">
                        <Checkbox round checked={t.status === 'done'} onChange={(v) => setTaskStatus(t, v ? 'done' : 'todo')} />
                        <PriorityIcon priority={t.priority} />
                        <button onClick={() => openTask(t.id)} className={cn('min-w-0 flex-1 truncate text-left text-[13.5px]', t.status === 'done' && 'text-subtle line-through')}>
                          {t.title}
                        </button>
                        {p && (
                          <span className="hidden items-center gap-1.5 text-xs text-subtle sm:flex">
                            <Dot hue={p.color} className="size-1.5" />
                            {p.number || p.name}
                          </span>
                        )}
                        {t.due && (
                          <span className={cn('w-20 text-right text-xs', tone === 'overdue' ? 'text-danger' : tone === 'soon' ? 'text-warning' : 'text-subtle')}>{relativeDay(t.due)}</span>
                        )}
                        <Avatar name={who.name} hue={who.hue} size={22} />
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
  )
}
