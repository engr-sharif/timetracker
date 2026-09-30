import type { EventKind, Hue, IdeaStage, Priority, ProjectStatus, TaskStatus } from '@/store/types'

export const TASK_STATUSES: { value: TaskStatus; label: string; hue: Hue }[] = [
  { value: 'backlog', label: 'Backlog', hue: 'slate' },
  { value: 'todo', label: 'To do', hue: 'sky' },
  { value: 'doing', label: 'In progress', hue: 'amber' },
  { value: 'review', label: 'In review', hue: 'violet' },
  { value: 'done', label: 'Done', hue: 'emerald' },
]
export const statusMeta = (s: TaskStatus) => TASK_STATUSES.find((x) => x.value === s)!

export const PRIORITIES: { value: Priority; label: string; hue: Hue; rank: number }[] = [
  { value: 'urgent', label: 'Urgent', hue: 'rose', rank: 4 },
  { value: 'high', label: 'High', hue: 'orange', rank: 3 },
  { value: 'medium', label: 'Medium', hue: 'amber', rank: 2 },
  { value: 'low', label: 'Low', hue: 'sky', rank: 1 },
  { value: 'none', label: 'No priority', hue: 'slate', rank: 0 },
]
export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.value === p)!

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; hue: Hue }[] = [
  { value: 'active', label: 'Active', hue: 'emerald' },
  { value: 'on-hold', label: 'On hold', hue: 'amber' },
  { value: 'complete', label: 'Complete', hue: 'slate' },
]

export const EVENT_KINDS: { value: EventKind; label: string; hue: Hue }[] = [
  { value: 'meeting', label: 'Meeting', hue: 'blue' },
  { value: 'deadline', label: 'Deadline', hue: 'rose' },
  { value: 'site', label: 'Site visit', hue: 'emerald' },
  { value: 'milestone', label: 'Milestone', hue: 'violet' },
  { value: 'personal', label: 'Personal', hue: 'amber' },
]
export const eventMeta = (k: EventKind) => EVENT_KINDS.find((x) => x.value === k)!

export const IDEA_STAGES: { value: IdeaStage; label: string; hint: string; hue: Hue }[] = [
  { value: 'spark', label: 'Spark', hint: 'Raw, unfiltered', hue: 'amber' },
  { value: 'exploring', label: 'Exploring', hint: 'Thinking it through', hue: 'sky' },
  { value: 'building', label: 'Building', hint: 'Turning into work', hue: 'emerald' },
  { value: 'parked', label: 'Parked', hint: 'Not now', hue: 'slate' },
]

export const COMMON_COST_CODES = ['Design', 'Review / QA', 'Meetings', 'Site visit', 'Reports', 'Project management', 'Travel']
