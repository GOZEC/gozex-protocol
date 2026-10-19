"""Asset prep. Run once: python -I tools/prep.py
Reads brand/ and reference/, writes src/img/*, src/favicon.svg, src/palette.json, src/css/tokens.css
"""
import json, struct, numpy as np
from PIL import Image

rng = np.random.default_rng(7)
LOGO_T = 'brand/LOGO GOZEC PNG...png'          # RGBA, transparent bg, pure-black transparent px
BANNER = 'reference/SAMPUL GOZEC JPG.jpg.jpeg'
HERO = 'reference/GOZEC 1.jpg.jpeg'

# ---- IHDR / alpha check on the transparent logo
raw = open(LOGO_T, 'rb').read()
w, h, bd, ct = struct.unpack('>IIBB', raw[16:26])
assert ct == 6, 'expected RGBA colortype 6'
logo = Image.open(LOGO_T).convert('RGBA')
la = np.array(logo)
zero = la[..., 3] == 0
pure_black_transparent = bool(zero.any() and (la[zero][:, :3].sum(1) == 0).all())
print('IHDR', w, h, bd, ct, 'pure-black transparent regions:', pure_black_transparent)
assert pure_black_transparent


def premul_resize(im, size):
    """Premultiplied resize: avoids dark fringes where transparent px carry rgb 0,0,0."""
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


# ---- palette: k-means on banner + hero art, snapped to real pixel coordinates
import subprocess


def jpeg_rgb(path):
    # decode with jpeg-js so palette coordinates verify bit-exact in scripts/gates.mjs
    raw = subprocess.run(['node', 'tools/decode.mjs', path], capture_output=True, check=True).stdout
    w, h = struct.unpack('<II', raw[:8])
    return np.frombuffer(raw[8:], dtype=np.uint8).reshape(h, w, 4)[..., :3].copy()


srcs = {BANNER: jpeg_rgb(BANNER), HERO: jpeg_rgb(HERO)}
X = np.vstack([a.reshape(-1, 3)[::40] for a in srcs.values()]).astype(float)
K = 10
c = X[rng.choice(len(X), 1)]
for _ in range(K - 1):
    d = np.min(((X[:, None] - c[None]) ** 2).sum(2), 1)
    c = np.vstack([c, X[rng.choice(len(X), 1, p=d / d.sum())]])
for _ in range(40):
    a = ((X[:, None] - c[None]) ** 2).sum(2).argmin(1)
    c = np.array([X[a == i].mean(0) if (a == i).any() else c[i] for i in range(K)])


def snap(target, pool):
    best = None
    for f, arr in pool.items():
        d = ((arr.astype(float) - target) ** 2).sum(2)
        y, x = np.unravel_index(d.argmin(), d.shape)
        v = d[y, x]
        if best is None or v < best[0]:
            best = (v, f, int(x), int(y), arr[y, x])
    return best


def hexof(p):
    return '#%02x%02x%02x' % tuple(int(v) for v in p[:3])


snapped = []
for cen in c:
    _, f, x, y, px = snap(cen, srcs)
    snapped.append(dict(hex=hexof(px), file=f, x=x, y=y))

op = la[..., 3] == 255


def logo_snap(target):
    m = np.where(op, ((la[..., :3].astype(float) - target) ** 2).sum(2), 1e18)
    y, x = np.unravel_index(m.argmin(), m.shape)
    return dict(hex=hexof(la[y, x]), file=LOGO_T, x=int(x), y=int(y))


ink = logo_snap(np.array([8., 8, 8]))
silver = logo_snap(np.array([200., 200, 200]))
white = logo_snap(np.array([240., 240, 240]))


def rgb(e):
    h = e['hex']
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def lumv(e):
    r, g, b = rgb(e)
    return .299 * r + .587 * g + .114 * b


def near(t):
    return min(snapped, key=lambda e: sum(abs(a - b) for a, b in zip(rgb(e), t)))


roles = dict(bg=near((4, 32, 77)), navy=near((6, 47, 105)), indigo=near((47, 64, 115)),
             plum=near((99, 83, 114)), rose=near((192, 138, 129)), orange=near((238, 157, 105)),
             amber=near((251, 204, 123)), cream=near((248, 230, 172)),
             snow=max(snapped, key=lumv), ink=ink, silver=silver, bone=white)
json.dump(roles, open('src/palette.json', 'w'), indent=1)
print({k: v['hex'] for k, v in roles.items()})

