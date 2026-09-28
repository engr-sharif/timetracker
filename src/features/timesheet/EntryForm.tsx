import { useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Minus, Plus } from 'lucide-react'
import { cn, formatHours } from '@/lib/utils'
import { todayKey } from '@/lib/dates'
import { useSettings, useWorkspace, ws } from '@/store/workspace'
import type { TimeEntry } from '@/store/types'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/field'
import { Kbd, Switch } from '@/components/ui/misc'
import { CostCodePicker, DatePicker, ProjectPicker } from '@/components/ui/pickers'
import { modKey } from '@/lib/utils'

const QUICK = [0.25, 0.5, 1, 2, 4, 8]

export function lastUsedFor(projectId?: string) {
  const entries = Object.values(useWorkspace.getState().doc.tables.entries)
    .filter((e) => !projectId || e.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return entries[0]
}

export function EntryForm({
  entry,
  preset,
  onDone,
}: {
  entry?: TimeEntry
  preset?: Partial<TimeEntry>
  onDone: () => void
}) {
  const settings = useSettings()
  const init = entry ?? preset ?? {}
  const [date, setDate] = useState(init.date ?? todayKey())
  const [projectId, setProjectId] = useState<string | undefined>(init.projectId ?? lastUsedFor()?.projectId)
  const [costCode, setCostCode] = useState(init.costCode ?? (init.projectId || !lastUsedFor() ? '' : lastUsedFor()!.costCode))
  const [hours, setHours] = useState<number>(init.hours ?? 1)
  const [description, setDescription] = useState(init.description ?? '')
  const [billable, setBillable] = useState(init.billable ?? settings.defaultBillable)

  const valid = !!projectId && hours > 0
  const submit = () => {
    if (!valid) {
      toast.error('Pick a project and enter hours')
      return
    }
    const data = { date, projectId: projectId!, costCode, hours, description: description.trim(), billable, taskId: init.taskId }
    if (entry) {
      ws().update('entries', entry.id, data)
      toast.success('Entry updated')
    } else {
      ws().create('entries', data)
      toast.success(`Logged ${formatHours(hours)}h`, { description: description || undefined })
    }
    onDone()
  }

  return (
    <div
      className="space-y-5"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
      }}
    >
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setHours((h) => Math.max(0.25, +(h - 0.25).toFixed(2)))}
            className="grid size-10 place-items-center rounded-full border border-border-strong text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Minus className="size-4" />
          </button>
          <div className="relative w-36 text-center">
            <input
              value={hours}
              type="number"
              step={0.25}
              min={0}
              max={24}
              onChange={(e) => setHours(Math.min(24, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="w-full bg-transparent text-center font-mono text-5xl font-medium tracking-tight tabular outline-none"
            />
            <div className="text-xs text-subtle">hours</div>
          </div>
          <button
            type="button"
            onClick={() => setHours((h) => Math.min(24, +(h + 0.25).toFixed(2)))}
            className="grid size-10 place-items-center rounded-full border border-border-strong text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setHours(q)}
              className={cn(
                'relative h-7 rounded-lg px-2.5 font-mono text-xs transition-colors',
                hours === q ? 'text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
              )}
            >
              {hours === q && <motion.span layoutId="quick-hours" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
              <span className="relative">{q}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <DatePicker value={date} onChange={(d) => d && setDate(d)} clearable={false} />
        <ProjectPicker
          value={projectId}
          allowNone={false}
          onChange={(id) => {
            setProjectId(id)
            setCostCode(lastUsedFor(id)?.costCode ?? '')
          }}
        />
        <CostCodePicker projectId={projectId} value={costCode} onChange={setCostCode} />
      </div>

      <Field label="What did you work on?">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reviewed structural calcs for level 2 transfer beams…" className="min-h-16" />
      </Field>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2.5 text-sm text-muted">
          <Switch checked={billable} onChange={setBillable} label="Billable" />
          Billable
        </label>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-subtle sm:inline">
            <Kbd>{modKey()}</Kbd> <Kbd>↵</Kbd>
          </span>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {entry ? 'Save entry' : 'Log time'}
          </Button>
        </div>
      </div>
    </div>
  )
}
