import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { addDays, addWeeks, format, isSameWeek } from 'date-fns'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash,
  Clock,
  CopyPlus,
} from 'lucide-react'
import { cn, download, formatHours, hueColor } from '@/lib/utils'
import { fromKey, todayKey, toKey, weekDays, weekStart } from '@/lib/dates'
import { useUI } from '@/store/ui'
import { useList, useSettings, useTable, useWorkspace, ws } from '@/store/workspace'
import type { TimeEntry } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, IconButton } from '@/components/ui/button'
import { AnimatedNumber, Badge, Dot, EmptyState } from '@/components/ui/misc'
import { Popover, MenuItem, MenuSeparator } from '@/components/ui/popover'
import { CostCodePicker, ProjectPicker } from '@/components/ui/pickers'
import { confirm } from '@/components/ui/dialog'

type Row = { key: string; projectId: string; costCode: string }

export default function TimesheetPage() {
  const settings = useSettings()
  const [anchor, setAnchor] = useState(() => new Date())
  const start = weekStart(anchor, settings.weekStartsOn)
  const days = weekDays(start)
  const dayKeys = days.map(toKey)
  const wk = toKey(start)
  const entries = useList('entries')
  const projects = useTable('projects')
  const submittedAt = useWorkspace((s) => s.doc.submittedWeeks[wk])
  const openCapture = useUI((s) => s.openCapture)
  const [extraRows, setExtraRows] = useState<Row[]>([])
  const isThisWeek = isSameWeek(anchor, new Date(), { weekStartsOn: settings.weekStartsOn })

  const weekEntries = useMemo(() => entries.filter((e) => dayKeys.includes(e.date)), [entries, wk]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const map = new Map<string, Row>()
    for (const e of weekEntries) {
      const key = `${e.projectId}::${e.costCode}`
      if (!map.has(key)) map.set(key, { key, projectId: e.projectId, costCode: e.costCode })
    }
    for (const r of extraRows) if (!map.has(r.key)) map.set(r.key, r)
    return [...map.values()].sort(
      (a, b) => (projects[a.projectId]?.number ?? '').localeCompare(projects[b.projectId]?.number ?? '') || a.costCode.localeCompare(b.costCode),
    )
  }, [weekEntries, extraRows, projects])

  const cell = (row: Row, day: string) => weekEntries.filter((e) => e.projectId === row.projectId && e.costCode === row.costCode && e.date === day)
  const dayTotals = dayKeys.map((d) => weekEntries.filter((e) => e.date === d).reduce((s, e) => s + e.hours, 0))
  const total = dayTotals.reduce((a, b) => a + b, 0)
  const billable = weekEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0)
  const locked = !!submittedAt

  const copyLastWeek = async () => {
    const prevKeys = weekDays(addWeeks(start, -1)).map(toKey)
    const prev = entries.filter((e) => prevKeys.includes(e.date))
    if (!prev.length) return toast('Nothing logged last week')
    if (!(await confirm({ title: `Copy ${prev.length} entries from last week?`, body: 'Each entry is duplicated onto the same weekday this week.', confirmLabel: 'Copy entries' }))) return
    for (const e of prev) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = e
      ws().create('entries', { ...rest, date: toKey(addDays(fromKey(e.date), 7)) })
    }
    toast.success(`Copied ${prev.length} entries`)
  }

  const exportCsv = () => {
    const header = ['Date', 'Project number', 'Project', 'Client', 'Cost code', 'Hours', 'Billable', 'Description']
    const lines = weekEntries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => {
        const p = projects[e.projectId]
        return [e.date, p?.number ?? '', p?.name ?? '', p?.client ?? '', e.costCode, e.hours, e.billable ? 'Y' : 'N', e.description]
      })
    const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    download(`timesheet-${wk}.csv`, csv, 'text/csv')
    toast.success('CSV exported')
  }

  const toggleSubmit = () => {
    ws().toggleSubmitted(wk)
    toast.success(locked ? 'Week reopened for edits' : 'Week submitted & locked 🔒')
  }

  return (
    <Page wide>
      <PageHeader
        title="Timesheet"
        subtitle={`${format(days[0], 'MMM d')} – ${format(days[6], 'MMM d, yyyy')}`}
        actions={
          <>
            <div className="flex items-center rounded-[10px] border border-border bg-surface-2/60 p-0.5">
              <IconButton label="Previous week" onClick={() => setAnchor(addWeeks(anchor, -1))}>
                <ChevronLeft />
              </IconButton>
              <button
                onClick={() => setAnchor(new Date())}
                className={cn('h-8 rounded-lg px-3 text-[13px] font-medium transition-colors', isThisWeek ? 'text-fg' : 'text-accent-strong hover:bg-surface-3')}
              >
                {isThisWeek ? 'This week' : 'Back to today'}
              </button>
              <IconButton label="Next week" onClick={() => setAnchor(addWeeks(anchor, 1))}>
                <ChevronRight />
              </IconButton>
            </div>
            <Popover
              role="menu"
              placement="bottom-end"
              trigger={
                <Button icon={<Download className="size-4" />} variant="secondary">
                  Export
                </Button>
              }
            >
              <MenuItem icon={<Download />} onSelect={exportCsv}>
                Export week as CSV
              </MenuItem>
              <MenuItem icon={<Copy />} onSelect={copyLastWeek}>
                Copy last week’s entries
              </MenuItem>
            </Popover>
            <Button variant={locked ? 'secondary' : 'primary'} icon={locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} onClick={toggleSubmit} disabled={!total && !locked}>
              {locked ? 'Reopen' : 'Submit week'}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total" value={total} suffix={`/ ${settings.weeklyTarget}h`} progress={total / settings.weeklyTarget} />
        <Stat label="Billable" value={billable} suffix="h" progress={billable / Math.max(1, settings.billableTarget)} tone="success" />
        <Stat label="Utilization" value={total ? Math.round((billable / total) * 100) : 0} suffix="%" />
        <Stat label="Overtime" value={Math.max(0, total - settings.weeklyTarget)} suffix="h" tone={total > settings.weeklyTarget ? 'warning' : undefined} />
      </div>

      <AnimatePresence>
        {locked && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/8 px-4 py-3 text-[13px]">
              <Lock className="size-4 text-success" />
              Submitted {format(new Date(submittedAt), "EEE MMM d 'at' h:mm a")}. The week is locked — reopen to make changes.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="w-[34%] px-4 py-3 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Project / cost code</th>
                {days.map((d, i) => {
                  const today = toKey(d) === todayKey()
                  return (
                    <th key={i} className={cn('px-1 py-2 text-center', today && 'bg-accent-soft')}>
                      <div className={cn('text-[11px] font-medium tracking-wide uppercase', today ? 'text-accent-strong' : 'text-subtle')}>{format(d, 'EEE')}</div>
                      <div className={cn('text-[15px] font-semibold tabular', today ? 'text-accent-strong' : 'text-fg')}>{format(d, 'd')}</div>
                    </th>
                  )
                })}
                <th className="px-4 py-3 text-right text-[11.5px] font-medium tracking-wide text-subtle uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((row, ri) => {
                  const p = projects[row.projectId]
                  const rowTotal = dayKeys.reduce((s, d) => s + cell(row, d).reduce((a, e) => a + e.hours, 0), 0)
                  return (
                    <motion.tr
                      key={row.key}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="group border-b border-border/70 transition-colors hover:bg-surface-2/40"
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <span className="h-8 w-1 rounded-full" style={{ background: hueColor(p?.color) }} />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p?.name ?? 'Unknown project'}</div>
                            <div className="flex items-center gap-2 text-[11.5px] text-subtle">
                              <span className="font-mono">{p?.number}</span>
                              {row.costCode && <Badge className="font-mono">{row.costCode}</Badge>}
                            </div>
                          </div>
                        </div>
                      </td>
                      {dayKeys.map((d, di) => (
                        <td key={d} className={cn('px-1 py-1.5 text-center', d === todayKey() && 'bg-accent-soft/60')}>
                          <Cell entries={cell(row, d)} row={row} date={d} locked={locked} coord={[ri, di]} />
                        </td>
                      ))}
                      <td className="px-4 text-right font-mono font-medium tabular">{formatHours(rowTotal)}</td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
              {!locked && (
                <tr>
                  <td colSpan={9} className="px-3 py-2">
                    <AddRow onAdd={(r) => setExtraRows((x) => [...x, r])} />
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2/40">
                <td className="px-4 py-3 text-[12px] font-medium text-muted">Daily total</td>
                {dayTotals.map((t, i) => (
                  <td key={i} className="px-1 py-3 text-center">
                    <span className={cn('font-mono text-[13px] font-semibold tabular', t === 0 ? 'text-subtle/50' : t > 10 ? 'text-warning' : 'text-fg')}>
                      {t ? formatHours(t) : '–'}
                    </span>
                    <div className="mx-auto mt-1.5 h-1 w-8 overflow-hidden rounded-full bg-surface-3">
                      <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (t / 8) * 100)}%` }} />
                    </div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-mono text-base font-semibold text-accent-strong tabular">{formatHours(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {rows.length === 0 && (
          <EmptyState
            icon={<Clock />}
            title="No time logged this week"
            body="Add a row above, press L to log time, or start a timer with T."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openCapture('time', { date: isThisWeek ? todayKey() : dayKeys[0] })}>
                Log time
              </Button>
            }
            className="py-10"
          />
        )}
      </div>

      <EntryList entries={weekEntries} locked={locked} />
    </Page>
  )
}

function Stat({ label, value, suffix, progress, tone }: { label: string; value: number; suffix?: string; progress?: number; tone?: 'success' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur-sm">
      <div className="text-[12px] font-medium text-subtle">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('font-mono text-2xl font-medium tracking-tight', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success')}>
          <AnimatedNumber value={value} decimals={2} />
        </span>
        {suffix && <span className="text-xs text-subtle">{suffix}</span>}
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            className={cn('h-full rounded-full', tone === 'success' ? 'bg-success' : 'bg-accent')}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress * 100)}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 20 }}
          />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function focusCell(r: number, c: number) {
  const el = document.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`)
  el?.focus()
  el?.select()
}

function Cell({ entries, row, date, locked, coord }: { entries: TimeEntry[]; row: Row; date: string; locked: boolean; coord: [number, number] }) {
  const sum = entries.reduce((s, e) => s + e.hours, 0)
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const openCapture = useUI((s) => s.openCapture)

  if (entries.length > 1) {
    return (
      <Popover
        placement="bottom"
        className="w-72 p-2"
        trigger={
          <button className="relative mx-auto flex h-9 w-16 items-center justify-center rounded-lg bg-accent-soft font-mono font-semibold text-accent-strong tabular hover:bg-accent/20">
            {formatHours(sum)}
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" />
          </button>
        }
      >
        {({ close }) => (
          <div className="space-y-1">
            {entries.map((e) => (
              <button
                key={e.id}
                disabled={locked}
                onClick={() => {
                  close()
                  openCapture('time', { entryId: e.id })
                }}
                className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-surface-3/70"
              >
                <span className="font-mono text-[13px] font-semibold">{formatHours(e.hours)}h</span>
                <span className="flex-1 text-[12.5px] text-muted">{e.description || 'No description'}</span>
              </button>
            ))}
          </div>
        )}
      </Popover>
    )
  }

  const commit = () => {
    if (draft === null) return
    const v = Math.max(0, Math.min(24, parseFloat(draft) || 0))
    setDraft(null)
    if (v === sum) return
    const e = entries[0]
    if (e && v === 0) {
      const removed = ws().remove('entries', e.id)
      toast('Entry removed', { action: { label: 'Undo', onClick: () => ws().restore('entries', removed) } })
    } else if (e) ws().update('entries', e.id, { hours: v })
    else if (v > 0)
      ws().create('entries', { date, projectId: row.projectId, costCode: row.costCode, hours: v, description: '', billable: ws().doc.settings.defaultBillable })
  }

  return (
    <div className="group/cell relative mx-auto w-16">
      <input
        ref={ref}
        data-cell={`${coord[0]}-${coord[1]}`}
        disabled={locked}
        inputMode="decimal"
        value={draft ?? (sum ? formatHours(sum) : '')}
        placeholder="·"
        onFocus={(e) => {
          setDraft(sum ? String(sum) : '')
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          const [r, c] = coord
          if (e.key === 'Enter') {
            commit()
            focusCell(r + 1, c)
          } else if (e.key === 'Escape') {
            setDraft(null)
            ref.current?.blur()
          } else if (e.key === 'ArrowDown') focusCell(r + 1, c)
          else if (e.key === 'ArrowUp') focusCell(r - 1, c)
          else if (e.key === 'ArrowRight' && ref.current?.selectionEnd === ref.current?.value.length) focusCell(r, c + 1)
          else if (e.key === 'ArrowLeft' && ref.current?.selectionStart === 0) focusCell(r, c - 1)
        }}
        className={cn(
          'h-9 w-full rounded-lg border border-transparent bg-transparent text-center font-mono tabular transition-all outline-none',
          'placeholder:text-subtle/40 hover:border-border focus:border-accent/60 focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--accent-soft)]',
          sum > 0 && 'font-semibold text-fg',
          locked && 'cursor-default hover:border-transparent',
        )}
      />
      {entries[0]?.description && (
        <span className="pointer-events-none absolute top-1 right-1 size-1 rounded-full bg-subtle/60" title={entries[0].description} />
      )}
    </div>
  )
}

function AddRow({ onAdd }: { onAdd: (r: Row) => void }) {
  const [projectId, setProjectId] = useState<string>()
  const [costCode, setCostCode] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Plus className="ml-1 size-4 text-subtle" />
      <ProjectPicker value={projectId} onChange={(id) => { setProjectId(id); setCostCode('') }} allowNone={false} placeholder="Add a project row" />
      {projectId && <CostCodePicker projectId={projectId} value={costCode} onChange={setCostCode} />}
      {projectId && (
        <Button
          size="xs"
          variant="soft"
          onClick={() => {
            onAdd({ key: `${projectId}::${costCode}`, projectId, costCode })
            setProjectId(undefined)
            setCostCode('')
            setTimeout(() => focusCell(document.querySelectorAll('[data-cell$="-0"]').length - 1, 0), 60)
          }}
        >
          Add row
        </Button>
      )}
    </div>
  )
}

function EntryList({ entries, locked }: { entries: TimeEntry[]; locked: boolean }) {
  const projects = useTable('projects')
  const openCapture = useUI((s) => s.openCapture)
  const byDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) {
      map.set(e.date, [...(map.get(e.date) ?? []), e])
    }
    return [...map.entries()]
  }, [entries])
  if (!entries.length) return null
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[15px] font-semibold tracking-tight">Entries</h2>
      <div className="space-y-6">
        {byDay.map(([day, list]) => (
          <div key={day}>
            <div className="mb-2 flex items-center gap-3 text-[12.5px]">
              <span className="font-semibold">{format(fromKey(day), 'EEEE')}</span>
              <span className="text-subtle">{format(fromKey(day), 'MMM d')}</span>
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-muted">{formatHours(list.reduce((s, e) => s + e.hours, 0))}h</span>
            </div>
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {list.map((e) => {
                  const p = projects[e.projectId]
                  return (
                    <motion.div
                      key={e.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8, height: 0 }}
                      className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-surface/70"
                    >
                      <Dot hue={p?.color} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px]">{e.description || <span className="text-subtle italic">No description</span>}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-subtle">
                          <span className="truncate">{p?.name}</span>
                          {e.costCode && <span className="font-mono">{e.costCode}</span>}
                          {!e.billable && <Badge>Non-billable</Badge>}
                        </div>
                      </div>
                      <span className="font-mono text-[14px] font-semibold tabular">{formatHours(e.hours)}h</span>
                      {!locked && (
                        <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton label="Edit" size="xs" onClick={() => openCapture('time', { entryId: e.id })}>
                            <Pencil />
                          </IconButton>
                          <Popover
                            role="menu"
                            placement="bottom-end"
                            trigger={
                              <IconButton label="More" size="xs">
                                <CopyPlus />
                              </IconButton>
                            }
                          >
                            <MenuItem
                              icon={<CopyPlus />}
                              onSelect={() => {
                                const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = e
                                ws().create('entries', { ...rest, date: todayKey() })
                                toast.success('Duplicated to today')
                              }}
                            >
                              Duplicate to today
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                              danger
                              icon={<Trash />}
                              onSelect={() => {
                                const removed = ws().remove('entries', e.id)
                                toast('Entry deleted', { action: { label: 'Undo', onClick: () => ws().restore('entries', removed) } })
                              }}
                            >
                              Delete
                            </MenuItem>
                          </Popover>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
