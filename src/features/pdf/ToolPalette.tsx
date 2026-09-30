import { useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ChevronUp,
  Circle,
  Cloud,
  Crosshair,
  Eraser,
  Hand,
  Hash,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Pentagon,
  Plus,
  Ruler,
  Signature,
  Spline,
  Square,
  SquareDashed,
  Stamp,
  MessageSquareText,
  Type,
  WandSparkles,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, Popover } from '@/components/ui/popover'
import { Kbd } from '@/components/ui/misc'
import { useRecord } from '@/store/workspace'
import { HIGHLIGHTS, PALETTE, STAMPS, loadSignatures, styleFor, useStudio, type Tool } from './store'

type Icon = ComponentType<{ className?: string; style?: React.CSSProperties }>

export const TOOL_META: Record<Tool, { label: string; icon: Icon; key?: string }> = {
  select: { label: 'Select', icon: MousePointer2, key: 'V' },
  hand: { label: 'Pan', icon: Hand, key: 'H' },
  pen: { label: 'Pen', icon: PenLine, key: 'P' },
  highlight: { label: 'Highlighter', icon: Highlighter, key: 'I' },
  eraser: { label: 'Eraser', icon: Eraser, key: 'E' },
  rect: { label: 'Rectangle', icon: Square, key: 'R' },
  ellipse: { label: 'Ellipse', icon: Circle, key: 'O' },
  cloud: { label: 'Revision cloud', icon: Cloud, key: 'C' },
  line: { label: 'Line', icon: Minus, key: 'L' },
  arrow: { label: 'Arrow', icon: MoveUpRight, key: 'A' },
  polygon: { label: 'Polygon', icon: Pentagon, key: 'G' },
  text: { label: 'Text', icon: Type, key: 'T' },
  callout: { label: 'Callout', icon: MessageSquareText, key: 'K' },
  stamp: { label: 'Stamp', icon: Stamp, key: 'S' },
  image: { label: 'Signature', icon: Signature, key: 'J' },
  length: { label: 'Length', icon: Ruler, key: 'M' },
  polylength: { label: 'Polylength', icon: Spline, key: 'Y' },
  area: { label: 'Area', icon: SquareDashed, key: 'Q' },
  count: { label: 'Count', icon: Hash, key: 'N' },
  calibrate: { label: 'Set scale', icon: Crosshair },
  redact: { label: 'Redact', icon: EyeOff, key: 'X' },
}

export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(
  Object.entries(TOOL_META)
    .filter(([, m]) => m.key)
    .map(([t, m]) => [m.key!.toLowerCase(), t as Tool]),
)

const GROUPS: { id: string; tools: Tool[] }[] = [
  { id: 'nav', tools: ['select', 'hand'] },
  { id: 'ink', tools: ['pen', 'highlight', 'eraser'] },
  { id: 'shapes', tools: ['rect', 'ellipse', 'cloud', 'line', 'arrow', 'polygon'] },
  { id: 'text', tools: ['text', 'callout', 'stamp', 'image'] },
  { id: 'measure', tools: ['length', 'polylength', 'area', 'count', 'calibrate'] },
  { id: 'redact', tools: ['redact'] },
]

/** Tools shown directly; the rest of each group lives behind its chevron. */
const PRIMARY: Tool[] = ['select', 'hand', 'pen', 'highlight', 'eraser', 'rect', 'cloud', 'arrow', 'text', 'callout', 'stamp', 'length', 'area', 'count', 'redact']

