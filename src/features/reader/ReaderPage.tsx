import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { BookOpen, BookOpenText, Camera, CheckCheck, ClipboardPaste, Flame, FolderOpen, Gauge, MoreHorizontal, Play, RotateCcw, Search, Sparkles, Timer, Trash2, Upload, Focus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { isTypingTarget } from '@/lib/hotkeys'
import { useList, useTable, ws } from '@/store/workspace'
import type { Reading, ReadingKind } from '@/store/types'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/field'
import { Dot, EmptyState, Segmented } from '@/components/ui/misc'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/popover'
import { useReaderPrefs } from './prefs'
import { ensureReading, guessTitle, importFiles, importText, isReadable, readingStats } from './readings'
import { formatDuration } from './text'
import { SAMPLE_TEXT, SAMPLE_TITLE } from './sample'
import { Reader } from './Reader'

export default function ReaderPage() {
  const { id } = useParams()
  return id ? <Reader key={id} fileId={id} /> : <Library />
}

const KIND_LABEL: Record<ReadingKind, string> = { pdf: 'PDF', epub: 'EPUB', docx: 'DOCX', html: 'HTML', md: 'MD', text: 'TXT', rtf: 'RTF', image: 'SCAN' }
const ACCEPT = '.pdf,.epub,.docx,.txt,.text,.md,.markdown,.html,.htm,.xhtml,.rtf,application/pdf,application/epub+zip,text/plain,text/markdown,text/html'

/** Average smart-pacing weight, for time-left estimates without parsing the document. */
const AVG_WEIGHT = 1.12

type Filter = 'all' | 'new' | 'reading' | 'finished'

function Library() {
  const navigate = useNavigate()
  const readings = useList('readings')
  const files = useTable('files')
  const projects = useTable('projects')
  const wpm = useReaderPrefs((s) => s.wpm)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(false)
  const [paste, setPaste] = useState<string | null>(null)
  const [scan, setScan] = useState(false)
  const [fromFiles, setFromFiles] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const live = useMemo(() => readings.filter((r) => files[r.fileId]), [readings, files])
  const stats = useMemo(() => readingStats(readings), [readings])
  const list = useMemo(
    () =>
      live
        .filter((r) => filter === 'all' || r.status === filter)
        .filter((r) => !q || `${r.title} ${r.author ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (b.lastReadAt ?? b.createdAt).localeCompare(a.lastReadAt ?? a.createdAt)),
    [live, filter, q],
  )
  const current = useMemo(() => live.filter((r) => r.status === 'reading').sort((a, b) => (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''))[0], [live])

  const upload = async (fl: FileList | File[]) => {
    const { readings: added, skipped } = await importFiles(fl)
    if (skipped.length) toast.error(`Can’t read ${skipped.length === 1 ? skipped[0] : `${skipped.length} files`}`, { description: 'Supported: PDF, EPUB, Word (.docx), text, Markdown, HTML, RTF. Use Scan for photos.' })
    if (added.length === 1) navigate(`/read/${added[0].fileId}`)
    else if (added.length) toast.success(`Added ${added.length} documents`)
  }

  // Paste text anywhere on the page to start reading it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return
      const fl = e.clipboardData?.files
      if (fl?.length) {
        e.preventDefault()
        void upload(fl)
        return
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text.trim().length > 40) {
        e.preventDefault()
        setPaste(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startSample = async () => {
    const existing = live.find((r) => r.title === SAMPLE_TITLE)
    const r = existing ?? (await importText(SAMPLE_TITLE, SAMPLE_TEXT, 'md'))
    navigate(`/read/${r.fileId}`)
  }

  const timeLeft = (r: Reading) => (r.words ? formatDuration(Math.max(0, r.words - r.position) * AVG_WEIGHT * (60000 / wpm)) : null)

  return (
    <div
      className="relative h-full"
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        void upload(e.dataTransfer.files)
      }}
    >
      <Page wide>
        <PageHeader
          title="Speed Reader"
          subtitle="One word at a time, anchored on the letter your eye locks onto. Drop a PDF, EPUB, Word doc or any text."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button icon={<ClipboardPaste className="size-4" />} onClick={() => setPaste('')}>
                Paste text
              </Button>
              <Button icon={<Camera className="size-4" />} onClick={() => setScan(true)}>
                Scan pages
              </Button>
              <Button icon={<FolderOpen className="size-4" />} onClick={() => setFromFiles(true)} className="max-sm:hidden">
                From Files
              </Button>
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
                Open document
              </Button>
            </div>
          }
        />
        <input ref={input} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />

        <div className="mb-8 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          {current ? (
            <ContinueCard r={current} left={timeLeft(current)} onOpen={() => navigate(`/read/${current.fileId}`)} />
          ) : (
            <IntroCard onSample={() => void startSample()} />
          )}
          <StatsCard stats={stats} wpm={wpm} />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${live.length || ''}` },
              { value: 'new', label: 'New' },
              { value: 'reading', label: 'In progress' },
              { value: 'finished', label: 'Finished' },
            ]}
          />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…" icon={<Search />} className="max-w-xs" />
        </div>

        {!list.length ? (
          live.length ? (
            <p className="py-10 text-center text-sm text-subtle">Nothing here yet.</p>
          ) : (
            <EmptyState
              icon={<BookOpenText />}
              title="Your reading list is empty"
              body="Drop documents here, paste text with Ctrl/⌘ V, or take the two-minute tour to learn the controls."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => void startSample()}>
                    Take the tour
                  </Button>
                  <Button onClick={() => input.current?.click()}>Open a document</Button>
                </div>
              }
            />
          )
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4" data-testid="reading-list">
            {list.map((r, i) => {
              const pct = r.status === 'finished' ? 100 : r.words ? Math.round((r.position / Math.max(1, r.words - 1)) * 100) : 0
              const proj = r.projectId ? projects[r.projectId] : undefined
              return (
                <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.35) }} className="group relative">
                  <button onClick={() => navigate(`/read/${r.fileId}`)} className="flex h-full w-full flex-col rounded-2xl border border-border bg-surface/70 p-4 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-float">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-strong">{KIND_LABEL[r.kind]}</span>
                      {r.status === 'finished' && (
                        <span className="flex items-center gap-1 text-[11px] text-success">
                          <CheckCheck className="size-3.5" /> Finished
                        </span>
                      )}
                      {r.status === 'new' && <span className="text-[11px] text-subtle">New</span>}
                    </div>
                    <div className="line-clamp-2 text-[14.5px] leading-snug font-semibold tracking-tight">{r.title}</div>
                    {r.author && <div className="mt-0.5 truncate text-[12px] text-muted">{r.author}</div>}
                    <div className="mt-auto pt-4">
                      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-subtle tabular-nums">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          {proj && (
                            <>
                              <Dot hue={proj.color} /> <span className="font-mono">{proj.number}</span> ·
                            </>
                          )}
                          {pct}%{r.words ? ` · ${r.words.toLocaleString()} words` : ''}
                        </span>
                        <span className="shrink-0">{r.status === 'finished' ? (r.finishedAt ? timeAgo(r.finishedAt) : '') : r.lastReadAt ? (timeLeft(r) ? `${timeLeft(r)} left` : timeAgo(r.lastReadAt)) : timeLeft(r) ?? ''}</span>
                      </div>
                    </div>
                  </button>
                  <Popover
                    role="menu"
                    placement="bottom-end"
                    trigger={
                      <button className="absolute top-3 right-3 grid size-7 place-items-center rounded-lg text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 max-md:opacity-100" aria-label="Reading actions">
                        <MoreHorizontal className="size-4" />
                      </button>
                    }
                  >
                    {r.status !== 'finished' ? (
                      <MenuItem icon={<CheckCheck />} onSelect={() => ws().update('readings', r.id, { status: 'finished', finishedAt: new Date().toISOString() })}>
                        Mark as finished
                      </MenuItem>
                    ) : (
                      <MenuItem icon={<RotateCcw />} onSelect={() => ws().update('readings', r.id, { status: 'reading', position: 0, finishedAt: undefined })}>
                        Read again
                      </MenuItem>
                    )}
                    {r.position > 0 && r.status !== 'finished' && (
                      <MenuItem icon={<RotateCcw />} onSelect={() => ws().update('readings', r.id, { position: 0 })}>
                        Start over
                      </MenuItem>
                    )}
                    {r.kind === 'pdf' && (
                      <MenuItem icon={<BookOpen />} onSelect={() => navigate(`/pdf/${r.fileId}`)}>
                        Open in PDF Studio
                      </MenuItem>
                    )}
                    <MenuSeparator />
                    <MenuItem
                      icon={<Trash2 />}
                      danger
                      onSelect={() => {
                        const removed = ws().remove('readings', r.id)
                        toast('Removed from reading list', { description: 'The file is still in Files.', action: { label: 'Undo', onClick: () => ws().restore('readings', removed) } })
                      }}
                    >
                      Remove from list
                    </MenuItem>
                  </Popover>
                </motion.div>
              )
            })}
          </div>
        )}
      </Page>

      {drag && (
        <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent/8 backdrop-blur-sm">
          <div className="text-center">
            <Upload className="mx-auto mb-2 size-6 text-accent-strong" />
            <div className="text-[15px] font-semibold">Drop to start reading</div>
            <div className="mt-1 text-[12px] text-subtle">PDF · EPUB · DOCX · TXT · MD · HTML · RTF</div>
          </div>
        </div>
      )}

      <PasteDialog text={paste} onClose={() => setPaste(null)} onDone={(r) => navigate(`/read/${r.fileId}`)} />
      <ScanDialog open={scan} onClose={() => setScan(false)} onDone={(r) => navigate(`/read/${r.fileId}`)} />
      <FromFilesDialog open={fromFiles} onClose={() => setFromFiles(false)} onPick={(fid) => navigate(`/read/${fid}`)} />
    </div>
  )
}

