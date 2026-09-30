import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Cloud, ExternalLink, HardDrive, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { validateToken, type GithubUser } from '@/lib/gist'
import { useAuth } from '@/store/auth'
import type { Hue } from '@/store/types'
import { seedStarter, seedSample } from '@/lib/seed'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Avatar, HuePicker, Switch } from '@/components/ui/misc'
import { AuthCard, AuthLayout } from './AuthLayout'

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Workbench%20sync'

function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(4, s)
}

export function Onboarding() {
  const createAccount = useAuth((s) => s.createAccount)
  const setSync = useAuth((s) => s.setSync)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [color, setColor] = useState<Hue>('violet')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [token, setToken] = useState('')
  const [gh, setGh] = useState<GithubUser | null>(null)
  const [tokenError, setTokenError] = useState('')
  const [checking, setChecking] = useState(false)
  const [sample, setSample] = useState(false)
  const [busy, setBusy] = useState(false)

  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }

  const pwScore = strength(password)
  const canNext = [name.trim().length > 0, password.length >= 6 && password === confirmPw, true][step]

  const checkToken = async () => {
    setChecking(true)
    setTokenError('')
    try {
      setGh(await validateToken(token.trim()))
    } catch (e) {
      setGh(null)
      setTokenError(e instanceof Error ? e.message : 'Could not verify token')
    }
    setChecking(false)
  }

  const finish = async () => {
    setBusy(true)
    if (gh && token) setSync({ token: token.trim(), login: gh.login, avatar: gh.avatar_url })
    if (sample) seedSample()
    else seedStarter()
    await createAccount({ name: name.trim(), title: title.trim(), company: company.trim(), color, password, remember })
  }

  const steps = ['You', 'Security', 'Sync']

  return (
    <AuthLayout>
      <AuthCard>
        <div className="mb-7 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col gap-1.5">
              <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
              </div>
              <span className={cn('text-[11px] font-medium transition-colors', i <= step ? 'text-fg' : 'text-subtle')}>{s}</span>
            </div>
          ))}
        </div>

        <div className="relative min-h-[360px]">
          <AnimatePresence mode="popLayout" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={{
                enter: (d: number) => ({ x: d * 40, opacity: 0, filter: 'blur(4px)' }),
                center: { x: 0, opacity: 1, filter: 'blur(0px)' },
                exit: (d: number) => ({ x: d * -40, opacity: 0, filter: 'blur(4px)' }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-serif text-[34px] leading-[1.05] tracking-tight">
                      Your work, in one <em className="text-accent-strong">calm</em> place.
                    </h1>
                    <p className="mt-2 text-sm text-muted">Projects, hours, tasks, notes and sketches — together. Let’s set you up.</p>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/50 p-3">
                    <Avatar name={name || '?'} hue={color} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{name || 'Your name'}</div>
                      <div className="truncate text-xs text-subtle">{[title, company].filter(Boolean).join(' · ') || 'Role · Company'}</div>
                    </div>
                  </div>
                  <Field label="Full name">
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" onKeyDown={(e) => e.key === 'Enter' && canNext && go(1)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Role">
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Civil Engineer" />
                    </Field>
                    <Field label="Company">
                      <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                  <Field label="Colour">
                    <HuePicker value={color} onChange={setColor} />
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-serif text-[34px] leading-[1.05] tracking-tight">Lock it down.</h1>
                    <p className="mt-2 text-sm text-muted">This password unlocks Workbench on this device. It never leaves your browser.</p>
                  </div>
                  <Field label="Password">
                    <Input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                  </Field>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        className="h-1 flex-1 rounded-full"
                        animate={{
                          backgroundColor:
                            i < pwScore ? ['var(--danger)', 'var(--warning)', 'var(--warning)', 'var(--success)'][pwScore - 1] : 'var(--surface-3)',
                        }}
                      />
                    ))}
                  </div>
                  <Field label="Confirm password" error={confirmPw && confirmPw !== password ? 'Passwords don’t match' : undefined}>
                    <Input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      autoComplete="new-password"
                      onKeyDown={(e) => e.key === 'Enter' && canNext && go(2)}
                    />
                  </Field>
                  <label className="flex items-center gap-2.5 text-[13px] text-muted">
                    <Switch checked={remember} onChange={setRemember} label="Stay signed in" />
                    Stay signed in on this device for 14 days
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h1 className="font-serif text-[34px] leading-[1.05] tracking-tight">Everywhere you work.</h1>
                    <p className="mt-2 text-sm text-muted">
                      Workbench saves to this browser instantly. Connect GitHub to sync through a private gist you own — optional.
                    </p>
                  </div>
                  <div className="space-y-2.5 rounded-2xl border border-border bg-surface-2/40 p-3.5">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <Cloud className="size-4 text-accent-strong" /> GitHub gist sync
                    </div>
                    {gh ? (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 rounded-xl bg-success/10 p-2.5">
                        <Avatar name={gh.login} src={gh.avatar_url} size={28} />
                        <div className="flex-1 text-[13px]">
                          Connected as <span className="font-semibold">{gh.login}</span>
                        </div>
                        <Check className="size-4 text-success" />
                      </motion.div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… or github_pat_…" type="password" className="flex-1 font-mono" />
                          <Button onClick={checkToken} loading={checking} disabled={!token.trim()}>
                            Verify
                          </Button>
                        </div>
                        {tokenError && <p className="text-xs text-danger">{tokenError}</p>}
                        <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-strong hover:underline">
                          Create a token with the “gist” scope <ExternalLink className="size-3" />
                        </a>
                      </>
                    )}
                  </div>
                  {!gh && (
                    <div className="flex items-center gap-2 text-xs text-subtle">
                      <HardDrive className="size-3.5" /> You can skip this and connect later in Settings.
                    </div>
                  )}
                  <label className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface-2/40 p-3.5 text-[13px]">
                    <Sparkles className="size-4 text-warning" />
                    <span className="flex-1">
                      <span className="font-medium">Start with sample data</span>
                      <span className="block text-xs text-subtle">A few demo projects and tasks to explore. Delete anytime.</span>
                    </span>
                    <Switch checked={sample} onChange={setSample} label="Sample data" />
                  </label>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button variant="primary" iconRight={<ArrowRight className="size-4" />} disabled={!canNext} onClick={() => go(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" loading={busy} iconRight={<ArrowRight className="size-4" />} onClick={finish}>
              Enter Workbench
            </Button>
          )}
        </div>
      </AuthCard>
    </AuthLayout>
  )
}
