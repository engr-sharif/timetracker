import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Small, safe Markdown renderer for AI answers: headings, emphasis, inline code,
 * links, lists, block quotes, fenced code and GFM tables. Builds React elements
 * directly — no HTML strings, so model output can't inject markup.
 */
export function Markdown({ text, className, renderInline }: { text: string; className?: string; renderInline?: (s: string, key: string) => ReactNode }) {
  return <div className={cn('md space-y-2.5 text-[13.5px] leading-relaxed', className)}>{blocks(text, renderInline)}</div>
}

function inline(s: string, key: string, extra?: (s: string, key: string) => ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\((?:https?:\/\/|#)[^)\s]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  const push = (t: string) => {
    if (!t) return
    if (extra) out.push(<Fragment key={`${key}-t${i++}`}>{extra(t, `${key}-x${i}`)}</Fragment>)
    else out.push(t)
  }
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${i++}`
    if (m[1]) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.88em]">{t.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k} className="font-semibold text-fg">{inline(t.slice(2, -2), k, extra)}</strong>)
    else if (m[3] || m[4]) out.push(<em key={k}>{inline(t.slice(1, -1), k, extra)}</em>)
    else if (m[5]) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!
      out.push(
        <a key={k} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer" className="text-accent-strong underline decoration-accent/40 underline-offset-2">
          {label}
        </a>,
      )
    }
    last = m.index + t.length
  }
  push(s.slice(last))
  return out
}

function blocks(text: string, extra?: (s: string, key: string) => ReactNode): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${n++}`
    if (!line.trim()) {
      i++
      continue
    }
    const fence = line.match(/^```(\w*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i++
      out.push(
        <pre key={key} className="overflow-x-auto rounded-lg bg-surface-3 p-3 font-mono text-[12px] leading-snug">
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const size = h[1].length <= 2 ? 'text-[15px]' : 'text-[14px]'
      out.push(
        <div key={key} className={cn('pt-1 font-semibold tracking-tight text-fg', size)}>
          {inline(h[2], key, extra)}
        </div>,
      )
      i++
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = row(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]))
      out.push(
        <div key={key} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2/70 text-left">
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="px-2.5 py-1.5 font-medium whitespace-nowrap">
                    {inline(c, `${key}h${j}`, extra)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-border">
                  {r.map((c, j) => (
                    <td key={j} className="px-2.5 py-1.5 align-top">
                      {inline(c, `${key}r${ri}c${j}`, extra)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')
        i++
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) item += ' ' + lines[i++].trim()
        items.push(item)
      }
      const L = ordered ? 'ol' : 'ul'
      out.push(
        <L key={key} className={cn('space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc', 'marker:text-subtle')}>
          {items.map((it, j) => (
            <li key={j}>{inline(it.replace(/^\[( |x)\]\s*/i, (_m, c) => (c.trim() ? '☑ ' : '☐ ')), `${key}i${j}`, extra)}</li>
          ))}
        </L>,
      )
      continue
    }
    if (line.startsWith('>')) {
      const q: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''))
      out.push(
        <blockquote key={key} className="border-l-2 border-accent/50 pl-3 text-muted">
          {inline(q.join(' '), key, extra)}
        </blockquote>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s+|>)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) para.push(lines[i++])
    out.push(<p key={key}>{inline(para.join(' '), key, extra)}</p>)
  }
  return out
}
