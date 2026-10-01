import { useState } from 'react'
import { toast } from 'sonner'
import { PROJECT_STATUSES } from '@/lib/meta'
import { randomHue } from '@/lib/utils'
import { ws } from '@/store/workspace'
import type { Hue, Project, ProjectStatus } from '@/store/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { HuePicker, Segmented } from '@/components/ui/misc'
import { TaskCodesEditor, type TaskCodesValue } from './TaskCodesEditor'

export function ProjectFormDialog({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: Project; onSaved?: (p: Project) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'} description={project ? undefined : 'Project numbers and cost codes power your timesheet.'} className="max-w-2xl">
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
  const [tasks, setTasks] = useState<TaskCodesValue>({ costCodes: project?.costCodes ?? [], codeMeta: project?.codeMeta ?? {} })
  const [budget, setBudget] = useState(project?.budgetHours?.toString() ?? '')
  const [manager, setManager] = useState(project?.manager ?? '')
  const [location, setLocation] = useState(project?.location ?? '')
  const [description, setDescription] = useState(project?.description ?? '')

  const submit = () => {
    if (!name.trim()) return
    const data = {
      number: number.trim(),
      name: name.trim(),
      client: client.trim(),
      color,
      status,
      costCodes: tasks.costCodes,
      codeMeta: tasks.codeMeta,
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
      <Field label="Tasks / cost codes" hint="These appear when logging time. Paste straight from your timesheet to add many at once.">
        <TaskCodesEditor value={tasks} onChange={setTasks} projectNumber={number.trim() || undefined} />
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
