import { createStore, del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import type { ReadingKind } from '@/store/types'
import { getBlob } from '@/lib/files'
import type { Block, BlockKind, ParsedDoc, TocEntry } from './text'

/**
 * Turns documents into clean reading text: paragraphs, headings and a table of
 * contents. PDFs get line joining, de-hyphenation and running header/footer
 * removal; EPUB/DOCX are unzipped and walked in reading order.
 */

const VERSION = 3
const cache = createStore('workbench-reader', 'docs')

export const READABLE = /\.(pdf|epub|docx|txt|text|md|markdown|html?|xhtml|rtf)$/i

export function kindOf(name: string, type = ''): ReadingKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ext === 'epub' || type === 'application/epub+zip') return 'epub'
  if (ext === 'docx') return 'docx'
  if (ext === 'rtf' || type === 'application/rtf' || type === 'text/rtf') return 'rtf'
  if (['html', 'htm', 'xhtml'].includes(ext) || type === 'text/html') return 'html'
  if (['md', 'markdown'].includes(ext) || type === 'text/markdown') return 'md'
  if (['txt', 'text'].includes(ext) || type.startsWith('text/')) return 'text'
  if (type.startsWith('image/')) return 'image'
  return null
}

export const titleFromName = (name: string) => name.replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled'

/** Cached parse for a stored file, or a fresh one. */
export async function loadDoc(fileId: string, name: string, type: string, opts: { force?: boolean; onProgress?: (p: number) => void } = {}): Promise<ParsedDoc> {
  if (!opts.force) {
    const hit = await idbGet<{ v: number; doc: ParsedDoc }>(fileId, cache)
    if (hit?.v === VERSION) return hit.doc
  }
  const blob = await getBlob(fileId)
  if (!blob) throw new Error('This file isn’t on this device yet — open it once on the device that added it, or turn on Cloud sync.')
  const kind = kindOf(name, type || blob.type)
  let doc: ParsedDoc
  switch (kind) {
    case 'pdf':
      doc = await parsePdf(fileId, opts.onProgress)
      break
    case 'epub':
      doc = await parseEpub(new Uint8Array(await blob.arrayBuffer()))
      break
    case 'docx':
      doc = await parseDocx(new Uint8Array(await blob.arrayBuffer()))
      break
    case 'html':
      doc = parseHtml(await blob.text())
      break
    case 'rtf':
      doc = parsePlain(rtfToText(await blob.text()))
      break
    case 'md':
      doc = parseMarkdown(await blob.text())
      break
    case 'text':
      doc = parsePlain(await blob.text())
      break
    default:
      throw new Error('This file type can’t be read yet. Try PDF, EPUB, Word (.docx), text, Markdown, HTML or RTF.')
  }
  if (!doc.title) doc.title = titleFromName(name)
  if (!doc.toc.length) doc.toc = headingToc(doc.blocks)
  doc.blocks = doc.blocks.filter((b) => b.t)
  await idbSet(fileId, { v: VERSION, doc }, cache)
  return doc
}

export const forgetDoc = (fileId: string) => idbDel(fileId, cache)

const clean = (s: string) =>
  s
    .replace(/[­​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function headingToc(blocks: Block[]): TocEntry[] {
  const heads = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.k === 'h' && b.t.length < 140)
  if (!heads.length) return []
  const top = Math.min(...heads.map(({ b }) => b.lvl ?? 2))
  return heads.filter(({ b }) => (b.lvl ?? 2) <= top + 1).map(({ b, i }) => ({ title: b.t, block: i, level: (b.lvl ?? 2) - top }))
}

/* ------------------------------------------------------------------ */
/*  Plain text & Markdown                                              */
/* ------------------------------------------------------------------ */

const BULLET = /^\s*(?:[-*•◦▪‣]|\d{1,3}[.)])\s+/

