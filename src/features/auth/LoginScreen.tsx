import { useState } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react'
import { greeting } from '@/lib/dates'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Avatar, Switch } from '@/components/ui/misc'
import { confirm, ConfirmHost } from '@/components/ui/dialog'
import { AuthCard, AuthLayout } from './AuthLayout'

export function LoginScreen() {
  const { account, legacy, unlock, resetEverything } = useAuth()
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const shake = useAnimationControls()

  const name = account?.name ?? legacy?.name ?? 'there'
  const first = name.split(' ')[0]

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    const ok = await unlock(password, remember)
    if (!ok) {
      setBusy(false)
      setError('That password didn’t match.')
      setPassword('')
      shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.45 } })
    }
  }

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset this device?',
      body: 'This signs you out and deletes all Workbench data stored in this browser. Data already synced to your GitHub gist is not touched.',
      confirmLabel: 'Erase local data',
      danger: true,
    })
    if (ok) await resetEverything()
  }

  return (
    <AuthLayout>
      <AuthCard>
        <motion.div animate={shake}>
          <div className="flex flex-col items-center text-center">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }} className="relative">
              <div className="absolute inset-0 scale-125 rounded-full bg-accent/30 blur-xl" />
              <Avatar name={name} hue={account?.color} src={account?.avatar ?? legacy?.avatar} size={72} className="relative ring-4 ring-surface" />
            </motion.div>
            <p className="mt-5 text-sm text-muted">{greeting()},</p>
            <h1 className="font-serif text-[40px] leading-none tracking-tight">{first}</h1>
            {legacy && (
              <p className="mt-4 rounded-xl border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-muted">
                <span className="font-medium text-fg">TimeTracker is now Workbench.</span> Sign in with your existing password — your projects and hours
                will be carried over automatically.
              </p>
            )}
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="group relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle transition-colors group-focus-within:text-accent-strong" />
              <input
                autoFocus
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
                placeholder="Password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-border-strong bg-surface-2/70 pr-11 pl-10 text-[15px] transition-[border-color,box-shadow] outline-none focus:border-accent/60 focus:shadow-[0_0_0_4px_var(--accent-soft)]"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-subtle hover:text-fg"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <motion.p initial={false} animate={{ height: error ? 'auto' : 0, opacity: error ? 1 : 0 }} className="overflow-hidden text-[13px] text-danger">
              {error}
            </motion.p>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <Switch checked={remember} onChange={setRemember} label="Stay signed in" />
                Stay signed in for 14 days
              </label>
            </div>
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!password} iconRight={!busy && <ArrowRight className="size-4" />}>
              {busy ? 'Unlocking' : 'Unlock workspace'}
            </Button>
          </form>
        </motion.div>
        <button onClick={reset} className="mt-6 w-full text-center text-xs text-subtle transition-colors hover:text-danger">
          Forgot password? Reset this device
        </button>
      </AuthCard>
      <ConfirmHost />
    </AuthLayout>
  )
}
