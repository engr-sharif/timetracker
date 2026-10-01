import { memo } from 'react'
import type { PdfAnnot, PdfCalibration } from '@/store/types'
import {
  LINE_HEIGHT,
  arrowHead,
  centroid,
  cloudPath,
  inkPath,
  measure,
  measureText,
  pairs,
  rectPoly,
  stampSize,
  textSize,
  trimEnd,
  type Pt,
} from './geometry'

/**
 * Renders one markup inside a <g> that already carries the page viewport transform
 * (PDF user space → screen). Text is counter-flipped locally so it reads upright.
 */
export const AnnotShape = memo(function AnnotShape({ a, cal, upright, scale }: { a: PdfAnnot; cal: PdfCalibration; upright: number; scale: number }) {
  const p = pairs(a.pts)
  const common = { stroke: a.color, strokeWidth: a.width, fill: a.fill ?? 'none', opacity: a.opacity, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  switch (a.kind) {
    case 'ink':
      return <path d={inkPath(a)} fill={a.color} opacity={a.opacity} />
    case 'highlight':
      return <path d={inkPath(a)} fill={a.color} opacity={a.opacity} style={{ mixBlendMode: 'multiply' }} />
    case 'texthl':
      if (a.sub === 'underline' || a.sub === 'strike') {
        return (
          <g stroke={a.color} strokeWidth={Math.max(0.8, a.width / 2)} opacity={Math.max(0.85, a.opacity)} strokeLinecap="round">
            {Array.from({ length: p.length / 2 }, (_, i) => {
              const [x0, y0] = p[i * 2]
              const [x1, y1] = p[i * 2 + 1]
              const y = a.sub === 'strike' ? (y0 + y1) / 2 : Math.min(y0, y1) + Math.abs(y1 - y0) * 0.08
              return <line key={i} x1={Math.min(x0, x1)} x2={Math.max(x0, x1)} y1={y} y2={y} />
            })}
          </g>
        )
      }
      return (
        <g fill={a.color} opacity={a.opacity} style={{ mixBlendMode: 'multiply' }}>
          {Array.from({ length: p.length / 2 }, (_, i) => {
            const [x0, y0] = p[i * 2]
            const [x1, y1] = p[i * 2 + 1]
            return <rect key={i} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} rx={0.8} />
          })}
        </g>
      )
    case 'rect':
    case 'redact': {
      if (p.length < 2) return null
      const [[x0, y0], [x1, y1]] = p
      const r = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }
      if (a.kind === 'redact') {
        return (
          <g>
            <rect {...r} fill="#000" fillOpacity={0.55} stroke="#e5484d" strokeWidth={1.2 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} />
            <path d={`M${r.x},${r.y}L${r.x + r.width},${r.y + r.height}M${r.x},${r.y + r.height}L${r.x + r.width},${r.y}`} stroke="#e5484d" strokeOpacity={0.5} strokeWidth={0.8 / scale} />
          </g>
        )
      }
      return <rect {...r} {...common} fillOpacity={a.fill ? 0.18 : undefined} />
    }
    case 'ellipse': {
      if (p.length < 2) return null
      const [[x0, y0], [x1, y1]] = p
      return <ellipse cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} rx={Math.abs(x1 - x0) / 2} ry={Math.abs(y1 - y0) / 2} {...common} fillOpacity={a.fill ? 0.18 : undefined} />
    }
    case 'cloud': {
      if (p.length < 2) return null
      const poly = p.length === 2 ? rectPoly(p[0], p[1]) : p
      const r = Math.max(4, Math.min(14, Math.sqrt(Math.abs((p[1][0] - p[0][0]) * (p[1][1] - p[0][1]))) / 8))
      return <path d={cloudPath(poly, r)} {...common} fillOpacity={a.fill ? 0.14 : undefined} />
    }
    case 'polygon':
      return <polygon points={p.map((q) => q.join(',')).join(' ')} {...common} fillOpacity={a.fill ? 0.18 : undefined} />
    case 'line':
      return <polyline points={p.map((q) => q.join(',')).join(' ')} {...common} fill="none" />
    case 'arrow': {
      if (p.length < 2) return null
      const [from, tip] = [p[p.length - 2], p[p.length - 1]]
      const head = arrowHead(from, tip, a.width)
      const shaft = [...p.slice(0, -1), trimEnd(from, tip, a.width * 1.5)]
      return (
        <g opacity={a.opacity}>
          <polyline points={shaft.map((q) => q.join(',')).join(' ')} {...common} opacity={1} fill="none" />
          <polygon points={head.map((q) => q.join(',')).join(' ')} fill={a.color} stroke={a.color} strokeWidth={a.width * 0.5} strokeLinejoin="round" />
        </g>
      )
    }
    case 'text':
      return <TextBlock a={a} at={p[0]} />
    case 'callout': {
      if (p.length < 2) return null
      const [tip, at] = p
      const { w, h } = textSize(a.text ?? '', a.size ?? 11)
      const bw = w + 12
      const bh = h + 10
      // Leader attaches to the nearest point on the box edge.
      const cx = Math.max(at[0], Math.min(tip[0], at[0] + bw))
      const cy = Math.max(at[1] - bh, Math.min(tip[1], at[1]))
      const inside = cx > at[0] && cx < at[0] + bw && cy > at[1] - bh && cy < at[1]
      const knee: Pt = inside ? [at[0], at[1] - bh / 2] : [cx, cy]
      const head = arrowHead(knee, tip, a.width)
      return (
        <g opacity={a.opacity}>
          <line x1={knee[0]} y1={knee[1]} x2={trimEnd(knee, tip, a.width * 1.5)[0]} y2={trimEnd(knee, tip, a.width * 1.5)[1]} stroke={a.color} strokeWidth={a.width} strokeLinecap="round" />
          <polygon points={head.map((q) => q.join(',')).join(' ')} fill={a.color} />
          <rect x={at[0]} y={at[1] - bh} width={bw} height={bh} rx={2} fill={a.fill ?? '#fff'} stroke={a.color} strokeWidth={a.width} />
          <TextBlock a={{ ...a, color: a.fill && a.fill !== '#fff' && a.fill !== '#ffffff' ? '#fff' : '#1c2024' }} at={[at[0] + 6, at[1] - 5]} />
        </g>
      )
    }
    case 'stamp': {
      const { w, h } = stampSize(a)
      const size = a.size ?? 18
      const at = p[0]
      return (
        <g transform={`translate(${at[0]},${at[1]}) rotate(${a.angle ?? 0}) scale(1,-1)`} opacity={a.opacity}>
          <rect x={0} y={0} width={w} height={h} rx={size * 0.28} fill={a.color} fillOpacity={0.06} stroke={a.color} strokeWidth={size * 0.12} />
          <rect x={size * 0.16} y={size * 0.16} width={w - size * 0.32} height={h - size * 0.32} rx={size * 0.18} fill="none" stroke={a.color} strokeWidth={size * 0.04} />
          <text x={w / 2} y={size * 1.05} textAnchor="middle" fill={a.color} fontSize={size} fontWeight={800} fontFamily="Helvetica, Arial, sans-serif">
            {a.text}
          </text>
          {a.sub && (
            <text x={w / 2} y={size * 1.7} textAnchor="middle" fill={a.color} fontSize={size * 0.5} fontFamily="Helvetica, Arial, sans-serif">
              {a.sub}
            </text>
          )}
        </g>
      )
    }
    case 'image': {
      if (p.length < 2 || !a.src) return null
      const [[x0, y0], [x1, y1]] = p
      const x = Math.min(x0, x1)
      const top = Math.max(y0, y1)
      const w = Math.abs(x1 - x0)
      const h = Math.abs(y1 - y0)
      return (
        <g transform={`translate(${x},${top}) scale(1,-1)`} opacity={a.opacity}>
          <image href={a.src} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />
        </g>
      )
    }
    case 'length':
    case 'polylength':
    case 'area':
    case 'count':
      return <MeasureShape a={a} cal={cal} upright={upright} scale={scale} />
    default:
      return null
  }
})

