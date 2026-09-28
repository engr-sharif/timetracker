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
