import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { Copy, Ellipsis, Plus, Shapes, Trash } from 'lucide-react'
import { timeAgo } from '@/lib/dates'
import { useList, useTable, ws } from '@/store/workspace'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Dot, EmptyState } from '@/components/ui/misc'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/popover'
import { confirm } from '@/components/ui/dialog'
import { useCreateActions } from '@/components/layout/CreateMenu'

const TEMPLATES = [
  { name: 'Blank canvas', hint: 'Start from nothing', glyph: '◻︎' },
  { name: 'Process flowchart', hint: 'Start → decision → end', glyph: '⬦' },
  { name: 'Site sketch', hint: 'Plan view markup', glyph: '⌖' },
  { name: 'Mind map', hint: 'Branch out from one idea', glyph: '✳︎' },
]

/** Pre-built starter scenes (Excalidraw skeleton elements with bound arrows). */
async function templateElements(name: string) {
  const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
  type Shape = { id: string; x: number; y: number; w: number; h: number }
  const shapes: Record<string, Shape> = {}
  const box = (id: string, x: number, y: number, text: string, type: 'rectangle' | 'diamond' | 'ellipse' = 'rectangle', color = '#a5d8ff') => {
    const w = type === 'diamond' ? 220 : 210
    const h = type === 'diamond' ? 130 : 76
    shapes[id] = { id, x, y, w, h }
    return { id, type, x, y, width: w, height: h, backgroundColor: color, fillStyle: 'solid', strokeColor: '#1e1e1e', roundness: type === 'rectangle' ? { type: 3 } : null, label: { text, fontSize: 18 } } as never
  }
  // Arrow from the nearest edge midpoint of `from` to that of `to`.
  const arrow = (from: string, to: string, label?: string) => {
    const a = shapes[from]
    const b = shapes[to]
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    const dx = bc.x - ac.x
    const dy = bc.y - ac.y
    const vertical = Math.abs(dy) >= Math.abs(dx)
    const sx = vertical ? ac.x : ac.x + Math.sign(dx) * (a.w / 2 + 6)
    const sy = vertical ? ac.y + Math.sign(dy) * (a.h / 2 + 6) : ac.y
    const ex = vertical ? bc.x : bc.x - Math.sign(dx) * (b.w / 2 + 6)
    const ey = vertical ? bc.y - Math.sign(dy) * (b.h / 2 + 6) : bc.y
    return { type: 'arrow', x: sx, y: sy, width: ex - sx, height: ey - sy, points: [[0, 0], [ex - sx, ey - sy]], start: { id: from }, end: { id: to }, strokeColor: '#1e1e1e', ...(label ? { label: { text: label, fontSize: 16 } } : {}) } as never
  }
  if (name === 'Process flowchart') {
    const els = [
      box('a', 0, 0, 'Start', 'ellipse', '#b2f2bb'),
      box('b', 0, 160, 'Gather inputs'),
      box('c', -5, 320, 'Meets criteria?', 'diamond', '#ffec99'),
      box('d', -310, 520, 'Revise design', 'rectangle', '#ffc9c9'),
      box('e', 290, 520, 'Issue for review', 'rectangle', '#b2f2bb'),
    ]
    return convertToExcalidrawElements([...els, arrow('a', 'b'), arrow('b', 'c'), arrow('c', 'd', 'No'), arrow('c', 'e', 'Yes')])
  }
  if (name === 'Mind map') {
    const els = [
      box('root', 0, 0, 'Central idea', 'ellipse', '#d0bfff'),
      box('n1', -360, -200, 'Branch A'),
      box('n2', 360, -200, 'Branch B'),
      box('n3', -360, 200, 'Branch C'),
      box('n4', 360, 200, 'Branch D'),
    ]
    return convertToExcalidrawElements([...els, arrow('root', 'n1'), arrow('root', 'n2'), arrow('root', 'n3'), arrow('root', 'n4')])
  }
  if (name === 'Site sketch') {
    return convertToExcalidrawElements([
      { type: 'rectangle', x: 0, y: 0, width: 560, height: 360, strokeColor: '#1e1e1e', strokeStyle: 'dashed', backgroundColor: 'transparent' } as never,
      { type: 'text', x: 8, y: -30, text: 'Property line', fontSize: 16 } as never,
      box('bldg', 170, 110, 'Existing building', 'rectangle', '#e9ecef'),
      { type: 'text', x: 470, y: -70, text: 'N ↑', fontSize: 28 } as never,
      { type: 'text', x: 0, y: 380, text: 'Scale: NTS', fontSize: 16 } as never,
    ])
  }
  return []
}

