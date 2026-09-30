import { create } from 'zustand'
import type { PdfAnnot, PdfDoc, PdfPageRef } from '@/store/types'
import { ws } from '@/store/workspace'

export type Tool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'highlight'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'cloud'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'text'
  | 'callout'
  | 'stamp'
  | 'image'
  | 'length'
  | 'polylength'
  | 'area'
  | 'count'
  | 'calibrate'
  | 'redact'

export interface ToolStyle {
  color: string
  width: number
  opacity: number
  fill: string | null
  size: number
}

export const PALETTE = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#8e4ec6', '#1c2024', '#ffffff']
export const HIGHLIGHTS = ['#ffe629', '#7ce07a', '#6ed3ff', '#ff8ad8', '#ffb35c']

const base: ToolStyle = { color: '#e5484d', width: 2, opacity: 1, fill: null, size: 12 }
const DEFAULT_STYLES: Partial<Record<Tool, ToolStyle>> = {
  pen: { ...base, color: '#0090ff', width: 2.2 },
  highlight: { ...base, color: '#ffe629', width: 14, opacity: 0.45 },
  rect: { ...base },
  ellipse: { ...base },
  cloud: { ...base, width: 1.6 },
  line: { ...base },
  arrow: { ...base },
  polygon: { ...base },
  text: { ...base, color: '#e5484d', size: 12 },
  callout: { ...base, size: 11 },
  length: { ...base, color: '#0090ff', width: 1.4, size: 10 },
  polylength: { ...base, color: '#0090ff', width: 1.4, size: 10 },
  area: { ...base, color: '#30a46c', width: 1.4, fill: '#30a46c', opacity: 1, size: 10 },
  count: { ...base, color: '#f76b15', size: 7 },
  stamp: { ...base, size: 18 },
  image: { ...base },
}

export const styleFor = (tool: Tool, styles: Partial<Record<Tool, ToolStyle>>): ToolStyle => styles[tool] ?? DEFAULT_STYLES[tool] ?? base

export type SmartInk = 'hold' | 'always' | 'off'
export type Panel = 'pages' | 'search' | 'markups' | 'measure' | 'ask' | null
export type Mode = 'markup' | 'organize' | 'compare'

export interface StampPreset {
  text: string
  color: string
}

export const STAMPS: StampPreset[] = [
  { text: 'APPROVED', color: '#30a46c' },
  { text: 'APPROVED AS NOTED', color: '#d6a100' },
  { text: 'REVISE & RESUBMIT', color: '#f76b15' },
  { text: 'REJECTED', color: '#e5484d' },
  { text: 'REVIEWED', color: '#0090ff' },
  { text: 'FOR CONSTRUCTION', color: '#30a46c' },
  { text: 'NOT FOR CONSTRUCTION', color: '#e5484d' },
  { text: 'PRELIMINARY', color: '#8e4ec6' },
  { text: 'FOR REVIEW', color: '#0090ff' },
  { text: 'AS-BUILT', color: '#1c2024' },
  { text: 'VOID', color: '#e5484d' },
  { text: 'CONFIDENTIAL', color: '#e5484d' },
]

interface Snapshot {
  annots: PdfAnnot[]
  pages: PdfPageRef[]
}

interface StudioState {
  docId: string | null
  tool: Tool
  styles: Partial<Record<Tool, ToolStyle>>
  selection: string[]
  zoom: number
  fit: 'width' | 'page' | null
  smartInk: SmartInk
  panel: Panel
  mode: Mode
  stamp: StampPreset
  signature: string | null
  activePage: string | null
  editing: string | null
  undo: Snapshot[]
  redo: Snapshot[]
  clipboard: PdfAnnot[]
  flash: { page: string; box: [number, number, number, number]; at: number } | null
  /** count markup currently being added to */
  countId: string | null
  /** a calibration line just drawn, waiting for its real length */
  calibrating: { page: string; points: number } | null
  /** bumps when OCR results change so pages re-read them */
  ocrVersion: number
  setTool: (t: Tool) => void
  setStyle: (patch: Partial<ToolStyle>, tool?: Tool) => void
  select: (ids: string[]) => void
  setZoom: (z: number, fit?: 'width' | 'page' | null) => void
  set: (patch: Partial<StudioState>) => void
  open: (docId: string) => void
  /** Applies a change to the document and records it for undo. */
  commit: (fn: (doc: PdfDoc) => Partial<Pick<PdfDoc, 'annots' | 'pages' | 'scale' | 'pageScales'>>) => void
  doUndo: () => void
  doRedo: () => void
}

const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem('wb.pdf.prefs') ?? '{}') as Partial<Pick<StudioState, 'styles' | 'smartInk' | 'panel' | 'signature'>>
  } catch {
    return {}
  }
}

const doc = (id: string | null) => (id ? ws().doc.tables.pdfs[id] : undefined)

