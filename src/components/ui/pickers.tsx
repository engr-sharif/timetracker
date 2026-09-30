import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  nextMonday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Calendar, Check, ChevronLeft, ChevronRight, FolderKanban, Plus, Search, User, X } from 'lucide-react'
import { cn, fuzzy, hueColor } from '@/lib/utils'
import { fromKey, relativeDay, toKey } from '@/lib/dates'
import { PRIORITIES, TASK_STATUSES } from '@/lib/meta'
import { useList, ws } from '@/store/workspace'
import { useAuth } from '@/store/auth'
import type { Priority, TaskStatus } from '@/store/types'
import { Popover } from './popover'
import { Avatar, Dot } from './misc'
import { PriorityIcon, StatusIcon } from './icons'

export interface ComboItem {
  value: string
  label: string
  hint?: string
  icon?: ReactNode
  keywords?: string
}

export function Combobox({
  trigger,
  items,
  value,
  onChange,
  placeholder = 'Search…',
  onCreate,
  createLabel = (q: string) => `Create “${q}”`,
  className,
}: {
  trigger: ReactElement
  items: ComboItem[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  onCreate?: (query: string) => string | void
  createLabel?: (q: string) => string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!q) return items
    return items
      .map((i) => ({ i, s: fuzzy(q, `${i.label} ${i.hint ?? ''} ${i.keywords ?? ''}`) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i)
  }, [items, q])

  const showCreate = !!onCreate && q.trim() && !items.some((i) => i.label.toLowerCase() === q.trim().toLowerCase())
  const total = filtered.length + (showCreate ? 1 : 0)

  const pick = (idx: number) => {
    if (idx < filtered.length) onChange(filtered[idx].value)
    else if (showCreate) {
      const created = onCreate!(q.trim())
      if (created) onChange(created)
    }
    setOpen(false)
    setQ('')
  }

  return (
    <Popover
      trigger={trigger}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ('')
        setActive(0)
      }}
      role="listbox"
      className={cn('w-64 p-0', className)}
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-3.5 text-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(total - 1, a + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(0, a - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (total) pick(active)
            }
          }}
          placeholder={placeholder}
          className="h-10 flex-1 bg-transparent text-[13px] outline-none"
        />
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
        {filtered.map((item, i) => (
          <button
            key={item.value}
            type="button"
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(i)}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]',
              i === active && 'bg-surface-3/70',
            )}
          >
            {item.icon}
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint && <span className="truncate text-[11px] text-subtle">{item.hint}</span>}
            {value === item.value && <Check className="size-3.5 text-accent" />}
          </button>
        ))}
        {showCreate && (
          <button
            type="button"
            onMouseEnter={() => setActive(filtered.length)}
            onClick={() => pick(filtered.length)}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-accent-strong',
              active === filtered.length && 'bg-surface-3/70',
            )}
          >
            <Plus className="size-4" />
            {createLabel(q.trim())}
          </button>
        )}
        {!total && <div className="px-3 py-6 text-center text-xs text-subtle">Nothing found</div>}
      </div>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */

const chip =
  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-2/50 px-2 text-[12.5px] text-muted transition-colors hover:border-border-strong hover:text-fg'

export function ProjectPicker({
  value,
  onChange,
  allowNone = true,
  className,
  placeholder = 'Project',
}: {
  value?: string
  onChange: (id: string | undefined) => void
  allowNone?: boolean
  className?: string
  placeholder?: string
}) {
  const projects = useList('projects')
  const current = projects.find((p) => p.id === value)
  const items: ComboItem[] = [
    ...(allowNone ? [{ value: '', label: 'No project', icon: <FolderKanban className="size-3.5 text-subtle" /> }] : []),
    ...projects
      .filter((p) => p.status !== 'complete' || p.id === value)
      .sort((a, b) => a.number.localeCompare(b.number))
      .map((p) => ({ value: p.id, label: p.name, hint: p.number, keywords: p.client, icon: <Dot hue={p.color} /> })),
  ]
  return (
    <Combobox
      items={items}
      value={value ?? ''}
      onChange={(v) => onChange(v || undefined)}
      placeholder="Search projects…"
      trigger={
        <button type="button" className={cn(chip, className)}>
          {current ? <Dot hue={current.color} /> : <FolderKanban className="size-3.5" />}
          <span className="truncate">{current ? current.name : placeholder}</span>
          {current?.number && <span className="font-mono text-[11px] text-subtle">{current.number}</span>}
        </button>
      }
    />
  )
}

export function usePeopleOptions() {
  const people = useList('people')
  const account = useAuth((s) => s.account)
  return useMemo(
    () => [
      { value: 'me', label: account?.name ? `${account.name} (me)` : 'Me', icon: <Avatar name={account?.name ?? 'Me'} hue={account?.color} size={18} /> },
      ...people
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: p.name, hint: p.role, keywords: `${p.email} ${p.company}`, icon: <Avatar name={p.name} hue={p.color} size={18} /> })),
    ],
    [people, account],
  )
}

export function usePersonName() {
  const people = useList('people')
  const account = useAuth((s) => s.account)
  return (id?: string) => {
    if (!id || id === 'me') return { name: account?.name ?? 'Me', hue: account?.color, me: true }
    const p = people.find((x) => x.id === id)
    return { name: p?.name ?? 'Unknown', hue: p?.color, me: false }
  }
}

