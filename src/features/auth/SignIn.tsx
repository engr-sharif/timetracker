import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Cloud, Mail, QrCode, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { findGist, readGistDoc, validateToken, type GithubUser } from '@/lib/gist'
import { clearPendingLink, gistLoginName, pendingLink, rememberLogin, type LinkPayload } from '@/lib/link'
import { probeCloud, readCloudConfig } from '@/lib/supabase'
import { migrateV3 } from '@/lib/migrate'
import { useAuth } from '@/store/auth'
import { useCloud } from '@/store/cloud'
import { useSync } from '@/store/sync'
import { normalizeDoc } from '@/store/workspace'
import type { Hue, WorkspaceDoc } from '@/store/types'
import { Button } from '@/components/ui/button'
import { GithubMark } from '@/components/ui/icons'
import { Field, Input } from '@/components/ui/field'
import { Avatar, Switch } from '@/components/ui/misc'
import { AuthCard, AuthLayout } from './AuthLayout'

/**
 * Sign in on a new device: pull an existing workspace (by a link from another device,
 * the GitHub sync key from saved passwords, or Workbench Cloud), then lock this device.
 */

const SIGNIN_FLAG = 'wb.signin'
export const signInPending = () => sessionStorage.getItem(SIGNIN_FLAG) === '1' || !!pendingLink()

interface Found {
  gist?: { token: string; user: GithubUser; gistId: string | null; counts: string | null }
  cloudEmail?: string
}

function summarize(doc: WorkspaceDoc | null) {
  if (!doc) return null
  const n = (k: keyof WorkspaceDoc['tables']) => Object.keys(doc.tables[k] ?? {}).length
  const parts = [
    [n('projects'), 'project'],
    [n('entries'), 'time entry', 'time entries'],
    [n('tasks'), 'task'],
    [n('notes'), 'note'],
  ] as [number, string, string?][]
  const text = parts.filter(([c]) => c > 0).map(([c, w, pl]) => `${c} ${c === 1 ? w : (pl ?? w + 's')}`)
  return text.length ? text.join(' · ') : 'An empty workspace'
}

