import { hueColor } from '@/lib/utils'
import { priorityMeta, statusMeta } from '@/lib/meta'
import type { Priority, TaskStatus } from '@/store/types'

/** Linear-style status glyph: a ring that fills as work progresses. */
export function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const color = hueColor(statusMeta(status).hue)
  const fill = { backlog: 0, todo: 0, doing: 0.5, review: 0.75, done: 1 }[status]
  const r = 5
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0">
      <circle
        cx="7"
        cy="7"
        r="6"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={status === 'backlog' ? '1.6 1.6' : undefined}
      />
      {fill > 0 && fill < 1 && (
        <circle
          cx="7"
          cy="7"
          r={r / 2}
          fill="none"
          stroke={color}
          strokeWidth={r}
          strokeDasharray={`${(c / 2) * fill} ${c}`}
          transform="rotate(-90 7 7)"
        />
      )}
      {fill === 1 && (
        <>
          <circle cx="7" cy="7" r="6" fill={color} />
          <path d="M4.3 7.2l1.8 1.8 3.6-3.8" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const meta = priorityMeta(priority)
  if (priority === 'none') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0 text-subtle">
        {[2.5, 6, 9.5].map((x) => (
          <rect key={x} x={x} y="6.25" width="2" height="1.5" rx=".5" fill="currentColor" />
        ))}
      </svg>
    )
  }
  if (priority === 'urgent') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0">
        <rect x="1" y="1" width="12" height="12" rx="3" fill={hueColor(meta.hue)} />
        <path d="M7 3.8v3.9" stroke="var(--bg)" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="7" cy="10" r="1" fill="var(--bg)" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className="shrink-0">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1.5 + i * 4}
          y={9 - i * 3}
          width="3"
          height={3 + i * 3}
          rx="1"
          fill={i < meta.rank ? hueColor(meta.hue) : 'var(--surface-3)'}
        />
      ))}
    </svg>
  )
}

/** GitHub's mark (brand icons aren't in lucide). */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}
