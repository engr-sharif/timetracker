import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { FileText, ImagePlus, ListPlus, NotebookPen, PenLine, Shapes, Sparkles, Type, WandSparkles, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AiError, blobToBase64, extract, useAi } from '@/lib/ai'
import { getBlob } from '@/lib/files'
import { useList, ws } from '@/store/workspace'
import type { Board } from '@/store/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/misc'
import { MenuItem, MenuLabel, MenuSeparator, Popover, Tooltip } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/field'
import { b as bold, bullets, doc, h, p as para, todos, docToText } from '@/features/notes/noteUtils'
import { boundsOf, elementsPng, mermaidToElements, placeElements, readSmartInk, selectedElements, writeSmartInk, type SmartInkMode } from './smart'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Api = ExcalidrawImperativeAPI

/* ------------------------------------------------------------------ */
/*  Smart ink toggle                                                   */
/* ------------------------------------------------------------------ */

export function SmartInkToggle({ mode, onChange }: { mode: SmartInkMode; onChange: (m: SmartInkMode) => void }) {
  const next: Record<SmartInkMode, SmartInkMode> = { hold: 'always', always: 'off', off: 'hold' }
  const label = { hold: 'Hold to snap', always: 'Auto shapes', off: 'Raw ink' }[mode]
  const tip = {
    hold: 'Draw with the pen tool and pause before lifting to snap to a clean shape or connector',
    always: 'Every pen stroke that looks like a shape becomes one',
    off: 'Pen strokes stay exactly as drawn',
  }[mode]
  return (
    <Tooltip content={tip}>
      <button
        onClick={() => {
          writeSmartInk(next[mode])
          onChange(next[mode])
        }}
        className={cn('hidden h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium sm:flex', mode !== 'off' ? 'border-accent/40 bg-accent-soft text-accent-strong' : 'border-border text-muted hover:text-fg')}
      >
        <WandSparkles className="size-3.5" /> {label}
      </button>
    </Tooltip>
  )
}

export const useSmartInk = () => {
  const [mode, setMode] = useState<SmartInkMode>(readSmartInk)
  return [mode, setMode] as const
}

/* ------------------------------------------------------------------ */
/*  AI + insert menus                                                  */
/* ------------------------------------------------------------------ */

const img = async (blob: Blob) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: await blobToBase64(blob) } })

const DIAGRAM_RULES = `Output Mermaid "flowchart" syntax only (flowchart TD or LR). Keep node labels short (2–6 words) and wrap them in quotes. Use {"..."} diamonds for decisions with labelled yes/no edges, ([...]) for start/end, [(...)] for data stores, and subgraphs for phases or disciplines when helpful. No styling, classDefs or comments.`

