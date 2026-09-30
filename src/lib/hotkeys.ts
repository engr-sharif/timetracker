import { useEffect, useRef } from 'react'

export function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('.excalidraw')
}

type Binding = { combo: string; handler: (e: KeyboardEvent) => void; allowInInputs?: boolean }

/**
 * Tiny hotkey hook. Combos: "mod+k", "shift+?", "c", and two-key chords like "g t".
 * `mod` maps to ⌘ on macOS and Ctrl elsewhere.
 */
export function useHotkeys(bindings: Binding[]) {
  const ref = useRef(bindings)
  ref.current = bindings

  useEffect(() => {
    let chord: string | null = null
    let chordTimer: ReturnType<typeof setTimeout> | undefined

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const typing = isTypingTarget(e.target)
      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey

      for (const b of ref.current) {
        if (typing && !b.allowInInputs) continue
        const parts = b.combo.split(' ')
        if (parts.length === 2) {
          if (!mod && chord === parts[0] && key === parts[1]) {
            e.preventDefault()
            chord = null
            b.handler(e)
            return
          }
          continue
        }
        const tokens = b.combo.split('+')
        const want = tokens[tokens.length - 1]
        const needMod = tokens.includes('mod')
        const needShift = tokens.includes('shift')
        const shiftOk = /^[a-z]$/.test(want) ? needShift === e.shiftKey : !needShift || e.shiftKey
        if (key === want && needMod === mod && shiftOk && !e.altKey) {
          e.preventDefault()
          b.handler(e)
          return
        }
      }

      if (!typing && !mod && ref.current.some((b) => b.combo.startsWith(key + ' '))) {
        chord = key
        clearTimeout(chordTimer)
        chordTimer = setTimeout(() => (chord = null), 900)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
