import { createStore, del, get, set } from 'idb-keyval'

/** Binary file contents live in their own IndexedDB store, keyed by FileMeta id. */
const blobs = createStore('workbench-blobs', 'blobs')

export const putBlob = (id: string, blob: Blob) => set(id, blob, blobs)
export const deleteBlob = (id: string) => del(id, blobs)
export const getLocalBlob = (id: string) => get<Blob>(id, blobs)

/** Optional remote source (cloud storage) consulted when a blob isn't on this device. */
let remoteSource: ((id: string) => Promise<Blob | null>) | null = null
export function setRemoteBlobSource(fn: typeof remoteSource) {
  remoteSource = fn
}

const inflight = new Map<string, Promise<Blob | undefined>>()

/** Local blob, or fetched from the cloud (and cached locally) when missing. */
export async function getBlob(id: string): Promise<Blob | undefined> {
  const local = await get<Blob>(id, blobs)
  if (local || !remoteSource) return local
  let p = inflight.get(id)
  if (!p) {
    p = remoteSource(id)
      .then(async (b) => {
        if (b) await putBlob(id, b)
        return b ?? undefined
      })
      .catch(() => undefined)
      .finally(() => inflight.delete(id))
    inflight.set(id, p)
  }
  return p
}

const urlCache = new Map<string, string>()

export async function blobUrl(id: string) {
  const cached = urlCache.get(id)
  if (cached) return cached
  const blob = await getBlob(id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'sheet' | 'doc' | 'cad' | 'archive' | 'text' | 'other'

export function fileKind(name: string, type: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext)) return 'sheet'
  if (['doc', 'docx', 'pages', 'rtf', 'ppt', 'pptx', 'key'].includes(ext)) return 'doc'
  if (['dwg', 'dxf', 'dgn', 'rvt', 'ifc', 'step', 'stp', 'skp', 'kmz', 'kml', 'shp'].includes(ext)) return 'cad'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (type.startsWith('text/') || ['md', 'txt', 'json', 'xml', 'yml', 'yaml'].includes(ext)) return 'text'
  return 'other'
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
