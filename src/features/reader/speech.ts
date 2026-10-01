import { readerPrefs } from './prefs'
import { F, type Token } from './text'
import { usePlayer } from './player'

/**
 * Listen mode: the device's speech engine reads aloud while the word on screen
 * follows the voice. Sentences are spoken one utterance at a time (long
 * utterances stall in some browsers) and word boundary events drive the cursor;
 * voices without boundary events fall back to an estimated word clock.
 */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** Words per minute of a voice at rate 1 (roughly; voices differ). */
const BASE_WPM = 175

export const speechRate = (wpm: number) => Math.min(3, Math.max(0.5, wpm / BASE_WPM))

export function voices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return speechSynthesis.getVoices()
}

/** Voices load asynchronously in Chromium. */
export function whenVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([])
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

let session = 0
let fallback: ReturnType<typeof setInterval> | undefined

export function stopSpeaking() {
  session++
  clearInterval(fallback)
  if (speechSupported()) speechSynthesis.cancel()
}

interface SpeakHandlers {
  onWord: (pos: number) => void
  onEnd: () => void
  onError: (message: string) => void
}

/** End (exclusive) of the utterance starting at `from`: the sentence, capped for very long ones. */
function utteranceEnd(tokens: Token[], from: number) {
  let i = from
  let chars = 0
  while (i < tokens.length) {
    chars += tokens[i].w.length + 1
    i++
    if (tokens[i - 1].f & (F.SENT | F.PARA_END)) break
    if (chars > 260 && tokens[i - 1].f & F.CLAUSE) break
    if (chars > 400) break
  }
  return i
}

export function speak(from: number, h: SpeakHandlers) {
  stopSpeaking()
  const id = session
  if (!speechSupported()) return h.onError('Speech isn’t available in this browser')
  void whenVoices().then((list) => {
    if (id !== session) return
    const pref = readerPrefs().voice
    const lang = document.documentElement.lang || navigator.language || 'en'
    const voice = list.find((v) => v.voiceURI === pref) ?? list.find((v) => v.default && v.lang.startsWith(lang.slice(0, 2))) ?? list.find((v) => v.lang.startsWith(lang.slice(0, 2))) ?? list[0]
    say(from, voice, id, h)
  })
}

function say(from: number, voice: SpeechSynthesisVoice | undefined, id: number, h: SpeakHandlers) {
  const { tokens } = usePlayer.getState()
  if (from >= tokens.length) return h.onEnd()
  const to = utteranceEnd(tokens, from)
  const offsets: number[] = []
  let text = ''
  for (let i = from; i < to; i++) {
    offsets.push(text.length)
    text += (i > from ? ' ' : '') + tokens[i].w
    if (i > from) offsets[offsets.length - 1] += 1
  }
  const rate = speechRate(readerPrefs().wpm)
  const u = new SpeechSynthesisUtterance(text)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? u.lang
  u.rate = rate
  let gotBoundary = false

  u.onstart = () => {
    if (id !== session) return
    h.onWord(from)
    // Estimated word clock for voices that never report boundaries.
    const per = 60000 / (BASE_WPM * rate)
    let k = 0
    clearInterval(fallback)
    fallback = setInterval(() => {
      if (gotBoundary || id !== session) return clearInterval(fallback)
      k++
      if (from + k < to) h.onWord(from + k)
    }, per)
  }
  u.onboundary = (e) => {
    if (id !== session || (e.name && e.name !== 'word')) return
    gotBoundary = true
    clearInterval(fallback)
    let lo = 0
    let hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (offsets[mid] <= e.charIndex) lo = mid
      else hi = mid - 1
    }
    h.onWord(from + lo)
  }
  u.onend = () => {
    if (id !== session) return
    clearInterval(fallback)
    if (to >= tokens.length) return h.onEnd()
    h.onWord(to)
    say(to, voice, id, h)
  }
  u.onerror = (e) => {
    if (id !== session || e.error === 'interrupted' || e.error === 'canceled') return
    clearInterval(fallback)
    h.onError(e.error)
  }
  speechSynthesis.speak(u)
}