export function parsePlain(text: string, title = ''): ParsedDoc {
  const src = text.replace(/\r\n?/g, '\n')
  const blocks: Block[] = []
  const hasBlank = /\n\s*\n/.test(src)
  const chunks = hasBlank ? src.split(/\n\s*\n/) : src.split('\n')
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    // Lists keep one block per item; wrapped prose is joined (and de-hyphenated).
    if (lines.length > 1 && lines.every((l) => BULLET.test(l))) {
      for (const l of lines) blocks.push({ k: 'li', t: clean(l.replace(BULLET, '')) })
      continue
    }
    const joined = lines.reduce((acc, l) => (/\p{L}-$/u.test(acc) && /^\p{Ll}/u.test(l) ? acc.slice(0, -1) + l : acc ? `${acc} ${l}` : l), '')
    const t = clean(joined)
    const looksHeading = lines.length === 1 && t.length < 70 && !/[.,;:!?]$/.test(t) && (t === t.toUpperCase() ? /\p{L}/u.test(t) : /^(chapter|part|section|book)\b/i.test(t))
    blocks.push({ k: looksHeading ? 'h' : BULLET.test(lines[0]) ? 'li' : 'p', t: BULLET.test(lines[0]) && !looksHeading ? clean(t.replace(BULLET, '')) : t, lvl: looksHeading ? 2 : undefined })
  }
  return { title, blocks, toc: [] }
}

const stripMd = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\p{L}\d])[*_](.+?)[*_](?![\p{L}\d])/gu, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')

