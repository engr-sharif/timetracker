import { create } from 'zustand'
import { readerPrefs, useReaderPrefs } from './prefs'
import { buildFrames, buildStream, F, frameAt, prefixWeights, sentenceStart, type Block, type Pace, type Stream } from './text'
import { speak, stopSpeaking } from './speech'

/**
 * The reading clock. One word (or chunk) at a time, timed from cumulative word
 * weights with drift correction, so 600 wpm stays 600 wpm even when frames jitter.
 */

interface PlayerState extends Stream {
  blocks: Block[]
  frames: Int32Array
  /** cumulative weights for time-left */
  pre: Float64Array
  pos: number
  playing: boolean
  /** set when the end was reached */
  done: boolean
}

export const usePlayer = create<PlayerState>(() => ({
  blocks: [],
  tokens: [],
  blockStart: new Int32Array(1),
  frames: new Int32Array(1),
  pre: new Float64Array(1),
  pos: 0,
  playing: false,
  done: false,
}))

const st = () => usePlayer.getState()
const pace = (): Pace => {
  const p = readerPrefs()
  return { wpm: p.wpm, smart: p.smart, sentence: p.sentence, paragraph: p.paragraph }
}

let timer: ReturnType<typeof setTimeout> | undefined
let nextAt = 0
let rampIndex = 0
let playStarted = 0
let wordsThisRun = 0
let lastBump = 0

/** Speed training: nudges the pace up a little each minute of continuous reading. */
function train() {
  const p = readerPrefs()
  if (!p.train || p.wpm >= p.trainTarget) return
  const now = performance.now()
  if (now - lastBump < 60_000) return
  lastBump = now
  p.set({ wpm: Math.min(p.trainTarget, p.wpm + 10) })
}

/** Receives reading time/words when playback stops (for stats) and position changes (for saving). */
let hooks: { onStats?: (words: number, seconds: number) => void; onPosition?: (pos: number) => void; onFinish?: () => void } = {}
export const setPlayerHooks = (h: typeof hooks) => {
  hooks = h
}

export function loadStream(blocks: Block[], pos: number) {
  stop()
  const stream = buildStream(blocks)
  const p = readerPrefs()
  usePlayer.setState({
    ...stream,
    blocks,
    frames: buildFrames(stream.tokens, p.mode === 'focus' ? p.chunk : 1),
    pre: prefixWeights(stream.tokens, pace()),
    pos: Math.max(0, Math.min(pos, stream.tokens.length - 1)),
    done: false,
  })
}

// Rebuild derived timing when pacing/chunk preferences change.
useReaderPrefs.subscribe((p, prev) => {
  const s = st()
  if (!s.tokens.length) return
  if (p.chunk !== prev.chunk || p.mode !== prev.mode) usePlayer.setState({ frames: buildFrames(s.tokens, p.mode === 'focus' ? p.chunk : 1) })
  if (p.smart !== prev.smart || p.sentence !== prev.sentence || p.paragraph !== prev.paragraph) usePlayer.setState({ pre: prefixWeights(s.tokens, pace()) })
  if (s.playing && (p.mode !== prev.mode || (p.mode === 'listen' && (p.wpm !== prev.wpm || p.voice !== prev.voice)))) {
    pause()
    play()
  }
})

const msPerWeight = () => 60000 / readerPrefs().wpm

/** Milliseconds to read from `from` to `to` at the current pace. */
export function timeBetween(from: number, to: number) {
  const { pre } = st()
  const a = Math.max(0, Math.min(from, pre.length - 1))
  const b = Math.max(0, Math.min(to, pre.length - 1))
  return (pre[b] - pre[a]) * msPerWeight()
}

function frameDuration(fi: number) {
  const { frames, pre } = st()
  const m = pre[frames[fi + 1]] - pre[frames[fi]]
  const ramp = readerPrefs().ramp ? 1 + 0.9 * Math.max(0, 1 - rampIndex / 7) : 1
  return m * msPerWeight() * ramp
}

