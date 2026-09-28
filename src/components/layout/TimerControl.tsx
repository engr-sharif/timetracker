import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Pause, Play, Square, Trash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatClock, msToQuarterHours } from '@/lib/dates'
import { elapsedOf, useTimer } from '@/store/timer'
import { useUI } from '@/store/ui'
import { useRecord } from '@/store/workspace'
import { Popover, Tooltip } from '@/components/ui/popover'
import { CostCodePicker, ProjectPicker } from '@/components/ui/pickers'
import { Dot } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

export function useTicker(active: boolean, ms = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [active, ms])
}

export function stopTimerToCapture() {
  const done = useTimer.getState().stop()
  if (!done) return
  useUI.getState().openCapture('time', {
    hours: msToQuarterHours(done.elapsed),
    projectId: done.projectId,
    costCode: done.costCode,
    description: done.description,
    taskId: done.taskId,
  })
}

export function TimerControl({ compact }: { compact?: boolean }) {
  const { timer, start, pause, resume, patch, discard } = useTimer()
  useTicker(!!timer && !timer.paused)
  const project = useRecord('projects', timer?.projectId)
  const elapsed = elapsedOf(timer)

  if (!timer) {
    return compact ? (
      <Tooltip content="Start timer" placement="right">
        <button onClick={() => start()} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
          <Play className="size-4" />
        </button>
      </Tooltip>
    ) : (
      <button
        onClick={() => start()}
        className="group flex h-10 w-full items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-3 text-[13px] text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg"
      >
        <span className="grid size-6 place-items-center rounded-full bg-surface-3 transition-colors group-hover:bg-accent group-hover:text-accent-fg">
          <Play className="size-3 translate-x-px" fill="currentColor" />
        </span>
        Start a timer
        <span className="ml-auto text-[11px] text-subtle">T</span>
      </button>
    )
  }

  const face = (
    <div className="relative flex items-center gap-2">
      <span className="relative flex size-2">
        {!timer.paused && <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />}
        <span className={cn('relative inline-flex size-2 rounded-full', timer.paused ? 'bg-warning' : 'bg-accent')} />
      </span>
      <span className="font-mono text-[13px] font-medium tabular">{formatClock(elapsed)}</span>
    </div>
  )

  if (compact) {
    return (
      <Tooltip content={project?.name ?? 'Timer running'} placement="right">
        <button onClick={stopTimerToCapture} className="flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 hover:bg-surface-2">
          {face}
        </button>
      </Tooltip>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border border-accent/25 bg-accent-soft p-2.5"
    >
      <div className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-accent/25 blur-2xl" />
      <Popover
        placement="top-start"
        className="w-72 p-3"
        trigger={
          <button className="relative w-full text-left">
            <div className="flex items-center justify-between">
              {face}
              <span className="text-[11px] text-subtle">{timer.paused ? 'Paused' : 'Running'}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
              {project ? <Dot hue={project.color} /> : null}
              <span className="truncate">{timer.description || project?.name || 'What are you working on?'}</span>
            </div>
          </button>
        }
      >
        <div className="space-y-2.5">
          <Input
            autoFocus
            placeholder="What are you working on?"
            value={timer.description}
            onChange={(e) => patch({ description: e.target.value })}
          />
          <div className="flex flex-wrap gap-1.5">
            <ProjectPicker value={timer.projectId} onChange={(projectId) => patch({ projectId, costCode: undefined })} />
            <CostCodePicker projectId={timer.projectId} value={timer.costCode} onChange={(costCode) => patch({ costCode })} />
          </div>
          <Button variant="ghost" size="xs" icon={<Trash className="size-3.5" />} onClick={discard} className="text-danger">
            Discard timer
          </Button>
        </div>
      </Popover>
      <div className="relative mt-2 flex gap-1.5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.button
            key={timer.paused ? 'resume' : 'pause'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={timer.paused ? resume : pause}
            className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface/70 text-xs font-medium text-fg hover:bg-surface"
          >
            {timer.paused ? <Play className="size-3" fill="currentColor" /> : <Pause className="size-3" fill="currentColor" />}
            {timer.paused ? 'Resume' : 'Pause'}
          </motion.button>
        </AnimatePresence>
        <button
          onClick={stopTimerToCapture}
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-semibold text-accent-fg hover:bg-accent-strong"
        >
          <Square className="size-3" fill="currentColor" /> Stop & log
        </button>
      </div>
    </motion.div>
  )
}
