// A portal run's look on the page (docs/28; the Stairway of Plates, docs/64 §4.5 and docs/15 §49): Distortion World's
// portals by default, or the Hall of Origin's stairway of light. The rules are the same; the run's pieces read the look
// from here to pick their words (`ui.plates.*` over `ui.portal.*`) and their scenes. Nothing here decides a rule.
import { createContext, useContext } from 'react'
import {
  portalLock,
  portalModeOf,
  portalSkin,
  type Area,
  type DieType,
  type GameData,
  type PokeType,
  type PortalSkin,
} from '@/engine'
import { useGame } from '@/store/game'
import { hasKey, type TVars } from '@/i18n'
import { useT } from '@/i18n/react'

const PortalSkinContext = createContext<PortalSkin>('distortion')

/** Its pieces inside wear this look. */
export const PortalSkinProvider = PortalSkinContext.Provider

/** The look of the portal run being shown (Distortion World's outside any). */
export const usePortalSkin = () => useContext(PortalSkinContext)

/** An area's portal look (Distortion World's when it has none or the switch is off). */
export const skinOfArea = (area: Pick<Area, 'mode'> | null | undefined, data: GameData): PortalSkin =>
  portalSkin(portalModeOf(area, data))

/**
 * The key a look says a portal line with: the Stairway of Plates' own (`ui.plates.…`) when it has one, else the
 * portal run's (`ui.portal.…`: the lines that read the same, such as Team or Ready!).
 */
export function skinKey(skin: PortalSkin, key: string): string {
  if (skin !== 'plates' || !key.startsWith('ui.portal.')) return key
  const own = `ui.plates.${key.slice('ui.portal.'.length)}`
  return hasKey(own) ? own : key
}

/** `t` for a portal run's pieces: their words in the look being shown. */
export function usePortalT() {
  const { t, tPlural } = useT()
  const skin = usePortalSkin()
  return { skin, tPlural, t: (key: string, vars?: TVars) => t(skinKey(skin, key), vars) }
}

/** Shiny Giratina, or shiny Arceus: who comes out at the end of the run, and its raid. */
export const PRIZE: Record<PortalSkin, number> = { distortion: 487, plates: 493 }

/** A portal area's prize: its raid Pokémon, else the look's. */
export const prizeOf = (area: Pick<Area, 'legendaryBoss'> | null | undefined, skin: PortalSkin): number =>
  area?.legendaryBoss?.find((b) => b.raid)?.dex ?? PRIZE[skin]

/** A Plate's name key: the games' names (`plate.*`); Normal has none there, so the Legend Plate's (Legends: Arceus). */
export const plateKey = (type: PokeType): string => (type === 'normal' ? 'ui.plates.legend' : `plate.${type}`)

/**
 * The look of the portal area being played (the one the player can't leave, else the area the run is in, else the
 * save's): for the lines outside the run's own pieces (the menus' lock, the Team screen's way back, the toasts).
 */
export function useRunSkin(): PortalSkin {
  return useGame((s) => {
    const id =
      s.save && portalLock(s.save, s.data) ? s.save.currentAreaId : (s.run.areaId ?? s.save?.currentAreaId)
    return skinOfArea(
      s.data.areas.find((a) => a.id === id),
      s.data,
    )
  })
}

/** The type a Plate gave (its form change's dice all take it): the first typed die, Normal when there is none. */
export const plateType = (dice: readonly DieType[]): PokeType =>
  dice.find((d): d is PokeType => d !== 'base') ?? 'normal'
