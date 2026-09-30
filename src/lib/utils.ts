import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Hue } from '@/store/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(prefix = '') {
  const rand = crypto.getRandomValues(new Uint8Array(8))
  const s = Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
  return prefix + Date.now().toString(36) + s
}

export const nowIso = () => new Date().toISOString()

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function formatHours(h: number, digits = 2) {
  const fixed = Number.isInteger(h) ? h.toString() : h.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')
  return fixed
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function pluralize(n: number, word: string, plural = word + 's') {
  return `${n} ${n === 1 ? word : plural}`
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function download(filename: string, data: Blob | string, type = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Lightweight fuzzy match: every query char appears in order. Returns score (higher better) or -1. */
export function fuzzy(query: string, text: string) {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0) return 1000 - direct
  let ti = 0
  let score = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return -1
    score += found === ti ? 3 : 1
    ti = found + 1
  }
  return score
}

/* ------------------------------------------------------------------ */
/*  Colour palette used for projects, people, ideas                    */
/* ------------------------------------------------------------------ */

export const HUES: Record<Hue, number> = {
  violet: 285,
  blue: 255,
  sky: 225,
  teal: 190,
  emerald: 160,
  lime: 128,
  amber: 78,
  orange: 50,
  rose: 15,
  pink: 350,
  slate: 260,
}

export const HUE_LIST = Object.keys(HUES) as Hue[]

/** Returns CSS colour strings for a hue that read well in both themes. */
export function hueColor(h: Hue | undefined, alpha = 1) {
  const hue = HUES[h ?? 'violet']
  const chroma = h === 'slate' ? 0.03 : 0.16
  return `oklch(0.7 ${chroma} ${hue} / ${alpha})`
}

export function hueVars(h: Hue | undefined): React.CSSProperties {
  return {
    '--hue': hueColor(h),
    '--hue-soft': hueColor(h, 0.14),
    '--hue-border': hueColor(h, 0.3),
  } as React.CSSProperties
}

export function randomHue(): Hue {
  const pool = HUE_LIST.filter((h) => h !== 'slate')
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Deterministic hue from a string (for people without a colour). */
export function hashHue(s: string): Hue {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  const pool = HUE_LIST.filter((x) => x !== 'slate')
  return pool[Math.abs(h) % pool.length]
}

export function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

export const modKey = () => (isMac() ? '⌘' : 'Ctrl')
