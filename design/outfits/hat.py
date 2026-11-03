"""Puts a hand-drawn hat on every frame of a Showdown cap-Pikachu GIF, following the cap as the head bobs.

    python3 -I hat.py <source.gif> <hat.txt> <out.gif> [--preview out.png]

design/outfits/README.md has the whole recipe (the sources, the four views, the size pass).

hat.txt: first line `origin X,Y` (the art's top-left, in the source's frame-0 pixels; may be negative), `cap X0,Y0,X1,Y1`
(the cap's region in frame 0), then rows of one character per pixel. Red and pom-pom letters sit behind the Pikachu
(an ear that comes up stays in front, as it did over the cap); the band's fur letters sit in front of it.
"""
import sys
from PIL import Image

PAL = {
    # behind: the cone, its bent tip, the pom-pom
    'D': (104, 18, 22), 'd': (143, 27, 27), 'r': (186, 27, 27), 'R': (219, 82, 65), 'L': (240, 132, 106),
    '#': (0, 0, 0), 'w': (255, 253, 234), 'Q': (205, 186, 186), 'q': (166, 126, 119),
    # in front: the fur band
    'W': (255, 253, 234), 'P': (205, 186, 186), 'p': (166, 126, 119), 'K': (0, 0, 0),
}
FRONT = set('WPpK')
# The cap's own colours (Showdown's palette for the Original Cap), the pixels taken off each frame.
CAP = {(166, 126, 119), (205, 186, 186), (255, 253, 234), (131, 209, 133), (96, 181, 83), (186, 27, 27),
       (219, 82, 65), (143, 27, 27)}


def read_hat(path):
    lines = [l.rstrip('\n') for l in open(path) if l.strip() and not l.startswith(';')]
    ox, oy = (int(v) for v in lines[0].split()[1].split(','))
    cap = tuple(int(v) for v in lines[1].split()[1].split(','))
    art = {}
    for j, row in enumerate(lines[2:]):
        for i, ch in enumerate(row):
            if ch in PAL: art[(ox + i, oy + j)] = ch
    return art, cap


def frames_of(path):
    im = Image.open(path)
    out = []
    for i in range(im.n_frames):
        im.seek(i)
        out.append((im.convert('RGBA'), im.info.get('duration', 50)))
    return out, im.info.get('loop', 0)


def cap_template(f0, cap):
    x0, y0, x1, y1 = cap
    cand = {}
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            p = f0.getpixel((x, y))
            if p[3] and p[:3] in CAP: cand[(x, y)] = p
    # Only the cap's one connected piece: an eye's white glint or a cheek shares the cap's colours.
    seed = max(cand, key=lambda q: sum((q[0] + i, q[1] + j) in cand for i in (-1, 0, 1) for j in (-1, 0, 1)))
    t, todo = {}, [seed]
    while todo:
        q = todo.pop()
        if q in t or q not in cand: continue
        t[q] = cand[q]
        todo += [(q[0] + i, q[1] + j) for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))]
    # The cap's black outline: black pixels touching it in frame 0, taken off too (the hat brings its own).
    for (x, y) in list(t):
        for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            q = (x + i, y + j)
            if q in t or not (0 <= q[0] < f0.width and 0 <= q[1] < f0.height): continue
            p = f0.getpixel(q)
            if p[3] and p[:3] == (0, 0, 0) and x0 <= q[0] <= x1 + 1 and y0 <= q[1] <= y1: t[q] = p
    return t


def shift_of(f, tmpl):
    best = None
    for dy in range(-5, 6):
        for dx in range(-4, 5):
            m = sum(1 for (x, y), p in tmpl.items()
                    if 0 <= x + dx < f.width and 0 <= y + dy < f.height and f.getpixel((x + dx, y + dy)) == p)
            if best is None or m > best[0]: best = (m, dx, dy)
    return best[1], best[2], best[0] / len(tmpl)


