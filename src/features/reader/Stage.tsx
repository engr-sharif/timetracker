import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { FONTS, useReaderPrefs } from './prefs'
import { seek, usePlayer } from './player'
import { F, frameAt, splitOrp } from './text'

/* ------------------------------------------------------------------ */
/*  Focus: one word (or chunk) at a time, pivot letter fixed at centre */
/* ------------------------------------------------------------------ */

/** Average advance of a glyph in em, per font (used to keep long words on screen). */
const GLYPH_EM = { sans: 0.56, serif: 0.52, mono: 0.62, legible: 0.6 }

export function FocusStage({ className }: { className?: string }) {
  const pos = usePlayer((s) => s.pos)
  const tokens = usePlayer((s) => s.tokens)
  const frames = usePlayer((s) => s.frames)
  const playing = usePlayer((s) => s.playing)
  const { font, size, guides, ghosts, chunk, mode } = useReaderPrefs()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  if (!tokens.length) return null
  const fi = frameAt(frames, pos)
  const start = mode === 'focus' && chunk > 1 ? frames[fi] : pos
  const end = mode === 'focus' && chunk > 1 ? frames[fi + 1] : pos + 1
  const group = tokens.slice(start, end)
  const text = group.map((t) => t.w).join(' ')
  const [before, pivot, after] = splitOrp(text)
  const head = !!(group[0]?.f & F.HEAD)

  // Base size scales with the viewport; long words shrink so they never clip.
  const base = Math.min(Math.max(width * 0.075, 34), 84) * size
  const glyph = GLYPH_EM[font] * (head ? 1.06 : 1)
  const half = Math.max(Array.from(before).length + 0.5, Array.from(after).length + 0.5)
  const fit = (width / 2 - 12) / (half * glyph)
  const px = Math.max(14, Math.min(base, fit))

  const prev = ghosts && start > 0 ? tokens[start - 1].w : ''
  const next = ghosts && end < tokens.length ? tokens[end].w : ''

  return (
    <div ref={box} className={cn('relative w-full select-none', className)} style={{ fontFamily: FONTS[font].family }} aria-live={playing ? 'off' : 'polite'}>
      {guides && <Guide side="top" />}
      <div
        className="grid items-baseline leading-none whitespace-pre"
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', fontSize: px, fontWeight: head ? 640 : 480, letterSpacing: '-0.01em', paddingBlock: '0.42em' }}
        data-testid="rsvp-word"
      >
        <span className="flex justify-end overflow-visible">
          {prev && <span className="pr-[0.6em] text-[var(--rd-muted)] opacity-40">{prev}</span>}
          <span>{before}</span>
        </span>
        <span className="text-[var(--rd-pivot)]" data-testid="rsvp-pivot">
          {pivot}
        </span>
        <span className="flex justify-start overflow-visible">
          <span>{after}</span>
          {next && <span className="pl-[0.6em] text-[var(--rd-muted)] opacity-40">{next}</span>}
        </span>
      </div>
      {guides && <Guide side="bottom" />}
    </div>
  )
}

