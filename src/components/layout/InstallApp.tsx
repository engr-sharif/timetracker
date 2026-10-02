import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Download, Share, SquarePlus, X } from 'lucide-react'
import { isIOS, isMobile, isStandalone, usePwa } from '@/lib/pwa'
import { storageEstimate } from '@/lib/files'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const DISMISS = 'wb.installDismissed'

/** iOS has no install prompt: show exactly where the buttons are. */
export function IosInstallSteps({ compact }: { compact?: boolean }) {
  return (
    <ol className={compact ? 'space-y-1.5 text-[12.5px]' : 'space-y-2 text-[13px]'}>
      <li className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">1</span>
        In Safari, tap <Share className="inline size-4 text-accent-strong" aria-label="Share" /> <b>Share</b>
      </li>
      <li className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">2</span>
        Choose <SquarePlus className="inline size-4 text-accent-strong" aria-label="Add" /> <b>Add to Home Screen</b>
      </li>
      <li className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-strong">3</span>
        Open Workbench from the Home Screen and sign in (Scan code is quickest)
      </li>
    </ol>
  )
}

/** Small banner on Home for phones that aren't using the installed app yet. */
export function InstallBanner() {
  const { prompt, installed, install } = usePwa()
  const [hidden, setHidden] = useState(() => {
    try {
      return !!localStorage.getItem(DISMISS)
    } catch {
      return false
    }
  })
  const show = !hidden && !installed && isMobile() && (prompt || isIOS())
  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS, '1')
    } catch {
      /* ignore */
    }
  }
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} className="relative mb-5 overflow-hidden rounded-2xl border border-accent/30 bg-accent-soft/50 p-4" data-testid="install-banner">
          <button onClick={dismiss} className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Dismiss">
            <X className="size-4" />
          </button>
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
            <img src="./apple-touch-icon.png" alt="" className="size-7 rounded-lg" /> Install Workbench on your phone
          </div>
          <p className="mb-3 text-[12.5px] text-muted">Full screen, its own icon, opens offline, and keeps your screen awake while you read.</p>
          {prompt ? (
            <Button variant="primary" size="sm" icon={<Download className="size-3.5" />} onClick={() => void install()}>
              Install app
            </Button>
          ) : (
            <IosInstallSteps compact />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Settings → App */
export function AppSection() {
  const { prompt, installed, install } = usePwa()
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void storageEstimate().then(setUsage)
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])
  const standalone = isStandalone()
  return (
    <section id="app" className="scroll-mt-6 rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur-sm">
      <h2 className="text-[15px] font-semibold tracking-tight">App</h2>
      <p className="mt-1 text-[13px] text-muted">Install Workbench to your Home Screen or dock for a full-screen app that opens offline.</p>
      <div className="mt-5 space-y-4">
        {standalone || installed ? (
          <div className="flex items-center gap-2 text-[13.5px]">
            <CheckCircle2 className="size-4 text-success" /> {standalone ? 'You’re using the installed app.' : 'Installed.'}
          </div>
        ) : prompt ? (
          <Button variant="primary" icon={<Download className="size-4" />} onClick={() => void install()}>
            Install Workbench
          </Button>
        ) : isIOS() ? (
          <IosInstallSteps />
        ) : (
          <p className="text-[13px] text-subtle">Use your browser’s menu → <b>Install app</b> (Chrome, Edge) or <b>Add to Dock</b> (Safari on Mac).</p>
        )}
        <div className="grid gap-2 text-[12.5px] text-muted sm:grid-cols-2">
          <div className="rounded-xl bg-surface-2/50 p-3">
            <div className="font-medium text-fg">Works offline</div>
            Screens, PDFs and OCR you’ve opened once keep working without a connection; sync catches up when you’re back.
          </div>
          <div className="rounded-xl bg-surface-2/50 p-3">
            <div className="font-medium text-fg">Share to Workbench</div>
            {isIOS() ? 'On iPhone, use Files → Share → Save, then open it from Speed Reader or PDF Studio.' : 'Share PDFs, books, documents or articles from other apps straight into Workbench.'}
          </div>
        </div>
        {usage && (
          <p className="text-xs text-subtle">
            Using {formatBytes(usage.usage)} of storage{persisted ? ' · protected from automatic clean-up' : persisted === false ? ' · the browser may clear it if the device runs low on space — installing the app helps' : ''}.
          </p>
        )}
      </div>
    </section>
  )
}
