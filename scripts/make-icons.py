#!/usr/bin/env python3
"""Generate GA.Spas PWA app icons (home-screen icon = the brand wordmark)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'images')
FOREST_TOP = (58, 74, 55)
FOREST_BOT = (28, 37, 28)
CREAM = (246, 241, 233)
GOLD = (201, 162, 75)

FONTS = [
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
]
FONT = next((f for f in FONTS if os.path.exists(f)), None)


def gradient(size):
    col = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        col.putpixel((0, y), tuple(int(a * (1 - t) + b * t) for a, b in zip(FOREST_TOP, FOREST_BOT)))
    return col.resize((size, size))


def fit_font(text, target_w):
    s = 10
    f = ImageFont.truetype(FONT, s)
    while f.getlength(text) < target_w and s < 4000:
        s += 4
        f = ImageFont.truetype(FONT, s)
    return ImageFont.truetype(FONT, max(10, s - 4))


def render(size, text_frac=0.80, name="icon"):
    img = gradient(size)
    d = ImageDraw.Draw(img)
    W = size
    f = fit_font("GA.Spas", W * text_frac)
    segs = [("GA", CREAM), (".", GOLD), ("Spas", CREAM)]
    total = sum(f.getlength(t) for t, _ in segs)
    x = (W - total) / 2
    y = W * 0.5
    for t, color in segs:
        d.text((x, y), t, font=f, fill=color, anchor="lm")
        x += f.getlength(t)
    # gold underline rule
    rule_w = total * 0.92
    rx = (W - rule_w) / 2
    ry = y + f.size * 0.46
    d.rounded_rectangle([rx, ry, rx + rule_w, ry + max(2, W * 0.012)],
                        radius=W * 0.01, fill=GOLD)
    # eyebrow
    ef = ImageFont.truetype(FONT, max(8, int(W * 0.052)))
    d.text((W / 2, W * 0.30), "G E O R G I A", font=ef, fill=(139, 154, 126), anchor="mm")
    img.save(os.path.join(OUT, name), "PNG")
    print("wrote", name)


render(512, 0.80, "icon-512.png")
render(192, 0.80, "icon-192.png")
render(512, 0.60, "icon-maskable-512.png")   # extra padding for safe zone
render(180, 0.80, "apple-touch-icon.png")
render(32, 0.86, "favicon-32.png")