function ContinueCard({ r, left, onOpen }: { r: Reading; left: string | null; onOpen: () => void }) {
  const pct = r.words ? Math.round((r.position / Math.max(1, r.words - 1)) * 100) : 0
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/70 p-5 backdrop-blur-sm sm:p-6">
      <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-accent/15 blur-3xl" />
      <div className="text-[11px] font-medium tracking-wide text-subtle uppercase">Continue reading</div>
      <div className="mt-2 line-clamp-2 text-[20px] leading-tight font-semibold tracking-tight">{r.title}</div>
      {r.author && <div className="mt-1 text-[13px] text-muted">{r.author}</div>}
      <div className="mt-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[12px] text-subtle tabular-nums">{pct}%</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" icon={<Play className="size-4" fill="currentColor" />} onClick={onOpen}>
          Continue
        </Button>
        {left && <span className="text-[12.5px] text-subtle">{left} left at your pace</span>}
      </div>
    </div>
  )
}

function IntroCard({ onSample }: { onSample: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/70 p-5 backdrop-blur-sm sm:p-6">
      <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-accent/15 blur-3xl" />
      <div className="mb-4 grid h-24 place-items-center rounded-2xl border border-border bg-bg/60 font-[var(--font-sans)] text-[34px] font-medium tracking-tight">
        <span>
          rec<span className="text-accent-strong">o</span>gnition
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-[12px] text-muted">
        {[
          [Focus, 'Focus', 'One word, eyes still'],
          [Gauge, 'Smart pacing', 'Breathes at punctuation'],
          [Sparkles, 'Recall', 'Recaps & quizzes'],
        ].map(([Icon, t, b]) => {
          const I = Icon as typeof Focus
          return (
            <div key={t as string}>
              <I className="mb-1 size-4 text-accent-strong" />
              <div className="font-semibold text-fg">{t as string}</div>
              {b as string}
            </div>
          )
        })}
      </div>
      <Button className="mt-4" variant="primary" icon={<Play className="size-4" fill="currentColor" />} onClick={onSample}>
        Take the 2-minute tour
      </Button>
    </div>
  )
}

