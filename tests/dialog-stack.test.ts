// The open dialogs, as the battle reads them (useDialogOpen): it waits while one is over it (Settings opened mid-fight,
// the trainer menu, the guide), and picks up as soon as the last one closes.
import { describe, expect, it } from 'vitest'
import { dialogsOpen, onDialogs, pushDialog } from '@/lib/useDialog'

describe('the dialog stack', () => {
  it('counts what is open and says so on every change', () => {
    const seen: number[] = []
    const off = onDialogs(() => seen.push(dialogsOpen()))
    const closeMenu = pushDialog({})
    const closeSettings = pushDialog({})
    expect(dialogsOpen()).toBe(2)
    closeMenu()
    closeSettings()
    expect(dialogsOpen()).toBe(0)
    expect(seen).toEqual([1, 2, 1, 0])
    off()
    pushDialog({})()
    expect(seen).toEqual([1, 2, 1, 0])
  })

  it('takes off only the dialog it put on, once', () => {
    const under = {}
    const closeUnder = pushDialog(under)
    const closeTop = pushDialog({})
    closeTop()
    // Closed twice (a cleanup run again): the dialog under it stays open.
    closeTop()
    expect(dialogsOpen()).toBe(1)
    closeUnder()
    expect(dialogsOpen()).toBe(0)
  })
})
