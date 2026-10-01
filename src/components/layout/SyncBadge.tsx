import { useNavigate } from 'react-router'
import { Cloud, CloudOff, RefreshCw, TriangleAlert, HardDrive, LogIn, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { useSync } from '@/store/sync'
import { useCloud } from '@/store/cloud'
import { Tooltip } from '@/components/ui/popover'
import { useTicker } from './TimerControl'

export function SyncBadge({ compact }: { compact?: boolean }) {
  const gist = useSync()
  const cloud = useCloud()
  const navigate = useNavigate()
  useTicker(true, 30_000)

  // Workbench Cloud wins when it's set up; the gist is the fallback indicator.
  const useCloudStatus = cloud.configured
  const status = useCloudStatus ? cloud.status : gist.status
  const lastSyncedAt = useCloudStatus ? cloud.lastSyncedAt : gist.lastSyncedAt
  const error = useCloudStatus ? cloud.error : gist.error
  const syncNow = useCloudStatus ? cloud.syncNow : gist.syncNow
  const live = useCloudStatus && cloud.live && status === 'idle'

  const meta = {
    off: { icon: HardDrive, label: 'On this device', tip: 'Local only — set up Workbench Cloud in Settings to sync', tone: 'text-subtle' },
    'signed-out': { icon: LogIn, label: 'Signed out', tip: 'Sign in to Workbench Cloud to sync', tone: 'text-subtle' },
    idle: live
      ? { icon: Zap, label: 'Live', tip: lastSyncedAt ? `Live sync on · last pushed ${timeAgo(lastSyncedAt)}` : 'Live sync on', tone: 'text-success' }
      : { icon: Cloud, label: 'Synced', tip: lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : 'Sync ready', tone: 'text-success' },
    syncing: { icon: RefreshCw, label: 'Syncing', tip: 'Syncing…', tone: 'text-accent-strong' },
    error: { icon: TriangleAlert, label: 'Sync issue', tip: error ?? 'Sync failed — click to retry', tone: 'text-warning' },
    offline: { icon: CloudOff, label: 'Offline', tip: 'Offline — changes are saved locally', tone: 'text-subtle' },
  }[status]

  const goSettings = status === 'off' || status === 'signed-out'

  return (
    <Tooltip content={meta.tip} placement={compact ? 'right' : 'top'}>
      <button
        onClick={() => (goSettings ? navigate('/settings#sync') : void syncNow())}
        className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors hover:bg-surface-2', meta.tone, compact && 'w-8 justify-center px-0')}
      >
        <span className="relative grid place-items-center">
          <meta.icon className={cn('size-3.5', status === 'syncing' && 'animate-spin')} />
          {live && <span className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-success" />}
        </span>
        {!compact && <span className="text-muted">{meta.label}</span>}
      </button>
    </Tooltip>
  )
}