export const useStudio = create<StudioState>((set, get) => ({
  docId: null,
  tool: 'select',
  styles: {},
  selection: [],
  zoom: 1,
  fit: 'width',
  smartInk: 'hold',
  panel: 'pages',
  mode: 'markup',
  stamp: STAMPS[0],
  signature: null,
  activePage: null,
  editing: null,
  undo: [],
  redo: [],
  clipboard: [],
  flash: null,
  countId: null,
  calibrating: null,
  ocrVersion: 0,
  ...loadPrefs(),

  setTool: (tool) => set({ tool, selection: tool === 'select' ? get().selection : [], editing: null, countId: null }),
  setStyle: (patch, tool) => {
    const t = tool ?? get().tool
    set((s) => ({ styles: { ...s.styles, [t]: { ...styleFor(t, s.styles), ...patch } } }))
  },
  select: (selection) => set({ selection, editing: null }),
  setZoom: (zoom, fit = null) => set({ zoom: Math.min(8, Math.max(0.1, zoom)), fit }),
  set: (patch) => set(patch as Partial<StudioState>),
  open: (docId) => set({ docId, selection: [], undo: [], redo: [], editing: null, mode: 'markup', activePage: null }),

  commit: (fn) => {
    const d = doc(get().docId)
    if (!d) return
    const patch = fn(d)
    set((s) => ({ undo: [...s.undo.slice(-99), { annots: d.annots, pages: d.pages }], redo: [] }))
    ws().update('pdfs', d.id, patch)
  },
  doUndo: () => {
    const d = doc(get().docId)
    const prev = get().undo.at(-1)
    if (!d || !prev) return
    set((s) => ({ undo: s.undo.slice(0, -1), redo: [...s.redo, { annots: d.annots, pages: d.pages }], selection: [] }))
    ws().update('pdfs', d.id, prev)
  },
  doRedo: () => {
    const d = doc(get().docId)
    const next = get().redo.at(-1)
    if (!d || !next) return
    set((s) => ({ redo: s.redo.slice(0, -1), undo: [...s.undo, { annots: d.annots, pages: d.pages }], selection: [] }))
    ws().update('pdfs', d.id, next)
  },
}))

useStudio.subscribe((s, p) => {
  if (s.styles === p.styles && s.smartInk === p.smartInk && s.panel === p.panel && s.signature === p.signature) return
  try {
    localStorage.setItem('wb.pdf.prefs', JSON.stringify({ styles: s.styles, smartInk: s.smartInk, panel: s.panel, signature: s.signature }))
  } catch {
    /* storage full or blocked — preferences just won't persist */
  }
})

/* ------------------------------------------------------------------ */
/*  Signatures stay on this device only                                */
/* ------------------------------------------------------------------ */

export function loadSignatures(): string[] {
  try {
    return JSON.parse(localStorage.getItem('wb.signatures') ?? '[]')
  } catch {
    return []
  }
}

export function saveSignatures(list: string[]) {
  localStorage.setItem('wb.signatures', JSON.stringify(list.slice(0, 6)))
}

/** Creates (or returns) the Studio document for a stored PDF file. */
export function ensurePdfDoc(fileId: string, pageCount: number): PdfDoc {
  const id = `pdf:${fileId}`
  const existing = ws().doc.tables.pdfs[id]
  const file = ws().doc.tables.files[fileId]
  if (existing) return existing
  return ws().create('pdfs', {
    id,
    fileId,
    name: file?.name.replace(/\.pdf$/i, '') ?? 'Untitled',
    projectId: file?.projectId,
    pages: Array.from({ length: pageCount }, (_, i) => ({ key: `${fileId.slice(-6)}-${i}`, src: fileId, index: i, rotate: 0 })),
    annots: [],
  })
}

/* ------------------------------------------------------------------ */
/*  Markup mutations (all undoable)                                    */
/* ------------------------------------------------------------------ */

export function addAnnots(list: PdfAnnot[], opts: { select?: boolean } = {}) {
  if (!list.length) return
  useStudio.getState().commit((d) => ({ annots: [...d.annots, ...list] }))
  if (opts.select) useStudio.getState().select(list.map((a) => a.id))
}

export function patchAnnots(changes: Record<string, Partial<PdfAnnot>>, opts: { record?: boolean } = {}) {
  const apply = (d: PdfDoc) => ({ annots: d.annots.map((a) => (changes[a.id] ? { ...a, ...changes[a.id] } : a)) })
  if (opts.record === false) {
    const st = useStudio.getState()
    const d = st.docId ? ws().doc.tables.pdfs[st.docId] : undefined
    if (d) ws().update('pdfs', d.id, apply(d))
    return
  }
  useStudio.getState().commit(apply)
}

export function removeAnnots(ids: string[]) {
  if (!ids.length) return
  const set = new Set(ids)
  useStudio.getState().commit((d) => ({ annots: d.annots.filter((a) => !set.has(a.id)) }))
  useStudio.setState((s) => ({ selection: s.selection.filter((id) => !set.has(id)) }))
}

export const currentDoc = () => {
  const id = useStudio.getState().docId
  return id ? ws().doc.tables.pdfs[id] : undefined
}
