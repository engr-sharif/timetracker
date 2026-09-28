import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Excalidraw, MainMenu, WelcomeScreen, exportToBlob, exportToSvg, hashElementsVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { ArrowLeft, Check, Download, Image as ImageIcon, Shapes } from 'lucide-react'
import { download } from '@/lib/utils'
import { resolveTheme, usePrefs } from '@/store/prefs'
import { useRecord, ws } from '@/store/workspace'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { MenuItem, Popover } from '@/components/ui/popover'
import { ProjectPicker } from '@/components/ui/pickers'

/* eslint-disable @typescript-eslint/no-explicit-any */

const THUMB_LIMIT = 180_000

export default function BoardCanvas() {
  const { id } = useParams()
  const board = useRecord('boards', id)
  const navigate = useNavigate()
  const theme = resolveTheme(usePrefs((s) => s.theme))
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const lastHash = useRef<number | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [saved, setSaved] = useState(true)
  // Load the scene once; later remote updates don't clobber an open canvas.
  const initialData = useMemo(
    () =>
      board
        ? {
            elements: board.scene.elements as any[],
            appState: { ...(board.scene.appState ?? {}), theme },
            files: (board.scene.files ?? {}) as any,
            scrollToContent: true,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  if (!board || !id) {
    return <EmptyState className="h-full" icon={<Shapes />} title="Board not found" action={<Button onClick={() => navigate('/boards')}>All boards</Button>} />
  }

  const persist = async (elements: readonly any[], appState: any, files: any) => {
    const live = elements.filter((e) => !e.isDeleted)
    let thumbnail: string | undefined
    try {
      if (live.length) {
        const svg = await exportToSvg({ elements: live, appState: { ...appState, exportBackground: false, exportWithDarkMode: false }, files, exportPadding: 16 })
        const str = new XMLSerializer().serializeToString(svg)
        if (str.length < THUMB_LIMIT) thumbnail = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(str)}`
      }
    } catch {
      /* thumbnails are best-effort */
    }
    const usedFiles = Object.fromEntries(Object.entries(files ?? {}).filter(([fid]) => live.some((e) => e.fileId === fid)))
    ws().update('boards', id, {
      scene: { elements: live, appState: { viewBackgroundColor: appState.viewBackgroundColor, gridModeEnabled: appState.gridModeEnabled }, files: usedFiles },
      thumbnail,
    })
    setSaved(true)
  }

  const onChange = (elements: readonly any[], appState: any, files: any) => {
    const h = hashElementsVersion(elements)
    if (lastHash.current === null) {
      lastHash.current = h
      return
    }
    if (h === lastHash.current) return
    lastHash.current = h
    setSaved(false)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void persist(elements, appState, files), 900)
  }

  const exportPng = async () => {
    const api = apiRef.current
    if (!api) return
    const blob = await exportToBlob({ elements: api.getSceneElements(), appState: { ...api.getAppState(), exportBackground: true }, files: api.getFiles(), mimeType: 'image/png', exportPadding: 24 })
    download(`${board.name}.png`, blob)
    toast.success('Exported PNG')
  }
  const exportSvg = async () => {
    const api = apiRef.current
    if (!api) return
    const svg = await exportToSvg({ elements: api.getSceneElements(), appState: { ...api.getAppState(), exportBackground: true }, files: api.getFiles(), exportPadding: 24 })
    download(`${board.name}.svg`, new XMLSerializer().serializeToString(svg), 'image/svg+xml')
    toast.success('Exported SVG')
  }

  return (
    <div className="flex h-full flex-col">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-elev/70 px-4 backdrop-blur-xl">
        <Link to="/boards" className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg" aria-label="All boards">
          <ArrowLeft className="size-4" />
        </Link>
        <input
          value={board.name}
          onChange={(e) => ws().update('boards', id, { name: e.target.value })}
          className="min-w-0 flex-1 truncate bg-transparent text-[15px] font-semibold tracking-tight outline-none sm:max-w-md"
          aria-label="Board name"
        />
        <span className="hidden items-center gap-1.5 text-xs text-subtle sm:flex">
          {saved ? (
            <>
              <Check className="size-3.5 text-success" /> Saved
            </>
          ) : (
            'Saving…'
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ProjectPicker value={board.projectId} onChange={(projectId) => ws().update('boards', id, { projectId })} placeholder="Link project" className="hidden sm:inline-flex" />
          <Popover
            role="menu"
            placement="bottom-end"
            trigger={
              <Button size="sm" icon={<Download className="size-3.5" />}>
                Export
              </Button>
            }
          >
            <MenuItem icon={<ImageIcon />} onSelect={exportPng}>
              PNG image
            </MenuItem>
            <MenuItem icon={<Shapes />} onSelect={exportSvg}>
              SVG vector
            </MenuItem>
          </Popover>
        </div>
      </motion.div>
      <div className="excalidraw-host relative min-h-0 flex-1">
        <Excalidraw
          key={id}
          excalidrawAPI={(api) => (apiRef.current = api)}
          initialData={initialData as any}
          theme={theme}
          onChange={onChange}
          name={board.name}
          UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false, export: { saveFileToDisk: true }, toggleTheme: false } }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
          <WelcomeScreen>
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Hints.MenuHint />
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Heading>Sketch it out — flowcharts, diagrams, markups.</WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItemLoadScene />
                <WelcomeScreen.Center.MenuItemHelp />
              </WelcomeScreen.Center.Menu>
            </WelcomeScreen.Center>
          </WelcomeScreen>
        </Excalidraw>
      </div>
    </div>
  )
}
