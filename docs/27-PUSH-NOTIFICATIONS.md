# Push notifications

The game tells a player about three things while it is closed, on their phone or computer:

| Topic | When | What it says (English) | Tap opens |
|---|---|---|---|
| **Day Care Eggs** (`egg`) | The Day Care's next Egg check, when a pair is there and no Egg waits. Never between 22:00 and 8:00 the player's time: it waits for the morning | *Pokémon Day Care* — "Pikachu and Meowth have found something at the Day Care!" (nicknames when they have one) | `/daycare` |
| **Daily raids** (`raid`) | Each raid's UTC day, at 9:00 the player's time (the raid opens at midnight UTC, the middle of the night in Europe) | *Today's raid: Mewtwo* / *Today's raid: shiny Mewtwo ✦* — "A new raid is open. Team up and catch Mewtwo!" | `/events/raid` |
| **Live events** (`live`) | The moment one starts, for players with its badges | *Shiny Parade has begun!* — "Wild Pokémon are 5 times more likely to be shiny in Kanto. Go find one!" | `/home` (`/shop` for a Special Shop) |

All in the player's language. The raid hour and the quiet hours are the admin's (Admin → Config → Push notifications).

## The player's side

- **Asked once per feature.** The first time a player opens the Day Care, the raid page, or a live event's pop-up
  while push is off on this device, one pop-up asks: "Enable push notifications to be notified about upcoming raids".
  *Enable* asks the browser (its own prompt needs a tap, so it only ever comes from one). *No thanks* means that
  feature never asks again; the other features still ask once each. Turned on from one feature, every topic not
  refused is on.
- **Never asked again once on**, or when the browser has blocked the site (Settings then says how to allow it).
- **Settings → Notifications**: push on or off for this device, each topic's own switch, the device's name, and the
  INFO button with the rules. "Delete all my data" turns push off too.
- **Per device.** The permission and the subscription are the browser's own, so the choices live on the device
  (`localStorage` `pokedice.push`), not in the save: a phone can say yes while a computer says no.

### Phones and platforms

`src/lib/platform.ts` reads which system the game runs on (iOS, Android, Windows, macOS, Linux, ChromeOS), whether it's
a phone or tablet, and whether it was opened from the Home Screen (an installed web app).

- **Android, Windows, macOS, Linux, ChromeOS**: Chrome, Edge, Firefox and Safari 16+ on macOS subscribe in the tab.
- **iPhone and iPad**: Safari only lets a web app that was **added to the Home Screen** (iOS 16.4+) receive push. In a
  Safari tab the pop-up and Settings show the steps instead of *Enable* (Share → Add to Home Screen, open it from
  there); the game asks once more the first time it's opened from the Home Screen. The manifest
  (`public/manifest.webmanifest`) and the `apple-touch-icon` make that install look right.
- The platform goes to the server with each subscription (`android`, `ios-app`, `windows`…) for the admin's counts.

## How it works

```
 the game (src/engine/notify.ts → src/lib/push.ts)            Supabase (0053_push.sql)            Netlify (every 5 min)
 ─────────────────────────────────────────────────           ───────────────────────────         ─────────────────────
 subscribe: browser's endpoint + keys, topics, language ──▶   push_subscriptions
 plan: the next Egg, 7 days of raids, live events in   ──▶   push_notices (per player)   ◀──     push_due(): claims the
       the next 14 days, each with its words + picture        replaced when the plan changes      due ones, per device
                                                                                                  web-push → the browser's
                                                              push_report() ◀────────────────     push service; 404/410
 service worker (public/sw.js) ◀────────────────────────────────── push ──────────────────────    drop the subscription
   draws the picture, shows the notification; a tap opens the page
```

