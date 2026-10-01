import { create } from 'zustand'

export type ReaderMode = 'focus' | 'flow' | 'listen'
export type ReaderTheme = 'app' | 'paper' | 'sepia' | 'night' | 'contrast'
export type ReaderFont = 'sans' | 'serif' | 'mono' | 'legible'
export type Haptics = 'off' | 'sentences' | 'words'

export interface ReaderPrefs {
  wpm: number
  /** vary time per word by length and punctuation */
  smart: boolean
  /** sentence-end dwell multiplier */
  sentence: number
  /** paragraph-end dwell multiplier */
  paragraph: number
  /** words per flash in focus mode */
  chunk: 1 | 2 | 3
  mode: ReaderMode
  theme: ReaderTheme
  font: ReaderFont
  /** text scale, 0.6–2.4 */
  size: number
  /** focus guides above/below the pivot letter */
  guides: boolean
  /** start a little slower after each pause */
  ramp: boolean
  /** resuming backs up to the start of the sentence */
  rewind: boolean
  /** faint previous/next words either side */
  ghosts: boolean
  haptics: Haptics
  voice: string
  /** speed training: +10 wpm each minute of reading, up to trainTarget */
  train: boolean
  trainTarget: number
  /** show the bottom controls while playing (otherwise they hide until you move) */
  pinControls: boolean
}

const KEY = 'wb.reader'
export const READER_DEFAULTS: ReaderPrefs = {
  wpm: 350,
  smart: true,
  sentence: 1.9,
  paragraph: 1.6,
  chunk: 1,
  mode: 'focus',
  theme: 'app',
  font: 'sans',
  size: 1,
  guides: true,
  ramp: true,
  rewind: true,
  ghosts: false,
  haptics: 'off',
  voice: '',
  pinControls: false,
  train: false,
  trainTarget: 500,
}

const load = (): ReaderPrefs => {
  try {
    return { ...READER_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return READER_DEFAULTS
  }
}

export const useReaderPrefs = create<ReaderPrefs & { set: (p: Partial<ReaderPrefs>) => void }>((set, get) => ({
  ...load(),
  set(patch) {
    if (patch.wpm !== undefined) patch.wpm = Math.round(Math.min(1500, Math.max(60, patch.wpm)))
    if (patch.size !== undefined) patch.size = Math.min(2.4, Math.max(0.6, +patch.size.toFixed(2)))
    set(patch)
    const { set: _s, ...prefs } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* storage full or blocked */
    }
  },
}))

export const readerPrefs = () => useReaderPrefs.getState()

export const FONTS: Record<ReaderFont, { label: string; family: string }> = {
  sans: { label: 'Sans', family: 'var(--font-sans)' },
  serif: { label: 'Serif', family: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Charter, Georgia, ui-serif, serif" },
  mono: { label: 'Mono', family: 'var(--font-mono)' },
  legible: { label: 'Legible', family: "'Atkinson Hyperlegible', Verdana, Tahoma, 'Segoe UI', ui-sans-serif, sans-serif" },
}

/** Colour sets for the reading surface; "app" follows the Workbench theme. */
export const THEMES: Record<ReaderTheme, { label: string; vars: Record<string, string> }> = {
  app: { label: 'Workbench', vars: { '--rd-bg': 'var(--bg)', '--rd-fg': 'var(--fg)', '--rd-muted': 'var(--fg-subtle)', '--rd-pivot': 'var(--accent-strong)', '--rd-line': 'var(--border-strong)', '--rd-mark': 'color-mix(in oklch, var(--accent) 22%, transparent)' } },
  paper: { label: 'Paper', vars: { '--rd-bg': 'oklch(0.975 0.008 85)', '--rd-fg': 'oklch(0.24 0.01 60)', '--rd-muted': 'oklch(0.58 0.015 70)', '--rd-pivot': 'oklch(0.56 0.2 28)', '--rd-line': 'oklch(0.84 0.015 75)', '--rd-mark': 'oklch(0.9 0.09 90 / 0.7)' } },
  sepia: { label: 'Sepia', vars: { '--rd-bg': 'oklch(0.92 0.035 80)', '--rd-fg': 'oklch(0.3 0.04 55)', '--rd-muted': 'oklch(0.55 0.04 60)', '--rd-pivot': 'oklch(0.52 0.17 35)', '--rd-line': 'oklch(0.78 0.04 70)', '--rd-mark': 'oklch(0.82 0.08 70 / 0.8)' } },
  night: { label: 'Night', vars: { '--rd-bg': 'oklch(0.16 0.005 260)', '--rd-fg': 'oklch(0.86 0.02 80)', '--rd-muted': 'oklch(0.5 0.01 260)', '--rd-pivot': 'oklch(0.72 0.16 45)', '--rd-line': 'oklch(0.3 0.01 260)', '--rd-mark': 'oklch(0.45 0.08 60 / 0.55)' } },
  contrast: { label: 'High contrast', vars: { '--rd-bg': '#000', '--rd-fg': '#fff', '--rd-muted': '#9a9a9a', '--rd-pivot': '#ffd400', '--rd-line': '#555', '--rd-mark': 'rgba(255, 212, 0, 0.35)' } },
}
