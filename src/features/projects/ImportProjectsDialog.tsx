import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ClipboardPaste, FolderPlus, RefreshCw } from 'lucide-react'
import { randomHue } from '@/lib/utils'
import { mergeTasks, parseTaskPaste } from '@/lib/wbs'
import { useList, ws } from '@/store/workspace'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge, Dot } from '@/components/ui/misc'

const EXAMPLE = `1234567.01.001   Project management
1234567.01.002   Design
1234567.02.001   Construction support
P-24-0412 - Riverside Bridge
  100   Design
  200   Analysis`

/** Paste a block from a timesheet or project list; creates new projects and adds missing tasks. */
export function ImportProjectsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useList('projects')
  const [text, setText] = useState('')

  const plan = useMemo(() => {
    const parsed = parseTaskPaste(text)
    return parsed.map((p) => {
      const existing = projects.find((x) => x.number.trim().toUpperCase() === p.number.trim().toUpperCase())
      const newTasks = p.tasks.filter((t) => !existing?.costCodes.includes(t.code))
      return { parsed: p, existing, newTasks }
    })
  }, [text, projects])

  const totals = {
    created: plan.filter((p) => !p.existing).length,
    updated: plan.filter((p) => p.existing && p.newTasks.length).length,
    tasks: plan.reduce((s, p) => s + p.newTasks.length, 0),
  }

  const apply = () => {
    for (const { parsed, existing } of plan) {
      if (existing) {
        ws().update('projects', existing.id, (cur) => ({ ...mergeTasks(cur, parsed.tasks), name: cur.name || parsed.name || cur.name }))
      } else {
        const merged = mergeTasks({ costCodes: [], codeMeta: {} }, parsed.tasks)
        ws().create('projects', {
          number: parsed.number,
          name: parsed.name || parsed.number,
          client: '',
          color: randomHue(),
          status: 'active',
          ...merged,
        })
      }
    }
    toast.success('Import complete', {
      description: `${totals.created} new project${totals.created === 1 ? '' : 's'} · ${totals.tasks} task${totals.tasks === 1 ? '' : 's'} added`,
    })
    setText('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import projects & tasks"
      description="Paste rows copied from your timesheet, an Excel export or a project list. Existing projects are matched by number."
      className="max-w-3xl"
      footer={
        <>
          <span className="mr-auto text-xs text-subtle">
            {plan.length ? `${totals.created} new · ${totals.updated} updated · ${totals.tasks} tasks` : 'Nothing to import yet'}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} disabled={!totals.created && !totals.tasks}>
            Import
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            className="min-h-72 flex-1 resize-none rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-accent/50 focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                setText(await navigator.clipboard.readText())
              } catch {
                toast.error('Clipboard access was blocked — paste with Ctrl/⌘ V instead')
              }
            }}
            className="flex items-center gap-1.5 self-start text-xs text-accent-strong hover:underline"
          >
            <ClipboardPaste className="size-3.5" /> Paste from clipboard
          </button>
        </div>
        <div className="min-h-72 overflow-y-auto rounded-xl border border-border bg-surface/60 p-2">
          {plan.length === 0 && <p className="grid h-full place-items-center p-6 text-center text-sm text-subtle">A live preview of what will be imported appears here.</p>}
          <AnimatePresence initial={false}>
            {plan.map(({ parsed, existing, newTasks }) => (
              <motion.div key={parsed.number} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 rounded-lg bg-surface-2/60 p-2.5">
                <div className="flex items-center gap-2">
                  {existing ? <Dot hue={existing.color} /> : <FolderPlus className="size-3.5 text-accent-strong" />}
                  <span className="font-mono text-[12.5px] font-semibold">{parsed.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{existing?.name ?? parsed.name}</span>
                  {existing ? (
                    <Badge hue="sky">
                      <RefreshCw className="size-3" /> Update
                    </Badge>
                  ) : (
                    <Badge hue="emerald">New</Badge>
                  )}
                </div>
                <div className="mt-1.5 space-y-0.5 pl-5">
                  {parsed.tasks.map((t) => {
                    const isNew = newTasks.includes(t)
                    return (
                      <div key={t.code} className={`flex gap-3 text-[11.5px] ${isNew ? '' : 'opacity-40'}`}>
                        <span className="w-24 shrink-0 font-mono">{t.code}</span>
                        <span className="flex-1 truncate">{t.name ?? '—'}</span>
                        {!isNew && <span className="text-subtle">exists</span>}
                      </div>
                    )
                  })}
                  {parsed.tasks.length === 0 && <div className="text-[11.5px] text-subtle">No tasks found under this project</div>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </Dialog>
  )
}