- **The game plans, the server delivers.** Eggs, raids and live events all follow from the save and the content, which
  the server can't run, so the game works out its own player's next notices (`pushPlan`: pure, in the engine) and
  hands them over with their words. `PushService` redoes it a few seconds after the save, the content, the language,
  the account or the topics change, and sends it only when it differs from the last one sent: most saves cost no
  request. The Extreme save plans nothing new (the main save's plan stays).
- **The owner** is the signed-in player (`u:<id>`, so every device of theirs gets the notices), or a guest's device
  id (`d:<id>`). A guest who signs in moves the endpoint to the player.
- **Each notice once.** A notice has a key (`egg:<time>`, `raid:<day>`, `live:<id>`); a new plan replaces the unsent
  ones and never resends a sent key. `push_due` marks what it hands out as sent first, so two runs can't send one
  twice. A notice over six hours late (the sender wasn't running) is dropped.
- **The Egg's pair.** A check picks one of its pairs at random; the notice names the likely one: the only pair, else
  your own two, else the first.

### The pictures

Notifications show pictures at their own sizes: a 2:1 image under the text (Android, Windows, ChromeOS) and a small
square icon, often cut round. A stretched 400 px area picture would blur and crop badly, so the push only *describes*
its picture (`src/lib/pushArt.ts`) and the service worker draws it, at whole-pixel scales so the pixel art stays crisp:

- **Image**: a 2:1 window of an area picture, cut where its land is (from the picture's measured walk box), drawn
  ×2 (800 × 400), with the Pokémon standing on it at a whole scale: the Day Care pair side by side in the yard, the
  raid Pokémon in its own area. A shiny one gets gold sparkles. A live event's own banner is cut 2:1 from its middle.
- **Icon**: the raid Pokémon alone on the info blue, inside the round mask's 70 %; the Day Care's is the Egg
  (`public/icons/egg-192.png`); a live event's is the app icon.
- **Badge** (Android's status bar): `public/icons/badge-96.png`, a white silhouette of the ball.
- Where the worker can't draw (no `OffscreenCanvas`), the plain pictures stand in. iOS shows the app icon only.

`pnpm app-icons` draws the app icons (192, 512, maskable 512, Apple 180), the badge and the Egg from the game's pixel
maps (the favicon's ball, `src/components/eggMap.ts`) into `public/icons/`.

## The switch

Admin → Config → **Push notifications**: Off / On for admin / On for everyone (docs/15 §20), **off by default**, in
`game_config.push` with the raid hour and the quiet hours. Off: no question, no Settings panel, nothing scheduled, and
the server takes no subscription and sends nothing (`push_open()`, `push_due`). On for admin: only the admin is asked,
and only the admin's subscriptions are served. The box also shows the devices subscribed, by system and topic, the
notices waiting and the last delivery.

## Setting it up

1. **Database**: run `supabase/migrations/0053_push.sql` (also inlined in `supabase/seed.sql`).
2. **VAPID keys**: `npx web-push generate-vapid-keys`. Keep the pair together.
3. **Netlify → Site configuration → Environment variables** (they reach both the build and the sender):
   - `VITE_VAPID_PUBLIC_KEY`: the public key (the game subscribes with it).
   - `VAPID_PRIVATE_KEY`: the private key (the sender only; never in the game's code).
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API → `service_role` (the sender only).
   - `VAPID_SUBJECT` (optional): `mailto:` or `https:` contact the push services can reach.
   - `VITE_SUPABASE_URL` is already set for the game.
4. **Redeploy**, so the build has the public key and Netlify picks up `netlify/functions/push-send.mts` (a scheduled
   function, every 5 minutes). Missing a setting, it logs which and does nothing.
5. **Admin → Config → Push notifications → On for admin**, try it on a phone (Android: Chrome; iPhone: add to the Home
   Screen first), then **On for everyone**.

Changing the keys later makes every existing subscription invalid: players are asked by the browser again only when
they turn push back on, so avoid it.

## Files

| | |
|---|---|
| `src/engine/notify.ts` | What to announce and when (pure) |
| `src/lib/platform.ts` | The device: system, phone or not, installed or not; push support |
| `src/lib/push.ts` | The device's choices, permission, subscription, words, sync with the server |
| `src/lib/pushArt.ts` | The picture's description |
| `src/components/PushPrompt.tsx` | The question, its rules, the tap from a notification while the game is open |
| `src/components/PushSettings.tsx` | Settings → Notifications |
| `src/components/PushService.tsx` | Keeps the server's schedule in step |
| `src/admin/sections/PushBox.tsx` | The admin's switch and counts |
| `public/sw.js` | The service worker: shows the notification, draws its picture, opens the page on a tap |
| `supabase/migrations/0053_push.sql` | Tables, the switch, the player's calls, the sender's calls |
| `netlify/functions/push-send.mts`, `netlify/push/send.ts` | The sender |
| `tests/engine/notify.test.ts`, `tests/push-client.test.ts`, `tests/push-sql.test.ts` | Tests |
