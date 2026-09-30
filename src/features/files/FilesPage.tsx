import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  Download,
  Ellipsis,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  Music,
  Ruler,
  Search,
  Star,
  Trash,
  Upload,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { blobUrl, deleteBlob, fileKind, getBlob, putBlob, storageEstimate, type FileKind } from '@/lib/files'
import { useList, useTable, ws } from '@/store/workspace'
import { deleteCloudBlob, useCloud } from '@/store/cloud'
import type { FileMeta, Hue } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Dot, EmptyState, Segmented } from '@/components/ui/misc'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/popover'
import { Dialog } from '@/components/ui/dialog'
import { ProjectPicker } from '@/components/ui/pickers'

const KIND_ICON: Record<FileKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  video: Video,
  audio: Music,
  sheet: FileSpreadsheet,
  doc: FileText,
  cad: Ruler,
  archive: FileArchive,
  text: FileText,
  other: FileIcon,
}
const KIND_TINT: Record<FileKind, string> = {
  image: 'text-[oklch(0.72_0.15_330)]',
  pdf: 'text-[oklch(0.68_0.19_25)]',
  video: 'text-[oklch(0.7_0.15_300)]',
  audio: 'text-[oklch(0.72_0.14_200)]',
  sheet: 'text-[oklch(0.72_0.15_150)]',
  doc: 'text-[oklch(0.7_0.15_255)]',
  cad: 'text-[oklch(0.78_0.14_75)]',
  archive: 'text-muted',
  text: 'text-muted',
  other: 'text-muted',
}

