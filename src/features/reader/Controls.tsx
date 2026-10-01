import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Gauge, Minus, Pause, Play, Plus, Rewind, FastForward, SkipBack, SkipForward, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover } from '@/components/ui/popover'
import { Segmented, Switch } from '@/components/ui/misc'
import { FONTS, THEMES, useReaderPrefs, type Haptics, type ReaderFont, type ReaderTheme } from './prefs'
import { seek, stepFrames, timeBetween, toggle, usePlayer } from './player'
import { formatDuration, nextSentence, prevSentence, type TocEntry } from './text'
import { speechRate, speechSupported, voices } from './speech'

/** Button styled for the reader surface (which has its own colours). */
export const RB = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; big?: boolean }>(function RB(
  { label, active, big, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl text-[var(--rd-muted)] transition-colors hover:bg-[color-mix(in_oklch,var(--rd-fg)_8%,transparent)] hover:text-[var(--rd-fg)] disabled:opacity-40',
        big ? 'size-12 [&_svg]:size-5' : 'size-9 [&_svg]:size-[18px]',
        active && 'bg-[color-mix(in_oklch,var(--rd-fg)_10%,transparent)] text-[var(--rd-fg)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

export function Transport() {
  const playing = usePlayer((s) => s.playing)
  const jump = (fn: (t: ReturnType<typeof usePlayer.getState>['tokens'], p: number) => number) => {
    const s = usePlayer.getState()
    seek(fn(s.tokens, s.pos))
  }
  return (
    <div className="flex items-center gap-0.5">
      <RB label="Previous sentence (Shift ←)" onClick={() => jump(prevSentence)} className="max-sm:hidden">
        <SkipBack />
      </RB>
      <RB label="Back a word (←)" onClick={() => stepFrames(-1)}>
        <Rewind />
      </RB>
      <button
        aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        onClick={() => toggle()}
        className="mx-1 grid size-12 place-items-center rounded-full bg-[var(--rd-fg)] text-[var(--rd-bg)] shadow-lg transition-transform hover:scale-105 active:scale-95"
        data-testid="play"
      >
        {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 translate-x-[1px]" fill="currentColor" />}
      </button>
      <RB label="Forward a word (→)" onClick={() => stepFrames(1)}>
        <FastForward />
      </RB>
      <RB label="Next sentence (Shift →)" onClick={() => jump(nextSentence)} className="max-sm:hidden">
        <SkipForward />
      </RB>
    </div>
  )
}

const PRESETS = [200, 250, 300, 350, 400, 500, 600, 750, 900]

export function SpeedControl() {
  const { wpm, set, mode } = useReaderPrefs()
  return (
    <div className="flex items-center rounded-xl border border-[var(--rd-line)]">
      <RB label="Slower (↓)" onClick={() => set({ wpm: wpm - 25 })} className="size-8 rounded-r-none">
        <Minus />
      </RB>
      <Popover
        placement="top"
        trigger={
          <button className="h-8 min-w-[76px] px-1 text-center font-mono text-[13px] text-[var(--rd-fg)] tabular-nums" data-testid="wpm" title="Reading speed">
            {wpm} <span className="text-[10px] text-[var(--rd-muted)]">wpm</span>
          </button>
        }
      >
        <div className="w-64 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold">Speed</span>
            <span className="font-mono text-[13px] tabular-nums">{wpm} wpm</span>
          </div>
          <input type="range" min={100} max={1200} step={10} value={wpm} onChange={(e) => set({ wpm: +e.target.value })} className="w-full accent-[var(--accent)]" aria-label="Words per minute" />
          <div className="mt-2 grid grid-cols-3 gap-1">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => set({ wpm: p })} className={cn('h-7 rounded-md text-[12px] tabular-nums transition-colors', p === wpm ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg')}>
                {p}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11.5px] leading-snug text-subtle">
            {mode === 'listen'
              ? `The voice speaks at about ${Math.round(speechRate(wpm) * 175)} wpm — voices top out around 3× normal speed.`
              : 'Most people read 200–300 wpm. Step up 25 at a time; ↑ ↓ change it while you read.'}
          </p>
        </div>
      </Popover>
      <RB label="Faster (↑)" onClick={() => set({ wpm: wpm + 25 })} className="size-8 rounded-l-none">
        <Plus />
      </RB>
    </div>
  )
}

/** Progress bar with chapter ticks; drag or click to jump. */
export function Scrubber({ toc }: { toc: TocEntry[] }) {
  const pos = usePlayer((s) => s.pos)
  const total = usePlayer((s) => s.tokens.length)
  const blockStart = usePlayer((s) => s.blockStart)
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)
  if (!total) return null
  const frac = total > 1 ? pos / (total - 1) : 0
  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width))
  }
  const chapterAt = (p: number) => {
    let c: TocEntry | undefined
    for (const t of toc) if (blockStart[t.block] <= p) c = t
    return c
  }
  const hoverPos = hover !== null ? Math.round(hover * (total - 1)) : null
  return (
    <div className="relative w-full">
      <div
        ref={track}
        className="group relative flex h-6 cursor-pointer touch-none items-center"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(at(e.clientX) * (total - 1))
        }}
        onPointerMove={(e) => {
          setHover(at(e.clientX))
          if (dragging.current) seek(at(e.clientX) * (total - 1))
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={pos}
        data-testid="scrubber"
      >
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--rd-line)] transition-[height] group-hover:h-1.5">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--rd-pivot)]" style={{ width: `${frac * 100}%` }} />
        </div>
        {toc.map((t, i) => {
          const p = blockStart[t.block] / Math.max(1, total - 1)
          return p > 0.002 && p < 0.998 && t.level === 0 ? <span key={i} className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-[var(--rd-muted)] opacity-50" style={{ left: `${p * 100}%` }} /> : null
        })}
        <span className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--rd-pivot)] opacity-0 shadow transition-opacity group-hover:opacity-100" style={{ left: `${frac * 100}%` }} />
      </div>
      {hoverPos !== null && (
        <div className="pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-lg border border-[var(--rd-line)] bg-[var(--rd-bg)] px-2 py-1 text-[11px] whitespace-nowrap text-[var(--rd-fg)] shadow-lg" style={{ left: `${Math.min(92, Math.max(8, hover! * 100))}%` }}>
          {Math.round(hover! * 100)}%{chapterAt(hoverPos) ? ` · ${chapterAt(hoverPos)!.title.slice(0, 48)}` : ''}
        </div>
      )}
    </div>
  )
}

