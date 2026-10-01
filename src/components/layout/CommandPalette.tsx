import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  CalendarDays,
  Clock,
  CornerDownLeft,
  File as FileIcon,
  Hash,
  Lightbulb,
  Lock,
  Moon,
  NotebookPen,
  Play,
  RefreshCw,
  Search,
  Shapes,
  Square,
  SquareCheckBig,
  Sun,
  User,
  Sparkles,
} from 'lucide-react'
import { NAV } from '@/app/nav'
import { modKey } from '@/lib/utils'
import { useQuickAdd } from '@/features/ai/QuickAdd'
import { useUI } from '@/store/ui'
import { useWorkspace } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import { usePrefs, resolveTheme } from '@/store/prefs'
import { useSync } from '@/store/sync'
import { useTimer } from '@/store/timer'
import { Dot, Kbd } from '@/components/ui/misc'
import { StatusIcon } from '@/components/ui/icons'
import { useCreateActions } from './CreateMenu'
import { stopTimerToCapture } from './TimerControl'

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.openPalette)
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[65] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            className="glass relative w-full max-w-[640px] overflow-hidden rounded-2xl shadow-float"
          >
            <PaletteBody onClose={() => setOpen(false)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const tables = useWorkspace((s) => s.doc.tables)
  const create = useCreateActions()
  const lock = useAuth((s) => s.lock)
  const theme = usePrefs((s) => s.theme)
  const setTheme = usePrefs((s) => s.setTheme)
  const timer = useTimer((s) => s.timer)
  const startTimer = useTimer((s) => s.start)
  const syncNow = useSync((s) => s.syncNow)
  const [search, setSearch] = useState('')

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const go = (to: string) => run(() => navigate(to))

  const projects = useMemo(() => Object.values(tables.projects), [tables.projects])
  const projectOf = (id?: string) => (id ? tables.projects[id] : undefined)

  const q = search.trim()

  return (
    <Command
      loop
      className="flex max-h-[min(560px,70vh)] flex-col"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-4 text-subtle" />
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder="Search everything, or type a command…"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="flex-1 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:uppercase">
        <Command.Empty className="py-12 text-center text-sm text-subtle">No results for “{search}”</Command.Empty>

        {q.length >= 6 && (
          <Command.Group heading="AI">
            <Item icon={<Sparkles />} onSelect={run(() => useQuickAdd.getState().show(q))} value={`ai quick add ${q}`} hint="Time, tasks, events">
              Quick add: “{q.length > 48 ? q.slice(0, 48) + '…' : q}”
            </Item>
          </Command.Group>
        )}

        <Command.Group heading="Create">
          <Item icon={<Sparkles />} onSelect={run(() => useQuickAdd.getState().show())} shortcut={`${modKey()} J`} value="quick add with ai natural language">Quick add with AI…</Item>
          <Item icon={<SquareCheckBig />} onSelect={run(create.task)} shortcut="C">New task</Item>
          <Item icon={<Clock />} onSelect={run(create.time)} shortcut="L">Log time</Item>
          <Item icon={<CalendarDays />} onSelect={run(create.event)} shortcut="E">New calendar event</Item>
          <Item icon={<NotebookPen />} onSelect={run(() => create.note())}>New note</Item>
          <Item icon={<Lightbulb />} onSelect={run(create.idea)} shortcut="I">Capture an idea</Item>
          <Item icon={<Shapes />} onSelect={run(() => create.board())}>New whiteboard</Item>
        </Command.Group>

        <Command.Group heading="Go to">
          {NAV.map((n) => (
            <Item key={n.to} icon={<n.icon />} onSelect={go(n.to)} shortcut={`G ${n.key.toUpperCase()}`} value={`go ${n.label}`}>
              {n.label}
            </Item>
          ))}
        </Command.Group>

        <Command.Group heading="Actions">
          {timer ? (
            <Item icon={<Square />} onSelect={run(stopTimerToCapture)}>Stop timer & log time</Item>
          ) : (
            <Item icon={<Play />} onSelect={run(() => startTimer())} shortcut="T">Start timer</Item>
          )}
          <Item
            icon={resolveTheme(theme) === 'dark' ? <Sun /> : <Moon />}
            onSelect={run(() => setTheme(resolveTheme(theme) === 'dark' ? 'light' : 'dark'))}
          >
            Switch to {resolveTheme(theme) === 'dark' ? 'light' : 'dark'} theme
          </Item>
          <Item icon={<RefreshCw />} onSelect={run(() => void syncNow())}>Sync now</Item>
          <Item icon={<Lock />} onSelect={run(lock)}>Lock workspace</Item>
        </Command.Group>

        {q && (
          <>
            <Command.Group heading="Projects">
              {projects.slice(0, 50).map((p) => (
                <Item key={p.id} icon={<Dot hue={p.color} className="size-2.5" />} onSelect={go(`/projects/${p.id}`)} value={`project ${p.number} ${p.name} ${p.client}`} hint={p.number}>
                  {p.name}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Tasks">
              {Object.values(tables.tasks)
                .slice(0, 400)
                .map((t) => (
                  <Item
                    key={t.id}
                    icon={<StatusIcon status={t.status} />}
                    onSelect={run(() => useUI.getState().openTask(t.id))}
                    value={`task ${t.title} ${projectOf(t.projectId)?.number ?? ''}`}
                    hint={projectOf(t.projectId)?.number}
                  >
                    {t.title}
                  </Item>
                ))}
            </Command.Group>
            <Command.Group heading="Notes">
              {Object.values(tables.notes).map((n) => (
                <Item key={n.id} icon={<span className="text-sm">{n.icon}</span>} onSelect={go(`/notes/${n.id}`)} value={`note ${n.title} ${n.text.slice(0, 200)}`}>
                  {n.title || 'Untitled'}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Ideas">
              {Object.values(tables.ideas)
                .slice(0, 300)
                .map((i) => (
                  <Item key={i.id} icon={<Lightbulb />} onSelect={go(`/ideas?focus=${i.id}`)} value={`idea ${i.text}`}>
                    {i.text.slice(0, 80)}
                  </Item>
                ))}
            </Command.Group>
            <Command.Group heading="Whiteboards">
              {Object.values(tables.boards).map((b) => (
                <Item key={b.id} icon={<Shapes />} onSelect={go(`/boards/${b.id}`)} value={`board ${b.name}`}>
                  {b.name}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Channels & people">
              {Object.values(tables.channels).map((c) => (
                <Item key={c.id} icon={<Hash />} onSelect={go(`/messages/${c.id}`)} value={`channel ${c.name}`}>
                  {c.name}
                </Item>
              ))}
              {Object.values(tables.people).map((p) => (
                <Item key={p.id} icon={<User />} onSelect={go(`/settings#people`)} value={`person ${p.name} ${p.email ?? ''} ${p.company ?? ''}`} hint={p.role}>
                  {p.name}
                </Item>
              ))}
            </Command.Group>
            <Command.Group heading="Files">
              {Object.values(tables.files).map((f) => (
                <Item key={f.id} icon={<FileIcon />} onSelect={go(`/files?focus=${f.id}`)} value={`file ${f.name}`}>
                  {f.name}
                </Item>
              ))}
            </Command.Group>
          </>
        )}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft className="size-3" />
          </Kbd>
          open
        </span>
        <span className="ml-auto flex items-center gap-1">
          Workbench <ArrowRight className="size-3" />
        </span>
      </div>
    </Command>
  )
}

function Item({
  icon,
  children,
  onSelect,
  shortcut,
  value,
  hint,
}: {
  icon: ReactNode
  children: ReactNode
  onSelect: () => void
  shortcut?: string
  value?: string
  hint?: string
}) {
  return (
    <Command.Item
      value={value ?? (typeof children === 'string' ? children : undefined)}
      onSelect={onSelect}
      className="group flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[13.5px] text-muted data-[selected=true]:bg-surface-3/70 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle data-[selected=true]:[&_svg]:text-accent-strong"
    >
      <span className="grid size-5 place-items-center">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="font-mono text-[11px] text-subtle">{hint}</span>}
      {shortcut && (
        <span className="flex gap-1">
          {shortcut.split(' ').map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </Command.Item>
  )
}
