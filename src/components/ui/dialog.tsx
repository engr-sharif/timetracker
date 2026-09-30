import { useState, type ReactNode } from 'react'
import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '@/lib/utils'
import { Button, IconButton } from './button'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  /** 'center' modal or right-hand 'sheet' */
  variant?: 'center' | 'sheet'
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  hideClose?: boolean
  initialFocus?: number
}

export function Dialog(props: DialogProps) {
  return (
    <FloatingPortal>
      <AnimatePresence>{props.open && <DialogInner key="dialog" {...props} />}</AnimatePresence>
    </FloatingPortal>
  )
}

function DialogInner({
  onClose,
  children,
  className,
  variant = 'center',
  title,
  description,
  footer,
  hideClose,
  initialFocus = -1,
}: DialogProps) {
  const { refs, context } = useFloating({ open: true, onOpenChange: (o) => !o && onClose() })
  const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePressEvent: 'mousedown' }), useRole(context)])
  const sheet = variant === 'sheet'

  return (
    <FloatingOverlay lockScroll className={cn('z-[60] flex', sheet ? 'justify-end' : 'items-start justify-center p-4 pt-[10vh]')}>
      <motion.div
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <FloatingFocusManager context={context} initialFocus={initialFocus}>
        <motion.div
          ref={refs.setFloating}
          {...getFloatingProps()}
          initial={sheet ? { x: '100%' } : { opacity: 0, y: 16, scale: 0.97 }}
          animate={sheet ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={sheet ? { x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } } : { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
          transition={{ type: 'spring', stiffness: 420, damping: sheet ? 40 : 32 }}
          className={cn(
            'relative flex flex-col border border-border-strong bg-surface shadow-float outline-none',
            sheet ? 'h-full w-full max-w-xl border-y-0 border-r-0' : 'max-h-[80vh] w-full max-w-lg rounded-2xl',
            className,
          )}
        >
          {(title || !hideClose) && (
            <div className="flex items-start gap-3 px-5 pt-5 pb-1">
              <div className="min-w-0 flex-1">
                {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
                {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
              </div>
              {!hideClose && (
                <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
                  <X />
                </IconButton>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </motion.div>
      </FloatingFocusManager>
    </FloatingOverlay>
  )
}

/* ------------------------------------------------------------------ */
/*  Promise-based confirm                                              */
/* ------------------------------------------------------------------ */

interface ConfirmOpts {
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

const useConfirmStore = create<{ req: (ConfirmOpts & { resolve: (v: boolean) => void }) | null }>(() => ({ req: null }))

export function confirm(opts: ConfirmOpts) {
  return new Promise<boolean>((resolve) => useConfirmStore.setState({ req: { ...opts, resolve } }))
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req)
  const [last, setLast] = useState<ConfirmOpts | null>(null)
  if (req && req !== last) setLast(req)
  const shown = req ?? last
  const done = (v: boolean) => {
    req?.resolve(v)
    useConfirmStore.setState({ req: null })
  }
  return (
    <Dialog
      open={!!req}
      onClose={() => done(false)}
      title={shown?.title}
      hideClose
      className="max-w-sm"
      initialFocus={-1}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => done(false)}>
            Cancel
          </Button>
          <Button variant={shown?.danger ? 'danger' : 'primary'} size="sm" onClick={() => done(true)} autoFocus>
            {shown?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {shown?.body && <div className="text-sm text-muted">{shown.body}</div>}
    </Dialog>
  )
}
