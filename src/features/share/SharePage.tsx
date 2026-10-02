import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BookOpenText, FileText, FolderOpen, Inbox, NotebookPen, Share2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { putBlob } from '@/lib/files'
import { takeShared, type SharedItem } from '@/lib/pwa'
import { ws } from '@/store/workspace'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { Spinner } from '@/components/ui/button'
import { doc, docToText, p } from '@/features/notes/noteUtils'
import { kindOf } from '@/features/reader/importers'
import { guessTitle, importFiles, importText } from '@/features/reader/readings'

/** Where things shared to the installed app (share sheet, "Open with") land. */
export default function SharePage() {
  const navigate = useNavigate()
  const [item, setItem] = useState<SharedItem | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void takeShared().then((s) => setItem(s))
  }, [])

  if (item === undefined)
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-5" />
      </div>
    )

  if (!item || (!item.files.length && !item.text.trim() && !item.url.trim()))
    return (
      <Page>
        <EmptyState icon={<Inbox />} title="Nothing to open" body="Share a PDF, book, document or article to Workbench from another app and it will show up here." action={<Button onClick={() => navigate('/')}>Go home</Button>} />
      </Page>
    )

  const text = [item.text, item.url && !item.text.includes(item.url) ? item.url : ''].filter(Boolean).join('\n\n').trim()
  const readable = item.files.filter((f) => {
    const k = kindOf(f.name, f.type)
    return k && k !== 'image'
  })
  const pdf = item.files.find((f) => kindOf(f.name, f.type) === 'pdf')

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what)
    try {
      await fn()
    } catch (e) {
      toast.error('Couldn’t open that', { description: e instanceof Error ? e.message : undefined })
      setBusy(null)
    }
  }

  const saveFiles = async (folder = 'Shared') => {
    const out = []
    for (const f of item.files) {
      const meta = ws().create('files', { name: f.name, size: f.size, type: f.type || 'application/octet-stream', folder, starred: false })
      await putBlob(meta.id, f)
      out.push(meta)
    }
    return out
  }

  return (
    <Page>
      <PageHeader title="Shared with Workbench" icon={<Share2 />} subtitle="Choose what to do with it." />
      <div className="max-w-xl space-y-4">
        {item.files.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface/70 p-4">
            {item.files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 text-[13.5px]">
                <FileText className="size-4 shrink-0 text-subtle" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-subtle">{formatBytes(f.size)}</span>
              </div>
            ))}
          </div>
        )}
        {text && (
          <div className="max-h-48 overflow-y-auto rounded-2xl border border-border bg-surface/70 p-4 text-[13.5px] whitespace-pre-wrap text-muted">
            {item.title && <div className="mb-1 font-semibold text-fg">{item.title}</div>}
            {text.slice(0, 2000)}
            {text.length > 2000 && '…'}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {(readable.length > 0 || text.length > 40) && (
            <Button
              variant="primary"
              size="lg"
              icon={<BookOpenText className="size-4" />}
              loading={busy === 'read'}
              onClick={() =>
                void run('read', async () => {
                  if (readable.length) {
                    const { readings } = await importFiles(readable)
                    navigate(readings.length === 1 ? `/read/${readings[0].fileId}` : '/read')
                  } else {
                    const r = await importText(item.title || guessTitle(text), text)
                    navigate(`/read/${r.fileId}`)
                  }
                })
              }
            >
              Speed read
            </Button>
          )}
          {pdf && (
            <Button
              size="lg"
              icon={<FileText className="size-4" />}
              loading={busy === 'pdf'}
              onClick={() =>
                void run('pdf', async () => {
                  const meta = ws().create('files', { name: pdf.name, size: pdf.size, type: 'application/pdf', folder: 'PDF Studio', starred: false })
                  await putBlob(meta.id, pdf)
                  navigate(`/pdf/${meta.id}`)
                })
              }
            >
              Open in PDF Studio
            </Button>
          )}
          {text && !item.files.length && (
            <Button
              size="lg"
              icon={<NotebookPen className="size-4" />}
              loading={busy === 'note'}
              onClick={() =>
                void run('note', async () => {
                  const content = doc(...text.split(/\n{2,}/).map((para) => p(para.trim())))
                  const n = ws().create('notes', { title: item.title || guessTitle(text), icon: '🔗', content, text: docToText(content), pinned: false, tags: ['shared'] })
                  navigate(`/notes/${n.id}`)
                })
              }
            >
              Save as note
            </Button>
          )}
          {item.files.length > 0 && (
            <Button
              size="lg"
              icon={<FolderOpen className="size-4" />}
              loading={busy === 'files'}
              onClick={() =>
                void run('files', async () => {
                  await saveFiles()
                  toast.success(`Saved to Files › Shared`)
                  navigate('/files')
                })
              }
            >
              Save to Files
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}
