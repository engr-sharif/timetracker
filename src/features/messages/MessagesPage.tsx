import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  Ellipsis,
  FileText,
  Hash,
  MessageSquare,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  SquareCheckBig,
  Trash,
  X,
} from 'lucide-react'
import { cn, copyText, formatBytes } from '@/lib/utils'
import { putBlob, blobUrl, fileKind } from '@/lib/files'
import { useAuth } from '@/store/auth'
import { useUI } from '@/store/ui'
import { useList, useRecord, useTable, ws } from '@/store/workspace'
import type { Channel, Message } from '@/store/types'
import { Button, IconButton } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Avatar, Dot, EmptyState } from '@/components/ui/misc'
import { MenuItem, MenuSeparator, Popover, Tooltip } from '@/components/ui/popover'
import { Dialog, confirm } from '@/components/ui/dialog'
import { ProjectPicker, usePersonName } from '@/components/ui/pickers'
import { nextOrder } from '@/features/tasks/TaskForm'
import { renderRich } from './rich'

const QUICK_REACTIONS = ['👍', '✅', '👀', '🎉', '🙏', '🔥', '❤️', '😂']

export default function MessagesPage() {
  const { channelId } = useParams()
  const channels = useList('channels')
  const messages = useList('messages')
  const projects = useTable('projects')
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const sorted = useMemo(() => channels.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name)), [channels])
  const lastActivity = useMemo(() => {
    const m = new Map<string, string>()
    for (const msg of messages) if ((m.get(msg.channelId) ?? '') < msg.createdAt) m.set(msg.channelId, msg.createdAt)
    return m
  }, [messages])

  useEffect(() => {
    if (!channelId && sorted[0] && window.innerWidth >= 768) navigate(`/messages/${sorted[0].id}`, { replace: true })
  }, [channelId, sorted, navigate])

  return (
    <div className="flex h-full">
      <aside className={cn('flex w-full shrink-0 flex-col border-r border-border bg-bg-elev/40 md:w-64', channelId && 'hidden md:flex')}>
        <div className="flex items-center justify-between px-4 pt-6 pb-3">
          <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
          <IconButton label="New channel" onClick={() => setCreating(true)}>
            <Plus />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Channels</div>
          {sorted.map((c) => {
            const p = c.projectId ? projects[c.projectId] : undefined
            const active = c.id === channelId
            return (
              <Link key={c.id} to={`/messages/${c.id}`} className={cn('group relative flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13.5px] transition-colors', active ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}>
                {active && <motion.span layoutId="chan-active" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Hash className="relative size-3.5 text-subtle" />
                <span className="relative flex-1 truncate">{c.name}</span>
                {p && <Dot hue={p.color} className="relative size-1.5" />}
                {lastActivity.get(c.id) && <span className="relative text-[10.5px] text-subtle">{format(new Date(lastActivity.get(c.id)!), isToday(new Date(lastActivity.get(c.id)!)) ? 'p' : 'MMM d')}</span>}
              </Link>
            )
          })}
          <button onClick={() => setCreating(true)} className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] text-subtle hover:bg-surface-2/60 hover:text-fg">
            <Plus className="size-3.5" /> Add channel
          </button>
        </div>
        <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-subtle">
          Channels are your running log per project — decisions, links, files. Teammates are listed as people; live multi-user chat needs a shared backend.
        </p>
      </aside>
      <section className={cn('flex min-w-0 flex-1 flex-col', !channelId && 'hidden md:flex')}>
        {channelId ? (
          <ChannelView key={channelId} id={channelId} />
        ) : sorted.length === 0 ? (
          <EmptyState
            className="h-full"
            icon={<Hash />}
            title="Start a channel"
            body="Keep a running log per project: decisions, links, files, and who said what. Turn any message into a task."
            action={
              <Button
                variant="primary"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  const c = ws().create('channels', { name: 'general', topic: 'Notes to self, links and quick updates', memberIds: [], archived: false })
                  navigate(`/messages/${c.id}`)
                }}
              >
                Create #general
              </Button>
            }
          />
        ) : (
          <EmptyState className="h-full" icon={<Hash />} title="Pick a channel" />
        )}
      </section>
      <NewChannelDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function NewChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [projectId, setProjectId] = useState<string>()
  const navigate = useNavigate()
  const submit = () => {
    const slug = name.trim().toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')
    if (!slug) return
    const c = ws().create('channels', { name: slug, topic, projectId, memberIds: [], archived: false })
    onClose()
    setName('')
    setTopic('')
    navigate(`/messages/${c.id}`)
  }
  return (
    <Dialog open={open} onClose={onClose} title="New channel" footer={<Button variant="primary" onClick={submit} disabled={!name.trim()}>Create channel</Button>}>
      <div className="space-y-4">
        <Field label="Name">
          <Input autoFocus icon={<Hash />} value={name} onChange={(e) => setName(e.target.value)} placeholder="riverside-bridge" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
        <Field label="Topic">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What’s this channel about?" />
        </Field>
        <Field label="Project">
          <div>
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </div>
        </Field>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function dayLabel(d: Date) {
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d')
}

function ChannelView({ id }: { id: string }) {
  const channel = useRecord('channels', id)
  const all = useList('messages')
  const people = useList('people')
  const projects = useTable('projects')
  const [thread, setThread] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [showPins, setShowPins] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const msgs = useMemo(() => all.filter((m) => m.channelId === id && !m.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [all, id])
  const replies = useMemo(() => {
    const m = new Map<string, Message[]>()
    for (const r of all) if (r.channelId === id && r.parentId) m.set(r.parentId, [...(m.get(r.parentId) ?? []), r])
    return m
  }, [all, id])
  const shown = useMemo(() => {
    let list = msgs
    if (showPins) list = list.filter((m) => m.pinned)
    if (q.trim()) list = list.filter((m) => m.body.toLowerCase().includes(q.toLowerCase()))
    return list
  }, [msgs, q, showPins])
  const names = useMemo(() => people.map((p) => p.name), [people])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [msgs.length])

  if (!channel) return <EmptyState className="h-full" icon={<Hash />} title="Channel not found" />
  const p = channel.projectId ? projects[channel.projectId] : undefined
  const threadMsg = thread ? all.find((m) => m.id === thread) : undefined

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg-elev/40 px-4 backdrop-blur-xl sm:px-6">
          <Link to="/messages" className="text-subtle md:hidden">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[15px] font-semibold">
              <Hash className="size-4 text-subtle" />
              {channel.name}
            </div>
            <div className="flex items-center gap-2 truncate text-xs text-subtle">
              {p && (
                <button onClick={() => navigate(`/projects/${p.id}`)} className="flex items-center gap-1 hover:text-fg">
                  <Dot hue={p.color} className="size-1.5" />
                  {p.number}
                </button>
              )}
              <span className="truncate">{channel.topic}</span>
            </div>
          </div>
          <div className="hidden -space-x-1.5 sm:flex">
            {channel.memberIds.slice(0, 4).map((mid) => {
              const person = people.find((x) => x.id === mid)
              return person ? <Avatar key={mid} name={person.name} hue={person.color} size={24} ring /> : null
            })}
          </div>
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="hidden w-44 lg:flex" />
          <Tooltip content="Pinned messages">
            <IconButton label="Pinned" active={showPins} onClick={() => setShowPins((s) => !s)}>
              <Pin />
            </IconButton>
          </Tooltip>
          <ChannelMenu channel={channel} />
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-4">
          {shown.length === 0 && (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
                  <Hash className="size-6" />
                </div>
                <h3 className="text-lg font-semibold">{showPins ? 'No pinned messages' : q ? 'No matches' : `This is the start of #${channel.name}`}</h3>
                <p className="mt-1 text-sm text-muted">{channel.topic}</p>
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {shown.map((m, i) => {
              const prev = shown[i - 1]
              const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt))
              const grouped = !newDay && prev.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000
              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="sticky top-0 z-10 my-3 flex items-center gap-3 px-3">
                      <span className="h-px flex-1 bg-border" />
                      <span className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-muted shadow-soft">{dayLabel(new Date(m.createdAt))}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <MessageRow m={m} grouped={grouped} replies={replies.get(m.id) ?? []} names={names} onThread={() => setThread(m.id)} channel={channel} />
                </div>
              )
            })}
          </AnimatePresence>
        </div>
        <Composer channel={channel} names={names} />
      </div>
      <AnimatePresence>
        {threadMsg && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="hidden shrink-0 flex-col overflow-hidden border-l border-border bg-bg-elev/40 lg:flex"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div>
                <div className="text-[14px] font-semibold">Thread</div>
                <div className="text-xs text-subtle">#{channel.name}</div>
              </div>
              <IconButton label="Close thread" onClick={() => setThread(null)}>
                <X />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <MessageRow m={threadMsg} grouped={false} replies={[]} names={names} channel={channel} inThread />
              <div className="my-2 flex items-center gap-3 px-4 text-[11px] text-subtle">
                {(replies.get(threadMsg.id) ?? []).length} replies <span className="h-px flex-1 bg-border" />
              </div>
              {(replies.get(threadMsg.id) ?? [])
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                .map((r) => (
                  <MessageRow key={r.id} m={r} grouped={false} replies={[]} names={names} channel={channel} inThread />
                ))}
            </div>
            <Composer channel={channel} names={names} parentId={threadMsg.id} />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChannelMenu({ channel }: { channel: Channel }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  return (
    <>
      <Popover
        role="menu"
        placement="bottom-end"
        trigger={
          <IconButton label="Channel options">
            <Ellipsis />
          </IconButton>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Edit channel
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<Trash />}
          danger
          onSelect={async () => {
            if (!(await confirm({ title: `Delete #${channel.name}?`, body: 'All messages in this channel will be removed.', confirmLabel: 'Delete channel', danger: true }))) return
            const msgs = Object.values(ws().doc.tables.messages).filter((m) => m.channelId === channel.id)
            ws().remove('messages', msgs.map((m) => m.id))
            ws().remove('channels', channel.id)
            navigate('/messages')
          }}
        >
          Delete channel
        </MenuItem>
      </Popover>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit channel">
        <div className="space-y-4">
          <Field label="Name">
            <Input value={channel.name} onChange={(e) => ws().update('channels', channel.id, { name: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
          </Field>
          <Field label="Topic">
            <Input value={channel.topic} onChange={(e) => ws().update('channels', channel.id, { topic: e.target.value })} />
          </Field>
          <Field label="Project">
            <div>
              <ProjectPicker value={channel.projectId} onChange={(projectId) => ws().update('channels', channel.id, { projectId })} />
            </div>
          </Field>
        </div>
      </Dialog>
    </>
  )
}

function Attachment({ id }: { id: string }) {
  const meta = useRecord('files', id)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    void blobUrl(id).then(setUrl)
  }, [id])
  if (!meta) return null
  const isImage = fileKind(meta.name, meta.type) === 'image'
  return isImage && url ? (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block max-w-sm overflow-hidden rounded-xl border border-border">
      <img src={url} alt={meta.name} className="max-h-72 w-full object-cover" />
    </a>
  ) : (
    <a href={url ?? '#'} download={meta.name} className="mt-2 flex max-w-sm items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-3 hover:border-border-strong">
      <FileText className="size-5 text-accent-strong" />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{meta.name}</div>
        <div className="text-[11px] text-subtle">{formatBytes(meta.size)}</div>
      </div>
    </a>
  )
}

function MessageRow({ m, grouped, replies, names, onThread, channel, inThread }: { m: Message; grouped: boolean; replies: Message[]; names: string[]; onThread?: () => void; channel: Channel; inThread?: boolean }) {
  const nameOf = usePersonName()
  const account = useAuth((s) => s.account)
  const who = nameOf(m.authorId)
  const [editing, setEditing] = useState(false)
  const openTask = useUI((s) => s.openTask)

  const react = (emoji: string) => {
    const cur = m.reactions[emoji] ?? []
    const next = cur.includes('me') ? cur.filter((x) => x !== 'me') : [...cur, 'me']
    const reactions = { ...m.reactions, [emoji]: next }
    if (!next.length) delete reactions[emoji]
    ws().update('messages', m.id, { reactions })
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className={cn('group relative flex gap-3 rounded-xl px-3 transition-colors hover:bg-surface-2/40', grouped ? 'py-0.5' : 'pt-2.5 pb-1', m.pinned && 'bg-warning/5')}
    >
      <div className="w-9 shrink-0">
        {!grouped ? (
          <Avatar name={who.name} hue={who.hue} src={who.me ? account?.avatar : undefined} size={36} />
        ) : (
          <span className="block pt-1 text-right text-[10px] text-subtle opacity-0 group-hover:opacity-100">{format(new Date(m.createdAt), 'h:mm')}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold">{who.name}</span>
            <span className="text-[11px] text-subtle">{format(new Date(m.createdAt), 'h:mm a')}</span>
            {m.pinned && <Pin className="size-3 text-warning" />}
          </div>
        )}
        {editing ? (
          <textarea
            autoFocus
            defaultValue={m.body}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const body = (e.target as HTMLTextAreaElement).value.trim()
                if (body) ws().update('messages', m.id, { body, editedAt: new Date().toISOString() })
                setEditing(false)
              } else if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={() => setEditing(false)}
            className="field-sizing-content mt-1 w-full resize-none rounded-lg border border-accent/50 bg-surface-2 p-2 text-[14px] outline-none"
          />
        ) : (
          <div className="text-[14px] leading-relaxed break-words text-fg/90">
            {renderRich(m.body, names)}
            {m.editedAt && <span className="ml-1 text-[11px] text-subtle">(edited)</span>}
          </div>
        )}
        {m.attachmentIds.map((a) => (
          <Attachment key={a} id={a} />
        ))}
        {Object.keys(m.reactions).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(m.reactions).map(([emoji, who]) => (
              <motion.button
                key={emoji}
                layout
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                onClick={() => react(emoji)}
                className={cn('flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors', who.includes('me') ? 'border-accent/50 bg-accent-soft' : 'border-border bg-surface-2/60 hover:border-border-strong')}
              >
                {emoji} <span className="tabular text-muted">{who.length}</span>
              </motion.button>
            ))}
          </div>
        )}
        {!inThread && replies.length > 0 && (
          <button onClick={onThread} className="mt-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-medium text-accent-strong hover:bg-surface-2">
            <MessageSquare className="size-3.5" />
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            <span className="font-normal text-subtle">Last {format(new Date(replies[replies.length - 1].createdAt), 'MMM d, h:mm a')}</span>
          </button>
        )}
      </div>

      <div className="glass absolute -top-3 right-3 z-10 hidden items-center gap-0.5 rounded-lg p-0.5 shadow-soft group-hover:flex">
        {QUICK_REACTIONS.slice(0, 3).map((e) => (
          <button key={e} onClick={() => react(e)} className="grid size-7 place-items-center rounded-md text-sm hover:bg-surface-3">
            {e}
          </button>
        ))}
        <Popover
          placement="top-end"
          className="p-1.5"
          trigger={
            <button className="grid size-7 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg" aria-label="More reactions">
              <Plus className="size-3.5" />
            </button>
          }
        >
          {({ close }) => (
            <div className="grid grid-cols-4 gap-0.5">
              {QUICK_REACTIONS.map((e) => (
                <button key={e} onClick={() => { react(e); close() }} className="grid size-9 place-items-center rounded-md text-lg hover:bg-surface-3">
                  {e}
                </button>
              ))}
            </div>
          )}
        </Popover>
        {!inThread && (
          <button onClick={onThread} className="grid size-7 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg" aria-label="Reply in thread">
            <MessageSquare className="size-3.5" />
          </button>
        )}
        <Popover
          role="menu"
          placement="bottom-end"
          trigger={
            <button className="grid size-7 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg" aria-label="Message actions">
              <Ellipsis className="size-3.5" />
            </button>
          }
        >
          <MenuItem
            icon={<SquareCheckBig />}
            onSelect={() => {
              const t = ws().create('tasks', { title: m.body.slice(0, 140), notes: m.body.length > 140 ? m.body : '', projectId: channel.projectId, assigneeId: 'me', assignedById: m.authorId, status: 'todo', priority: 'none', labels: [], subtasks: [], order: nextOrder('todo') })
              toast.success('Task created from message', { action: { label: 'Open', onClick: () => openTask(t.id) } })
            }}
          >
            Create task
          </MenuItem>
          <MenuItem icon={<Pin />} onSelect={() => ws().update('messages', m.id, { pinned: !m.pinned })}>
            {m.pinned ? 'Unpin' : 'Pin message'}
          </MenuItem>
          <MenuItem
            icon={<Copy />}
            onSelect={async () => {
              await copyText(m.body)
              toast.success('Copied')
            }}
          >
            Copy text
          </MenuItem>
          {m.authorId === 'me' && (
            <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
              Edit
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem
            icon={<Trash />}
            danger
            onSelect={() => {
              const removed = ws().remove('messages', m.id)
              toast('Message deleted', { action: { label: 'Undo', onClick: () => ws().restore('messages', removed) } })
            }}
          >
            Delete
          </MenuItem>
        </Popover>
      </div>
    </motion.div>
  )
}

function Composer({ channel, names, parentId }: { channel: Channel; names: string[]; parentId?: string }) {
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([])
  const [mention, setMention] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const matches = mention !== null ? names.filter((n) => n.toLowerCase().startsWith(mention.toLowerCase())).slice(0, 5) : []

  const send = () => {
    const text = body.trim()
    if (!text && !attachments.length) return
    ws().create('messages', { channelId: channel.id, authorId: 'me', body: text, parentId, reactions: {}, attachmentIds: attachments.map((a) => a.id), pinned: false })
    setBody('')
    setAttachments([])
  }

  const attach = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      const meta = ws().create('files', { name: f.name, size: f.size, type: f.type, projectId: channel.projectId, folder: 'Attachments', starred: false })
      await putBlob(meta.id, f)
      setAttachments((a) => [...a, { id: meta.id, name: f.name }])
    }
  }

  const insertMention = (name: string) => {
    setBody((b) => b.replace(/@([\w.-]*)$/, `@${name.split(' ')[0]} `))
    setMention(null)
    ref.current?.focus()
  }

  return (
    <div className="relative shrink-0 px-3 pt-1 pb-3 sm:px-5 sm:pb-5">
      <AnimatePresence>
        {matches.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass absolute bottom-full left-5 mb-1 w-60 rounded-xl p-1 shadow-float">
            {matches.map((n) => (
              <button key={n} onMouseDown={(e) => { e.preventDefault(); insertMention(n) }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-3/70">
                <Avatar name={n} size={20} /> {n}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="rounded-2xl border border-border-strong bg-surface/90 shadow-soft transition-[border-color,box-shadow] focus-within:border-accent/50 focus-within:shadow-[0_0_0_3px_var(--accent-soft)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void attach(e.dataTransfer.files)
        }}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs">
                <Paperclip className="size-3" /> {a.name}
                <button onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} className="text-subtle hover:text-fg">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            const m = e.target.value.match(/@([\w.-]*)$/)
            setMention(m ? m[1] : null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (matches.length) insertMention(matches[0])
              else send()
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              void attach(e.clipboardData.files)
            }
          }}
          rows={1}
          placeholder={parentId ? 'Reply…' : `Message #${channel.name}`}
          className="field-sizing-content max-h-48 min-h-11 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] outline-none placeholder:text-subtle"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => void attach(e.target.files)} />
          <IconButton label="Attach file" size="sm" onClick={() => fileRef.current?.click()}>
            <Paperclip />
          </IconButton>
          <span className="ml-1 hidden text-[11px] text-subtle sm:inline">**bold** _italic_ `code` @mention · Shift+Enter for new line</span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={send}
            disabled={!body.trim() && !attachments.length}
            className="ml-auto grid size-8 place-items-center rounded-lg bg-accent text-accent-fg transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            <SendHorizontal className="size-4" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
