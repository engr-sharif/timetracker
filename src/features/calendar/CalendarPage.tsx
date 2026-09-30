import { useMemo, useState, type DragEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react'
import { cn, formatHours, hueColor } from '@/lib/utils'
import { fromKey, toKey } from '@/lib/dates'
import { EVENT_KINDS, eventMeta } from '@/lib/meta'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { useList, useSettings, useTable, ws } from '@/store/workspace'
import type { CalendarEvent, Task } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, IconButton } from '@/components/ui/button'
import { Dot, Segmented } from '@/components/ui/misc'
import { StatusIcon } from '@/components/ui/icons'
import { usePersonName } from '@/components/ui/pickers'

type Item = { kind: 'event'; e: CalendarEvent } | { kind: 'task'; t: Task }

function useItemsByDay() {
  const events = useList('events')
  const tasks = useList('tasks')
  const entries = useList('entries')
  return useMemo(() => {
    const map = new Map<string, Item[]>()
    const push = (k: string, i: Item) => map.set(k, [...(map.get(k) ?? []), i])
    for (const e of events) push(e.date, { kind: 'event', e })
    for (const t of tasks) if (t.due) push(t.due, { kind: 'task', t })
    for (const list of map.values())
      list.sort((a, b) => (a.kind === 'event' ? (a.e.start ?? '00') : '99').localeCompare(b.kind === 'event' ? (b.e.start ?? '00') : '99'))
    const hours = new Map<string, number>()
    for (const e of entries) hours.set(e.date, (hours.get(e.date) ?? 0) + e.hours)
    return { map, hours }
  }, [events, tasks, entries])
}

function onDropReschedule(e: DragEvent, date: string) {
  e.preventDefault()
  const raw = e.dataTransfer.getData('application/x-workbench')
  if (!raw) return
  const { kind, id } = JSON.parse(raw) as { kind: 'event' | 'task'; id: string }
  if (kind === 'event') ws().update('events', id, { date })
  else ws().update('tasks', id, { due: date })
  toast.success(`Moved to ${format(fromKey(date), 'EEE, MMM d')}`)
}

export default function CalendarPage() {
  const view = usePrefs((s) => s.calendarView)
  const setPrefs = usePrefs((s) => s.set)
  const settings = useSettings()
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState(toKey(new Date()))
  const [dir, setDir] = useState(0)
  const openCapture = useUI((s) => s.openCapture)
  const { map, hours } = useItemsByDay()

  const step = (n: number) => {
    setDir(n)
    setCursor(view === 'month' ? addMonths(cursor, n) : addWeeks(cursor, n))
  }

  const title = view === 'month' ? format(cursor, 'MMMM yyyy') : `${format(startOfWeek(cursor, { weekStartsOn: settings.weekStartsOn }), 'MMM d')} – ${format(endOfWeek(cursor, { weekStartsOn: settings.weekStartsOn }), 'MMM d, yyyy')}`

  return (
    <Page wide>
      <PageHeader
        title={<span className="font-serif text-[34px] font-normal tracking-tight">{title}</span>}
        actions={
          <>
            <Segmented value={view} onChange={(v) => setPrefs({ calendarView: v })} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
            <div className="flex items-center rounded-[10px] border border-border bg-surface-2/60 p-0.5">
              <IconButton label="Previous" onClick={() => step(-1)}>
                <ChevronLeft />
              </IconButton>
              <button onClick={() => { setDir(0); setCursor(new Date()); setSelected(toKey(new Date())) }} className="h-8 rounded-lg px-3 text-[13px] font-medium hover:bg-surface-3">
                Today
              </button>
              <IconButton label="Next" onClick={() => step(1)}>
                <ChevronRight />
              </IconButton>
            </div>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openCapture('event', { date: selected })}>
              New event
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/70 backdrop-blur-sm">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={`${view}-${toKey(view === 'month' ? startOfMonth(cursor) : startOfWeek(cursor))}`}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 30 }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -30 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              {view === 'month' ? (
                <MonthGrid cursor={cursor} selected={selected} onSelect={setSelected} map={map} hours={hours} weekStartsOn={settings.weekStartsOn} />
              ) : (
                <WeekGrid cursor={cursor} map={map} weekStartsOn={settings.weekStartsOn} onSelect={setSelected} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <Agenda date={selected} items={map.get(selected) ?? []} hours={hours.get(selected) ?? 0} />
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-subtle">
        {EVENT_KINDS.map((k) => (
          <span key={k.value} className="flex items-center gap-1.5">
            <Dot hue={k.hue} /> {k.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <StatusIcon status="todo" size={12} /> Task due
        </span>
        <span className="ml-auto">Drag items between days to reschedule</span>
      </div>
    </Page>
  )
}

function Chip({ item }: { item: Item }) {
  const openCapture = useUI((s) => s.openCapture)
  const openTask = useUI((s) => s.openTask)
  const isEvent = item.kind === 'event'
  const hue = isEvent ? eventMeta(item.e.kind).hue : 'slate'
  const done = !isEvent && item.t.status === 'done'
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-workbench', JSON.stringify({ kind: item.kind, id: isEvent ? item.e.id : item.t.id }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (isEvent) openCapture('event', { eventId: item.e.id })
        else openTask(item.t.id)
      }}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11.5px] transition-transform hover:scale-[1.02] active:cursor-grabbing',
        isEvent ? 'text-fg' : 'text-muted',
        done && 'line-through opacity-50',
      )}
      style={isEvent ? { background: hueColor(hue, 0.16), boxShadow: `inset 2px 0 0 ${hueColor(hue)}` } : undefined}
    >
      {isEvent ? (
        item.e.start && <span className="font-mono text-[10.5px] text-muted">{item.e.start}</span>
      ) : (
        <StatusIcon status={item.t.status} size={11} />
      )}
      <span className="truncate">{isEvent ? item.e.title : item.t.title}</span>
    </div>
  )
}

