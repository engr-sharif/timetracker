import { useMemo, useState } from 'react'
import { Bookmark, BookmarkPlus, ListTree, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ws } from '@/store/workspace'
import type { Reading } from '@/store/types'
import { seek, usePlayer } from './player'
import { RB } from './Controls'
import type { TocEntry } from './text'

export type PanelKind = 'contents' | 'ai'

/** Right-hand drawer on the reading surface (not a modal, so reading keys keep working). */
export function Drawer({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col border-l border-[var(--rd-line)] bg-[var(--rd-bg)] shadow-2xl" data-testid={testId}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--rd-line)] px-3">
        <div className="text-[14px] font-semibold text-[var(--rd-fg)]">{title}</div>
        <RB label="Close" onClick={onClose} className="size-8">
          <X />
        </RB>
      </div>
      {children}
    </aside>
  )
}

export function ContentsPanel({ toc, reading, onClose }: { toc: TocEntry[]; reading: Reading; onClose: () => void }) {
  const pos = usePlayer((s) => s.pos)
  const tokens = usePlayer((s) => s.tokens)
  const blockStart = usePlayer((s) => s.blockStart)
  const [tab, setTab] = useState<'toc' | 'marks' | 'search'>(toc.length ? 'toc' : 'search')
  const [q, setQ] = useState('')

  const current = useMemo(() => {
    let c = -1
    toc.forEach((t, i) => blockStart[t.block] <= pos && (c = i))
    return c
  }, [toc, blockStart, pos])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const parts = needle.split(/\s+/)
    const out: number[] = []
    const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '')
    for (let i = 0; i < tokens.length && out.length < 200; i++) {
      if (!norm(tokens[i].w).includes(parts[0])) continue
      if (parts.every((p, k) => k === 0 || (tokens[i + k] && norm(tokens[i + k].w).includes(p)))) out.push(i)
    }
    return out
  }, [q, tokens])

  const marks = [...(reading.bookmarks ?? [])].sort((a, b) => a.at - b.at)
  const snippet = (i: number, n = 14) => tokens.slice(Math.max(0, i - 4), i + n).map((t) => t.w).join(' ')

  const addMark = () => {
    const label = snippet(usePlayer.getState().pos, 10)
    ws().update('readings', reading.id, (r) => ({ bookmarks: [...(r.bookmarks ?? []).filter((b) => b.at !== pos), { at: pos, label, createdAt: new Date().toISOString() }] }))
    setTab('marks')
  }

  const go = (i: number) => {
    seek(i)
    if (window.innerWidth < 700) onClose()
  }

  return (
    <Drawer title="Contents" onClose={onClose} testId="contents-panel">
      <div className="flex gap-1 border-b border-[var(--rd-line)] px-2 py-1.5">
        {(
          [
            ['toc', 'Chapters', ListTree],
            ['marks', 'Bookmarks', Bookmark],
            ['search', 'Search', Search],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] transition-colors', tab === k ? 'bg-[color-mix(in_oklch,var(--rd-fg)_9%,transparent)] text-[var(--rd-fg)]' : 'text-[var(--rd-muted)] hover:text-[var(--rd-fg)]')}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 text-[var(--rd-fg)]">
        {tab === 'toc' &&
          (toc.length ? (
            toc.map((t, i) => {
              const start = blockStart[t.block]
              const pct = Math.round((start / Math.max(1, tokens.length - 1)) * 100)
              return (
                <button
                  key={i}
                  onClick={() => go(start)}
                  className={cn('flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[color-mix(in_oklch,var(--rd-fg)_7%,transparent)]', i === current && 'bg-[var(--rd-mark)] font-medium')}
                  style={{ paddingLeft: 10 + t.level * 14 }}
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-[11px] text-[var(--rd-muted)] tabular-nums">{pct}%</span>
                </button>
              )
            })
          ) : (
            <p className="p-4 text-center text-[13px] text-[var(--rd-muted)]">This document has no chapters or headings.</p>
          ))}

        {tab === 'marks' && (
          <>
            <button onClick={addMark} className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--rd-line)] py-2 text-[13px] text-[var(--rd-muted)] hover:text-[var(--rd-fg)]">
              <BookmarkPlus className="size-4" /> Bookmark this spot <span className="text-[11px] opacity-70">(B)</span>
            </button>
            {marks.map((m) => (
              <div key={m.at} className="group flex items-start gap-1 rounded-lg hover:bg-[color-mix(in_oklch,var(--rd-fg)_7%,transparent)]">
                <button onClick={() => go(m.at)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                  <div className="line-clamp-2 text-[13px]">{m.label}</div>
                  <div className="text-[11px] text-[var(--rd-muted)]">{Math.round((m.at / Math.max(1, tokens.length - 1)) * 100)}%</div>
                </button>
                <RB label="Remove bookmark" className="mt-1 size-7 opacity-0 group-hover:opacity-100" onClick={() => ws().update('readings', reading.id, (r) => ({ bookmarks: (r.bookmarks ?? []).filter((b) => b.at !== m.at) }))}>
                  <Trash2 />
                </RB>
              </div>
            ))}
          </>
        )}

        {tab === 'search' && (
          <>
            <div className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-[var(--rd-line)] px-2.5">
              <Search className="size-4 text-[var(--rd-muted)]" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in document…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--rd-muted)]" />
            </div>
            {q.trim().length >= 2 && <div className="px-2 pb-1 text-[11px] text-[var(--rd-muted)]">{hits.length === 200 ? '200+' : hits.length} matches</div>}
            {hits.map((i) => (
              <button key={i} onClick={() => go(i)} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px] leading-snug hover:bg-[color-mix(in_oklch,var(--rd-fg)_7%,transparent)]">
                <span className="text-[var(--rd-muted)]">…</span>
                {snippet(i)}
                <span className="text-[var(--rd-muted)]">…</span>
              </button>
            ))}
          </>
        )}
      </div>
    </Drawer>
  )
}
