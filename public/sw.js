// Pokédice's service worker: push notifications only (docs/27-PUSH-NOTIFICATIONS.md). It caches nothing and never
// touches the game's requests. A push carries what to show (src/lib/push.ts builds it): the title and line, where a tap
// leads, and its picture, described rather than sent: a window of an area picture and the Pokémon to stand on it. The
// picture is drawn here, at whole-pixel scales so the pixel art stays crisp, into the shapes notifications use: a
// 2:1 image under the text and a square icon beside it. Where that can't be drawn, the plain pictures stand in.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

/** The large image's width: Android shows it 2:1, about 360 dp wide on a phone (×2 for a sharp screen). */
const IMAGE_W = 720
const ICON = 192
/** The info blue behind an icon's Pokémon (theme `sky`). */
const TINT = '#e8f1ff'
const GOLD = '#ffbe2e'
const INK = '#24304f'

async function bitmap(src) {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`${src}: ${res.status}`)
  return createImageBitmap(await res.blob())
}

/** The box of a picture's opaque pixels (a sprite's canvas is mostly empty). */
function opaqueBox(img) {
  const c = new OffscreenCanvas(img.width, img.height)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const { data } = g.getImageData(0, 0, img.width, img.height)
  let x0 = img.width
  let y0 = img.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (data[(y * img.width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 < 0
    ? { x: 0, y: 0, w: img.width, h: img.height }
    : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Four gold sparkles around a shiny, each a small pixel cross. */
function sparkles(g, x, y, w, h, px) {
  const at = [
    [x - px * 2, y + h * 0.15],
    [x + w + px, y + h * 0.05],
    [x + w + px * 2, y + h * 0.55],
    [x - px * 3, y + h * 0.7],
  ]
  for (const [cx, cy] of at) {
    g.fillStyle = INK
    g.fillRect(cx - px * 2, cy - px, px * 5, px * 3)
    g.fillRect(cx - px, cy - px * 2, px * 3, px * 5)
    g.fillStyle = GOLD
    g.fillRect(cx - px, cy, px * 3, px)
    g.fillRect(cx, cy - px, px, px * 3)
  }
}

/** A sprite standing at `foot` (its bottom), centred on `cx`, scaled `k` times; returns where it went. */
function stand(g, img, box, cx, foot, k) {
  const w = box.w * k
  const h = box.h * k
  const x = Math.round(cx - w / 2)
  const y = Math.round(foot - h)
  g.drawImage(img, box.x, box.y, box.w, box.h, x, y, w, h)
  return { x, y, w, h }
}

async function toDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(s)}`
}

/**
 * The 2:1 image: `art.bg` is a window of a picture ({ src, x, y, w, h } in its own pixels, already 2:1; without them,
 * the picture's middle), drawn at the whole scale nearest IMAGE_W; `art.mons` ({ src, shiny }) stand on `art.ground` (0–1 down the window), side by side,
 * each about `art.height` (0–1) of the image tall.
 */
async function drawImage(art) {
  const bg = await bitmap(art.bg.src)
  // A picture without a window (an event's own banner): its middle, 2:1.
  const win =
    art.bg.w && art.bg.h
      ? art.bg
      : bg.width / bg.height > 2
        ? { x: Math.round((bg.width - bg.height * 2) / 2), y: 0, w: bg.height * 2, h: bg.height }
        : { x: 0, y: Math.round((bg.height - bg.width / 2) / 2), w: bg.width, h: Math.round(bg.width / 2) }
  const k = Math.max(1, Math.round(IMAGE_W / win.w))
  const W = win.w * k
  const H = win.h * k
  const c = new OffscreenCanvas(W, H)
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  g.drawImage(bg, win.x || 0, win.y || 0, win.w, win.h, 0, 0, W, H)
  const mons = (await Promise.allSettled((art.mons || []).map((m) => bitmap(m.src)))).map((r, i) =>
    r.status === 'fulfilled' ? { img: r.value, shiny: !!art.mons[i].shiny } : null,
  )
  const shown = mons.filter(Boolean)
  const foot = Math.round(H * (art.ground ?? 0.8))
  shown.forEach((m, i) => {
    const box = opaqueBox(m.img)
    // A whole scale, so every sprite pixel is the same square.
    const s = Math.max(1, Math.floor((H * (art.height ?? 0.45)) / Math.max(box.h, box.w * 0.8)))
    const cx = (W * (i + 1)) / (shown.length + 1)
    const at = stand(g, m.img, box, cx, foot, s)
    if (m.shiny) sparkles(g, at.x, at.y, at.w, at.h, Math.max(3, s))
  })
  return toDataUrl(c)
}

/** The square icon: one Pokémon ({ src, shiny }) on the info blue, as big as a whole scale lets it be. */
async function drawIcon(mon) {
  const img = await bitmap(mon.src)
  const box = opaqueBox(img)
  const c = new OffscreenCanvas(ICON, ICON)
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  g.fillStyle = TINT
  g.fillRect(0, 0, ICON, ICON)
  // Android shows the icon in a circle: the sprite keeps inside about 70 % of it.
  const k = Math.max(1, Math.floor((ICON * 0.7) / Math.max(box.w, box.h)))
  const h = box.h * k
  const at = stand(g, img, box, ICON / 2, Math.round((ICON + h) / 2), k)
  if (mon.shiny) sparkles(g, at.x, at.y, at.w, at.h, Math.max(3, k))
  return toDataUrl(c)
}

/** The drawn pictures where this browser can draw them, else the plain ones the push names. */
async function pictures(msg) {
  const out = { icon: msg.icon || '/icons/icon-192.png', image: msg.image }
  if (!msg.art || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined')
    return out
  const [image, icon] = await Promise.allSettled([
    msg.art.bg ? drawImage(msg.art) : Promise.reject(new Error('no picture')),
    msg.art.icon ? drawIcon(msg.art.icon) : Promise.reject(new Error('no icon')),
  ])
  if (image.status === 'fulfilled') out.image = image.value
  if (icon.status === 'fulfilled') out.icon = icon.value
  return out
}

self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      const pic = await pictures(msg).catch(() => ({
        icon: msg.icon || '/icons/icon-192.png',
        image: msg.image,
      }))
      await self.registration.showNotification(msg.title || 'Pokédice', {
        body: msg.body || '',
        tag: msg.tag,
        icon: pic.icon,
        image: pic.image,
        badge: '/icons/badge-96.png',
        lang: msg.lang,
        data: { url: msg.url || '/home' },
      })
    })(),
  )
})

// A tap opens the game where the notice points. A tab already open is brought forward and told where to go (the game
// moves there itself, between fights: a reload would lose a fight under way); otherwise a new one opens there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const asked = event.notification.data && event.notification.data.url
  // Only the game's own pages.
  const path = typeof asked === 'string' && asked.startsWith('/') && !asked.startsWith('//') ? asked : '/home'
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin)
      if (tab) {
        await tab.focus()
        tab.postMessage({ type: 'pokedice:open', url: path })
        return
      }
      await self.clients.openWindow(new URL(path, self.location.origin).href)
    })(),
  )
})
