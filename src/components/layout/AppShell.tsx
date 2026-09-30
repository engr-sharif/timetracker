import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Menu, Plus, Search } from 'lucide-react'
import { NAV, MOBILE_PRIMARY } from '@/app/nav'
import { cn } from '@/lib/utils'
import { useHotkeys } from '@/lib/hotkeys'
import { useUI } from '@/store/ui'
import { useAuth } from '@/store/auth'
import { useTimer } from '@/store/timer'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { QuickAddHost } from '@/features/ai/QuickAdd'
import { CaptureHost } from './CaptureHost'
import { TaskSheetHost } from '@/features/tasks/TaskSheet'
import { Popover } from '@/components/ui/popover'
import { CreateMenuItems } from './CreateMenu'
import { stopTimerToCapture, TimerControl } from './TimerControl'
import { Dialog } from '@/components/ui/dialog'
import { Logo } from './Logo'
import { Spinner } from '@/components/ui/button'

export function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const navigate = useNavigate()
  const ui = useUI()
  const lock = useAuth((s) => s.lock)

  // Freeze the outgoing outlet so exit animations render the old page.
  const [frozen] = useState(() => new Map<string, ReactNode>())
  const section = '/' + (location.pathname.split('/')[1] ?? '')
  frozen.set(section, outlet)

  useHotkeys([
    { combo: 'mod+k', handler: () => ui.openPalette(!useUI.getState().paletteOpen), allowInInputs: true },
    { combo: '/', handler: () => ui.openPalette() },
    { combo: 'c', handler: () => ui.openCapture('task') },
    { combo: 'l', handler: () => ui.openCapture('time') },
    { combo: 'i', handler: () => ui.openCapture('idea') },
    { combo: 'e', handler: () => ui.openCapture('event') },
    {
      combo: 't',
      handler: () => {
        if (useTimer.getState().timer) return stopTimerToCapture()
        const projectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1]
        useTimer.getState().start({ projectId })
      },
    },
    { combo: 'shift+l', handler: lock },
    ...NAV.map((n) => ({ combo: `g ${n.key}`, handler: () => navigate(n.to) })),
  ])

  useEffect(() => {
    ui.setMobileNav(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  return (
    <div className="grain relative flex h-dvh overflow-clip">
      <div className="aurora" aria-hidden />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="relative min-h-0 flex-1 overflow-clip">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(2px)', transition: { duration: 0.14 } }}
              transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 overflow-y-auto"
              id="scroll-root"
            >
              <Suspense fallback={<PageLoader />}>{frozen.get(section)}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <MobileTabBar />
      </div>
      <CommandPalette />
      <CaptureHost />
      <QuickAddHost />
      <TaskSheetHost />
      <MobileNavSheet />
    </div>
  )
}

function PageLoader() {
  return (
    <div className="grid h-full place-items-center text-subtle">
      <Spinner className="size-5" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mobile chrome                                                      */
/* ------------------------------------------------------------------ */

function MobileTopBar() {
  const openPalette = useUI((s) => s.openPalette)
  const setMobileNav = useUI((s) => s.setMobileNav)
  return (
    <div className="flex h-14 items-center gap-2 border-b border-border bg-bg-elev/80 px-3 backdrop-blur-xl md:hidden">
      <button onClick={() => setMobileNav(true)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Menu">
        <Menu className="size-5" />
      </button>
      <Logo size={26} />
      <span className="text-sm font-semibold">Workbench</span>
      <button onClick={() => openPalette()} className="ml-auto grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2" aria-label="Search">
        <Search className="size-[18px]" />
      </button>
    </div>
  )
}

function MobileTabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const items = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to))
  const left = items.slice(0, 2)
  const right = items.slice(2)
  const tab = (n: (typeof NAV)[number]) => {
    const active = n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)
    return (
      <button key={n.to} onClick={() => navigate(n.to)} className={cn('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px]', active ? 'text-fg' : 'text-subtle')}>
        {active && <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
        <n.icon className={cn('size-5', active && 'text-accent-strong')} />
        {n.label}
      </button>
    )
  }
  return (
    <div className="flex items-end border-t border-border bg-bg-elev/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {left.map(tab)}
      <div className="flex flex-1 justify-center">
        <Popover
          placement="top"
          role="menu"
          trigger={
            <button aria-label="Create" className="-mt-5 grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[0_8px_24px_-6px_var(--accent-glow)]">
              <Plus className="size-5" strokeWidth={2.5} />
            </button>
          }
        >
          <CreateMenuItems />
        </Popover>
      </div>
      {right.map(tab)}
    </div>
  )
}

function MobileNavSheet() {
  const open = useUI((s) => s.mobileNavOpen)
  const setOpen = useUI((s) => s.setMobileNav)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Navigate" className="md:hidden">
      <div className="grid grid-cols-3 gap-2">
        {NAV.map((n) => {
          const active = n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)
          return (
            <button
              key={n.to}
              onClick={() => navigate(n.to)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-3 text-xs transition-colors',
                active ? 'border-accent/40 bg-accent-soft text-fg' : 'border-border bg-surface-2/50 text-muted',
              )}
            >
              <n.icon className="size-5" />
              {n.label}
            </button>
          )
        })}
      </div>
      <div className="mt-4">
        <TimerControl />
      </div>
    </Dialog>
  )
}
