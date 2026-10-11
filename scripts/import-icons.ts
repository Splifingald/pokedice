/**
 * `pnpm tsx scripts/import-icons.ts <Sprites folder> [--regions]`: turns sprites from the "1-bit Pixel Icons" pack
 * (1476 16×16 PNGs, one black ink + white fill on transparent) into PixelIcon maps, written to
 * src/components/packIcons.ts. icons.tsx spreads them over its hand-drawn maps, so names and callers stay the same.
 *
 * Source: the pack's `Sprites/` folder (e.g. C:/Users/<you>/Downloads/1-bit_Pixel_Icons/Sprites). Its PNGs are not
 * copied into the repo: only the maps this script writes are.
 *
 * Recolour rules, per icon (see SPECS):
 * - The sprite is cropped to its drawing, then padded (centred) to a square: `size`, or its longer side. A square map
 *   keeps PixelIcon's height = its width, as the hand-drawn maps had.
 * - Black ink → 'k', the navy outline (it follows the theme's `edge`).
 * - White → `fill`, a key of the icon's palette (ICON_PALETTE, or NAV_PAL for the tab bar's `nav*` icons).
 * - `regions`: [x, y, key] flood-fills (4-connected) the white area holding that pixel with its own colour, e.g. the
 *   shackle of the padlock or each friend's shirt. Coordinates are in the cropped sprite, before the padding.
 *   `--regions` prints every sprite's white areas as letters, to pick these points.
 * - `pixels`: [x, y, key] single-pixel touches (a highlight), same coordinates.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src/components/packIcons.ts')

type Spot = [x: number, y: number, key: string]
type Spec = { file: string; fill: string; size?: number; regions?: Spot[]; pixels?: Spot[] }

/** Icon name → sprite (file name in Sprites/, without .png) and its colours. */
const SPECS: Record<string, Spec> = {
  coin: {
    file: 'RPG_Coin_Gold_Currency_Money_GP',
    fill: 'o',
    regions: [[4, 3, 'y'], [4, 1, 'y'], [3, 2, 'y'], [8, 2, 'y'], [2, 3, 'y'], [9, 3, 'y']],
    pixels: [[3, 4, 'Y'], [3, 5, 'Y'], [4, 3, 'Y']],
  },
  heart: { file: 'RPG_Stat_HP_Health_Heart', fill: 'r', pixels: [[3, 1, 'w'], [2, 2, 'w']] },
  star: { file: 'RPG_Stat_MP_Mana_Star_Small', fill: 'y', pixels: [[5, 1, 'Y'], [5, 2, 'Y'], [4, 3, 'Y']] },
  warning: { file: 'Software_Warning_Sign_Triangle_Exclaimation_Mark_Error', fill: 'y' },
  lock: { file: 'Tools_Crafting_Padlock_Locked', fill: 'y', regions: [[2, 2, 's']] },
  cloud: { file: 'Software_Internet_Upload_to_Cloud_Storage', fill: 'C', regions: [[7, 9, 'b']], pixels: [[3, 5, 'w'], [2, 6, 'w']] },
  close: { file: 'Software_Signs_Maths_Multiplication_X_Crossout_Checkmark_Cancel', fill: 'r' },
  sound: { file: 'Media_Audio_Sound_Volume_3', fill: 'w' },
  mute: {
    file: 'Media_Audio_Sound_Volume_X_Disabled',
    fill: 'r',
    regions: [[3, 5, 'w']],
  },
  potion: { file: 'Alchemy_Potion_Vial_Bottle_Heart_Health_Life_Full', fill: 'C', regions: [[4, 1, 'o'], [6, 8, 'm']] },
  flag: { file: 'Map_Markers_Flagpole', fill: 'w', regions: [[3, 5, 's']] },
  thumbUp: { file: 'Emoji_Hand_Thumbs_Up', fill: 'g', regions: [[1, 5, 's']] },
  thumbDown: { file: 'Emoji_Hand_Thumbs_Down', fill: 'r', regions: [[1, 1, 's']] },
  up: { file: 'Arrows_Up_North', fill: 'g' },
  map: { file: 'Map_Markers_Travel_Map_Folded', fill: 'Y', regions: [[7, 1, 'r']] },
  gear: { file: 'Software_Options_Settings_Cogwheel_Gear_Mechanics', fill: 's', pixels: [[3, 1, 'w'], [3, 2, 'w']] },
  crown: { file: 'Hats_Crown_Queen_Tiara', fill: 'y', regions: [[4, 3, 'r'], [10, 3, 'r']], pixels: [[7, 1, 'Y'], [7, 2, 'Y']] },
  box: { file: 'Tools_Crafting_Chest_Locked_Loot', fill: 'o', regions: [[3, 1, 'y'], [5, 4, 's']] },
  vs: { file: 'RPG_Crossed_Swords_Duel_PvP_Combat_Battle_War', fill: 'w', regions: [[2, 10, 'r'], [8, 8, 'y'], [11, 10, 'r']] },
  history: { file: 'Software_Clipbaord_List_File_Copy_Paste', fill: 'w', regions: [[5, 1, 's'], [1, 3, 'o']] },
  sword: { file: 'RPG_Item_Weapon_Sword_Attack_Melee_Slashing_Damage', fill: 'w', regions: [[2, 10, 'o']] },
  shield: { file: 'RPG_Item_Stat_Shield_Defense_Armor', fill: 'b', regions: [[7, 4, 'w']] },
  run: { file: 'Software_Exit_Quit_Doorway_Button', fill: 'o', regions: [[8, 5, 'w']] },
  check: { file: 'Software_Signs_Checkmark_Checkbox_Ticked_Todo', fill: 'g' },
  speed: { file: 'RPG_Stat_Dexterity_Agility_Boots_Movement_Speed', fill: 'c', regions: [[4, 2, 'w']] },
  trophy: { file: 'Sports_Winner_Award_Cup_Achievement_Trophy', fill: 'y', regions: [[5, 12, 'o']], pixels: [[6, 1, 'Y'], [6, 2, 'Y'], [6, 3, 'Y']] },
  reroll: { file: 'Arrows_Reload_Refresh_Rotate_Clockwise', fill: 'b' },
  user: { file: 'Travel_Person_Player_Character_Single', fill: 'b', regions: [[5, 3, 'Y']] },
  friends: {
    file: 'Travel_Person_Player_Characters_People_Two_Coop_Multiplayer',
    fill: 'Y',
    regions: [[3, 8, 'b'], [10, 8, 'r']],
  },
  book: { file: 'Tools_Crafting_Books_Manual_Codex_Instructions_Tutorial_Documentation', fill: 'b', regions: [[4, 4, 'w'], [9, 4, 'w']] },
  mail: { file: 'Software_Email_Message_Unread_Closed', fill: 'w' },
  discord: { file: 'Platforms_Discord', fill: 'b' },
  play: { file: 'Arrows_Media_Controls_Play_Triangle', fill: 'w' },
  energy: { file: 'Software_Power_Electricity_Battery_Thunder_Lightning_Bolt_Zap', fill: 'y', pixels: [[7, 1, 'Y'], [6, 2, 'Y'], [5, 3, 'Y']] },
  wrench: { file: 'Tools_Crafting_Wrench', fill: 's', pixels: [[9, 1, 'w'], [8, 2, 'w']] },
  // The tab bar (NAV_PAL), on the 16×16 grid of the tab icons kept from before (navTeam, navDex).
  navShop: {
    file: 'Map_Markers_Building_Shop_Storefront',
    fill: 'w',
    size: 16,
    regions: [[5, 1, 'b'], [5, 4, 'b'], [13, 4, 'b']],
  },
  navUpgrades: {
    file: 'Tools_Crafting_Smithing_Anvil_Hammer',
    fill: 'S',
    size: 16,
    regions: [[9, 2, 'l'], [3, 3, 'f']],
    pixels: [[6, 7, 'g'], [7, 7, 'g'], [8, 7, 'g'], [9, 7, 'g'], [10, 7, 'g'], [11, 7, 'g'], [12, 7, 'g']],
  },
  navRanks: {
    file: 'Sports_Winner_Award_Cup_Achievement_Trophy_1st_First_Place',
    fill: 'y',
    size: 16,
    regions: [[5, 12, 'o']],
    pixels: [[5, 2, 'Y'], [5, 3, 'Y']],
  },
  navFriends: {
    file: 'Travel_Person_Player_Characters_People_Two_Coop_Multiplayer',
    fill: 'Y',
    size: 16,
    regions: [[3, 8, 'b'], [10, 8, 'r']],
  },
}

