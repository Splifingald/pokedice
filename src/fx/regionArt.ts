// The region pictures (public/region-art/<regionId>.png): one 400 px picture per region, generated from the Visual
// Lab's region prompts and shrunk to true pixel art by unpixel. They head the region cards in the Areas sheet, so
// every region looks like itself rather than like its first route. A region without one shows its first area's strip.

/**
 * The regions with a picture in public/region-art/ (400 × 400), and where its landmark sits: the card shows it as a
 * banner, the same thin strip as the areas' (AreaStrip: 288 × 56), and this is the strip's `object-position` (0% the
 * top of the picture, 100% the bottom). A new picture needs a line here.
 */
const REGION_ART: Readonly<Record<string, number>> = {
  kanto: 28, // Indigo Plateau on its cliff
  johto: 54, // the pagoda over the maples
  hoenn: 50, // the smoking volcano over the bay
  sinnoh: 28, // Mt. Coronet's slopes and the lake
  unova: 50, // the skyline and the bridge
  kalos: 50, // the lit tower over the city
  alola: 50, // the islands at sunset
  galar: 52, // the stadium, the clock tower, the wheel
  paldea: 46, // the great crater
}

/** The region's picture and how to frame it, or null while it has none. */
export const regionPicture = (regionId: string): { url: string; focus: number } | null =>
  regionId in REGION_ART ? { url: `/region-art/${regionId}.png`, focus: REGION_ART[regionId]! } : null