function StatsCard({ stats, wpm }: { stats: ReturnType<typeof readingStats>; wpm: number }) {
  const max = Math.max(1, ...stats.days.map((d) => d.words))
  const tiles = [
    { icon: BookOpen, label: 'Today', value: stats.today.words.toLocaleString(), sub: `words · ${Math.round(stats.today.seconds / 60)} min` },
    { icon: Timer, label: 'This week', value: stats.week.words.toLocaleString(), sub: `words · ${formatDuration(stats.week.seconds * 1000)}` },
    { icon: Gauge, label: 'Avg speed', value: stats.wpm ? String(stats.wpm) : '—', sub: `wpm · set to ${wpm}` },
    { icon: Flame, label: 'Streak', value: String(stats.streak), sub: `day${stats.streak === 1 ? '' : 's'} · ${stats.finished} finished` },
  ]
  return (
    <div className="rounded-3xl border border-border bg-surface/70 p-5 backdrop-blur-sm" data-testid="reading-stats">
      <div className="grid grid-cols-2 gap-4">
        {tiles.map((t) => (
          <div key={t.label}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">
              <t.icon className="size-3.5" /> {t.label}
            </div>
            <div className="mt-1 text-[22px] leading-none font-semibold tracking-tight tabular-nums">{t.value}</div>
            <div className="mt-1 text-[11.5px] text-subtle">{t.sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-12 items-end gap-1" title="Words read, last 14 days">
        {stats.days.map((d) => (
          <div key={d.date} className="flex-1 rounded-t-[3px] bg-accent/70 transition-all" style={{ height: `${Math.max(4, (d.words / max) * 100)}%`, opacity: d.words ? 1 : 0.18 }} title={`${d.date}: ${d.words.toLocaleString()} words`} />
        ))}
      </div>
    </div>
  )
}

function PasteDialog({ text, onClose, onDone }: { text: string | null; onClose: () => void; onDone: (r: Reading) => void }) {
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (text === null) return
    setBody(text)
    setTitle(text ? guessTitle(text) : '')
  }, [text])
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const go = async () => {
    if (!body.trim()) return
    setBusy(true)
    const r = await importText(title || guessTitle(body), body)
    setBusy(false)
    onClose()
    onDone(r)
  }
  return (
    <Dialog
      open={text !== null}
      onClose={onClose}
      title="Paste text"
      description="Articles, emails, reports — it’s saved to Files so you can come back to it."
      className="max-w-2xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[12px] text-subtle tabular-nums">{words.toLocaleString()} words</span>
          <Button variant="primary" icon={<Play className="size-4" fill="currentColor" />} disabled={!words} loading={busy} onClick={() => void go()}>
            Start reading
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            if (!title) setTitle(guessTitle(e.target.value))
          }}
          placeholder="Paste or type the text you want to read…"
          className="min-h-[260px] font-[var(--font-sans)] text-[13px]"
          autoFocus
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void go()
          }}
        />
      </div>
    </Dialog>
  )
}

function ScanDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (r: Reading) => void }) {
  const [images, setImages] = useState<{ file: File; url: string }[]>([])
  const [busy, setBusy] = useState<{ i: number; p: number } | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) return
    setImages((list) => {
      list.forEach((x) => URL.revokeObjectURL(x.url))
      return []
    })
  }, [open])
  const add = (fl: FileList | null) => fl && setImages((list) => [...list, ...Array.from(fl).filter((f) => f.type.startsWith('image/')).map((file) => ({ file, url: URL.createObjectURL(file) }))])
  const run = async () => {
    const { ocrImage } = await import('@/features/pdf/engine')
    const paragraphs: string[] = []
    try {
      for (let i = 0; i < images.length; i++) {
        setBusy({ i, p: 0 })
        const out = await ocrImage(images[i].file, { onProgress: (p, status) => status.startsWith('recognizing') && setBusy({ i, p }) })
        paragraphs.push(...out.paragraphs.map((p) => p.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').replace(/\n/g, ' ')))
      }
      if (!paragraphs.join('').trim()) {
        toast.error('No text found', { description: 'Try a sharper, well-lit photo taken straight on.' })
        setBusy(null)
        return
      }
      const title = `Scan · ${guessTitle(paragraphs[0]).slice(0, 48)}`
      const r = await importText(title, paragraphs.join('\n\n'))
      ws().update('readings', r.id, { kind: 'image' })
      setBusy(null)
      onClose()
      onDone(r)
    } catch (e) {
      toast.error('Couldn’t read the images', { description: e instanceof Error ? e.message : undefined })
      setBusy(null)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Scan printed pages"
      description="Photograph or pick pages; text is recognized on this device and saved to Files."
      className="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[12px] text-subtle">{busy ? `Reading page ${busy.i + 1} of ${images.length}… ${Math.round(busy.p * 100)}%` : `${images.length} page${images.length === 1 ? '' : 's'}`}</span>
          <Button variant="primary" disabled={!images.length} loading={!!busy} onClick={() => void run()}>
            Recognize & read
          </Button>
        </div>
      }
    >
      <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => add(e.target.files)} />
      <div className="mb-3 flex gap-2">
        <Button icon={<Camera className="size-4" />} onClick={() => camera.current?.click()}>
          Take photo
        </Button>
        <Button icon={<Upload className="size-4" />} onClick={() => pick.current?.click()}>
          Choose images
        </Button>
      </div>
      {images.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {images.map((x, i) => (
            <div key={x.url} className={cn('group relative aspect-[3/4] overflow-hidden rounded-lg border border-border', busy?.i === i && 'ring-2 ring-accent')}>
              <img src={x.url} alt={`Page ${i + 1}`} className="size-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
              {!busy && (
                <button onClick={() => setImages((l) => l.filter((y) => y !== x))} className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100" aria-label="Remove page">
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid h-36 place-items-center rounded-xl border border-dashed border-border text-[13px] text-subtle">Pages appear here in reading order</div>
      )}
    </Dialog>
  )
}

function FromFilesDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (fileId: string) => void }) {
  const files = useList('files')
  const [q, setQ] = useState('')
  const list = files.filter((f) => isReadable(f) && (!q || f.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <Dialog open={open} onClose={onClose} title="Read from Files" className="max-w-lg">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" icon={<Search />} autoFocus />
      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {list.length ? (
          list.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                ensureReading(f)
                onClose()
                onPick(f.id)
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-surface-2"
            >
              <BookOpenText className="size-4 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-[11px] text-subtle">{f.folder}</span>
            </button>
          ))
        ) : (
          <p className="py-8 text-center text-[13px] text-subtle">No readable files. Supported: PDF, EPUB, DOCX, TXT, MD, HTML, RTF.</p>
        )}
      </div>
    </Dialog>
  )
}

