import { format } from 'date-fns'
import type { FileMeta, Reading } from '@/store/types'
import { putBlob } from '@/lib/files'
import { ws } from '@/store/workspace'
import { kindOf, READABLE, titleFromName } from './importers'

/** Reading records are keyed by their source file so every device agrees on the id. */
export const readingId = (fileId: string) => `read:${fileId}`

export const FOLDER = 'Reading'

export function isReadable(f: Pick<FileMeta, 'name' | 'type'>) {
  return READABLE.test(f.name) || f.type === 'application/pdf' || f.type === 'application/epub+zip' || f.type.startsWith('text/')
}

/** The reading for a stored file, created on first open. */
export function ensureReading(file: FileMeta): Reading {
  const id = readingId(file.id)
  const existing = ws().doc.tables.readings[id]
  if (existing) return existing
  return ws().create('readings', {
    id,
    fileId: file.id,
    title: titleFromName(file.name),
    kind: kindOf(file.name, file.type) ?? 'text',
    words: 0,
    position: 0,
    status: 'new',
    projectId: file.projectId,
  })
}

/** Stores dropped/picked files in Files and creates their readings. Unsupported files are skipped. */
export async function importFiles(list: FileList | File[]) {
  const out: Reading[] = []
  const skipped: string[] = []
  for (const f of Array.from(list)) {
    const kind = kindOf(f.name, f.type)
    if (!kind || kind === 'image') {
      skipped.push(f.name)
      continue
    }
    const type = f.type || (kind === 'epub' ? 'application/epub+zip' : kind === 'pdf' ? 'application/pdf' : kind === 'md' ? 'text/markdown' : kind === 'html' ? 'text/html' : 'text/plain')
    const meta = ws().create('files', { name: f.name, size: f.size, type, folder: FOLDER, starred: false })
    await putBlob(meta.id, f)
    out.push(ensureReading(meta))
  }
  return { readings: out, skipped }
}

/** Pasted or scanned text is saved as a .txt in Files so it syncs like any other document. */
export async function importText(title: string, text: string, ext: 'txt' | 'md' = 'txt') {
  const name = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Pasted text'}.${ext}`
  const type = ext === 'md' ? 'text/markdown' : 'text/plain'
  const blob = new Blob([text], { type })
  const meta = ws().create('files', { name, size: blob.size, type, folder: FOLDER, starred: false })
  await putBlob(meta.id, blob)
  const r = ensureReading(meta)
  ws().update('readings', r.id, { title: title.trim() || 'Pasted text' })
  return r
}

export function guessTitle(text: string) {
  const first = text.trim().split('\n').find((l) => l.trim())?.trim() ?? ''
  const clean = first.replace(/^#+\s*/, '').replace(/\s+/g, ' ')
  if (clean.length <= 80) return clean || 'Pasted text'
  return clean.slice(0, 60).replace(/\s+\S*$/, '') + '…'
}

export function logReading(id: string, words: number, seconds: number) {
  const day = format(new Date(), 'yyyy-MM-dd')
  ws().update('readings', id, (r) => {
    const log = { ...(r.log ?? {}) }
    const cur = log[day] ?? { words: 0, seconds: 0 }
    log[day] = { words: cur.words + Math.max(0, words), seconds: Math.round(cur.seconds + seconds) }
    return { log, lastReadAt: new Date().toISOString(), status: r.status === 'new' ? 'reading' : r.status }
  })
}

export interface ReadingStats {
  today: { words: number; seconds: number }
  week: { words: number; seconds: number }
  total: { words: number; seconds: number }
  /** average words per minute over the last 30 days of reading */
  wpm: number
  /** consecutive days (ending today or yesterday) with reading */
  streak: number
  finished: number
  days: { date: string; words: number }[]
}

export function readingStats(readings: Reading[]): ReadingStats {
  const byDay = new Map<string, { words: number; seconds: number }>()
  for (const r of readings)
    for (const [d, v] of Object.entries(r.log ?? {})) {
      const cur = byDay.get(d) ?? { words: 0, seconds: 0 }
      byDay.set(d, { words: cur.words + v.words, seconds: cur.seconds + v.seconds })
    }
  const now = new Date()
  const key = (dd: Date) => format(dd, 'yyyy-MM-dd')
  const daysAgo = (n: number) => key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
  const sum = (n: number) => {
    let words = 0
    let seconds = 0
    for (let i = 0; i < n; i++) {
      const v = byDay.get(daysAgo(i))
      if (v) {
        words += v.words
        seconds += v.seconds
      }
    }
    return { words, seconds }
  }
  const total = [...byDay.values()].reduce((a, v) => ({ words: a.words + v.words, seconds: a.seconds + v.seconds }), { words: 0, seconds: 0 })
  const month = sum(30)
  let streak = 0
  let i = byDay.has(daysAgo(0)) ? 0 : 1
  while (byDay.has(daysAgo(i))) {
    streak++
    i++
  }
  return {
    today: sum(1),
    week: sum(7),
    total,
    wpm: month.seconds > 30 ? Math.round(month.words / (month.seconds / 60)) : 0,
    streak,
    finished: readings.filter((r) => r.status === 'finished').length,
    days: Array.from({ length: 14 }, (_, k) => {
      const d = daysAgo(13 - k)
      return { date: d, words: byDay.get(d)?.words ?? 0 }
    }),
  }
}