function TextBlock({ a, at }: { a: PdfAnnot; at: Pt }) {
  const size = a.size ?? 12
  const { lines } = textSize(a.text ?? '', size)
  return (
    <g transform={`translate(${at[0]},${at[1]}) rotate(${a.angle ?? 0}) scale(1,-1)`}>
      <text fill={a.color} fontSize={size} fontFamily="Helvetica, Arial, sans-serif" opacity={a.kind === 'text' ? a.opacity : 1} style={{ whiteSpace: 'pre' }}>
        {lines.map((l, i) => (
          <tspan key={i} x={2} y={2 + size * (0.86 + i * LINE_HEIGHT)}>
            {l || ' '}
          </tspan>
        ))}
      </text>
    </g>
  )
}

/** A readable label: dark pill with white text, upright on screen. */
export function Label({ at, text, angle, size, color, scale }: { at: Pt; text: string; angle: number; size: number; color: string; scale: number }) {
  const s = Math.max(size, 7.5 / scale)
  const w = measureText(text, s) + s * 0.9
  const h = s * 1.5
  return (
    <g transform={`translate(${at[0]},${at[1]}) rotate(${angle}) scale(1,-1)`} style={{ pointerEvents: 'none' }}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={color} />
      <text x={0} y={s * 0.36} textAnchor="middle" fill="#fff" fontSize={s} fontWeight={600} fontFamily="Helvetica, Arial, sans-serif">
        {text}
      </text>
    </g>
  )
}

