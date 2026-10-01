/**
 * Speed-reading core: the parsed document model, the word stream, the optimal
 * recognition point (ORP) of each word and how long each word stays on screen.
 */

export type BlockKind = 'p' | 'h' | 'li' | 'q' | 'pre'

/** A paragraph-level unit of the document. */
export interface Block {
  k: BlockKind
  t: string
  /** heading level (1–4) */
  lvl?: number
  /** source page (PDFs), 0-based */
  page?: number
}

export interface TocEntry {
  title: string
  block: number
  level: number
}

export interface ParsedDoc {
  title: string
  author?: string
  blocks: Block[]
  toc: TocEntry[]
  /** PDF pages that had no text layer (candidates for OCR) */
  scanned?: number[]
  pages?: number
}

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */

export const F = {
  SENT: 1,
  CLAUSE: 2,
  PARA_END: 4,
  HEAD: 8,
  NUM: 16,
  PARA_START: 32,
} as const

export interface Token {
  w: string
  /** block index */
  b: number
  /** F.* flags */
  f: number
}

export interface Stream {
  tokens: Token[]
  /** first token of each block */
  blockStart: Int32Array
}

const ABBREV = new Set(
  'mr mrs ms dr prof sr jr st vs etc e.g i.e fig figs no nos vol vols approx inc ltd co corp dept est al cf ca ch sec secs pp p para eq eqs ref refs min max jan feb mar apr jun jul aug sep sept oct nov dec mon tue wed thu fri sat sun mt ft rev gen col lt sgt capt gov sen rep a.m p.m u.s u.k ph.d b.a m.a'.split(' '),
)

/** The most frequent English words: recognised almost instantly, so they get less time. */
const COMMON = new Set(
  'the of and to a in is it you that he was for on are with as i his they be at one have this from or had by not but what some we can out other were all there when up use your how said an each she which do their time if will way about many then them would like so these her long make thing see him two has look more day could go come did no most my over know than call first who may down side been now find any new part take get place made live where after back little only round man year came show every good me give our under name very through just form much great think say help low line before turn cause same mean differ move right boy old too does tell set three want air well also play small end put home read hand large add even land here must big high such why ask men went kind off need house try us again point world near own should found answer grew study still learn plant food sun four thought let keep never last door between city tree cross since hard start might story saw far sea draw left late run dont while press close night real life few stop open seem together next white begin got walk example ease paper often always those both mark book until mile river car feet care second group carry took rain eat room friend began idea fish mountain north once base hear horse cut sure watch color face wood main enough plain girl usual young ready above ever red list though feel talk bird soon body dog family direct pose leave song measure state product black short numeral class wind question happen complete ship area half rock order fire south problem piece told knew pass farm top whole king size heard best hour better true during hundred am remember step early hold west ground interest reach fast five sing listen six table travel less morning ten simple several vowel toward war lay against pattern slow center love person money serve appear road map science rule govern pull cold notice voice fall power town fine certain fly unit lead cry dark machine note wait plan figure star box noun field rest correct able pound done beauty drive stood contain front teach week final gave green oh quick develop sleep warm free minute strong special mind behind clear tail produce fact street inch lot nothing course stay wheel full force blue object decide surface deep moon island foot yet busy test record boat common gold possible plane age dry wonder laugh thousand ago ran check game shape yes hot miss brought heat snow bed bring sit perhaps fill east weight language among its into'.split(
    ' ',
  ),
)

