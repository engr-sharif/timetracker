import { useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronDown,
  Lock,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Sun,
} from 'lucide-react'
import { NAV, type NavItem } from '@/app/nav'
import { cn, modKey } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { useList } from '@/store/workspace'
import { dueTone } from '@/lib/dates'
import { Avatar, Dot, Kbd } from '@/components/ui/misc'
import { MenuItem, MenuLabel, MenuSeparator, Popover, Tooltip } from '@/components/ui/popover'
import { CreateMenuItems } from './CreateMenu'
import { TimerControl } from './TimerControl'
import { SyncBadge } from './SyncBadge'
import { Logo } from './Logo'

export function Sidebar() {
  const collapsed = usePrefs((s) => s.sidebarCollapsed)
  const setPrefs = usePrefs((s) => s.set)
  const openPalette = useUI((s) => s.openPalette)
  const tasks = useList('tasks')
  const projects = useList('projects')
  const { pathname } = useLocation()

  const dueCount = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.assigneeId === 'me' && ['overdue', 'soon'].includes(dueTone(t.due))).length,
    [tasks],
  )
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
    [projects],
  )

  const groups: { id: NavItem['group']; label: string }[] = [
    { id: 'work', label: 'Work' },
    { id: 'think', label: 'Think' },
  ]

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 248 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className="relative z-20 hidden h-full shrink-0 flex-col border-r border-border bg-bg-elev/70 backdrop-blur-xl md:flex"
    >
      <div className={cn('flex h-14 items-center gap-2 px-3', collapsed && 'justify-center px-0')}>
        <AccountMenu collapsed={collapsed} />
      </div>

      <div className={cn('flex gap-1.5 px-3 pb-2', collapsed && 'flex-col items-center px-0')}>
        {collapsed ? (
          <Tooltip content={`Search  ${modKey()}K`} placement="right">
            <button onClick={() => openPalette()} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
              <Search className="size-4" />
            </button>
          </Tooltip>
        ) : (
          <button
            onClick={() => openPalette()}
            className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border bg-surface/60 px-2.5 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd>{modKey()}K</Kbd>
          </button>
        )}
        <Popover
          placement={collapsed ? 'right-start' : 'bottom-end'}
          role="menu"
          trigger={
            <button
              aria-label="Create"
              className={cn(
                'grid place-items-center rounded-lg bg-accent text-accent-fg shadow-[0_4px_14px_-4px_var(--accent-glow)] transition-transform hover:scale-105 active:scale-95',
                collapsed ? 'size-9' : 'size-8',
              )}
            >
              <Plus className="size-4" strokeWidth={2.5} />
            </button>
          }
        >
          <CreateMenuItems />
        </Popover>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
        {groups.map((g) => (
          <div key={g.id} className="mt-3 first:mt-1">
            {!collapsed && <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-subtle/80 uppercase">{g.label}</div>}
            {NAV.filter((n) => n.group === g.id).map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} pathname={pathname} badge={item.to === '/tasks' ? dueCount : 0} />
            ))}
          </div>
        ))}

        {!collapsed && activeProjects.length > 0 && (
          <div className="mt-5">
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-subtle/80 uppercase">Active projects</div>
            {activeProjects.map((p) => (
              <NavLink
                key={p.id}
                to={`/projects/${p.id}`}
                className={({ isActive }) =>
                  cn(
                    'group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
                    isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
                  )
                }
              >
                <Dot hue={p.color} className="transition-transform group-hover:scale-125" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono text-[10.5px] text-subtle opacity-0 transition-opacity group-hover:opacity-100">{p.number}</span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className={cn('space-y-2 border-t border-border p-2', collapsed && 'flex flex-col items-center')}>
        <TimerControl compact={collapsed} />
        <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'justify-between px-1')}>
          <SyncBadge compact={collapsed} />
          <div className={cn('flex items-center', collapsed && 'flex-col')}>
            {NAV.filter((n) => n.group === 'system').map((item) => (
              <Tooltip key={item.to} content={item.label} placement={collapsed ? 'right' : 'top'}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn('grid size-8 place-items-center rounded-lg transition-colors', isActive ? 'bg-surface-2 text-fg' : 'text-subtle hover:bg-surface-2 hover:text-fg')
                  }
                >
                  <item.icon className="size-4" />
                </NavLink>
              </Tooltip>
            ))}
            <Tooltip content={collapsed ? 'Expand' : 'Collapse'} placement={collapsed ? 'right' : 'top'}>
              <button
                onClick={() => setPrefs({ sidebarCollapsed: !collapsed })}
                className="grid size-8 place-items-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </motion.aside>
  )
}

function NavRow({ item, collapsed, pathname, badge }: { item: NavItem; collapsed: boolean; pathname: string; badge: number }) {
  const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
  const link = (
    <NavLink
      to={item.to}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-lg text-[13.5px] font-[450] transition-colors',
        collapsed ? 'mx-auto w-9 justify-center' : 'px-2.5',
        active ? 'text-fg' : 'text-muted hover:text-fg',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg border border-border bg-surface-2 shadow-soft"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      {!active && <span className="absolute inset-0 rounded-lg transition-colors group-hover:bg-surface-2/50" />}
      <item.icon className={cn('relative size-4 shrink-0 transition-colors', active ? 'text-accent-strong' : 'text-subtle group-hover:text-muted')} />
      {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
      <AnimatePresence>
        {badge > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className={cn(
              'relative grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10.5px] font-semibold text-accent-fg tabular',
              collapsed ? 'absolute -top-1 -right-1 h-4' : 'h-[18px]',
            )}
          >
            {badge}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  )
  return collapsed ? (
    <Tooltip content={item.label} placement="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const account = useAuth((s) => s.account)
  const lock = useAuth((s) => s.lock)
  const theme = usePrefs((s) => s.theme)
  const setTheme = usePrefs((s) => s.setTheme)
  const navigate = useNavigate()

  return (
    <Popover
      role="menu"
      placement="bottom-start"
      className="w-60"
      trigger={
        <button className={cn('flex min-w-0 items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-surface-2', !collapsed && 'flex-1 pr-2')}>
          <Logo size={28} />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-left leading-tight">
                <div className="truncate text-[13.5px] font-semibold tracking-tight">Workbench</div>
                <div className="truncate text-[11.5px] text-subtle">{account?.name}</div>
              </div>
              <ChevronDown className="size-3.5 text-subtle" />
            </>
          )}
        </button>
      }
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <Avatar name={account?.name ?? 'Me'} hue={account?.color} src={account?.avatar} size={30} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{account?.name}</div>
          <div className="truncate text-[11.5px] text-subtle">{account?.title || account?.email || 'Local account'}</div>
        </div>
      </div>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      {(
        [
          ['dark', 'Dark', Moon],
          ['light', 'Light', Sun],
          ['system', 'System', Monitor],
        ] as const
      ).map(([v, label, Icon]) => (
        <button
          key={v}
          onClick={(e) => setTheme(v, { x: e.clientX, y: e.clientY })}
          className={cn(
            'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] hover:bg-surface-3/70',
            theme === v && 'text-accent-strong',
          )}
        >
          <Icon className="size-4 text-subtle" />
          <span className="flex-1 text-left">{label}</span>
          {theme === v && <span className="size-1.5 rounded-full bg-accent" />}
        </button>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Settings />} onSelect={() => navigate('/settings')}>
        Settings
      </MenuItem>
      <MenuItem icon={<Lock />} onSelect={lock} shortcut="⇧L">
        Lock workspace
      </MenuItem>
    </Popover>
  )
}
