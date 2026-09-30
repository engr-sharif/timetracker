import { useNavigate } from 'react-router'
import { Cloud, CloudOff, RefreshCw, TriangleAlert, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/dates'
import { useSync } from '@/store/sync'
import { Tooltip } from '@/components/ui/popover'
import { useTicker } from './TimerControl'

export function SyncBadge({ compact }: { compact?: boolean }) {
  const { status, lastSyncedAt, error, syncNow } = useSync()
  const navigate = useNavigate()
  useTicker(true, 30_000)

  const meta = {
    off: { icon: HardDrive, label: 'On this device', tip: 'Local only — connect GitHub in Settings to sync', tone: 'text-subtle' },
    idle: { icon: Cloud, label: 'Synced', tip: lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : 'Sync ready', tone: 'text-success' },
    syncing: { icon: RefreshCw, label: 'Syncing', tip: 'Syncing…', tone: 'text-accent-strong' },
    error: { icon: TriangleAlert, label: 'Sync issue', tip: error ?? 'Sync failed — click to retry', tone: 'text-warning' },
    offline: { icon: CloudOff, label: 'Offline', tip: 'Offline — changes are saved locally', tone: 'text-subtle' },
  }[status]

  return (
    <Tooltip content={meta.tip} placement={compact ? 'right' : 'top'}>
      <button
        onClick={() => (status === 'off' ? navigate('/settings#sync') : void syncNow())}
        className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors hover:bg-surface-2', meta.tone, compact && 'w-8 justify-center px-0')}
      >
        <meta.icon className={cn('size-3.5', status === 'syncing' && 'animate-spin')} />
        {!compact && <span className="text-muted">{meta.label}</span>}
      </button>
    </Tooltip>
  )
}