export function SignIn({ onBack }: { onBack: () => void }) {
  const createAccount = useAuth((s) => s.createAccount)
  const setSync = useAuth((s) => s.setSync)
  const cloudUser = useCloud((s) => s.user)
  const cloudConfigured = useCloud((s) => s.configured)
  const link = useMemo<LinkPayload | null>(() => pendingLink(), [])

  const [found, setFound] = useState<Found>({})
  const [stage, setStage] = useState<'choose' | 'device'>('choose')
  const [dir, setDir] = useState(1)

  useEffect(() => {
    sessionStorage.setItem(SIGNIN_FLAG, '1')
  }, [])

  // A Cloud sign-in (including one finishing after an OAuth/email-link redirect) moves us on.
  useEffect(() => {
    if (cloudUser && !found.cloudEmail) {
      setFound((f) => ({ ...f, cloudEmail: cloudUser.email ?? 'your account' }))
      go('device')
    }
  }, [cloudUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // A link from another device also carries the Cloud project, so Cloud sign-in is one tap away.
  useEffect(() => {
    if (link?.cloud && !readCloudConfig()) useCloud.getState().connect(link.cloud)
  }, [link])

  const go = (s: typeof stage) => {
    setDir(s === 'device' ? 1 : -1)
    setStage(s)
  }

  return (
    <AuthLayout>
      <AuthCard>
        <div className="relative min-h-[420px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: dir * 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: dir * -10 }}
              transition={{ duration: 0.18 }}
            >
              {stage === 'choose' ? (
                <Choose
                  link={link}
                  cloudConfigured={cloudConfigured}
                  onGist={(g) => {
                    setFound((f) => ({ ...f, gist: g }))
                    go('device')
                  }}
                  onBack={() => {
                    sessionStorage.removeItem(SIGNIN_FLAG)
                    clearPendingLink()
                    onBack()
                  }}
                />
              ) : (
                <LockDevice
                  found={found}
                  link={link}
                  onBack={() => go('choose')}
                  onDone={async ({ name, password, remember }) => {
                    if (found.gist) {
                      setSync({ token: found.gist.token, login: found.gist.user.login, avatar: found.gist.user.avatar_url, gistId: found.gist.gistId ?? undefined })
                    }
                    sessionStorage.removeItem(SIGNIN_FLAG)
                    clearPendingLink()
                    await createAccount({
                      name,
                      password,
                      remember,
                      title: link?.profile?.title,
                      company: link?.profile?.company,
                      color: (link?.profile?.color ?? 'violet') as Hue,
                      email: found.cloudEmail,
                    })
                    if (found.gist) void useSync.getState().syncNow()
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </AuthCard>
    </AuthLayout>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 1: find the workspace                                         */
/* ------------------------------------------------------------------ */

function Choose({ link, cloudConfigured, onGist, onBack }: { link: LinkPayload | null; cloudConfigured: boolean; onGist: (g: NonNullable<Found['gist']>) => void; onBack: () => void }) {
  const [username, setUsername] = useState(link?.gist ? gistLoginName(link.gist.login) : '')
  const [token, setToken] = useState(link?.gist?.token ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<'gist' | 'cloud' | null>(link?.gist ? 'gist' : link?.cloud || cloudConfigured ? 'cloud' : null)

  const signInGist = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = token.trim()
    if (!t) return
    setBusy(true)
    setError('')
    try {
      const user = await validateToken(t)
      const gistId = link?.gist?.login === user.login && link.gist.gistId ? link.gist.gistId : await findGist(t)
      let counts: string | null = null
      if (gistId) {
        const remote = await readGistDoc(t, gistId)
        counts = summarize(remote.doc ? normalizeDoc(remote.doc) : remote.legacy ? migrateV3(remote.legacy) : null)
      }
      // Offer to keep the key in the password manager, so the next device just autofills it.
      void rememberLogin(gistLoginName(user.login), t, `Workbench sync (${user.login})`, user.avatar_url)
      onGist({ token: t, user, gistId, counts })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-tight">Welcome back.</h1>
        <p className="mt-2 text-sm text-muted">Bring your workspace to this device. Nothing to remember — use a link from your computer or your saved logins.</p>
      </div>

      {link && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 rounded-xl bg-success/10 p-3 text-[13px]" data-testid="link-banner">
          <Smartphone className="size-4 text-success" />
          <span className="flex-1">
            Linked from your other device{link.gist?.login ? <> as <b>{link.gist.login}</b></> : ''}. Tap <b>Sign in</b> to continue.
          </span>
        </motion.div>
      )}

      {!link && (
        <div className="flex gap-3 rounded-2xl border border-border bg-surface-2/40 p-3.5 text-[13px]">
          <QrCode className="mt-0.5 size-5 shrink-0 text-accent-strong" />
          <div>
            <div className="font-medium">Fastest: scan from your computer</div>
            <div className="mt-0.5 text-xs leading-relaxed text-subtle">
              On a device that’s already signed in, open <b>Settings → Devices → Link a device</b> and point this phone’s camera at the code.
            </div>
          </div>
        </div>
      )}

      {/* GitHub sync key — a real login form so password managers save and autofill it. */}
      <div className="rounded-2xl border border-border bg-surface-2/40">
        <button type="button" onClick={() => setOpen(open === 'gist' ? null : 'gist')} className="flex w-full items-center gap-2 p-3.5 text-left text-[13px] font-medium">
          <GithubMark className="size-4 text-accent-strong" />
          <span className="flex-1">GitHub sync</span>
          <ChevronDown className={cn('size-4 text-subtle transition-transform', open === 'gist' && 'rotate-180')} />
        </button>
        {open === 'gist' && (
          <form onSubmit={signInGist} className="space-y-2.5 px-3.5 pb-3.5" data-testid="gist-signin" autoComplete="on">
            <Input name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="github:your-username" aria-label="Account" />
            <Input name="password" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Sync key (GitHub token)" className="font-mono" aria-label="Sync key" />
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!token.trim()} iconRight={<ArrowRight className="size-4" />}>
              Sign in
            </Button>
            <p className="text-[11.5px] leading-snug text-subtle">Tap the first field to pick a saved login. Your key stays on this device and in your password manager.</p>
          </form>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface-2/40">
        <button type="button" onClick={() => setOpen(open === 'cloud' ? null : 'cloud')} className="flex w-full items-center gap-2 p-3.5 text-left text-[13px] font-medium">
          <Cloud className="size-4 text-accent-strong" />
          <span className="flex-1">Workbench Cloud</span>
          <ChevronDown className={cn('size-4 text-subtle transition-transform', open === 'cloud' && 'rotate-180')} />
        </button>
        {open === 'cloud' && <CloudSignIn />}
      </div>

      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> New to Workbench? Set up instead
      </button>
    </div>
  )
}

function CloudSignIn() {
  const { configured, signInPassword, signInGithub, signInMagic, connect } = useCloud()
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({})

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what)
    setMsg({})
    try {
      await fn()
      if (what === 'magic') setMsg({ ok: 'Check your email for a sign-in link — open it on this device.' })
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : 'Sign-in failed' })
    }
    setBusy(null)
  }

  if (!configured)
    return (
      <form
        className="space-y-2.5 px-3.5 pb-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void run('connect', async () => {
            const r = await probeCloud({ url: url.trim(), key: key.trim() })
            connect({ url: r.url, key: key.trim() })
          })
        }}
      >
        <p className="text-xs text-subtle">Linking from another device fills this in for you. Or enter your Supabase project:</p>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xyz.supabase.co" autoComplete="off" />
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Publishable (anon) key" className="font-mono" autoComplete="off" />
        {msg.err && <p className="text-xs text-danger">{msg.err}</p>}
        <Button type="submit" className="w-full" loading={busy === 'connect'} disabled={!url.trim() || !key.trim()}>
          Continue
        </Button>
      </form>
    )

  return (
    <div className="space-y-2.5 px-3.5 pb-3.5" data-testid="cloud-signin">
      <form
        className="space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          void run('password', () => signInPassword(email.trim(), password))
        }}
      >
        <Input name="username" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" icon={<Mail />} />
        <Input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <Button type="submit" variant="primary" className="w-full" loading={busy === 'password'} disabled={!email.trim() || !password}>
          Sign in
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" icon={<GithubMark className="size-4" />} loading={busy === 'github'} onClick={() => void run('github', signInGithub)}>
          GitHub
        </Button>
        <Button type="button" icon={<Mail className="size-4" />} loading={busy === 'magic'} disabled={!email.trim()} onClick={() => void run('magic', () => signInMagic(email.trim()))}>
          Email link
        </Button>
      </div>
      {msg.err && <p className="text-xs text-danger">{msg.err}</p>}
      {msg.ok && <p className="text-xs text-success">{msg.ok}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step 2: lock this device                                           */
/* ------------------------------------------------------------------ */

function LockDevice({ found, link, onBack, onDone }: { found: Found; link: LinkPayload | null; onBack: () => void; onDone: (v: { name: string; password: string; remember: boolean }) => Promise<void> }) {
  const [name, setName] = useState(link?.profile?.name || found.gist?.user.name || found.gist?.user.login || found.cloudEmail?.split('@')[0] || '')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const ok = name.trim() && password.length >= 6 && password === confirmPw
  const pwRef = useRef<HTMLInputElement>(null)
  // Focus after the step has settled; focusing mid-transition can shift the layout.
  useEffect(() => {
    const t = setTimeout(() => pwRef.current?.focus({ preventScroll: true }), 250)
    return () => clearTimeout(t)
  }, [])

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        setBusy(true)
        await onDone({ name: name.trim(), password, remember })
      }}
    >
      <div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-tight">You’re in.</h1>
        <p className="mt-2 text-sm text-muted">Set a password to lock Workbench on this device. Your browser can suggest and save one.</p>
      </div>
      <div className="space-y-2" data-testid="found">
        {found.gist && (
          <div className="flex items-center gap-2.5 rounded-xl bg-success/10 p-2.5 text-[13px]">
            <Avatar name={found.gist.user.login} src={found.gist.user.avatar_url} size={28} />
            <div className="min-w-0 flex-1">
              <div>
                GitHub sync · <b>{found.gist.user.login}</b>
              </div>
              <div className="truncate text-xs text-subtle">{found.gist.gistId ? (found.gist.counts ?? 'Workspace found') : 'No workspace yet — this device will start one'}</div>
            </div>
            <Check className="size-4 text-success" />
          </div>
        )}
        {found.cloudEmail && (
          <div className="flex items-center gap-2.5 rounded-xl bg-success/10 p-2.5 text-[13px]">
            <Cloud className="size-4 text-success" />
            <div className="flex-1">
              Workbench Cloud · <b>{found.cloudEmail}</b>
            </div>
            <Check className="size-4 text-success" />
          </div>
        )}
      </div>
      <Field label="Your name">
        <Input name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {/* Username for the device password, so it saves separately from the sync key. */}
      <input type="text" name="username" autoComplete="username" value={name.trim() || 'Workbench'} readOnly hidden />
      <Field label="Device password">
        <Input type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} ref={pwRef} />
      </Field>
      <Field label="Confirm" error={confirmPw && confirmPw !== password ? 'Passwords don’t match' : undefined}>
        <Input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2.5 text-[13px] text-muted">
        <Switch checked={remember} onChange={setRemember} label="Stay signed in" />
        Stay signed in on this device for 14 days
      </label>
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Back
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!ok} iconRight={<ArrowRight className="size-4" />}>
          Open my workspace
        </Button>
      </div>
    </form>
  )
}
