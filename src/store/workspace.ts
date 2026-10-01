import { create } from 'zustand'
import { useMemo } from 'react'
import { createStore, get as idbGet, set as idbSet } from 'idb-keyval'
import { nowIso, uid } from '@/lib/utils'
import {
  COLLECTIONS,
  type CollectionName,
  type Collections,
  type Draft,
  type Tables,
  type WorkSettings,
  type WorkspaceDoc,
} from './types'

const idb = createStore('workbench', 'kv')
const DOC_KEY = 'doc:v4'

export const emptyTables = (): Tables =>
  Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as unknown as Tables

export const defaultSettings = (): WorkSettings => ({
  weeklyTarget: 40,
  billableTarget: 32,
  weekStartsOn: 1,
  defaultBillable: true,
  updatedAt: new Date(0).toISOString(),
})

export const emptyDoc = (): WorkspaceDoc => ({
  version: 4,
  tables: emptyTables(),
  tombstones: {},
  settings: defaultSettings(),
  submittedWeeks: {},
})

/** Make sure a doc loaded from anywhere has every table present. */
export function normalizeDoc(doc: Partial<WorkspaceDoc> | null | undefined): WorkspaceDoc {
  const base = emptyDoc()
  if (!doc) return base
  return {
    version: 4,
    tables: { ...base.tables, ...(doc.tables ?? {}) },
    tombstones: doc.tombstones ?? {},
    settings: { ...base.settings, ...(doc.settings ?? {}) },
    submittedWeeks: doc.submittedWeeks ?? {},
  }
}

type Patch<T> = Partial<T> | ((current: T) => Partial<T>)

interface WorkspaceState {
  ready: boolean
  doc: WorkspaceDoc
  /** bumps on every local mutation — the sync engine watches this */
  revision: number
  load: () => Promise<void>
  replaceDoc: (doc: WorkspaceDoc, opts?: { local?: boolean }) => void
  create: <K extends CollectionName>(col: K, draft: Draft<Collections[K]>) => Collections[K]
  update: <K extends CollectionName>(col: K, id: string, patch: Patch<Collections[K]>) => void
  remove: <K extends CollectionName>(col: K, ids: string | string[]) => Collections[K][]
  restore: <K extends CollectionName>(col: K, records: Collections[K][]) => void
  setSettings: (patch: Partial<WorkSettings>) => void
  toggleSubmitted: (weekKey: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist(doc: WorkspaceDoc) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void idbSet(DOC_KEY, doc, idb), 250)
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const commit = (fn: (doc: WorkspaceDoc) => WorkspaceDoc) => {
    const doc = fn(get().doc)
    set({ doc, revision: get().revision + 1 })
    persist(doc)
  }

  return {
    ready: false,
    doc: emptyDoc(),
    revision: 0,

    async load() {
      const stored = await idbGet<WorkspaceDoc>(DOC_KEY, idb)
      set({ doc: normalizeDoc(stored), ready: true })
    },

    replaceDoc(doc, opts) {
      set((s) => ({ doc, revision: opts?.local ? s.revision + 1 : s.revision }))
      persist(doc)
    },

    create(col, draft) {
      const ts = nowIso()
      const record = { ...draft, id: draft.id ?? uid(), createdAt: ts, updatedAt: ts } as Collections[typeof col]
      commit((doc) => ({
        ...doc,
        tables: { ...doc.tables, [col]: { ...doc.tables[col], [record.id]: record } },
      }))
      return record
    },

    update(col, id, patch) {
      commit((doc) => {
        const table = doc.tables[col] as Record<string, Collections[typeof col]>
        const current = table[id]
        if (!current) return doc
        const changes = typeof patch === 'function' ? patch(current) : patch
        const next = { ...current, ...changes, updatedAt: nowIso() }
        return { ...doc, tables: { ...doc.tables, [col]: { ...table, [id]: next } } }
      })
    },

    remove(col, ids) {
      const list = Array.isArray(ids) ? ids : [ids]
      const table = get().doc.tables[col] as Record<string, Collections[typeof col]>
      const removed = list.map((id) => table[id]).filter(Boolean)
      if (!removed.length) return []
      commit((doc) => {
        const nextTable = { ...(doc.tables[col] as Record<string, unknown>) }
        const tombstones = { ...doc.tombstones }
        const ts = nowIso()
        for (const id of list) {
          delete nextTable[id]
          tombstones[id] = ts
        }
        return { ...doc, tombstones, tables: { ...doc.tables, [col]: nextTable } }
      })
      return removed
    },

    restore(col, records) {
      commit((doc) => {
        const table = { ...(doc.tables[col] as Record<string, unknown>) }
        const tombstones = { ...doc.tombstones }
        const ts = nowIso()
        for (const r of records) {
          table[r.id] = { ...r, updatedAt: ts }
          delete tombstones[r.id]
        }
        return { ...doc, tombstones, tables: { ...doc.tables, [col]: table } }
      })
    },

    setSettings(patch) {
      commit((doc) => ({ ...doc, settings: { ...doc.settings, ...patch, updatedAt: nowIso() } }))
    },

    toggleSubmitted(weekKey) {
      commit((doc) => {
        const submittedWeeks = { ...doc.submittedWeeks }
        const tombstones = { ...doc.tombstones }
        const tid = `week:${weekKey}`
        if (submittedWeeks[weekKey]) {
          delete submittedWeeks[weekKey]
          tombstones[tid] = nowIso()
        } else {
          submittedWeeks[weekKey] = nowIso()
          delete tombstones[tid]
        }
        return { ...doc, submittedWeeks, tombstones }
      })
    },
  }
})

/* ------------------------------------------------------------------ */
/*  Selector hooks                                                     */
/* ------------------------------------------------------------------ */

export function useTable<K extends CollectionName>(col: K) {
  return useWorkspace((s) => s.doc.tables[col]) as Record<string, Collections[K]>
}

/** Stable array of a collection's records. */
export function useList<K extends CollectionName>(col: K) {
  const table = useTable(col)
  return useMemo(() => Object.values(table), [table])
}

export function useRecord<K extends CollectionName>(col: K, id: string | undefined) {
  return useWorkspace((s) => (id ? (s.doc.tables[col] as Record<string, Collections[K]>)[id] : undefined))
}

export const useSettings = () => useWorkspace((s) => s.doc.settings)

/** Imperative access for event handlers. */
export const ws = () => useWorkspace.getState()
