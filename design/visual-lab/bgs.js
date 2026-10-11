/*
 * Pokédice Visual Lab: Backgrounds. 88 pictures for the game's 295 areas: shared scenes reused across regions (routes,
 * caves, towns, the League), legendary lairs of the same kind shared across regions, and one-off landmarks. Each is
 * one Gemini prompt for one 288 × 276 Home scene; the banner strips and the 240 × 160 battle background are cut from it
 * in code, centred on its horizon, and battle draws the player's and the opponent's zones on top as translucent ovals.
 * Prompts are assembled from a shared style block, a light (mood + palette) and the picture's scene, so the set stays
 * one family. The preview fits a generated image to the game's pixel grid and shows its three uses.
 * Regions: one more picture per region, the region's own card in the region switcher (public/region-art/<id>.png).
 * Center & Day Care: the room behind the Center's healing scene (public/backgrounds/pokemon-center.png) and the Day
 * Care's yard, a Home-style scene (public/area-art/daycare.png); the Versus widget's banner (public/backgrounds/versus.png).
 * Special events: each event's banner, on its page and its unlock pop-up (public/event-art/<id>.png), a wide strip.
 * Self-contained: it renders the first time its tab is shown.
 */
;(function () {
  'use strict'
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const fold = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[♀♂’'.]/g, '')
      .toLowerCase()
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const store = {
    get(k, d) {
      try {
        return localStorage.getItem('pdlab.bg.' + k) ?? d
      } catch {
        return d
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('pdlab.bg.' + k, v)
      } catch {
        /* private mode */
      }
    },
  }

  // ================================================================== one picture, three uses (game pixels)
  const W = 288,
    H = 276
  const HORIZON = 94 // a third of the way down: where the lab's own Home scenes put it
  const BATTLE = { w: 240, h: 160, x: (W - 240) / 2, above: 80 } // the horizon sits halfway down the battle stage
  const STRIPS = [
    { h: 56, label: 'Areas list' },
    { h: 96, label: 'Area details' },
  ]
  // Battle zones in stage pixels, where the lab's battle stage puts its platforms (scenes.js layoutFor).
  const ZONES = {
    foe: { x: 173, y: 98, rx: 46, ry: 11 },
    own: { x: 65, y: 160, rx: 72, ry: 16 },
  }
  const stripTop = (hz, h) => clamp(Math.round(hz - h * 0.55), 0, H - h)
  const battleTop = (hz) => clamp(Math.round(hz - BATTLE.above), 0, H - BATTLE.h)

  // ================================================================== the prompt parts
  const STYLE =
    'Style: "Johto Daybreak", the look of the game Pokédice. Crisp, low-resolution pixel art in the spirit of Pokémon HeartGold/SoulSilver and Black/White backdrops, redrawn brighter and calmer. A strict square pixel grid, every art pixel the same size, hard edges, no anti-aliasing, no blur and no smooth gradients: colour transitions use ordered (Bayer checkerboard) dithering. A limited palette of about 32 colours with 2–3 shading steps per material. No black outlines around the scenery: shapes read through flat colour, a lighter highlight row along top edges, and cool bluish shadows. The darkest colour anywhere is deep navy #24304F, never pure black. Airy, optimistic and readable at a small size.'
  const REF =
    'A style reference image is attached: match its pixel size, palette family, ordered dithering and level of detail exactly. Do not copy its layout or subject.'
  const AVOID =
    'Avoid: any characters, people, Pokémon or animals; battle platforms, circles or rings drawn on the ground; text, letters, numbers, signs with writing, logos, watermarks, signatures; UI, frames or borders; photorealism, 3D rendering, painterly brushwork, smooth gradients, blur, noise, anti-aliasing; isometric or top-down views; a tilted horizon.'
  const head = (p) => {
    const n = p.areas.length,
      k = regionsOf(p).length
    if (p.kind === 'shared')
      return `Pixel-art background for a Pokémon-style mobile game: "${p.name}", a scene reused by ${n} areas across ${k} ${k === 1 ? 'region' : 'regions'}, so keep it generic and timeless: no named place, no unique landmark.`
    if (p.kind === 'lair')
      return `Pixel-art background for a Pokémon-style mobile game: "${p.name}", the hidden lair of a legendary creature, reused by ${n} secret areas in ${k} regions, so keep it generic: no named place.`
    return `Pixel-art background for a Pokémon-style mobile game: ${p.name}, in the ${REGION[p.r]} region.`
  }
  const comp = (a) =>
    `Format: one square image (1:1). It will be cropped and shrunk to 288 × 276 pixels, so draw it as if on a 288 × 276 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 4 screen pixels wide.
This one picture is used three ways, so compose it for all three:
1. Home screen: the whole picture, with three small creature sprites roaming the ground.
2. Banners: thin full-width strips cut around the horizon, so the ${a.kind === 'own' ? "place's main landmark" : "scene's most characteristic feature"} sits on or just above the horizon line and reads inside that band.
3. Battle: the middle 240 × 160 becomes the battle scene. The game draws two translucent oval zones on the ground itself: the opponent's on the right, just below the horizon, and the player's at the bottom left.
Composition: a front-facing, eye-level view. The horizon (or, indoors, the foot of the back wall) is one straight, level line about one third of the way down. Keep the top fifth simple, sky or ceiling only: a name plate covers it on Home. Below the horizon, open, flat, walkable ground (${a.ground}) with light texture only; nothing tall, no water edge or path crossing the right side just below the horizon or the lower left, where the battle zones go. Tall things (trees, pillars, buildings) stand at the far left and right edges, the outer twelfth on each side, which only Home shows. Gentle depth: smaller details near the horizon, bigger tufts or stones along the bottom edge.`

  // Lights: the Daybreak palette and its mood variants. Hexes come from the lab's own scenery (home.js, scenes.js).
  const LIGHTS = {
    morning: {
      name: 'Morning',
      sw: ['#76bff3', '#d8eef8', '#fde4c8', '#a9bde6', '#97d576', '#55a466'],
      text: 'Light: clear early morning. Sky from azure #76BFF3 through pale blue #BFE4F9 to cream #F1EFE6 and peach #FDE4C8 at the horizon; a soft pale sun in the upper right with a dithered warm bloom; a few round white clouds with #D3E3F3 undersides. Far hills periwinkle #C8D6F0 to #93A8D9; grass #A7DE82 to #79BF62 with tufts #5FAE55; foliage in round clumps #7CC574, #55A466, #3C8457. Stone, pavement and walls in pale greys #E6E9F0 to #A8B0C2 with periwinkle shading.',
    },
    golden: {
      name: 'Golden hour',
      sw: ['#7a5a9e', '#e0808a', '#f4a07c', '#ffe0a8', '#b0ae6a', '#66804c'],
      text: 'Light: golden late afternoon. Sky from lavender #7A5A9E through rose #E0808A and apricot #F4A07C to honey #FFE0A8 at the horizon; a low warm sun; clouds tinted #F6C8B8. Far hills mauve #B58AB8 to #6C5290; grass and fields olive-gold #C2BC78 to #8C9258; foliage #8BA25E, #66804C, #4A603E; long lilac shadows.',
    },
    twilight: {
      name: 'Twilight',
      sw: ['#1e1838', '#5e3e78', '#82568e', '#f4f0d8', '#7a8478', '#c8b8ff'],
      text: 'Light: violet twilight with drifting mist. Sky deep indigo #1E1838 through plum #5E3E78 to mauve #82568E; a pale moon #F4F0D8 in the upper left. Silhouettes #4A3C6A to #2E2548; ground sage-grey #7A8478 to #566058; dark foliage #4A5A50 and #2C3832; small lilac glints #C8B8FF. Spooky but gentle, never horror.',
    },
    night: {
      name: 'Night',
      sw: ['#24304f', '#36256a', '#bfe4f9', '#3f6e6a', '#ffe7a8', '#fbfdff'],
      text: 'Light: clear night. Sky navy #24304F through indigo #36256A with scattered single-pixel stars and a bright moon or glow; moonlit edges in pale blue #BFE4F9; ground and foliage in cool blue-greens #3F6E6A to #24304F; warm lamp or lantern light #FFE7A8 where there are buildings. Calm and magical.',
    },
    snow: {
      name: 'Snow',
      sw: ['#9cc8ec', '#f6f9fc', '#d6e2f0', '#b9cde6', '#7fa89c', '#3f6e6a'],
      text: 'Light: crisp snowy morning. Sky #9CC8EC to almost white #F6F9FC; snow #FBFDFF shaded #E2EBF5, #D6E2F0 and #B9CDE6; rock blue-grey #93A8D9; conifers teal #7FA89C, #5F8F86, #3F6E6A; a few falling snow pixels.',
    },
    ice: {
      name: 'Ice cave',
      sw: ['#e6f6ff', '#a8dcf6', '#7cc0ea', '#3e5690', '#2a3a5e', '#ffffff'],
      text: 'Light: cold glacial cave light. Ice cyan #A8DCF6 and #7CC0EA, frost white #E6F6FF, deep blue shadows #3E5690 and #2A3A5E, white sparkle pixels on edges, blue light glowing through the ice.',
    },
    volcanic: {
      name: 'Volcanic',
      sw: ['#5a2a3a', '#c85a3a', '#f8c878', '#9a7a76', '#a87a50', '#ff8a3d'],
      text: 'Light: smoky volcanic glow. Sky maroon #5A2A3A through brick #C85A3A to amber #F8C878; ash clouds #9A7A76 and #685056; rust-brown ground #B8885A to #885E40; dark rock #6A3A3A and #422228; lava orange #FF8A3D with yellow #FFD070 cores and a soft dithered glow.',
    },
    desert: {
      name: 'Desert',
      sw: ['#bfe4f9', '#f1e2b8', '#e8d29a', '#cfae6e', '#b8945a', '#b9a3c8'],
      text: 'Light: hot, hazy desert morning. Pale sky #BFE4F9 fading into a sand haze #F1E2B8; dunes gold-beige #E8D29A, #CFAE6E, #B8945A; sun-bleached rock #E6D8C0; lilac shadows #B9A3C8; drifting sand in dithered streaks.',
    },
    rain: {
      name: 'Rain',
      sw: ['#c8d6e6', '#e2ecf4', '#bfe6ff', '#6fb978', '#55a466', '#3c8457'],
      text: 'Light: soft rain under a bright overcast sky. Sky pale grey-blue #C8D6E6 to #E2ECF4; fine diagonal rain streaks one pixel wide; wet, saturated greens #6FB978, #55A466, #3C8457; puddles and water reflecting the sky in #BFE6FF; navy-tinted shadows.',
    },
    forest: {
      name: 'Forest',
      sw: ['#9ed8f6', '#7cc574', '#55a466', '#2f6e49', '#6b4a34', '#fff3b0'],
      text: 'Light: sun-dappled forest. Canopy #3C8457, #2F6E49, #255C3D; mid foliage #55A466 and #7CC574; mossy floor #5FAE60 to #3F8A4A; trunks and roots #6B4A34; small sky gaps #9ED8F6; shafts of pale-yellow light #FFF3B0 drawn with dither.',
    },
    cave: {
      name: 'Cave',
      sw: ['#3a3352', '#4a4166', '#5a507a', '#7a6e86', '#8ff0ff', '#ff9ad8'],
      text: 'Light: warm lantern light in a cave. Walls dusky violet #3A3352, #4A4166, #5A507A; floor #7A6E86 to #625870; darkest cracks #2C2640; a few glinting gems in cyan #8FF0FF and pink #FF9AD8; a soft warm pool of light where the ground is walkable.',
    },
    deep: {
      name: 'Deep cave',
      sw: ['#1e1a2e', '#28223c', '#322a4a', '#4e465c', '#6a8cff', '#9a6aff'],
      text: 'Light: a dark cave lit by one soft glow. Walls #1E1A2E, #28223C, #322A4A; floor #4E465C to #3E364A; a pool of light in the middle fading out in dither; accent glints #6A8CFF and #9A6AFF. Dark but readable, never pure black.',
    },
    crystal: {
      name: 'Crystal glow',
      sw: ['#2a3a5e', '#3e5690', '#6a7aa0', '#8ff0ff', '#c8a0ff', '#ff9ad8'],
      text: 'Light: crystal glow. Walls deep blue #2A3A5E, #34487A, #3E5690; floor #6A7AA0 to #536288; glowing crystals in cyan #8FF0FF, lilac #C8A0FF and pink #FF9AD8 that light the stone around them with dithered halos.',
    },
    labday: {
      name: 'Lab daylight',
      sw: ['#e4ecf6', '#fbfdff', '#a9d3ff', '#b6c3d9', '#a0704a', '#ffe7a8'],
      text: 'Light: bright, clean indoor daylight. Walls pale blue-white #E4ECF6 and #FBFDFF, window sky #A9D3FF, cool grey-blue trims #B6C3D9, warm wood #A0704A, soft gold accents #FFE7A8; sunlight falls from the window in a dithered band across the floor; cheerful and welcoming, the place where a journey starts.',
    },
    indoor: {
      name: 'Indoor',
      sw: ['#3a4466', '#46527a', '#56638c', '#6a7090', '#dde5f0', '#ffd23a'],
      text: 'Light: indoor, cool electric light. Walls slate #3A4466, #46527A, #56638C; floor #6A7090 to #535878; metal highlights #DDE5F0; warning-yellow lamps #FFD23A; small coloured indicator pixels; tidy, readable shapes.',
    },
    ethereal: {
      name: 'Otherworldly',
      sw: ['#24304f', '#c8b8ff', '#8ff0ff', '#ffe7a8', '#fbfdff', '#82568e'],
      text: 'Light: otherworldly glow. Pearly white #FBFDFF, pale gold #FFE7A8, lilac #C8B8FF and soft cyan #8FF0FF over a deep navy #24304F sky with scattered stars; glowing edges, floating motes, a sense of awe.',
    },
  }

  let D = null // { regions, pictures, areas }
  const REGION = {}
  const AREA = {}
  const KINDS = {
    shared: { label: 'Shared scenes', one: 'Shared scene', note: 'generic, reused across regions' },
    lair: { label: 'Legendary lairs', one: 'Legendary lair', note: 'one kind of lair, shared across regions' },
    own: { label: 'Landmarks', one: 'Landmark', note: 'a place of its own' },
    moment: { label: 'Story moments', one: 'Story moment', note: 'not an area: the stage of a moment in the game' },
    region: { label: 'Regions', one: 'Region card', note: "not an area: the region's own picture on its card in the region switcher" },
    place: { label: 'Center, Day Care & Versus', one: 'Place', note: 'not an area: the backdrops of the Pokémon Center and the Day Care, and the Versus banner' },
    event: { label: 'Special events', one: 'Event banner', note: "not an area: an event's banner, on its page and its unlock pop-up" },
  }
  // Story moments: full-stage scenes (240 × 160) for moments of the game rather than areas. Their stand-in is drawn
  // by the lab (anims.js) until the generated picture replaces it.
  const MOMENTS = [
    {
      id: 'moment-lab',
      kind: 'moment',
      name: 'Pokémon Lab',
      light: 'labday',
      areas: [],
      stand: 'lab',
      uses: ['Picking a partner when a new region opens (Areas → Regions → Enter)', 'Picking the first partner of a new game'],
      scene:
        "A Pokémon professor's research lab seen from the front. A long white lab table runs across the foreground, with three small round padded cradles evenly spaced on it, empty and waiting. Behind it, a bright back wall with a large window of morning sky at the centre-left, tall wooden bookshelves full of colourful book spines at the far left, a research computer and humming machines with small indicator lights at the far right, potted plants in the corners, a clean tiled floor, fluorescent panels on the ceiling.",
    },
  ]
  // Regions: one picture per region, the head of its card in the region switcher (Areas → Regions). Not an area, so
  // no light from LIGHTS: each has its own palette, in the same family (navy darkest, no black), so the nine cards
  // read as nine places side by side. The game shows it as a 10:3 strip cut from its middle (src/fx/regionArt.ts).
  const REGION_FILE = (id) => `public/region-art/${id}.png`
  const REGION_PICS = [
    {
      r: 'kanto',
      mood: 'Clear morning',
      sw: ['#76bff3', '#fde4c8', '#97d576', '#55a466', '#e0604a', '#5b8def'],
      landmark: 'the plateau of the League on the far horizon',
      scene:
        'Where every journey starts. In the foreground, the edge of a quiet little country town: two or three small white houses with red and blue roofs, low white picket fences, a tidy hedge, a dirt path leading away from the viewer between flower beds. Beyond it, soft rolling green meadows, a calm river glinting as it winds toward a sliver of blue sea on the right. On the far horizon, at the centre, rises one grand flat-topped mountain plateau with a stately pale building with a red roof on its summit and a thin waterfall down its cliff: the League, the goal of the whole journey. Classic, nostalgic, wide open.',
      palette:
        'Palette: clear early morning. Sky from azure #76BFF3 through pale blue #BFE4F9 to peach #FDE4C8 at the horizon, a few round white clouds with #D3E3F3 undersides. Meadows #A7DE82 to #79BF62, trees in round clumps #7CC574, #55A466, #3C8457. Roofs in friendly red #E0604A and blue #5B8DEF, white walls #FBFDFF shaded #DDE5F0. The plateau periwinkle #93A8D9 to #6C7FB8, its building cream #F1EFE6. Water #8FD0F0.',
    },
    {
      r: 'johto',
      mood: 'Autumn afternoon',
      sw: ['#7ab8e8', '#ffe0a8', '#e0604a', '#c8402e', '#f4a07c', '#2e8a8a'],
      landmark: 'the tall golden-roofed pagoda rising above the maples',
      scene:
        'An old town of tradition in autumn. In the middle distance, at the centre, a tall nine-tiered wooden pagoda with curved roofs and golden ornaments on every tier rises above a grove of maple trees in flame red, orange and gold; to its left and lower, the dark silhouette of a second, roofless burned tower in ruins. In front, low traditional wooden houses with grey-teal tiled roofs, paper screens and a stone lantern line a quiet street of pale flagstones. Far behind, a range of hazy blue mountains with one tall dark peak. Maple leaves drift in the air. Calm, timeless, a little melancholic.',
      palette:
        'Palette: golden autumn afternoon. Sky soft blue #7AB8E8 warming to honey #FFE0A8 at the horizon. Maple foliage in red #E0604A, deep red #C8402E, orange #F4A07C and gold #FFD070. Pagoda wood dark brown #6B4A34 and #8A5A3A, roof tiles teal-grey #2E8A8A to #3F6E6A, ornaments gold #FFD070. Flagstones #E6D8C0 shaded #B9A3C8. Far mountains #93A8D9 to #6C5290.',
    },
    {
      r: 'hoenn',
      mood: 'Tropical day',
      sw: ['#5cc8f0', '#ffffff', '#3ec8c0', '#f1e2b8', '#55a466', '#b8885a'],
      landmark: 'the smoking volcano across the bay',
      scene:
        'A land of sea and fire. Across the middle, a wide turquoise bay with gentle white surf, a few small green islets and a tiny white sail. Rising behind the bay, at the centre-right, a broad volcano with a ring of ash-grey rock at its crater and a soft plume of white-grey smoke drifting sideways; a thin cable-car line climbs its green lower slope. In the foreground, a white sand beach, leaning palm trees at the far left and right edges, and lush jungle ferns. Towering white cumulus clouds in a deep summer sky. Hot, lush, adventurous.',
      palette:
        'Palette: bright tropical midday. Deep sky #5CC8F0 to pale #BFE6FF at the horizon, cumulus #FFFFFF with #D3E3F3 undersides. Sea turquoise #3EC8C0 to teal #2A9AB8, surf #E6F6FF. Sand #F1E2B8 to #E8D29A. Jungle and palms #7CC574, #55A466, #2F6E49. Volcano rust-brown #B8885A to #885E40, crater rock #6A3A3A, smoke #E2D8E0 to #9A7A76.',
    },
    {
      r: 'sinnoh',
      mood: 'Snowy dawn',
      sw: ['#c8b8ff', '#f6f9fc', '#d6e2f0', '#93a8d9', '#3f6e6a', '#ffe7a8'],
      landmark: 'the huge snow-capped mountain that splits the land in two',
      scene:
        'A northern land of legends, cut in two by one enormous mountain. At the centre, a massive snow-capped mountain range with one towering jagged peak, its summit catching the first pink light; on the very top, the faint shapes of a few ancient broken stone pillars. Snowy conifer forests climb its flanks. In the middle distance, a frozen lake reflecting the sky, and at the right edge a small snowy town with steep roofs and warm lit windows. In the foreground, deep untouched snow with a few small snowy pines. Quiet, cold, majestic.',
      palette:
        'Palette: crisp snowy dawn. Sky lilac #C8B8FF fading to pale rose #F6D8E0 and almost white #F6F9FC at the horizon. Snow #FBFDFF shaded #E2EBF5, #D6E2F0 and #B9CDE6; the peak lit rose #F6C8D8 on its sunny side. Rock blue-grey #93A8D9 to #6A7AA0. Conifers teal #7FA89C, #5F8F86, #3F6E6A. Frozen lake #BFE4F9. Warm windows #FFE7A8.',
    },
    {
      r: 'unova',
      mood: 'Big-city day',
      sw: ['#8ec8f0', '#e6e9f0', '#a8b0c2', '#4a6aa8', '#2a9ab8', '#f2553f'],
      landmark: 'the skyscraper skyline and the long suspension bridge',
      scene:
        "A great modern city by the sea. At the centre, a dense skyline of tall skyscrapers of glass and steel, the tallest in the middle, stepping down to both sides; a long white suspension bridge with tall towers and cables sweeps in from the left across a wide blue river mouth toward the city. A container port with a few cranes and a ferry at the right. In the foreground, a waterfront promenade of pale paving with a railing, young street trees and lamp posts. Light, crisp, ambitious, a country of big cities.",
      palette:
        'Palette: crisp clear late morning. Sky #8EC8F0 to pale #E2F2FB at the horizon with long thin high clouds. Glass towers in steel blues #4A6AA8, #6A8AC8 and sky reflections #BFE4F9, concrete and stone #E6E9F0 to #A8B0C2, a few warm accents #F2553F on the port cranes and the ferry. Bridge white #FBFDFF shaded #B6C3D9. Water #2A9AB8 to #3E5690 with pale glints. Trees #55A466.',
    },
    {
      r: 'kalos',
      mood: 'Evening lights',
      sw: ['#24304f', '#36256a', '#82568e', '#fff3b0', '#ffe7a8', '#f1e2c8'],
      landmark: 'the slender iron tower glowing at the centre of the city',
      scene:
        "A city of art and elegance at dusk. At the centre, a very tall, slender iron lattice tower with a pointed top, its girders glowing with soft electric light, stands over a round city of elegant cream stone buildings with blue-grey slate mansard roofs, small balconies and lit windows, laid out around a circular plaza. Avenues of trimmed trees and old street lamps. Far away on the left, a fairy-tale château on a hill. In the foreground, a pale stone terrace with a balustrade and planters of flowers. Romantic, refined, a little magical.",
      palette:
        'Palette: blue hour, just after sunset. Sky navy #24304F at the top through indigo #36256A and mauve #82568E to a last rose glow #E0808A on the horizon, first stars as single pixels. The tower steel #6A7AA0 lit pale yellow #FFF3B0 with a dithered halo. Stone façades cream #F1E2C8 in shade #B9A3C8, slate roofs #46527A, windows and lamps warm #FFE7A8. Trees #3F6E6A.',
    },
    {
      r: 'alola',
      mood: 'Tropical sunset',
      sw: ['#5e3e78', '#e0608a', '#f4a07c', '#ffd070', '#3ec8c0', '#2f6e49'],
      landmark: 'the island chain and its tall volcanic peak against the sunset',
      scene:
        "An archipelago of four tropical islands. Across the middle, a calm sea glittering in the sunset, with three or four lush green islands of different sizes, the largest rising at the centre into a tall volcanic mountain with a touch of snow on its tip; a pale ancient stone ruin sits on a green headland. In the foreground, a curve of golden beach with a small wooden pier, palm trees silhouetted at the far left and right edges and big red hibiscus flowers. Warm, relaxed, welcoming, island life.",
      palette:
        'Palette: tropical sunset. Sky plum #5E3E78 through magenta-rose #E0608A and coral #F4A07C to gold #FFD070 at the horizon, with long pink clouds. The sea reflecting it in gold and rose, turquoise #3EC8C0 near the beach. Islands deep green #2F6E49 to #55A466 with lilac shadows #7A5A9E, the snowy tip #F6D8E0. Sand #F1D8A0. Palm silhouettes #4A3C6A. Hibiscus #E0604A.',
    },
    {
      r: 'galar',
      mood: 'Bright overcast',
      sw: ['#a9c4e0', '#e6e9f0', '#8fbf6a', '#5f9a50', '#b05a48', '#c8b89a'],
      landmark: 'the great round stadium and the city clock tower on the skyline',
      scene:
        'A green and proud land of sport. In the foreground and middle, gently rolling hills of patchwork fields divided by dry-stone walls and hedgerows, with a winding country lane and a little stone bridge over a stream. In the middle distance, at the centre, a great modern round stadium with a fabric roof and floodlight masts; to its right, the skyline of an old capital city of red brick and pale stone with a tall gothic clock tower with a big round clock face (no numbers), and a giant Ferris wheel at the far right. A soft windy sky with big clouds and a few sunbeams. Grand, sporty, a little old-world.',
      palette:
        'Palette: bright overcast with sunbreaks. Sky soft grey-blue #A9C4E0 to pale #E2ECF4, big clouds #FBFDFF with grey-lilac undersides #C8D0E0, dithered sunbeams #FFF3B0. Fields #8FBF6A, #5F9A50, #3F7A48, stone walls #C8B89A shaded #9A8A7A. Brick #B05A48 and #8A4A40, pale stone #E6E9F0, stadium white #FBFDFF with #93A8D9 shading. Clock tower stone #E8D29A shaded #B8945A.',
    },
    {
      r: 'paldea',
      mood: 'Mediterranean noon',
      sw: ['#6cc0f0', '#f1e2b8', '#e08a5a', '#c86a48', '#8ca050', '#c8a0ff'],
      landmark: 'the colossal crater in the heart of the land',
      scene:
        "A sun-drenched land around a vast mystery. In the middle distance, at the centre, the rim of a colossal round crater wide enough to fill a third of the view, its cliffs sheer and its inside hidden under a slow ring of white clouds, a faint lilac crystal glint deep within. Around it, open golden plains, flat-topped mesas of ochre rock and lines of olive trees. In the foreground, the edge of a hillside town of white-washed walls and terracotta roofs, with a small bell tower, arches and bright flower pots. Sunny, free, an open world calling to be explored.",
      palette:
        'Palette: hot Mediterranean noon. Sky deep #6CC0F0 to pale #E2F2FB at the horizon, few clouds. Plains gold #E8D29A and #CFAE6E, mesas ochre #E08A5A to #B8885A, crater cliffs #C86A48 and #885E40, its clouds #FBFDFF shaded #D6E2F0, crystal glints #C8A0FF and #8FF0FF. Olive trees #8CA050 and #5F7A3E. White-washed walls #FBFDFF shaded #DDE5F0, terracotta roofs #E0604A and #C8402E.',
    },
  ]
  // The Pokémon Center: the room behind the healing scene (src/fx/timelines/center.ts), a 240 × 160 stage the game
  // draws in code today (src/fx/scenes.ts center()). The game keeps drawing its moving parts on top, so the picture
  // leaves their places empty: the machine is in the picture but its three slots (SLOTS) stay empty for the balls, Chansey behind the
  // counter at the right, the heart trace on the wall screen. Its palette is CENTER's, from scenes.ts.
  const CENTER_PIC = {
    id: 'center-interior',
    kind: 'place',
    name: 'Pokémon Center',
    areas: [],
    file: 'public/backgrounds/pokemon-center.png',
    size: '240 × 160, ask 3:2',
    ask: '3:2',
    width: 240,
    uses: ['The healing scene at a Pokémon Center (full-screen pop-up)'],
    empty: ["the machine's 3 slots (balls drop in)", 'Chansey, behind the counter right', 'the trace on the wall screen'],
    then: "<code>src/fx/scenes.ts</code> <code>center()</code> draws it as the Center's background instead of the drawn room (the app doesn't read it yet)",
    head: 'Pixel-art background for a Pokémon-style mobile game: the inside of a Pokémon Center, the room behind the scene where the team is healed. Generic: no named town, no named nurse.',
    avoid:
      'No Poké Balls in the slots or anywhere on the counter (the flat wall emblem is the only Poké Ball shape), no nurse or Chansey, no trace or heart on the monitor, no glow: the game draws them. No lettering on the wall, the counter, the machine or the screen.',
    now: () => window.SCN?.center?.('daybreak', 240, 160),
    nowAlt: 'as the game draws it today',
    comp: () => centerComp(),
    mood: 'Warm and cosy',
    sw: ['#fff8f6', '#ff8fa3', '#f0627e', '#ffc2cd', '#f4f1fb', '#24304f'],
    scene:
      'The inside of a Pokémon Center, seen from the front: a long white-and-pink reception counter across the lower part of the room, the healing machine on its middle with three empty Poké Ball slots, its right end left bare, a cream back wall with a pink stripe, a big Poké Ball emblem on the wall at the centre, a dark heart-monitor screen on the wall at the upper left, a checkered floor in front. Bright, clean, cosy and warm: a safe place to rest.',
    palette:
      'Palette: the classic Pokémon Center, warm and soft. Back wall cream-white #FFF8F6 shading to blush #FFEAE6 and #F6D6D2 near the counter, thin vertical wall seams #F6D6D2. The wall stripe coral-pink #FF8FA3 with a deeper #F0627E lower edge. Counter top white #FFFFFF with a pink edge #FFD8DF and shade #E9A8B6; counter front panel soft pink #FFC2CD with seams #F3A2B3 and a navy #24304F foot line. Floor tiles pale lilac-white #F4F1FB and #E6E2F3. Emblem pink #FF8FA3 softened toward the wall colour, its band and outline #F6D6D2. The healing machine blue-grey #8AA0C8 and #5D74A3 with a lighter top edge, its slots deep navy #24304F with #8AA0C8 rims. Plants #7CC574 and #55A466 in white pots. The monitor frame and screen deep navy #24304F. Soft warm light from above, no harsh shadows.',
  }
  const centerComp = () =>
    `Format: one landscape image (3:2). It will be shrunk to 240 × 160 pixels, so draw it as if on a 240 × 160 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 4 screen pixels wide.
It is the whole stage of the game's healing scene, shown full screen. The game draws its moving parts on top of this picture, so their places must stay EMPTY and calm: up to three Poké Balls dropping into the machine's slots, the nurse Pokémon behind the counter, the heart-rate trace on the wall screen, hearts and sparkles rising from the machine.
Composition (positions on the 240 × 160 canvas): a front-facing, eye-level view, perfectly symmetrical lines, no perspective tilt.
- The counter runs across the full width. Its white top edge is one straight, level line at y = 100 (62 % of the way down), about 7 pixels deep; its pink front panel runs from y = 107 down to y = 131 (82 %), with evenly spaced vertical seams and a thin dark foot line. Nothing stands in front of the counter.
- The healing machine: it sits on the counter top in the middle, a low, wide, rounded console from x = 84 to x = 156 and from y = 80 down to the counter (y = 104), in soft blue-grey metal with a navy outline, a lighter top edge and a darker base. On its top, a tray with three round, EMPTY Poké Ball slots: shallow oval hollows about 14 pixels wide and 8 tall, dark inside with a light rim on their lower half, evenly spaced and centred at (102, 93), (120, 93) and (138, 93), that is 42.5 %, 50 % and 57.5 % of the width, about 58 % of the way down. Nothing in the slots: the game drops the Poké Balls into them. Behind the tray, a small flat light strip along the top of the machine from x = 104 to x = 136 at y = 76 to 81, plain and unlit (the game lights it). The wall right behind the machine is plain and light: hearts and a soft glow rise there.
- The nurse's spot: behind the counter at the right, from x = 170 to x = 220, the wall from y = 55 down to the counter is plain, with nothing on the counter there: the game draws a nurse Pokémon standing behind the counter whose lower body the counter hides.
- The heart-rate monitor: a wall screen at the upper left, a navy frame around a dark, EMPTY screen spanning about x = 34 to 70 and y = 22 to 44, on a short stand or bracket. No trace, no line, no heart, no glyphs on it: the game draws them.
- The emblem: a big flat Poké Ball emblem, about 45 pixels wide, centred on the back wall at x = 120, y = 30, in soft pink and white, painted flat on the wall.
- The wall stripe: a coral-pink horizontal band across the back wall from y = 60 to y = 70.
- The floor: from y = 132 to the bottom, a clean checkered tile floor of large pale tiles (about 12 × 6 pixels each), a little darker just in front of the counter.
- The top fifth is a calm ceiling edge with a couple of flat light panels. Decor stays at the far left and right edges (the outer twelfth of each side): a potted plant at the far left and far right, maybe a small bench; nothing tall in the middle.`
  // The Day Care's yard: the top of the Day Care screen, laid out like Home (a 288 × 276 scene the residents roam).
  // It is an area-style picture (1:1, 400 px, public/area-art/, read through artUrl and ART_GEOMETRY in
  // src/fx/areaArt.ts). The game's Day Care screen has no yard yet; the lab draws one (home.js, scene 'daycare'), and
  // the composition keeps its geometry: horizon 98, walk 22–266 × 160–268, pond at 75,221 (44 × 13), the Egg's nest
  // at 214,236, all in scene pixels. In the square: scene y → 8 + y × 1.39, scene x → x × 1.39.
  const DAYCARE_PIC = {
    id: 'daycare-yard',
    kind: 'place',
    name: 'Day Care',
    areas: [],
    file: 'public/area-art/daycare.png',
    size: '400 px, ask 1:1 · Home-style scene',
    ask: '1:1',
    width: 400,
    uses: ["The Day Care screen's yard, on top like Home's scene, the residents roaming it"],
    empty: ['the lawn from 57 % down, 8–92 % across', 'the nest spot, lower right', 'the pond water (swimmers)'],
    then: "the Day Care screen shows it as its yard; its geometry for <code>ART_GEOMETRY</code> in <code>src/fx/areaArtMap.ts</code>: horizon 98, walk [22, 160, 266, 268], pond { x: 75, y: 221, rx: 44, ry: 13 } (the app has no yard yet)",
    head: "Pixel-art background for a Pokémon-style mobile game: the Day Care, a cosy countryside house where trainers leave their creatures to be looked after, seen from its fenced yard. Generic: no named town, no named keeper.",
    avoid:
      'No creatures, eggs or nests anywhere: the game draws them. No lettering on the sign or the house, no path crossing the lawn, nothing standing on the lawn.',
    now: () => labScene('daycare', false),
    nowAlt: "the yard as the lab draws it today",
    comp: () => dayCareComp(),
    mood: 'Sunny morning',
    sw: ['#76bff3', '#a7de82', '#fbf3e2', '#f07a3a', '#5aa9e0', '#ff8fb0'],
    scene:
      "The Day Care's yard on a sunny morning: a small cream cottage with a warm orange roof on a gentle grassy rise at the back, a white picket fence running across the scene in front of it, then a wide open lawn where the residents play, a little round pond in the lower left, a flower and vegetable garden along the fence, trees at the far edges. Peaceful, homely and safe.",
    palette:
      'Palette: clear early morning in the countryside. Sky azure #76BFF3 through pale blue #BFE4F9 to cream #F1EFE6 at the horizon, a few round white clouds with #D3E3F3 undersides; far hills periwinkle #C8D6F0 to #93A8D9. Lawn #A7DE82 to #79BF62 with tufts #5FAE55; trees in round clumps #7CC574, #55A466, #3C8457. The cottage: walls cream #FBF3E2 shaded #E8D8B8, roof orange #F07A3A with a light ridge #FFB070, chimney and door warm wood #9A5A3A and #A0704A, windows #A9D3FF, flower boxes pink #FF8FB0, the round sign white #FBFDFF with a soft green Egg #9BE3A0. Fence white #FFFFFF shaded #C8DCC0. Pond #5AA9E0 and #4A96D4 with a pale rim #BFE6FF and banks #6FB978; flowers in pink #FF9CC2, yellow #FFE07A and white.',
  }
  const dayCareComp = () =>
    `Format: one square image (1:1). It will be shrunk to 400 × 400 pixels, so draw it as if on a 400 × 400 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 5 screen pixels wide.
It is the yard at the top of the game's Day Care screen, shown like its Home scene: the game trims a sliver off the top and the bottom, prints a title plate over the top, and draws the resident creatures roaming the lawn, an Egg in its nest, hearts and notes. So the lawn must stay open and EMPTY.
Composition (positions as a share of the square, from its top-left corner): a front-facing view from a slightly raised eye level.
- The horizon, the foot of soft far hills, is one straight, level line about 36 % of the way down. Keep the top fifth simple, sky only: the title plate covers it.
- The Day Care house stands at the back, on a gentle grassy rise a little left of centre (around 30 % across), its base on the horizon: a small, cosy cottage about a fifth of the picture wide, cream walls, a warm orange roof with a chimney, two windows with pink flower boxes, a wooden door, and a round sign over the door showing a plain Egg shape, no letters.
- A white picket fence runs straight across the whole width at about 43 % down, closing the yard; a small open gate in it below the house.
- The lawn: from about 57 % down to the bottom edge and from 8 % to 92 % across, open, flat, sunny grass with light texture only (short grass, clover, a few tiny flowers). No path crosses it; no rocks, bushes, toys or objects stand on it: the game's creatures walk here.
- A small round pond in the lower left, centred about 26 % across and 79 % down, about 30 % of the width wide and 7 % tall: calm blue water with a pale rim and a couple of lily pads; reeds and smooth stones on its edge only. Creatures that swim keep to it.
- Lower right, around 74 % across and 86 % down, a plain patch of lawn: the game puts an Egg's nest there.
- Between the fence and the house: a little flower and vegetable garden to the right of the house, a few bushes. Tall things (a round tree, a tall flowering shrub) stand at the far left and far right edges, the outer twelfth on each side; maybe a wooden bench or a water trough by the fence at the far right. Bigger grass tufts and flowers along the very bottom edge. Gentle depth: smaller details near the horizon.`
  // The Versus banner: the strip at the top of Home's Versus widget (src/screens/home/Widgets.tsx, VersusWidget),
  // shown 3:1 (aspect 288 / 96, object-cover, object-position 50% 55%). A 16:9 picture 400 px wide (400 × 225) shows
  // its rows 51–184, about 23 % to 82 % of its height, full width. The game draws the player's three Versus Pokémon big
  // and side by side on the floor in the middle, and a bold gold "VS" on the right; today it borrows region-art/galar.
  const VERSUS_PIC = {
    id: 'versus-banner',
    kind: 'place',
    name: 'Versus banner',
    areas: [],
    file: 'public/backgrounds/versus.png',
    size: '400 px wide, ask 16:9 · shown 3:1',
    ask: '16:9',
    width: 400,
    uses: ["The banner of Home's Versus widget (a 3:1 strip, 23–82 % of the picture's height)"],
    empty: ['the floor in the middle: the three Pokémon', 'the right fifth: the gold VS'],
    then: "<code>VS_BANNER</code> in <code>src/screens/home/Widgets.tsx</code> becomes <code>'/backgrounds/versus.png'</code> instead of the Galar region picture (the app doesn't read it yet)",
    head: 'Pixel-art background for a Pokémon-style mobile game: a wide banner for the Versus mode, where trainers pit their teams against each other, a battle arena at dusk under floodlights. Generic: no named stadium, no team colours of a real club.',
    avoid:
      'The flat painted Poké Ball centre circle is the only circle on the ground (no battle platforms). No creatures or trainers on the pitch, no people in the stands (only a soft silhouette band), no scoreboard text, letters, numbers or "VS": the game draws them. No banners with writing, no logos on the pitch.',
    now: () => null,
    nowAlt: '',
    comp: () => versusComp(),
    mood: 'Dusk floodlights',
    sw: ['#24304f', '#36256a', '#f2553f', '#5b8def', '#fff3b0', '#79bf62'],
    scene:
      'A battle arena seen from the edge of its pitch at dusk: a flat, bright pitch in the foreground with a simple centre line and a big Poké Ball-shaped centre circle painted on it, the near half washed in warm red light and the far side in cool blue, tall floodlight masts on both sides throwing beams down, the stands as a soft dark silhouette band of a crowd under a deep evening sky. Dramatic, exciting, but clean and calm in the middle.',
    palette:
      'Palette: blue hour under floodlights. Sky navy #24304F at the top through indigo #36256A to a last violet-rose glow #82568E at the rim of the stands; first stars as single pixels. Stands a dark silhouette band #2E2548 to #4A3C6A with tiny dithered specks of light #FFE7A8 for the crowd. Floodlights pale yellow #FFF3B0 with dithered beams and halos. Pitch grass #79BF62 to #55A466, lit pale #A7DE82 in the centre, mown stripes one tone apart; pitch lines and centre circle white #FBFDFF. The left side warmed by red light #F2553F and #FF8A73, the right side cooled by blue light #5B8DEF and #A9D3FF, meeting softly in the middle. Navy #24304F is the darkest colour.',
  }
  const versusComp = () =>
    `Format: one wide landscape image (16:9). It will be shrunk to 400 × 225 pixels, so draw it as if on a 400 × 225 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 5 screen pixels wide.
It is the banner of the game's Versus button: the game shows a full-width 3:1 strip of it, from about 23 % to 82 % of the way down (the top and bottom fifths are cropped), and draws on top of it the player's three creatures, big and side by side, standing on the pitch in the middle, and a big bold gold "VS" on the right. So their places must stay open and calm.
Composition (positions as a share of the picture, from its top-left corner): a front-facing view from pitch level, slightly raised, perfectly level lines.
- The pitch: a flat, open, evenly lit lawn from about 55 % down to the bottom edge, across the whole width. In the middle, from 22 % to 78 % across and from 55 % to 82 % down, it is plain: only soft mown stripes and the painted lines, nothing standing on it. The three creatures stand there, their feet around 78 % down, their heads reaching about 38 % down.
- The markings: a straight white centre line running from the near edge to the far edge at 50 % across, and a big round centre circle shaped like a Poké Ball (a circle split by a horizontal band with a small ring in the middle) painted flat on the grass, centred at 50 % across and about 70 % down, seen in gentle perspective as a wide oval. Flat paint only, no raised objects.
- The right fifth, from 76 % to 97 % across and from 30 % to 75 % down: calm and fairly dark (the darker blue side of the stands and pitch), with no floodlight, mast or bright detail in it, so the gold "VS" reads on top.
- The stands: a wide, soft silhouette band of a crowd across the back, from about 30 % to 52 % down, with tiny specks of light; no faces, no flags with writing, no scoreboard.
- The floodlights: two tall, thin masts at the very left and very right edges (the outer 3 %), their lamp banks near the top (10 to 25 % down) throwing dithered beams that meet over the middle of the pitch, lighting it brighter than the edges.
- The light: the left half warmed in red, the right half cooled in blue, blending smoothly across the centre line: a red-versus-blue duel mood.
- The sky above the stands: deep evening navy to indigo, mostly cropped away, so keep it simple.`
  const PLACES = [CENTER_PIC, DAYCARE_PIC, VERSUS_PIC]
  // Special events (docs/18): each event's banner, at the top of its page (a strip from about 3:1 on a phone to 8:1 on
  // a wide screen, 132 px tall, the title plate and the back arrow over its top-left corner) and of its unlock pop-up
  // (about 3.4:1, a NEW EVENT tag top-left). The game crops it from the vertical middle (object-position 50% 55%), so
  // the subject lives in a horizontal band through the centre. Until the art exists the game borrows an area picture.
  const WHEEL_BANNER = {
    id: 'event-wheel',
    kind: 'event',
    name: 'Fortune Wheel',
    areas: [],
    file: 'public/event-art/wheel.png',
    size: '480 × 206, ask 21:9 · shown as a wide strip',
    ask: '21:9',
    width: 480,
    uses: ["The Fortune Wheel's page banner (Home → Fortune Wheel)", 'Its unlock pop-up (when Routes 7 & 8 are cleared)'],
    empty: ['the top-left corner (title plate, back arrow, NEW EVENT tag)', 'no lettering anywhere: the game prints the name'],
    then: "set the Fortune Wheel's banner to <code>/event-art/wheel.png</code> in Admin → Events (and in <code>DEFAULT_CONFIG.events.wheel.banner</code>)",
    head: 'Pixel-art banner for a Pokémon-style mobile game: the "Fortune Wheel", a daily prize-wheel event where the player spins a big lit wheel once a day to win Poké Balls and coins. Generic: no named place, no host, no logo.',
    avoid:
      'No lettering, numbers, prices or symbols on the wheel, the booth, the signs or the bunting: the game prints the event name. No people, no creatures, no hands on the wheel. No casino chips, cards or dice, nothing that reads as gambling for money: a friendly fairground prize game.',
    now: () => 'assets/ev/art/evening.png',
    nowAlt: 'the area picture the game borrows until then (Routes 7 & 8, evening)',
    comp: () => wheelBannerComp(),
    mood: 'Festive golden evening',
    sw: ['#7a5a9e', '#f4a07c', '#ffbe2e', '#fff6c0', '#f2553f', '#24304f'],
    scene:
      'A festive prize booth at an evening fair in a bright city. At its heart, slightly right of centre, a big upright prize wheel on a sturdy stand, facing the viewer: a perfectly round wheel (a circle, not an ellipse) with nine equal slices in soft alternating pastel colours (cream-gold, coral, sky blue, silver-grey, lilac), a few slices showing a simple round red-and-white capsule-ball icon or a gold coin, a white hub with a red centre, a ring of glowing marquee bulbs around its golden rim, and a red arrow pointer at the very top. Behind and around it: a booth with a red-and-cream striped awning, strings of round festoon lights looping across the scene, little triangle bunting flags, gift boxes with ribbons and a few balloons stacked at the foot of the stand, sparkles in the air. Far behind, the warm skyline of a city of tall department stores and lit windows against a golden-hour sky. Cheerful, generous, inviting: today might be your lucky day.',
    palette:
      'Palette: festive golden hour. Sky from lavender #7A5A9E through rose #E0808A and apricot #F4A07C to honey #FFE0A8 at the horizon; city silhouettes mauve #B58AB8 to #6C5290 with warm windows #FFE7A8. The wheel: rim gold #FFBE2E shaded #E8A21C with a navy #24304F edge, bulbs warm white #FFF6C0 with a dithered glow, slices #FFE7A8/#FFD76A, #FFC2B8/#FF8F7F, #B8D4FF/#8AB4FF, #D6DBE6/#AAB4C8, #E2C4FF/#C58AFF, hub white #FBFDFF, pointer red #F2553F. Awning red #F2553F and cream #FFF8EC; festoon bulbs #FFF6C0; bunting coral, sky blue #5B8DEF and gold; gift boxes in the slice colours with white ribbons; booth floor warm wood #B8885A shaded #885E40.',
  }
  const wheelBannerComp = () =>
    `Format: one wide landscape image (21:9). It will be shrunk to 480 × 206 pixels, so draw it as if on a 480 × 206 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 4 screen pixels wide.
It is a banner. The game shows it as a wide strip cut from its vertical middle: about 3:1 on a phone, as wide as 8:1 on a wide screen (then only the middle third of the height shows), 132 pixels tall; on the event's pop-up about 3.4:1. A small title plate with a back arrow, or a NEW EVENT tag, sits over the top-left corner.
Composition: a front-facing, eye-level view, level lines, no tilt.
- The wheel's hub sits a little right of centre, about 58 % across and 52 % down, so the strip shows the hub and the bulb-lit slices around it at any width; the whole wheel is about 70 % of the image height tall, round and upright.
- Everything that says "prize wheel" reads inside the middle band, from about 35 % to 68 % of the way down: the hub, the slices, the bulbs, the festoon lights and the tops of the gift boxes.
- The top-left quarter stays calm: open sky and soft festoon lights only, under the title plate.
- The booth's awning and stand frame the wheel; the skyline and sky fill the far left; gift boxes and balloons stand at the foot of the stand, lower right; the booth floor runs across the bottom.
- Clean, uncluttered and readable at a small size: big simple shapes, the wheel's silhouette the clearest thing in the picture.`
  const EVENTS = [WHEEL_BANNER]
  const S = {
    region: store.get('region', 'all'),
    kind: store.get('kind', 'all'),
    ref: store.get('ref', '1') === '1',
    light: '',
    q: '',
    show: store.get('show', 'all'), // all | todo | done
  }
  const regionsOf = (p) => [...new Set(p.areas.map((o) => AREA[o].r))]

  // ================================================================== progress: which pictures are done
  // Shared through the artifact's db (collection `progress`, one doc per picture id: { done, at }) so every viewer
  // sees the same marks; without db (a saved copy, a view that can't run it) the marks stay in this browser.
  const DONE = {} // picture id -> true, as shown
  const SERVER = {} // picture id -> true, as last delivered by db
  const want = {} // picture id -> the value still to write
  const writing = {}
  let DB = null
  let mode = 'wait' // wait | db | local | ro | off
  const dbReady = window.claude?.use ? window.claude.use('db').catch(() => null) : Promise.resolve(null)
  const MODE_NOTE = {
    wait: 'Loading progress…',
    db: 'Shared: everyone who opens the lab sees these marks',
    local: 'Saved in this browser only',
    ro: "View only: you can't change progress from this account",
    off: "Progress isn't syncing right now: reload to try again",
  }
  function loadLocal() {
    try {
      const m = JSON.parse(store.get('marks', '{}'))
      for (const id in m) if (m[id] === true) DONE[id] = true
    } catch {
      /* a bad value: start empty */
    }
  }
  const saveLocal = () => store.set('marks', JSON.stringify(DONE))

  let subTries = 0
  function subscribe() {
    DB.collection('progress').onSnapshot(
      (snap) => {
        subTries = 0
        for (const id in SERVER) delete SERVER[id]
        snap.docs.forEach((d) => {
          if (d.data()?.done === true) SERVER[d.id] = true
        })
        // A picture with a write still on its way keeps the viewer's latest click.
        for (const p of D.pictures) {
          if (writing[p.id] || p.id in want) continue
          if (SERVER[p.id]) DONE[p.id] = true
          else delete DONE[p.id]
        }
        applyDone()
      },
      (e) => {
        // Terminal for this listener: a dead bridge gets a fresh subscription, anything else stops syncing.
        if (e?.code === 'unavailable' && subTries < 3) {
          subTries++
          setTimeout(subscribe, 2000 * subTries)
          return
        }
        mode = 'off'
        applyDone()
      },
    )
  }

  async function initDone() {
    DB = await dbReady
    if (!DB) {
      mode = 'local'
      loadLocal()
      applyDone()
      return
    }
    mode = 'db'
    applyDone()
    subscribe()
  }

  function toggleDone(id) {
    if (mode !== 'db' && mode !== 'local') return
    const v = !DONE[id]
    if (v) DONE[id] = true
    else delete DONE[id]
    applyDone()
    const p = D.pictures.find((x) => x.id === id)
    say(v ? `Done: ${p.name}` : `Back to do: ${p.name}`)
    if (mode === 'local') return saveLocal()
    want[id] = v
    write(id)
  }

  // One write at a time per picture; a click made meanwhile is written after it.
  async function write(id) {
    if (writing[id]) return
    writing[id] = true
    let retried = false
    while (id in want) {
      const v = want[id]
      delete want[id]
      try {
        await DB.collection('progress').doc(id).set({ done: v, at: new Date().toISOString() })
      } catch (e) {
        const code = e?.code
        if (code === 'unavailable' && !retried) {
          retried = true
          if (!(id in want)) want[id] = v
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 700))
          continue
        }
        delete want[id]
        if (SERVER[id]) DONE[id] = true
        else delete DONE[id]
        if (code === 'invalid_argument' || code === 'not_granted' || code === 'transform_error') mode = 'ro'
        else if (code === 'revoked' || code === 'capability_disabled' || code === 'capability_removed') mode = 'off'
        say(mode === 'ro' ? "You can't change progress from this account" : 'That mark could not be saved')
        applyDone()
        break
      }
    }
    writing[id] = false
  }

  /** Paints the marks onto the cards in view, the counts and the bar, without re-rendering the list. */
  function applyDone() {
    if (!D) return
    const can = mode === 'db' || mode === 'local'
    $$('#bg-list .bg-card').forEach((el) => {
      const on = !!DONE[el.dataset.p]
      el.classList.toggle('done', on)
      const b = $('[data-done]', el)
      b.setAttribute('aria-pressed', String(on))
      b.disabled = !can
    })
    const np = D.pictures.length
    const nd = D.pictures.filter((p) => DONE[p.id]).length
    const na = D.pictures.reduce((n, p) => n + (DONE[p.id] ? p.areas.length : 0), 0)
    $('#bg-pfill').style.width = `${(nd / np) * 100}%`
    $('#bg-ptext').innerHTML =
      mode === 'wait'
        ? MODE_NOTE.wait
        : `<b>${nd}</b> of ${np} pictures done, covering <b>${na}</b> of ${D.areas.length} areas <span>· ${MODE_NOTE[mode]}</span>`
    const sb = $$('#bg-show button')
    sb.forEach((b) => {
      const i = $('i', b)
      if (i) i.textContent = b.dataset.s === 'done' ? nd : np - nd
    })
  }

  const momentComp = () =>
    `Format: one landscape image (3:2). It will be shrunk to 240 × 160 pixels, so draw it as if on a 240 × 160 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 4 screen pixels wide.
It is the whole stage of a short scene: a title ribbon drops over the top quarter, three Poké Balls fall from above onto the table, and the creatures pop out of them and stand on the table top.
Composition: a front-facing, eye-level view. The table top is one level band across the lower third (about 70 to 80 % of the way down), clear and evenly lit, with the three cradles at one quarter, one half and three quarters of the width; nothing stands in front of the table. Keep the top quarter simple (ceiling and upper wall): the ribbon covers it. Tall furniture stays at the far left and right edges, so the wall behind the three cradles is calm and light.`
  const regionComp = (p) =>
    `Format: one square image (1:1). It will be shrunk to 400 × 400 pixels, so draw it as if on a 400 × 400 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 5 screen pixels wide.
It is the picture on the ${p.name} card in the game's region switcher. The card shows it as a wide 10:3 banner: a full-width strip cut from the middle of the square, from about 35 % to 65 % of the way down. So compose for that strip first: ${p.landmark} and the horizon sit inside that middle band, and the strip alone must say "${p.name}" at a glance. The whole square still has to read as a finished picture, so the top and the bottom simply extend the scene: open sky above, calm foreground below, nothing important in either.
Composition: a wide panoramic view from a slightly raised eye level, front-facing. The horizon is one straight, level line a little below the middle (about 55 % of the way down). The landmark stands near the centre with a clear, simple silhouette that reads at 400 × 120; smaller supporting details at either side of it, inside the band; bigger, simpler shapes in the foreground. Clean, uncluttered, readable at a small size. The game prints the region's name under the picture, never on it.`
  function promptOf(p) {
    if (p.kind === 'place' || p.kind === 'event')
      return [
        p.head,
        `The place: ${p.scene}`,
        p.palette,
        '',
        p.comp(),
        '',
        STYLE,
        ...(S.ref ? [REF] : []),
        `${AVOID} ${p.avoid}`,
      ].join('\n')
    if (p.kind === 'region')
      return [
        `Pixel-art background for a Pokémon-style mobile game: the picture for the ${p.name} region, one panorama that says "${p.name}" at a glance through its landmark, its climate and its colours, inspired by the ${p.name} region of the Pokémon games. An original evocation, not a copy of a game screen.`,
        `The place: ${p.scene}`,
        p.palette,
        '',
        regionComp(p),
        '',
        STYLE,
        ...(S.ref ? [REF] : []),
        `${AVOID} No region name, title or lettering anywhere, and no clock numerals.`,
      ].join('\n')
    if (p.kind === 'moment')
      return [
        `Pixel-art background for a Pokémon-style mobile game: ${p.name}, the stage of a story moment, used for: ${p.uses.join('; ')}. Keep it generic: no named professor, no named town.`,
        `The place: ${p.scene}`,
        LIGHTS[p.light].text,
        '',
        momentComp(),
        '',
        STYLE,
        ...(S.ref ? [REF] : []),
        `${AVOID} No Poké Balls, capsules or creatures on the table: the game draws them.`,
      ].join('\n')
    return [
      head(p),
      `The place: ${p.scene}`,
      LIGHTS[p.light].text,
      '',
      comp(p),
      '',
      STYLE,
      ...(S.ref ? [REF] : []),
      AVOID,
    ].join('\n')
  }

  // ================================================================== copying (the sandbox may refuse the clipboard API)
  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t)
      return true
    } catch {
      /* fall through */
    }
    const ta = document.createElement('textarea')
    ta.value = t
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
  let liveT = 0
  function say(msg) {
    const el = $('#bg-live')
    el.textContent = msg
    el.classList.add('on')
    clearTimeout(liveT)
    liveT = setTimeout(() => el.classList.remove('on'), 1800)
  }
  function selectText(el) {
    const r = document.createRange()
    r.selectNodeContents(el)
    const s = getSelection()
    s.removeAllRanges()
    s.addRange(r)
  }

  // ================================================================== the page
  const swatch = (cols) =>
    `<span class="bg-sw" aria-hidden="true">${cols.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`

  function shell() {
    const lightCounts = {}
    D.pictures.forEach((p) => (lightCounts[p.light] = (lightCounts[p.light] || 0) + 1))
    const n = D.areas.length,
      np = D.pictures.length
    const nk = (k) => D.pictures.filter((p) => p.kind === k).length
    $('#bg-app').innerHTML = `
      <div class="lede">
        <div>
          <p class="eyebrow">AREA ART · PROMPTS FOR GEMINI · JOHTO DAYBREAK</p>
          <h2 class="title">${np} pictures for ${n} areas</h2>
          <p>Each prompt below makes one picture, the 288 × 276 scene the team roams on Home; the banners and the battle background are cut from it automatically. Most areas share: <b>${nk('shared')} shared scenes</b> (meadow route, cave, harbour town, the League…) are generic and reused across all regions, and <b>${nk('lair')} legendary lairs</b> of the same kind (a volcano's heart, a sky summit…) are shared across regions too. Only <b>${nk('own')} landmarks</b> get a picture of their own. Each card lists every area it covers.</p>
          <div class="chips"><span class="chip">${np} prompts</span><span class="chip">${n} areas</span><span class="chip">${nk('shared')} shared · ${nk('lair')} lairs · ${nk('own')} landmarks</span><span class="chip">1 picture, 3 uses</span><span class="chip">no Pokémon named in a prompt</span></div>
        </div>
        <div class="lede-side"><a class="btn" href="#bg-list-h" id="bg-jump">Jump to the areas ↓</a></div>
      </div>
      <div class="bg-kit">
        <section class="card k-how" aria-labelledby="bg-how-h">
          <h3 id="bg-how-h">How to run it</h3>
          <ol class="bg-steps">
            <li><span><b>Copy</b> a picture's prompt below; its card lists every area that will use it. Filter by region, by kind, or search an area to find its picture.</span></li>
            <li><span>In Gemini, use an image model (the Gemini app's image creation, or AI Studio with an image model). Attach the <b>style reference</b>, paste the prompt, ask for a square <code>1:1</code> image.</span></li>
            <li><span>If it comes back off-style, reply in the same chat: <code>bigger pixels, fewer colours, no outlines</code>, <code>put the horizon a third of the way down</code> or <code>clear the ground on the right, move the trees to the edges</code>.</span></li>
            <li><span>Drop the result in <b>One picture, three uses</b> below. It fits the image to the game's 288 × 276 pixels, finds the horizon, and shows the Home scene, both banner strips and the battle with its zones. Nudge the horizon if it guessed wrong.</span></li>
            <li><span>Save the clean 1× picture: that single file is the area's art. Keep your best one as the reference for the rest of its region.</span></li>
          </ol>
        </section>
        <section class="card k-ref" aria-labelledby="bg-ref-h">
          <h3 id="bg-ref-h">Style reference <small>attach it in Gemini</small></h3>
          <img class="bg-ref" id="bg-ref-img" alt="A Johto Daybreak Home scene drawn by the lab's engine: morning sky, lavender hills, round trees, an open meadow with a pond" />
          <p class="note">The lab's own Daybreak Home scene for open routes, 288 × 276 shown ×3, horizon a third of the way down: the same layout the prompts ask for. Save it (right-click or long-press, Save image) and attach it with each prompt; keep “I'm attaching a reference” ticked below.</p>
        </section>
        <section class="card k-prev" aria-labelledby="bg-prev-h">
          <h3 id="bg-prev-h">One picture, three uses <small id="bg-prev-src"></small></h3>
          <div class="bg-prev-top">
            <label class="bg-drop" id="bg-drop" tabindex="0"><b>Drop, paste or choose a Gemini image</b><span>It's fitted to 288 × 276: cropped square, each block's most common colour kept, palette cut. Nothing leaves your browser.</span><input type="file" id="bg-file" accept="image/*" class="sr" /></label>
            <div class="bg-prev-opts">
              <div class="bg-opt"><span class="l">HORIZON</span><input type="range" id="bg-hz" min="40" max="200" step="1" value="${HORIZON}" aria-label="Horizon line, in game pixels from the top" /><output id="bg-hz-v">${HORIZON}</output><button class="btn small" type="button" id="bg-hz-auto">Auto</button></div>
              <div class="bg-opt"><span class="l">COLOURS</span><div class="seg small" role="radiogroup" aria-label="Colours" id="bg-fit-k">${[16, 24, 32, 48, 0]
                .map((k) => `<button type="button" role="radio" data-k="${k}" aria-checked="${k === 32}">${k || 'All'}</button>`)
                .join('')}</div></div>
              <div class="bg-opt"><label class="bg-check"><input type="checkbox" id="bg-guides" checked /> Crop guides</label><label class="bg-check"><input type="checkbox" id="bg-zones" checked /> Battle zones</label><label class="bg-check"><input type="checkbox" id="bg-sprites" checked /> Sprites</label></div>
            </div>
          </div>
          <div class="bg-prev">
            <figure class="bg-pv home"><canvas id="bg-pv-home" width="${W}" height="${H}" role="img" aria-label="Home: the whole picture"></canvas><figcaption><b>Home</b> · the whole picture, ${W} × ${H}. <span class="k-g">Gold</span>: the battle window. <span class="k-c">Coral</span>: the banner strips.</figcaption></figure>
            <div class="bg-pv-side">
              ${STRIPS.map((s, i) => `<figure class="bg-pv strip"><canvas id="bg-pv-strip${i}" width="${W}" height="${s.h}" role="img" aria-label="${s.label} banner"></canvas><figcaption><b>Banner · ${s.label}</b> · ${W} × ${s.h}, centred on the horizon</figcaption></figure>`).join('')}
              <figure class="bg-pv battle"><canvas id="bg-pv-battle" width="${BATTLE.w}" height="${BATTLE.h}" role="img" aria-label="Battle: the middle of the picture with the two zones"></canvas><figcaption><b>Battle</b> · the middle ${BATTLE.w} × ${BATTLE.h}, horizon halfway down; the zones are drawn by the game, translucent</figcaption></figure>
            </div>
          </div>
          <div class="bg-fit-out" id="bg-fit-out" hidden>
            <p class="cap" id="bg-fit-cap"></p>
            <img id="bg-fit-1x" class="x1" alt="The fitted picture at its native size, the file for the game" />
          </div>
        </section>
        <section class="card k-light" aria-labelledby="bg-light-h">
          <h3 id="bg-light-h">Lights <small>tap one to see its pictures</small></h3>
          <p class="note">Daybreak is a morning palette. The other lights shift it for an area's mood without leaving the family: same rules, navy as the darkest colour, colours taken from the lab's own scenery.</p>
          <ul class="bg-lights" id="bg-lights">${Object.entries(LIGHTS)
            .map(
              ([k, L]) =>
                `<li><button type="button" data-light="${k}" aria-pressed="false"><b>${L.name}<span>${lightCounts[k] || 0}</span></b>${swatch(L.sw)}</button></li>`,
            )
            .join('')}</ul>
        </section>
      </div>
      <h2 class="title" id="bg-list-h">The ${np} prompts</h2>
      <div class="bg-progress"><div class="bg-pbar" aria-hidden="true"><i id="bg-pfill"></i></div><p id="bg-ptext"></p></div>
      <div class="bg-bar">
        <div class="seg small bg-regions" role="radiogroup" aria-label="Region" id="bg-regions"></div>
      </div>
      <div class="bg-bar">
        <div class="seg small" role="radiogroup" aria-label="Kind of picture" id="bg-kind"><button type="button" role="radio" data-k="all">All<i>${np}</i></button>${Object.entries(KINDS)
          .map(([k, K]) => `<button type="button" role="radio" data-k="${k}">${K.label}<i>${nk(k)}</i></button>`)
          .join('')}</div>
        <div class="grow"><label for="bg-q" class="sr">Search a picture, an area, a gym leader or a Pokémon</label><input id="bg-q" class="bg-search" type="search" placeholder="Search an area, a gym leader, a Pokémon…" autocomplete="off" spellcheck="false" /></div>
      </div>
      <div class="bg-bar">
        <div class="seg small" role="radiogroup" aria-label="Progress" id="bg-show"><button type="button" role="radio" data-s="all">All</button><button type="button" role="radio" data-s="todo">To do<i></i></button><button type="button" role="radio" data-s="done">Done<i></i></button></div>
        <label class="bg-check"><input type="checkbox" id="bg-ref" /> I'm attaching a reference image</label>
        <button class="btn" type="button" id="bg-copyall">Copy all prompts in view</button>
      </div>
      <p class="bg-status" id="bg-status" aria-live="polite"></p>
      <div class="bg-list" id="bg-list"></div>
      <div class="bg-live" id="bg-live" role="status" aria-live="polite"></div>`
  }

  // ================================================================== the lab's own scenery (home.js), as stand-ins
  /** The lab's Daybreak Home scene for a banner key, full size, as a data URL (null when home.js is missing). */
  function labScene(key, flip) {
    try {
      return window.HOME?.api?.stripOf ? HOME.api.stripOf({ banner: `${key}.png${flip ? '#flip' : ''}` }, H) : null
    } catch {
      return null
    }
  }
  const loadImg = (src) =>
    new Promise((res) => {
      const im = new Image()
      im.onload = () => res(im)
      im.onerror = () => res(null)
      im.src = src
    })

  async function styleRef() {
    const src = labScene('plains', false)
    const im = src && (await loadImg(src))
    const big = document.createElement('canvas')
    const g = big.getContext('2d')
    g.imageSmoothingEnabled = false
    if (im) {
      big.width = W * 3
      big.height = H * 3
      g.imageSmoothingEnabled = false
      g.drawImage(im, 0, 0, W * 3, H * 3)
    } else if (window.SCN) {
      // Fallback: the Daybreak battle background.
      big.width = 960
      big.height = 640
      g.imageSmoothingEnabled = false
      g.drawImage(SCN.background('daybreak', 240, 160).cv, 0, 0, 960, 640)
    } else return
    $('#bg-ref-img').src = big.toDataURL('image/png')
  }

  // ================================================================== the list: one card per picture
  function visible() {
    const q = fold(S.q.trim())
    return D.pictures.filter((p) => {
      if (S.kind !== 'all' && p.kind !== S.kind) return false
      if (S.region !== 'all' && (p.kind === 'region' ? p.r !== S.region : !p.areas.some((o) => AREA[o].r === S.region)))
        return false
      if (S.light && p.light !== S.light) return false
      if (S.show === 'todo' && DONE[p.id]) return false
      if (S.show === 'done' && !DONE[p.id]) return false
      if (!q) return true
      if (p.kind === 'region' || p.kind === 'place' || p.kind === 'event') return fold([p.name, p.mood, p.scene, p.file].join(' ')).includes(q)
      if (p.kind === 'moment') return fold([p.name, p.scene, ...p.uses].join(' ')).includes(q)
      return fold(
        [p.name, p.scene, ...p.areas.flatMap((o) => { const a = AREA[o]; return [a.n, REGION[a.r], ...a.gym, ...a.leg, ...a.mons] })].join(' '),
      ).includes(q)
    })
  }
  const mostOf = (list) => {
    const c = {}
    list.forEach((k) => (c[k] = (c[k] || 0) + 1))
    return Object.entries(c).sort((x, y) => y[1] - x[1])
  }

  /** The lab's stand-in for a story moment (anims.js), at 2× as an image, or '' when it isn't loaded. */
  function standIn(p) {
    try {
      const c = window.ANIM?.labBackground?.('johto')
      if (!c) return ''
      const big = document.createElement('canvas')
      big.width = c.width * 2
      big.height = c.height * 2
      const g = big.getContext('2d')
      g.imageSmoothingEnabled = false
      g.drawImage(c, 0, 0, big.width, big.height)
      return `<img class="bg-moment-img" src="${big.toDataURL('image/png')}" alt="The lab's stand-in for ${esc(p.name)}" width="${big.width}" height="${big.height}" />`
    } catch {
      return ''
    }
  }
  function momentCard(p) {
    const L = LIGHTS[p.light]
    const on = !!DONE[p.id]
    return `<article class="bg-card k-moment${on ? ' done' : ''}" data-p="${p.id}">
      <div class="bg-body">
        <div class="bg-head"><div class="bg-hd"><span class="bg-kind">${KINDS.moment.one} · 240 × 160, ask 3:2</span><h3>${esc(p.name)}</h3></div><button type="button" class="bg-done" data-done aria-pressed="${on}"${mode === 'db' || mode === 'local' ? '' : ' disabled'} title="Mark this picture as generated"><span class="box" aria-hidden="true"></span>Done</button></div>
        <div class="bg-tags"><span class="bg-tag">${swatch(L.sw.slice(0, 4))}${L.name}</span></div>
        <p class="bg-scene">${esc(p.scene)}</p>
        <dl class="bg-uses" aria-label="Where the game shows it"><div class="bg-use"><dt>Used for</dt><dd>${p.uses.map((u) => `<span>${esc(u)}</span>`).join('')}</dd></div></dl>
        ${standIn(p)}
        <div class="bg-act"><button class="btn go" type="button" data-copy>Copy prompt</button><button class="btn" type="button" data-show aria-expanded="false">Show prompt</button></div>
        <pre class="bg-prompt" hidden tabindex="0"></pre>
      </div>
    </article>`
  }
  function regionCard(p) {
    const on = !!DONE[p.id]
    return `<article class="bg-card k-region${on ? ' done' : ''}" data-p="${p.id}">
      <div class="bg-body">
        <div class="bg-head"><div class="bg-hd"><span class="bg-kind">${KINDS.region.one} · 400 px, ask 1:1 · shown 10:3</span><h3>${esc(p.name)}</h3></div><button type="button" class="bg-done" data-done aria-pressed="${on}"${mode === 'db' || mode === 'local' ? '' : ' disabled'} title="Mark this picture as generated"><span class="box" aria-hidden="true"></span>Done</button></div>
        <div class="bg-tags"><span class="bg-tag">${swatch(p.sw.slice(0, 4))}${esc(p.mood)}</span></div>
        <p class="bg-scene">${esc(p.scene)}</p>
        <dl class="bg-uses" aria-label="Where the game shows it">
          <div class="bg-use"><dt>Used for</dt><dd><span>The ${esc(p.name)} card in the region switcher (Areas → Regions)</span></dd></div>
          <div class="bg-use on"><dt>Save as</dt><dd><code>${esc(p.file)}</code></dd></div>
          <div class="bg-use"><dt>Then</dt><dd><span><code>pnpm unpixel &lt;in&gt; --width 400</code></span><span>add <code>'${esc(p.r)}'</code> to REGION_ART in <code>src/fx/regionArt.ts</code></span></dd></div>
        </dl>
        <div class="bg-act"><button class="btn go" type="button" data-copy>Copy prompt</button><button class="btn" type="button" data-show aria-expanded="false">Show prompt</button></div>
        <pre class="bg-prompt" hidden tabindex="0"></pre>
      </div>
    </article>`
  }
  /** A place as the lab draws it today (a canvas or an image URL), at 2× as an image, or '' when it isn't loaded. */
  function placeNow(p) {
    try {
      const c = p.now()
      if (!c) return ''
      let src = c
      if (typeof c !== 'string') {
        const cv = c.cv || c
        const big = document.createElement('canvas')
        big.width = cv.width * 2
        big.height = cv.height * 2
        const g = big.getContext('2d')
        g.imageSmoothingEnabled = false
        g.drawImage(cv, 0, 0, big.width, big.height)
        src = big.toDataURL('image/png')
      }
      return `<img class="bg-moment-img" src="${src}" alt="${esc(p.name)}, ${esc(p.nowAlt)}" />`
    } catch {
      return ''
    }
  }
  function placeCard(p) {
    const on = !!DONE[p.id]
    return `<article class="bg-card k-place${on ? ' done' : ''}" data-p="${p.id}">
      <div class="bg-body">
        <div class="bg-head"><div class="bg-hd"><span class="bg-kind">${KINDS[p.kind].one} · ${esc(p.size)}</span><h3>${esc(p.name)}</h3></div><button type="button" class="bg-done" data-done aria-pressed="${on}"${mode === 'db' || mode === 'local' ? '' : ' disabled'} title="Mark this picture as generated"><span class="box" aria-hidden="true"></span>Done</button></div>
        <div class="bg-tags"><span class="bg-tag">${swatch(p.sw.slice(0, 4))}${esc(p.mood)}</span></div>
        <p class="bg-scene">${esc(p.scene)}</p>
        <dl class="bg-uses" aria-label="Where the game shows it">
          <div class="bg-use"><dt>Used for</dt><dd>${p.uses.map((u) => `<span>${esc(u)}</span>`).join('')}</dd></div>
          <div class="bg-use"><dt>Left empty</dt><dd>${p.empty.map((u) => `<span>${esc(u)}</span>`).join('')}</dd></div>
          <div class="bg-use on"><dt>Save as</dt><dd><code>${esc(p.file)}</code></dd></div>
          <div class="bg-use"><dt>Then</dt><dd><span><code>pnpm unpixel &lt;in&gt; --width ${p.width}</code></span><span>${p.then}</span></dd></div>
        </dl>
        ${placeNow(p)}
        <div class="bg-act"><button class="btn go" type="button" data-copy>Copy prompt</button><button class="btn" type="button" data-show aria-expanded="false">Show prompt</button></div>
        <pre class="bg-prompt" hidden tabindex="0"></pre>
      </div>
    </article>`
  }
  function card(p) {
    if (p.kind === 'place' || p.kind === 'event') return placeCard(p)
    if (p.kind === 'moment') return momentCard(p)
    if (p.kind === 'region') return regionCard(p)
    const L = LIGHTS[p.light]
    const areas = p.areas.map((o) => AREA[o])
    const regs = regionsOf(p)
    const q = fold(S.q.trim())
    const legs = [...new Set(areas.flatMap((a) => a.leg))]
    const meta =
      p.kind === 'own'
        ? `${KINDS.own.one} · ${esc(REGION[p.r])}${areas.length > 1 ? ` · ${areas.length} areas` : ''}`
        : `${KINDS[p.kind].one} · ${areas.length} areas · ${regs.length} ${regs.length === 1 ? 'region' : 'regions'}`
    // Used by: every area, grouped by region; the region in view and search hits stand out.
    const uses = D.regions
      .filter((r) => regs.includes(r.id))
      .map((r) => {
        const here = areas.filter((a) => a.r === r.id)
        return `<div class="bg-use${S.region === r.id ? ' on' : ''}"><dt>${esc(r.name)}</dt><dd>${here
          .map((a) => {
            const hit = q && fold(a.n).includes(q)
            return `<span class="${hit ? 'hit' : ''}${a.h ? ' secret' : ''}" title="#${a.o} · Lv.${a.lv[0]}–${a.lv[1]}${a.leg.length ? ' · ' + esc(a.leg.join(', ')) : ''}">${esc(a.n)}</span>`
          })
          .join('')}</dd></div>`
      })
      .join('')
    const bans = mostOf(areas.map((a) => a.b)).slice(0, 4)
    const bgs = mostOf(areas.map((a) => a.bg))
    const on = !!DONE[p.id]
    return `<article class="bg-card k-${p.kind}${on ? ' done' : ''}" data-p="${p.id}">
      <div class="bg-body">
        <div class="bg-head"><div class="bg-hd"><span class="bg-kind">${meta}</span><h3>${esc(p.name)}</h3></div><button type="button" class="bg-done" data-done aria-pressed="${on}"${mode === 'db' || mode === 'local' ? '' : ' disabled'} title="Mark this picture as generated"><span class="box" aria-hidden="true"></span>Done</button></div>
        <div class="bg-tags"><span class="bg-tag">${swatch(L.sw.slice(0, 4))}${L.name}</span>${legs.length ? `<span class="bg-tag leg" title="Legendary">★ ${esc(legs.join(' · '))}</span>` : ''}</div>
        <p class="bg-scene">${esc(p.scene)}</p>
        <dl class="bg-uses" aria-label="Areas using this picture">${uses}</dl>
        <div class="bg-nowrow" aria-label="What these areas use today">
          <span class="bg-nowlab">now</span>
          ${bans.map(([b, c]) => `<span class="bg-nowban" title="banner ${b} · ${c} of these areas"><img src="assets/now/banners/${b}.png" alt="" loading="lazy" width="118" height="16" />${c > 1 ? `<i>×${c}</i>` : ''}</span>`).join('')}
          <span class="bg-nowbg">battle: ${bgs.map(([b, c]) => `${b}${c > 1 ? ' ×' + c : ''}`).join(', ')}</span>
        </div>
        <div class="bg-act"><button class="btn go" type="button" data-copy>Copy prompt</button><button class="btn" type="button" data-show aria-expanded="false">Show prompt</button><button class="btn" type="button" data-prev title="Show the lab's stand-in scene in the preview">Preview</button></div>
        <pre class="bg-prompt" hidden tabindex="0"></pre>
      </div>
    </article>`
  }

  function renderList() {
    const list = visible()
    let html = ''
    for (const k of Object.keys(KINDS)) {
      const part = list.filter((p) => p.kind === k)
      if (!part.length) continue
      html += `<h3 class="bg-region-h">${KINDS[k].label} <small>${part.length} · ${KINDS[k].note}</small></h3>`
      let cur = ''
      for (const p of part) {
        if (k === 'own' && S.region === 'all' && p.r !== cur) {
          cur = p.r
          html += `<h4 class="bg-sub-h">${esc(REGION[cur])}</h4>`
        }
        html += card(p)
      }
    }
    $('#bg-list').innerHTML =
      html ||
      `<p class="bg-empty">${S.show === 'done' ? 'Nothing marked done in this view yet.' : S.show === 'todo' ? 'Everything in this view is done.' : 'No picture matches. Try another region or kind, or clear the search and the light.'}</p>`
    const covered = list.reduce((n, p) => n + p.areas.filter((o) => S.region === 'all' || AREA[o].r === S.region).length, 0)
    const L = S.light ? ` · light: <b>${LIGHTS[S.light].name}</b> <a href="#" id="bg-unlight">clear</a>` : ''
    // Story moments alone: they cover no area and have their own size.
    const onlyMoments = list.length && list.every((p) => p.kind === 'moment')
    const onlyRegions = list.length && list.every((p) => p.kind === 'region')
    const onlyPlaces = list.length && list.every((p) => p.kind === 'place')
    const onlyEvents = list.length && list.every((p) => p.kind === 'event')
    $('#bg-status').innerHTML = onlyPlaces || onlyEvents
      ? `<b>${list.length}</b> ${list.length === 1 ? 'prompt' : 'prompts'} for ${onlyEvents ? 'event banners' : 'the Center, the Day Care and Versus'} · ${list.map((p) => `${esc(p.name)}: ask ${p.ask}, ${p.width} px wide`).join(' · ')}${S.ref ? ' · with reference image' : ''}`
      : onlyMoments
      ? `<b>${list.length}</b> ${list.length === 1 ? 'prompt' : 'prompts'} for story moments · 240 × 160, ask 3:2${S.ref ? ' · with reference image' : ''}${L}`
      : onlyRegions
      ? `<b>${list.length}</b> ${list.length === 1 ? 'prompt' : 'prompts'} for region cards · 400 × 400, ask 1:1, shown as a 10:3 strip from the middle · saved to <code>public/region-art/</code>${S.ref ? ' · with reference image' : ''}`
      : `<b>${list.length}</b> ${list.length === 1 ? 'prompt' : 'prompts'} covering <b>${covered}</b> ${covered === 1 ? 'area' : 'areas'}${S.region !== 'all' ? ' of ' + esc(REGION[S.region]) : ''} · ${W} × ${H}, ask 1:1${S.ref ? ' · with reference image' : ''}${L}`
    $('#bg-copyall').textContent = `Copy all ${list.length} prompts`
    $('#bg-copyall').disabled = !list.length
    const un = $('#bg-unlight')
    if (un)
      un.addEventListener('click', (e) => {
        e.preventDefault()
        setLight('')
      })
    applyDone()
  }

  function syncControls() {
    $$('#bg-regions button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.r === S.region)))
    $$('#bg-kind button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === S.kind)))
    $$('#bg-show button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.s === S.show)))
    $$('#bg-lights button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === S.light)))
    $('#bg-ref').checked = S.ref
  }

  function setLight(k) {
    S.light = S.light === k ? '' : k
    if (S.light) S.region = 'all'
    syncControls()
    renderList()
    if (S.light) $('#bg-list-h').scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' })
  }

  function bind() {
    $('#bg-jump').addEventListener('click', (e) => {
      e.preventDefault()
      $('#bg-list-h').scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' })
    })
    const counts = {}
    D.regions.forEach(
      (r) =>
        (counts[r.id] = D.pictures.filter((p) =>
          p.kind === 'region' ? p.r === r.id : p.areas.some((o) => AREA[o].r === r.id),
        ).length),
    )
    $('#bg-regions').innerHTML =
      `<button type="button" role="radio" data-r="all">All regions<i>${D.pictures.length}</i></button>` +
      D.regions
        .map((r) => `<button type="button" role="radio" data-r="${r.id}">${esc(r.name)}<i>${counts[r.id] || 0}</i></button>`)
        .join('')
    $('#bg-regions').addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      S.region = b.dataset.r
      store.set('region', S.region)
      syncControls()
      renderList()
    })
    $('#bg-kind').addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      S.kind = b.dataset.k
      store.set('kind', S.kind)
      syncControls()
      renderList()
    })
    $('#bg-show').addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      S.show = b.dataset.s
      store.set('show', S.show)
      syncControls()
      renderList()
    })
    $('#bg-lights').addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (b) setLight(b.dataset.light)
    })
    let qt = 0
    $('#bg-q').addEventListener('input', (e) => {
      clearTimeout(qt)
      qt = setTimeout(() => {
        S.q = e.target.value
        renderList()
      }, 120)
    })
    $('#bg-ref').addEventListener('change', (e) => {
      S.ref = e.target.checked
      store.set('ref', S.ref ? '1' : '0')
      renderList()
    })
    $('#bg-copyall').addEventListener('click', async () => {
      const list = visible()
      const txt = list
        .map((p) => {
          if (p.kind === 'place' || p.kind === 'event')
            return `=== ${KINDS[p.kind].one} · ${p.name} (ask ${p.ask}) ===\nSave as: ${p.file}\n\n${promptOf(p)}`
          if (p.kind === 'region')
            return `=== ${KINDS.region.one} · ${p.name} (ask 1:1) ===\nSave as: ${p.file}\n\n${promptOf(p)}`
          if (p.kind === 'moment')
            return `=== ${KINDS.moment.one} · ${p.name} (ask 3:2) ===\nUsed for: ${p.uses.join('; ')}\n\n${promptOf(p)}`
          const used = p.areas.map((o) => `${AREA[o].n} (${REGION[AREA[o].r]})`).join(', ')
          return `=== ${KINDS[p.kind].one} · ${p.name} (ask 1:1) ===\nUsed by ${p.areas.length}: ${used}\n\n${promptOf(p)}`
        })
        .join('\n\n')
      say((await copyText(txt)) ? `Copied ${list.length} prompts` : 'Copy was blocked here: use Show prompt on a card')
    })
    $('#bg-list').addEventListener('click', async (e) => {
      const b = e.target.closest('button')
      if (!b) return
      const el = b.closest('.bg-card')
      if (b.hasAttribute('data-done')) return toggleDone(el.dataset.p)
      const a = D.pictures.find((x) => x.id === el.dataset.p)
      const pre = $('.bg-prompt', el)
      if (b.hasAttribute('data-prev')) {
        await previewLab(a)
        $('.k-prev').scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' })
        return
      }
      if (b.hasAttribute('data-show')) {
        const open = pre.hidden
        if (open) pre.textContent = promptOf(a)
        pre.hidden = !open
        b.setAttribute('aria-expanded', String(open))
        b.textContent = open ? 'Hide prompt' : 'Show prompt'
        return
      }
      if (b.hasAttribute('data-copy')) {
        const txt = promptOf(a)
        if (await copyText(txt)) {
          b.classList.add('ok')
          b.textContent = 'Copied'
          say(`Copied: ${a.name}`)
          setTimeout(() => {
            b.classList.remove('ok')
            b.textContent = 'Copy prompt'
          }, 1400)
        } else {
          pre.textContent = txt
          pre.hidden = false
          const sh = $('[data-show]', el)
          sh.setAttribute('aria-expanded', 'true')
          sh.textContent = 'Hide prompt'
          selectText(pre)
          say('Selected: press Ctrl+C (or ⌘C) to copy')
        }
      }
    })
    bindPreview()
  }

  // ================================================================== one picture, three uses: the preview
  const PV = { src: null, raw: null, label: '', k: 32, hz: HORIZON, fitted: false }

  function bindPreview() {
    const drop = $('#bg-drop')
    const file = $('#bg-file')
    const take = (f) => {
      if (!f || !f.type.startsWith('image/')) return say('That is not an image')
      const url = URL.createObjectURL(f)
      loadImg(url).then((im) => {
        if (!im) return say('Could not read that image')
        PV.raw = im
        PV.label = f.name ? `your image · ${f.name}` : 'your image'
        fitRaw()
      })
    }
    file.addEventListener('change', () => take(file.files[0]))
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        file.click()
      }
    })
    ;['dragenter', 'dragover'].forEach((t) =>
      drop.addEventListener(t, (e) => {
        e.preventDefault()
        drop.classList.add('over')
      }),
    )
    ;['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')))
    drop.addEventListener('drop', (e) => {
      e.preventDefault()
      take(e.dataTransfer.files[0])
    })
    document.addEventListener('paste', (e) => {
      if ($('#backgrounds').hidden) return
      const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (it) take(it.getAsFile())
    })
    $('#bg-fit-k').addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      PV.k = +b.dataset.k
      $$('#bg-fit-k button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.k === PV.k)))
      if (PV.raw) fitRaw()
    })
    const hz = $('#bg-hz')
    hz.addEventListener('input', () => {
      PV.hz = +hz.value
      $('#bg-hz-v').textContent = PV.hz
      drawPreview()
    })
    $('#bg-hz-auto').addEventListener('click', () => {
      if (!PV.src) return
      setHorizon(findHorizon(PV.src))
      drawPreview()
    })
    ;['#bg-guides', '#bg-zones', '#bg-sprites'].forEach((id) => $(id).addEventListener('change', drawPreview))
  }

  function setHorizon(v) {
    PV.hz = v
    $('#bg-hz').value = v
    $('#bg-hz-v').textContent = v
  }

  /** Show the lab's stand-in Daybreak scene for a picture (its areas' most common banner) in the preview. */
  async function previewLab(p) {
    const key = mostOf(p.areas.map((o) => AREA[o].b))[0][0]
    const src = labScene(key, false)
    const im = src && (await loadImg(src))
    if (!im) return say('The lab scene is not available here')
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    c.getContext('2d').drawImage(im, 0, 0)
    PV.src = c
    PV.raw = null
    PV.fitted = false
    PV.label = `${p.name} · the lab's stand-in scene (${key})`
    setHorizon(findHorizon(c))
    $('#bg-fit-out').hidden = true
    drawPreview()
  }

  function fitRaw() {
    const im = PV.raw
    const iw = im.naturalWidth,
      ih = im.naturalHeight
    // Centre crop to 288:276.
    let cw = iw,
      ch = Math.round((iw * H) / W)
    if (ch > ih) {
      ch = ih
      cw = Math.round((ih * W) / H)
    }
    const src = document.createElement('canvas')
    src.width = cw
    src.height = ch
    const sg = src.getContext('2d', { willReadFrequently: true })
    sg.drawImage(im, (iw - cw) >> 1, (ih - ch) >> 1, cw, ch, 0, 0, cw, ch)
    const sd = sg.getImageData(0, 0, cw, ch).data
    // Each game pixel takes the most common colour of its block (5 bits a channel to vote), averaged within the winner.
    const out = new Uint8ClampedArray(W * H * 4)
    const cnt = new Map()
    for (let ty = 0; ty < H; ty++) {
      const y0 = Math.floor((ty * ch) / H),
        y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * ch) / H))
      for (let tx = 0; tx < W; tx++) {
        const x0 = Math.floor((tx * cw) / W),
          x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * cw) / W))
        cnt.clear()
        let best = null
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const i = (y * cw + x) * 4
            const r = sd[i],
              g = sd[i + 1],
              b = sd[i + 2]
            const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
            let e = cnt.get(key)
            if (!e) cnt.set(key, (e = { n: 0, r: 0, g: 0, b: 0 }))
            e.n++
            e.r += r
            e.g += g
            e.b += b
            if (!best || e.n > best.n) best = e
          }
        const o = (ty * W + tx) * 4
        out[o] = best.r / best.n
        out[o + 1] = best.g / best.n
        out[o + 2] = best.b / best.n
        out[o + 3] = 255
      }
    }
    let used = countColours(out)
    if (PV.k && used > PV.k) {
      kmeans(out, PV.k)
      used = countColours(out)
    }
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    c.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0)
    PV.src = c
    PV.fitted = true
    setHorizon(findHorizon(c))
    $('#bg-fit-1x').src = c.toDataURL('image/png')
    $('#bg-fit-cap').textContent = `Fitted: ${W} × ${H} game pixels, ${used} colours, from a ${iw} × ${ih} image cropped to ${cw} × ${ch}; horizon found at ${PV.hz}. Below, the clean file for the game at 1× (right-click or long-press, Save image): the banners and the battle are cut from it in code.`
    $('#bg-fit-out').hidden = false
    drawPreview()
  }

  /**
   * The horizon: the row, in the upper half, where the picture changes most between the rows above and below it
   * (sky to land, or back wall to floor). Rows are compared as averages over a 6-pixel band.
   */
  function findHorizon(cv) {
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data
    const rows = []
    for (let y = 0; y < H; y++) {
      let r = 0,
        g = 0,
        b = 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        r += d[i]
        g += d[i + 1]
        b += d[i + 2]
      }
      rows.push([r / W, g / W, b / W])
    }
    const band = 6
    const avg = (a, z) => {
      const s = [0, 0, 0]
      for (let y = a; y < z; y++) for (let k = 0; k < 3; k++) s[k] += rows[y][k] / (z - a)
      return s
    }
    let best = HORIZON,
      bestScore = -1
    for (let y = 50; y <= 170; y++) {
      const up = avg(y - band, y),
        dn = avg(y, y + band)
      // Prefer rows near a third of the way down when two edges are about as strong.
      const score = Math.hypot(up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]) * (1 - Math.abs(y - HORIZON) / 400)
      if (score > bestScore) {
        bestScore = score
        best = y
      }
    }
    return best
  }

  const ctx = (id) => {
    const g = $(id).getContext('2d')
    g.imageSmoothingEnabled = false
    return g
  }
  function zone(g, z) {
    // Translucent oval: a soft navy shadow, a pale fill, a darker rim and a lit top edge. Pixel-true via PX.ellipse.
    const E = window.PX
    if (!E) return
    g.save()
    g.globalAlpha = 0.18
    E.ellipse(g, z.x, z.y + 2, z.rx, z.ry, '#24304f')
    g.globalAlpha = 0.34
    E.ellipse(g, z.x, z.y, z.rx, z.ry, '#fbfdff')
    g.globalAlpha = 0.55
    E.ellipseLine(g, z.x, z.y, z.rx, z.ry, '#24304f')
    g.globalAlpha = 0.6
    E.ellipseLine(g, z.x, z.y - 1, z.rx - 3, z.ry - 2, '#ffffff', Math.PI, Math.PI * 2)
    g.restore()
  }
  function spr(g, key, x, y) {
    if (window.PX?.sprite) PX.sprite(g, key, x, y, 0, { frame: 0 })
  }
  function dashRect(g, x, y, w, h, col) {
    g.save()
    g.strokeStyle = col
    g.lineWidth = 1
    g.setLineDash([4, 3])
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    g.restore()
  }

  function drawPreview() {
    if (!PV.src) return
    const guides = $('#bg-guides').checked,
      zones = $('#bg-zones').checked,
      sprites = $('#bg-sprites').checked
    $('#bg-prev-src').textContent = PV.label
    const by = battleTop(PV.hz)
    // Home: the whole picture, the name plate, the team.
    const h = ctx('#bg-pv-home')
    h.clearRect(0, 0, W, H)
    h.drawImage(PV.src, 0, 0)
    if (sprites) {
      spr(h, 'front-charizard', 78, 238)
      spr(h, 'front-pikachu', 150, 262)
      spr(h, 'front-lapras', 218, 244)
    }
    h.save()
    h.globalAlpha = 0.86
    h.fillStyle = '#fbfdff'
    h.fillRect(8, 8, W - 16, 52)
    h.globalAlpha = 1
    h.strokeStyle = '#24304f'
    h.lineWidth = 2
    h.strokeRect(9, 9, W - 18, 50)
    h.restore()
    if (guides) {
      for (const s of STRIPS) dashRect(h, 1, stripTop(PV.hz, s.h), W - 2, s.h, '#f2553f')
      dashRect(h, BATTLE.x, by, BATTLE.w, BATTLE.h, '#e8b44a')
      h.save()
      h.globalAlpha = 0.9
      h.fillStyle = '#24304f'
      h.fillRect(0, PV.hz, 6, 1)
      h.fillRect(W - 6, PV.hz, 6, 1)
      h.restore()
    }
    // Banners: strips around the horizon.
    STRIPS.forEach((s, i) => {
      const g = ctx('#bg-pv-strip' + i)
      g.clearRect(0, 0, W, s.h)
      g.drawImage(PV.src, 0, stripTop(PV.hz, s.h), W, s.h, 0, 0, W, s.h)
    })
    // Battle: the middle window, then the translucent zones and the two Pokémon on them.
    const b = ctx('#bg-pv-battle')
    b.clearRect(0, 0, BATTLE.w, BATTLE.h)
    b.drawImage(PV.src, BATTLE.x, by, BATTLE.w, BATTLE.h, 0, 0, BATTLE.w, BATTLE.h)
    if (zones) {
      zone(b, ZONES.foe)
      zone(b, ZONES.own)
    }
    if (sprites) {
      spr(b, 'front-pikachu', ZONES.foe.x, ZONES.foe.y + 3)
      spr(b, 'back-charizard', ZONES.own.x, BATTLE.h + 6)
    }
  }

  function countColours(px) {
    const s = new Set()
    for (let i = 0; i < px.length; i += 4) s.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])
    return s.size
  }

  /** Cut the palette to k colours (k-means in RGB, seeded along luminance so darks and lights both keep a slot). */
  function kmeans(px, k) {
    const n = px.length / 4
    const lum = (i) => px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => lum(a) - lum(b))
    const C = []
    for (let j = 0; j < k; j++) {
      const i = order[Math.min(n - 1, Math.floor(((j + 0.5) * n) / k))] * 4
      C.push([px[i], px[i + 1], px[i + 2]])
    }
    const lab = new Uint16Array(n)
    for (let it = 0; it < 10; it++) {
      const sum = Array.from({ length: k }, () => [0, 0, 0, 0])
      for (let p = 0; p < n; p++) {
        const i = p * 4
        let bi = 0,
          bd = Infinity
        for (let j = 0; j < k; j++) {
          const dr = px[i] - C[j][0],
            dg = px[i + 1] - C[j][1],
            db = px[i + 2] - C[j][2]
          const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
          if (d < bd) {
            bd = d
            bi = j
          }
        }
        lab[p] = bi
        const s = sum[bi]
        s[0] += px[i]
        s[1] += px[i + 1]
        s[2] += px[i + 2]
        s[3]++
      }
      for (let j = 0; j < k; j++)
        if (sum[j][3]) C[j] = [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]]
    }
    for (let p = 0; p < n; p++) {
      const c = C[lab[p]]
      px[p * 4] = c[0]
      px[p * 4 + 1] = c[1]
      px[p * 4 + 2] = c[2]
    }
  }

  // ================================================================== boot: the first time the tab shows
  let started = false
  async function start() {
    if (started) return
    started = true
    try {
      D = await (await fetch('assets/area-art.json')).json()
    } catch {
      $('#bg-app').innerHTML = '<p class="note">The area list could not load. Reload the page to try again.</p>'
      started = false
      return
    }
    D.regions.forEach((r) => (REGION[r.id] = r.name))
    D.areas.forEach((a) => (AREA[a.o] = a))
    D.pictures.push(...MOMENTS)
    // The regions, in the game's order, named as the area list names them.
    D.pictures.push(
      ...REGION_PICS.map((x) => ({
        ...x,
        id: `region-${x.r}`,
        kind: 'region',
        name: REGION[x.r] || x.r,
        areas: [],
        file: REGION_FILE(x.r),
      })),
    )
    D.pictures.push(...PLACES)
    D.pictures.push(...EVENTS)
    if (S.region !== 'all' && !REGION[S.region]) S.region = 'all'
    if (S.kind !== 'all' && !KINDS[S.kind]) S.kind = 'all'
    if (!['all', 'todo', 'done'].includes(S.show)) S.show = 'all'
    shell()
    bind()
    syncControls()
    renderList()
    initDone()
    styleRef()
    previewLab(D.pictures[0])
  }
  function watch() {
    const sec = $('#backgrounds')
    if (!sec) return
    if (!sec.hidden) start()
    new MutationObserver(() => {
      if (!sec.hidden) start()
    }).observe(sec, { attributes: true, attributeFilter: ['hidden'] })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch)
  else watch()
})()
