/**
 * Domain model. Every record carries id + timestamps so the sync engine can
 * merge per-record (last-writer-wins) across devices.
 */

export interface BaseRecord {
  id: string
  createdAt: string
  updatedAt: string
}

export type Hue =
  | 'violet'
  | 'blue'
  | 'sky'
  | 'teal'
  | 'emerald'
  | 'lime'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'pink'
  | 'slate'

export type ProjectStatus = 'active' | 'on-hold' | 'complete'

/** Per-task details for a project's task/cost codes (keyed by code). */
export interface TaskCodeMeta {
  name?: string
  budgetHours?: number
  billable?: boolean
  closed?: boolean
}

export interface Project extends BaseRecord {
  number: string
  name: string
  client: string
  color: Hue
  status: ProjectStatus
  /** Task / cost codes in display order, e.g. "01.002". Entries reference these by value. */
  costCodes: string[]
  codeMeta?: Record<string, TaskCodeMeta>
  budgetHours?: number
  description?: string
  location?: string
  manager?: string
}

export interface TimeEntry extends BaseRecord {
  date: string // yyyy-MM-dd
  projectId: string
  costCode: string
  hours: number
  description: string
  billable: boolean
  taskId?: string
}

export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done'
export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task extends BaseRecord {
  title: string
  notes: string
  projectId?: string
  /** 'me' or a Person id */
  assigneeId: string
  /** who created / delegated the task — 'me' or a Person id */
  assignedById: string
  status: TaskStatus
  priority: Priority
  due?: string // yyyy-MM-dd
  labels: string[]
  subtasks: Subtask[]
  order: number
  completedAt?: string
}

export interface Person extends BaseRecord {
  name: string
  email?: string
  role?: string
  company?: string
  color: Hue
}

export type EventKind = 'meeting' | 'deadline' | 'site' | 'milestone' | 'personal'

export interface CalendarEvent extends BaseRecord {
  title: string
  date: string
  start?: string // HH:mm
  end?: string
  kind: EventKind
  projectId?: string
  notes?: string
}

export interface Note extends BaseRecord {
  title: string
  icon: string
  /** TipTap JSON document */
  content: unknown
  /** Plain text mirror for search + previews */
  text: string
  projectId?: string
  pinned: boolean
  tags: string[]
}

export type IdeaStage = 'spark' | 'exploring' | 'building' | 'parked'

export interface Idea extends BaseRecord {
  text: string
  stage: IdeaStage
  color: Hue
  projectId?: string
  tags: string[]
  pinned: boolean
}

export interface Board extends BaseRecord {
  name: string
  projectId?: string
  /** Serialized Excalidraw elements + minimal app state */
  scene: { elements: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }
  thumbnail?: string // data URL (small SVG)
}

export interface Channel extends BaseRecord {
  name: string
  topic: string
  projectId?: string
  memberIds: string[]
  archived: boolean
}

export interface Message extends BaseRecord {
  channelId: string
  authorId: string // 'me' | Person id
  body: string
  parentId?: string
  reactions: Record<string, string[]> // emoji → author ids
  attachmentIds: string[]
  pinned: boolean
  editedAt?: string
}

export interface FileMeta extends BaseRecord {
  name: string
  size: number
  type: string
  projectId?: string
  folder: string
  starred: boolean
  /** true when the blob has also been uploaded to the sync backend */
  synced?: boolean
}

export interface Snippet extends BaseRecord {
  title: string
  body: string
  tags: string[]
  uses: number
}

export interface Collections {
  projects: Project
  entries: TimeEntry
  tasks: Task
  people: Person
  events: CalendarEvent
  notes: Note
  ideas: Idea
  boards: Board
  channels: Channel
  messages: Message
  files: FileMeta
  snippets: Snippet
}

export type CollectionName = keyof Collections

export const COLLECTIONS: CollectionName[] = [
  'projects',
  'entries',
  'tasks',
  'people',
  'events',
  'notes',
  'ideas',
  'boards',
  'channels',
  'messages',
  'files',
  'snippets',
]

export type Tables = { [K in CollectionName]: Record<string, Collections[K]> }

export interface WorkSettings {
  weeklyTarget: number
  billableTarget: number
  weekStartsOn: 0 | 1
  defaultBillable: boolean
  updatedAt: string
}

export interface WorkspaceDoc {
  version: 4
  tables: Tables
  /** id → deletedAt ISO */
  tombstones: Record<string, string>
  settings: WorkSettings
  submittedWeeks: Record<string, string> // weekStart → submittedAt
}

/** Shape of a new record before ids/timestamps are assigned. */
export type Draft<T extends BaseRecord> = Omit<T, keyof BaseRecord> & Partial<Pick<T, 'id'>>
