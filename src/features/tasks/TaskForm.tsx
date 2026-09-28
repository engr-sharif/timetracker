import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { modKey } from '@/lib/utils'
import { useWorkspace, ws } from '@/store/workspace'
import type { Priority, Task, TaskStatus } from '@/store/types'
import { Button } from '@/components/ui/button'
import { Textarea, TitleInput } from '@/components/ui/field'
import { Kbd, Switch } from '@/components/ui/misc'
import { DatePicker, PersonPicker, PriorityPicker, ProjectPicker, StatusPicker } from '@/components/ui/pickers'
import { useUI } from '@/store/ui'

export function nextOrder(status: TaskStatus) {
  const tasks = Object.values(useWorkspace.getState().doc.tables.tasks).filter((t) => t.status === status)
  return tasks.length ? Math.min(...tasks.map((t) => t.order)) - 1 : 0
}

export function TaskForm({ preset, onDone }: { preset?: Partial<Task>; onDone: () => void }) {
  const [title, setTitle] = useState(preset?.title ?? '')
  const [notes, setNotes] = useState(preset?.notes ?? '')
  const [status, setStatus] = useState<TaskStatus>(preset?.status ?? 'todo')
  const [priority, setPriority] = useState<Priority>(preset?.priority ?? 'none')
  const [assigneeId, setAssigneeId] = useState(preset?.assigneeId ?? 'me')
  const [projectId, setProjectId] = useState(preset?.projectId)
  const [due, setDue] = useState(preset?.due)
  const [more, setMore] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    if (!title.trim()) return
    const task = ws().create('tasks', {
      title: title.trim(),
      notes,
      status,
      priority,
      assigneeId,
      assignedById: 'me',
      projectId,
      due,
      labels: [],
      subtasks: [],
      order: nextOrder(status),
      completedAt: status === 'done' ? new Date().toISOString() : undefined,
    })
    toast.success(assigneeId === 'me' ? 'Task created' : 'Task assigned', {
      description: task.title,
      action: { label: 'Open', onClick: () => useUI.getState().openTask(task.id) },
    })
    if (more) {
      setTitle('')
      setNotes('')
      titleRef.current?.focus()
    } else onDone()
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
      }}
    >
      <TitleInput
        ref={titleRef}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Task title"
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add details, context, links…"
        className="mt-2 min-h-14 border-transparent bg-transparent px-0 hover:border-transparent focus:border-transparent focus:bg-transparent focus:shadow-none"
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusPicker value={status} onChange={setStatus} />
        <PriorityPicker value={priority} onChange={setPriority} />
        <PersonPicker value={assigneeId} onChange={setAssigneeId} />
        <ProjectPicker value={projectId} onChange={setProjectId} />
        <DatePicker value={due} onChange={setDue} />
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <Switch checked={more} onChange={setMore} label="Create more" />
          Create more
        </label>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-subtle sm:inline">
            <Kbd>{modKey()}</Kbd> <Kbd>↵</Kbd>
          </span>
          <Button variant="primary" onClick={submit} disabled={!title.trim()}>
            {assigneeId === 'me' ? 'Create task' : 'Assign task'}
          </Button>
        </div>
      </div>
    </div>
  )
}
