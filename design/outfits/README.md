# Outfits: our own sprites

Showdown has a few dressed-up Pokémon (Cosplay and Cap Pikachu, Furfrou's trims). For an outfit it doesn't have,
we draw it on top of one of its animated sprites. The result is a sprite like Showdown's: the four views the game asks
for (front, back, both shiny), animated, at Showdown's paths under `sprites-custom/`, which `pnpm sprites-mirror`
adds to our Cloudflare copy (docs/45-SPRITE-MIRROR.md). Showdown itself doesn't have them, so they show only when the
game reads from the copy.

| Id | Drawn on | Files |
|---|---|---|
| `pikachu-santa` | `pikachu-original` (Original Cap), its cap swapped for a Santa hat | `sprites-custom/sprites/gen5ani{,-back}{,-shiny}/pikachu-santa.gif` |

## How a hat is drawn

`hat.py` takes a cap Pikachu's GIF and a hat drawn as text (`santa-front.txt`, `santa-back.txt`: one character per
pixel, the letters are the palette in `hat.py`):

- it finds the cap in frame 0 (its colours, in one connected piece, so an eye's glint or a cheek isn't taken), then
  follows it through every frame (the head only bobs: 0 to 4 pixels down);
- it takes the cap off, and puts the hat where the cap is in that frame. The red part goes behind Pikachu, so an ear
  that comes up stays in front of it, as it did over the cap; the fur band goes in front;
- the canvas grows where the hat goes past it (5 pixels on top for Santa);
- the frame timing is the source's, to the millisecond.

The hat has to cover the whole cap: the sprite has no head drawn under it.

## Remaking Santa Pikachu

From a folder outside the repo (the downloads are other people's files):

```bash
H=https://play.pokemonshowdown.com/sprites
for d in gen5ani gen5ani-back gen5ani-shiny gen5ani-back-shiny; do curl -sSfo $d.gif $H/$d/pikachu-original.gif; done
O=<repo>/design/outfits
for d in gen5ani gen5ani-shiny; do python3 -I $O/hat.py $d.gif $O/santa-front.txt raw-$d.gif; done
for d in gen5ani-back gen5ani-back-shiny; do python3 -I $O/hat.py $d.gif $O/santa-back.txt raw-$d.gif; done
# Smaller files, same pictures: ImageMagick stores only what changes between frames (about 80 KB down to 33 KB).
for d in gen5ani gen5ani-back gen5ani-shiny gen5ani-back-shiny; do
  convert raw-$d.gif -layers Optimize <repo>/sprites-custom/sprites/$d/pikachu-santa.gif
  python3 -I $O/timeline.py raw-$d.gif <repo>/sprites-custom/sprites/$d/pikachu-santa.gif  # must say 0 differ
done
```

Then `pnpm sprites-mirror` and the deploy line of docs/45 step 4.