function haptic(pos: number) {
  const mode = readerPrefs().haptics
  if (mode === 'off' || !navigator.vibrate) return
  const t = st().tokens[pos - 1]
  if (t && t.f & (F.SENT | F.PARA_END)) navigator.vibrate(18)
  else if (mode === 'words') navigator.vibrate(4)
}

function tick() {
  const s = st()
  const fi = frameAt(s.frames, s.pos)
  const next = s.frames[fi + 1]
  wordsThisRun += next - s.pos
  if (next >= s.tokens.length) {
    usePlayer.setState({ pos: s.tokens.length - 1, done: true })
    pause()
    hooks.onFinish?.()
    return
  }
  usePlayer.setState({ pos: next })
  haptic(next)
  train()
  rampIndex++
  schedule()
}

function schedule() {
  const fi = frameAt(st().frames, st().pos)
  nextAt += frameDuration(fi)
  // If the tab was throttled and we've fallen far behind, re-anchor instead of racing.
  const now = performance.now()
  if (nextAt < now - 250) nextAt = now
  timer = setTimeout(tick, Math.max(0, nextAt - now))
}

export function play(opts: { rewind?: boolean } = {}) {
  const s = st()
  if (s.playing || !s.tokens.length) return
  let pos = s.done ? 0 : s.pos
  if ((opts.rewind ?? readerPrefs().rewind) && !s.done && pos > 0) {
    // Back up to the sentence start (or up to 6 words) so the thread isn't lost.
    const start = sentenceStart(s.tokens, pos)
    pos = pos - start <= 12 ? start : Math.max(start, pos - 6)
  }
  usePlayer.setState({ playing: true, done: false, pos })
  rampIndex = 0
  playStarted = performance.now()
  lastBump = playStarted
  wordsThisRun = 0
  if (readerPrefs().mode === 'listen') {
    speak(pos, {
      onWord: (p) => {
        const cur = st().pos
        if (p > cur) wordsThisRun += p - cur
        usePlayer.setState({ pos: p })
      },
      onEnd: () => {
        usePlayer.setState({ pos: st().tokens.length - 1, done: true })
        pause()
        hooks.onFinish?.()
      },
      onError: () => pause(),
    })
    return
  }
  nextAt = performance.now()
  schedule()
}

export function pause() {
  clearTimeout(timer)
  timer = undefined
  stopSpeaking()
  const s = st()
  if (!s.playing) return
  usePlayer.setState({ playing: false })
  const seconds = (performance.now() - playStarted) / 1000
  if (seconds > 0.5) hooks.onStats?.(wordsThisRun, seconds)
  wordsThisRun = 0
  hooks.onPosition?.(st().pos)
}

export const toggle = () => (st().playing ? pause() : play())

const stop = pause

/** Jump to a token. Keeps playing (restarting the ramp) if already playing. */
export function seek(pos: number) {
  const s = st()
  if (!s.tokens.length) return
  const p = Math.max(0, Math.min(s.tokens.length - 1, Math.round(pos)))
  const was = s.playing
  if (was) {
    clearTimeout(timer)
    stopSpeaking()
  }
  usePlayer.setState({ pos: p, done: false })
  if (was) {
    usePlayer.setState({ playing: false })
    const words = wordsThisRun
    const started = playStarted
    // Resume without the rewind and without counting the jump as reading.
    play({ rewind: false })
    wordsThisRun = words
    playStarted = started
  } else hooks.onPosition?.(p)
}

export function stepFrames(n: number) {
  const s = st()
  const fi = frameAt(s.frames, s.pos)
  const target = Math.max(0, Math.min(s.frames.length - 2, fi + n))
  seek(s.frames[target])
}

export function unloadPlayer() {
  stop()
  usePlayer.setState({ tokens: [], blocks: [], pos: 0, done: false })
}
