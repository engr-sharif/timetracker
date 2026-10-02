import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Eye, KeyRound, QrCode, RefreshCw, ShieldAlert, Smartphone } from 'lucide-react'
import { copyText } from '@/lib/utils'
import { deviceLinkUrl, gistLoginName, LINK_TTL_MIN, rememberLogin } from '@/lib/link'
import { useAuth } from '@/store/auth'
import { useCloud } from '@/store/cloud'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

/** Settings → Devices: link a phone by QR code, and keep the sync key in the password manager. */
export function DevicesSection() {
  const sync = useAuth((s) => s.sync)
  const cloudConfigured = useCloud((s) => s.configured)
  const [shown, setShown] = useState<{ url: string; svg: string; until: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const canLink = !!sync?.token || cloudConfigured

  useEffect(() => {
    if (!shown) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [shown])
  useEffect(() => {
    if (shown && now > shown.until) setShown(null)
  }, [now, shown])

  const show = async () => {
    const url = deviceLinkUrl()
    if (!url) return
    const { renderSVG } = await import('uqr')
    const svg = renderSVG(url, { ecc: 'M', border: 2, whiteColor: '#ffffff', blackColor: '#0b0c10' })
    setShown({ url, svg, until: Date.now() + LINK_TTL_MIN * 60_000 })
    setNow(Date.now())
  }

  const left = shown ? Math.max(0, Math.round((shown.until - now) / 1000)) : 0

  return (
    <section id="devices" className="scroll-mt-6 rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur-sm">
      <h2 className="text-[15px] font-semibold tracking-tight">Devices</h2>
      <p className="mt-1 text-[13px] text-muted">Sign in on your phone or another computer without typing anything.</p>

      <div className="mt-5 space-y-5">
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-0 flex-1 basis-64 space-y-2 text-[13px]">
            <div className="flex items-center gap-2 font-medium">
              <Smartphone className="size-4 text-accent-strong" /> Link a device
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Tap <b className="text-fg">Show code</b>.</li>
              <li>Point your phone’s camera at it and open the link.</li>
              <li>Tap <b className="text-fg">Sign in</b> there, then pick a device password.</li>
            </ol>
            <p className="text-xs text-subtle">The code carries your sync settings{sync?.token ? ' and GitHub sync key' : ''}, so only show it to your own devices. It expires after {LINK_TTL_MIN} minutes.</p>
            {!canLink && <p className="text-xs text-warning">Turn on Workbench Cloud or GitHub sync first — that’s what the other device signs in to.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="primary" size="sm" icon={shown ? <RefreshCw className="size-3.5" /> : <QrCode className="size-3.5" />} disabled={!canLink} onClick={() => void show()} data-testid="show-link">
                {shown ? 'New code' : 'Show code'}
              </Button>
              {shown && (
                <Button
                  size="sm"
                  icon={<Copy className="size-3.5" />}
                  onClick={async () => {
                    await copyText(shown.url)
                    toast.success('Link copied', { description: 'Send it only to yourself — it signs a device in.' })
                  }}
                >
                  Copy link
                </Button>
              )}
            </div>
          </div>
          <div className="grid size-[208px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-2/40">
            {shown ? (
              <div className="text-center">
                <div className="size-[176px] overflow-hidden rounded-lg bg-white [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: shown.svg }} data-testid="link-qr" />
                <div className="mt-1 text-[11px] text-subtle tabular-nums">
                  Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                </div>
              </div>
            ) : (
              <button onClick={() => void show()} disabled={!canLink} className="flex flex-col items-center gap-2 text-[12px] text-subtle disabled:opacity-50">
                <Eye className="size-5" /> Code hidden
              </button>
            )}
          </div>
        </div>

        {sync?.token && <SaveSyncKey login={sync.login} token={sync.token} avatar={sync.avatar} />}

        <div className="flex gap-2 rounded-xl bg-surface-2/50 p-3 text-xs text-subtle">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          Using the iPhone Home Screen app? It keeps its own storage, separate from Safari — so open the app, tap Sign in → Scan code, and scan this code from inside it.
        </div>
      </div>
    </section>
  )
}

/**
 * A login form pre-filled with the sync key: submitting it is how browsers (Safari
 * included) learn to save and later autofill it on your other devices.
 */
function SaveSyncKey({ login, token, avatar }: { login?: string; token: string; avatar?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-5"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const stored = await rememberLogin(gistLoginName(login), token, `Workbench sync (${login ?? 'GitHub'})`, avatar)
        setBusy(false)
        toast.success(stored ? 'Saved to your password manager' : 'If your browser offers to save the password, choose Save', {
          description: `It appears as “${gistLoginName(login)}”. On a new device, tap the first field in Sign in → GitHub sync to fill it.`,
        })
      }}
    >
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <KeyRound className="size-4 text-accent-strong" /> Keep the sync key in your password manager
        </div>
        <div className="text-xs text-subtle">iCloud Keychain, Google Password Manager or 1Password will then fill it in on any device.</div>
      </div>
      {/* Real (read-only) credential fields so the browser recognises a login. */}
      <Input name="username" autoComplete="username" value={gistLoginName(login)} readOnly className="w-44 font-mono text-[12px]" aria-label="Saved login name" />
      <input name="password" type="password" autoComplete="current-password" value={token} readOnly hidden />
      <Button type="submit" size="sm" loading={busy} data-testid="save-key">
        Save login
      </Button>
    </form>
  )
}
