import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { Check, Cloud, Download, ExternalLink, Keyboard, KeyRound, Lock, Monitor, Moon, Palette, Pencil, RefreshCw, Sun, Trash, Upload, User, UserPlus, Users, Briefcase, Database, GitBranch, Smartphone, Sparkles, AppWindow } from 'lucide-react'
import { CloudSection } from './CloudSection'
import { AiSection } from './AiSection'
import { DevicesSection } from './DevicesSection'
import { AppSection } from '@/components/layout/InstallApp'
import { gistLoginName, rememberLogin } from '@/lib/link'
import { cn, download, hueColor, modKey } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { validateToken } from '@/lib/gist'
import { mergeDocs } from '@/lib/sync'
import { useAuth } from '@/store/auth'
import { usePrefs, type Accent } from '@/store/prefs'
import { useSync } from '@/store/sync'
import { normalizeDoc, useList, useSettings, useWorkspace, ws } from '@/store/workspace'
import type { Hue, Person } from '@/store/types'
import { NAV } from '@/app/nav'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button, IconButton } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Avatar, HuePicker, Kbd, Segmented, Switch } from '@/components/ui/misc'
import { Dialog, confirm } from '@/components/ui/dialog'

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'work', label: 'Work week', icon: Briefcase },
  { id: 'people', label: 'People', icon: Users },
  { id: 'sync', label: 'Cloud', icon: Cloud },
  { id: 'gist', label: 'Gist backup', icon: GitBranch },
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'app', label: 'App', icon: AppWindow },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
]

