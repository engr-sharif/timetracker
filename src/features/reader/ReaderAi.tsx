import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { BookOpenCheck, Check, HelpCircle, Lightbulb, ListChecks, RotateCcw, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AiError, chat, extract, textOf, useAi, type BetaContentBlockParam } from '@/lib/ai'
import { Markdown } from '@/components/ui/Markdown'
import { Spinner } from '@/components/ui/button'
import { Drawer } from './Panels'
import { usePlayer } from './player'
import { useReaderPrefs } from './prefs'
import type { TocEntry } from './text'

/**
 * Comprehension help while speed reading — the classic weakness of RSVP. Everything
 * is grounded in the text up to where the reader is, so nothing ahead is spoiled.
 */

const CAP = 150_000

function textRange(from: number, to: number) {
  const { tokens } = usePlayer.getState()
  let out = ''
  let lastB = -1
  for (let i = Math.max(0, from); i < Math.min(tokens.length, to); i++) {
    const t = tokens[i]
    out += t.b !== lastB && lastB !== -1 ? `\n\n${t.w}` : out ? ` ${t.w}` : t.w
    lastB = t.b
  }
  return out
}

/** Text read so far (most recent part if the document is long). */
function readSoFar() {
  const { pos } = usePlayer.getState()
  const all = textRange(0, pos + 1)
  return all.length > CAP ? '[…earlier text omitted…]\n\n' + all.slice(-CAP) : all
}

function chapterRange(toc: TocEntry[]) {
  const { pos, blockStart, tokens } = usePlayer.getState()
  let start = Math.max(0, pos - 2500)
  for (const t of toc) if (blockStart[t.block] <= pos) start = blockStart[t.block]
  return { start, end: Math.min(tokens.length, pos + 1) }
}

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).describe('exactly 4 options'),
        answer: z.number().int().describe('0-based index of the correct option'),
        why: z.string().describe('one sentence quoting or pointing to the passage'),
      }),
    )
    .describe('3 to 5 questions'),
})
type Quiz = z.infer<typeof quizSchema>

const SYSTEM = (title: string) =>
  `You help someone who is speed reading “${title}” one word at a time. They can't easily glance back, so be their memory. Use only the provided text — it ends exactly where they are, so never guess what comes next. Be concise, concrete and faithful to the author's wording, names and numbers. Format with short Markdown (bold key terms, bullets where helpful).`