export function AiMenu({ api, board }: { api: Api | null; board: Board }) {
  const hasKey = useAi((s) => !!s.key)
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [diagram, setDiagram] = useState(false)

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!api) return
    if (!hasKey) {
      toast('Add your Claude API key to use AI', { action: { label: 'Settings', onClick: () => navigate('/settings#ai') } })
      return
    }
    setBusy(label)
    const t = toast.loading(`${label}…`)
    try {
      await fn()
      toast.dismiss(t)
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : e instanceof Error ? e.message : 'Something went wrong', { id: t })
    }
    setBusy(null)
  }

  const needSelection = () => {
    const sel = selectedElements(api!)
    if (!sel.length) throw new Error('Select the strokes or shapes first')
    return sel
  }

  const cleanUp = () =>
    run('Reading your sketch', async () => {
      const sel = needSelection()
      const png = await elementsPng(api!, sel)
      const out = await extract(z.object({ mermaid: z.string(), summary: z.string() }), {
        system: `You turn hand-drawn whiteboard sketches into clean diagrams. Read every label (including handwriting), identify the boxes, decisions and connections, and preserve the sketch's orientation. ${DIAGRAM_RULES}`,
        content: [await img(png), { type: 'text', text: 'Recreate this sketch as a clean diagram.' }],
        effort: 'medium',
      })
      const { elements } = await mermaidToElements(out.mermaid)
      const bx = boundsOf(sel)
      placeElements(api!, elements, [bx.x1 + (bx.x1 - bx.x0) / 2 + 80, (bx.y0 + bx.y1) / 2])
      toast.success('Clean diagram added beside your sketch', { description: out.summary })
    })

  const handwriting = () =>
    run('Reading handwriting', async () => {
      const sel = needSelection().filter((e) => e.type === 'freedraw')
      if (!sel.length) throw new Error('Select handwritten (pen) strokes first')
      const png = await elementsPng(api!, sel)
      const out = await extract(z.object({ text: z.string() }), {
        system: 'Transcribe the handwriting in the image exactly. Keep line breaks. Fix nothing except obvious letterforms. Return an empty string if there is no writing.',
        content: [await img(png), { type: 'text', text: 'Transcribe.' }],
        effort: 'low',
      })
      if (!out.text.trim()) throw new Error('No handwriting recognised')
      const bx = boundsOf(sel)
      const lines = out.text.split('\n').length
      const fontSize = Math.max(14, Math.min(64, ((bx.y1 - bx.y0) / lines) * 0.62))
      const [text] = convertToExcalidrawElements([{ type: 'text', x: bx.x0, y: bx.y0, text: out.text, fontSize, strokeColor: sel[0].strokeColor, fontFamily: 5 } as any], { regenerateIds: true })
      placeElements(api!, [text], [(bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2], { replace: sel.map((e) => e.id) })
      toast.success('Converted to text', { description: 'Undo (Ctrl+Z) brings the ink back.' })
    })

  const boardSnapshot = async () => {
    const all = api!.getSceneElements() as any[]
    if (!all.length) throw new Error('The board is empty')
    const png = await elementsPng(api!, all)
    const texts = all.filter((e) => e.type === 'text').map((e) => e.text).join('\n')
    return [await img(png), { type: 'text' as const, text: `Board: “${board.name}”.\nText on the board:\n${texts.slice(0, 20000)}` }]
  }

  const toTasks = () =>
    run('Finding action items', async () => {
      const out = await extract(
        z.object({ tasks: z.array(z.object({ title: z.string(), notes: z.string(), priority: z.enum(['low', 'medium', 'high']) })) }),
        { system: 'Extract concrete action items from this whiteboard (steps someone must do, open questions to resolve, follow-ups). Imperative titles under 90 characters. At most 12.', content: await boardSnapshot(), effort: 'medium' },
      )
      for (const t of out.tasks) {
        ws().create('tasks', { title: t.title, notes: `${t.notes}\n\nFrom whiteboard [${board.name}](#/boards/${board.id})`, projectId: board.projectId, assigneeId: 'me', assignedById: 'me', status: 'todo', priority: t.priority, labels: ['from-board'], subtasks: [], order: Date.now() })
      }
      toast.success(out.tasks.length ? `Created ${out.tasks.length} task${out.tasks.length > 1 ? 's' : ''}` : 'No action items found')
    })

  const toNote = () =>
    run('Writing it up', async () => {
      const out = await extract(
        z.object({ title: z.string(), summary: z.array(z.string()), decisions: z.array(z.string()), actions: z.array(z.string()), questions: z.array(z.string()) }),
        { system: 'Write up this whiteboard as meeting-style notes for an engineering consultant: a short title, a few summary bullets, decisions made, action items and open questions. Be specific and brief.', content: await boardSnapshot(), effort: 'medium' },
      )
      const content = doc(
        para(bold('From whiteboard: '), board.name),
        h(2, 'Summary'),
        bullets(...(out.summary.length ? out.summary : ['—'])),
        ...(out.decisions.length ? [h(2, 'Decisions'), bullets(...out.decisions)] : []),
        ...(out.actions.length ? [h(2, 'Actions'), todos(...out.actions.map((a) => [a, false] as [string, boolean]))] : []),
        ...(out.questions.length ? [h(2, 'Open questions'), bullets(...out.questions)] : []),
      )
      const note = ws().create('notes', { title: out.title, icon: '🧭', content, text: docToText(content), projectId: board.projectId, pinned: false, tags: ['whiteboard'] })
      toast.success('Note created', { action: { label: 'Open', onClick: () => navigate(`/notes/${note.id}`) } })
    })

  return (
    <>
      <Popover
        role="menu"
        placement="bottom-end"
        trigger={
          <Button size="sm" variant="soft" icon={<Sparkles className="size-3.5" />} loading={!!busy}>
            <span className="max-sm:hidden">AI</span>
          </Button>
        }
      >
        <MenuLabel>Create</MenuLabel>
        <MenuItem icon={<Workflow />} onSelect={() => setDiagram(true)}>
          Diagram from text or Mermaid…
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Selection</MenuLabel>
        <MenuItem icon={<Shapes />} onSelect={cleanUp}>
          Clean up sketch into a diagram
        </MenuItem>
        <MenuItem icon={<Type />} onSelect={handwriting}>
          Handwriting → text
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Whole board</MenuLabel>
        <MenuItem icon={<ListPlus />} onSelect={toTasks}>
          Extract tasks
        </MenuItem>
        <MenuItem icon={<NotebookPen />} onSelect={toNote}>
          Write up as a note
        </MenuItem>
      </Popover>
      <DiagramDialog open={diagram} onClose={() => setDiagram(false)} api={api} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Diagram from text / Mermaid                                        */
/* ------------------------------------------------------------------ */

const EXAMPLE = `flowchart LR
  A(["RFI received"]) --> B["Log & assign"]
  B --> C{"Needs calcs?"}
  C -- yes --> D["Run analysis"]
  C -- no --> E["Draft response"]
  D --> E --> F["PM review"] --> G(["Issue response"])`

function DiagramDialog({ open, onClose, api }: { open: boolean; onClose: () => void; api: Api | null }) {
  const hasKey = useAi((s) => !!s.key)
  const [mode, setMode] = useState<'describe' | 'mermaid'>(hasKey ? 'describe' : 'mermaid')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setText('')
  }, [open])

  const create = async () => {
    if (!api || !text.trim()) return
    setBusy(true)
    try {
      let code = text
      if (mode === 'describe') {
        const out = await extract(z.object({ mermaid: z.string() }), { system: `Turn the user's description of a process, system or plan into a clear diagram. ${DIAGRAM_RULES}`, content: text, effort: 'medium' })
        code = out.mermaid
      }
      const { elements, files } = await mermaidToElements(code)
      const fl = Object.values(files as Record<string, any>)
      if (fl.length) api.addFiles(fl)
      placeElements(api, elements)
      onClose()
      toast.success('Diagram added', { description: 'Everything is editable — drag, restyle, relabel.' })
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : 'Could not build that diagram', { description: mode === 'mermaid' && e instanceof Error ? e.message.slice(0, 160) : undefined })
    }
    setBusy(false)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate a diagram"
      description={mode === 'describe' ? 'Describe a process, workflow or system in plain words.' : 'Paste Mermaid flowchart, sequence or class diagram code — works offline.'}
      footer={
        <Button variant="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={!text.trim()} onClick={create}>
          Add to board
        </Button>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        className="mb-3"
        options={[
          { value: 'describe', label: 'Describe it', icon: <PenLine /> },
          { value: 'mermaid', label: 'Mermaid', icon: <Workflow /> },
        ]}
      />
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void create()}
        rows={8}
        className={cn('text-[13px]', mode === 'mermaid' && 'font-mono text-[12px]')}
        placeholder={mode === 'describe' ? 'e.g. Submittal review: contractor submits → we log it → discipline lead reviews → if comments, return “revise & resubmit”, else approve → PM signs off → update the log' : EXAMPLE}
      />
      {mode === 'describe' && !hasKey && <p className="mt-2 text-xs text-warning">Needs a Claude API key (Settings → AI). Mermaid works without one.</p>}
      {mode === 'mermaid' && !text && (
        <button onClick={() => setText(EXAMPLE)} className="mt-2 text-xs text-accent-strong hover:underline">
          Use the example
        </button>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Insert PDF page / image                                            */
/* ------------------------------------------------------------------ */

export function InsertMenu({ api }: { api: Api | null }) {
  const [pdfOpen, setPdfOpen] = useState(false)
  const files = useList('files')
  const images = files.filter((f) => f.type.startsWith('image/')).slice(0, 12)

  const insertImage = async (blob: Blob, name: string) => {
    if (!api) return
    const dataURL = await downscale(blob, 1800)
    const id = `wb-${crypto.randomUUID()}`
    api.addFiles([{ id: id as any, dataURL: dataURL as any, mimeType: 'image/jpeg', created: Date.now() }])
    const dims = await imageSize(dataURL)
    const w = Math.min(900, dims.w)
    const [el] = convertToExcalidrawElements([{ type: 'image', x: 0, y: 0, width: w, height: (w * dims.h) / dims.w, fileId: id as any, locked: false } as any], { regenerateIds: true })
    placeElements(api, [el])
    toast.success(`Inserted ${name}`, { description: 'Draw on top of it — lock it from the context menu if you like.' })
  }

  return (
    <>
      <Popover
        role="menu"
        placement="bottom-end"
        trigger={
          <Button size="sm" icon={<ImagePlus className="size-3.5" />}>
            <span className="max-sm:hidden">Insert</span>
          </Button>
        }
      >
        <MenuItem icon={<FileText />} onSelect={() => setPdfOpen(true)}>
          PDF page…
        </MenuItem>
        {images.length > 0 && <MenuSeparator />}
        {images.length > 0 && <MenuLabel>Images in Files</MenuLabel>}
        {images.map((f) => (
          <MenuItem
            key={f.id}
            icon={<ImagePlus />}
            onSelect={async () => {
              const b = await getBlob(f.id)
              if (b) await insertImage(b, f.name)
              else toast.error('That image isn’t on this device yet')
            }}
          >
            <span className="truncate">{f.name}</span>
          </MenuItem>
        ))}
      </Popover>
      <InsertPdfDialog open={pdfOpen} onClose={() => setPdfOpen(false)} onPick={insertImage} />
    </>
  )
}

function InsertPdfDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (b: Blob, name: string) => Promise<void> }) {
  const pdfs = useList('files').filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
  const [fileId, setFileId] = useState<string | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  useEffect(() => {
    if (!open) {
      setFileId(null)
      setPages([])
    }
  }, [open])
  useEffect(() => {
    if (!fileId) return
    let alive = true
    void (async () => {
      const { loadPdf, thumbnail } = await import('@/features/pdf/engine')
      const pdf = await loadPdf(fileId)
      const n = Math.min(pdf.numPages, 40)
      const urls: string[] = []
      for (let i = 0; i < n && alive; i++) {
        urls.push(await thumbnail(fileId, i, 0, 160))
        setPages([...urls])
      }
    })().catch(() => toast.error('Could not open that PDF'))
    return () => {
      alive = false
    }
  }, [fileId])

  const pick = async (i: number) => {
    if (!fileId) return
    setBusy(i)
    const { rasterize } = await import('@/features/pdf/engine')
    const { canvas } = await rasterize(fileId, i, { maxSide: 2200 })
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.88))
    canvas.width = canvas.height = 0
    await onPick(blob, `page ${i + 1}`)
    setBusy(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Insert a PDF page" description="Sketch over drawings and reports right on the board." className="max-w-2xl">
      {!fileId ? (
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {!pdfs.length && <p className="p-6 text-center text-sm text-subtle">No PDFs in Files yet.</p>}
          {pdfs.map((f) => (
            <button key={f.id} onClick={() => setFileId(f.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-2">
              <FileText className="size-4 text-subtle" /> <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid max-h-[55vh] grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 overflow-y-auto p-1">
          {pages.map((u, i) => (
            <button key={i} onClick={() => void pick(i)} disabled={busy !== null} className={cn('group overflow-hidden rounded-lg bg-white ring-1 ring-border transition hover:ring-2 hover:ring-accent', busy === i && 'animate-pulse')}>
              <img src={u} alt={`Page ${i + 1}`} className="w-full" />
              <div className="bg-surface-2 py-1 text-center font-mono text-[10.5px] text-muted">{i + 1}</div>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  )
}

async function downscale(blob: Blob, max: number) {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.86)
}

function imageSize(url: string) {
  return new Promise<{ w: number; h: number }>((res) => {
    const i = new Image()
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight })
    i.onerror = () => res({ w: 800, h: 600 })
    i.src = url
  })
}
