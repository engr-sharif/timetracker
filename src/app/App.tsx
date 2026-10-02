import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Toaster } from 'sonner'
import { useAuth } from '@/store/auth'
import { resolveTheme, usePrefs } from '@/store/prefs'
import { startSyncEngine } from '@/store/sync'
import { startCloudEngine } from '@/store/cloud'
import { requestPersistence } from '@/lib/files'
import { ConfirmHost } from '@/components/ui/dialog'
import { LoginScreen } from '@/features/auth/LoginScreen'
import { Onboarding } from '@/features/auth/Onboarding'
import { router } from './router'
import { toast } from 'sonner'
import { clearPendingLink, linkCaptureResult, pendingLink } from '@/lib/link'
import { useCloud } from '@/store/cloud'
import { readCloudConfig } from '@/lib/supabase'

export function App() {
  const status = useAuth((s) => s.status)
  const theme = usePrefs((s) => s.theme)

  useEffect(() => {
    if (status !== 'unlocked') return
    void requestPersistence()
    const stopGist = startSyncEngine()
    const stopCloud = startCloudEngine()
    return () => {
      stopGist()
      stopCloud()
    }
  }, [status])

  useEffect(() => {
    // An installed iPhone app may relaunch from an old hand-off address; only a new device cares.
    if (useAuth.getState().status !== 'setup') return
    if (linkCaptureResult === 'expired') toast.error('That device link has expired', { description: 'Make a new one in Settings → Devices on your other device.' })
    if (linkCaptureResult === 'invalid') toast.error('That device link is damaged', { description: 'Make a new one in Settings → Devices on your other device.' })
  }, [])

  // A link opened on a device that's already set up: offer to add the missing sync.
  useEffect(() => {
    if (status !== 'unlocked') return
    const p = pendingLink()
    if (!p) return
    clearPendingLink()
    const auth = useAuth.getState()
    const addGist = p.gist && !auth.sync
    const addCloud = p.cloud && !readCloudConfig()
    if (!addGist && !addCloud) return
    toast('Link this device?', {
      description: [addGist && `GitHub sync (${p.gist!.login ?? 'gist'})`, addCloud && 'Workbench Cloud'].filter(Boolean).join(' and '),
      duration: 30_000,
      action: {
        label: 'Link',
        onClick: () => {
          if (addGist) auth.setSync({ token: p.gist!.token, login: p.gist!.login, avatar: p.gist!.avatar, gistId: p.gist!.gistId })
          if (addCloud) useCloud.getState().connect(p.cloud!)
          toast.success(addCloud ? 'Linked — sign in to Cloud in Settings to finish' : 'Linked — syncing now')
        },
      },
    })
  }, [status])

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {status === 'setup' && <Onboarding key="setup" />}
        {status === 'locked' && <LoginScreen key="locked" />}
        {status === 'unlocked' && (
          <motion.div
            key="app"
            className="h-dvh"
            initial={{ opacity: 0, scale: 0.985, filter: 'blur(6px)' }}
            // Drop filter/transform once settled: either would make this the containing
            // block for fixed-position descendants and let them widen the document.
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none', transform: 'none' } }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <RouterProvider router={router} />
            <ConfirmHost />
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster
        position="bottom-right"
        theme={resolveTheme(theme)}
        gap={8}
        toastOptions={{
          classNames: {
            toast: '!bg-surface-2 !border-border-strong !text-fg !rounded-xl !shadow-float !font-sans',
            description: '!text-muted',
            actionButton: '!bg-accent !text-accent-fg !rounded-md',
          },
        }}
      />
    </MotionConfig>
  )
}
