import { useState } from 'react'
import { toast } from 'sonner'
import { Trash } from 'lucide-react'
import { todayKey } from '@/lib/dates'
import { EVENT_KINDS } from '@/lib/meta'
import { ws } from '@/store/workspace'
import type { CalendarEvent, EventKind } from '@/store/types'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea, TitleInput } from '@/components/ui/field'
import { Segmented } from '@/components/ui/misc'
import { DatePicker, ProjectPicker } from '@/components/ui/pickers'

export function EventForm({ event, preset, onDone }: { event?: CalendarEvent; preset?: Partial<CalendarEvent>; onDone: () => void }) {
  const init = event ?? preset ?? {}
  const [title, setTitle] = useState(init.title ?? '')
  const [date, setDate] = useState(init.date ?? todayKey())
  const [start, setStart] = useState(init.start ?? '')
  const [end, setEnd] = useState(init.end ?? '')
  const [kind, setKind] = useState<EventKind>(init.kind ?? 'meeting')
  const [projectId, setProjectId] = useState(init.projectId)
  const [notes, setNotes] = useState(init.notes ?? '')

  const submit = () => {
    if (!title.trim()) return
    const data = { title: title.trim(), date, start: start || undefined, end: end || undefined, kind, projectId, notes }
    if (event) ws().update('events', event.id, data)
    else ws().create('events', data)
    toast.success(event ? 'Event updated' : 'Event added')
    onDone()
  }

  return (
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
      }}
    >
      <TitleInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <Segmented
        value={kind}
        onChange={setKind}
        size="xs"
        options={EVENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
        className="flex-wrap"
      />
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker value={date} onChange={(d) => d && setDate(d)} clearable={false} />
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-7 w-28 text-xs" aria-label="Start time" />
        <span className="text-subtle">–</span>
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-7 w-28 text-xs" aria-label="End time" />
        <ProjectPicker value={projectId} onChange={setProjectId} />
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, location, dial-in…" />
      </Field>
      <div className="flex justify-between border-t border-border pt-4">
        {event ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            icon={<Trash className="size-3.5" />}
            onClick={() => {
              const removed = ws().remove('events', event.id)
              toast('Event deleted', { action: { label: 'Undo', onClick: () => ws().restore('events', removed) } })
              onDone()
            }}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" onClick={submit} disabled={!title.trim()}>
          {event ? 'Save' : 'Add event'}
        </Button>
      </div>
    </div>
  )
}
