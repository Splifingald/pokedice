"""Whether two GIFs show the same picture at every moment (frames merged on writing don't count as a difference).

    python3 -I timeline.py <a.gif> <b.gif>
"""
import sys
from PIL import Image
def timeline(path):
    im = Image.open(path); out = []
    for i in range(im.n_frames):
        im.seek(i); f = im.convert('RGBA')
        px = tuple(p if p[3] else (0, 0, 0, 0) for p in f.getdata())
        out += [px] * (im.info.get('duration', 0) // 10)
    return out
a, b = timeline(sys.argv[1]), timeline(sys.argv[2])
bad = [t for t, (x, y) in enumerate(zip(a, b)) if x != y]
print(f'{len(a)*10} ms vs {len(b)*10} ms, {len(bad)} ten-ms steps differ')
