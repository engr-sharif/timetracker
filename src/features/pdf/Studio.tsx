import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  Columns2,
  Download,
  FileDown,
  FileSpreadsheet,
  FolderInput,
  LayoutGrid,
  ListChecks,
  Maximize,
  MoveHorizontal,
  PanelLeft,
  PenTool,
  Redo2,
  Ruler,
  ScanText,
  Search,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
  Images,
} from 'lucide-react'
import { cn, download, modKey, uid } from '@/lib/utils'
import { isTypingTarget } from '@/lib/hotkeys'
import { useRecord } from '@/store/workspace'
import type { PdfAnnot } from '@/store/types'
import { Button, IconButton, Spinner } from '@/components/ui/button'
import { MenuItem, MenuSeparator, Popover, Tooltip } from '@/components/ui/popover'
import { Kbd, Segmented } from '@/components/ui/misc'
import { Input } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { forgetPdf, getPage, isPasswordError, loadPdf } from './engine'
import { markupsCsv } from './report'
import { translate } from './geometry'
import { MarkupsPanel, MeasurePanel, PagesPanel, SearchPanel, boxTuple, useSearch } from './Panels'
import { Inspector, TextSelectionBar } from './Inspector'
import { CalibrateDialog, ExportDialog, OcrDialog, SignatureDialog } from './Dialogs'
import { TOOL_KEYS, ToolPalette } from './ToolPalette'
import { Viewer, scrollToBox } from './Viewer'
import { Organizer } from './Organizer'
import { Compare } from './Compare'
import { AskPanel } from './AskPanel'
import { addAnnots, ensurePdfDoc, removeAnnots, useStudio, type Panel } from './store'

const PANELS: { id: Exclude<Panel, null>; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'pages', label: 'Pages', icon: Images },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'markups', label: 'Markups', icon: ListChecks },
  { id: 'measure', label: 'Takeoff', icon: Ruler },
  { id: 'ask', label: 'Ask AI', icon: Sparkles },
]

