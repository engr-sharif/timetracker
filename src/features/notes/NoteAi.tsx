import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Copy, ListPlus, ListTree, Sparkles } from 'lucide-react'
import { copyText } from '@/lib/utils'
import { AiError, chat, textOf, useAi } from '@/lib/ai'
import { ws } from '@/store/workspace'
import type { Note } from '@/store/types'
import { Button, IconButton, Spinner } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { MenuItem, Popover } from '@/components/ui/popover'
import { Markdown } from '@/components/ui/Markdown'
import { useQuickAdd } from '@/features/ai/QuickAdd'
import { bullets, docToText, h, p } from './noteUtils'

/** Minimal Markdown → TipTap JSON for appending AI summaries to a note. */
function markdownToNodes(md: string) {
  const nodes: unknown[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) nodes.push(bullets(...list))
    list = []
  }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const head = line.match(/^#{1,4}\s+(.*)$/)
    const item = line.match(/^([-*•]|\d+[.)])\s+(.*)$/)
    const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1')
    if (head) {
      flush()
      nodes.push(h(3, clean(head[1])))
    } else if (item) list.push(clean(item[2]))
    else {
      flush()
      nodes.push(p(clean(line)))
    }
  }
  flush()
  return nodes
}

export function NoteAi({ note, onContentReplaced }: { note: Note; onContentReplaced: () => void }) {
  const hasKey = useAi((s) => !!s.key)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)

  const guard = () => {
    if (hasKey) return true
    toast('Add your Claude API key to use AI', { action: { label: 'Settings', onClick: () => navigate('/settings#ai') } })
    return false
  }

  const summarize = async () => {
    if (!guard()) return
    if (note.text.trim().length < 40) return toast('Write a little more first')
    setOpen(true)
    setBusy(true)
    setSummary('')
    try {
      const msg = await chat({
        system: 'Summarize engineering consultant notes. Output Markdown: a "## Summary" with 3–6 bullets, then "## Decisions", "## Action items" (with owner and date when stated) and "## Open questions" only when there is content for them. Be specific; keep numbers, names and dates exactly.',
        messages: [{ role: 'user', content: `# ${note.title || 'Untitled'}\n\n${note.text}` }],
        effort: 'low',
        onText: setSummary,
      })
      setSummary(textOf(msg))
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : 'Could not summarize')
      setOpen(false)
    }
    setBusy(false)
  }

  const append = () => {
    const doc = note.content as { type: string; content?: unknown[] }
    const next = { ...doc, content: [...(doc.content ?? []), { type: 'horizontalRule' }, ...markdownToNodes(summary)] }
    ws().update('notes', note.id, { content: next, text: docToText(next) })
    onContentReplaced()
    setOpen(false)
    toast.success('Summary added to the note')
  }

  return (
    <>
      <Popover
        role="menu"
        placement="bottom-end"
        trigger={
          <IconButton label="AI">
            <Sparkles className="text-accent-strong" />
          </IconButton>
        }
      >
        <MenuItem
          icon={<ListPlus />}
          onSelect={() => {
            if (!guard()) return
            if (!note.text.trim()) return toast('This note is empty')
            useQuickAdd.getState().show(`Action items, meetings and time from my note “${note.title || 'Untitled'}”${note.projectId ? ` (project ${ws().doc.tables.projects[note.projectId]?.number ?? ''})` : ''}:\n\n${note.text.slice(0, 12000)}`)
          }}
        >
          Extract tasks & dates…
        </MenuItem>
        <MenuItem icon={<ListTree />} onSelect={() => void summarize()}>
          Summarize
        </MenuItem>
      </Popover>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Summary"
        className="max-w-xl"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              icon={<Copy className="size-4" />}
              disabled={busy || !summary}
              onClick={async () => {
                await copyText(summary)
                toast.success('Copied')
              }}
            >
              Copy
            </Button>
            <Button variant="primary" disabled={busy || !summary} onClick={append}>
              Append to note
            </Button>
          </div>
        }
      >
        {summary ? (
          <Markdown text={summary} />
        ) : (
          <div className="flex items-center gap-2 py-6 text-sm text-subtle">
            <Spinner className="size-4" /> Reading your note…
          </div>
        )}
      </Dialog>
    </>
  )
}
