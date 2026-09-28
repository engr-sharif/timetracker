import { useId } from 'react'

export function Logo({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.16 var(--accent-h))" />
          <stop offset="1" stopColor="oklch(0.8 0.13 calc(var(--accent-h) - 95))" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="var(--surface-2)" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="15.5" fill="none" stroke={`url(#lg-${id})`} strokeOpacity=".45" strokeWidth="1.5" />
      <path d="M16 22l7 22 9-16 9 16 7-22" fill="none" stroke={`url(#lg-${id})`} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