export default function SettingsPage() {
  const { hash } = useLocation()
  const [active, setActive] = useState('profile')
  useEffect(() => {
    const id = hash.replace('#', '')
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 200)
  }, [hash])

  useEffect(() => {
    const root = document.getElementById('scroll-root')
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (vis) setActive(vis.target.id)
    }, { root, rootMargin: '-20% 0px -70% 0px' })
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-6 space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}
                className={cn('relative flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors', active === s.id ? 'text-fg' : 'text-muted hover:text-fg')}
              >
                {active === s.id && <motion.span layoutId="settings-nav" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <s.icon className={cn('relative size-4', active === s.id ? 'text-accent-strong' : 'text-subtle')} />
                <span className="relative">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="min-w-0 space-y-6">
          <Profile />
          <Appearance />
          <WorkWeek />
          <People />
          <CloudSection />
          <SyncSection />
          <DevicesSection />
          <AppSection />
          <AiSection />
          <Security />
          <DataSection />
          <Shortcuts />
        </div>
      </div>
    </Page>
  )
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur-sm">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3.5 first:pt-0 last:border-b-0 last:pb-0">
      <div>
        <div className="text-[13.5px]">{label}</div>
        {hint && <div className="text-xs text-subtle">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Profile() {
  const account = useAuth((s) => s.account)
  const update = useAuth((s) => s.updateAccount)
  if (!account) return null
  return (
    <Section id="profile" title="Profile">
      <div className="flex flex-wrap items-start gap-6">
        <Avatar name={account.name} hue={account.color} src={account.avatar} size={72} />
        <div className="grid min-w-64 flex-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={account.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Role">
            <Input value={account.title ?? ''} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Company">
            <Input value={account.company ?? ''} onChange={(e) => update({ company: e.target.value })} />
          </Field>
          <Field label="Employee ID">
            <Input value={account.employeeId ?? ''} onChange={(e) => update({ employeeId: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Avatar colour" className="sm:col-span-2">
            <HuePicker value={account.color} onChange={(color) => update({ color })} />
          </Field>
        </div>
      </div>
    </Section>
  )
}

const ACCENTS: { value: Accent; hue: number }[] = [
  { value: 'violet', hue: 285 },
  { value: 'blue', hue: 255 },
  { value: 'teal', hue: 190 },
  { value: 'emerald', hue: 160 },
  { value: 'amber', hue: 70 },
  { value: 'orange', hue: 45 },
  { value: 'rose', hue: 10 },
]

function Appearance() {
  const { theme, accent, setTheme, set } = usePrefs()
  return (
    <Section id="appearance" title="Appearance">
      <Row label="Theme" hint="System follows your OS setting">
        <div className="flex gap-2">
          {(
            [
              ['dark', 'Dark', Moon],
              ['light', 'Light', Sun],
              ['system', 'System', Monitor],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={(e) => setTheme(v, { x: e.clientX, y: e.clientY })}
              className={cn('flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors', theme === v ? 'border-accent/50 bg-accent-soft text-fg' : 'border-border text-muted hover:border-border-strong')}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent colour">
        <div className="flex gap-2">
          {ACCENTS.map((a) => (
            <button key={a.value} onClick={() => set({ accent: a.value })} className="relative grid size-8 place-items-center rounded-full transition-transform hover:scale-110" style={{ background: `oklch(0.7 0.17 ${a.hue})` }} aria-label={a.value}>
              {accent === a.value && (
                <motion.span layoutId="accent-ring" className="absolute -inset-1 rounded-full border-2" style={{ borderColor: `oklch(0.7 0.17 ${a.hue})` }} />
              )}
              {accent === a.value && <Check className="size-4 text-black/70" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </Row>
    </Section>
  )
}

function WorkWeek() {
  const settings = useSettings()
  const set = useWorkspace((s) => s.setSettings)
  return (
    <Section id="work" title="Work week" description="Targets drive the progress rings on Home and the Timesheet.">
      <Row label="Weekly hours target">
        <Input type="number" value={settings.weeklyTarget} onChange={(e) => set({ weeklyTarget: Math.max(1, +e.target.value || 40) })} className="w-24 text-center font-mono" />
      </Row>
      <Row label="Billable hours target">
        <Input type="number" value={settings.billableTarget} onChange={(e) => set({ billableTarget: Math.max(0, +e.target.value || 0) })} className="w-24 text-center font-mono" />
      </Row>
      <Row label="Week starts on">
        <Segmented value={String(settings.weekStartsOn)} onChange={(v) => set({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} />
      </Row>
      <Row label="New entries are billable by default">
        <Switch checked={settings.defaultBillable} onChange={(defaultBillable) => set({ defaultBillable })} />
      </Row>
    </Section>
  )
}

function People() {
  const people = useList('people')
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  return (
    <Section id="people" title="People" description="Teammates, clients and subconsultants you assign work to or mention.">
      <div className="grid gap-2 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {people
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <motion.div layout key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-3">
                <Avatar name={p.name} hue={p.color} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{p.name}</div>
                  <div className="truncate text-xs text-subtle">{[p.role, p.company].filter(Boolean).join(' · ') || p.email || '—'}</div>
                </div>
                <IconButton label="Edit" size="xs" onClick={() => setEditing(p)} className="opacity-0 group-hover:opacity-100">
                  <Pencil />
                </IconButton>
              </motion.div>
            ))}
        </AnimatePresence>
        <button onClick={() => setEditing('new')} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-3 text-[13px] text-muted transition-colors hover:border-accent/50 hover:text-fg">
          <UserPlus className="size-4" /> Add person
        </button>
      </div>
      <PersonDialog key={editing === 'new' ? 'new' : editing?.id ?? 'none'} person={editing === 'new' ? undefined : editing ?? undefined} open={!!editing} onClose={() => setEditing(null)} />
    </Section>
  )
}

function PersonDialog({ person, open, onClose }: { person?: Person; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(person?.name ?? '')
  const [role, setRole] = useState(person?.role ?? '')
  const [company, setCompany] = useState(person?.company ?? '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [color, setColor] = useState<Hue>(person?.color ?? 'blue')
  const save = () => {
    if (!name.trim()) return
    const data = { name: name.trim(), role, company, email, color }
    if (person) ws().update('people', person.id, data)
    else ws().create('people', data)
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={person ? 'Edit person' : 'Add person'}
      footer={
        <>
          {person && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash className="size-3.5" />}
              onClick={async () => {
                if (!(await confirm({ title: `Remove ${person.name}?`, body: 'Tasks assigned to them will show as unassigned.', confirmLabel: 'Remove', danger: true }))) return
                ws().remove('people', person.id)
                onClose()
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={name || '?'} hue={color} size={48} />
          <Field label="Name" className="flex-1">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Structural lead" />
          </Field>
          <Field label="Company">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Colour">
          <HuePicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Dialog>
  )
}

function SyncSection() {
  const sync = useAuth((s) => s.sync)
  const setSync = useAuth((s) => s.setSync)
  const { status, lastSyncedAt, error, syncNow } = useSync()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    try {
      const user = await validateToken(token.trim())
      setSync({ token: token.trim(), login: user.login, avatar: user.avatar_url })
      void rememberLogin(gistLoginName(user.login), token.trim(), `Workbench sync (${user.login})`, user.avatar_url)
      setToken('')
      toast.success(`Connected to GitHub as ${user.login}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not connect')
    }
    setBusy(false)
  }

  return (
    <Section id="gist" title="GitHub gist backup" description="A lightweight alternative to Workbench Cloud: sync the workspace through a private gist you own. Files stay on each device. Both can run at once.">
      {sync ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-4">
            {sync.avatar && <Avatar name={sync.login ?? 'GitHub'} src={sync.avatar} size={36} />}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">Connected{sync.login && ` as ${sync.login}`}</div>
              <div className="text-xs text-subtle">
                {status === 'syncing' ? 'Syncing…' : status === 'error' ? error : lastSyncedAt ? `Last synced ${timeAgo(lastSyncedAt)}` : 'Waiting for first sync'}
              </div>
            </div>
            <Button size="sm" icon={<RefreshCw className={cn('size-3.5', status === 'syncing' && 'animate-spin')} />} onClick={() => void syncNow()}>
              Sync now
            </Button>
            {sync.gistId && (
              <a href={`https://gist.github.com/${sync.gistId}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg">
                View gist <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={async () => {
              if (await confirm({ title: 'Disconnect sync?', body: 'Your data stays on this device and in the gist. You can reconnect anytime.', confirmLabel: 'Disconnect' })) setSync(null)
            }}
          >
            Disconnect GitHub
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* A login form, so password managers can fill a saved sync key (and offer to save a new one). */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void connect()
            }}
          >
            <Input name="password" type="password" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="GitHub token with gist scope" className="flex-1 font-mono" />
            <Button type="submit" variant="primary" loading={busy} disabled={!token.trim()}>
              Connect
            </Button>
          </form>
          <a href="https://github.com/settings/tokens/new?scopes=gist&description=Workbench%20sync" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-strong hover:underline">
            Create a token (gist scope only) <ExternalLink className="size-3" />
          </a>
          <p className="text-xs text-subtle">If you used TimeTracker before, your existing gist is found automatically and your data is merged in.</p>
        </div>
      )}
    </Section>
  )
}

function Security() {
  const lock = useAuth((s) => s.lock)
  const changePassword = useAuth((s) => s.changePassword)
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const submit = async () => {
    if (next.length < 6) return toast.error('Use at least 6 characters')
    if (await changePassword(cur, next)) {
      toast.success('Password changed')
      setOpen(false)
      setCur('')
      setNext('')
    } else toast.error('Current password is incorrect')
  }
  return (
    <Section id="security" title="Security" description="Your password is hashed with PBKDF2 (310k iterations) and never leaves this browser.">
      <Row label="Password">
        <Button size="sm" icon={<KeyRound className="size-3.5" />} onClick={() => setOpen(true)}>
          Change password
        </Button>
      </Row>
      <Row label="Lock now" hint="Shift L from anywhere">
        <Button size="sm" icon={<Lock className="size-3.5" />} onClick={lock}>
          Lock workspace
        </Button>
      </Row>
      <Dialog open={open} onClose={() => setOpen(false)} title="Change password" footer={<Button variant="primary" onClick={submit}>Update password</Button>}>
        <div className="space-y-4">
          <Field label="Current password">
            <Input type="password" autoFocus value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="New password">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </Field>
        </div>
      </Dialog>
    </Section>
  )
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const resetEverything = useAuth((s) => s.resetEverything)
  const exportJson = () => {
    const doc = ws().doc
    download(`workbench-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(doc, null, 2))
    toast.success('Backup downloaded')
  }
  const importJson = async (f?: File) => {
    if (!f) return
    try {
      const incoming = normalizeDoc(JSON.parse(await f.text()))
      ws().replaceDoc(mergeDocs(ws().doc, incoming), { local: true })
      toast.success('Backup merged into your workspace')
    } catch {
      toast.error('That file isn’t a valid Workbench backup')
    }
  }
  return (
    <Section id="data" title="Data">
      <Row label="Export backup" hint="Everything except file contents, as JSON">
        <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportJson}>
          Download
        </Button>
      </Row>
      <Row label="Import backup" hint="Merges with what’s here — nothing is overwritten blindly">
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
        <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
          Import
        </Button>
      </Row>
      <Row label="Erase this device" hint="Signs out and removes all local data. Synced data in your gist is untouched.">
        <Button
          size="sm"
          variant="danger"
          icon={<Trash className="size-3.5" />}
          onClick={async () => {
            if (await confirm({ title: 'Erase all local data?', body: 'This cannot be undone on this device.', confirmLabel: 'Erase', danger: true })) await resetEverything()
          }}
        >
          Erase
        </Button>
      </Row>
    </Section>
  )
}

function Shortcuts() {
  const groups: [string, string[][]][] = [
    ['General', [[`${modKey()} K`, 'Command palette'], ['/', 'Search'], ['Shift L', 'Lock workspace']]],
    ['Create', [['C', 'New task'], ['L', 'Log time'], ['E', 'New event'], ['I', 'Capture idea'], ['T', 'Start / stop timer']]],
    ['Navigate', NAV.map((n) => [`G ${n.key.toUpperCase()}`, n.label])],
  ]
  return (
    <Section id="shortcuts" title="Keyboard shortcuts">
      <div className="grid gap-6 sm:grid-cols-3">
        {groups.map(([title, items]) => (
          <div key={title}>
            <div className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">{title}</div>
            <div className="space-y-1.5">
              {items.map(([k, label]) => (
                <div key={label} className="flex items-center justify-between text-[13px]">
                  <span className="text-muted">{label}</span>
                  <span className="flex gap-1">
                    {k.split(' ').map((x) => (
                      <Kbd key={x}>{x}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-subtle" style={{ color: hueColor('slate') }}>
        Tip: Enter in the timesheet grid moves down a row; arrow keys move between cells.
      </p>
    </Section>
  )
}
