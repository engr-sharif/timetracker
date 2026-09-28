import {
  addDays,
  differenceInCalendarDays,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfWeek,
} from 'date-fns'

/** ISO calendar date (local) → 'yyyy-MM-dd' */
export const toKey = (d: Date) => format(d, 'yyyy-MM-dd')
export const todayKey = () => toKey(new Date())
export const fromKey = (k: string) => parseISO(k)

export function weekStart(d: Date, weekStartsOn: 0 | 1 = 1) {
  return startOfWeek(d, { weekStartsOn })
}

export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function weekKey(d: Date, weekStartsOn: 0 | 1 = 1) {
  return toKey(weekStart(d, weekStartsOn))
}

export function relativeDay(key: string) {
  const d = fromKey(key)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  const diff = differenceInCalendarDays(d, new Date())
  if (diff > 0 && diff < 7) return format(d, 'EEEE')
  if (d.getFullYear() === new Date().getFullYear()) return format(d, 'MMM d')
  return format(d, 'MMM d, yyyy')
}

export function dueTone(key?: string): 'overdue' | 'soon' | 'later' | 'none' {
  if (!key) return 'none'
  const diff = differenceInCalendarDays(fromKey(key), new Date())
  if (diff < 0) return 'overdue'
  if (diff <= 2) return 'soon'
  return 'later'
}

export function greeting(d = new Date()) {
  const h = d.getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`
  return format(new Date(iso), 'MMM d')
}

export function formatClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Round milliseconds to the nearest quarter hour, minimum 0.25. */
export function msToQuarterHours(ms: number) {
  return Math.max(0.25, Math.round((ms / 3_600_000) * 4) / 4)
}
