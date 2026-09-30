import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { AnimatePresence, motion } from 'motion/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SlashItem {
  title: string
  hint: string
  icon: LucideIcon
  run: (e: Editor) => void
}

const SLASH: SlashItem[] = [
  { title: 'Text', hint: 'Plain paragraph', icon: Type, run: (e) => e.chain().focus().setParagraph().run() },
  { title: 'Heading 1', hint: 'Big section title', icon: Heading1, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { title: 'Heading 2', hint: 'Medium heading', icon: Heading2, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { title: 'Heading 3', hint: 'Small heading', icon: Heading3, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { title: 'Checklist', hint: 'Track to-dos', icon: ListTodo, run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: 'Bullet list', hint: 'Simple list', icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: 'Numbered list', hint: 'Ordered steps', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: 'Quote', hint: 'Call something out', icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: 'Code block', hint: 'Monospaced snippet', icon: SquareCode, run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: 'Divider', hint: 'Horizontal rule', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
]

export default function NoteEditor({ content, onChange }: { content: unknown; onChange: (json: unknown, text: string) => void }) {
  const [slash, setSlash] = useState<{ query: string; from: number; top: number; left: number } | null>(null)
  const [active, setActive] = useState(0)
  const slashRef = useRef(slash)
  slashRef.current = slash
  const activeRef = useRef(active)
  activeRef.current = active
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hostRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => (slash ? SLASH.filter((i) => i.title.toLowerCase().includes(slash.query.toLowerCase())) : []), [slash])
  const itemsRef = useRef(items)
  itemsRef.current = items

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Write something, or type “/” for blocks…'),
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Typography,
    ],
    content: content as object,
    editorProps: {
      attributes: { class: 'prose-editor' },
      handleKeyDown: (_view, event) => {
        const s = slashRef.current
        const list = itemsRef.current
        if (!s || !list.length) return false
        if (event.key === 'ArrowDown') {
          setActive((a) => (a + 1) % list.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          setActive((a) => (a - 1 + list.length) % list.length)
          return true
        }
        if (event.key === 'Enter') {
          runSlash(list[activeRef.current])
          return true
        }
        if (event.key === 'Escape') {
          setSlash(null)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(editor.getJSON(), editor.getText({ blockSeparator: '\n' })), 350)
      detectSlash(editor)
    },
    onSelectionUpdate: ({ editor }) => detectSlash(editor),
  })

  useEffect(() => () => {
    // Flush pending save on unmount.
    if (saveTimer.current && editor) {
      clearTimeout(saveTimer.current)
      onChange(editor.getJSON(), editor.getText({ blockSeparator: '\n' }))
    }
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  function detectSlash(ed: Editor) {
    const { $from, empty } = ed.state.selection
    if (!empty) return setSlash(null)
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const m = before.match(/(?:^|\s)\/(\w*)$/)
    if (!m || $from.parent.type.name === 'codeBlock') return setSlash(null)
    const coords = ed.view.coordsAtPos($from.pos)
    const host = hostRef.current?.getBoundingClientRect()
    if (!host) return
    setSlash({ query: m[1], from: $from.pos - m[1].length - 1, top: coords.bottom - host.top + 6, left: coords.left - host.left })
    setActive(0)
  }

  function runSlash(item?: SlashItem) {
    const s = slashRef.current
    if (!editor || !s || !item) return
    editor.chain().focus().deleteRange({ from: s.from, to: editor.state.selection.from }).run()
    item.run(editor)
    setSlash(null)
  }

  return (
    <div ref={hostRef} className="relative">
      {editor && <FormatBubble editor={editor} />}
      <EditorContent editor={editor} />
      <AnimatePresence>
        {slash && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.08 } }}
            transition={{ type: 'spring', stiffness: 600, damping: 36 }}
            className="glass absolute z-40 w-64 overflow-hidden rounded-xl p-1 shadow-float"
            style={{ top: slash.top, left: Math.max(0, slash.left - 8) }}
          >
            <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-medium tracking-wide text-subtle uppercase">Blocks</div>
            {items.map((item, i) => (
              <button
                key={item.title}
                onMouseDown={(e) => {
                  e.preventDefault()
                  runSlash(item)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left', i === active && 'bg-surface-3/70')}
              >
                <span className="grid size-8 place-items-center rounded-lg border border-border bg-surface-2">
                  <item.icon className="size-4 text-muted" />
                </span>
                <span>
                  <span className="block text-[13px] font-medium">{item.title}</span>
                  <span className="block text-[11px] text-subtle">{item.hint}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FormatBubble({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
    }),
  })
  const btn = (activeState: boolean, label: string, Icon: LucideIcon, onClick: () => void) => (
    <button
      key={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      className={cn('grid size-7 place-items-center rounded-md transition-colors', activeState ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface-3 hover:text-fg')}
    >
      <Icon className="size-3.5" />
    </button>
  )
  return (
    <BubbleMenu editor={editor} options={{ placement: 'top', offset: 8 }} className="glass flex items-center gap-0.5 rounded-xl p-1 shadow-float">
      {btn(state.h1, 'Heading 1', Heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn(state.h2, 'Heading 2', Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      <span className="mx-0.5 h-4 w-px bg-border-strong" />
      {btn(state.bold, 'Bold', Bold, () => editor.chain().focus().toggleBold().run())}
      {btn(state.italic, 'Italic', Italic, () => editor.chain().focus().toggleItalic().run())}
      {btn(state.strike, 'Strikethrough', Strikethrough, () => editor.chain().focus().toggleStrike().run())}
      {btn(state.code, 'Inline code', Code, () => editor.chain().focus().toggleCode().run())}
      {btn(state.highlight, 'Highlight', Highlighter, () => editor.chain().focus().toggleHighlight().run())}
      {btn(state.link, 'Link', Link2, () => {
        if (editor.isActive('link')) return editor.chain().focus().unsetLink().run()
        const url = prompt('Link URL')
        if (url) editor.chain().focus().setLink({ href: url }).run()
      })}
    </BubbleMenu>
  )
}
