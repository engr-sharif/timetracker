import type { ReactNode } from 'react'
import { motion, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('mx-auto w-full px-4 pt-6 pb-24 sm:px-8 sm:pt-8 md:pb-12', wide ? 'max-w-[1600px]' : 'max-w-6xl', className)}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[26px] leading-tight font-semibold tracking-[-0.025em] sm:text-[28px]">
            {icon && <span className="text-accent-strong [&_svg]:size-6">{icon}</span>}
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** Staggered reveal for grids/lists of cards. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
}
export const rise: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 32 } },
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}

export function Rise({ children, className, ...rest }: { children: ReactNode; className?: string } & React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div variants={rise} className={className} {...rest}>
      {children}
    </motion.div>
  )
}
