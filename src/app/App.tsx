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
