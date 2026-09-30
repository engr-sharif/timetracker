/** Helpers for TipTap JSON documents that don't need the editor bundle. */

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string }[] }

export const emptyNoteContent = (): Node => ({ type: 'doc', content: [{ type: 'paragraph' }] })

const text = (t: string, bold = false): Node => ({ type: 'text', text: t, ...(bold ? { marks: [{ type: 'bold' }] } : {}) })
export const h = (level: number, t: string): Node => ({ type: 'heading', attrs: { level }, content: [text(t)] })
export const p = (...parts: (string | Node)[]): Node => ({
  type: 'paragraph',
  content: parts.map((x) => (typeof x === 'string' ? text(x) : x)),
})
export const b = (t: string) => text(t, true)
export const bullets = (...items: string[]): Node => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
})
export const todos = (...items: [string, boolean][]): Node => ({
  type: 'taskList',
  content: items.map(([t, checked]) => ({ type: 'taskItem', attrs: { checked }, content: [p(t)] })),
})
export const doc = (...content: Node[]): Node => ({ type: 'doc', content })

/** Flattens a TipTap doc to plain text for search and previews. */
export function docToText(node: unknown): string {
  const n = node as Node
  if (!n) return ''
  if (n.type === 'text') return n.text ?? ''
  const inner = (n.content ?? []).map(docToText).join(n.type === 'doc' ? '\n' : '')
  return ['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock'].includes(n.type) ? inner + '\n' : inner
}