def main():
    src, hat_path, out = sys.argv[1:4]
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    art, cap = read_hat(hat_path)
    frames, loop = frames_of(src)
    tmpl = cap_template(frames[0][0], cap)
    W, H = frames[0][0].size
    # Room for the hat: grow the canvas where the art goes past it (shifts included).
    shifts = [shift_of(f, tmpl) for f, _ in frames]
    xs = [x + dx for (x, y) in art for dx, _, _ in shifts] + [0, W - 1]
    ys = [y + dy for (x, y) in art for _, dy, _ in shifts] + [0, H - 1]
    L, T = -min(xs), -min(ys)
    NW, NH = max(xs) + L + 1, max(ys) + T + 1
    outs = []
    worst = min(s[2] for s in shifts)
    for (f, dur), (dx, dy, score) in zip(frames, shifts):
        body = Image.new('RGBA', (NW, NH), (0, 0, 0, 0))
        body.paste(f, (L, T))
        px = body.load()
        # Take the cap off where it still shows (an ear in front of it keeps its own pixels).
        for (x, y), p in tmpl.items():
            X, Y = x + dx + L, y + dy + T
            if 0 <= X < NW and 0 <= Y < NH and px[X, Y] == p: px[X, Y] = (0, 0, 0, 0)
        # A frame can draw the cap a pixel past where frame 0 has it (the bill as an ear squashes it): a cap-coloured
        # pixel the hat won't cover, that frame 0 doesn't have at that place (an eye's glint, a cheek), takes the colour
        # most of its neighbours have.
        covered = {(x + dx + L, y + dy + T) for (x, y) in art}
        f0 = frames[0][0]
        for X in range(NW):
            for Y in range(NH):
                p = px[X, Y]
                if not p[3] or p[:3] not in CAP or (X, Y) in covered: continue
                ox, oy = X - L - dx, Y - T - dy
                if 0 <= ox < W and 0 <= oy < H and f0.getpixel((ox, oy)) == p: continue
                near = [px[X + i, Y + j] for i in (-1, 0, 1) for j in (-1, 0, 1)
                        if (i or j) and 0 <= X + i < NW and 0 <= Y + j < NH]
                near = [q for q in near if q[3] and q[:3] not in CAP]
                px[X, Y] = max(set(near), key=near.count) if near else (0, 0, 0, 0)
        back = Image.new('RGBA', (NW, NH), (0, 0, 0, 0))
        front = Image.new('RGBA', (NW, NH), (0, 0, 0, 0))
        bp, fp = back.load(), front.load()
        for (x, y), ch in art.items():
            X, Y = x + dx + L, y + dy + T
            (fp if ch in FRONT else bp)[X, Y] = PAL[ch] + (255,)
        frame = Image.alpha_composite(Image.alpha_composite(back, body), front)
        outs.append((frame, dur))
    save_gif(outs, out, loop)
    print(f'{out}: {len(outs)} frames, {NW}x{NH} (canvas grew left {L}, top {T}), worst cap match {worst:.2f}')
    if preview:
        Z = 6
        pick = list(range(0, len(outs), max(1, len(outs) // 12)))[:12]
        sheet = Image.new('RGBA', (len(pick) * (NW * Z + 6), NH * Z), (255, 255, 255, 255))
        for k, i in enumerate(pick):
            bg = Image.new('RGBA', (NW, NH), (200, 220, 240, 255))
            bg.alpha_composite(outs[i][0])
            sheet.paste(bg.resize((NW * Z, NH * Z), Image.NEAREST), (k * (NW * Z + 6), 0))
        sheet.save(preview)


def save_gif(frames, out, loop):
    """A palette GIF with full frames and real transparency, like Showdown's own."""
    pal_imgs = []
    colours = {}
    for f, _ in frames:
        for p in f.getdata():
            if p[3]: colours.setdefault(p[:3], len(colours) + 1)
    assert len(colours) < 256, len(colours)
    palette = [0, 0, 0]
    for c, _ in sorted(colours.items(), key=lambda kv: kv[1]): palette += list(c)
    palette += [0, 0, 0] * (256 - len(palette) // 3)
    for f, _ in frames:
        p = Image.new('P', f.size, 0)
        p.putpalette(palette)
        src = f.load()
        dst = p.load()
        for y in range(f.height):
            for x in range(f.width):
                c = src[x, y]
                dst[x, y] = colours[c[:3]] if c[3] else 0
        pal_imgs.append(p)
    pal_imgs[0].save(out, save_all=True, append_images=pal_imgs[1:], duration=[d for _, d in frames], loop=loop,
                     transparency=0, disposal=2, optimize=False)


if __name__ == '__main__':
    main()