export function ToolPalette({ onSignature, onCalibrate }: { onSignature: () => void; onCalibrate: () => void }) {
  const tool = useStudio((s) => s.tool)
  const setTool = useStudio((s) => s.setTool)
  const [lastInGroup, setLast] = useState<Record<string, Tool>>({})

  const pick = (t: Tool) => {
    if (t === 'image' && !useStudio.getState().signature) return onSignature()
    if (t === 'calibrate') return onCalibrate()
    setTool(t)
    const g = GROUPS.find((x) => x.tools.includes(t))
    if (g) setLast((l) => ({ ...l, [g.id]: t }))
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-3">
      <StyleBar onSignature={onSignature} onCalibrate={onCalibrate} />
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.1 }}
        className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl border border-border-strong bg-bg-elev/85 p-1.5 shadow-float backdrop-blur-xl [scrollbar-width:none]"
      >
        {GROUPS.map((g, gi) => {
          const shown = g.tools.filter((t) => PRIMARY.includes(t) || lastInGroup[g.id] === t || tool === t)
          const hidden = g.tools.filter((t) => !shown.includes(t))
          return (
            <div key={g.id} className="flex items-center gap-0.5">
              {gi > 0 && <span className="mx-1 h-6 w-px bg-border" />}
              {shown.map((t) => (
                <ToolButton key={t} t={t} active={tool === t} onClick={() => pick(t)} />
              ))}
              {hidden.length > 0 && (
                <Popover
                  role="menu"
                  placement="top"
                  trigger={
                    <button className="grid h-9 w-4 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`More ${g.id} tools`}>
                      <ChevronUp className="size-3" />
                    </button>
                  }
                >
                  <div className="flex gap-0.5 p-1">
                    {hidden.map((t) => (
                      <ToolButton key={t} t={t} active={tool === t} onClick={() => pick(t)} />
                    ))}
                  </div>
                </Popover>
              )}
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}

function ToolButton({ t, active, onClick }: { t: Tool; active: boolean; onClick: () => void }) {
  const m = TOOL_META[t]
  return (
    <Tooltip
      placement="top"
      content={
        <span className="flex items-center gap-2">
          {m.label}
          {m.key && <Kbd>{m.key}</Kbd>}
        </span>
      }
    >
      <button
        onClick={onClick}
        aria-label={m.label}
        aria-pressed={active}
        className={cn('relative grid size-9 shrink-0 place-items-center rounded-xl transition-colors', active ? 'text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
      >
        {active && <motion.span layoutId="pdf-tool" className="absolute inset-0 rounded-xl bg-accent shadow-[0_4px_16px_-4px_var(--accent-glow)]" transition={{ type: 'spring', stiffness: 520, damping: 36 }} />}
        <m.icon className="relative size-[18px]" />
      </button>
    </Tooltip>
  )
}

const STYLED: Tool[] = ['pen', 'highlight', 'rect', 'ellipse', 'cloud', 'line', 'arrow', 'polygon', 'text', 'callout', 'length', 'polylength', 'area', 'count']

function StyleBar({ onSignature, onCalibrate }: { onSignature: () => void; onCalibrate: () => void }) {
  const tool = useStudio((s) => s.tool)
  const styles = useStudio((s) => s.styles)
  const setStyle = useStudio((s) => s.setStyle)
  const smartInk = useStudio((s) => s.smartInk)
  const stamp = useStudio((s) => s.stamp)
  const signature = useStudio((s) => s.signature)
  const set = useStudio((s) => s.set)
  const st = styleFor(tool, styles)
  const show = STYLED.includes(tool) || tool === 'stamp' || tool === 'image'
  const colors = tool === 'highlight' ? HIGHLIGHTS : PALETTE
  const hasFill = ['rect', 'ellipse', 'cloud', 'polygon', 'callout', 'area'].includes(tool)
  const hasSize = ['text', 'callout', 'length', 'polylength', 'area', 'count'].includes(tool)
  const hasWidth = !['text', 'count'].includes(tool)
  const isMeasure = ['length', 'polylength', 'area', 'count'].includes(tool)

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="style"
          initial={{ y: 10, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-bg-elev/85 px-3 py-2 shadow-float backdrop-blur-xl"
        >
          {tool === 'stamp' ? (
            <div className="flex max-w-[min(90vw,720px)] gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {STAMPS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => set({ stamp: s })}
                  className={cn('shrink-0 rounded-md border-2 px-2 py-1 text-[10.5px] font-extrabold tracking-wide transition-transform hover:scale-[1.04]', stamp.text === s.text ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-elev' : 'opacity-80')}
                  style={{ color: s.color, borderColor: s.color }}
                >
                  {s.text}
                </button>
              ))}
            </div>
          ) : tool === 'image' ? (
            <SignatureStrip signature={signature} onNew={onSignature} />
          ) : (
            <>
              <div className="flex items-center gap-1">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setStyle({ color: c, ...(tool === 'area' ? { fill: c } : {}) })}
                    className={cn('size-6 rounded-full border border-black/10 transition-transform hover:scale-110', st.color === c && 'ring-2 ring-accent ring-offset-2 ring-offset-bg-elev')}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
                <label className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong text-subtle hover:text-fg" title="Custom colour">
                  <Plus className="size-3" />
                  <input type="color" value={st.color} onChange={(e) => setStyle({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
              {hasWidth && (
                <Slider label={tool === 'highlight' ? 'Size' : 'Weight'} value={st.width} min={tool === 'highlight' ? 4 : 0.5} max={tool === 'highlight' ? 40 : 12} step={0.5} onChange={(width) => setStyle({ width })} />
              )}
              {hasSize && <Slider label={tool === 'count' ? 'Marker' : 'Text'} value={st.size} min={tool === 'count' ? 3 : 6} max={tool === 'count' ? 20 : 48} step={1} onChange={(size) => setStyle({ size })} />}
              {!isMeasure && tool !== 'text' && <Slider label="Opacity" value={Math.round(st.opacity * 100)} min={10} max={100} step={5} onChange={(v) => setStyle({ opacity: v / 100 })} suffix="%" />}
              {hasFill && tool !== 'area' && (
                <button onClick={() => setStyle({ fill: st.fill ? null : tool === 'callout' ? '#ffffff' : st.color })} className={cn('h-7 rounded-lg border px-2.5 text-xs font-medium', st.fill ? 'border-accent/40 bg-accent-soft text-accent-strong' : 'border-border text-muted hover:text-fg')}>
                  Fill
                </button>
              )}
              {tool === 'pen' && (
                <Tooltip content={smartInk === 'hold' ? 'Hold at the end of a stroke to snap it into a clean shape' : smartInk === 'always' ? 'Every stroke that looks like a shape becomes one' : 'Keep ink exactly as drawn'}>
                  <button
                    onClick={() => set({ smartInk: smartInk === 'hold' ? 'always' : smartInk === 'always' ? 'off' : 'hold' })}
                    className={cn('flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium', smartInk !== 'off' ? 'border-accent/40 bg-accent-soft text-accent-strong' : 'border-border text-muted hover:text-fg')}
                  >
                    <WandSparkles className="size-3.5" />
                    {smartInk === 'hold' ? 'Hold to snap' : smartInk === 'always' ? 'Auto shapes' : 'Raw ink'}
                  </button>
                </Tooltip>
              )}
              {isMeasure && <ScaleChip onCalibrate={onCalibrate} />}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Slider({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-subtle">
      {label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-20 cursor-pointer accent-[var(--accent)]" />
      <span className="w-8 font-mono text-[10.5px] text-muted tabular-nums">
        {value}
        {suffix}
      </span>
    </label>
  )
}

function ScaleChip({ onCalibrate }: { onCalibrate: () => void }) {
  const docId = useStudio((s) => s.docId)
  const activePage = useStudio((s) => s.activePage)
  const doc = useRecord('pdfs', docId ?? undefined)
  const cal = (activePage && doc?.pageScales?.[activePage]) || doc?.scale
  return (
    <button
      onClick={onCalibrate}
      className={cn('flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium', cal ? 'border-border text-muted hover:text-fg' : 'animate-pulse border-warning/50 text-warning')}
    >
      <Crosshair className="size-3.5" /> {cal ? cal.label : 'Set scale'}
    </button>
  )
}

function SignatureStrip({ signature, onNew }: { signature: string | null; onNew: () => void }) {
  const set = useStudio((s) => s.set)
  const list = loadSignatures()
  return (
    <div className="flex items-center gap-2">
      {list.map((s) => (
        <button key={s.slice(-24)} onClick={() => set({ signature: s })} className={cn('h-10 rounded-lg border bg-white px-2', signature === s ? 'border-accent ring-2 ring-accent/30' : 'border-border')}>
          <img src={s} alt="Signature" className="h-8 max-w-[140px] object-contain" />
        </button>
      ))}
      <button onClick={onNew} className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 text-xs text-muted hover:text-fg">
        <Plus className="size-3.5" /> New signature
      </button>
      <span className="text-[11px] text-subtle">Click the page to place</span>
    </div>
  )
}
