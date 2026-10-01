import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowLeft, BookmarkPlus, Ear, Focus, ListTree, Maximize, Minimize, PartyPopper, ScanText, ScrollText, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isTypingTarget } from '@/lib/hotkeys'
import { useRecord, ws } from '@/store/workspace'
import { Spinner } from '@/components/ui/button'
import { loadDoc } from './importers'
import { THEMES, readerPrefs, useReaderPrefs, type ReaderMode } from './prefs'
import { loadStream, pause, seek, setPlayerHooks, stepFrames, toggle, unloadPlayer, usePlayer } from './player'
import { ensureReading, logReading, readingId } from './readings'
import { speechSupported } from './speech'
import { FocusStage, PauseContext, TextWindow } from './Stage'
import { DisplaySettings, ModeSwitch, ProgressText, RB, Scrubber, SpeedControl, Transport } from './Controls'
import { ContentsPanel, type PanelKind } from './Panels'
import { AiPanel } from './ReaderAi'
import { formatDuration, nextSentence, prevSentence, type ParsedDoc } from './text'

const SHORTCUTS = [
  ['Space', 'Play / pause'],
  ['← →', 'Word'],
  ['⇧ ← →', 'Sentence'],
  ['[ ]', 'Paragraph'],
  ['↑ ↓', 'Speed ±25'],
  ['+ −', 'Text size'],
  ['M', 'Focus / Flow / Listen'],
  ['T', 'Contents & search'],
  ['A', 'Reading assistant'],
  ['B', 'Bookmark'],
  ['F', 'Full screen'],
  ['?', 'This help'],
]