function MonthGrid({
  cursor,
  selected,
  onSelect,
  map,
  hours,
  weekStartsOn,
}: {
  cursor: Date
  selected: string
  onSelect: (k: string) => void
  map: Map<string, Item[]>
  hours: Map<string, number>
  weekStartsOn: 0 | 1
}) {
  const openCapture = useUI((s) => s.openCapture)
  const [over, setOver] = useState<string | null>(null)
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn }),
  })
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="px-3 py-2.5 text-[11px] font-medium tracking-wide text-subtle uppercase">
            {format(d, 'EEE')}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const k = toKey(d)
          const items = map.get(k) ?? []
          const h = hours.get(k) ?? 0
          const inMonth = isSameMonth(d, cursor)
          return (
            <div
              key={k}
              onClick={() => onSelect(k)}
              onDoubleClick={() => openCapture('event', { date: k })}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(k)
              }}
              onDragLeave={() => setOver((o) => (o === k ? null : o))}
              onDrop={(e) => {
                setOver(null)
                onDropReschedule(e, k)
              }}
              className={cn(
                'group relative min-h-[112px] cursor-pointer border-border p-1.5 transition-colors',
                i % 7 !== 6 && 'border-r',
                i < days.length - 7 && 'border-b',
                !inMonth && 'bg-surface-2/25',
                selected === k && 'bg-accent-soft',
                over === k && 'bg-accent/15',
                'hover:bg-surface-2/50',
              )}
            >
              <div className="mb-1 flex items-center justify-between px-1">
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full text-[12.5px] tabular',
                    isToday(d) ? 'bg-accent font-semibold text-accent-fg shadow-[0_0_12px_var(--accent-glow)]' : inMonth ? 'text-fg' : 'text-subtle/60',
                  )}
                >
                  {format(d, 'd')}
                </span>
                {h > 0 && <span className="font-mono text-[10px] text-subtle">{formatHours(h)}h</span>}
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((it) => (
                  <Chip key={it.kind === 'event' ? it.e.id : it.t.id} item={it} />
                ))}
                {items.length > 3 && <div className="px-1.5 text-[10.5px] text-subtle">+{items.length - 3} more</div>}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openCapture('event', { date: k })
                }}
                className="absolute top-1.5 right-8 grid size-5 place-items-center rounded-md text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-3 hover:text-fg"
                aria-label="Add event"
              >
                <Plus className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const HOUR_START = 7
const HOUR_END = 20
const ROW = 44

