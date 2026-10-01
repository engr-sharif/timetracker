import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { Check, Cloud, Copy, Database, ExternalLink, KeyRound, LogOut, Mail, Plug, RefreshCw, Unplug, Zap } from 'lucide-react'
import setupSql from '../../../supabase/migrations/0001_workbench.sql?raw'
import { cn, copyText } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { probeCloud, readCloudConfig } from '@/lib/supabase'
import { useCloud } from '@/store/cloud'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Avatar, Segmented } from '@/components/ui/misc'
import { confirm } from '@/components/ui/dialog'

const projectRef = (url?: string) => url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  )
}

export function CloudSection() {
  const { configured, user, status, live, lastSyncedAt, error, pendingUploads } = useCloud()
  return (
    <section id="sync" className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-surface/70 backdrop-blur-sm">
      <div className="relative border-b border-border p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-20 -right-10 size-56 rounded-full bg-[oklch(0.72_0.17_155/0.18)] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="hidden size-11 shrink-0 place-items-center rounded-xl border border-border-strong bg-surface-2 sm:grid text-[oklch(0.72_0.17_155)]">
            <Zap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              Workbench Cloud
              <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-medium text-muted">Supabase</span>
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Live sync between all your devices, real sign-in, and files that follow you everywhere. Your data lives in your own Supabase project, locked to your account.
            </p>
          </div>
          {user && <LiveBadge live={live} status={status} />}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={!configured ? 'setup' : !user ? 'signin' : 'account'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            {!configured ? <Setup /> : !user ? <SignIn /> : <Account lastSyncedAt={lastSyncedAt} status={status} error={error} pendingUploads={pendingUploads} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

function LiveBadge({ live, status }: { live: boolean; status: string }) {
  const syncing = status === 'syncing'
  return (
    <span className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium', live ? 'border-success/30 bg-success/10 text-success' : 'border-border text-subtle')}>
      <span className="relative flex size-2">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
        <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-success' : 'bg-subtle')} />
      </span>
      {syncing ? 'Syncing' : live ? 'Live' : 'Connecting'}
    </span>
  )
}

function SqlStep({ url }: { url?: string }) {
  const ref = projectRef(url)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        icon={<Copy className="size-3.5" />}
        onClick={async () => {
          await copyText(setupSql)
          toast.success('Setup SQL copied', { description: 'Paste it into the Supabase SQL editor and press Run.' })
        }}
      >
        Copy setup SQL
      </Button>
      <a
        href={ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard/projects'}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-accent-strong hover:bg-accent-soft"
      >
        Open SQL editor <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

function Setup() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const connect = useCloud((s) => s.connect)

  const submit = async () => {
    setBusy(true)
    try {
      const probe = await probeCloud({ url: url.trim(), key: key.trim() })
      connect({ url: probe.url, key: key.trim() })
      toast.success('Supabase project connected', { description: 'Now sign in or create your account.' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect')
    }
    setBusy(false)
  }

  const steps = [
    {
      title: 'Create a free Supabase project',
      body: (
        <a href="https://supabase.com/dashboard/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent-strong hover:underline">
          supabase.com/dashboard/new <ExternalLink className="size-3" />
        </a>
      ),
    },
    { title: 'Run the setup script once', body: <SqlStep url={url} /> },
    {
      title: 'Paste your project URL and publishable key',
      body: (
        <div className="space-y-3">
          <p className="text-xs text-subtle">
            Supabase → Project Settings → API. Use the <b className="text-muted">publishable / anon</b> key — never the secret or service_role key.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" icon={<Database />} />
            </Field>
            <Field label="Publishable key">
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_… or eyJ…" icon={<KeyRound />} className="font-mono" />
            </Field>
          </div>
          <Button variant="primary" icon={<Plug className="size-4" />} loading={busy} disabled={!url.trim() || !key.trim()} onClick={submit}>
            Connect project
          </Button>
        </div>
      ),
    },
  ]

  return (
    <ol className="relative space-y-6">
      <span className="absolute top-2 bottom-2 left-[13px] w-px bg-border" />
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-4">
          <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-border-strong bg-surface text-[12px] font-semibold">{i + 1}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mb-2 text-[13.5px] font-medium">{s.title}</div>
            {s.body}
          </div>
        </li>
      ))}
    </ol>
  )
}

function SignIn() {
  const { signInPassword, signUp, signInMagic, signInGithub, disconnect } = useCloud()
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    }
    setBusy(null)
  }
  const url = readCloudConfig()?.url

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_220px]">
      <div className="space-y-4">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setSent(false)
          }}
          options={[
            { value: 'password', label: 'Email & password' },
            { value: 'link', label: 'Email link' },
          ]}
        />
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" icon={<Mail />} />
        </Field>
        {mode === 'password' ? (
          <>
            <Field label="Password" hint="At least 6 characters. This is your cloud password — separate from the device lock.">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run('in', () => signInPassword(email, password))} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === 'in'} disabled={!email || password.length < 6} onClick={() => run('in', () => signInPassword(email, password))}>
                Sign in
              </Button>
              <Button
                loading={busy === 'up'}
                disabled={!email || password.length < 6}
                onClick={() =>
                  run('up', async () => {
                    const r = await signUp(email, password)
                    if (r === 'confirm-email') toast.success('Check your inbox', { description: 'Confirm your email, then come back here — you’ll be signed in.' })
                  })
                }
              >
                Create account
              </Button>
            </div>
          </>
        ) : sent ? (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/8 p-3.5 text-[13px]">
            <Check className="mt-0.5 size-4 text-success" />
            <span>
              Sign-in link sent to <b>{email}</b>. Open it on this device and you’ll land back here signed in.
            </span>
          </motion.div>
        ) : (
          <Button variant="primary" icon={<Mail className="size-4" />} loading={busy === 'link'} disabled={!email} onClick={() => run('link', async () => { await signInMagic(email); setSent(true) })}>
            Email me a sign-in link
          </Button>
        )}
      </div>
      <div className="space-y-3 border-border md:border-l md:pl-8">
        <div className="text-[11px] font-medium tracking-wide text-subtle uppercase">Or</div>
        <Button className="w-full" icon={<GithubMark className="size-4" />} loading={busy === 'gh'} onClick={() => run('gh', signInGithub)}>
          Continue with GitHub
        </Button>
        <p className="text-[11px] leading-relaxed text-subtle">Needs the GitHub provider switched on in Supabase → Authentication → Providers.</p>
        <div className="pt-3">
          <div className="mb-1 truncate font-mono text-[11px] text-subtle">{url}</div>
          <button onClick={() => void disconnect()} className="flex items-center gap-1.5 text-xs text-subtle hover:text-danger">
            <Unplug className="size-3.5" /> Use a different project
          </button>
        </div>
      </div>
    </div>
  )
}