/** The sprite's pixels: 'k' ink, 'w' white fill, '.' transparent, cropped to the drawing. */
function load(dir: string, file: string): string[][] {
  const png = PNG.sync.read(readFileSync(path.join(dir, `${file}.png`)))
  const px = (x: number, y: number) => {
    const i = (y * png.width + x) * 4
    if (png.data[i + 3]! < 128) return '.'
    return png.data[i]! < 128 ? 'k' : 'w'
  }
  let [x0, y0, x1, y1] = [png.width, png.height, -1, -1]
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (px(x, y) !== '.') [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  const rows: string[][] = []
  for (let y = y0; y <= y1; y++) {
    const row: string[] = []
    for (let x = x0; x <= x1; x++) row.push(px(x, y))
    rows.push(row)
  }
  return rows
}

/** Labels each 4-connected white area: a grid of area ids (-1 elsewhere). */
function areas(g: string[][]): number[][] {
  const id = g.map((r) => r.map(() => -1))
  let n = 0
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0]!.length; x++) {
      if (g[y]![x] !== 'w' || id[y]![x] !== -1) continue
      const stack: [number, number][] = [[x, y]]
      id[y]![x] = n
      while (stack.length) {
        const [cx, cy] = stack.pop()!
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const [nx, ny] = [cx + dx, cy + dy]
          if (g[ny]?.[nx] === 'w' && id[ny]![nx] === -1) {
            id[ny]![nx] = n
            stack.push([nx, ny])
          }
        }
      }
      n++
    }
  return id
}

