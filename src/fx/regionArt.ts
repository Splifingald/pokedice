// The region pictures (public/region-art/<regionId>.png): one 400 px picture per region, generated from the Visual
// Lab's region prompts and shrunk to true pixel art by unpixel. They head the region cards in the Areas sheet, so
// every region looks like itself rather than like its first route. A region without one shows its first area's strip.

/** The regions that have a picture in public/region-art/. A new picture needs its id here. */
const REGION_ART: ReadonlySet<string> = new Set<string>([])

/** The region's picture, or null while it has none. */
export const regionPicture = (regionId: string): string | null =>
  REGION_ART.has(regionId) ? `/region-art/${regionId}.png` : null
