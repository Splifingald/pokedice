// The region pictures (public/region-art/<regionId>.png): one 400 px picture per region, generated from the Visual
// Lab's region prompts and shrunk to true pixel art by unpixel. They head the region cards in the Areas sheet, so
// every region looks like itself rather than like its first route. A region without one shows its first area's strip.

/**
 * The regions with a picture in public/region-art/ (400 × 400), and where its landmark sits: the card shows a 2:1 band
 * of it, and this is the band's `object-position` (0% the top band, 100% the bottom). A new picture needs a line here.
 */
const REGION_ART: Readonly<Record<string, number>> = {
  kanto: 26, // Indigo Plateau on its cliff, the town below
  johto: 30, // the pagoda and the Burned Tower
  hoenn: 50, // the smoking volcano over the bay
  sinnoh: 34, // Mt. Coronet's peak and its pillars
  unova: 50, // the skyline and the bridge
  kalos: 40, // the lit tower over the city
  alola: 50, // the islands at sunset
  galar: 60, // the stadium, the clock tower, the wheel
  paldea: 60, // the great crater
}

/** The region's picture and how to frame it, or null while it has none. */
export const regionPicture = (regionId: string): { url: string; focus: number } | null =>
  regionId in REGION_ART ? { url: `/region-art/${regionId}.png`, focus: REGION_ART[regionId]! } : null