function Account({ lastSyncedAt, status, error, pendingUploads }: { lastSyncedAt: string | null; status: string; error: string | null; pendingUploads: number }) {
  const { user, syncNow, signOut, disconnect } = useCloud()
  const url = readCloudConfig()?.url
  if (!user) return null
  const needsSql = !!error && /set up|wb_push|schema cache|relation .* does not exist/i.test(error)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={user.name || user.email || 'You'} src={user.avatar} size={44} />
        <div className="min-w-[10rem] flex-1">
          <div className="truncate text-[14px] font-semibold">{user.name || user.email}</div>
          <div className="truncate text-xs text-subtle">
            {status === 'syncing' ? 'Syncing…' : status === 'error' ? 'Sync paused' : lastSyncedAt ? `Up to date · ${timeAgo(lastSyncedAt)}` : 'Connecting…'}
            {pendingUploads > 0 && ` · uploading ${pendingUploads} file${pendingUploads > 1 ? 's' : ''}`}
          </div>
        </div>
        <Button size="sm" icon={<RefreshCw className={cn('size-3.5', status === 'syncing' && 'animate-spin')} />} onClick={() => void syncNow()}>
          Sync now
        </Button>
        <Button size="sm" variant="ghost" icon={<LogOut className="size-3.5" />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
      {error && (
        <div className="rounded-xl border border-warning/30 bg-warning/8 p-3.5 text-[13px]">
          <div className="mb-2 text-warning">{error}</div>
          {needsSql && <SqlStep url={url} />}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Cloud, title: 'Live sync', body: 'Edits appear on your other devices within a second.' },
          { icon: Database, title: 'Your project', body: url?.replace('https://', '') ?? '' },
          { icon: KeyRound, title: 'Private by default', body: 'Row-level security: only your account can read your data.' },
        ].map((c) => (
          <div key={c.title} className="min-w-0 rounded-xl border border-border bg-surface-2/40 p-3">
            <c.icon className="mb-2 size-4 text-accent-strong" />
            <div className="text-[12.5px] font-medium">{c.title}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-subtle">{c.body}</div>
          </div>
        ))}
      </div>
      <button
        onClick={async () => {
          if (await confirm({ title: 'Disconnect Workbench Cloud?', body: 'Sync stops on this device. Your data stays here and in Supabase.', confirmLabel: 'Disconnect' })) await disconnect()
        }}
        className="flex items-center gap-1.5 text-xs text-subtle hover:text-danger"
      >
        <Unplug className="size-3.5" /> Disconnect this device
      </button>
    </div>
  )
}
