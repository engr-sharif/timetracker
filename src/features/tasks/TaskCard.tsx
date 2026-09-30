import { forwardRef, type HTMLAttributes } from 'react'
import { CalendarDays, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dueTone, relativeDay } from '@/lib/dates'
import type { Project, Task } from '@/store/types'
import { Avatar, Dot } from '@/components/ui/misc'
import { PriorityIcon, StatusIcon } from '@/components/ui/icons'
import { usePersonName } from '@/components/ui/pickers'

export const TaskCard = forwardRef<
  HTMLDivElement,
  { task: Task; project?: Project; overlay?: boolean; dragging?: boolean } & HTMLAttributes<HTMLDivElement>
>(function TaskCard({ task, project, overlay, dragging, className, ...rest }, ref) {
  const nameOf = usePersonName()
  const who = nameOf(task.assigneeId)
  const tone = dueTone(task.due)
  const done = task.subtasks.filter((s) => s.done).length
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        'group relative cursor-grab touch-none rounded-xl border border-border bg-surface p-3 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1)] transition-[border-color,box-shadow,opacity]',
        'hover:border-border-strong active:cursor-grabbing',
        dragging && 'opacity-30',
        overlay && 'rotate-[2deg] cursor-grabbing border-accent/40 shadow-float ring-1 ring-accent/20',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          <StatusIcon status={task.status} />
        </span>
        <div className={cn('min-w-0 flex-1 text-[13.5px] leading-snug font-[450]', task.status === 'done' && 'text-subtle line-through')}>{task.title}</div>
      </div>
      {(project || task.labels.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
          {project && (
            <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              <Dot hue={project.color} className="size-1.5" />
              <span className="truncate">{project.number || project.name}</span>
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-subtle">
              #{l}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2.5 pl-6 text-[11.5px] text-subtle">
        <PriorityIcon priority={task.priority} />
        {task.due && (
          <span className={cn('flex items-center gap-1', tone === 'overdue' && 'text-danger', tone === 'soon' && 'text-warning')}>
            <CalendarDays className="size-3" />
            {relativeDay(task.due)}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className={cn('flex items-center gap-1', done === task.subtasks.length && 'text-success')}>
            <ListChecks className="size-3" />
            {done}/{task.subtasks.length}
          </span>
        )}
        <span className="ml-auto">
          <Avatar name={who.name} hue={who.hue} size={20} />
        </span>
      </div>
    </div>
  )
})
