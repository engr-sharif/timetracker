import { emptyDoc } from '@/store/workspace'
import type { Hue, Idea, Project, Task, TimeEntry, WorkspaceDoc } from '@/store/types'
import { uid } from './utils'

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEGACY_COLORS: Record<string, Hue> = {
  cyan: 'teal',
  emerald: 'emerald',
  amber: 'amber',
  violet: 'violet',
  rose: 'rose',
  blue: 'blue',
  orange: 'orange',
  pink: 'pink',
}

/**
 * Converts the v3 TimeTracker data file into a v4 workspace doc.
 * The original v3 gist file is left untouched, so nothing is ever lost.
 */
export function migrateV3(v3: any): WorkspaceDoc {
  const doc = emptyDoc()
  const ts = new Date().toISOString()
  const stamp = (createdAt?: string) => ({ createdAt: createdAt ?? ts, updatedAt: ts })

  for (const p of v3?.projects ?? []) {
    const id = String(p.id ?? uid())
    const project: Project = {
      id,
      ...stamp(),
      number: p.number ?? '',
      name: p.name ?? 'Untitled project',
      client: p.client ?? '',
      color: LEGACY_COLORS[p.color] ?? 'violet',
      status: p.isActive === false ? 'complete' : 'active',
      costCodes: Array.isArray(p.costCodes) ? p.costCodes.map(String) : [],
      budgetHours: v3?.projectBudgets?.[id]?.hours ?? v3?.projectBudgets?.[id] ?? undefined,
    }
    if (typeof project.budgetHours !== 'number') delete project.budgetHours
    doc.tables.projects[id] = project
  }

  for (const e of v3?.timeEntries ?? []) {
    const id = String(e.id ?? uid())
    const tags: string[] = e.tags ?? []
    const entry: TimeEntry = {
      id,
      ...stamp(e.createdAt),
      date: e.date,
      projectId: String(e.projectId ?? ''),
      costCode: e.costCode ?? '',
      hours: Number(e.hours) || 0,
      description: e.description ?? '',
      billable: !tags.includes('nonbillable'),
    }
    if (entry.date) doc.tables.entries[id] = entry
  }

  let order = 0
  for (const n of v3?.notes ?? []) {
    const id = String(n.id ?? uid())
    const projectId = n.projectId && n.projectId !== 'all' ? String(n.projectId) : undefined
    if (n.type === 'action') {
      const task: Task = {
        id,
        ...stamp(n.createdAt),
        title: n.content ?? '',
        notes: '',
        projectId,
        assigneeId: 'me',
        assignedById: 'me',
        status: n.done ? 'done' : 'todo',
        priority: 'none',
        labels: [],
        subtasks: [],
        order: order++,
        completedAt: n.done ? ts : undefined,
      }
      doc.tables.tasks[id] = task
    } else {
      const idea: Idea = {
        id,
        ...stamp(n.createdAt),
        text: n.content ?? '',
        stage: n.done ? 'parked' : 'spark',
        color: n.type === 'decision' ? 'blue' : n.type === 'link' ? 'teal' : 'amber',
        projectId,
        tags: n.type && n.type !== 'idea' ? [n.type] : [],
        pinned: false,
      }
      doc.tables.ideas[id] = idea
    }
  }

  const s = v3?.settings ?? {}
  doc.settings = {
    ...doc.settings,
    weeklyTarget: Number(s.utilizationTarget) || 40,
    billableTarget: Number(s.billableTarget) || 32,
    updatedAt: ts,
  }
  for (const w of v3?.submittedWeeks ?? []) {
    const key = typeof w === 'string' ? w : w?.weekStart
    if (key) doc.submittedWeeks[key] = typeof w === 'object' && w?.submittedAt ? w.submittedAt : ts
  }
  return doc
}

/** Legacy local credentials written by the v3 app, if any. */
export function readLegacyLocal() {
  try {
    const cred = JSON.parse(localStorage.getItem('jtt_credentials_v3') ?? 'null')
    const storage = JSON.parse(localStorage.getItem('jtt_storage_v3') ?? 'null')
    if (!cred?.passwordHash) return null
    return {
      name: cred.name as string,
      employeeId: cred.employeeId as string | undefined,
      avatar: cred.avatar as string | undefined,
      login: cred.login as string | undefined,
      passwordHash: cred.passwordHash as string,
      token: storage?.token as string | undefined,
      gistId: storage?.gistId as string | undefined,
    }
  } catch {
    return null
  }
}