function convert(dir: string, spec: Spec): string[] {
  const g = load(dir, spec.file)
  const id = areas(g)
  const colour = new Map<number, string>()
  for (const [x, y, key] of spec.regions ?? []) {
    const a = id[y]?.[x]
    if (a === undefined || a < 0) throw new Error(`${spec.file}: (${x},${y}) is not in a white area`)
    colour.set(a, key)
  }
  const out = g.map((r, y) => r.map((c, x) => (c === 'w' ? (colour.get(id[y]![x]!) ?? spec.fill) : c)))
  for (const [x, y, key] of spec.pixels ?? []) {
    if (out[y]?.[x] === undefined || out[y]![x] === '.') throw new Error(`${spec.file}: (${x},${y}) is empty`)
    out[y]![x] = key
  }
  const h = out.length
  const w = out[0]!.length
  const side = spec.size ?? Math.max(w, h)
  const left = Math.floor((side - w) / 2)
  const top = Math.floor((side - h) / 2)
  const rows: string[] = []
  for (let y = 0; y < side; y++) {
    const src = out[y - top]
    rows.push(Array.from({ length: side }, (_, x) => src?.[x - left] ?? '.').join(''))
  }
  return rows
}

const [dir, flag] = process.argv.slice(2)
if (!dir) {
  console.error('Usage: pnpm tsx scripts/import-icons.ts <path to 1-bit_Pixel_Icons/Sprites> [--regions]')
  process.exit(1)
}

if (flag === '--regions') {
  for (const [name, spec] of Object.entries(SPECS)) {
    const g = load(dir, spec.file)
    const id = areas(g)
    console.log(`${name} (${spec.file}) ${g[0]!.length}×${g.length}`)
    for (let y = 0; y < g.length; y++)
      console.log(
        `${String(y).padStart(2)} ` +
          g[y]!.map((c, x) => (c === 'w' ? String.fromCharCode(97 + (id[y]![x]! % 26)) : c === 'k' ? '#' : '.')).join(''),
      )
  }
  process.exit(0)
}

const body = Object.entries(SPECS)
  .map(([name, spec]) => {
    const rows = convert(dir, spec)
    return `  /** ${spec.file} */\n  ${name}: [\n${rows.map((r) => `    '${r}',`).join('\n')}\n  ],`
  })
  .join('\n')

writeFileSync(
  OUT,
  `// Generated by scripts/import-icons.ts from the "1-bit Pixel Icons" pack: don't edit by hand, change SPECS and re-run.
export const PACK_ICONS = {
${body}
} as const
`,
)
console.log(`Wrote ${Object.keys(SPECS).length} icons to ${path.relative(ROOT, OUT)}`)
