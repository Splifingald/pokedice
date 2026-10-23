// Kitchen sink: the shell's pieces (docs/38 §7). A page loading (the Poké Ball wobbling; still, as calm draws it) and
// each toast as it sits in the stack: info and good (a tap closes them), a long one (it stays longer), an error with its
// ✕ (it stays until closed). The live ones are under "GoldPill · Toast · Modal · Sheet".
import { PageLoading } from '@/components/PageLoading'
import { ToastCard } from '@/components/Toast'

const TOASTS = [
  { id: -1, text: 'Content updated', tone: 'info' },
  { id: -2, text: 'Cloud save loaded', tone: 'good' },
  {
    id: -3,
    text: 'You found a Helix Fossil! Omanyte will be revived in 6 h — it’s waiting in your Box.',
    tone: 'info',
  },
  { id: -4, text: 'You’re offline. Check your connection.', tone: 'bad' },
] as const

export function ShellBits() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <PageLoading className="min-h-0 bg-parchment shadow-ring" />
        <PageLoading className="min-h-0 bg-parchment shadow-ring" still />
      </div>
      <div className="flex flex-col items-center gap-2 bg-parchment p-3 shadow-ring">
        {TOASTS.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  )
}
