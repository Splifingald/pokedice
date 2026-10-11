import { useState } from 'react'

/** ALL or FRIENDS, remembered in this browser (docs/16). */
const FILTER_KEY = 'pokedice.board.friendsOnly'
export function useFriendsFilter(key = FILTER_KEY): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const set = (v: boolean) => {
    setOn(v)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      /* forgotten next visit */
    }
  }
  return [on, set]
}