function MeasureShape({ a, cal, upright, scale }: { a: PdfAnnot; cal: PdfCalibration; upright: number; scale: number }) {
  const p = pairs(a.pts)
  const m = measure(a, cal)
  const size = a.size ?? 10
  if (a.kind === 'count') {
    const r = size
    return (
      <g opacity={a.opacity}>
        {p.map((q, i) => (
          <g key={i}>
            <circle cx={q[0]} cy={q[1]} r={r} fill={a.color} fillOpacity={0.9} stroke="#fff" strokeWidth={r * 0.18} />
            <g transform={`translate(${q[0]},${q[1]}) rotate(${upright}) scale(1,-1)`}>
              <text x={0} y={r * 0.38} textAnchor="middle" fontSize={r * (i + 1 > 99 ? 0.8 : 1.05)} fontWeight={700} fill="#fff" fontFamily="Helvetica, Arial, sans-serif">
                {i + 1}
              </text>
            </g>
          </g>
        ))}
      </g>
    )
  }
  if (p.length < 2) return null
  if (a.kind === 'area') {
    const c = centroid(p)
    return (
      <g>
        <polygon points={p.map((q) => q.join(',')).join(' ')} fill={a.fill ?? a.color} fillOpacity={0.16} stroke={a.color} strokeWidth={a.width} strokeLinejoin="round" opacity={a.opacity} />
        {p.map((q, i) => (
          <circle key={i} cx={q[0]} cy={q[1]} r={a.width * 1.2} fill={a.color} />
        ))}
        {m && p.length > 2 && <Label at={c} text={m.label} angle={upright} size={size} color={a.color} scale={scale} />}
      </g>
    )
  }
  // Length / polylength: dimension line with end ticks and a centered label.
  const tick = Math.max(4, size * 0.6)
  const ticks = [p[0], p[p.length - 1]].map((q, i) => {
    const o = i === 0 ? p[1] : p[p.length - 2]
    const ang = Math.atan2(o[1] - q[1], o[0] - q[0]) + Math.PI / 2
    return `M${q[0] - Math.cos(ang) * tick},${q[1] - Math.sin(ang) * tick}L${q[0] + Math.cos(ang) * tick},${q[1] + Math.sin(ang) * tick}`
  })
  let mid: Pt
  if (p.length === 2) mid = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]
  else {
    const i = Math.floor((p.length - 1) / 2)
    mid = [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2]
  }
  return (
    <g opacity={a.opacity}>
      <polyline points={p.map((q) => q.join(',')).join(' ')} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinejoin="round" />
      <path d={ticks.join('')} stroke={a.color} strokeWidth={a.width} strokeLinecap="round" />
      {m && <Label at={mid} text={m.label} angle={upright} size={size} color={a.color} scale={scale} />}
    </g>
  )
}