export function PersonPicker({
  value,
  onChange,
  className,
  compact,
  label = 'Assignee',
}: {
  value?: string
  onChange: (id: string) => void
  className?: string
  compact?: boolean
  label?: string
}) {
  const items = usePeopleOptions()
  const nameOf = usePersonName()
  const cur = value ? nameOf(value) : null
  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder="Assign to…"
      onCreate={(name) => ws().create('people', { name, color: 'violet' }).id}
      createLabel={(q) => `Add “${q}” to people`}
      trigger={
        <button type="button" className={cn(compact ? 'rounded-full' : chip, className)} title={label}>
          {cur ? <Avatar name={cur.name} hue={cur.hue} size={compact ? 22 : 18} /> : <User className="size-3.5" />}
          {!compact && <span className="truncate">{cur ? (cur.me ? 'Me' : cur.name) : label}</span>}
        </button>
      }
    />
  )
}

export function PriorityPicker({ value, onChange, compact }: { value: Priority; onChange: (p: Priority) => void; compact?: boolean }) {
  const meta = PRIORITIES.find((p) => p.value === value)!
  return (
    <Combobox
      items={PRIORITIES.map((p) => ({ value: p.value, label: p.label, icon: <PriorityIcon priority={p.value} /> }))}
      value={value}
      onChange={(v) => onChange(v as Priority)}
      placeholder="Priority…"
      className="w-52"
      trigger={
        <button type="button" className={cn(compact ? 'grid size-6 place-items-center rounded-md hover:bg-surface-2' : chip)} title="Priority">
          <PriorityIcon priority={value} />
          {!compact && <span>{value === 'none' ? 'Priority' : meta.label}</span>}
        </button>
      }
    />
  )
}

export function StatusPicker({ value, onChange }: { value: TaskStatus; onChange: (s: TaskStatus) => void }) {
  const meta = TASK_STATUSES.find((s) => s.value === value)!
  return (
    <Combobox
      items={TASK_STATUSES.map((s) => ({ value: s.value, label: s.label, icon: <StatusIcon status={s.value} /> }))}
      value={value}
      onChange={(v) => onChange(v as TaskStatus)}
      placeholder="Status…"
      className="w-52"
      trigger={
        <button type="button" className={chip}>
          <StatusIcon status={value} />
          <span>{meta.label}</span>
        </button>
      }
    />
  )
}

export function CostCodePicker({
  projectId,
  value,
  onChange,
  className,
}: {
  projectId?: string
  value?: string
  onChange: (code: string) => void
  className?: string
}) {
  const projects = useList('projects')
  const project = projects.find((p) => p.id === projectId)
  const codes = project?.costCodes ?? []
  return (
    <Combobox
      items={codes.map((c) => ({ value: c, label: c }))}
      value={value}
      onChange={onChange}
      placeholder={project ? 'Cost code…' : 'Pick a project first'}
      onCreate={
        project
          ? (code) => {
              ws().update('projects', project.id, { costCodes: [...project.costCodes, code] })
              return code
            }
          : undefined
      }
      createLabel={(q) => `Add cost code “${q}”`}
      trigger={
        <button type="button" className={cn(chip, 'font-mono', className)} disabled={!project}>
          <span className="truncate">{value || 'Cost code'}</span>
        </button>
      }
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Date picker                                                        */
/* ------------------------------------------------------------------ */

export function DatePicker({
  value,
  onChange,
  placeholder = 'Due date',
  className,
  clearable = true,
  trigger,
}: {
  value?: string
  onChange: (key: string | undefined) => void
  placeholder?: string
  className?: string
  clearable?: boolean
  trigger?: ReactElement
}) {
  const [month, setMonth] = useState(() => (value ? fromKey(value) : new Date()))
  const selected = value ? fromKey(value) : undefined
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })
  const quick = [
    { label: 'Today', date: new Date() },
    { label: 'Tomorrow', date: addDays(new Date(), 1) },
    { label: 'Next Monday', date: nextMonday(new Date()) },
    { label: 'In 2 weeks', date: addDays(new Date(), 14) },
  ]
  return (
    <Popover
      className="w-[272px] p-3"
      trigger={
        trigger ?? (
          <button type="button" className={cn(chip, className)}>
            <Calendar className="size-3.5" />
            <span>{value ? relativeDay(value) : placeholder}</span>
          </button>
        )
      }
    >
      {({ close }) => (
        <div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  onChange(toKey(q.date))
                  close()
                }}
                className="flex h-7 items-center justify-between rounded-md px-2 text-xs text-muted hover:bg-surface-3/70 hover:text-fg"
              >
                {q.label}
                <span className="text-[10.5px] text-subtle">{format(q.date, 'EEE')}</span>
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">{format(month, 'MMMM yyyy')}</span>
            <div className="flex">
              <button type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-3/70" onClick={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-3/70" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="py-1 text-[10.5px] font-medium text-subtle">
                {d}
              </div>
            ))}
            {days.map((d) => (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  onChange(toKey(d))
                  close()
                }}
                className={cn(
                  'relative grid h-8 place-items-center rounded-lg text-[12.5px] tabular transition-colors',
                  !isSameMonth(d, month) && 'text-subtle/60',
                  selected && isSameDay(d, selected)
                    ? 'bg-accent font-semibold text-accent-fg'
                    : 'hover:bg-surface-3/70',
                  isToday(d) && !(selected && isSameDay(d, selected)) && 'font-semibold text-accent-strong',
                )}
              >
                {format(d, 'd')}
                {isToday(d) && <span className="absolute bottom-1 size-1 rounded-full bg-current" />}
              </button>
            ))}
          </div>
          {clearable && value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined)
                close()
              }}
              className="mt-2 flex h-7 w-full items-center justify-center gap-1.5 rounded-md text-xs text-muted hover:bg-surface-3/70"
            >
              <X className="size-3.5" /> Clear date
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}

export function HueSwatch({ hue }: { hue: string }) {
  return <span className="size-3 rounded-full" style={{ background: hueColor(hue as never) }} />
}