const TRAIL = /["'”’»)\]}*]+$/
const LEAD = /^["'“‘«([{*]+/
const SENT_END = /[.!?…‽]+["'”’»)\]]*$/
const CLAUSE_END = /[,;:—–]["'”’»)\]]*$/
const LETTER = /[\p{L}\p{N}]/u
const DASH_SPLIT = /(?<=[\p{L}\p{N}][—–])(?=[\p{L}\p{N}"“‘])/u

const core = (w: string) => w.replace(LEAD, '').replace(TRAIL, '').replace(/[.,;:!?…]+$/, '')

function isAbbrev(w: string) {
  const c = w.replace(LEAD, '').replace(TRAIL, '').toLowerCase().replace(/\.$/, '')
  return ABBREV.has(c) || /^\p{L}$/u.test(c) || /^(\p{L}\.)+\p{L}$/u.test(c)
}

/** Splits a block's text into display words: em-dash compounds and very long hyphenations are broken up. */
function words(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue
    for (const part of raw.split(DASH_SPLIT)) {
      if (Array.from(part).length > 15 && /[\p{L}]-[\p{L}]/u.test(part) && !/^https?:/i.test(part)) out.push(...part.split(/(?<=\p{L}-)(?=\p{L})/u))
      else if (part === '—' || part === '–' || part === '-') {
        if (out.length) out[out.length - 1] += ' ' + part
        else out.push(part)
      } else out.push(part)
    }
  }
  return out
}

export function buildStream(blocks: Block[]): Stream {
  const tokens: Token[] = []
  const blockStart = new Int32Array(blocks.length + 1)
  blocks.forEach((bl, b) => {
    blockStart[b] = tokens.length
    // Citation markers ([12], [3–5]) and footnote daggers would flash as noise.
    const ws = words(bl.t.replace(/\s?\[\d+(?:\s?[-–,]\s?\d+)*\]/g, '').replace(/[†‡]/g, ''))
    ws.forEach((w, i) => {
      let f = 0
      const next = ws[i + 1]
      if (i === 0) f |= F.PARA_START
      if (i === ws.length - 1) f |= F.PARA_END | F.SENT
      else if (SENT_END.test(w) && !(isAbbrev(w) && !/[!?…]/.test(w)) && !/^[\p{Ll}]/u.test(next.replace(LEAD, ''))) f |= F.SENT
      else if (CLAUSE_END.test(w) || / [—–-]$/.test(w)) f |= F.CLAUSE
      if (bl.k === 'h') f |= F.HEAD
      if (/\d/.test(w)) f |= F.NUM
      tokens.push({ w, b, f })
    })
  })
  blockStart[blocks.length] = tokens.length
  return { tokens, blockStart }
}

/* ------------------------------------------------------------------ */
/*  ORP                                                                */
/* ------------------------------------------------------------------ */

/**
 * Index (in code points) of the letter the eye should fixate: slightly left of
 * the word's middle, ignoring leading quotes/brackets (Spritz-style table).
 */
export function orpIndex(word: string): number {
  const chars = Array.from(word)
  let start = chars.findIndex((c) => LETTER.test(c))
  if (start < 0) return Math.floor((chars.length - 1) / 2)
  let end = chars.length
  while (end > start + 1 && !LETTER.test(chars[end - 1])) end--
  const len = end - start
  const o = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4
  return start + Math.min(o, len - 1)
}

/** Splits text into [before, pivot, after] around its ORP. */
export function splitOrp(text: string): [string, string, string] {
  const chars = Array.from(text)
  // For multi-word chunks fixate on the ORP of the word nearest a third of the way in.
  let i: number
  if (/\s/.test(text)) {
    const target = chars.length * 0.36
    let pos = 0
    let best = 0
    let bestD = Infinity
    for (const w of text.split(' ')) {
      const len = Array.from(w).length
      const c = pos + orpIndex(w)
      const d = Math.abs(pos + len / 2 - target)
      if (d < bestD) {
        bestD = d
        best = c
      }
      pos += len + 1
    }
    i = best
  } else i = orpIndex(text)
  return [chars.slice(0, i).join(''), chars[i] ?? '', chars.slice(i + 1).join('')]
}

/* ------------------------------------------------------------------ */
/*  Pacing                                                             */
/* ------------------------------------------------------------------ */

export interface Pace {
  wpm: number
  /** vary time per word by length, punctuation and structure */
  smart: boolean
  /** extra dwell at the end of a sentence (×) */
  sentence: number
  /** extra dwell at paragraph ends (×) */
  paragraph: number
}

/** Time multiplier for one token relative to the base 60000/wpm. */
export function weight(t: Token, pace: Pace): number {
  if (!pace.smart) return 1
  const len = Array.from(core(t.w)).length
  // Frequent words are recognised faster than rare ones (word-frequency effect).
  const common = len <= 7 && COMMON.has(core(t.w).toLowerCase())
  let m = common ? (len <= 3 ? 0.8 : 0.88) : len <= 3 ? 0.95 : len > 7 ? 1 + Math.min(0.7, (len - 7) * 0.08) : 1.05
  if (t.f & F.NUM) m += 0.3
  if (t.f & F.SENT) m *= pace.sentence
  else if (t.f & F.CLAUSE) m *= 1 + (pace.sentence - 1) * 0.5
  if (t.f & F.PARA_END) m *= pace.paragraph
  if (t.f & F.HEAD) m *= 1.5
  return m
}

/** Cumulative weights so time-left and progress are O(1). */
export function prefixWeights(tokens: Token[], pace: Pace) {
  const pre = new Float64Array(tokens.length + 1)
  for (let i = 0; i < tokens.length; i++) pre[i + 1] = pre[i] + weight(tokens[i], pace)
  return pre
}

/** Frames group 1–3 words for chunk mode; never across a sentence/clause break. */
export function buildFrames(tokens: Token[], size: number): Int32Array {
  if (size <= 1) return Int32Array.from({ length: tokens.length + 1 }, (_, i) => i)
  const starts: number[] = []
  let i = 0
  while (i < tokens.length) {
    starts.push(i)
    let n = 0
    let chars = 0
    while (i < tokens.length && n < size) {
      const t = tokens[i]
      chars += t.w.length + 1
      i++
      n++
      if (t.f & (F.SENT | F.CLAUSE | F.PARA_END | F.HEAD) || chars > 16) break
      if (i < tokens.length && tokens[i].b !== t.b) break
    }
  }
  starts.push(tokens.length)
  return Int32Array.from(starts)
}

/** Index of the frame containing token `pos`. */
export function frameAt(frames: Int32Array, pos: number) {
  let lo = 0
  let hi = frames.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (frames[mid] <= pos) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}

/** Start of the sentence containing `pos`. */
export function sentenceStart(tokens: Token[], pos: number) {
  let i = Math.min(pos, tokens.length - 1)
  while (i > 0 && !(tokens[i - 1].f & F.SENT)) i--
  return Math.max(0, i)
}

export function nextSentence(tokens: Token[], pos: number) {
  let i = pos
  while (i < tokens.length - 1 && !(tokens[i].f & F.SENT)) i++
  return Math.min(tokens.length - 1, i + 1)
}

export function prevSentence(tokens: Token[], pos: number) {
  const s = sentenceStart(tokens, pos)
  // A second press within the first words of a sentence goes to the previous one.
  return pos - s > 1 ? s : sentenceStart(tokens, Math.max(0, s - 1))
}

export function formatDuration(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 1) return '<1 min'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim()
}

/** Plain text of a block range (for AI and context). */
export function blocksText(blocks: Block[], from = 0, to = blocks.length) {
  return blocks
    .slice(from, to)
    .map((b) => (b.k === 'h' ? `\n## ${b.t}\n` : b.k === 'li' ? `- ${b.t}` : b.t))
    .join('\n\n')
}
