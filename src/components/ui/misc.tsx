import { useEffect, useId, useRef, type ReactNode } from 'react'
import { animate, motion, useInView, useMotionValue, useTransform } from 'motion/react'
import { Check } from 'lucide-react'
import { cn, hashHue, hueColor, hueVars, initials, HUE_LIST } from '@/lib/utils'
import type { Hue } from '@/store/types'

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border-strong bg-surface-2 px-1 font-sans text-[10.5px] font-medium text-muted shadow-[0_1px_0_0_var(--border-strong)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function Badge({
  children,
  hue,
  className,
  dot,
}: {
  children: ReactNode
  hue?: Hue
  className?: string
  dot?: boolean
}) {
  return (
    <span
      style={hue ? hueVars(hue) : undefined}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap',
        hue ? 'bg-[var(--hue-soft)] text-[var(--hue)]' : 'bg-surface-2 text-muted',
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Dot({ hue, className }: { hue?: Hue; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: hueColor(hue) }} />
}

export function Avatar({
  name,
  hue,
  src,
  size = 24,
  className,
  ring,
}: {
  name: string
  hue?: Hue
  src?: string
  size?: number
  className?: string
  ring?: boolean
}) {
  const h = hue ?? hashHue(name)
  return (
    <span
      title={name}
      className={cn(
        'inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold select-none',
        ring && 'ring-2 ring-bg',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.4),
        background: `linear-gradient(135deg, ${hueColor(h, 0.9)}, ${hueColor(h, 0.55)})`,
        color: 'oklch(0.18 0.02 270)',
      }}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials(name) || '?'}
    </span>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200',
        checked ? 'border-accent bg-accent' : 'border-border-strong bg-surface-3',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 35 }}
        className={cn('size-3.5 rounded-full shadow-sm', checked ? 'ml-[18px] bg-accent-fg' : 'ml-0.5 bg-fg/80')}
      />
    </button>
  )
}

export function Checkbox({
  checked,
  onChange,
  className,
  size = 18,
  round,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
  size?: number
  round?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      style={{ width: size, height: size }}
      className={cn(
        'group relative grid shrink-0 place-items-center border-[1.5px] transition-colors duration-150',
        round ? 'rounded-full' : 'rounded-[5px]',
        checked ? 'border-accent bg-accent' : 'border-border-strong hover:border-accent/70',
        className,
      )}
    >
      <motion.svg viewBox="0 0 24 24" className="size-[70%] text-accent-fg" initial={false}>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        />
      </motion.svg>
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  size?: 'xs' | 'sm'
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('inline-flex rounded-[10px] border border-border bg-surface-2/60 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-lg font-medium transition-colors [&_svg]:size-3.5',
            size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-6 px-2 text-xs',
            value === o.value ? 'text-fg' : 'text-subtle hover:text-muted',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-lg border border-border-strong bg-surface shadow-soft"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <div className="relative mb-5">
        <div className="absolute inset-0 scale-150 rounded-full bg-accent/20 blur-2xl" />
        <div className="relative grid size-14 place-items-center rounded-2xl border border-border-strong bg-surface-2 text-accent-strong shadow-soft [&_svg]:size-6">
          {icon}
        </div>
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-muted text-balance">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}

export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  children,
  color = 'var(--accent)',
  track = 'var(--surface-3)',
}: {
  value: number // 0..1 (can exceed)
  size?: number
  stroke?: number
  children?: ReactNode
  color?: string
  track?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = useId()
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="var(--accent-strong)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(1, Math.max(0, value))) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.15 }}
          style={{ filter: 'drop-shadow(0 0 6px var(--accent-glow))' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Number that springs to its new value. */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => {
    const s = v.toFixed(decimals)
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s
  })
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView) return
    const c = animate(mv, value, { type: 'spring', stiffness: 80, damping: 20 })
    return () => c.stop()
  }, [value, inView, mv])
  return (
    <motion.span ref={ref} className={cn('tabular', className)}>
      {text}
    </motion.span>
  )
}

export function HuePicker({ value, onChange }: { value: Hue; onChange: (h: Hue) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {HUE_LIST.map((h) => (
        <button
          key={h}
          type="button"
          aria-label={h}
          onClick={() => onChange(h)}
          className="relative grid size-7 place-items-center rounded-full transition-transform hover:scale-110"
          style={{ background: hueColor(h, 0.9) }}
        >
          {value === h && (
            <motion.span layoutId="hue-pick" className="absolute -inset-1 rounded-full border-2" style={{ borderColor: hueColor(h) }} />
          )}
          {value === h && <Check className="size-3.5 text-black/70" strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
      <h3 className="text-[13px] font-semibold tracking-tight text-muted">{children}</h3>
      {action}
    </div>
  )
}
