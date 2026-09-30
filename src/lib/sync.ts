import { COLLECTIONS, type WorkspaceDoc } from '@/store/types'
import { normalizeDoc } from '@/store/workspace'

/**
 * Record-level merge of two workspace docs. Newer `updatedAt` wins per record,
 * deletions are carried as tombstones and beat any record last edited before them.
 * Commutative, so every device converges on the same state.
 */
export function mergeDocs(aIn: WorkspaceDoc, bIn: WorkspaceDoc): WorkspaceDoc {
  const a = normalizeDoc(aIn)
  const b = normalizeDoc(bIn)

  const tombstones: Record<string, string> = { ...a.tombstones }
  for (const [id, ts] of Object.entries(b.tombstones)) {
    if (!tombstones[id] || tombstones[id] < ts) tombstones[id] = ts
  }

  const tables = { ...a.tables }
  for (const col of COLLECTIONS) {
    const ta = a.tables[col] as Record<string, { updatedAt: string }>
    const tb = b.tables[col] as Record<string, { updatedAt: string }>
    const out: Record<string, { updatedAt: string }> = {}
    const ids = new Set([...Object.keys(ta), ...Object.keys(tb)])
    for (const id of ids) {
      const ra = ta[id]
      const rb = tb[id]
      const winner = !ra ? rb : !rb ? ra : ra.updatedAt >= rb.updatedAt ? ra : rb
      const deletedAt = tombstones[id]
      if (deletedAt && deletedAt >= winner.updatedAt) continue
      out[id] = winner
    }
    ;(tables as Record<string, unknown>)[col] = out
  }

  const settings = a.settings.updatedAt >= b.settings.updatedAt ? a.settings : b.settings

  return {
    version: 4,
    tables,
    tombstones: pruneTombstones(tombstones),
    settings,
    submittedWeeks: mergeWeeks(a.submittedWeeks, b.submittedWeeks, tombstones),
  }
}

/** Union of submitted weeks, minus any reopened after they were submitted. */
function mergeWeeks(a: Record<string, string>, b: Record<string, string>, tombstones: Record<string, string>) {
  const out: Record<string, string> = {}
  for (const [k, ts] of [...Object.entries(a), ...Object.entries(b)]) {
    if (!out[k] || out[k] < ts) out[k] = ts
  }
  for (const k of Object.keys(out)) {
    const reopened = tombstones[`week:${k}`]
    if (reopened && reopened >= out[k]) delete out[k]
  }
  return out
}

/** Drop tombstones older than 90 days to keep the doc small. */
function pruneTombstones(t: Record<string, string>) {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString()
  return Object.fromEntries(Object.entries(t).filter(([, ts]) => ts > cutoff))
}

/** Key-order-independent JSON used for fingerprints. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Stable fingerprint used to skip no-op pushes. */
export function docHash(doc: WorkspaceDoc) {
  const s = canonical(doc)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `${s.length}:${h >>> 0}`
}
