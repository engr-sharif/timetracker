import { useMemo } from 'react'
import { toKey, weekDays, weekStart } from '@/lib/dates'
import { useList, useSettings } from '@/store/workspace'

export interface ProjectStats {
  total: number
  week: number
  billable: number
  openTasks: number
  lastLogged?: string
  byCode: Map<string, number>
}

/** Aggregates hours and task counts per project in one pass. */
export function useProjectStats() {
  const entries = useList('entries')
  const tasks = useList('tasks')
  const { weekStartsOn } = useSettings()
  return useMemo(() => {
    const week = new Set(weekDays(weekStart(new Date(), weekStartsOn)).map(toKey))
    const stats = new Map<string, ProjectStats>()
    const get = (id: string) => {
      let s = stats.get(id)
      if (!s) stats.set(id, (s = { total: 0, week: 0, billable: 0, openTasks: 0, byCode: new Map() }))
      return s
    }
    for (const e of entries) {
      const s = get(e.projectId)
      s.total += e.hours
      if (e.billable) s.billable += e.hours
      if (week.has(e.date)) s.week += e.hours
      if (!s.lastLogged || e.date > s.lastLogged) s.lastLogged = e.date
      s.byCode.set(e.costCode || '—', (s.byCode.get(e.costCode || '—') ?? 0) + e.hours)
    }
    for (const t of tasks) if (t.projectId && t.status !== 'done') get(t.projectId).openTasks++
    return stats
  }, [entries, tasks, weekStartsOn])
}
