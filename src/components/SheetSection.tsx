import type { ReactNode } from 'react'

/** A titled block inside a sheet: a 22px heading, an optional muted hint and extra controls on the same row. */
export function SheetSection({
  title,
  hint,
  extra,
  children,
}: {
  title: string
  hint?: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-2">
      <div className="flex min-h-[36px] flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[22px] leading-none">{title}</h3>
        {hint && <span className="font-pixel-sm text-[15px] text-muted">{hint}</span>}
        {extra}
      </div>
      {children}
    </section>
  )
}