export default function BoardsPage() {
  const boards = useList('boards')
  const projects = useTable('projects')
  const navigate = useNavigate()
  const create = useCreateActions()
  const sorted = useMemo(() => [...boards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [boards])

  const fromTemplate = async (name: string) => {
    if (name === 'Blank canvas') return create.board()
    const elements = await templateElements(name)
    const b = ws().create('boards', { name, scene: { elements: elements as unknown[] } })
    navigate(`/boards/${b.id}`)
  }

  return (
    <Page wide>
      <PageHeader
        title="Whiteboards"
        subtitle="Draw, diagram and move things around — infinite canvas, hand-drawn feel."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => create.board()}>
            New board
          </Button>
        }
      />

      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TEMPLATES.map((t, i) => (
          <motion.button
            key={t.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => fromTemplate(t.name)}
            className="group flex items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/50 p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-xl text-accent-strong transition-transform group-hover:rotate-6">{t.glyph}</span>
            <span>
              <span className="block text-[13.5px] font-medium">{t.name}</span>
              <span className="block text-[11.5px] text-subtle">{t.hint}</span>
            </span>
          </motion.button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={<Shapes />} title="No boards yet" body="Pick a template above or start with a blank canvas." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {sorted.map((b, i) => {
              const p = b.projectId ? projects[b.projectId] : undefined
              return (
                <motion.div
                  layout
                  key={b.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-surface/80 transition-[border-color,transform] hover:-translate-y-1 hover:border-border-strong"
                >
                  <button onClick={() => navigate(`/boards/${b.id}`)} className="block w-full text-left">
                    <div className="relative grid aspect-[16/10] place-items-center overflow-hidden border-b border-border bg-[radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:16px_16px]">
                      {b.thumbnail ? (
                        <img src={b.thumbnail} alt="" className="max-h-[85%] max-w-[85%] object-contain opacity-90 transition-transform duration-500 group-hover:scale-105 dark:invert dark:hue-rotate-180" />
                      ) : (
                        <Shapes className="size-8 text-subtle/50" />
                      )}
                    </div>
                    <div className="p-4">
                      <div className="truncate text-[14px] font-medium">{b.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11.5px] text-subtle">
                        {timeAgo(b.updatedAt)}
                        {p && (
                          <span className="flex items-center gap-1 truncate">
                            <Dot hue={p.color} className="size-1.5" /> {p.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <Popover
                    role="menu"
                    placement="bottom-end"
                    trigger={
                      <button className="glass absolute top-3 right-3 grid size-8 place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100" aria-label="Board actions">
                        <Ellipsis className="size-4" />
                      </button>
                    }
                  >
                    <MenuItem
                      icon={<Copy />}
                      onSelect={() => {
                        ws().create('boards', { name: `${b.name} (copy)`, scene: b.scene, projectId: b.projectId, thumbnail: b.thumbnail })
                        toast.success('Board duplicated')
                      }}
                    >
                      Duplicate
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      icon={<Trash />}
                      danger
                      onSelect={async () => {
                        if (!(await confirm({ title: `Delete “${b.name}”?`, confirmLabel: 'Delete', danger: true }))) return
                        const removed = ws().remove('boards', b.id)
                        toast('Board deleted', { action: { label: 'Undo', onClick: () => ws().restore('boards', removed) } })
                      }}
                    >
                      Delete
                    </MenuItem>
                  </Popover>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </Page>
  )
}
