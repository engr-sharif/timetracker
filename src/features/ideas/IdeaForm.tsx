import { useState } from 'react'
import { toast } from 'sonner'
import { IDEA_STAGES } from '@/lib/meta'
import { modKey } from '@/lib/utils'
import { ws } from '@/store/workspace'
import type { Hue, Idea, IdeaStage } from '@/store/types'
import { Button } from '@/components/ui/button'
import { HuePicker, Kbd, Segmented } from '@/components/ui/misc'
import { ProjectPicker } from '@/components/ui/pickers'

export function IdeaForm({ preset, onDone }: { preset?: Partial<Idea>; onDone: () => void }) {
  const [text, setText] = useState(preset?.text ?? '')
  const [stage, setStage] = useState<IdeaStage>(preset?.stage ?? 'spark')
  const [color, setColor] = useState<Hue>(preset?.color ?? 'amber')
  const [projectId, setProjectId] = useState(preset?.projectId)

  const submit = () => {
    if (!text.trim()) return
    const tags = Array.from(text.matchAll(/#([\w-]+)/g), (m) => m[1].toLowerCase())
    ws().create('ideas', { text: text.trim(), stage, color, projectId, tags, pinned: false })
    toast.success('Idea captured ✨')
    onDone()
  }

  return (
    <div className="space-y-4">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
        placeholder="What if we…  (use #tags to group)"
        className="field-sizing-content min-h-32 w-full resize-none bg-transparent font-serif text-2xl leading-snug outline-none placeholder:text-subtle/70"
      />
      <Segmented value={stage} onChange={setStage} size="xs" options={IDEA_STAGES.map((s) => ({ value: s.value, label: s.label }))} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HuePicker value={color} onChange={setColor} />
        <ProjectPicker value={projectId} onChange={setProjectId} />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <span className="text-[11px] text-subtle">
          <Kbd>{modKey()}</Kbd> <Kbd>↵</Kbd>
        </span>
        <Button variant="primary" onClick={submit} disabled={!text.trim()}>
          Capture
        </Button>
      </div>
    </div>
  )
}
