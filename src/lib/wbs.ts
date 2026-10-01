import type { Project, TaskCodeMeta } from '@/store/types'

/**
 * Work-breakdown helpers. A project has an ordered list of task codes
 * (`costCodes`) plus optional metadata per code (`codeMeta`).
 */

export function codeName(project: Project | undefined, code: string) {
  return project?.codeMeta?.[code]?.name
}

/** "01.002 · Design review" — or just the code when it has no name. */
export function taskLabel(project: Project | undefined, code: string) {
  const name = codeName(project, code)
  return name ? `${code} · ${name}` : code
}

export function isBillable(project: Project | undefined, code: string, fallback: boolean) {
  return project?.codeMeta?.[code]?.billable ?? fallback
}

export function openCodes(project: Project | undefined) {
  if (!project) return []
  return project.costCodes.filter((c) => !project.codeMeta?.[c]?.closed)
}

/* ------------------------------------------------------------------ */
/*  Paste parser                                                       */
/* ------------------------------------------------------------------ */

export interface ParsedTask {
  code: string
  name?: string
  budgetHours?: number
}

export interface ParsedProject {
  number: string
  name?: string
  tasks: ParsedTask[]
}

/** Project numbers: 1234567, P-24-0412, OH-0000, 24-0412, ABC1234 … (must contain 3+ digits). */
const PROJECT_RE = /^(?:[A-Z]{1,4}-?)?\d[\dA-Z]*(?:-[\dA-Z]+)*$/i
/** Task codes: 01, 01.002, 100, 1.2.3, 02-A, 3000 … */
const TASK_RE = /^[\dA-Z]{1,6}(?:[.\-][\dA-Z]{1,6}){0,4}$/i
/** A combined "PROJECT.TASK" token such as 1234567.01.002 or P-24-0412.100 */
const COMBINED_RE = /^((?:[A-Z]{1,4}-?)?\d{3,}[\dA-Z]*(?:-[\dA-Z]+)*)[./:](\d[\dA-Z]*(?:[.\-][\dA-Z]+)*)$/i

const digits = (s: string) => (s.match(/\d/g) ?? []).length
const isNumber = (s: string) => /^-?\d+(?:[.,]\d+)?h?$/i.test(s)
const looksProject = (s: string) => PROJECT_RE.test(s) && digits(s) >= 3 && s.length >= 4
const looksTask = (s: string) => TASK_RE.test(s) && /\d/.test(s)
/** Small decimals like 0.5, 7.25 or 8 are hours, not task codes (01.002 and 100 are codes). */
const hoursLike = (s: string) => /^\d{1,2}(?:[.,]\d{1,2})?h?$/i.test(s) && !/^0\d/.test(s) && parseFloat(s.replace(',', '.')) <= 24

function cellsOf(line: string) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
  if (line.includes('|')) return line.split('|').map((c) => c.trim())
  // "code  name" (2+ spaces) or "code - name"
  return line
    .split(/\s{2,}|\s+[–—-]\s+/)
    .map((c) => c.trim())
}

/**
 * Parses text pasted from a timesheet, spreadsheet or project list into projects and tasks.
 * Understands tab/pipe separated rows, "PROJECT.TASK name" tokens, and project header lines
 * followed by indented task lines. `defaultProject` receives task-only lines.
 */
export function parseTaskPaste(text: string, defaultProject?: string): ParsedProject[] {
  const out = new Map<string, ParsedProject>()
  const get = (number: string, name?: string) => {
    const key = number.toUpperCase()
    let p = out.get(key)
    if (!p) out.set(key, (p = { number, name, tasks: [] }))
    else if (name && !p.name) p.name = name
    return p
  }
  let current: string | undefined = defaultProject

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^(project|task|code|total|week|date)\b/i.test(line) && !/\d{3,}/.test(line)) continue

    let cells = cellsOf(line).filter(Boolean)
    // A leading token like "1234567.01.002 Design" packed into one cell.
    const first = cells[0]?.split(/\s+/)[0] ?? ''
    if (cells.length === 1 && first !== cells[0]) cells = [first, cells[0].slice(first.length).trim()]

    let project: string | undefined
    let code: string | undefined
    const names: string[] = []
    const numbers: number[] = []

    for (const cell of cells) {
      const token = cell.split(/\s+/)[0]
      const combined = token.match(COMBINED_RE)
      if (!project && !code && combined) {
        project = combined[1]
        code = combined[2]
        const rest = cell.slice(token.length).trim()
        if (rest) names.push(rest)
      } else if (!project && looksProject(cell) && !(current && looksTask(cell) && cell.length <= 6)) {
        project = cell
      } else if (!code && looksTask(cell) && !hoursLike(cell) && numbers.length === 0) {
        code = cell
      } else if (isNumber(cell)) {
        numbers.push(parseFloat(cell.replace(',', '.')))
      } else if (/[A-Za-z]/.test(cell)) {
        names.push(cell)
      }
    }

    if (project && !code) {
      // Header line: sets the project for the following task lines.
      current = project
      get(project, names.join(' – ') || undefined)
      continue
    }
    const target = project ?? current
    if (!code || !target) continue
    const p = get(target, project && names.length > 1 ? names[0] : undefined)
    if (project && names.length > 1) names.shift()
    const name = names.join(' – ') || undefined
    const existing = p.tasks.find((t) => t.code === code)
    const budget = numbers.length === 1 && numbers[0] > 24 ? numbers[0] : undefined
    if (existing) {
      existing.name ??= name
    } else {
      p.tasks.push({ code, name, budgetHours: budget })
    }
  }
  return [...out.values()].filter((p) => p.tasks.length || p.name)
}

/** Merges parsed tasks into a project, keeping existing metadata unless new data fills a gap. */
export function mergeTasks(project: Pick<Project, 'costCodes' | 'codeMeta'>, tasks: ParsedTask[]) {
  const costCodes = [...project.costCodes]
  const codeMeta: Record<string, TaskCodeMeta> = { ...(project.codeMeta ?? {}) }
  for (const t of tasks) {
    if (!costCodes.includes(t.code)) costCodes.push(t.code)
    const prev = codeMeta[t.code] ?? {}
    codeMeta[t.code] = {
      ...prev,
      name: prev.name || t.name,
      budgetHours: prev.budgetHours ?? t.budgetHours,
    }
  }
  return { costCodes: sortCodes(costCodes), codeMeta }
}

/** Natural sort so 01.010 comes after 01.002 and 100 after 20. */
export function sortCodes(codes: string[]) {
  return [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}
