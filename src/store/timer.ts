import { create } from 'zustand'

export interface RunningTimer {
  startedAt: number
  /** ms banked from previous run segments (pause/resume) */
  banked: number
  paused: boolean
  projectId?: string
  costCode?: string
  taskId?: string
  description: string
}

interface TimerState {
  timer: RunningTimer | null
  start: (init?: Partial<Omit<RunningTimer, 'startedAt' | 'banked' | 'paused'>>) => void
  pause: () => void
  resume: () => void
  patch: (p: Partial<RunningTimer>) => void
  /** Stops the timer and returns the elapsed milliseconds + context. */
  stop: () => (RunningTimer & { elapsed: number }) | null
  discard: () => void
}

const KEY = 'wb.timer'
const persist = (t: RunningTimer | null) =>
  t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY)

export const elapsedOf = (t: RunningTimer | null) =>
  t ? t.banked + (t.paused ? 0 : Date.now() - t.startedAt) : 0

export const useTimer = create<TimerState>((set, get) => {
  const commit = (timer: RunningTimer | null) => {
    persist(timer)
    set({ timer })
  }
  return {
    timer: (() => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? 'null')
      } catch {
        return null
      }
    })(),
    start(init) {
      commit({ startedAt: Date.now(), banked: 0, paused: false, description: '', ...init })
    },
    pause() {
      const t = get().timer
      if (!t || t.paused) return
      commit({ ...t, banked: elapsedOf(t), paused: true })
    },
    resume() {
      const t = get().timer
      if (!t || !t.paused) return
      commit({ ...t, startedAt: Date.now(), paused: false })
    },
    patch(p) {
      const t = get().timer
      if (t) commit({ ...t, ...p })
    },
    stop() {
      const t = get().timer
      if (!t) return null
      commit(null)
      return { ...t, elapsed: elapsedOf(t) }
    },
    discard() {
      commit(null)
    },
  }
})
