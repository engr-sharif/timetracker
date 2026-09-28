import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Ellipsis, NotebookPen, Pin, PinOff, Plus, Search, Trash } from 'lucide-react'
import { cn, copyText } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { useList, useRecord, useTable, ws } from '@/store/workspace'
import type { Note } from '@/store/types'
import { Button, IconButton, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Dot, EmptyState } from '@/components/ui/misc'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/popover'
import { ProjectPicker } from '@/components/ui/pickers'
import { confirm } from '@/components/ui/dialog'
import { useCreateActions } from '@/components/layout/CreateMenu'

const NoteEditor = lazy(() => import('./NoteEditor'))

const EMOJI = ['📝', '🗒️', '📌', '💡', '🧠', '📐', '🏗️', '🌉', '💧', '⚡', '🔧', '🧪', '📊', '📈', '🗺️', '🚧', '✅', '🎯', '📅', '☎️', '🤝', '🧾', '📎', '🔍', '🧭', '🌱', '🔥', '⭐', '❓', '👋']

export default function NotesPage() {
  const { id } = useParams()
  const notes = useList('notes')
  const projects = useTable('projects')
  const create = useCreateActions()
  const [q, setQ] = useState('')

  const sorted = useMemo(() => {
    const needle = q.toLowerCase()
    return notes
      .filter((n) => !needle || `${n.title} ${n.text} ${n.tags.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }, [notes, q])

  return (
    <div className="flex h-full">
      <aside className={cn('flex w-full shrink-0 flex-col border-r border-border bg-bg-elev/40 md:w-80', id && 'hidden md:flex')}>
        <div className="flex items-center justify-between px-4 pt-6 pb-3">
          <h1 className="text-xl font-semibold tracking-tight">Notes</h1>
          <IconButton label="New note" onClick={() => create.note()}>
            <Plus />
          </IconButton>
        </div>
        <div className="px-3 pb-3">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-6">
          <AnimatePresence initial={false}>
            {sorted.map((n) => {
              const p = n.projectId ? projects[n.projectId] : undefined
              return (
                <motion.div key={n.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
                  <Link
                    to={`/notes/${n.id}`}
                    className={cn('relative mb-0.5 flex gap-3 rounded-xl px-3 py-2.5 transition-colors', id === n.id ? 'bg-surface-2' : 'hover:bg-surface-2/50')}
                  >
                    {id === n.id && <motion.span layoutId="note-active" className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-accent" />}
                    <span className="mt-0.5 text-lg leading-none">{n.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-medium">{n.title || 'Untitled'}</span>
                        {n.pinned && <Pin className="size-3 shrink-0 text-accent-strong" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-subtle">{n.text.replace(n.title, '').trim() || 'Empty note'}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-subtle">
                        {timeAgo(n.updatedAt)}
                        {p && (
                          <span className="flex items-center gap-1 truncate">
                            <Dot hue={p.color} className="size-1.5" />
                            {p.number || p.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </AnimatePresence>
          {sorted.length === 0 && <p className="py-10 text-center text-sm text-subtle">{q ? 'No matches' : 'No notes yet'}</p>}
        </div>
      </aside>
      <section className={cn('min-w-0 flex-1 overflow-y-auto', !id && 'hidden md:block')}>
        {id ? (
          <NoteView key={id} id={id} />
        ) : (
          <EmptyState
            className="h-full"
            icon={<NotebookPen />}
            title="Think on paper"
            body="Meeting minutes, design reasoning, site observations. Type “/” in a note for headings, checklists and more."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => create.note()}>
                New note
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}

function NoteView({ id }: { id: string }) {
  const note = useRecord('notes', id)
  const navigate = useNavigate()
  const [initial] = useState(() => note?.content)
  if (!note) return <EmptyState icon={<NotebookPen />} title="Note not found" body="It may have been deleted." />

  const update = (patch: Partial<Note>) => ws().update('notes', id, patch)

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this note?', body: note.title || 'Untitled', confirmLabel: 'Delete', danger: true }))) return
    const removed = ws().remove('notes', id)
    navigate('/notes')
    toast('Note deleted', { action: { label: 'Undo', onClick: () => ws().restore('notes', removed) } })
  }

  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-3xl px-5 pt-6 pb-40 sm:px-10 sm:pt-12">
      <div className="mb-6 flex items-center gap-2">
        <Link to="/notes" className="mr-1 text-subtle hover:text-fg md:hidden">
          <ArrowLeft className="size-4" />
        </Link>
        <ProjectPicker value={note.projectId} onChange={(projectId) => update({ projectId })} placeholder="Link project" />
        <span className="ml-auto text-xs text-subtle">Edited {timeAgo(note.updatedAt)}</span>
        <IconButton label={note.pinned ? 'Unpin' : 'Pin'} onClick={() => update({ pinned: !note.pinned })} active={note.pinned}>
          {note.pinned ? <PinOff /> : <Pin />}
        </IconButton>
        <Popover
          role="menu"
          placement="bottom-end"
          trigger={
            <IconButton label="More">
              <Ellipsis />
            </IconButton>
          }
        >
          <MenuItem
            icon={<Copy />}
            onSelect={async () => {
              await copyText(`${note.title}\n\n${note.text}`)
              toast.success('Copied as plain text')
            }}
          >
            Copy as text
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash />} danger onSelect={remove}>
            Delete note
          </MenuItem>
        </Popover>
      </div>
      <Popover
        className="w-[284px] p-2"
        trigger={
          <button className="mb-3 grid size-14 place-items-center rounded-2xl text-[40px] leading-none transition-transform hover:scale-105 hover:bg-surface-2" aria-label="Change icon">
            {note.icon}
          </button>
        }
      >
        {({ close }) => (
          <div className="grid grid-cols-6 gap-1">
            {EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => {
                  update({ icon: e })
                  close()
                }}
                className="grid size-10 place-items-center rounded-lg text-xl hover:bg-surface-3/70"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </Popover>
      <textarea
        value={note.title}
        onChange={(e) => update({ title: e.target.value.replace(/\n/g, '') })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(document.querySelector('.prose-editor') as HTMLElement | null)?.focus()
          }
        }}
        placeholder="Untitled"
        autoFocus={!note.title}
        rows={1}
        className="field-sizing-content mb-4 w-full resize-none bg-transparent text-[34px] leading-tight font-semibold tracking-[-0.03em] outline-none placeholder:text-subtle/50"
      />
      <Suspense fallback={<Spinner className="size-5 text-subtle" />}>
        <NoteEditor content={initial} onChange={(content, text) => update({ content, text })} />
      </Suspense>
    </motion.article>
  )
}
