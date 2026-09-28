import { create } from 'zustand'

export type CaptureKind = 'task' | 'time' | 'idea' | 'note' | 'event'

interface UIState {
  paletteOpen: boolean
  capture: { kind: CaptureKind; preset?: Record<string, unknown> } | null
  /** id of a task open in the detail sheet */
  taskId: string | null
  mobileNavOpen: boolean
  openPalette: (v?: boolean) => void
  openCapture: (kind: CaptureKind, preset?: Record<string, unknown>) => void
  closeCapture: () => void
  openTask: (id: string | null) => void
  setMobileNav: (v: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  paletteOpen: false,
  capture: null,
  taskId: null,
  mobileNavOpen: false,
  openPalette: (v = true) => set({ paletteOpen: v }),
  openCapture: (kind, preset) => set({ capture: { kind, preset }, paletteOpen: false }),
  closeCapture: () => set({ capture: null }),
  openTask: (id) => set({ taskId: id }),
  setMobileNav: (v) => set({ mobileNavOpen: v }),
}))
