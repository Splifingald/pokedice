// Published content as one Storage file (0030): the right URL, and only that version's playable content is accepted.
import { describe, expect, it } from 'vitest'
import { BUNDLE } from '@/config/bundle'
import { bundleToRows, rowsToBundle } from '@/config/mapping'
import { contentFileUrl, fetchContentFile } from '@/config/remote'
import type { BundleRaw } from '@/engine/types'

// What Admin → Publish uploads: the working rows, as players would rebuild them from the tables.
const published = (version: number): BundleRaw => {
  const b = rowsToBundle(bundleToRows(BUNDLE as BundleRaw))
  return { ...b, config: { ...b.config, configVersion: version } }
}
const serve = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch

describe('content file', () => {
  it('lives in the public content bucket, one file per version', () => {
    expect(contentFileUrl(12, 'https://ref.supabase.co')).toBe('https://ref.supabase.co/storage/v1/object/public/content/v12.json')
  })

  it("carries the version the rows say, so it can be checked", () => {
    expect(published(7).config.configVersion).toBe(7)
  })

  it("is taken when it is that version's playable content", async () => {
    expect(await fetchContentFile(7, serve(published(7)))).toEqual(published(7))
  })

  it('is refused for another version, unplayable content, a 404 or a network error', async () => {
    expect(await fetchContentFile(8, serve(published(7)))).toBeNull()
    expect(await fetchContentFile(7, serve({ ...published(7), areas: [] }))).toBeNull()
    expect(await fetchContentFile(7, serve({ error: 'not found' }, false))).toBeNull()
    expect(await fetchContentFile(7, serve('<html>'))).toBeNull()
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await fetchContentFile(7, offline)).toBeNull()
  })
})