export function parseMarkdown(text: string): ParsedDoc {
  const blocks: Block[] = []
  let para: string[] = []
  let fence = false
  let code: string[] = []
  let title = ''
  const flush = () => {
    if (para.length) blocks.push({ k: 'p', t: clean(stripMd(para.join(' '))) })
    para = []
  }
  let lines = text.replace(/\r\n?/g, '\n').split('\n')
  // Front matter
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) {
      title = lines.slice(1, end).find((l) => /^title:/i.test(l))?.replace(/^title:\s*/i, '').replace(/^["']|["']$/g, '') ?? ''
      lines = lines.slice(end + 1)
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^\s*(```|~~~)/.test(line)) {
      if (fence) {
        if (code.length) blocks.push({ k: 'pre', t: clean(code.join(' ')) })
        code = []
      } else flush()
      fence = !fence
      continue
    }
    if (fence) {
      code.push(line)
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*$/)
    if (h) {
      flush()
      const t = clean(stripMd(h[2]))
      if (!title && h[1].length === 1) title = t
      blocks.push({ k: 'h', t, lvl: Math.min(4, h[1].length) })
      continue
    }
    if (!line.trim() || /^\s*([-*_]\s*){3,}$/.test(line) || /^\s*\|?\s*:?-{3,}/.test(line)) {
      flush()
      continue
    }
    const li = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/)
    if (li) {
      flush()
      blocks.push({ k: 'li', t: clean(stripMd(li[1])) })
      continue
    }
    const q = line.match(/^\s*>\s?(.*)$/)
    if (q) {
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.k === 'q' && q[1]) last.t = clean(`${last.t} ${stripMd(q[1])}`)
      else if (q[1]) blocks.push({ k: 'q', t: clean(stripMd(q[1])) })
      continue
    }
    // Setext headings
    if (/^\s*(=+|-+)\s*$/.test(line) && para.length === 1) {
      const t = clean(stripMd(para[0]))
      para = []
      blocks.push({ k: 'h', t, lvl: line.includes('=') ? 1 : 2 })
      continue
    }
    para.push(line.replace(/\|/g, ' ').trim())
  }
  flush()
  return { title, blocks, toc: [] }
}

/* ------------------------------------------------------------------ */
/*  RTF                                                                */
/* ------------------------------------------------------------------ */

const SKIP_DEST = /^(fonttbl|colortbl|stylesheet|info|pict|header|footer|headerl|headerr|footerl|footerr|object|themedata|datastore|latentstyles|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|mmathPr)$/

export function rtfToText(rtf: string): string {
  let out = ''
  const stack: boolean[] = []
  let skip = false
  let uc = 1
  let pendingSkip = 0
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i]
    if (c === '{') {
      stack.push(skip)
      continue
    }
    if (c === '}') {
      skip = stack.pop() ?? false
      continue
    }
    if (c === '\\') {
      const n = rtf[i + 1]
      if (n === '\\' || n === '{' || n === '}') {
        if (!skip) out += n
        i++
        continue
      }
      if (n === '*') {
        skip = true
        i++
        continue
      }
      if (n === "'") {
        const hex = rtf.slice(i + 2, i + 4)
        if (!skip) {
          if (pendingSkip > 0) pendingSkip--
          else out += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex, 16)]))
        }
        i += 3
        continue
      }
      if (n === '~') {
        if (!skip) out += ' '
        i++
        continue
      }
      if (n === '-' || n === '_') {
        if (!skip && n === '_') out += '-'
        i++
        continue
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40))
      if (!m) {
        i++
        continue
      }
      i += m[0].length
      const word = m[1]
      const arg = m[2] ? parseInt(m[2], 10) : undefined
      if (SKIP_DEST.test(word)) skip = true
      else if (!skip) {
        if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n\n'
        else if (word === 'tab' || word === 'cell') out += ' '
        else if (word === 'emdash') out += '—'
        else if (word === 'endash') out += '–'
        else if (word === 'lquote') out += '‘'
        else if (word === 'rquote') out += '’'
        else if (word === 'ldblquote') out += '“'
        else if (word === 'rdblquote') out += '”'
        else if (word === 'bullet') out += '•'
        else if (word === 'uc' && arg !== undefined) uc = arg
        else if (word === 'u' && arg !== undefined) {
          out += String.fromCharCode(arg < 0 ? arg + 65536 : arg)
          pendingSkip = uc
        }
      }
      continue
    }
    if (c === '\n' || c === '\r') continue
    if (skip) continue
    if (pendingSkip > 0) {
      pendingSkip--
      continue
    }
    out += c
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  HTML / XHTML (also used by EPUB)                                   */
/* ------------------------------------------------------------------ */

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'head', 'iframe', 'object', 'button', 'select', 'form', 'input', 'textarea', 'img', 'video', 'audio', 'canvas'])
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'blockquote', 'pre', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'br', 'body', 'html', 'address', 'center', 'details', 'summary', 'hgroup'])

/** Walks an HTML subtree into blocks. `onAnchor` receives element ids with the block index they lead to. */
export function htmlBlocks(root: Element, blocks: Block[] = [], onAnchor?: (id: string, block: number) => void) {
  let inline = ''
  let kind: BlockKind = 'p'
  const flush = () => {
    const t = clean(inline)
    if (t) blocks.push({ k: kind, t })
    inline = ''
  }
  const walk = (node: Node, ctx: BlockKind) => {
    if (node.nodeType === 3) {
      inline += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== 1) return
    const el = node as Element
    const tag = el.localName.toLowerCase()
    if (SKIP_TAGS.has(tag)) {
      if (tag === 'img' && el.getAttribute('alt') && inline) inline += ' '
      return
    }
    if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('hidden') !== null) return
    const id = el.getAttribute('id')
    if (!BLOCK_TAGS.has(tag)) {
      if (tag === 'sup' && /^\s*\[?\d+\]?\s*$/.test(el.textContent ?? '') && el.querySelector('a')) return // footnote markers
      if (id) onAnchor?.(id, blocks.length)
      el.childNodes.forEach((c) => walk(c, ctx))
      return
    }
    flush()
    if (id) onAnchor?.(id, blocks.length)
    if (tag === 'br') return
    const h = tag.match(/^h([1-6])$/)
    if (h) {
      const t = clean(el.textContent ?? '')
      el.querySelectorAll('[id]').forEach((x) => onAnchor?.(x.getAttribute('id')!, blocks.length))
      if (t) blocks.push({ k: 'h', t, lvl: Math.min(4, +h[1]) })
      return
    }
    const k: BlockKind = tag === 'li' || tag === 'dt' || tag === 'dd' ? 'li' : tag === 'blockquote' ? 'q' : tag === 'pre' ? 'pre' : ctx
    const prev = kind
    kind = k
    el.childNodes.forEach((c) => walk(c, k))
    flush()
    kind = prev
  }
  walk(root, 'p')
  flush()
  return blocks
}

export function parseHtml(html: string): ParsedDoc {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const title = clean(dom.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? dom.title ?? '') || clean(dom.querySelector('h1')?.textContent ?? '')
  const author = dom.querySelector('meta[name="author"]')?.getAttribute('content') ?? undefined
  const root = dom.querySelector('article') ?? dom.querySelector('main, [role="main"]') ?? dom.body
  root.querySelectorAll('nav, aside, footer, [role="navigation"], [role="complementary"], .sidebar, .comments, .advert, .ad').forEach((n) => n.remove())
  return { title, author, blocks: htmlBlocks(root), toc: [] }
}

/* ------------------------------------------------------------------ */
/*  Zip-based formats                                                  */
/* ------------------------------------------------------------------ */

const td = new TextDecoder()

function unzipText(data: Uint8Array, want: (name: string) => boolean) {
  // fflate is small and only needed for these formats.
  return import('fflate').then(({ unzipSync }) => {
    const files = unzipSync(data, { filter: (f) => want(f.name) })
    return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, td.decode(v)]))
  })
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const byTag = (root: Document | Element, tag: string) => Array.from(root.getElementsByTagNameNS('*', tag))

function resolvePath(base: string, href: string) {
  const u = new URL(href, `https://x/${base}`)
  return { path: decodeURIComponent(u.pathname.slice(1)), hash: decodeURIComponent(u.hash.slice(1)) }
}

function xhtml(src: string) {
  let dom = new DOMParser().parseFromString(src, 'application/xhtml+xml')
  if (dom.getElementsByTagName('parsererror').length) dom = new DOMParser().parseFromString(src, 'text/html')
  return dom
}

function parseEpubSync(files: Record<string, string>): ParsedDoc {
  const container = files['META-INF/container.xml']
  if (!container) throw new Error('This EPUB is missing its container — it may be damaged or DRM-protected.')
  const opfPath = byTag(xml(container), 'rootfile')[0]?.getAttribute('full-path') ?? ''
  const opf = xml(files[opfPath] ?? '')
  const title = clean(byTag(opf, 'title')[0]?.textContent ?? '')
  const author = clean(byTag(opf, 'creator')[0]?.textContent ?? '') || undefined
  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const it of byTag(opf, 'item')) manifest.set(it.getAttribute('id') ?? '', { href: resolvePath(opfPath, it.getAttribute('href') ?? '').path, type: it.getAttribute('media-type') ?? '', props: it.getAttribute('properties') ?? '' })
  const spineEl = byTag(opf, 'spine')[0]
  const spine = byTag(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? '')?.href)
    .filter((h): h is string => !!h && files[h] !== undefined)

  const blocks: Block[] = []
  const anchors = new Map<string, number>()
  for (const path of spine) {
    const doc = xhtml(files[path])
    anchors.set(path, blocks.length)
    const body = doc.querySelector('body') ?? doc.documentElement
    if ((body.textContent ?? '').trim().length < 2) continue
    htmlBlocks(body, blocks, (id, b) => anchors.set(`${path}#${id}`, b))
  }

  // Table of contents: EPUB 3 nav document, else EPUB 2 NCX.
  const toc: TocEntry[] = []
  const add = (title: string, href: string, base: string, level: number) => {
    const { path, hash } = resolvePath(base, href)
    const block = anchors.get(hash ? `${path}#${hash}` : path) ?? anchors.get(path)
    if (block !== undefined && clean(title)) toc.push({ title: clean(title), block: Math.min(block, Math.max(0, blocks.length - 1)), level })
  }
  const navItem = [...manifest.values()].find((m) => m.props.split(' ').includes('nav'))
  if (navItem && files[navItem.href]) {
    const nav = xhtml(files[navItem.href])
    const tocNav = Array.from(nav.querySelectorAll('nav')).find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? '').includes('toc')) ?? nav.querySelector('nav')
    const walk = (ol: Element, level: number) => {
      for (const li of Array.from(ol.children)) {
        const a = li.querySelector(':scope > a, :scope > span > a')
        if (a?.getAttribute('href')) add(a.textContent ?? '', a.getAttribute('href')!, navItem.href, level)
        const sub = li.querySelector(':scope > ol')
        if (sub && level < 3) walk(sub, level + 1)
      }
    }
    const ol = tocNav?.querySelector('ol')
    if (ol) walk(ol, 0)
  }
  if (!toc.length) {
    const ncxId = spineEl?.getAttribute('toc')
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml')
    if (ncx && files[ncx.href]) {
      const walk = (parent: Element, level: number) => {
        for (const np of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
          const label = byTag(np, 'text')[0]?.textContent ?? ''
          const src = byTag(np, 'content')[0]?.getAttribute('src') ?? ''
          if (src) add(label, src, ncx.href, level)
          if (level < 3) walk(np, level + 1)
        }
      }
      const map = byTag(xml(files[ncx.href]), 'navMap')[0]
      if (map) walk(map, 0)
    }
  }
  toc.sort((a, b) => a.block - b.block)
  return { title, author, blocks, toc }
}