# ---- tokens.css (the only file allowed to hold colour literals)
P = {k: v['hex'] for k, v in roles.items()}
prov = '\n'.join('   %-7s %s  %s @ (%d,%d)' % (k, v['hex'], v['file'], v['x'], v['y']) for k, v in roles.items())
tokens = """/*
  TOKENS: the only file in this project that may hold colour literals.
  Provenance: k-means (k=10, seed 7, kmeans++ init) over pixels of
  %(banner)s and %(hero)s;
  every centroid snapped to the nearest REAL pixel (file @ x,y below).
  ink, silver and bone come from the opaque pixels of the logo PNG.
%(prov)s
  Nothing here is invented; tools/prep.py regenerates this block.
*/
:root {
  color-scheme: dark;
  --c-bg: %(bg)s;
  --c-navy: %(navy)s;
  --c-indigo: %(indigo)s;
  --c-plum: %(plum)s;
  --c-rose: %(rose)s;
  --c-orange: %(orange)s;
  --c-amber: %(amber)s;
  --c-cream: %(cream)s;
  --c-snow: %(snow)s;
  --c-ink: %(ink)s;
  --c-silver: %(silver)s;
  --c-bone: %(bone)s;

  --bg: var(--c-bg);
  --bg-2: var(--c-navy);
  --fg: var(--c-snow);
  --strong: var(--c-bone);
  --muted: color-mix(in srgb, var(--fg) 72%%, var(--bg));
  --dim: color-mix(in srgb, var(--fg) 58%%, var(--bg));
  --faint: color-mix(in srgb, var(--fg) 40%%, var(--bg));
  --line: color-mix(in srgb, var(--fg) 16%%, transparent);
  --hair: color-mix(in srgb, var(--fg) 10%%, transparent);
  --edge: color-mix(in srgb, var(--fg) 26%%, transparent);
  --edge-hi: color-mix(in srgb, var(--fg) 44%%, transparent);
  --frost: color-mix(in srgb, var(--bg) 46%%, transparent);
  --frost-hi: color-mix(in srgb, var(--fg) 8%%, transparent);
  --glass: color-mix(in srgb, var(--bg) 66%%, transparent);
  --glass-edge: color-mix(in srgb, var(--fg) 18%%, transparent);
  --card: color-mix(in srgb, var(--bg-2) 52%%, transparent);
  --shadow: color-mix(in srgb, var(--c-ink) 38%%, transparent);
  --accent: var(--c-orange);
  --accent-2: var(--c-amber);
  --accent-3: var(--c-cream);
  --press: var(--c-silver);
  --up: var(--c-cream);
  --down: var(--c-rose);
  --err: var(--c-rose);
  --focus: var(--c-amber);
  --spot: color-mix(in srgb, var(--c-amber) 20%%, transparent);

  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ease-soft: cubic-bezier(.2, .65, .2, 1);
  --t-fast: .2s;
  --t-mid: .25s;
  --t-slow: .85s;

  --font-sans: "DM Sans", system-ui, sans-serif;
  --font-serif: "Instrument Serif", Georgia, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
""" % dict(P, banner=BANNER, hero=HERO, prov=prov)
open('src/css/tokens.css', 'w', encoding='utf8').write(tokens)

# ---- raster assets (premultiplied resize because of pure-black transparent regions)
ys, xs = np.where(la[..., 3] > 8)
bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
print('logo bbox', bb)
pad = 40
cx, cy = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
half = max(bb[2] - bb[0], bb[3] - bb[1]) // 2 + pad
sq = logo.crop((cx - half, cy - half, cx + half, cy + half))
for s in (512, 192):
    premul_resize(sq, (s, s)).save('src/img/logo-%d.webp' % s, quality=90, method=6)
at = premul_resize(sq, (150, 150))
base = Image.new('RGBA', (180, 180), tuple(rgb(roles['bg'])) + (255,))
base.alpha_composite(at, (15, 15))
base.convert('RGB').save('src/img/apple-touch-icon.png')

hero = Image.open(HERO).convert('RGB')
hero.crop((880, 40, 1600, 900)).save('src/img/hero-ghost.webp', quality=86, method=6)
ban = Image.open(BANNER).convert('RGB')
ban.crop((500, 0, 1500, 500)).resize((1200, 600), Image.LANCZOS).save('src/img/og.jpg', quality=88)

# ---- favicon: trace from the real 32x32 premultiplied pixel grid
g = np.array(premul_resize(sq, (32, 32)))
tones = [(roles['ink']['hex'], 0, 80), (roles['silver']['hex'], 80, 190), (roles['bone']['hex'], 190, 256)]
paths = []
for hx, lo, hi in tones:
    d = []
    for y in range(32):
        x = 0
        while x < 32:
            def ok(xx):
                return g[y, xx, 3] >= 128 and lo <= g[y, xx, :3].astype(float).mean() < hi
            if ok(x):
                s = x
                while x < 32 and ok(x):
                    x += 1
                d.append('M%d %dh%dv1h-%dz' % (s, y, x - s, x - s))
            else:
                x += 1
    if d:
        paths.append('<path fill="%s" d="%s"/>' % (hx, ''.join(d)))
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">'
       '<rect width="32" height="32" rx="7" fill="%s"/>' % roles['bg']['hex'] + ''.join(paths) + '</svg>')
assert '--' not in svg
open('src/favicon.svg', 'w', encoding='utf8').write(svg)
print('favicon bytes', len(svg))
