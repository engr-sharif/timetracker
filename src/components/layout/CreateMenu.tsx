import { useNavigate } from 'react-router'
import { CalendarDays, Clock, Lightbulb, NotebookPen, Shapes, SquareCheckBig } from 'lucide-react'
import { MenuItem, MenuSeparator } from '@/components/ui/popover'
import { useUI } from '@/store/ui'
import { ws } from '@/store/workspace'
import { emptyNoteContent } from '@/features/notes/noteUtils'

export function useCreateActions() {
  const openCapture = useUI((s) => s.openCapture)
  const navigate = useNavigate()
  return {
    task: () => openCapture('task'),
    time: () => openCapture('time'),
    idea: () => openCapture('idea'),
    event: () => openCapture('event'),
    note: (projectId?: string) => {
      const n = ws().create('notes', { title: '', icon: '📝', content: emptyNoteContent(), text: '', pinned: false, tags: [], projectId })
      navigate(`/notes/${n.id}`)
    },
    board: (projectId?: string) => {
      const b = ws().create('boards', { name: 'Untitled board', scene: { elements: [] }, projectId })
      navigate(`/boards/${b.id}`)
    },
  }
}

export function CreateMenuItems() {
  const a = useCreateActions()
  return (
    <div className="w-52">
      <MenuItem icon={<SquareCheckBig />} onSelect={a.task} shortcut="C">
        New task
      </MenuItem>
      <MenuItem icon={<Clock />} onSelect={a.time} shortcut="L">
        Log time
      </MenuItem>
      <MenuItem icon={<CalendarDays />} onSelect={a.event} shortcut="E">
        New event
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<NotebookPen />} onSelect={() => a.note()}>
        New note
      </MenuItem>
      <MenuItem icon={<Lightbulb />} onSelect={a.idea} shortcut="I">
        Capture idea
      </MenuItem>
      <MenuItem icon={<Shapes />} onSelect={() => a.board()}>
        New whiteboard
      </MenuItem>
    </div>
  )
}