export function ProgressText({ toc }: { toc: TocEntry[] }) {
  const pos = usePlayer((s) => s.pos)
  const total = usePlayer((s) => s.tokens.length)
  const blockStart = usePlayer((s) => s.blockStart)
  useReaderPrefs((s) => s.wpm)
  if (!total) return null
  let chapter: TocEntry | undefined
  let nextCh: TocEntry | undefined
  for (const t of toc) {
    if (blockStart[t.block] <= pos) chapter = t
    else if (!nextCh && t.level <= (chapter?.level ?? 0)) nextCh = t
  }
  const left = timeBetween(pos, total)
  const chLeft = nextCh ? timeBetween(pos, blockStart[nextCh.block]) : null
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-[11.5px] text-[var(--rd-muted)] tabular-nums" data-testid="progress-text">
      <span className="min-w-0 truncate">
        {Math.floor((pos / Math.max(1, total - 1)) * 100)}% · {(pos + 1).toLocaleString()} / {total.toLocaleString()} words
        {chapter && <span className="max-md:hidden"> · {chapter.title}</span>}
      </span>
      <span className="shrink-0">
        {chLeft !== null && <span className="max-sm:hidden">{formatDuration(chLeft)} left in chapter · </span>}
        {formatDuration(left)} left
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Display & pacing settings                                          */
/* ------------------------------------------------------------------ */

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[12.5px] text-fg">{label}</div>
        {hint && <div className="text-[11px] leading-snug text-subtle">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function DisplaySettings() {
  const p = useReaderPrefs()
  const list = voices()
  return (
    <Popover
      placement="top-end"
      trigger={
        <RB label="Display & pacing">
          <Type />
        </RB>
      }
    >
      <div className="max-h-[70vh] w-[300px] overflow-y-auto p-3" data-testid="display-settings">
        <div className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Theme</div>
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          {(Object.keys(THEMES) as ReaderTheme[]).map((t) => (
            <button
              key={t}
              title={THEMES[t].label}
              aria-label={`${THEMES[t].label} theme`}
              onClick={() => p.set({ theme: t })}
              className={cn('grid h-10 place-items-center rounded-lg border text-[15px] font-semibold transition-shadow', p.theme === t ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-border')}
              style={{ background: THEMES[t].vars['--rd-bg'], color: THEMES[t].vars['--rd-fg'] }}
            >
              A<span style={{ color: THEMES[t].vars['--rd-pivot'] }}>a</span>
            </button>
          ))}
        </div>
        <div className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Font</div>
        <Segmented<ReaderFont> value={p.font} onChange={(font) => p.set({ font })} size="xs" className="mb-3 w-full [&>button]:flex-1" options={(Object.keys(FONTS) as ReaderFont[]).map((f) => ({ value: f, label: <span style={{ fontFamily: FONTS[f].family }}>{FONTS[f].label}</span> }))} />
        <Row label="Text size">
          <div className="flex items-center gap-1">
            <button className="grid size-7 place-items-center rounded-md bg-surface-2 text-[12px]" onClick={() => p.set({ size: p.size - 0.1 })} aria-label="Smaller text">
              A
            </button>
            <span className="w-10 text-center font-mono text-[12px] tabular-nums">{Math.round(p.size * 100)}%</span>
            <button className="grid size-7 place-items-center rounded-md bg-surface-2 text-[15px]" onClick={() => p.set({ size: p.size + 0.1 })} aria-label="Larger text">
              A
            </button>
          </div>
        </Row>
        <Row label="Words per flash" hint="Chunks of 2–3 words, never across a sentence">
          <Segmented value={String(p.chunk) as '1' | '2' | '3'} onChange={(v) => p.set({ chunk: +v as 1 | 2 | 3 })} size="xs" options={['1', '2', '3'].map((v) => ({ value: v as '1' | '2' | '3', label: v }))} />
        </Row>
        <Row label="Focus guides">
          <Switch checked={p.guides} onChange={(guides) => p.set({ guides })} label="Focus guides" />
        </Row>
        <Row label="Neighbour words" hint="Faint previous and next word">
          <Switch checked={p.ghosts} onChange={(ghosts) => p.set({ ghosts })} label="Neighbour words" />
        </Row>

        <div className="mt-3 mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">
          <Gauge className="size-3.5" /> Pacing
        </div>
        <Row label="Smart pacing" hint="Rare and long words, numbers and punctuation get more time; common words less">
          <Switch checked={p.smart} onChange={(smart) => p.set({ smart })} label="Smart pacing" />
        </Row>
        {p.smart && (
          <>
            <Row label="Sentence pause">
              <Slider value={p.sentence} min={1} max={3.5} step={0.1} onChange={(sentence) => p.set({ sentence })} suffix="×" />
            </Row>
            <Row label="Paragraph pause">
              <Slider value={p.paragraph} min={1} max={3.5} step={0.1} onChange={(paragraph) => p.set({ paragraph })} suffix="×" />
            </Row>
          </>
        )}
        <Row label="Speed training" hint={p.train ? `+10 wpm per minute of reading, up to ${p.trainTarget}` : 'Gradually raise your speed while you read'}>
          <Switch checked={p.train} onChange={(train) => p.set({ train, trainTarget: Math.max(p.trainTarget, p.wpm + 50) })} label="Speed training" />
        </Row>
        {p.train && (
          <Row label="Target">
            <div className="flex items-center gap-2">
              <input type="range" min={200} max={1000} step={25} value={p.trainTarget} onChange={(e) => p.set({ trainTarget: +e.target.value })} className="w-24 accent-[var(--accent)]" aria-label="Training target" />
              <span className="w-8 text-right font-mono text-[11.5px] tabular-nums">{p.trainTarget}</span>
            </div>
          </Row>
        )}
        <Row label="Ease in" hint="Start slower for a few words after a pause">
          <Switch checked={p.ramp} onChange={(ramp) => p.set({ ramp })} label="Ease in" />
        </Row>
        <Row label="Rewind on resume" hint="Back to the sentence start when you press play">
          <Switch checked={p.rewind} onChange={(rewind) => p.set({ rewind })} label="Rewind on resume" />
        </Row>
        {'vibrate' in navigator && (
          <Row label="Haptics">
            <Segmented<Haptics> value={p.haptics} onChange={(haptics) => p.set({ haptics })} size="xs" options={[{ value: 'off', label: 'Off' }, { value: 'sentences', label: 'Sentences' }, { value: 'words', label: 'Words' }]} />
          </Row>
        )}
        <Row label="Keep controls visible" hint="Otherwise they fade while reading">
          <Switch checked={p.pinControls} onChange={(pinControls) => p.set({ pinControls })} label="Keep controls visible" />
        </Row>
        {speechSupported() && list.length > 0 && (
          <Row label="Voice">
            <select value={p.voice} onChange={(e) => p.set({ voice: e.target.value })} className="h-7 max-w-[150px] rounded-md border border-border bg-surface-2 px-1.5 text-[12px]">
              <option value="">Default</option>
              {list.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </Row>
        )}
      </div>
    </Popover>
  )
}

function Slider({ value, min, max, step, onChange, suffix }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-24 accent-[var(--accent)]" />
      <span className="w-8 text-right font-mono text-[11.5px] tabular-nums">
        {value.toFixed(1)}
        {suffix}
      </span>
    </div>
  )
}

/** Segmented switch drawn in the reader's own colours (works on every reading theme). */
export function ModeSwitch<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title: string }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-[10px] border border-[var(--rd-line)] p-0.5', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors [&_svg]:size-3.5',
            value === o.value ? 'bg-[color-mix(in_oklch,var(--rd-fg)_12%,transparent)] text-[var(--rd-fg)]' : 'text-[var(--rd-muted)] hover:text-[var(--rd-fg)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
