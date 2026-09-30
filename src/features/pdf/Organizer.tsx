import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, FilePlus2, FileOutput, RotateCcw, RotateCw, Trash2, Upload } from 'lucide-react'
import { cn, uid } from '@/lib/utils'
import { putBlob } from '@/lib/files'
import { useList, ws } from '@/store/workspace'
import type { PdfDoc, PdfPageRef } from '@/store/types'
import { Button } from '@/components/ui/button'
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '@/components/ui/popover'
import { confirm } from '@/components/ui/dialog'
import { loadPdf } from './engine'
import { Thumb } from './Panels'
import { useStudio } from './store'

export function Organizer({ doc, onExtract }: { doc: PdfDoc; onExtract: (keys: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  const commit = useStudio((s) => s.commit)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of doc.annots) m.set(a.page, (m.get(a.page) ?? 0) + 1)
    return m
  }, [doc.annots])
  const pdfFiles = useList('files').filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))

  const click = (key: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const keys = doc.pages.map((p) => p.key)
      const [a, b] = [keys.indexOf(anchor.current), keys.indexOf(key)].sort((x, y) => x - y)
      setSelected(keys.slice(a, b + 1))
      return
    }
    anchor.current = key
    if (e.metaKey || e.ctrlKey) setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))
    else setSelected((s) => (s.length === 1 && s[0] === key ? [] : [key]))
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const keys = doc.pages.map((p) => p.key)
    const from = keys.indexOf(String(active.id))
    const to = keys.indexOf(String(over.id))
    const moving = selected.includes(String(active.id)) && selected.length > 1 ? selected : [String(active.id)]
    if (moving.length === 1) {
      commit((d) => ({ pages: arrayMove(d.pages, from, to) }))
      return
    }
    // Move a multi-selection as a block, keeping its internal order.
    commit((d) => {
      const block = d.pages.filter((p) => moving.includes(p.key))
      const rest = d.pages.filter((p) => !moving.includes(p.key))
      const target = rest.findIndex((p) => p.key === over.id)
      const at = target < 0 ? rest.length : from < to ? target + 1 : target
      return { pages: [...rest.slice(0, at), ...block, ...rest.slice(at)] }
    })
  }

  const targets = selected.length ? selected : []
  const rotate = (deg: number) =>
    commit((d) => ({ pages: d.pages.map((p) => (targets.includes(p.key) ? { ...p, rotate: (p.rotate + deg + 360) % 360 } : p)) }))

  const remove = async () => {
    if (targets.length >= doc.pages.length) return toast.error('A PDF needs at least one page')
    const marked = targets.reduce((n, k) => n + (counts.get(k) ?? 0), 0)
    if (marked && !(await confirm({ title: `Delete ${targets.length} page${targets.length > 1 ? 's' : ''}?`, body: `Their ${marked} markup${marked > 1 ? 's' : ''} will be removed too. You can undo this.`, confirmLabel: 'Delete', danger: true }))) return
    commit((d) => ({ pages: d.pages.filter((p) => !targets.includes(p.key)), annots: d.annots.filter((a) => !targets.includes(a.page)) }))
    setSelected([])
  }

  const duplicate = () => {
    commit((d) => {
      const pages: PdfPageRef[] = []
      const annots = [...d.annots]
      for (const p of d.pages) {
        pages.push(p)
        if (!targets.includes(p.key)) continue
        const copy = { ...p, key: uid('pg') }
        pages.push(copy)
        for (const a of d.annots) if (a.page === p.key) annots.push({ ...a, id: uid('m'), page: copy.key })
      }
      return { pages, annots }
    })
  }

  const insertFile = async (fileId: string) => {
    try {
      const pdf = await loadPdf(fileId)
      const refs: PdfPageRef[] = Array.from({ length: pdf.numPages }, (_, i) => ({ key: uid('pg'), src: fileId, index: i, rotate: 0 }))
      commit((d) => {
        const lastSel = d.pages.map((p) => p.key).filter((k) => targets.includes(k)).pop()
        const at = lastSel ? d.pages.findIndex((p) => p.key === lastSel) + 1 : d.pages.length
        return { pages: [...d.pages.slice(0, at), ...refs, ...d.pages.slice(at)] }
      })
      toast.success(`Inserted ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`)
    } catch (e) {
      toast.error('Could not insert that PDF', { description: e instanceof Error ? e.message : undefined })
    }
  }

  const upload = useRef<HTMLInputElement>(null)

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elev/40 px-4 py-2.5">
        <span className="mr-2 text-[12.5px] text-muted">{selected.length ? `${selected.length} selected` : 'Click to select · drag to reorder · Shift/⌘ for ranges'}</span>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={!targets.length} onClick={() => rotate(-90)}>
          Rotate left
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCw className="size-3.5" />} disabled={!targets.length} onClick={() => rotate(90)}>
          Rotate right
        </Button>
        <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} disabled={!targets.length} onClick={duplicate}>
          Duplicate
        </Button>
        <Button size="sm" variant="ghost" icon={<FileOutput className="size-3.5" />} disabled={!targets.length} onClick={() => onExtract(doc.pages.map((p) => p.key).filter((k) => targets.includes(k)))}>
          Extract
        </Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} disabled={!targets.length} onClick={remove} className="hover:text-danger">
          Delete
        </Button>
        <span className="flex-1" />
        <button onClick={() => setSelected(selected.length === doc.pages.length ? [] : doc.pages.map((p) => p.key))} className="text-[12px] text-subtle hover:text-fg">
          {selected.length === doc.pages.length ? 'Select none' : 'Select all'}
        </button>
        <Popover
          role="menu"
          placement="bottom-end"
          trigger={
            <Button size="sm" icon={<FilePlus2 className="size-3.5" />}>
              Insert PDF
            </Button>
          }
        >
          <MenuItem icon={<Upload className="size-4" />} onSelect={() => upload.current?.click()}>
            Upload a PDF…
          </MenuItem>
          {pdfFiles.length > 0 && <MenuSeparator />}
          {pdfFiles.length > 0 && <MenuLabel>From Files</MenuLabel>}
          <div className="max-h-72 overflow-y-auto">
            {pdfFiles.map((f) => (
              <MenuItem key={f.id} onSelect={() => void insertFile(f.id)}>
                <span className="truncate">{f.name}</span>
              </MenuItem>
            ))}
          </div>
        </Popover>
        <input
          ref={upload}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const meta = ws().create('files', { name: f.name, size: f.size, type: 'application/pdf', projectId: doc.projectId, folder: 'PDF Studio', starred: false })
            await putBlob(meta.id, f)
            await insertFile(meta.id)
          }}
        />
      </div>
      <div className="pdf-stage min-h-0 flex-1 overflow-y-auto p-6" onClick={(e) => e.target === e.currentTarget && setSelected([])}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={doc.pages.map((p) => p.key)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-6">
              {doc.pages.map((p, i) => (
                <SortablePage key={p.key} p={p} n={i + 1} selected={selected.includes(p.key)} count={counts.get(p.key) ?? 0} onClick={(e) => click(p.key, e)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

function SortablePage({ p, n, selected, count, onClick }: { p: PdfPageRef; n: number; selected: boolean; count: number; onClick: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.key })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }} className="flex flex-col items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.98 }}
        {...attributes}
        {...listeners}
        onClick={onClick}
        className={cn(
          'relative w-full overflow-hidden rounded-lg bg-white shadow-soft ring-offset-4 ring-offset-bg transition-shadow',
          selected ? 'ring-2 ring-accent' : 'ring-1 ring-border hover:ring-border-strong',
          isDragging && 'shadow-float',
        )}
      >
        <Thumb src={p.src} index={p.index} rotate={p.rotate} />
        {count > 0 && <span className="absolute top-2 right-2 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-fg">{count}</span>}
        {p.rotate !== 0 && <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1 font-mono text-[10px] text-white">{p.rotate}°</span>}
      </motion.button>
      <span className={cn('font-mono text-[11px]', selected ? 'text-fg' : 'text-subtle')}>{n}</span>
    </div>
  )
}
