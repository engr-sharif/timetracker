import { forwardRef, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const base =
  'w-full bg-surface-2/60 border border-border rounded-[10px] text-fg text-sm transition-[border-color,box-shadow,background-color] duration-150 ' +
  'hover:border-border-strong focus:outline-none focus:border-accent/60 focus:bg-surface-2 focus:shadow-[0_0_0_3px_var(--accent-soft)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; suffix?: ReactNode }>(
  function Input({ className, icon, suffix, ...rest }, ref) {
    if (!icon && !suffix) return <input ref={ref} className={cn(base, 'h-9 px-3', className)} {...rest} />
    return (
      <div className={cn('relative flex items-center', className)}>
        {icon && <span className="pointer-events-none absolute left-3 text-subtle [&_svg]:size-4">{icon}</span>}
        <input ref={ref} className={cn(base, 'h-9', icon ? 'pl-9' : 'pl-3', suffix ? 'pr-10' : 'pr-3')} {...rest} />
        {suffix && <span className="absolute right-2 text-subtle">{suffix}</span>}
      </div>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }>(
  function Textarea({ className, autoGrow = true, ...rest }, ref) {
    const inner = useRef<HTMLTextAreaElement | null>(null)
    useLayoutEffect(() => {
      const el = inner.current
      if (!el || !autoGrow) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }, [rest.value, autoGrow])
    return (
      <textarea
        ref={(el) => {
          inner.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        className={cn(base, 'min-h-20 resize-none px-3 py-2.5 leading-relaxed', className)}
        {...rest}
      />
    )
  },
)

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      {label && <span className="text-[12.5px] font-medium text-muted">{label}</span>}
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  )
}

/** Borderless, large input used for titles in dialogs and editors. */
export const TitleInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TitleInput(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full bg-transparent text-xl font-semibold tracking-tight text-fg placeholder:text-subtle/70 focus:outline-none',
        className,
      )}
      {...rest}
    />
  )
})