export function AiPanel({ title, toc, onClose }: { title: string; toc: TocEntry[]; onClose: () => void }) {
  const hasKey = useAi((s) => !!s.key)
  const navigate = useNavigate()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [q, setQ] = useState('')
  const abort = useRef<AbortController | null>(null)
  const wpm = useReaderPrefs((x) => x.wpm)
  const setWpm = (v: number) => useReaderPrefs.getState().set({ wpm: v })

  const run = async (prompt: string, context: string, label: string) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setError('')
    setQuiz(null)
    setAnswer('')
    try {
      const content: BetaContentBlockParam[] = [
        { type: 'text', text: `<document title="${title.replace(/"/g, "'")}">\n${context}\n</document>`, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: prompt },
      ]
      const msg = await chat({ system: SYSTEM(title), messages: [{ role: 'user', content }], effort: 'low', maxTokens: 4000, onText: setAnswer, signal: ac.signal })
      setAnswer(textOf(msg))
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof AiError ? e.message : `Couldn’t ${label}`)
    }
    setBusy(false)
  }

  const recap = () => run('Recap what I have read so far: the main thread in 4–8 bullets, then the most recent part in a little more detail so I can pick up where I am.', readSoFar(), 'recap')
  const explain = () => {
    const { pos, tokens, blockStart } = usePlayer.getState()
    const b = tokens[pos]?.b ?? 0
    const from = blockStart[Math.max(0, b - 2)]
    const passage = textRange(blockStart[b], Math.min(blockStart[b + 1], pos + 1))
    void run(`Explain the passage I'm on in plain language — what it means and why it matters here. Define any jargon. The last sentence I read was: “${passage.slice(-400)}”`, textRange(from, Math.min(tokens.length, pos + 1)), 'explain')
  }
  const takeaways = () => {
    const { start, end } = chapterRange(toc)
    void run('List the key takeaways of this section so far (3–7 bullets), each with the supporting detail.', textRange(start, end), 'summarize')
  }
  const ask = () => {
    if (!q.trim()) return
    void run(q.trim(), readSoFar(), 'answer')
    setQ('')
  }
  const makeQuiz = async () => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setError('')
    setAnswer('')
    setQuiz(null)
    setPicked({})
    try {
      const { start, end } = chapterRange(toc)
      const text = textRange(Math.max(start, end - 6000), end)
      const out = await extract(quizSchema, {
        system: SYSTEM(title),
        content: `<document title="${title.replace(/"/g, "'")}">\n${text}\n</document>\n\nWrite a short multiple-choice comprehension check on this text: questions about substance (claims, causes, numbers, who did what), not trivia about wording. Plausible distractors.`,
        effort: 'low',
        signal: ac.signal,
      })
      setQuiz({ questions: out.questions.filter((x) => x.options.length >= 2 && x.answer >= 0 && x.answer < x.options.length).slice(0, 5) })
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof AiError ? e.message : 'Couldn’t make a quiz')
    }
    setBusy(false)
  }

  const score = quiz ? quiz.questions.filter((x, i) => picked[i] === x.answer).length : 0
  const answered = quiz ? Object.keys(picked).length : 0

  return (
    <Drawer title="Reading assistant" onClose={onClose} testId="ai-panel">
      {!hasKey ? (
        <div className="p-5 text-[13px] leading-relaxed text-[var(--rd-muted)]">
          Add your Claude API key in Settings to get recaps, explanations and comprehension quizzes grounded in what you’ve read.
          <button onClick={() => navigate('/settings#ai')} className="mt-3 block font-medium text-[var(--rd-pivot)] hover:underline">
            Open Settings →
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 border-b border-[var(--rd-line)] p-2">
            {(
              [
                [RotateCcw, 'Recap so far', recap],
                [HelpCircle, 'Explain this', explain],
                [Lightbulb, 'Key takeaways', takeaways],
                [ListChecks, 'Quiz me', makeQuiz],
              ] as const
            ).map(([Icon, label, fn]) => (
              <button key={label} disabled={busy} onClick={() => void fn()} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--rd-line)] px-2.5 text-[12.5px] text-[var(--rd-fg)] transition-colors hover:bg-[color-mix(in_oklch,var(--rd-fg)_7%,transparent)] disabled:opacity-50">
                <Icon className="size-3.5 text-[var(--rd-pivot)]" /> {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 text-[13.5px] leading-relaxed text-[var(--rd-fg)]" data-testid="ai-output">
            {error && <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">{error}</div>}
            {busy && !answer && (
              <div className="flex items-center gap-2 text-[13px] text-[var(--rd-muted)]">
                <Spinner className="size-4" /> Thinking about what you’ve read…
              </div>
            )}
            {answer && <Markdown text={answer} />}
            {quiz && (
              <div className="space-y-4">
                {quiz.questions.map((x, i) => (
                  <div key={i}>
                    <div className="mb-1.5 font-medium">
                      {i + 1}. {x.question}
                    </div>
                    <div className="space-y-1">
                      {x.options.map((o, k) => {
                        const chosen = picked[i]
                        const done = chosen !== undefined
                        return (
                          <button
                            key={k}
                            disabled={done}
                            onClick={() => setPicked((p) => ({ ...p, [i]: k }))}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors',
                              !done && 'border-[var(--rd-line)] hover:bg-[color-mix(in_oklch,var(--rd-fg)_6%,transparent)]',
                              done && k === x.answer && 'border-success/50 bg-success/12',
                              done && k === chosen && k !== x.answer && 'border-danger/50 bg-danger/10',
                              done && k !== chosen && k !== x.answer && 'border-transparent opacity-60',
                            )}
                          >
                            <span className="mt-[1px] w-4 shrink-0 text-[var(--rd-muted)]">{done && k === x.answer ? <Check className="size-3.5 text-success" /> : done && k === chosen ? <X className="size-3.5 text-danger" /> : String.fromCharCode(65 + k)}</span>
                            {o}
                          </button>
                        )
                      })}
                    </div>
                    {picked[i] !== undefined && <p className="mt-1.5 text-[12px] text-[var(--rd-muted)]">{x.why}</p>}
                  </div>
                ))}
                {answered === quiz.questions.length && (
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--rd-line)] p-3 text-[13px]">
                    <BookOpenCheck className="size-4 text-[var(--rd-pivot)]" />
                    {score} of {quiz.questions.length} —{' '}
                    <span className="flex-1">
                      {score / quiz.questions.length >= 0.8 ? 'great comprehension — you can go faster.' : score / quiz.questions.length >= 0.5 ? 'decent. Hold this speed for a while.' : 'slowing down a little will help it stick.'}
                    </span>
                    {score / quiz.questions.length >= 0.8 ? (
                      <button onClick={() => setWpm(wpm + 25)} className="shrink-0 rounded-lg bg-[var(--rd-fg)] px-2 py-1 text-[12px] font-medium text-[var(--rd-bg)]">
                        {wpm + 25} wpm
                      </button>
                    ) : score / quiz.questions.length < 0.5 ? (
                      <button onClick={() => setWpm(wpm - 50)} className="shrink-0 rounded-lg bg-[var(--rd-fg)] px-2 py-1 text-[12px] font-medium text-[var(--rd-bg)]">
                        {wpm - 50} wpm
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )}
            {!busy && !answer && !quiz && !error && <p className="text-[13px] text-[var(--rd-muted)]">Answers only use the text up to where you are, so nothing ahead gets spoiled.</p>}
          </div>
          <form
            className="flex items-center gap-2 border-t border-[var(--rd-line)] p-2"
            onSubmit={(e) => {
              e.preventDefault()
              ask()
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about what you’ve read…" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--rd-line)] bg-transparent px-2.5 text-[13px] text-[var(--rd-fg)] outline-none placeholder:text-[var(--rd-muted)] focus:border-[var(--rd-pivot)]" />
            <button type="submit" disabled={busy || !q.trim()} className="grid size-9 place-items-center rounded-lg bg-[var(--rd-fg)] text-[var(--rd-bg)] disabled:opacity-40" aria-label="Ask">
              <Send className="size-4" />
            </button>
          </form>
        </>
      )}
    </Drawer>
  )
}
