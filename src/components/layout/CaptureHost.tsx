import { useState } from 'react'
import { useUI, type CaptureKind } from '@/store/ui'
import { useRecord } from '@/store/workspace'
import { Dialog } from '@/components/ui/dialog'
import { TaskForm } from '@/features/tasks/TaskForm'
import { EntryForm } from '@/features/timesheet/EntryForm'
import { EventForm } from '@/features/calendar/EventForm'
import { IdeaForm } from '@/features/ideas/IdeaForm'

const TITLES: Record<CaptureKind, string> = {
  task: 'New task',
  time: 'Log time',
  idea: 'Capture an idea',
  note: 'New note',
  event: 'New event',
}

/** Renders the global quick-capture dialog for whichever kind was requested. */
export function CaptureHost() {
  const capture = useUI((s) => s.capture)
  const close = useUI((s) => s.closeCapture)
  const [last, setLast] = useState(capture)
  if (capture && capture !== last) setLast(capture)
  const shown = capture ?? last
  const preset = shown?.preset ?? {}
  const editingEntry = useRecord('entries', preset.entryId as string | undefined)
  const editingEvent = useRecord('events', preset.eventId as string | undefined)

  const title = editingEntry ? 'Edit time entry' : editingEvent ? 'Edit event' : shown ? TITLES[shown.kind] : ''

  return (
    <Dialog open={!!capture} onClose={close} title={title} className={shown?.kind === 'task' ? 'max-w-xl' : 'max-w-md'}>
      {shown?.kind === 'task' && <TaskForm preset={preset} onDone={close} />}
      {shown?.kind === 'time' && <EntryForm entry={editingEntry} preset={preset} onDone={close} />}
      {shown?.kind === 'event' && <EventForm event={editingEvent} preset={preset} onDone={close} />}
      {shown?.kind === 'idea' && <IdeaForm preset={preset} onDone={close} />}
    </Dialog>
  )
}
