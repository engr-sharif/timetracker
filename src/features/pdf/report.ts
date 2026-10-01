import type { PdfDoc } from '@/store/types'
import { DEFAULT_CALIBRATION, measure } from './geometry'

/** Markups as CSV (a review log), including measurements in calibrated units. */
export function markupsCsv(doc: PdfDoc) {
  const order = new Map(doc.pages.map((p, i) => [p.key, i + 1]))
  const rows = [['Page', 'Type', 'Status', 'Author', 'Date', 'Text', 'Comment', 'Measurement']]
  const sorted = [...doc.annots].sort((a, b) => (order.get(a.page) ?? 0) - (order.get(b.page) ?? 0) || a.createdAt.localeCompare(b.createdAt))
  for (const a of sorted) {
    const cal = doc.pageScales?.[a.page] ?? doc.scale ?? DEFAULT_CALIBRATION
    const m = measure(a, cal)
    rows.push([String(order.get(a.page) ?? ''), a.kind, a.status ?? 'open', a.author ?? '', a.createdAt.slice(0, 10), a.text ?? '', a.comment ?? '', m ? m.label + (m.secondary ? ` (${m.secondary})` : '') : ''])
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}