export function Reader({ fileId }: { fileId: string }) {
  const navigate = useNavigate()
  const file = useRecord('files', fileId)
  const id = readingId(fileId)
  const reading = useRecord('readings', id)
  const prefs = useReaderPrefs()
  const playing = usePlayer((s) => s.playing)
  const done = usePlayer((s) => s.done)
  const [doc, setDoc] = useState<ParsedDoc | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState<PanelKind | null>(null)
  const [chrome, setChrome] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [hud, setHud] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const [ocr, setOcr] = useState<{ done: number; total: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // Create the reading on first open, then parse (cached per device).
  useEffect(() => {
    if (!file) return
    ensureReading(file)
    let alive = true
    setError('')
    loadDoc(file.id, file.name, file.type, { onProgress: setProgress })
      .then((d) => {
        if (!alive) return
        open(d)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not open this document'))
    return () => {
      alive = false
      unloadPlayer()
    }
  }, [file?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (d: ParsedDoc) => {
    setDoc(d)
    const r = ws().doc.tables.readings[id]
    loadStream(d.blocks, r?.position ?? 0)
    const words = usePlayer.getState().tokens.length
    if (r) {
      const named = r.title === file?.name.replace(/\.[a-z0-9]{1,8}$/i, '').replace(/_+/g, ' ').trim()
      ws().update('readings', id, { words, ...(named && d.title ? { title: d.title } : {}), ...(d.author && !r.author ? { author: d.author } : {}) })
    }
    root.current?.focus({ preventScroll: true })
  }

  // Persist position (debounced), stats and completion.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    setPlayerHooks({
      onPosition: (pos) => {
        clearTimeout(t)
        t = setTimeout(() => ws().doc.tables.readings[id] && ws().update('readings', id, { position: pos }), 500)
      },
      onStats: (words, seconds) => ws().doc.tables.readings[id] && logReading(id, words, seconds),
      onFinish: () => ws().doc.tables.readings[id] && ws().update('readings', id, { status: 'finished', finishedAt: new Date().toISOString(), position: 0 }),
    })
    const save = setInterval(() => {
      const s = usePlayer.getState()
      if (s.playing && ws().doc.tables.readings[id]) ws().update('readings', id, { position: s.pos })
    }, 10_000)
    return () => {
      clearTimeout(t)
      clearInterval(save)
      pause()
      setPlayerHooks({})
    }
  }, [id])

  // Pause when the tab is hidden; keep the screen awake while reading.
  useEffect(() => {
    const onVis = () => document.hidden && pause()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  useEffect(() => {
    if (!playing || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [playing])

  // Controls fade while reading and come back on any movement.
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wake = () => {
    setChrome(true)
    clearTimeout(idle.current)
    if (usePlayer.getState().playing && !readerPrefs().pinControls && readerPrefs().mode !== 'flow') idle.current = setTimeout(() => setChrome(false), 2200)
  }
  useEffect(() => {
    wake()
    return () => clearTimeout(idle.current)
  }, [playing, prefs.pinControls, prefs.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Speed HUD.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    return useReaderPrefs.subscribe((p, prev) => {
      if (p.wpm === prev.wpm) return
      setHud(`${p.wpm} wpm`)
      clearTimeout(t)
      t = setTimeout(() => setHud(null), 900)
    })
  }, [])

  // The optional legible font is only fetched when chosen.
  useEffect(() => {
    if (prefs.font !== 'legible' || document.getElementById('font-legible')) return
    const l = Object.assign(document.createElement('link'), { id: 'font-legible', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap' })
    document.head.appendChild(l)
  }, [prefs.font])

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === root.current)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const toggleFullscreen = () => (document.fullscreenElement ? void document.exitFullscreen() : void root.current?.requestFullscreen?.().catch(() => {}))

  const bookmark = () => {
    const s = usePlayer.getState()
    if (!s.tokens.length) return
    const label = s.tokens.slice(Math.max(0, s.pos - 4), s.pos + 10).map((t) => t.w).join(' ')
    ws().update('readings', id, (r) => ({ bookmarks: [...(r.bookmarks ?? []).filter((b) => b.at !== s.pos), { at: s.pos, label, createdAt: new Date().toISOString() }] }))
    toast.success('Bookmarked', { description: label })
  }

  const setMode = (mode: ReaderMode) => {
    if (mode === 'listen' && !speechSupported()) return toast.error('Speech isn’t available in this browser')
    prefs.set({ mode })
  }

  // Keyboard. Captured at the window so the app's single-key shortcuts don't fire while reading.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      if (e.key === 'Escape' && panel && root.current?.contains(e.target as Node) && isTypingTarget(e.target)) {
        e.preventDefault()
        return setPanel(null), root.current.focus({ preventScroll: true })
      }
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) return
      const k = e.key
      const p = readerPrefs()
      const s = usePlayer.getState()
      const handled = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (k === ' ' || k === 'k') return handled(), toggle()
      if (k === 'ArrowRight') return handled(), e.shiftKey ? seek(nextSentence(s.tokens, s.pos)) : stepFrames(1)
      if (k === 'ArrowLeft') return handled(), e.shiftKey ? seek(prevSentence(s.tokens, s.pos)) : stepFrames(-1)
      if (k === 'ArrowUp') return handled(), p.set({ wpm: p.wpm + 25 })
      if (k === 'ArrowDown') return handled(), p.set({ wpm: p.wpm - 25 })
      if (k === ']' || k === '[') {
        handled()
        const b = s.tokens[s.pos]?.b ?? 0
        const target = k === ']' ? s.blockStart[Math.min(s.blocks.length - 1, b + 1)] : s.pos > s.blockStart[b] + 2 ? s.blockStart[b] : s.blockStart[Math.max(0, b - 1)]
        return seek(target)
      }
      if (k === 'Home') return handled(), seek(0)
      if (k === 'f') return handled(), toggleFullscreen()
      if (k === 'm') return handled(), setMode(p.mode === 'focus' ? 'flow' : p.mode === 'flow' && speechSupported() ? 'listen' : 'focus')
      if (k === 't' || k === 'c') return handled(), setPanel((x) => (x === 'contents' ? null : 'contents'))
      if (k === 'a') return handled(), setPanel((x) => (x === 'ai' ? null : 'ai'))
      if (k === 'b') return handled(), bookmark()
      if (k === '+' || k === '=') return handled(), p.set({ size: p.size + 0.1 })
      if (k === '-' || k === '_') return handled(), p.set({ size: p.size - 0.1 })
      if (k === '?') return handled(), setHelp((h) => !h)
      if (k === 'Escape') {
        if (help) return handled(), setHelp(false)
        if (panel) return handled(), setPanel(null)
        if (s.playing) return handled(), pause()
        return
      }
      // Swallow other single letters so global shortcuts (new task, log time…) don't pop up mid-read.
      if (/^[a-z/]$/i.test(k)) e.stopPropagation()
    }
    // Space on a focused button would also "click" it on keyup — a second toggle.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTypingTarget(e.target) && root.current?.contains(e.target as Node)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [panel, help]) // eslint-disable-line react-hooks/exhaustive-deps

  // Touch & mouse on the stage: tap toggles, drag sideways scrubs, drag up/down changes speed.
  const gesture = useRef<{ x: number; y: number; t: number; pos: number; wpm: number; axis: null | 'x' | 'y' } | null>(null)
  const onStageDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), pos: usePlayer.getState().pos, wpm: readerPrefs().wpm, axis: null }
  }
  const onStageMove = (e: React.PointerEvent) => {
    wake()
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.axis && Math.hypot(dx, dy) > 14) {
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      if (g.axis === 'x') pause()
    }
    if (g.axis === 'x') seek(g.pos - Math.round(dx / 16))
    if (g.axis === 'y') readerPrefs().set({ wpm: Math.round((g.wpm - dy * 1.5) / 5) * 5 })
  }
  const onStageUp = () => {
    const g = gesture.current
    gesture.current = null
    if (g && !g.axis && performance.now() - g.t < 500) toggle()
  }

  const theme = THEMES[prefs.theme].vars
  const toc = doc?.toc ?? []
  const stats = useMemo(() => {
    const log = Object.values(reading?.log ?? {})
    const words = log.reduce((a, v) => a + v.words, 0)
    const seconds = log.reduce((a, v) => a + v.seconds, 0)
    return { words, seconds, wpm: seconds > 20 ? Math.round(words / (seconds / 60)) : 0 }
  }, [reading?.log])

  const runOcr = async () => {
    if (!doc?.scanned?.length || !file) return
    const { ocrPage } = await import('@/features/pdf/engine')
    const pages = doc.scanned
    setOcr({ done: 0, total: pages.length })
    try {
      for (let i = 0; i < pages.length; i++) {
        await ocrPage(file.id, pages[i])
        setOcr({ done: i + 1, total: pages.length })
      }
      const frac = usePlayer.getState().pos / Math.max(1, usePlayer.getState().tokens.length)
      const d = await loadDoc(file.id, file.name, file.type, { force: true })
      open(d)
      seek(Math.round(frac * usePlayer.getState().tokens.length))
      toast.success('Text recognized', { description: `${pages.length} page${pages.length === 1 ? '' : 's'} are now readable.` })
    } catch (e) {
      toast.error('OCR failed', { description: e instanceof Error ? e.message : undefined })
    }
    setOcr(null)
  }

  if (!file)
    return (
      <div className="grid h-full place-items-center text-sm text-subtle">
        <div className="text-center">
          This document isn’t in your Files anymore.
          <div className="mt-3">
            <Link to="/read" className="text-accent-strong hover:underline">
              Back to the library
            </Link>
          </div>
        </div>
      </div>
    )

  const showChrome = chrome || !playing || prefs.pinControls || prefs.mode === 'flow'

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-own-keys
      onPointerMove={wake}
      className={cn('relative flex h-full flex-col overflow-hidden outline-none', !showChrome && 'cursor-none')}
      style={{ ...theme, background: 'var(--rd-bg)', color: 'var(--rd-fg)' } as React.CSSProperties}
      data-testid="reader"
    >
      <header className={cn('z-20 flex h-13 shrink-0 items-center gap-1.5 px-2 transition-opacity duration-500 sm:px-3', showChrome ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <RB label="Library" onClick={() => navigate('/read')}>
          <ArrowLeft />
        </RB>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-tight">{reading?.title ?? file.name}</div>
          {reading?.author && <div className="truncate text-[11px] text-[var(--rd-muted)]">{reading.author}</div>}
        </div>
        <ModeSwitch<ReaderMode>
          value={prefs.mode}
          onChange={setMode}
          options={[
            { value: 'focus', title: 'Focus: one word at a time', label: <><Focus /> <span className="max-sm:hidden">Focus</span></> },
            { value: 'flow', title: 'Flow: full text with a moving highlight', label: <><ScrollText /> <span className="max-sm:hidden">Flow</span></> },
            ...(speechSupported() ? [{ value: 'listen' as const, title: 'Listen: read aloud, words follow the voice', label: <><Ear /> <span className="max-sm:hidden">Listen</span></> }] : []),
          ]}
        />
        <div className="flex items-center sm:ml-2">
          <RB label="Contents, bookmarks & search (T)" active={panel === 'contents'} onClick={() => setPanel(panel === 'contents' ? null : 'contents')}>
            <ListTree />
          </RB>
          <RB label="Reading assistant (A)" active={panel === 'ai'} onClick={() => setPanel(panel === 'ai' ? null : 'ai')}>
            <Sparkles />
          </RB>
          <RB label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'} onClick={toggleFullscreen} className="max-sm:hidden">
            {fullscreen ? <Minimize /> : <Maximize />}
          </RB>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {error ? (
          <div className="grid h-full place-items-center p-6 text-center text-[14px] text-[var(--rd-muted)]">
            <div className="max-w-sm">
              {error}
              <div className="mt-3">
                <Link to="/read" className="font-medium text-[var(--rd-pivot)] hover:underline">
                  Back to the library
                </Link>
              </div>
            </div>
          </div>
        ) : !doc ? (
          <div className="grid h-full place-items-center">
            <div className="w-56 text-center text-[13px] text-[var(--rd-muted)]">
              <Spinner className="mx-auto mb-3 size-5" />
              Preparing text{progress > 0 && progress < 1 ? ` · ${Math.round(progress * 100)}%` : '…'}
              {progress > 0 && progress < 1 && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--rd-line)]">
                  <div className="h-full bg-[var(--rd-pivot)] transition-[width]" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        ) : !doc.blocks.length ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-sm text-[14px] text-[var(--rd-muted)]">
              <ScanText className="mx-auto mb-3 size-6 text-[var(--rd-pivot)]" />
              {doc.scanned?.length ? 'This PDF is scanned images with no text layer yet.' : 'No readable text was found in this document.'}
              {!!doc.scanned?.length && (
                <button onClick={() => void runOcr()} disabled={!!ocr} className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-[var(--rd-fg)] px-4 py-2 text-[13px] font-medium text-[var(--rd-bg)] disabled:opacity-60">
                  {ocr ? <Spinner className="size-4" /> : <ScanText className="size-4" />}
                  {ocr ? `Recognizing page ${ocr.done + 1} of ${ocr.total}…` : `Recognize text on ${doc.scanned.length} page${doc.scanned.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        ) : prefs.mode === 'flow' ? (
          <TextWindow className="absolute inset-0" fontScale={prefs.size} />
        ) : (
          <div className="absolute inset-0 touch-none" onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={() => (gesture.current = null)} data-testid="stage">
            <div className="absolute inset-x-0 top-[40%] -translate-y-1/2 px-2">
              <FocusStage />
            </div>
            <AnimatePresence>
              {!playing && !done && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-x-0 top-[58%] bottom-2 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
                  <PauseContext />
                </motion.div>
              )}
            </AnimatePresence>
            {!playing && !done && usePlayer.getState().pos === 0 && !reading?.lastReadAt && (
              <div className="pointer-events-none absolute inset-x-0 top-[22%] text-center text-[12.5px] text-[var(--rd-muted)]">{matchMedia('(pointer: coarse)').matches ? 'Tap to start · drag up/down for speed · drag sideways to scrub' : 'Press Space to start · ↑↓ speed · ←→ words · ? for all keys'}</div>
            )}
          </div>
        )}

        {doc && !!doc.scanned?.length && !!doc.blocks.length && (
          <div className="absolute inset-x-0 top-1 z-10 mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-full border border-[var(--rd-line)] bg-[var(--rd-bg)] px-3 py-1 text-[12px] text-[var(--rd-muted)] shadow">
            {doc.scanned.length} scanned page{doc.scanned.length === 1 ? '' : 's'} skipped
            <button onClick={() => void runOcr()} disabled={!!ocr} className="font-medium text-[var(--rd-pivot)] hover:underline">
              {ocr ? `OCR ${ocr.done}/${ocr.total}…` : 'Recognize text'}
            </button>
          </div>
        )}

        <AnimatePresence>
          {hud && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute top-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--rd-fg)] px-3 py-1 font-mono text-[13px] text-[var(--rd-bg)] tabular-nums" data-testid="wpm-hud">
              {hud}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center bg-[color-mix(in_oklch,var(--rd-bg)_88%,transparent)] p-6 backdrop-blur-sm" data-testid="finished">
              <motion.div initial={{ y: 12, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-sm rounded-3xl border border-[var(--rd-line)] bg-[var(--rd-bg)] p-6 text-center shadow-2xl">
                <PartyPopper className="mx-auto mb-3 size-7 text-[var(--rd-pivot)]" />
                <div className="text-[18px] font-semibold">Finished</div>
                <div className="mt-1 truncate text-[13px] text-[var(--rd-muted)]">{reading?.title}</div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  {[
                    [usePlayer.getState().tokens.length.toLocaleString(), 'words'],
                    [stats.seconds ? formatDuration(stats.seconds * 1000) : '—', 'reading'],
                    [stats.wpm ? String(stats.wpm) : '—', 'avg wpm'],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-xl bg-[color-mix(in_oklch,var(--rd-fg)_6%,transparent)] py-2.5">
                      <div className="text-[16px] font-semibold tabular-nums">{v}</div>
                      <div className="text-[11px] text-[var(--rd-muted)]">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-col gap-2">
                  <button onClick={() => setPanel('ai')} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--rd-fg)] text-[13px] font-medium text-[var(--rd-bg)]">
                    <Sparkles className="size-4" /> Check my comprehension
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        ws().update('readings', id, { status: 'reading', position: 0 })
                        seek(0)
                        usePlayer.setState({ done: false })
                      }}
                      className="h-10 rounded-xl border border-[var(--rd-line)] text-[13px]"
                    >
                      Read again
                    </button>
                    <button onClick={() => navigate('/read')} className="h-10 rounded-xl border border-[var(--rd-line)] text-[13px]">
                      Library
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {help && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-6 z-30 mx-auto w-[min(92%,460px)] rounded-2xl border border-[var(--rd-line)] bg-[var(--rd-bg)] p-4 shadow-2xl" data-testid="shortcuts" onClick={() => setHelp(false)}>
              <div className="mb-2 text-[13px] font-semibold">Keyboard</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
                {SHORTCUTS.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--rd-muted)]">{d}</span>
                    <kbd className="rounded-md border border-[var(--rd-line)] px-1.5 font-mono text-[11px]">{k}</kbd>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11.5px] text-[var(--rd-muted)]">Touch: tap to play/pause · drag sideways to scrub · drag up/down for speed</div>
            </motion.div>
          )}
        </AnimatePresence>

        {panel === 'contents' && reading && <ContentsPanel toc={toc} reading={reading} onClose={() => setPanel(null)} />}
        {panel === 'ai' && <AiPanel title={reading?.title ?? file.name} toc={toc} onClose={() => setPanel(null)} />}
      </main>

      <footer className={cn('z-20 shrink-0 px-3 pt-1 pb-[max(10px,env(safe-area-inset-bottom))] transition-opacity duration-500 sm:px-5', showChrome ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        {doc && !!doc.blocks.length && (
          <>
            <Scrubber toc={toc} />
            <ProgressText toc={toc} />
            <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex items-center gap-1">
                <SpeedControl />
              </div>
              <Transport />
              <div className="flex items-center justify-end gap-0.5">
                <RB label="Bookmark (B)" onClick={bookmark} className="max-sm:hidden">
                  <BookmarkPlus />
                </RB>
                <DisplaySettings />
              </div>
            </div>
          </>
        )}
      </footer>
    </div>
  )
}

