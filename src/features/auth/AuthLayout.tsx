import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Logo } from '@/components/layout/Logo'

/** Full-bleed backdrop for the sign-in and onboarding screens. */
export function AuthLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    // The page itself never scrolls (see main.tsx), so this screen scrolls inside its own box
    // when the card is taller than a phone screen.
    <div className="h-dvh overflow-x-clip overflow-y-auto overscroll-contain">
    <div className="grain relative flex min-h-full overflow-clip">
      <div className="aurora" aria-hidden />
      <GridBackdrop />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center p-5 pt-20 pb-[max(20px,env(safe-area-inset-bottom))] sm:pt-5">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-6 left-6 flex items-center gap-2.5"
        >
          <Logo size={30} />
          <span className="text-[15px] font-semibold tracking-tight">Workbench</span>
        </motion.div>
        {children}
        {aside}
      </div>
    </div>
    </div>
  )
}

function GridBackdrop() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden>
      <defs>
        <pattern id="auth-grid" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M44 0H0V44" fill="none" stroke="var(--border)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-grid)" />
      <motion.circle
        r="120"
        fill="var(--accent-glow)"
        style={{ filter: 'blur(60px)' }}
        initial={{ cx: '30%', cy: '40%' }}
        animate={{ cx: ['30%', '70%', '45%', '30%'], cy: ['40%', '30%', '70%', '40%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)', transition: { duration: 0.35 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="glass relative w-full max-w-[420px] overflow-clip rounded-3xl p-7 shadow-float sm:p-8"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      {children}
    </motion.div>
  )
}
