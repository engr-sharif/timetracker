import { useMemo, useState } from 'react'
import { AnimatePresence, motion, Reorder } from 'motion/react'
import { ClipboardPaste, GripVertical, Lock, LockOpen, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COMMON_COST_CODES } from '@/lib/meta'
import { mergeTasks, parseTaskPaste } from '@/lib/wbs'
import type { TaskCodeMeta } from '@/store/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/misc'
import { Tooltip } from '@/components/ui/popover'

export interface TaskCodesValue {
  costCodes: string[]
  codeMeta: Record<string, TaskCodeMeta>
}

/**
 * Editable table of a project's task codes: code, name, budget, billable, closed.
 * Rows can be reordered by drag, and whole lists pasted from a timesheet or spreadsheet.
 */
export function TaskCodesEditor({
  value,
  onChange,
  projectNumber,
  defaultBillable = true,
}: {
  value: TaskCodesValue
  onChange: (v: TaskCodesValue) => void
  projectNumber?: string
  defaultBillable?: boolean
}) {
  const [pasting, setPasting] = useState(false)
  const [paste, setPaste] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  const preview = useMemo(() => {
    if (!paste.trim()) return []
    const parsed = parseTaskPaste(paste, projectNumber || '__this__')
    // Tasks for this project, or for the only project in the paste.
    const mine = parsed.find((p) => p.number === (projectNumber || '__this__')) ?? (parsed.length === 1 ? parsed[0] : undefined)
    return mine?.tasks ?? []
  }, [paste, projectNumber])

  const setMeta = (code: string, patch: Partial<TaskCodeMeta>) =>
    onChange({ ...value, codeMeta: { ...value.codeMeta, [code]: { ...value.codeMeta[code], ...patch } } })

  const add = (code: string, name?: string) => {
    const c = code.trim()
    if (!c) return
    onChange(mergeTasks(value, [{ code: c, name: name?.trim() || undefined }]))
    setNewCode('')
    setNewName('')
  }

  const remove = (code: string) => {
    const { [code]: _drop, ...rest } = value.codeMeta
    onChange({ costCodes: value.costCodes.filter((c) => c !== code), codeMeta: rest })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
      <div className="grid grid-cols-[20px_110px_1fr_76px_52px_28px_24px] items-center gap-2 border-b border-border px-2 py-1.5 text-[10.5px] font-medium tracking-wide text-subtle uppercase">
        <span />
        <span>Code</span>
        <span>Task name</span>
        <span className="text-right">Budget h</span>
        <span className="text-center">Bill.</span>
        <span />
        <span />
      </div>
      <Reorder.Group axis="y" values={value.costCodes} onReorder={(costCodes) => onChange({ ...value, costCodes })} className="max-h-72 overflow-y-auto">
        <AnimatePresence initial={false}>
          {value.costCodes.map((code) => {
            const meta = value.codeMeta[code] ?? {}
            return (
              <Reorder.Item
                key={code}
                value={code}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={cn('group grid grid-cols-[20px_110px_1fr_76px_52px_28px_24px] items-center gap-2 border-b border-border/50 bg-surface-2/0 px-2 py-1 last:border-b-0', meta.closed && 'opacity-50')}
              >
                <GripVertical className="size-3.5 cursor-grab text-subtle opacity-0 group-hover:opacity-100" />
                <span className="truncate font-mono text-[12.5px]">{code}</span>
                <input
                  value={meta.name ?? ''}
                  onChange={(e) => setMeta(code, { name: e.target.value || undefined })}
                  placeholder="Name this task"
                  className="h-7 min-w-0 rounded-md bg-transparent px-1.5 text-[13px] outline-none placeholder:text-subtle/60 hover:bg-surface-3/50 focus:bg-surface-3/70"
                />
                <input
                  value={meta.budgetHours ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setMeta(code, { budgetHours: Number.isFinite(v) ? v : undefined })
                  }}
                  inputMode="decimal"
                  placeholder="—"
                  className="h-7 w-full rounded-md bg-transparent px-1.5 text-right font-mono text-[12.5px] outline-none placeholder:text-subtle/60 hover:bg-surface-3/50 focus:bg-surface-3/70"
                />
                <div className="flex justify-center">
                  <Switch checked={meta.billable ?? defaultBillable} onChange={(billable) => setMeta(code, { billable })} label="Billable" />
                </div>
                <Tooltip content={meta.closed ? 'Reopen task' : 'Close task (hidden when logging time)'}>
                  <button type="button" onClick={() => setMeta(code, { closed: !meta.closed })} className="grid size-6 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg">
                    {meta.closed ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                  </button>
                </Tooltip>
                <button type="button" onClick={() => remove(code)} className="grid size-6 place-items-center rounded-md text-subtle opacity-0 group-hover:opacity-100 hover:text-danger" aria-label={`Remove ${code}`}>
                  <X className="size-3.5" />
                </button>
              </Reorder.Item>
            )
          })}
        </AnimatePresence>
      </Reorder.Group>

      <div className="grid grid-cols-[20px_110px_1fr_auto] items-center gap-2 border-t border-border bg-surface/40 px-2 py-1.5">
        <Plus className="size-3.5 text-subtle" />
        <input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(newCode, newName)
            }
          }}
          placeholder="01.002"
          className="h-7 min-w-0 rounded-md bg-transparent px-1.5 font-mono text-[12.5px] outline-none placeholder:text-subtle/60 focus:bg-surface-3/70"
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(newCode, newName)
            }
          }}
          placeholder="Task name — Enter to add"
          className="h-7 min-w-0 rounded-md bg-transparent px-1.5 text-[13px] outline-none placeholder:text-subtle/60 focus:bg-surface-3/70"
        />
        <Button type="button" size="xs" variant="ghost" icon={<ClipboardPaste className="size-3.5" />} onClick={() => setPasting((p) => !p)}>
          Paste list
        </Button>
      </div>

      <AnimatePresence>
        {pasting && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border">
            <div className="space-y-2 p-3">
              <textarea
                autoFocus
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={4}
                placeholder={'Paste rows from your timesheet or a spreadsheet, e.g.\n01.001   Project management\n01.002   Design        120\n1234567.02.001 Construction support'}
                className="w-full resize-y rounded-lg border border-border bg-surface/80 p-2.5 font-mono text-[12px] outline-none focus:border-accent/50"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-subtle">{preview.length ? `Found ${preview.length} task${preview.length > 1 ? 's' : ''}` : 'Tab, pipe or 2-space separated rows all work'}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  disabled={!preview.length}
                  onClick={() => {
                    onChange(mergeTasks(value, preview))
                    setPaste('')
                    setPasting(false)
                  }}
                >
                  Add {preview.length || ''} tasks
                </Button>
              </div>
              {preview.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg bg-surface/60 p-2 font-mono text-[11.5px] text-muted">
                  {preview.map((t) => (
                    <div key={t.code} className="flex gap-3">
                      <span className="w-20 shrink-0 text-fg">{t.code}</span>
                      <span className="flex-1 truncate font-sans">{t.name ?? '—'}</span>
                      {t.budgetHours && <span>{t.budgetHours}h</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {value.costCodes.length === 0 && !pasting && (
        <div className="flex flex-wrap gap-1 border-t border-border p-2">
          {COMMON_COST_CODES.map((c) => (
            <button key={c} type="button" onClick={() => add(c)} className="rounded-md border border-dashed border-border-strong px-1.5 py-0.5 text-[11px] text-subtle hover:border-accent/50 hover:text-fg">
              + {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
