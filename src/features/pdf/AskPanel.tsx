import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ArrowUp, KeyRound, ListPlus, RotateCcw, Sparkles, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AiError, blobToBase64, chat, extract, useAi, type BetaContentBlockParam, type BetaMessage, type BetaMessageParam } from '@/lib/ai'
import { getBlob } from '@/lib/files'
import { ws } from '@/store/workspace'
import type { PdfDoc } from '@/store/types'
import { Markdown } from '@/components/ui/Markdown'
import { Spinner } from '@/components/ui/button'
import { pageText } from './engine'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  error?: string
}

interface Thread {
  turns: Turn[]
  history: BetaMessageParam[]
  signature: string
}

/** Conversations survive panel switches (kept in memory for the session). */
const threads = new Map<string, Thread>()

const SYSTEM = `You help an engineering consultant work with project documents — drawings, specifications, reports, RFIs, submittals and correspondence.
Answer from the attached document. Be concise and specific: quote values, sheet numbers, spec sections and dimensions exactly as written. Use tables for schedules or lists of items, and short bullet lists otherwise. If the document doesn't say, say so plainly instead of guessing. Cite the pages you relied on.`

const PROMPTS = [
  'Summarize this document in a few bullets',
  'List requirements, deadlines and deliverables',
  'What open questions or RFIs should I raise?',
  'Extract any schedules or tables as a table',
]

async function documentBlock(doc: PdfDoc): Promise<{ block: BetaContentBlockParam; mode: 'pdf' | 'text' }> {
  const file = ws().doc.tables.files[doc.fileId]
  const identity = doc.pages.every((p, i) => p.src === doc.fileId && p.index === i && p.rotate === 0)
  if (identity && doc.pages.length <= 100 && (file?.size ?? Infinity) <= 24 * 1024 * 1024) {
    const blob = await getBlob(doc.fileId)
    if (blob) {
      return {
        mode: 'pdf',
        block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await blobToBase64(blob) }, title: doc.name, citations: { enabled: true }, cache_control: { type: 'ephemeral' } },
      }
    }
  }
  // Re-ordered, merged or very large sets: send each Studio page's text (incl. OCR) as its own block.
  let budget = 450_000
  const content: { type: 'text'; text: string }[] = []
  for (let i = 0; i < doc.pages.length; i++) {
    const p = doc.pages[i]
    const runs = await pageText(p.src, p.index).catch(() => [])
    let t = runs.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim()
    t = t.slice(0, Math.max(0, budget))
    budget -= t.length
    content.push({ type: 'text', text: `[Page ${i + 1}] ${t || '(no text on this page — it may be a drawing; run OCR for scanned text)'}` })
  }
  return { mode: 'text', block: { type: 'document', source: { type: 'content', content }, title: doc.name, citations: { enabled: true }, cache_control: { type: 'ephemeral' } } }
}

/** Assistant text with ⟦n⟧ markers after cited passages (page numbers in Studio order). */
function withCitations(msg: BetaMessage, mode: 'pdf' | 'text') {
  let out = ''
  for (const b of msg.content) {
    if (b.type !== 'text') continue
    out += b.text
    const pages = new Set<number>()
    for (const c of b.citations ?? []) {
      if (c.type === 'page_location') pages.add(c.start_page_number)
      else if (c.type === 'content_block_location' && mode === 'text') pages.add(c.start_block_index + 1)
    }
    if (pages.size) out += [...pages].sort((a, b) => a - b).map((p) => `⟦${p}⟧`).join('')
  }
  return out
}

