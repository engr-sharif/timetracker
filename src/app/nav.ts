import {
  CalendarDays,
  Clock,
  FolderKanban,
  FolderOpen,
  FileText,
  House,
  Lightbulb,
  MessagesSquare,
  NotebookPen,
  Settings,
  Shapes,
  SquareCheckBig,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** second key of a "g _" chord */
  key: string
  group: 'work' | 'think' | 'system'
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House, key: 'h', group: 'work' },
  { to: '/timesheet', label: 'Timesheet', icon: Clock, key: 't', group: 'work' },
  { to: '/tasks', label: 'Tasks', icon: SquareCheckBig, key: 'k', group: 'work' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, key: 'c', group: 'work' },
  { to: '/messages', label: 'Messages', icon: MessagesSquare, key: 'm', group: 'work' },
  { to: '/projects', label: 'Projects', icon: FolderKanban, key: 'p', group: 'think' },
  { to: '/notes', label: 'Notes', icon: NotebookPen, key: 'n', group: 'think' },
  { to: '/ideas', label: 'Ideas', icon: Lightbulb, key: 'i', group: 'think' },
  { to: '/boards', label: 'Whiteboards', icon: Shapes, key: 'w', group: 'think' },
  { to: '/pdf', label: 'PDF Studio', icon: FileText, key: 'd', group: 'think' },
  { to: '/files', label: 'Files', icon: FolderOpen, key: 'f', group: 'think' },
  { to: '/tools', label: 'Tools', icon: Wrench, key: 'o', group: 'system' },
  { to: '/settings', label: 'Settings', icon: Settings, key: 's', group: 'system' },
]

export const MOBILE_PRIMARY = ['/', '/timesheet', '/tasks', '/calendar']