function parseEpub(data: Uint8Array): Promise<ParsedDoc> {
  return unzipText(data, (n) => /\.(xml|opf|ncx|xhtml|html?|htm)$/i.test(n)).then(parseEpubSync)
}

function parseDocxSync(files: Record<string, string>): ParsedDoc {
  const body = files['word/document.xml']
  if (!body) throw new Error('This doesn’t look like a Word document.')
  const doc = xml(body)
  const core = files['docProps/core.xml'] ? xml(files['docProps/core.xml']) : null
  const title = clean(core ? (byTag(core, 'title')[0]?.textContent ?? '') : '')
  const author = clean(core ? (byTag(core, 'creator')[0]?.textContent ?? '') : '') || undefined
  // Style ids → heading levels (custom styles often inherit from "Heading N").
  const styles = files['word/styles.xml'] ? xml(files['word/styles.xml']) : null
  const headingStyles = new Map<string, number>()
  if (styles)
    for (const s of byTag(styles, 'style')) {
      const id = s.getAttribute('w:styleId') ?? ''
      const name = byTag(s, 'name')[0]?.getAttribute('w:val') ?? ''
      const m = `${id} ${name}`.match(/heading\s?(\d)/i)
      if (m) headingStyles.set(id, +m[1])
      else if (/^title$/i.test(name) || /^title$/i.test(id)) headingStyles.set(id, 1)
      const outline = byTag(s, 'outlineLvl')[0]?.getAttribute('w:val')
      if (outline !== undefined && outline !== null && !headingStyles.has(id)) headingStyles.set(id, +outline + 1)
    }
  const blocks: Block[] = []
  const paraText = (p: Element) => {
    let t = ''
    const walk = (n: Element) => {
      for (const c of Array.from(n.children)) {
        const name = c.localName
        if (name === 'p' || name === 'delText' || name === 'instrText' || name === 'footnoteReference') continue
        if (name === 't') t += c.textContent ?? ''
        else if (name === 'tab' || name === 'br' || name === 'cr') t += ' '
        else if (name === 'noBreakHyphen') t += '-'
        else if (name === 'sym') t += ''
        else walk(c)
      }
    }
    walk(p)
    return clean(t)
  }
  for (const p of byTag(doc, 'p')) {
    const t = paraText(p)
    if (!t) continue
    const pPr = Array.from(p.children).find((c) => c.localName === 'pPr')
    const style = pPr ? byTag(pPr, 'pStyle')[0]?.getAttribute('w:val') ?? '' : ''
    const outline = pPr ? byTag(pPr, 'outlineLvl')[0]?.getAttribute('w:val') : undefined
    const lvl = headingStyles.get(style) ?? (/heading\s?(\d)/i.exec(style) ? +/heading\s?(\d)/i.exec(style)![1] : outline != null ? +outline + 1 : undefined)
    const isList = !!(pPr && byTag(pPr, 'numPr').length) || /list/i.test(style)
    if (lvl && t.length < 200) blocks.push({ k: 'h', t, lvl: Math.min(4, lvl) })
    else blocks.push({ k: isList ? 'li' : /quote/i.test(style) ? 'q' : 'p', t })
  }
  return { title, author, blocks, toc: [] }
}

