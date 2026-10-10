// ADD BY FRIEND ID: type or paste a code, see who it is, add them at once (docs/16 §3.1).
import { useEffect, useId, useState } from 'react'
import { useT } from '@/i18n/react'
import {
  addFriend,
  formatCode,
  friendError,
  isCode,
  lookupCode,
  normalizeCode,
  type AddStatus,
  type FriendError,
  type FriendNotice,
} from '@/lib/friends'
import { pushToast, useGame } from '@/store/game'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { FriendPreview } from './FriendBits'

type Who = FriendNotice & { region: string | null; maxLevel: number }
type Lookup = { state: 'idle' | 'looking' | 'none' | 'error' } | { state: 'found'; who: Who }

/** The sentence for an add that didn't make a new friend, or for a failed call. */
export function useAddText() {
  const { t } = useT()
  const max = useGame((s) => s.data.config.maxFriends)
  return (result: AddStatus | FriendError, name?: string | null) => {
    switch (result) {
      case 'added':
        return t('ui.friends.added', { name: name ?? '' })
      case 'already':
        return t('ui.friends.already', { name: name ?? '' })
      case 'self':
        return t('ui.friends.self')
      case 'not_found':
        return t('ui.friends.notFound')
      case 'full':
        return t('ui.friends.full', { max })
      case 'friend_full':
        return t('ui.friends.friendFull', { name: name ?? '' })
      case 'rate_limited':
        return t('ui.friends.rateLimited')
      case 'not_set_up':
        return t('ui.friends.notSetUp')
      default:
        return t('ui.friends.error')
    }
  }
}

export function AddFriendModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded?: (friend: FriendNotice) => void
}) {
  const { t } = useT()
  const text = useAddText()
  const inputId = useId()
  const hintId = useId()
  const [typed, setTyped] = useState('')
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const code = normalizeCode(typed)
  const valid = isCode(code)

  useEffect(() => {
    if (!open) {
      setTyped('')
      setLookup({ state: 'idle' })
      setProblem(null)
    }
  }, [open])

  // Who it is, once 8 good characters are in (a short wait, so pasting or typing fast asks once).
  useEffect(() => {
    if (!open || !valid) {
      setLookup({ state: 'idle' })
      return
    }
    let live = true
    setLookup({ state: 'looking' })
    const timer = setTimeout(() => {
      lookupCode(code)
        .then((who) => live && setLookup(who ? { state: 'found', who } : { state: 'none' }))
        .catch((err) => {
          if (!live) return
          setLookup({ state: 'error' })
          setProblem(text(friendError(err)))
        })
    }, 350)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // `text` changes identity every render; the lookup only depends on the code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, valid, code])

  const add = async () => {
    if (!valid || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const { status, friend } = await addFriend(code)
      if (status === 'added' && friend) {
        pushToast(text('added', friend.name), 'good')
        onAdded?.(friend)
        onClose()
      } else {
        setProblem(text(status, friend?.name ?? (lookup.state === 'found' ? lookup.who.name : null)))
      }
    } catch (err) {
      setProblem(text(friendError(err)))
    } finally {
      setBusy(false)
    }
  }

  const notFound = lookup.state === 'none'
  return (
    <Modal open={open} onClose={onClose} title={t('ui.friends.addTitle')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-[20px] leading-none">
            {t('ui.friends.idLabel')}
          </label>
          <input
            id={inputId}
            value={valid ? formatCode(code) : typed.toUpperCase()}
            onChange={(e) => {
              setTyped(e.target.value)
              setProblem(null)
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={14}
            placeholder="K7QM-4XD9"
            aria-describedby={hintId}
            aria-invalid={notFound || undefined}
            className="h-12 w-full bg-paper px-3 text-[26px] uppercase tracking-[0.08em] shadow-field placeholder:text-faint"
          />
          <small id={hintId} className="font-pixel-sm text-[15px] leading-tight text-muted">
            {t('ui.friends.idHint')}
          </small>
        </div>

        {lookup.state === 'looking' && <p className="m-0 text-[18px] text-muted">{t('ui.common.loading')}</p>}
        {lookup.state === 'found' && <FriendPreview {...lookup.who} />}
        {(notFound || problem) && (
          <p role="alert" className="m-0 text-[18px] leading-tight text-danger">
            {problem ?? t('ui.friends.notFound')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <PixelButton onClick={onClose}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton type="submit" variant="primary" disabled={!valid || busy || notFound}>
            {t('ui.friends.addButton')}
          </PixelButton>
        </div>
      </form>
    </Modal>
  )
}