function Guide({ side }: { side: 'top' | 'bottom' }) {
  return (
    <div className={cn('relative mx-auto h-4 w-[min(78%,640px)]', side === 'top' ? 'border-b' : 'border-t')} style={{ borderColor: 'var(--rd-line)' }}>
      <span className={cn('absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full', side === 'top' ? 'top-1.5 bottom-0' : 'top-0 bottom-1.5')} style={{ background: 'var(--rd-pivot)', opacity: 0.75 }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Text window: paragraphs with the current word marked               */
/* ------------------------------------------------------------------ */

const BLOCK_CLS = {
  p: '',
  h: 'font-semibold tracking-tight',
  li: 'pl-5 relative before:absolute before:left-1 before:content-["•"] before:text-[var(--rd-muted)]',
  q: 'border-l-2 pl-4 italic border-[var(--rd-line)]',
  pre: 'font-mono text-[0.85em]',
}

const Para = memo(function Para({ b }: { b: number }) {
  const block = usePlayer((s) => s.blocks[b])
  const first = usePlayer((s) => s.blockStart[b])
  const tokens = usePlayer((s) => s.tokens)
  const last = usePlayer((s) => s.blockStart[b + 1])
  const words = tokens.slice(first, last)
  const H = block.k === 'h' ? (block.lvl ?? 2) : 0
  return (
    <p className={cn('mb-[0.9em]', BLOCK_CLS[block.k])} style={H ? { fontSize: `${[1.5, 1.32, 1.16, 1.06][H - 1]}em`, marginTop: '0.6em' } : undefined}>
      {words.map((t, i) => (
        <span key={i}>
          <span data-i={first + i} className="cursor-pointer rounded-[0.2em] px-[0.04em] transition-colors duration-100 hover:bg-[var(--rd-mark)]">
            {t.w}
          </span>{' '}
        </span>
      ))}
    </p>
  )
})

/**
 * Scrollable text around the cursor. Only a window of blocks is rendered (books
 * can have tens of thousands of paragraphs); it re-centres as the cursor moves.
 * The current word is marked imperatively so playback doesn't re-render text.
 */
export function TextWindow({ radius = 30, follow = true, className, fontScale = 1 }: { radius?: number; follow?: boolean; className?: string; fontScale?: number }) {
  const pos = usePlayer((s) => s.pos)
  const tokens = usePlayer((s) => s.tokens)
  const blocks = usePlayer((s) => s.blocks)
  const { font } = useReaderPrefs()
  const scroller = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLElement | null>(null)
  const cur = tokens[pos]?.b ?? 0
  const [anchor, setAnchor] = useState(cur)

  // Shift the window when the cursor leaves its inner half.
  useEffect(() => {
    if (Math.abs(cur - anchor) > radius / 2) setAnchor(cur)
  }, [cur, anchor, radius])

  const from = Math.max(0, anchor - radius)
  const to = Math.min(blocks.length, anchor + radius * 2)

  useEffect(() => {
    const root = scroller.current
    if (!root) return
    markRef.current?.removeAttribute('data-current')
    const el = root.querySelector<HTMLElement>(`[data-i="${pos}"]`)
    markRef.current = el
    if (!el) return
    el.setAttribute('data-current', '')
    if (!follow) return
    // Keep the current line around 40% down the panel (panel-scoped scroll; never the page).
    const r = el.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    const target = box.top + box.height * 0.4
    if (r.top < box.top + box.height * 0.18 || r.bottom > box.top + box.height * 0.72) root.scrollTo({ top: root.scrollTop + (r.top - target), behavior: 'smooth' })
  }, [pos, from, to, follow])

  return (
    <div
      ref={scroller}
      className={cn('overflow-y-auto overscroll-contain', className)}
      onClick={(e) => {
        const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i
        if (i !== undefined) seek(+i)
      }}
    >
      <div className="mx-auto max-w-[68ch] px-5 py-[30vh] leading-[1.7] [&_[data-current]]:bg-[var(--rd-mark)] [&_[data-current]]:shadow-[0_0_0_0.12em_var(--rd-mark)]" style={{ fontFamily: FONTS[font].family, fontSize: `${1.12 * fontScale}rem` }}>
        {from > 0 && (
          <button className="mb-6 text-[13px] text-[var(--rd-muted)] hover:underline" onClick={(e) => (e.stopPropagation(), setAnchor(Math.max(0, from - radius)))}>
            ↑ Earlier text
          </button>
        )}
        {Array.from({ length: to - from }, (_, k) => (
          <Para key={from + k} b={from + k} />
        ))}
        {to < blocks.length && (
          <button className="mt-2 text-[13px] text-[var(--rd-muted)] hover:underline" onClick={(e) => (e.stopPropagation(), setAnchor(Math.min(blocks.length - 1, to + radius)))}>
            ↓ Later text
          </button>
        )}
      </div>
    </div>
  )
}

/** The paragraph around the cursor, shown under the word while paused. */
export function PauseContext() {
  const pos = usePlayer((s) => s.pos)
  const tokens = usePlayer((s) => s.tokens)
  const blockStart = usePlayer((s) => s.blockStart)
  const { font } = useReaderPrefs()
  if (!tokens.length) return null
  const b = tokens[pos].b
  // Up to ~70 words around the cursor within its paragraph.
  const a = Math.max(blockStart[b], pos - 30)
  const z = Math.min(blockStart[b + 1], pos + 40)
  return (
    <p className="mx-auto max-w-[62ch] px-5 text-center text-[15px] leading-[1.75] text-[var(--rd-muted)]" style={{ fontFamily: FONTS[font].family }} data-testid="pause-context">
      {a > blockStart[b] && '… '}
      {tokens.slice(a, z).map((t, k) => {
        const i = a + k
        return (
          <span key={i}>
            <button onClick={() => seek(i)} className={cn('rounded-[0.2em] px-[0.05em] transition-colors hover:text-[var(--rd-fg)]', i === pos && 'bg-[var(--rd-mark)] text-[var(--rd-fg)]')}>
              {t.w}
            </button>{' '}
          </span>
        )
      })}
      {z < blockStart[b + 1] && '…'}
    </p>
  )
}
