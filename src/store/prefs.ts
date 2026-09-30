import { create } from 'zustand'
import { flushSync } from 'react-dom'

export type ThemePref = 'dark' | 'light' | 'system'
export type Accent = 'violet' | 'blue' | 'teal' | 'emerald' | 'amber' | 'orange' | 'rose'

interface Prefs {
  theme: ThemePref
  accent: Accent
  sidebarCollapsed: boolean
  tasksView: 'board' | 'list'
  calendarView: 'month' | 'week'
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void
  /** Changes theme with a circular reveal from the given point (View Transitions API). */
  setTheme: (theme: ThemePref, origin?: { x: number; y: number }) => void
}

const KEY = 'wb.prefs'
const defaults: Prefs = { theme: 'dark', accent: 'violet', sidebarCollapsed: false, tasksView: 'board', calendarView: 'month' }

const load = (): Prefs => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

export const resolveTheme = (t: ThemePref) =>
  t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t

function apply(p: Prefs) {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(p.theme)
  root.dataset.accent = p.accent
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch)
    const { set: _s, setTheme: _t, ...prefs } = get()
    localStorage.setItem(KEY, JSON.stringify(prefs))
    apply(prefs)
  },
  setTheme(theme, origin) {
    const change = () => flushSync(() => get().set({ theme }))
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduced || resolveTheme(theme) === document.documentElement.dataset.theme) {
      change()
      return
    }
    const x = origin?.x ?? innerWidth / 2
    const y = origin?.y ?? innerHeight / 2
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const root = document.documentElement
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-r', `${r}px`)
    doc.startViewTransition(change)
  },
}))

apply(usePrefs.getState())
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => apply(usePrefs.getState()))