function parseDocx(data: Uint8Array): Promise<ParsedDoc> {
  return unzipText(data, (n) => n === 'word/document.xml' || n === 'docProps/core.xml' || n === 'word/styles.xml').then(parseDocxSync)
}

/* ------------------------------------------------------------------ */
/*  PDF                                                                */
/* ------------------------------------------------------------------ */

interface Line {
  text: string
  x0: number
  x1: number
  y: number
  size: number
}

const SENT_END = /[.!?:…"”’)]$/

async function parsePdf(fileId: string, onProgress?: (p: number) => void): Promise<ParsedDoc> {
  const { loadPdf, getOcr } = await import('@/features/pdf/engine')
  const pdf = await loadPdf(fileId)
  const n = pdf.numPages
  const pages: Line[][] = []
  const scanned: number[] = []

  for (let i = 0; i < n; i++) {
    const page = await pdf.getPage(i + 1)
    const tc = await page.getTextContent()
    const items: { str: string; x: number; y: number; w: number; h: number; eol: boolean }[] = []
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const [a, b, , , e, f] = it.transform as number[]
      items.push({ str: it.str, x: e, y: f, w: it.width, h: it.height || Math.hypot(a, b), eol: !!it.hasEOL })
    }
    if (items.reduce((s, it) => s + it.str.trim().length, 0) < 20) {
      const ocr = await getOcr(fileId, i)
      if (ocr?.words.length) {
        for (const w of ocr.words) items.push({ str: w.str, x: w.x0, y: w.y0, w: w.x1 - w.x0, h: w.y1 - w.y0, eol: false })
      } else scanned.push(i)
    }
    pages.push(toLines(items))
    page.cleanup()
    onProgress?.((i + 1) / n)
  }

  stripRunningLines(pages)

  // Body font size: the size covering the most characters.
  const sizeChars = new Map<number, number>()
  for (const l of pages.flat()) sizeChars.set(Math.round(l.size), (sizeChars.get(Math.round(l.size)) ?? 0) + l.text.length)
  const body = [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10

  const blocks: Block[] = []
  let cur: Block | null = null
  const push = (b: Block) => {
    blocks.push(b)
    cur = b.k === 'h' ? null : b
  }
  const append = (b: Block, text: string) => {
    if (/\p{L}-$/u.test(b.t) && /^\p{Ll}/u.test(text)) b.t = b.t.slice(0, -1) + text
    else b.t = `${b.t} ${text}`
  }

  pages.forEach((lines, pi) => {
    if (!lines.length) return
    const gaps: number[] = []
    for (let i = 1; i < lines.length; i++) {
      const g = lines[i - 1].y - lines[i].y
      if (g > 0 && g < body * 3) gaps.push(g)
    }
    gaps.sort((a, b) => a - b)
    const lineGap = gaps[Math.floor(gaps.length / 2)] ?? body * 1.3
    const left = Math.min(...lines.map((l) => l.x0))
    const right = Math.max(...lines.map((l) => l.x1))

    lines.forEach((l, li) => {
      const prev = lines[li - 1]
      const ratio = l.size / body
      const isHead = ratio >= 1.15 && l.text.length < 120 && /\p{L}/u.test(l.text)
      if (isHead) {
        const lvl = ratio >= 1.6 ? 1 : ratio >= 1.35 ? 2 : 3
        const last = blocks[blocks.length - 1]
        if (last?.k === 'h' && last.lvl === lvl && last.page === pi && prev && prev.y - l.y < l.size * 1.8) last.t = clean(`${last.t} ${l.text}`)
        else push({ k: 'h', t: l.text, lvl, page: pi })
        return
      }
      const bullet = BULLET.test(l.text)
      const c = cur as Block | null
      let fresh = !c || bullet
      if (c && !fresh) {
        if (!prev) {
          // Continue a paragraph across a page break only when it clearly didn't end.
          fresh = SENT_END.test(c.t) || !/^[\p{Ll}\d(“"‘]/u.test(l.text)
        } else {
          const gap = prev.y - l.y
          const indented = l.x0 > left + body * 0.9 && l.x0 - prev.x0 > body * 0.9
          const prevShort = prev.x1 < right - body * 3
          fresh = gap > lineGap * 1.45 || gap < -body || (SENT_END.test(prev.text) && (indented || prevShort)) || Math.abs(l.size - prev.size) > 1.5
        }
      }
      if (fresh) push({ k: bullet ? 'li' : 'p', t: bullet ? l.text.replace(BULLET, '') : l.text, page: pi })
      else append(c!, l.text)
    })
  })
  for (const b of blocks) b.t = clean(b.t)

  // Outline → table of contents.
  const toc: TocEntry[] = []
  try {
    const outline = await pdf.getOutline()
    const firstBlockOfPage = (p: number) => {
      const i = blocks.findIndex((b) => (b.page ?? 0) >= p)
      return i < 0 ? blocks.length - 1 : i
    }
    const walk = async (items: typeof outline, level: number) => {
      for (const it of items ?? []) {
        let dest = it.dest
        if (typeof dest === 'string') dest = await pdf.getDestination(dest)
        if (Array.isArray(dest) && dest[0]) {
          const ref = dest[0]
          const p = typeof ref === 'number' ? ref : await pdf.getPageIndex(ref as never)
          toc.push({ title: clean(it.title), block: Math.max(0, firstBlockOfPage(p)), level })
        }
        if (it.items?.length && level < 2) await walk(it.items, level + 1)
      }
    }
    await walk(outline, 0)
  } catch {
    /* no outline */
  }

  const info = (await pdf.getMetadata().catch(() => null))?.info as { Title?: string; Author?: string } | undefined
  const title = clean(info?.Title ?? '')
  return { title: /^(untitled|microsoft word|document)/i.test(title) ? '' : title, author: clean(info?.Author ?? '') || undefined, blocks, toc, scanned, pages: n }
}

/** Groups positioned text items into lines (pdf.js usually emits them in reading order). */
function toLines(items: { str: string; x: number; y: number; w: number; h: number; eol: boolean }[]): Line[] {
  const lines: Line[] = []
  let cur: Line | null = null
  let lastEnd = 0
  for (const it of items) {
    if (!it.str) {
      if (it.eol && cur) cur = null
      continue
    }
    const h = Math.max(1, it.h)
    if (cur && Math.abs(it.y - cur.y) < h * 0.5 && it.x >= lastEnd - h) {
      const gap = it.x - lastEnd
      if (gap > h * 0.18 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += ' '
      cur.text += it.str
      cur.x1 = Math.max(cur.x1, it.x + it.w)
      cur.size = Math.max(cur.size, h)
    } else {
      cur = { text: it.str, x0: it.x, x1: it.x + it.w, y: it.y, size: h }
      lines.push(cur)
    }
    lastEnd = it.x + it.w
    if (it.eol) cur = null
  }
  return lines.map((l) => ({ ...l, text: clean(l.text) })).filter((l) => l.text)
}

/** Drops running headers/footers and page numbers that repeat across pages. */
function stripRunningLines(pages: Line[][]) {
  if (pages.length < 3) {
    for (const lines of pages) {
      while (lines.length && isPageNumber(lines[lines.length - 1].text)) lines.pop()
      while (lines.length && isPageNumber(lines[0].text)) lines.shift()
    }
    return
  }
  const key = (l: Line) => l.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ')
  const counts = new Map<string, number>()
  for (const lines of pages) {
    const edge = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map(key))
    for (const k of edge) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const repeated = (l: Line) => (counts.get(key(l)) ?? 0) >= Math.max(3, pages.length * 0.3)
  for (const lines of pages) {
    for (let pass = 0; pass < 2; pass++) {
      if (lines.length && (repeated(lines[0]) || isPageNumber(lines[0].text))) lines.shift()
      if (lines.length && (repeated(lines[lines.length - 1]) || isPageNumber(lines[lines.length - 1].text))) lines.pop()
    }
  }
}

const isPageNumber = (s: string) => /^(page\s*)?[-–—]?\s*([0-9]{1,4}|[ivxlc]{1,6})\s*[-–—]?(\s*(of|\/)\s*[0-9]{1,4})?$/i.test(s.trim())
