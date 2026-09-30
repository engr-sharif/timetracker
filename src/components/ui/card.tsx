import { useRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { cn } from '@/lib/utils'
import { rise } from '@/components/layout/Page'

/** Card with a soft spotlight that follows the pointer. */
export function Card({
  children,
  className,
  spotlight = true,
  interactive,
  ...rest
}: { children: ReactNode; className?: string; spotlight?: boolean; interactive?: boolean } & HTMLMotionProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <motion.div
      ref={ref}
      variants={rise}
      onPointerMove={(e) => {
        if (!spotlight || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`)
        ref.current.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
      className={cn(
        'group/card relative overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm',
        'shadow-[0_1px_0_0_oklch(1_0_0/0.04)_inset]',
        interactive && 'cursor-pointer transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong',
        className,
      )}
      {...rest}
    >
      {spotlight && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
          style={{ background: 'radial-gradient(420px circle at var(--mx) var(--my), var(--accent-soft), transparent 45%)' }}
        />
      )}
      <div className="relative h-full">{children}</div>
    </motion.div>
  )
}

export function CardHeader({ title, icon, action, className }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 px-5 pt-4 pb-3', className)}>
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-muted [&_svg]:size-4 [&_svg]:text-subtle">
        {icon}
        {title}
      </div>
      {action}
    </div>
  )
}
