import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Spinner } from '@/components/ui/button'

/**
 * Reads a QR code with the camera, inside the app. Needed on iPhone, where a Home Screen
 * app has its own storage and the system camera would open links in Safari instead.
 * Uses the native BarcodeDetector when present, otherwise jsQR (loaded on demand).
 */
export function ScanCode({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let alive = true
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
      } catch {
        setError('Camera access was blocked. Allow the camera for this site, or use Paste link.')
        return
      }
      if (!alive || !video.current) return
      video.current.srcObject = stream
      await video.current.play().catch(() => {})
      setReady(true)
      type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
      const detector = BD ? new BD({ formats: ['qr_code'] }) : null
      const jsQR = detector ? null : (await import('jsqr')).default
      const tick = async () => {
        if (!alive) return
        const v = video.current
        if (v && v.readyState >= 2) {
          let text: string | null = null
          if (detector) text = (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null
          else if (jsQR && ctx) {
            const w = (canvas.width = Math.min(800, v.videoWidth))
            const h = (canvas.height = Math.round((v.videoHeight / v.videoWidth) * w))
            ctx.drawImage(v, 0, 0, w, h)
            text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
          }
          if (text) {
            alive = false
            navigator.vibrate?.(30)
            onResult(text)
            return
          }
        }
        raf = requestAnimationFrame(() => void tick())
      }
      void tick()
    })()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-black" data-testid="scan-code">
      <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center text-[13px] text-white/80">
          <span className="flex items-center gap-2">
            <Spinner className="size-4" /> Starting camera…
          </span>
        </div>
      )}
      {ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="size-[58%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-white">
          <div>
            <Camera className="mx-auto mb-2 size-5" />
            {error}
          </div>
        </div>
      )}
      <button type="button" onClick={onClose} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white" aria-label="Close camera">
        <X className="size-4" />
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center text-[12px] text-white/90">Point at the code in Settings → Devices on your computer</div>
    </div>
  )
}