export function Studio({ fileId }: { fileId: string }) {
  const file = useRecord('files', fileId)
  const docId = `pdf:${fileId}`
  const doc = useRecord('pdfs', docId)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [needPassword, setNeedPassword] = useState(false)
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const st = useStudio()
  const [query, setQuery] = useState('')
  const [activeHit, setActiveHit] = useState(0)
  const { results, busy: searching } = useSearch(doc, st.panel === 'search' ? query : '')
  const [dialog, setDialog] = useState<null | 'calibrate' | 'signature' | 'ocr' | 'export'>(null)
  const [exportPages, setExportPages] = useState<string[] | undefined>()
  const [askSeed, setAskSeed] = useState<string | null>(null)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900)

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Open the document (and create its Studio record the first time).
  const open = async (password?: string) => {
    setError(null)
    try {
      if (password) forgetPdf(fileId)
      const pdf = await loadPdf(fileId, password)
      ensurePdfDoc(fileId, pdf.numPages)
      useStudio.getState().open(docId)
      setNeedPassword(false)
    } catch (e) {
      if (isPasswordError(e)) setNeedPassword(true)
      else setError(e instanceof Error ? e.message : 'Could not open this PDF')
    }
  }
  useEffect(() => {
    if (file) void open()
    if (narrow) useStudio.getState().set({ panel: null })
    rootRef.current?.focus({ preventScroll: true })
  }, [fileId, !!file]) // eslint-disable-line react-hooks/exhaustive-deps

  // Page sizes (display orientation, points).
  useEffect(() => {
    if (!doc) return
    let alive = true
    void Promise.all(
      doc.pages.map(async (p) => {
        const pg = await getPage(p.src, p.index)
        const vp = pg.getViewport({ scale: 1, rotation: (pg.rotate + p.rotate) % 360 })
        return [p.key, { w: vp.width, h: vp.height }] as const
      }),
    ).then((entries) => alive && setSizes(Object.fromEntries(entries)), () => {})
    return () => {
      alive = false
    }
  }, [doc?.pages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep links: ?page=N&markup=id
  useEffect(() => {
    if (!doc || !Object.keys(sizes).length) return
    const markup = params.get('markup')
    const page = Number(params.get('page'))
    const t = setTimeout(() => {
      const root = scrollRef.current
      if (!root) return
      const a = markup ? doc.annots.find((x) => x.id === markup) : null
      if (a) {
        useStudio.getState().select([a.id])
        scrollToBox(root, a.page, boxTuple(a), false)
      } else if (page && doc.pages[page - 1]) scrollToBox(root, doc.pages[page - 1].key, undefined, false)
      if (markup || page) setParams({}, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [doc?.id, Object.keys(sizes).length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search navigation.
  useEffect(() => setActiveHit(0), [query])
  useEffect(() => {
    const r = results[activeHit]
    if (r && scrollRef.current) scrollToBox(scrollRef.current, r.page, r.box)
  }, [activeHit, results.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Calibration line finished → ask for its length.
  useEffect(() => {
    if (st.calibrating) {
      setDialog('calibrate')
      useStudio.getState().setTool('select')
    }
  }, [st.calibrating])

  const jumpTo = (a: PdfAnnot) => {
    useStudio.getState().setTool('select')
    useStudio.getState().select([a.id])
    if (scrollRef.current) scrollToBox(scrollRef.current, a.page, boxTuple(a))
  }

  const pageIndex = doc ? Math.max(0, doc.pages.findIndex((p) => p.key === st.activePage)) : 0

  const zoomBy = (k: number) => {
    const el = scrollRef.current
    const r = el?.getBoundingClientRect()
    // Zoom around the viewport centre.
    const s = useStudio.getState()
    if (el && r) {
      const cx = el.scrollLeft + r.width / 2
      const cy = el.scrollTop + r.height / 2
      s.setZoom(s.zoom * k)
      requestAnimationFrame(() => {
        el.scrollLeft = cx * k - r.width / 2
        el.scrollTop = cy * k - r.height / 2
      })
    } else s.setZoom(s.zoom * k)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isTypingTarget(e.target) || !doc) return
    const s = useStudio.getState()
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    const sel = doc.annots.filter((a) => s.selection.includes(a.id))
    if (mod && k === 'z') {
      e.preventDefault()
      return e.shiftKey ? s.doRedo() : s.doUndo()
    }
    if (mod && k === 'y') return (e.preventDefault(), s.doRedo())
    if (mod && k === 'f') return (e.preventDefault(), s.set({ panel: 'search', mode: 'markup' }))
    if (mod && (k === '=' || k === '+')) return (e.preventDefault(), zoomBy(1.25))
    if (mod && k === '-') return (e.preventDefault(), zoomBy(0.8))
    if (mod && k === '0') return (e.preventDefault(), s.setZoom(s.zoom, 'width'))
    if (mod && k === 'c' && sel.length && !window.getSelection()?.toString()) return s.set({ clipboard: sel })
    if (mod && k === 'v' && s.clipboard.length) {
      e.preventDefault()
      const page = s.activePage ?? doc.pages[0].key
      addAnnots(s.clipboard.map((a) => ({ ...translate(a, 12, -12), id: uid('m'), page: a.page === page ? a.page : page, createdAt: new Date().toISOString() })), { select: true })
      return
    }
    if (mod && k === 'd' && sel.length) {
      e.preventDefault()
      addAnnots(sel.map((a) => ({ ...translate(a, 10, -10), id: uid('m'), createdAt: new Date().toISOString() })), { select: true })
      return
    }
    if (mod && k === 'a' && s.mode === 'markup') {
      e.preventDefault()
      s.setTool('select')
      s.select(doc.annots.filter((a) => a.page === s.activePage).map((a) => a.id))
      return
    }
    if (mod) return
    if ((k === 'delete' || k === 'backspace') && sel.length) return (e.preventDefault(), removeAnnots(s.selection))
    if (k === 'escape') return s.selection.length ? s.select([]) : s.setTool('select')
    if (k.startsWith('arrow') && sel.length) {
      e.preventDefault()
      const d = e.shiftKey ? 10 : 1
      const [dx, dy] = k === 'arrowleft' ? [-d, 0] : k === 'arrowright' ? [d, 0] : k === 'arrowup' ? [0, d] : [0, -d]
      useStudio.getState().commit((dd) => ({ annots: dd.annots.map((a) => (s.selection.includes(a.id) ? translate(a, dx, dy) : a)) }))
      return
    }
    if (k === '+' || k === '=') return zoomBy(1.25)
    if (k === '-') return zoomBy(0.8)
    if (s.mode === 'markup' && TOOL_KEYS[k] && !e.altKey) {
      const t = TOOL_KEYS[k]
      if (t === 'image' && !s.signature) return setDialog('signature')
      s.setTool(t)
    }
  }

  if (!file) {
    return (
      <div className="grid h-full place-items-center text-sm text-subtle">
        <div className="text-center">
          This PDF isn’t in your Files.
          <div className="mt-3">
            <Link to="/pdf" className="text-accent-strong hover:underline">
              Back to PDF Studio
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} tabIndex={-1} data-own-keys onKeyDown={onKeyDown} className="flex h-full flex-col outline-none">
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-bg-elev/70 px-2 backdrop-blur-xl sm:px-3">
        <IconButton label="All PDFs" onClick={() => navigate('/pdf')}>
          <ArrowLeft />
        </IconButton>
        <IconButton label="Toggle sidebar" active={!!st.panel} onClick={() => st.set({ panel: st.panel ? null : 'pages' })} className="max-sm:hidden">
          <PanelLeft />
        </IconButton>
        <div className="min-w-0 flex-1 sm:flex-none">
          <div className="truncate text-[14px] font-semibold tracking-tight sm:max-w-[26ch]">{doc?.name ?? file.name}</div>
          <div className="text-[11px] text-subtle">
            {doc ? `Page ${pageIndex + 1} of ${doc.pages.length}` : 'Opening…'}
            {doc?.annots.length ? ` · ${doc.annots.length} markup${doc.annots.length === 1 ? '' : 's'}` : ''}
          </div>
        </div>

        <div className="mx-auto hidden items-center gap-3 lg:flex">
          <Segmented
            value={st.mode}
            onChange={(mode) => st.set({ mode, selection: [] })}
            options={[
              { value: 'markup', label: 'Markup', icon: <PenTool /> },
              { value: 'organize', label: 'Pages', icon: <LayoutGrid /> },
              { value: 'compare', label: 'Compare', icon: <Columns2 /> },
            ]}
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          {st.mode === 'markup' && (
            <div className="hidden items-center rounded-lg border border-border md:flex">
              <IconButton label="Zoom out" onClick={() => zoomBy(0.8)}>
                <ZoomOut />
              </IconButton>
              <Popover
                role="menu"
                trigger={<button className="h-8 w-14 font-mono text-[12px] text-muted tabular-nums hover:text-fg">{Math.round(st.zoom * 100)}%</button>}
              >
                <MenuItem icon={<MoveHorizontal className="size-4" />} onSelect={() => st.setZoom(st.zoom, 'width')} shortcut={`${modKey()} 0`}>
                  Fit width
                </MenuItem>
                <MenuItem icon={<Maximize className="size-4" />} onSelect={() => st.setZoom(st.zoom, 'page')}>
                  Fit page
                </MenuItem>
                <MenuSeparator />
                {[0.5, 1, 1.5, 2, 4].map((z) => (
                  <MenuItem key={z} onSelect={() => st.setZoom(z)}>
                    {z * 100}%
                  </MenuItem>
                ))}
              </Popover>
              <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}>
                <ZoomIn />
              </IconButton>
            </div>
          )}
          <Tooltip content={<span className="flex items-center gap-2">Undo <Kbd>{modKey()} Z</Kbd></span>}>
            <IconButton label="Undo" disabled={!st.undo.length} onClick={st.doUndo}>
              <Undo2 />
            </IconButton>
          </Tooltip>
          <IconButton label="Redo" disabled={!st.redo.length} onClick={st.doRedo} className="max-sm:hidden">
            <Redo2 />
          </IconButton>
          <Button size="sm" variant="ghost" icon={<ScanText className="size-4" />} onClick={() => setDialog('ocr')} className="max-md:hidden" disabled={!doc}>
            OCR
          </Button>
          <Popover
            role="menu"
            placement="bottom-end"
            trigger={
              <Button size="sm" variant="primary" icon={<Download className="size-3.5" />} disabled={!doc}>
                <span className="max-sm:hidden">Export</span>
              </Button>
            }
          >
            <MenuItem
              icon={<FileDown className="size-4" />}
              onSelect={() => {
                setExportPages(undefined)
                setDialog('export')
              }}
            >
              Export PDF…
            </MenuItem>
            <MenuItem icon={<FileSpreadsheet className="size-4" />} onSelect={() => doc && download(`${doc.name} markups.csv`, markupsCsv(doc), 'text/csv')}>
              Markups report (CSV)
            </MenuItem>
            <MenuItem icon={<FolderInput className="size-4" />} onSelect={() => navigate(`/files?focus=${fileId}`)}>
              Show original in Files
            </MenuItem>
            <MenuSeparator />
            <div className="px-1 lg:hidden">
              {(['markup', 'organize', 'compare'] as const).map((m) => (
                <MenuItem key={m} onSelect={() => st.set({ mode: m })} active={st.mode === m}>
                  {m === 'markup' ? 'Markup' : m === 'organize' ? 'Organize pages' : 'Compare revisions'}
                </MenuItem>
              ))}
              <MenuItem icon={<ScanText className="size-4" />} onSelect={() => setDialog('ocr')}>
                Recognize text (OCR)
              </MenuItem>
            </div>
          </Popover>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {st.mode === 'markup' && (
          <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-bg-elev/40 py-2 max-sm:hidden">
            {PANELS.map((p) => (
              <Tooltip key={p.id} content={p.label} placement="right">
                <button
                  onClick={() => st.set({ panel: st.panel === p.id ? null : p.id })}
                  className={cn('relative grid size-9 place-items-center rounded-xl transition-colors', st.panel === p.id ? 'text-fg' : 'text-subtle hover:bg-surface-2 hover:text-fg')}
                  aria-label={p.label}
                >
                  {st.panel === p.id && <motion.span layoutId="pdf-panel" className="absolute inset-0 rounded-xl bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <p.icon className="relative size-[18px]" />
                </button>
              </Tooltip>
            ))}
          </nav>
        )}
        <AnimatePresence initial={false}>
          {st.mode === 'markup' && st.panel && doc && (
            <motion.aside
              key="panel"
              data-panel
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: st.panel === 'ask' ? 340 : 272, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className={cn('shrink-0 overflow-hidden border-r border-border bg-bg-elev/50 backdrop-blur-xl', narrow && 'absolute inset-y-0 left-0 z-30 shadow-float sm:left-12')}
            >
              <div className="h-full overflow-y-auto" style={{ width: st.panel === 'ask' ? 340 : 272 }}>
                {st.panel === 'pages' && <PagesPanel doc={doc} onJump={(k) => scrollRef.current && scrollToBox(scrollRef.current, k)} />}
                {st.panel === 'search' && <SearchPanel query={query} setQuery={setQuery} results={results} busy={searching} active={activeHit} setActive={setActiveHit} />}
                {st.panel === 'markups' && <MarkupsPanel doc={doc} onJump={jumpTo} />}
                {st.panel === 'measure' && <MeasurePanel doc={doc} onJump={jumpTo} onCalibrate={() => setDialog('calibrate')} />}
                {st.panel === 'ask' && <AskPanel doc={doc} seed={askSeed} onSeedUsed={() => setAskSeed(null)} onJumpPage={(n) => doc.pages[n - 1] && scrollRef.current && scrollToBox(scrollRef.current, doc.pages[n - 1].key)} />}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main data-studio-main className="relative min-w-0 flex-1" onPointerDown={() => rootRef.current?.contains(document.activeElement) || rootRef.current?.focus({ preventScroll: true })}>
          {error ? (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">{error}</div>
          ) : !doc ? (
            <div className="grid h-full place-items-center">
              <Spinner className="size-5" />
            </div>
          ) : st.mode === 'organize' ? (
            <Organizer
              doc={doc}
              onExtract={(keys) => {
                setExportPages(keys)
                setDialog('export')
              }}
            />
          ) : st.mode === 'compare' ? (
            <Compare doc={doc} />
          ) : (
            <>
              <Viewer doc={doc} sizes={sizes} hits={st.panel === 'search' ? results : []} activeHit={activeHit} scrollRef={scrollRef} />
              <ToolPalette onSignature={() => setDialog('signature')} onCalibrate={() => setDialog('calibrate')} />
              <Inspector doc={doc} />
              <TextSelectionBar
                onAsk={(text) => {
                  setAskSeed(text)
                  st.set({ panel: 'ask' })
                }}
              />
              <SelectedMarkupHint doc={doc} />
            </>
          )}
        </main>
      </div>

      {doc && (
        <>
          <CalibrateDialog doc={doc} open={dialog === 'calibrate'} onClose={() => setDialog(null)} />
          <SignatureDialog open={dialog === 'signature'} onClose={() => setDialog(null)} />
          <OcrDialog doc={doc} open={dialog === 'ocr'} onClose={() => setDialog(null)} />
          <ExportDialog doc={doc} open={dialog === 'export'} onClose={() => setDialog(null)} pages={exportPages} />
        </>
      )}
      <PasswordDialog open={needPassword} onSubmit={(pw) => void open(pw)} onClose={() => navigate('/pdf')} />
    </div>
  )
}

/** Tiny hint while a multi-click tool is mid-shape. */
function SelectedMarkupHint({ doc }: { doc: { annots: PdfAnnot[] } }) {
  const tool = useStudio((s) => s.tool)
  const hint =
    tool === 'polygon' || tool === 'area' || tool === 'polylength'
      ? 'Click to add points · double-click or Enter to finish · Backspace undoes a point'
      : tool === 'count'
        ? 'Click each item to count it · Esc to finish'
        : tool === 'calibrate'
          ? 'Drag along a known dimension'
          : tool === 'highlight'
            ? 'Drag across text to highlight it, or draw freehand'
            : tool === 'pen'
              ? 'Hold at the end of a stroke to snap it into a shape'
              : null
  void doc
  return (
    <AnimatePresence>
      {hint && (
        <motion.div key={hint} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-bg-elev/85 px-3 py-1.5 text-[11.5px] text-muted shadow-soft backdrop-blur-xl">
          {hint}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PasswordDialog({ open, onSubmit, onClose }: { open: boolean; onSubmit: (pw: string) => void; onClose: () => void }) {
  const [pw, setPw] = useState('')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Password-protected PDF"
      description="Enter the document password to open it. It isn’t stored."
      footer={
        <Button variant="primary" disabled={!pw} onClick={() => onSubmit(pw)}>
          Open
        </Button>
      }
    >
      <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && onSubmit(pw)} />
    </Dialog>
  )
}
