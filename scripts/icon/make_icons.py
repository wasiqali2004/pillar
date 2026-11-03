"""Draws the Pillar app icons into public/.

The mark is the splash logo: a teal-to-violet ring with an upright stroke
and a dot above it. Drawn at 4x and scaled
down so the curves come out smooth.

    python scripts/icon/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[2] / "public"
TEAL = (47, 225, 196)
VIOLET = (124, 92, 240)
GROUND = (21, 21, 42)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    """Diagonal teal-to-violet fill, used as the paint for the mark."""
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = lerp(TEAL, VIOLET, (x + y) / (2 * size - 2))
    return g


def ground(size):
    """Navy tile with the same soft teal/violet glow as the app background."""
    base = Image.new("RGB", (size, size), GROUND)
    glow = Image.new("RGB", (size, size), GROUND)
    d = ImageDraw.Draw(glow)
    d.ellipse([-size * 0.35, -size * 0.45, size * 0.85, size * 0.55], fill=(29, 75, 82))
    d.ellipse([size * 0.25, size * 0.45, size * 1.35, size * 1.4], fill=(58, 43, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.18))
    return Image.blend(base, glow, 0.85)


def mark(size, scale):
    """Rising sun over a horizon with an upright pillar through it, as an alpha
    mask. `scale` = mark width / tile width.

    Dawn and standing straight: Fajr and a fresh day for Muslims, "stay upright
    every day" for everyone else. (A ring with a stroke and dot read as the
    universal "info" icon, so that was dropped.)
    """
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    c = size / 2
    half = size * scale / 2           # half the mark's width
    horizon = c + half * 0.32         # sits a little below centre
    r = half * 0.62                   # sun radius
    w = max(2, round(half * 0.16))    # line weight
    # Sun: the top half of a ring resting on the horizon.
    d.arc([c - r, horizon - r, c + r, horizon + r], 180, 360, fill=255, width=w)
    # Horizon line, full mark width.
    d.rounded_rectangle([c - half, horizon - w / 2, c + half, horizon + w / 2], radius=w / 2, fill=255)
    # Pillar: rises from the horizon through the sun and past it.
    pw = round(w * 1.15)
    d.rounded_rectangle([c - pw / 2, horizon - half * 1.05, c + pw / 2, horizon], radius=pw / 2, fill=255)
    # Two short rays either side of the pillar's tip.
    ray = half * 0.16
    for sx in (-1, 1):
        x0 = c + sx * r * 0.95
        y0 = horizon - r * 0.95
        d.line([x0, y0, x0 + sx * ray * 0.75, y0 - ray * 0.75], fill=255, width=round(w * 0.8))
    return m


def icon(px, rounded, mark_scale):
    s = px * 4
    tile = ground(s)
    paint = gradient(s)
    tile.paste(paint, (0, 0), mark(s, mark_scale))
    out = tile.convert("RGBA")
    if rounded:
        # Transparent corners for the regular icon; the OS adds its own for maskable/Apple.
        inset = round(s * 0.06)
        corner = Image.new("L", (s, s), 0)
        ImageDraw.Draw(corner).rounded_rectangle([inset, inset, s - inset, s - inset], radius=round(s * 0.2), fill=255)
        out.putalpha(corner)
    return out.resize((px, px), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    jobs = {
        "icon-192.png": (192, True, 0.62),
        "icon-512.png": (512, True, 0.62),
        # Maskable icons get cropped to a circle or squircle, so keep the mark inside the safe zone.
        "icon-maskable-512.png": (512, False, 0.5),
        "apple-touch-icon.png": (180, False, 0.58),
    }
    for name, (px, rounded, scale) in jobs.items():
        icon(px, rounded, scale).save(OUT / name)
        print("wrote", name)
    # Browser tab icon (listed in app/layout.tsx metadata).
    icon(64, True, 0.66).save(OUT / "favicon.png")
    print("wrote favicon.png")


if __name__ == "__main__":
    main()
