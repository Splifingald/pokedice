// Admin number fields you can actually empty and retype.
//
// The old fields mapped '' straight to 0 on every keystroke, and being controlled they re-rendered as "0" the moment
// you cleared them — so select-all-then-type left you fighting a leading zero, and a clamped stepper snapped to its
// minimum and appended to that. These are the rules the fix rests on.
import { describe, expect, it } from 'vitest'
import { HOLD, readNumberInput } from '@/admin/widgets'

describe('a number field in admin', () => {
  it('reads an empty field as 0', () => {
    expect(readNumberInput('')).toBe(0)
    expect(readNumberInput('   ')).toBe(0)
  })

  it('reads an empty field as null where the column allows one', () => {
    expect(readNumberInput('', true)).toBe(null)
    expect(readNumberInput('   ', true)).toBe(null)
  })

  it('takes the number you typed, whole or not, positive or negative', () => {
    expect(readNumberInput('0')).toBe(0)
    expect(readNumberInput('7')).toBe(7)
    expect(readNumberInput('42')).toBe(42)
    expect(readNumberInput('-3')).toBe(-3)
    expect(readNumberInput('1.5')).toBe(1.5)
    expect(readNumberInput('0.25')).toBe(0.25)
  })

  it('holds the old value while a number is still being typed, rather than reporting NaN', () => {
    for (const half of ['-', '.', '-.', 'e', '1e', '--1', 'abc']) expect(readNumberInput(half), half).toBe(HOLD)
  })

  it('never reports NaN, whatever is in the box', () => {
    for (const raw of ['', ' ', '-', 'abc', '1e', '1.2.3', 'Infinity', '-Infinity'])
      expect(Number.isNaN(readNumberInput(raw) as number), raw).toBe(false)
  })

  it('does not treat a leading zero as anything special — 0 then 5 is 5, not 05', () => {
    // What the draft makes possible: the keystrokes of clearing "10" and typing "5".
    expect(readNumberInput('')).toBe(0)
    expect(readNumberInput('5')).toBe(5)
  })
})
