import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size as sizeMw,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useFocus,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'

const PopoverCtx = createContext<{ close: () => void }>({ close: () => {} })
export const usePopover = () => useContext(PopoverCtx)

const originFor = (p: Placement) => {
  const [side, align] = p.split('-')
  const y = side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : 'center'
  const x = side === 'left' ? 'right' : side === 'right' ? 'left' : align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'
  return `${y} ${x}`
}

interface PopoverProps {
  /** A single element that receives the anchor ref + props. */
  trigger: ReactElement
  children: ReactNode | ((api: { close: () => void }) => ReactNode)
  placement?: Placement
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  matchWidth?: boolean
  role?: 'dialog' | 'menu' | 'listbox'
  initialFocus?: number
}

export function Popover({
  trigger,
  children,
  placement = 'bottom-start',
  className,
  open: controlledOpen,
  onOpenChange,
  matchWidth,
  role = 'dialog',
  initialFocus = 0,
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = controlledOpen ?? uncontrolled
  const setOpen = (v: boolean) => {
    onOpenChange?.(v)
    if (controlledOpen === undefined) setUncontrolled(v)
  }

  const { refs, floatingStyles, context, placement: finalPlacement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      sizeMw({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(180, availableHeight)}px`
          if (matchWidth) elements.floating.style.minWidth = `${rects.reference.width}px`
        },
      }),
    ],
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role }),
  ])

  const close = () => setOpen(false)
  const anchor = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        ref: refs.setReference,
        ...getReferenceProps((trigger.props ?? {}) as Record<string, unknown>),
      })
    : null

  return (
    <PopoverCtx.Provider value={{ close }}>
      {anchor}
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <FloatingFocusManager context={context} modal={false} initialFocus={initialFocus} returnFocus>
              <div ref={refs.setFloating} style={floatingStyles} className="z-[70] flex outline-none" {...getFloatingProps()}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
                  transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                  style={{ transformOrigin: originFor(finalPlacement) }}
                  className={cn(
                    'glass flex min-w-44 flex-col overflow-auto rounded-xl p-1 shadow-float',
                    className,
                  )}
                >
                  {typeof children === 'function' ? children({ close }) : children}
                </motion.div>
              </div>
            </FloatingFocusManager>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </PopoverCtx.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  Menu                                                               */
/* ------------------------------------------------------------------ */

export function MenuItem({
  icon,
  children,
  shortcut,
  danger,
  active,
  onSelect,
  keepOpen,
  className,
}: {
  icon?: ReactNode
  children: ReactNode
  shortcut?: ReactNode
  danger?: boolean
  active?: boolean
  onSelect?: () => void
  keepOpen?: boolean
  className?: string
}) {
  const { close } = usePopover()
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.()
        if (!keepOpen) close()
      }}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-fg outline-none transition-colors',
        'hover:bg-surface-3/70 focus-visible:bg-surface-3/70 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle',
        danger && 'text-danger hover:bg-danger/10 [&_svg]:text-danger',
        active && 'bg-accent-soft text-accent-strong [&_svg]:text-accent-strong',
        className,
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-[11px] text-subtle">{shortcut}</span>}
    </button>
  )
}

export const MenuSeparator = () => <div className="mx-1 my-1 h-px bg-border" />
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">{children}</div>
)

/* ------------------------------------------------------------------ */
/*  Tooltip                                                            */
/* ------------------------------------------------------------------ */

export function Tooltip({
  content,
  children,
  placement = 'top',
  disabled,
}: {
  content: ReactNode
  children: ReactElement
  placement?: Placement
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open: open && !disabled,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: { open: 350, close: 0 }, move: false }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ])
  const anchor = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: refs.setReference,
    ...getReferenceProps((children.props ?? {}) as Record<string, unknown>),
  })
  return (
    <>
      {anchor}
      <FloatingPortal>
        <AnimatePresence>
          {open && !disabled && (
            <div ref={refs.setFloating} style={floatingStyles} className="pointer-events-none z-[80]" {...getFloatingProps()}>
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ type: 'spring', stiffness: 700, damping: 36 }}
                className="rounded-md border border-border-strong bg-surface-3 px-2 py-1 text-xs font-medium text-fg shadow-float"
              >
                {content}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}
