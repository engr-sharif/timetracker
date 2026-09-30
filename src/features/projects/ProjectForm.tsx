import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { COMMON_COST_CODES, PROJECT_STATUSES } from '@/lib/meta'
import { randomHue } from '@/lib/utils'
import { ws } from '@/store/workspace'
import type { Hue, Project, ProjectStatus } from '@/store/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { HuePicker, Segmented } from '@/components/ui/misc'

export function ProjectFormDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: Project; onSaved?: (p: Project) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} description={project ? undefined : 'Project numbers and cost codes power your timesheet.'} className="max-w-xl">
      <ProjectForm project={project} onDone={(p) => { onSaved?.(p); onClose() }} />
    </Dialog>
  )
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: (p: Project) => void }) {
  const [number, setNumber] = useState(project?.number ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [color, setColor] = useState<Hue>(project?.color ?? randomHue())
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'active')
  const [codes, setCodes] = useState<string[]>(project?.costCodes ?? [])
  const [codeInput, setCodeInput] = useState('')
  const [budget, setBudget] = useState(project?.budgetHours?.toString() ?? '')
  const [manager, setManager] = useState(project?.manager ?? '')
  const [location, setLocation] = useState(project?.location ?? '')
  const [description, setDescription] = useState(project?.description ?? '')

  const addCodes = (raw: string) => {
    const next = raw.split(/[,\n]/).map((c) => c.trim()).filter(Boolean)
    if (next.length) setCodes((c) => [...new Set([...c, ...next])])
    setCodeInput('')
  }

  const submit = () => {
    if (!name.trim()) return
    const data = {
      number: number.trim(),
      name: name.trim(),
      client: client.trim(),
      color,
      status,
      costCodes: codeInput.trim() ? [...new Set([...codes, codeInput.trim()])] : codes,
      budgetHours: budget ? Number(budget) : undefined,
      manager: manager.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
    }
    let saved: Project
    if (project) {
      ws().update('projects', project.id, data)
      saved = { ...project, ...data }
      toast.success('Project updated')
    } else {
      saved = ws().create('projects', data)
      toast.success('Project created', { description: `${data.number} ${data.name}` })
    }
    onDone(saved)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[140px_1fr] gap-3">
        <Field label="Project number">
          <Input autoFocus value={number} onChange={(e) => setNumber(e.target.value)} placeholder="P-25-0001" className="font-mono" />
        </Field>
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Bridge Rehab" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="County DOT" />
        </Field>
        <Field label="Budget (hours)">
          <Input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Optional" inputMode="decimal" />
        </Field>
      </div>
      <Field label="Cost codes" hint="Press Enter or comma to add. These show up when logging time.">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-surface-2/60 p-1.5 focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <AnimatePresence initial={false}>
            {codes.map((c) => (
              <motion.span
                key={c}
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-surface-3 pr-1 pl-2 font-mono text-[12px]"
              >
                {c}
                <button type="button" onClick={() => setCodes((x) => x.filter((y) => y !== c))} className="text-subtle hover:text-fg">
                  <X className="size-3" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          <input
            value={codeInput}
            onChange={(e) => (e.target.value.endsWith(',') ? addCodes(e.target.value) : setCodeInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCodes(codeInput)
              } else if (e.key === 'Backspace' && !codeInput && codes.length) setCodes((c) => c.slice(0, -1))
            }}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text')
              if (/[,\n]/.test(t)) {
                e.preventDefault()
                addCodes(t)
              }
            }}
            placeholder={codes.length ? '' : '100 Design, 200 Analysis…'}
            className="h-6 min-w-32 flex-1 bg-transparent px-1 font-mono text-[12.5px] outline-none"
          />
        </div>
        {COMMON_COST_CODES.some((c) => !codes.includes(c)) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {COMMON_COST_CODES.filter((c) => !codes.includes(c)).map((c) => (
              <button key={c} type="button" onClick={() => setCodes((x) => [...x, c])} className="rounded-md border border-dashed border-border-strong px-1.5 py-0.5 text-[11px] text-subtle hover:border-accent/50 hover:text-fg">
                + {c}
              </button>
            ))}
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project manager">
          <Input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Scope, key contacts, anything worth remembering" className="min-h-16" />
      </Field>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label="Colour">
          <HuePicker value={color} onChange={setColor} />
        </Field>
        <Field label="Status">
          <Segmented value={status} onChange={setStatus} size="xs" options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        </Field>
      </div>
      <div className="flex justify-end border-t border-border pt-4">
        <Button variant="primary" onClick={submit} disabled={!name.trim()}>
          {project ? 'Save changes' : 'Create project'}
        </Button>
      </div>
    </div>
  )
}
