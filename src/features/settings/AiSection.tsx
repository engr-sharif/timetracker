import { useState } from 'react'
import { toast } from 'sonner'
import { Check, ExternalLink, KeyRound, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { AiError, testAi, useAi } from '@/lib/ai'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

const FEATURES = [
  'PDF Studio: ask questions with page citations, summaries, action items → tasks',
  'Notes: turn meeting notes into assigned, dated tasks',
  'Whiteboards: describe a process and get a flowchart; read handwriting',
  'Quick add: “2.5h on 1234567 task 002 yesterday, drainage review” → a timesheet entry',
]

export function AiSection() {
  const { key, model, models, setKey, setModel, loadModels } = useAi()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  const save = async () => {
    const k = draft.trim()
    if (!/^sk-ant-/.test(k)) return toast.error('That doesn’t look like a Claude API key (it starts with sk-ant-).')
    setBusy(true)
    setKey(k)
    try {
      await testAi()
      setDraft('')
      setOk(true)
      toast.success('Claude connected')
    } catch (e) {
      setKey('')
      toast.error(e instanceof AiError ? e.message : 'Could not connect')
    }
    setBusy(false)
  }

  return (
    <section id="ai" className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-surface/70 backdrop-blur-sm">
      <div className="relative border-b border-border p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-24 -right-12 size-60 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="hidden size-11 shrink-0 place-items-center rounded-xl border border-border-strong bg-surface-2 text-accent-strong sm:grid">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight">AI assistant</h2>
            <p className="mt-1 text-[13px] text-muted">Optional. Uses your own Claude API key, called directly from this browser.</p>
          </div>
          {key && (
            <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11.5px] font-medium text-success">
              <Check className="size-3.5" /> Connected
            </span>
          )}
        </div>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {key ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Model" hint="Newest Opus is picked automatically; change it any time." className="min-w-[240px] flex-1">
                <select
                  value={model}
                  onFocus={() => !models.length && void loadModels().catch(() => {})}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-9 w-full rounded-[10px] border border-border bg-surface px-2.5 text-[13px]"
                >
                  {!models.some((m) => m.id === model) && model && <option value={model}>{model}</option>}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await testAi()
                    toast.success('Claude is responding')
                  } catch (e) {
                    toast.error(e instanceof AiError ? e.message : 'Test failed')
                  }
                  setBusy(false)
                }}
              >
                Test
              </Button>
              <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setKey('')}>
                Remove key
              </Button>
            </div>
            {ok && <p className="text-xs text-success">Connected — AI actions are now available across Workbench.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Claude API key">
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-ant-…" icon={<KeyRound />} className="flex-1 font-mono" onKeyDown={(e) => e.key === 'Enter' && void save()} />
                <Button variant="primary" loading={busy} disabled={!draft.trim()} onClick={save}>
                  Connect
                </Button>
              </div>
            </Field>
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent-strong hover:underline">
              Create a key in the Claude Console <ExternalLink className="size-3" />
            </a>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <ul className="space-y-1.5 text-[12.5px] text-muted">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent-strong" />
                {f}
              </li>
            ))}
          </ul>
          <div className="flex gap-2.5 rounded-xl border border-border bg-surface-2/40 p-3 text-[11.5px] leading-relaxed text-subtle">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            The key stays in this browser only — it isn’t synced to the cloud or gist. Content you send goes straight to Anthropic’s API under your account.
          </div>
        </div>
      </div>
    </section>
  )
}