export default function FilesPage() {
  const files = useList('files')
  const projects = useTable('projects')
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [folder, setFolder] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string>()
  const [starred, setStarred] = useState(false)
  const [q, setQ] = useState('')
  const [dragging, setDragging] = useState(false)
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const cloudOn = useCloud((s) => !!s.user)
  const inputRef = useRef<HTMLInputElement>(null)
  const preview = params.get('focus')

  useEffect(() => {
    void storageEstimate().then(setUsage)
  }, [files.length])

  const folders = useMemo(() => [...new Set(files.map((f) => f.folder || 'Unsorted'))].sort(), [files])
  const list = useMemo(() => {
    const needle = q.toLowerCase()
    return files
      .filter((f) => !folder || (f.folder || 'Unsorted') === folder)
      .filter((f) => !projectId || f.projectId === projectId)
      .filter((f) => !starred || f.starred)
      .filter((f) => !needle || f.name.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [files, folder, projectId, starred, q])

  const upload = async (fl: FileList | null) => {
    if (!fl?.length) return
    const arr = Array.from(fl)
    const id = toast.loading(`Uploading ${arr.length} file${arr.length > 1 ? 's' : ''}…`)
    for (const f of arr) {
      const meta = ws().create('files', { name: f.name, size: f.size, type: f.type || 'application/octet-stream', projectId, folder: folder ?? 'Unsorted', starred: false })
      await putBlob(meta.id, f)
    }
    toast.success(`Stored ${arr.length} file${arr.length > 1 ? 's' : ''}`, { id })
  }

  return (
    <div
      className="relative h-full"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void upload(e.dataTransfer.files)
      }}
    >
      <Page wide>
        <PageHeader
          title="Files"
          subtitle={usage ? `${files.length} files · ${formatBytes(usage.usage)} used on this device` : `${files.length} files`}
          actions={
            <>
              <Segmented value={view} onChange={setView} options={[{ value: 'grid', label: '', icon: <LayoutGrid /> }, { value: 'list', label: '', icon: <List /> }]} />
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                Upload
              </Button>
            </>
          }
        />
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-1">
            <FolderButton icon={FolderOpen} label="All files" count={files.length} active={!folder && !starred} onClick={() => { setFolder(null); setStarred(false) }} />
            <FolderButton icon={Star} label="Starred" count={files.filter((f) => f.starred).length} active={starred} onClick={() => { setStarred(true); setFolder(null) }} />
            <div className="px-3 pt-4 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Folders</div>
            {folders.map((f) => (
              <FolderButton key={f} icon={Folder} label={f} count={files.filter((x) => (x.folder || 'Unsorted') === f).length} active={folder === f} onClick={() => { setFolder(f); setStarred(false) }} />
            ))}
            <button
              onClick={() => {
                const name = prompt('New folder name')
                if (name?.trim()) setFolder(name.trim())
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-[12.5px] text-subtle hover:bg-surface-2/60 hover:text-fg"
            >
              + New folder
            </button>
            {usage && usage.quota > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-surface/60 p-3">
                <div className="mb-1.5 flex justify-between text-[11px] text-subtle">
                  <span>Device storage</span>
                  <span>{Math.round((usage.usage / usage.quota) * 1000) / 10}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, (usage.usage / usage.quota) * 100)}%` }} />
                </div>
                <p className="mt-2 text-[10.5px] leading-snug text-subtle">{cloudOn ? 'Files sync through Workbench Cloud and download on demand on your other devices.' : 'Files stay on this device. Connect Workbench Cloud in Settings to sync them.'}</p>
              </div>
            )}
          </aside>
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <ProjectPicker value={projectId} onChange={setProjectId} placeholder="Any project" />
              <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="ml-auto w-full sm:w-64" />
            </div>
            {files.length === 0 ? (
              <button onClick={() => inputRef.current?.click()} className="w-full rounded-3xl border-2 border-dashed border-border-strong transition-colors hover:border-accent/50 hover:bg-accent-soft">
                <EmptyState icon={<Upload />} title="Drop files anywhere" body="Drawings, calcs, photos, specs. Stored privately on this device, organised by project and folder." />
              </button>
            ) : view === 'grid' ? (
              <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <AnimatePresence mode="popLayout">
                  {list.map((f) => (
                    <FileTile key={f.id} f={f} onOpen={() => setParams({ focus: f.id })} projectColor={f.projectId ? projects[f.projectId]?.color : undefined} />
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface/70">
                {list.map((f) => {
                  const k = fileKind(f.name, f.type)
                  const Icon = KIND_ICON[k]
                  const p = f.projectId ? projects[f.projectId] : undefined
                  return (
                    <div key={f.id} className="group flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0 hover:bg-surface-2/40">
                      <Icon className={cn('size-5', KIND_TINT[k])} />
                      <button onClick={() => setParams({ focus: f.id })} className="min-w-0 flex-1 truncate text-left text-[13.5px]">
                        {f.name}
                      </button>
                      {p && (
                        <span className="hidden items-center gap-1.5 text-xs text-subtle md:flex">
                          <Dot hue={p.color} className="size-1.5" />
                          {p.number}
                        </span>
                      )}
                      <span className="w-20 text-right text-xs text-subtle">{formatBytes(f.size)}</span>
                      <span className="hidden w-20 text-right text-xs text-subtle sm:block">{timeAgo(f.createdAt)}</span>
                      <FileMenu f={f} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </Page>

      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-center">
              <Upload className="mx-auto size-10 text-accent-strong" />
              <div className="mt-3 text-lg font-semibold">Drop to upload</div>
              <div className="text-sm text-muted">{folder ? `into ${folder}` : 'Files stay on this device'}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Preview id={preview} onClose={() => setParams({})} />
    </div>
  )
}

function FolderButton({ icon: Icon, label, count, active, onClick }: { icon: LucideIcon; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors', active ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}>
      {active && <motion.span layoutId="folder-active" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      <Icon className={cn('relative size-4', active ? 'text-accent-strong' : 'text-subtle')} />
      <span className="relative flex-1 truncate text-left">{label}</span>
      <span className="relative text-[11px] text-subtle">{count}</span>
    </button>
  )
}

function useBlobUrl(id: string, enabled = true) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (enabled) void blobUrl(id).then(setUrl)
  }, [id, enabled])
  return url
}

function FileTile({ f, onOpen, projectColor }: { f: FileMeta; onOpen: () => void; projectColor?: Hue }) {
  const k = fileKind(f.name, f.type)
  const url = useBlobUrl(f.id, k === 'image')
  const Icon = KIND_ICON[k]
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="group relative overflow-hidden rounded-2xl border border-border bg-surface/80 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-border-strong">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-surface-2/60">
          {k === 'image' && url ? <img src={url} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <Icon className={cn('size-10', KIND_TINT[k])} strokeWidth={1.4} />}
        </div>
        <div className="p-3">
          <div className="truncate text-[13px] font-medium">{f.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
            {projectColor && <Dot hue={projectColor} className="size-1.5" />}
            {formatBytes(f.size)} · {timeAgo(f.createdAt)}
          </div>
        </div>
      </button>
      {f.starred && <Star className="absolute top-2.5 left-2.5 size-4 fill-warning text-warning drop-shadow" />}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <FileMenu f={f} glass />
      </div>
    </motion.div>
  )
}

async function downloadFile(f: FileMeta) {
  const blob = await getBlob(f.id)
  if (!blob) return toast.error('This file isn’t stored on this device')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function FileMenu({ f, glass }: { f: FileMeta; glass?: boolean }) {
  return (
    <Popover
      role="menu"
      placement="bottom-end"
      trigger={
        <button className={cn('grid size-7 place-items-center rounded-lg text-subtle hover:text-fg', glass ? 'glass' : 'hover:bg-surface-3')} aria-label="File actions">
          <Ellipsis className="size-4" />
        </button>
      }
    >
      <MenuItem icon={<Download />} onSelect={() => void downloadFile(f)}>
        Download
      </MenuItem>
      <MenuItem icon={<Star />} onSelect={() => ws().update('files', f.id, { starred: !f.starred })}>
        {f.starred ? 'Unstar' : 'Star'}
      </MenuItem>
      <MenuItem
        icon={<Folder />}
        onSelect={() => {
          const folder = prompt('Move to folder', f.folder)
          if (folder?.trim()) ws().update('files', f.id, { folder: folder.trim() })
        }}
      >
        Move to folder…
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Trash />}
        danger
        onSelect={async () => {
          ws().remove('files', f.id)
          await deleteBlob(f.id)
          void deleteCloudBlob(f.id)
          toast('File deleted')
        }}
      >
        Delete
      </MenuItem>
    </Popover>
  )
}

function Preview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const files = useTable('files')
  const f = id ? files[id] : undefined
  const [last, setLast] = useState(f)
  if (f && f !== last) setLast(f)
  const shown = f ?? last
  const url = useBlobUrl(shown?.id ?? '', !!shown)
  const [text, setText] = useState<string | null>(null)
  const k = shown ? fileKind(shown.name, shown.type) : 'other'
  useEffect(() => {
    setText(null)
    if (shown && k === 'text') void getBlob(shown.id).then((b) => b?.text().then((t) => setText(t.slice(0, 20000))))
  }, [shown, k])

  return (
    <Dialog open={!!f} onClose={onClose} title={shown?.name} className="max-w-4xl" footer={shown && (
      <>
        <div className="mr-auto flex items-center gap-2">
          <ProjectPicker value={shown.projectId} onChange={(projectId) => ws().update('files', shown.id, { projectId })} />
          <span className="text-xs text-subtle">{formatBytes(shown.size)}</span>
        </div>
        <Button icon={<Download className="size-4" />} variant="primary" onClick={() => void downloadFile(shown)}>
          Download
        </Button>
      </>
    )}>
      {shown && (
        <div className="grid min-h-[40vh] place-items-center overflow-hidden rounded-xl bg-surface-2/50">
          {url === null ? (
            <p className="p-10 text-sm text-subtle">This file’s contents aren’t stored on this device.</p>
          ) : k === 'image' && url ? (
            <img src={url} alt={shown.name} className="max-h-[65vh] object-contain" />
          ) : k === 'pdf' && url ? (
            <iframe src={url} title={shown.name} className="h-[65vh] w-full rounded-xl bg-white" />
          ) : k === 'video' && url ? (
            <video src={url} controls className="max-h-[65vh]" />
          ) : k === 'audio' && url ? (
            <audio src={url} controls />
          ) : k === 'text' && text !== null ? (
            <pre className="max-h-[65vh] w-full overflow-auto p-4 font-mono text-xs whitespace-pre-wrap">{text}</pre>
          ) : (
            <div className="p-10 text-center">
              {(() => {
                const Icon = KIND_ICON[k]
                return <Icon className={cn('mx-auto size-14', KIND_TINT[k])} strokeWidth={1.2} />
              })()}
              <p className="mt-3 text-sm text-subtle">No preview for this file type — download to open it.</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
