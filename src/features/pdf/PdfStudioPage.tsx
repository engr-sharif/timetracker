import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Combine, FileText, Layers, Ruler, ScanText, Search, Sparkles, Upload, Columns2 } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { putBlob } from '@/lib/files'
import { useList, useTable, ws } from '@/store/workspace'
import { Page, PageHeader, Stagger, Rise } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Dot, EmptyState } from '@/components/ui/misc'
import { readBytes } from './engine'
import { Thumb } from './Panels'
import { saveToFiles } from './Dialogs'
import { Studio } from './Studio'

export default function PdfStudioPage() {
  const { id } = useParams()
  return id ? <Studio key={id} fileId={id} /> : <Library />
}

const FEATURES = [
  { icon: Layers, title: 'Markup', body: 'Pen with pressure, highlights, clouds, callouts, stamps, signatures.' },
  { icon: Ruler, title: 'Takeoff', body: 'Calibrated length, area and count with CSV export.' },
  { icon: ScanText, title: 'OCR', body: 'Scans become searchable — on-device, nothing uploaded.' },
  { icon: Columns2, title: 'Compare', body: 'Overlay revisions and cloud the changes automatically.' },
  { icon: Sparkles, title: 'Ask', body: 'Answers with page citations using your Claude key.' },
]

function Library() {
  const navigate = useNavigate()
  const files = useList('files')
  const pdfs = useTable('pdfs')
  const projects = useTable('projects')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const list = useMemo(
    () =>
      files
        .filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
        .filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()) || projects[f.projectId ?? '']?.number.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (pdfs[`pdf:${b.id}`]?.updatedAt ?? b.updatedAt).localeCompare(pdfs[`pdf:${a.id}`]?.updatedAt ?? a.updatedAt)),
    [files, pdfs, projects, q],
  )

  const upload = async (fl: FileList | File[]) => {
    const arr = Array.from(fl).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (!arr.length) return toast.error('Drop PDF files here')
    let first: string | null = null
    for (const f of arr) {
      const meta = ws().create('files', { name: f.name, size: f.size, type: 'application/pdf', folder: 'PDF Studio', starred: false })
      await putBlob(meta.id, f)
      first ??= meta.id
    }
    if (arr.length === 1 && first) navigate(`/pdf/${first}`)
    else toast.success(`Added ${arr.length} PDFs`)
  }

  const combine = async () => {
    const id = toast.loading('Combining…')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const out = await PDFDocument.create()
      for (const fid of picked) {
        const src = await PDFDocument.load(await readBytes(fid), { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      }
      const bytes = await out.save({ useObjectStreams: true })
      const meta = await saveToFiles(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `Combined (${picked.length} files).pdf`)
      toast.success('Combined into one PDF', { id })
      setPicked([])
      navigate(`/pdf/${meta.id}`)
    } catch (e) {
      toast.error('Could not combine', { id, description: e instanceof Error ? e.message : undefined })
    }
  }

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
          title="PDF Studio"
          subtitle="Mark up drawings, take off quantities, OCR scans, compare revisions and ask questions."
          actions={
            <div className="flex gap-2">
              {picked.length > 1 && (
                <Button icon={<Combine className="size-4" />} onClick={combine}>
                  Combine {picked.length}
                </Button>
              )}
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
                Open PDF
              </Button>
            </div>
          }
        />
        <input ref={input} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />

        <Stagger className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {FEATURES.map((f) => (
            <Rise key={f.title} className="rounded-2xl border border-border bg-surface/60 p-3.5 backdrop-blur-sm">
              <f.icon className="mb-2 size-4 text-accent-strong" />
              <div className="text-[13px] font-semibold">{f.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-subtle">{f.body}</div>
            </Rise>
          ))}
        </Stagger>

        <div className="mb-4 flex items-center gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PDFs or project numbers…" icon={<Search />} className="max-w-sm" />
          <span className="text-[12px] text-subtle">{list.length} PDF{list.length === 1 ? '' : 's'}</span>
          {picked.length > 0 && (
            <button onClick={() => setPicked([])} className="text-[12px] text-subtle hover:text-fg">
              Clear selection
            </button>
          )}
        </div>

        {!list.length ? (
          <EmptyState icon={<FileText />} title="No PDFs yet" body="Drop drawings, specs or reports here — they’re stored in Files and open instantly in the studio." action={<Button variant="primary" onClick={() => input.current?.click()}>Open a PDF</Button>} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
            {list.map((f, i) => {
              const d = pdfs[`pdf:${f.id}`]
              const proj = f.projectId ? projects[f.projectId] : undefined
              const isPicked = picked.includes(f.id)
              return (
                <motion.div key={f.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.4) }} className="group relative">
                  <button onClick={() => navigate(`/pdf/${f.id}`)} className="block w-full text-left">
                    <div className={cn('relative overflow-hidden rounded-xl bg-white shadow-soft ring-offset-2 ring-offset-bg transition-all group-hover:-translate-y-0.5 group-hover:shadow-float', isPicked ? 'ring-2 ring-accent' : 'ring-1 ring-border')}>
                      <div className="aspect-[3/4] overflow-hidden">
                        <Thumb src={f.id} index={0} rotate={0} className="h-full" />
                      </div>
                      {!!d?.annots.length && <span className="absolute top-2 right-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg shadow">{d.annots.length}</span>}
                    </div>
                    <div className="mt-2 truncate text-[13px] font-medium">{f.name.replace(/\.pdf$/i, '')}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                      {proj && (
                        <>
                          <Dot hue={proj.color} /> <span className="font-mono">{proj.number}</span> ·
                        </>
                      )}
                      {d ? `${d.pages.length} page${d.pages.length === 1 ? '' : 's'} · ${timeAgo(d.updatedAt)}` : formatBytes(f.size)}
                    </div>
                  </button>
                  <button
                    onClick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}
                    className={cn('absolute top-2 left-2 grid size-5 place-items-center rounded-md border text-[10px] font-bold shadow transition-opacity', isPicked ? 'border-accent bg-accent text-accent-fg opacity-100' : 'border-black/20 bg-white/90 text-transparent opacity-0 group-hover:opacity-100')}
                    aria-label="Select for combining"
                    title="Select to combine"
                  >
                    {isPicked ? picked.indexOf(f.id) + 1 : '✓'}
                  </button>
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
            <div className="text-[15px] font-semibold">Drop PDFs to open them</div>
          </div>
        </div>
      )}
    </div>
  )
}
