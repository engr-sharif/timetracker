import { useState } from 'react'
import { AnimatePresence, motion, Reorder } from 'motion/react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Clock, GripVertical, Plus, Trash, X } from 'lucide-react'
import { uid } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { useUI } from '@/store/ui'
import { useList, useRecord, ws } from '@/store/workspace'
import type { Subtask, Task } from '@/store/types'
import { Dialog, confirm } from '@/components/ui/dialog'
import { Button, IconButton } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/misc'
import { DatePicker, PersonPicker, PriorityPicker, ProjectPicker, StatusPicker, usePersonName } from '@/components/ui/pickers'
import { useTimer } from '@/store/timer'

export function TaskSheetHost() {
  const taskId = useUI((s) => s.taskId)
  const openTask = useUI((s) => s.openTask)
  const task = useRecord('tasks', taskId ?? undefined)
  const [last, setLast] = useState<Task | undefined>()
  if (task && task !== last) setLast(task)
  const shown = task ?? last
  return (
    <Dialog open={!!task} onClose={() => openTask(null)} variant="sheet" hideClose className="max-w-[560px]">
      {shown && <TaskDetail task={shown} onClose={() => openTask(null)} />}
    </Dialog>
  )
}

export function setTaskStatus(task: Task, status: Task['status']) {
  ws().update('tasks', task.id, {
    status,
    completedAt: status === 'done' ? new Date().toISOString() : undefined,
  })
}

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const update = (patch: Partial<Task>) => ws().update('tasks', task.id, patch)
  const [newSub, setNewSub] = useState('')
  const nameOf = usePersonName()
  const entries = useList('entries')
  const logged = entries.filter((e) => e.taskId === task.id).reduce((s, e) => s + e.hours, 0)
  const startTimer = useTimer((s) => s.start)
  const doneCount = task.subtasks.filter((s) => s.done).length

  const addSub = () => {
    if (!newSub.trim()) return
    update({ subtasks: [...task.subtasks, { id: uid(), title: newSub.trim(), done: false }] })
    setNewSub('')
  }
  const patchSub = (id: string, patch: Partial<Subtask>) =>
    update({ subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this task?', body: task.title, confirmLabel: 'Delete', danger: true }))) return
    const removed = ws().remove('tasks', task.id)
    onClose()
    toast('Task deleted', { action: { label: 'Undo', onClick: () => ws().restore('tasks', removed) } })
  }

  return (
    <div className="-mx-5 -my-4 flex min-h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Checkbox round size={20} checked={task.status === 'done'} onChange={(v) => setTaskStatus(task, v ? 'done' : 'todo')} />
        <span className="text-xs text-subtle">
          Created {timeAgo(task.createdAt)} by {nameOf(task.assignedById).me ? 'you' : nameOf(task.assignedById).name}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Start timer for this task"
            onClick={() => {
              startTimer({ projectId: task.projectId, description: task.title, taskId: task.id })
              toast.success('Timer started', { description: task.title })
            }}
          >
            <Clock />
          </IconButton>
          <IconButton label="Delete task" onClick={remove}>
            <Trash />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 space-y-6 px-5 py-5">
        <textarea
          value={task.title}
          onChange={(e) => update({ title: e.target.value.replace(/\n/g, ' ') })}
          rows={1}
          className="field-sizing-content w-full resize-none bg-transparent text-xl font-semibold tracking-tight outline-none"
        />

        <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
          <span className="text-subtle">Status</span>
          <div>
            <StatusPicker value={task.status} onChange={(s) => setTaskStatus(task, s)} />
          </div>
          <span className="text-subtle">Priority</span>
          <div>
            <PriorityPicker value={task.priority} onChange={(priority) => update({ priority })} />
          </div>
          <span className="text-subtle">Assignee</span>
          <div>
            <PersonPicker value={task.assigneeId} onChange={(assigneeId) => update({ assigneeId })} />
          </div>
          <span className="text-subtle">Assigned by</span>
          <div>
            <PersonPicker value={task.assignedById} onChange={(assignedById) => update({ assignedById })} label="Assigned by" />
          </div>
          <span className="text-subtle">Project</span>
          <div>
            <ProjectPicker value={task.projectId} onChange={(projectId) => update({ projectId })} />
          </div>
          <span className="text-subtle">Due</span>
          <div>
            <DatePicker value={task.due} onChange={(due) => update({ due })} />
          </div>
          {logged > 0 && (
            <>
              <span className="text-subtle">Time logged</span>
              <span className="font-mono">{logged}h</span>
            </>
          )}
        </div>

        <div>
          <div className="mb-2 text-[12.5px] font-medium text-muted">Notes</div>
          <Textarea value={task.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Context, decisions, links…" className="min-h-28" />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] font-medium text-muted">Subtasks</span>
            {task.subtasks.length > 0 && (
              <span className="text-xs text-subtle tabular">
                {doneCount}/{task.subtasks.length}
              </span>
            )}
          </div>
          {task.subtasks.length > 0 && (
            <div className="mb-2 h-1 overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(doneCount / task.subtasks.length) * 100}%` }} />
            </div>
          )}
          <Reorder.Group axis="y" values={task.subtasks} onReorder={(subtasks) => update({ subtasks })} className="space-y-0.5">
            <AnimatePresence initial={false}>
              {task.subtasks.map((s) => (
                <Reorder.Item
                  key={s.id}
                  value={s}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2"
                >
                  <GripVertical className="size-3.5 cursor-grab text-subtle opacity-0 group-hover:opacity-100" />
                  <Checkbox checked={s.done} onChange={(done) => patchSub(s.id, { done })} size={16} />
                  <input
                    value={s.title}
                    onChange={(e) => patchSub(s.id, { title: e.target.value })}
                    className={`flex-1 bg-transparent text-[13.5px] outline-none ${s.done ? 'text-subtle line-through' : ''}`}
                  />
                  <button
                    onClick={() => update({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}
                    className="text-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </Reorder.Item>
              ))}
            </AnimatePresence>
          </Reorder.Group>
          <div className="mt-1 flex items-center gap-2 px-1">
            <Plus className="ml-5 size-4 text-subtle" />
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              placeholder="Add a subtask"
              className="h-8 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
            />
          </div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3 text-[11.5px] text-subtle">
        Updated {format(new Date(task.updatedAt), "MMM d 'at' h:mm a")}
        {task.completedAt && ` · Completed ${timeAgo(task.completedAt)}`}
        <Button variant="ghost" size="xs" className="float-right -mt-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
