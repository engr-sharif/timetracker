import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowRight, Ellipsis, Lightbulb, NotebookPen, Pin, SquareCheckBig, Trash } from 'lucide-react'
import { cn, hueColor, HUE_LIST } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { IDEA_STAGES } from '@/lib/meta'
import { useList, useTable, ws } from '@/store/workspace'
import type { Hue, Idea } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Dot, EmptyState, Segmented } from '@/components/ui/misc'
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '@/components/ui/popover'
import { doc, docToText, p as para } from '@/features/notes/noteUtils'
import { nextOrder } from '@/features/tasks/TaskForm'

export default function IdeasPage() {
  const ideas = useList('ideas')
  const [stage, setStage] = useState<Idea['stage'] | 'all'>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [params] = useSearchParams()
  const focus = params.get('focus')

  const tags = useMemo(() => [...new Set(ideas.flatMap((i) => i.tags))].sort(), [ideas])
  const list = useMemo(
    () =>
      ideas
        .filter((i) => (stage === 'all' ? i.stage !== 'parked' : i.stage === stage))
        .filter((i) => !tag || i.tags.includes(tag))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)),
    [ideas, stage, tag],
  )

  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById(`idea-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
    return () => clearTimeout(t)
  }, [focus])

  const add = () => {
    const t = text.trim()
    if (!t) return
    const colors: Hue[] = ['amber', 'sky', 'emerald', 'violet', 'rose', 'teal', 'pink']
    ws().create('ideas', {
      text: t,
      stage: 'spark',
      color: colors[ideas.length % colors.length],
      tags: Array.from(t.matchAll(/#([\w-]+)/g), (m) => m[1].toLowerCase()),
      pinned: false,
    })
    setText('')
  }

  return (
    <Page wide>
      <PageHeader title="Ideas" subtitle="A place to throw thoughts down and think them through." />

      <div className="relative mb-8">
        <div className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-r from-accent/30 via-transparent to-accent/20 opacity-60 blur-sm" />
        <div className="relative flex items-start gap-3 rounded-3xl border border-border-strong bg-surface/90 p-4 backdrop-blur">
          <Lightbulb className="mt-2 size-5 shrink-0 text-warning" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                add()
              }
            }}
            rows={1}
            placeholder="Throw an idea down…  (#tag it, Enter to keep)"
            className="field-sizing-content max-h-60 min-h-10 flex-1 resize-none bg-transparent py-1 font-serif text-[22px] leading-snug outline-none placeholder:text-subtle/60"
          />
          <AnimatePresence>
            {text.trim() && (
              <motion.button
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                onClick={add}
                className="mt-1 flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-[13px] font-semibold text-accent-fg"
              >
                Keep <ArrowRight className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Segmented
          value={stage}
          onChange={setStage}
          options={[{ value: 'all', label: 'Active' }, ...IDEA_STAGES.map((s) => ({ value: s.value, label: s.label }))]}
        />
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={cn('h-7 rounded-full border px-2.5 text-xs transition-colors', tag === t ? 'border-accent/50 bg-accent-soft text-accent-strong' : 'border-border text-subtle hover:text-fg')}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      {ideas.length === 0 ? (
        <EmptyState icon={<Lightbulb />} title="Your idea garden is empty" body="Half-formed thoughts welcome. Type above and press Enter — you can grow, park or turn them into work later." />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
          <AnimatePresence mode="popLayout">
            {list.map((i, idx) => (
              <IdeaCard key={i.id} idea={i} index={idx} highlight={focus === i.id} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </Page>
  )
}

function IdeaCard({ idea, index, highlight }: { idea: Idea; index: number; highlight: boolean }) {
  const projects = useTable('projects')
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const p = idea.projectId ? projects[idea.projectId] : undefined
  const stage = IDEA_STAGES.find((s) => s.value === idea.stage)!
  const update = (patch: Partial<Idea>) => ws().update('ideas', idea.id, patch)
  const cycle = () => {
    const i = IDEA_STAGES.findIndex((s) => s.value === idea.stage)
    update({ stage: IDEA_STAGES[(i + 1) % IDEA_STAGES.length].value })
  }

  const toTask = () => {
    ws().create('tasks', { title: idea.text.slice(0, 140), notes: idea.text.length > 140 ? idea.text : '', projectId: idea.projectId, assigneeId: 'me', assignedById: 'me', status: 'todo', priority: 'none', labels: idea.tags, subtasks: [], order: nextOrder('todo') })
    update({ stage: 'building' })
    toast.success('Turned into a task')
  }
  const toNote = () => {
    const content = doc(para(idea.text))
    const n = ws().create('notes', { title: idea.text.split(/[.\n]/)[0].slice(0, 80), icon: '💡', content, text: docToText(content), projectId: idea.projectId, pinned: false, tags: idea.tags })
    update({ stage: 'exploring' })
    navigate(`/notes/${n.id}`)
  }

  return (
    <motion.div
      id={`idea-${idea.id}`}
      layout
      initial={{ opacity: 0, y: 16, rotate: index % 2 ? 0.6 : -0.6 }}
      animate={{ opacity: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 26, delay: Math.min(index, 12) * 0.03 } }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -3 }}
      className={cn('group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border p-5 transition-shadow', highlight && 'ring-2 ring-accent')}
      style={{
        background: `linear-gradient(160deg, ${hueColor(idea.color, 0.16)}, ${hueColor(idea.color, 0.05)})`,
        borderColor: hueColor(idea.color, 0.25),
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <button onClick={cycle} className="rounded-full px-2 py-0.5 text-[11px] font-medium transition-transform hover:scale-105" style={{ background: hueColor(stage.hue, 0.2), color: hueColor(stage.hue) }} title="Click to advance stage">
          {stage.label}
        </button>
        {idea.pinned && <Pin className="size-3 text-accent-strong" />}
        <span className="ml-auto text-[11px] text-subtle">{timeAgo(idea.createdAt)}</span>
        <Popover
          role="menu"
          placement="bottom-end"
          trigger={
            <button className="grid size-6 place-items-center rounded-md text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface/50 hover:text-fg" aria-label="Idea actions">
              <Ellipsis className="size-4" />
            </button>
          }
        >
          <MenuItem icon={<SquareCheckBig />} onSelect={toTask}>
            Turn into task
          </MenuItem>
          <MenuItem icon={<NotebookPen />} onSelect={toNote}>
            Expand into note
          </MenuItem>
          <MenuItem icon={<Pin />} onSelect={() => update({ pinned: !idea.pinned })}>
            {idea.pinned ? 'Unpin' : 'Pin to top'}
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Colour</MenuLabel>
          <div className="flex flex-wrap gap-1 px-2.5 pb-2">
            {HUE_LIST.map((h) => (
              <button key={h} onClick={() => update({ color: h })} className="size-5 rounded-full transition-transform hover:scale-110" style={{ background: hueColor(h) }} aria-label={h} />
            ))}
          </div>
          <MenuSeparator />
          <MenuItem
            icon={<Trash />}
            danger
            onSelect={() => {
              const removed = ws().remove('ideas', idea.id)
              toast('Idea deleted', { action: { label: 'Undo', onClick: () => ws().restore('ideas', removed) } })
            }}
          >
            Delete
          </MenuItem>
        </Popover>
      </div>
      {editing ? (
        <textarea
          autoFocus
          defaultValue={idea.text}
          onBlur={(e) => {
            const t = e.target.value.trim()
            if (t && t !== idea.text) update({ text: t, tags: Array.from(t.matchAll(/#([\w-]+)/g), (m) => m[1].toLowerCase()) })
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) (e.target as HTMLTextAreaElement).blur()
          }}
          className="field-sizing-content w-full resize-none bg-transparent font-serif text-[19px] leading-snug outline-none"
        />
      ) : (
        <p onClick={() => setEditing(true)} className="cursor-text font-serif text-[19px] leading-snug whitespace-pre-wrap">
          {idea.text.split(/(#[\w-]+)/g).map((part, i) =>
            part.startsWith('#') ? (
              <span key={i} className="font-sans text-[13px] font-medium" style={{ color: hueColor(idea.color) }}>
                {part}
              </span>
            ) : (
              part
            ),
          )}
        </p>
      )}
      {p && (
        <div className="mt-4 flex items-center gap-1.5 text-[11.5px] text-muted">
          <Dot hue={p.color} className="size-1.5" />
          {p.name}
        </div>
      )}
    </motion.div>
  )
}