export function AskPanel({ doc, seed, onSeedUsed, onJumpPage }: { doc: PdfDoc; seed: string | null; onSeedUsed: () => void; onJumpPage: (n: number) => void }) {
  const hasKey = useAi((s) => !!s.key)
  const signature = `${doc.id}:${doc.pages.map((p) => p.key).join(',')}`
  const [thread, setThread] = useState<Thread>(() => threads.get(doc.id)?.signature === signature ? threads.get(doc.id)! : { turns: [], history: [], signature })
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tasksBusy, setTasksBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const modeRef = useRef<'pdf' | 'text'>('pdf')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threads.set(doc.id, thread)
  }, [doc.id, thread])
  useEffect(() => {
    const sc = endRef.current?.parentElement
    sc?.scrollTo({ top: sc.scrollHeight })
  }, [thread.turns.length, streaming])
  useEffect(() => {
    if (seed) {
      setInput(`About this passage:\n“${seed.trim().slice(0, 1200)}”\n\n`)
      onSeedUsed()
    }
  }, [seed, onSeedUsed])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    setInput('')
    setBusy(true)
    setStreaming('')
    const turns: Turn[] = [...thread.turns, { role: 'user', text: question }]
    setThread((t) => ({ ...t, turns }))
    abort.current = new AbortController()
    try {
      let history = thread.history
      if (!history.length) {
        const { block, mode } = await documentBlock(doc)
        modeRef.current = mode
        history = [{ role: 'user', content: [block, { type: 'text', text: question }] }]
      } else history = [...history, { role: 'user', content: question }]
      const msg = await chat({ system: SYSTEM, messages: history, effort: 'medium', onText: setStreaming, signal: abort.current.signal })
      const answer = withCitations(msg, modeRef.current)
      setThread({ signature, turns: [...turns, { role: 'assistant', text: answer }], history: [...history, { role: 'assistant', content: msg.content as BetaMessageParam['content'] }] })
    } catch (e) {
      const err = e instanceof AiError ? e.message : e instanceof Error && e.name === 'AbortError' ? 'Stopped.' : String(e)
      setThread((t) => ({ ...t, turns: [...turns, { role: 'assistant', text: '', error: err }] }))
    }
    setStreaming(null)
    setBusy(false)
  }

  const toTasks = async () => {
    setTasksBusy(true)
    try {
      const { block } = await documentBlock(doc)
      const Schema = z.object({
        tasks: z.array(
          z.object({
            title: z.string().describe('Imperative, under 90 characters'),
            notes: z.string().describe('One or two sentences of context, with the section or sheet reference'),
            due: z.string().nullable().describe('ISO date yyyy-mm-dd if the document states one, else null'),
            page: z.number().int().nullable(),
            priority: z.enum(['low', 'medium', 'high']),
          }),
        ),
      })
      const out = await extract(Schema, {
        system: 'Extract concrete action items for the consultant from this document: deliverables, reviews, responses owed, deadlines, coordination items. Skip generic boilerplate. At most 15.',
        content: [block, { type: 'text', text: 'List the action items.' }],
        effort: 'medium',
      })
      if (!out.tasks.length) {
        toast('No action items found')
        return
      }
      for (const t of out.tasks) {
        ws().create('tasks', {
          title: t.title,
          notes: `${t.notes}\n\nFrom “${doc.name}”${t.page ? `, page ${t.page}` : ''}. [Open](#/pdf/${doc.fileId}${t.page ? `?page=${t.page}` : ''})`,
          projectId: doc.projectId,
          assigneeId: 'me',
          assignedById: 'me',
          status: 'todo',
          priority: t.priority,
          due: t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : undefined,
          labels: ['from-pdf'],
          subtasks: [],
          order: Date.now(),
        })
      }
      toast.success(`Created ${out.tasks.length} task${out.tasks.length > 1 ? 's' : ''}`, { description: out.tasks.slice(0, 3).map((t) => t.title).join(' · ') })
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : 'Could not extract tasks')
    } finally {
      setTasksBusy(false)
    }
  }

  const cite = (s: string, key: string) => {
    const parts = s.split(/(⟦\d+⟧)/)
    return parts.map((p, i) => {
      const m = p.match(/^⟦(\d+)⟧$/)
      if (!m) return p
      const n = Number(m[1])
      return (
        <button key={`${key}${i}`} onClick={() => onJumpPage(n)} className="mx-0.5 inline-flex h-4 translate-y-[-1px] items-center rounded bg-accent-soft px-1 align-middle font-mono text-[10px] font-semibold text-accent-strong hover:bg-accent/25" title={`Go to page ${n}`}>
          p{n}
        </button>
      )
    })
  }

  if (!hasKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
          <Sparkles className="size-5" />
        </div>
        <div className="text-[14px] font-semibold">Ask this PDF</div>
        <p className="text-[12.5px] text-muted">Summaries, requirement lists, schedules and answers with page citations — using your own Claude API key.</p>
        <Link to="/settings#ai" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg">
          <KeyRound className="size-3.5" /> Add API key
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="size-4 text-accent-strong" /> Ask this PDF
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={toTasks} disabled={tasksBusy} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50" title="Extract action items into Tasks">
            {tasksBusy ? <Spinner className="size-3" /> : <ListPlus className="size-3.5" />} Tasks
          </button>
          {thread.turns.length > 0 && (
            <button onClick={() => setThread({ turns: [], history: [], signature })} className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg" title="New conversation">
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {!thread.turns.length && (
          <div className="space-y-2 pt-2">
            <p className="px-1 text-[12px] text-subtle">Ask anything about “{doc.name}”. Answers cite the pages they come from.</p>
            {PROMPTS.map((p) => (
              <button key={p} onClick={() => void ask(p)} className="block w-full rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-left text-[12.5px] text-muted transition-colors hover:border-accent/40 hover:text-fg">
                {p}
              </button>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {thread.turns.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn(t.role === 'user' && 'flex justify-end')}>
              {t.role === 'user' ? (
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent px-3 py-2 text-[13px] whitespace-pre-wrap text-accent-fg">{t.text}</div>
              ) : t.error ? (
                <div className="rounded-xl border border-warning/30 bg-warning/8 px-3 py-2 text-[12.5px] text-warning">{t.error}</div>
              ) : (
                <Markdown text={t.text} renderInline={cite} className="text-[13px]" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {streaming !== null && (
          <div>
            {streaming ? (
              <Markdown text={streaming} className="text-[13px]" />
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-subtle">
                <Spinner className="size-3.5" /> Reading the document…
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
        className="border-t border-border p-2.5"
      >
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 focus-within:border-accent/60">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void ask(input)
              }
            }}
            rows={Math.min(6, Math.max(1, input.split('\n').length))}
            placeholder="Ask about this PDF…"
            className="max-h-40 min-h-[22px] flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-subtle"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="grid size-7 place-items-center rounded-lg bg-surface-3 text-fg" aria-label="Stop">
              <Square className="size-3" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg disabled:opacity-40" aria-label="Send">
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