function WeekGrid({ cursor, map, weekStartsOn, onSelect }: { cursor: Date; map: Map<string, Item[]>; weekStartsOn: 0 | 1; onSelect: (k: string) => void }) {
  const openCapture = useUI((s) => s.openCapture)
  const start = startOfWeek(cursor, { weekStartsOn })
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const hoursArr = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const now = new Date()
  const nowTop = ((now.getHours() + now.getMinutes() / 60 - HOUR_START) * ROW)
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
        <div />
        {days.map((d) => {
          const k = toKey(d)
          const allDay = (map.get(k) ?? []).filter((i) => i.kind === 'task' || !i.e.start)
          return (
            <div
              key={k}
              onClick={() => onSelect(k)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropReschedule(e, k)}
              className="min-h-[72px] border-l border-border p-1.5"
            >
              <div className="mb-1 flex items-baseline gap-1.5 px-1">
                <span className="text-[11px] font-medium text-subtle uppercase">{format(d, 'EEE')}</span>
                <span className={cn('grid size-6 place-items-center rounded-full text-[13px] font-semibold', isToday(d) && 'bg-accent text-accent-fg')}>{format(d, 'd')}</span>
              </div>
              <div className="space-y-0.5">
                {allDay.slice(0, 3).map((it) => (
                  <Chip key={it.kind === 'event' ? it.e.id : it.t.id} item={it} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="relative max-h-[62vh] overflow-y-auto">
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: hoursArr.length * ROW }}>
          <div>
            {hoursArr.map((h) => (
              <div key={h} style={{ height: ROW }} className="pr-2 text-right font-mono text-[10.5px] text-subtle">
                {format(new Date(2000, 0, 1, h), 'ha').toLowerCase()}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const k = toKey(d)
            const timed = (map.get(k) ?? []).filter((i): i is Extract<Item, { kind: 'event' }> => i.kind === 'event' && !!i.e.start)
            return (
              <div
                key={k}
                className="relative border-l border-border"
                onDoubleClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                  const hour = Math.floor((e.clientY - rect.top) / ROW) + HOUR_START
                  openCapture('event', { date: k, start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour + 1).padStart(2, '0')}:00` })
                }}
              >
                {hoursArr.map((h) => (
                  <div key={h} style={{ height: ROW }} className="border-b border-border/50" />
                ))}
                {timed.map(({ e }) => {
                  const s = toMin(e.start!)
                  const en = e.end ? toMin(e.end) : s + 60
                  const top = ((s - HOUR_START * 60) / 60) * ROW
                  const height = Math.max(22, ((en - s) / 60) * ROW - 2)
                  const hue = eventMeta(e.kind).hue
                  return (
                    <motion.button
                      key={e.id}
                      layout
                      onClick={() => openCapture('event', { eventId: e.id })}
                      className="absolute right-1 left-1 overflow-hidden rounded-lg px-2 py-1 text-left text-[11.5px]"
                      style={{ top, height, background: hueColor(hue, 0.2), boxShadow: `inset 3px 0 0 ${hueColor(hue)}` }}
                    >
                      <div className="truncate font-medium">{e.title}</div>
                      <div className="font-mono text-[10px] text-muted">
                        {e.start}
                        {e.end && `–${e.end}`}
                      </div>
                    </motion.button>
                  )
                })}
                {isToday(d) && nowTop > 0 && nowTop < hoursArr.length * ROW && (
                  <div className="pointer-events-none absolute right-0 left-0 z-10 flex items-center" style={{ top: nowTop }}>
                    <span className="-ml-1 size-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Agenda({ date, items, hours }: { date: string; items: Item[]; hours: number }) {
  const openCapture = useUI((s) => s.openCapture)
  const openTask = useUI((s) => s.openTask)
  const projects = useTable('projects')
  const nameOf = usePersonName()
  const d = fromKey(date)
  return (
    <aside className="rounded-2xl border border-border bg-surface/70 p-5 backdrop-blur-sm xl:sticky xl:top-6 xl:self-start">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-medium text-subtle uppercase">{format(d, 'EEEE')}</div>
          <div className="font-serif text-4xl leading-none">{format(d, 'MMM d')}</div>
        </div>
        <IconButton label="Add event" onClick={() => openCapture('event', { date })}>
          <Plus />
        </IconButton>
      </div>
      {hours > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-[12.5px] text-muted">
          <Clock className="size-3.5" /> {formatHours(hours)}h logged
        </div>
      )}
      <div className="mt-4 space-y-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.length === 0 && (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8 text-center text-sm text-subtle">
              Nothing scheduled.
            </motion.p>
          )}
          {items.map((it) => {
            const isEvent = it.kind === 'event'
            const pid = isEvent ? it.e.projectId : it.t.projectId
            const p = pid ? projects[pid] : undefined
            return (
              <motion.button
                layout
                key={isEvent ? it.e.id : it.t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => (isEvent ? openCapture('event', { eventId: it.e.id }) : openTask(it.t.id))}
                className="flex w-full gap-3 rounded-xl border border-border bg-surface-2/40 p-3 text-left transition-colors hover:border-border-strong"
              >
                <span className="w-1 shrink-0 rounded-full" style={{ background: hueColor(isEvent ? eventMeta(it.e.kind).hue : 'slate') }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{isEvent ? it.e.title : it.t.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-subtle">
                    {isEvent ? (it.e.start ? `${it.e.start}${it.e.end ? `–${it.e.end}` : ''}` : eventMeta(it.e.kind).label) : `Task · ${nameOf(it.t.assigneeId).me ? 'you' : nameOf(it.t.assigneeId).name}`}
                    {p && ` · ${p.number || p.name}`}
                  </div>
                  {isEvent && it.e.notes && <p className="mt-1.5 line-clamp-2 text-xs text-muted">{it.e.notes}</p>}
                </div>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </aside>
  )
}
