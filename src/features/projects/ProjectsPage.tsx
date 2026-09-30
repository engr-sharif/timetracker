import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { FolderKanban, MapPin, Plus, Search } from 'lucide-react'
import { cn, formatHours, hueColor, hueVars } from '@/lib/utils'
import { relativeDay } from '@/lib/dates'
import { PROJECT_STATUSES } from '@/lib/meta'
import { useList } from '@/store/workspace'
import type { ProjectStatus } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Badge, EmptyState, Segmented } from '@/components/ui/misc'
import { ProjectFormDialog } from './ProjectForm'
import { useProjectStats } from './projectStats'

export default function ProjectsPage() {
  const projects = useList('projects')
  const stats = useProjectStats()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('active')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    const needle = q.toLowerCase()
    return projects
      .filter((p) => filter === 'all' || p.status === filter)
      .filter((p) => !needle || `${p.number} ${p.name} ${p.client}`.toLowerCase().includes(needle))
      .sort((a, b) => (stats.get(b.id)?.lastLogged ?? '').localeCompare(stats.get(a.id)?.lastLogged ?? '') || a.number.localeCompare(b.number))
  }, [projects, filter, q, stats])

  return (
    <Page wide>
      <PageHeader
        title="Projects"
        subtitle={`${projects.filter((p) => p.status === 'active').length} active · ${projects.length} total`}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[...PROJECT_STATUSES.map((s) => ({ value: s.value as ProjectStatus | 'all', label: s.label })), { value: 'all', label: 'All' }]}
        />
        <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, name, client…" className="ml-auto w-full sm:w-72" />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="Add your first project"
          body="Keep project numbers, clients and cost codes in one place — they power your timesheet, tasks and files."
          action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>}
        />
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {list.map((p, i) => {
              const s = stats.get(p.id)
              const burn = p.budgetHours ? (s?.total ?? 0) / p.budgetHours : 0
              return (
                <motion.button
                  layout
                  key={p.id}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.03, type: 'spring', stiffness: 380, damping: 30 } }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ y: -3 }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  style={hueVars(p.color)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/80 p-5 text-left backdrop-blur-sm transition-[border-color,box-shadow] hover:border-[var(--hue-border)] hover:shadow-[0_12px_40px_-12px_var(--hue-soft)]"
                >
                  <div className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-40 blur-3xl transition-opacity group-hover:opacity-80" style={{ background: hueColor(p.color, 0.35) }} />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="grid size-10 place-items-center rounded-xl border border-[var(--hue-border)] bg-[var(--hue-soft)] font-mono text-[13px] font-semibold text-[var(--hue)]">
                      {(p.name.match(/\b\w/g) ?? ['?']).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <Badge hue={PROJECT_STATUSES.find((x) => x.value === p.status)?.hue} dot>
                      {PROJECT_STATUSES.find((x) => x.value === p.status)?.label}
                    </Badge>
                  </div>
                  <div className="relative mt-4">
                    <div className="font-mono text-[12px] text-subtle">{p.number || 'No number'}</div>
                    <div className="mt-0.5 line-clamp-2 text-[15.5px] leading-snug font-semibold tracking-tight">{p.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
                      {p.client}
                      {p.location && (
                        <span className="flex items-center gap-1 truncate text-subtle">
                          <MapPin className="size-3" />
                          {p.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="relative mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                    <Metric label="This week" value={`${formatHours(s?.week ?? 0)}h`} />
                    <Metric label="Total" value={`${formatHours(s?.total ?? 0)}h`} />
                    <Metric label="Open tasks" value={String(s?.openTasks ?? 0)} />
                  </div>
                  {p.budgetHours ? (
                    <div className="relative mt-4">
                      <div className="mb-1 flex justify-between text-[11px] text-subtle">
                        <span>Budget</span>
                        <span className={cn(burn > 0.9 && 'text-warning', burn > 1 && 'text-danger')}>
                          {Math.round(burn * 100)}% of {p.budgetHours}h
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: burn > 1 ? 'var(--danger)' : 'var(--hue)' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, burn * 100)}%` }}
                          transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.2 }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="relative mt-4 text-[11.5px] text-subtle">{s?.lastLogged ? `Last logged ${relativeDay(s.lastLogged).toLowerCase()}` : 'No time logged yet'}</div>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}
      <ProjectFormDialog open={creating} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />
    </Page>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[15px] font-medium tabular">{value}</div>
      <div className="text-[10.5px] text-subtle">{label}</div>
    </div>
  )
}
