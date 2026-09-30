import type { ReactNode } from 'react'

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_|https?:\/\/[^\s<]+|@[\w.-]+(?: [A-Z][\w.-]+)?|#[A-Z]{1,3}-?\d[\w-]*)/g

/** Lightweight inline formatting for chat: `code`, **bold**, _italic_, links and @mentions. */
export function renderRich(text: string, knownNames: string[] = []): ReactNode[] {
  const out: ReactNode[] = []
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    let last = 0
    for (const m of line.matchAll(TOKEN)) {
      const [tok] = m
      const i = m.index ?? 0
      if (i > last) out.push(line.slice(last, i))
      const key = `${li}-${i}`
      if (tok.startsWith('`')) out.push(<code key={key} className="rounded-md border border-border bg-surface-2 px-1 py-0.5 font-mono text-[0.86em]">{tok.slice(1, -1)}</code>)
      else if (tok.startsWith('**')) out.push(<strong key={key} className="font-semibold">{tok.slice(2, -2)}</strong>)
      else if (tok.startsWith('_')) out.push(<em key={key}>{tok.slice(1, -1)}</em>)
      else if (tok.startsWith('http'))
        out.push(
          <a key={key} href={tok} target="_blank" rel="noreferrer" className="text-accent-strong underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
            {tok.replace(/^https?:\/\//, '').slice(0, 60)}
          </a>,
        )
      else if (tok.startsWith('@')) {
        const name = tok.slice(1)
        const known = knownNames.some((n) => n.toLowerCase().startsWith(name.toLowerCase()))
        out.push(
          <span key={key} className={known ? 'rounded-md bg-accent-soft px-1 font-medium text-accent-strong' : ''}>
            {tok}
          </span>,
        )
      } else out.push(<span key={key} className="font-mono text-[0.92em] text-accent-strong">{tok}</span>)
      last = i + tok.length
    }
    if (last < line.length) out.push(line.slice(last))
    if (li < lines.length - 1) out.push(<br key={`br-${li}`} />)
  })
  return out
}
