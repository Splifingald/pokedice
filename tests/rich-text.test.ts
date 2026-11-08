// The developer's words in a message (lib/richText.ts, docs/15 §23): addresses become links, and a YouTube address on
// a line of its own becomes the video. Only http(s) is ever a link; a video is rebuilt from its id alone.
import { describe, expect, it } from 'vitest'
import { linkify, richBlocks, safeHref, youtubeEmbed, youtubeVideo } from '@/lib/richText'

const links = (text: string) => linkify(text).filter((s) => s.kind === 'link')

describe('links', () => {
  it('finds http(s) and www. addresses in the words, the rest stays words', () => {
    expect(linkify('Join us on https://discord.gg/abc and www.example.com today')).toEqual([
      { kind: 'text', text: 'Join us on ' },
      { kind: 'link', text: 'https://discord.gg/abc', href: 'https://discord.gg/abc' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'www.example.com', href: 'https://www.example.com/' },
      { kind: 'text', text: ' today' },
    ])
    expect(linkify('No address here.')).toEqual([{ kind: 'text', text: 'No address here.' }])
    expect(linkify('')).toEqual([])
  })

  it('leaves the sentence’s punctuation off the link, but keeps a bracket the address opened', () => {
    expect(links('See https://example.com/page.')[0]).toMatchObject({ text: 'https://example.com/page' })
    expect(links('(see https://example.com/a?b=1)!')[0]).toMatchObject({ text: 'https://example.com/a?b=1' })
    expect(links('https://en.wikipedia.org/wiki/Pok%C3%A9mon_(franchise), yes')[0]).toMatchObject({
      text: 'https://en.wikipedia.org/wiki/Pok%C3%A9mon_(franchise)',
    })
    expect(links('"https://example.com/x"')[0]).toMatchObject({ text: 'https://example.com/x' })
  })

  it('never makes a link of anything but http(s), nor of a bare word', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('https://localhost')).toBeNull()
    expect(links('javascript:alert(1) data:text/html,hi')).toEqual([])
    expect(safeHref('http://example.com')).toBe('http://example.com/')
  })

  it('keeps line breaks in the words', () => {
    expect(linkify('a\nhttps://x.com\nb').map((s) => s.text)).toEqual(['a\n', 'https://x.com', '\nb'])
  })
})

describe('YouTube', () => {
  it('reads the video from every kind of YouTube address, and where it starts', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&list=PL123`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `www.youtube.com/watch?v=${id}`,
    ])
      expect(youtubeVideo(url), url).toEqual({ id, start: 0 })
    expect(youtubeVideo(`https://youtu.be/${id}?t=90`)).toEqual({ id, start: 90 })
    expect(youtubeVideo(`https://youtu.be/${id}?t=90s`)).toEqual({ id, start: 90 })
    expect(youtubeVideo(`https://www.youtube.com/watch?v=${id}&t=1m30s`)).toEqual({ id, start: 90 })
    expect(youtubeVideo(`https://www.youtube.com/watch?v=${id}&t=1h2m3s`)).toEqual({ id, start: 3723 })
  })

  it('is nothing for another site, a channel, or an id that isn’t one', () => {
    expect(youtubeVideo('https://vimeo.com/123')).toBeNull()
    expect(youtubeVideo('https://www.youtube.com/@pokedice')).toBeNull()
    expect(youtubeVideo('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(youtubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ"onload=x')).toBeNull()
    expect(youtubeVideo('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeVideo('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('plays from YouTube’s no-cookie host, from the id alone', () => {
    expect(youtubeEmbed('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(youtubeEmbed('dQw4w9WgXcQ', 42)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42',
    )
  })
})

describe('the message as blocks', () => {
  it('a YouTube address alone on its line is the video; in a sentence it stays a link', () => {
    const text = 'New update!\n\nhttps://youtu.be/dQw4w9WgXcQ\n\nWatch https://youtu.be/dQw4w9WgXcQ too.'
    const blocks = richBlocks(text)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'video', 'text'])
    expect(blocks[1]).toMatchObject({ kind: 'video', id: 'dQw4w9WgXcQ', start: 0 })
    const last = blocks[2]!
    expect(last.kind === 'text' && last.segments.map((s) => s.kind)).toEqual(['text', 'link', 'text'])
  })

  it('without videos (a preview), the line stays a link', () => {
    const blocks = richBlocks('Hi\nhttps://youtu.be/dQw4w9WgXcQ', { videos: false })
    expect(blocks).toHaveLength(1)
    const first = blocks[0]!
    expect(first.kind === 'text' && first.segments.filter((s) => s.kind === 'link')).toEqual([
      { kind: 'link', text: 'https://youtu.be/dQw4w9WgXcQ', href: 'https://youtu.be/dQw4w9WgXcQ' },
    ])
  })

  it('plain words are one block, their line breaks kept', () => {
    expect(richBlocks('one\ntwo\n\nthree')).toEqual([
      { kind: 'text', segments: [{ kind: 'text', text: 'one\ntwo\n\nthree' }] },
    ])
    expect(richBlocks('   ')).toEqual([{ kind: 'text', segments: [{ kind: 'text', text: '   ' }] }])
  })

  it('two videos in a row, and spaces around the address, are fine', () => {
    const blocks = richBlocks('  https://youtu.be/dQw4w9WgXcQ  \nhttps://www.youtube.com/watch?v=9bZkp7q19f0')
    expect(blocks.map((b) => (b.kind === 'video' ? b.id : b.kind))).toEqual(['dQw4w9WgXcQ', '9bZkp7q19f0'])
  })
})
