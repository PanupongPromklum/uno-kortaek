"""สร้างท่าชั่วคราว + ไอคอน + หลังไพ่ จากภาพต้นฉบับใน art_src/<id>.png
รัน: python3 tools/gen_poses.py   (ต้องมี Pillow, numpy)
ภาพที่วาดจริงทีหลัง ให้วางทับใน public/characters/<id>/ โดยตรง ไม่ต้องรันสคริปต์นี้อีก
"""
import os, math, random, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageOps, ImageEnhance

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'art_src')
OUT = os.path.join(ROOT, 'public', 'characters')
CH = {  # id: (main color, light color, accent)
  'applecat': ('#E8736F', '#FBD9D3', '#6B4A3A'),
  'apple':    ('#EF8A80', '#FFE3D6', '#9CC48E'),
  'bird':     ('#F2D27A', '#FFF6DF', '#8FC9E8'),
  'choux':    ('#D6A45E', '#FFF0CF', '#8FCBE6'),
  'dog':      ('#EED36A', '#FFF7C9', '#F29A8E'),
  'pizza':    ('#F2C35E', '#FFF1C2', '#D9534A'),
}
random.seed(7)
S = 1024

def hexrgb(h, a=255): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (a,)

def grain(img, amount=0.35):
    """crayon-ish grain on alpha of decorative strokes"""
    a = np.array(img.split()[-1]).astype(np.float32)
    n = np.random.default_rng(1).random(a.shape).astype(np.float32)
    a = a * (1 - amount + amount * n)
    img.putalpha(Image.fromarray(a.clip(0, 255).astype(np.uint8)))
    return img

def sticker(src, fit=0.78, border=22):
    im = Image.open(src).convert('RGBA')
    im = im.crop(im.getbbox())
    sc = fit * S / max(im.size)
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2 + 10))
    a = canvas.split()[-1].point(lambda v: 255 if v > 40 else 0)
    big = a.filter(ImageFilter.MaxFilter(border * 2 + 1)).filter(ImageFilter.GaussianBlur(2)).point(lambda v: 255 if v > 110 else 0)
    edge = big.filter(ImageFilter.MaxFilter(5))
    shadow = Image.new('RGBA', (S, S), (60, 40, 50, 0)); shadow.putalpha(big.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .28)))
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.alpha_composite(shadow, (6, 12))
    rim = Image.new('RGBA', (S, S), hexrgb('#E6DCCF')); rim.putalpha(edge); out.alpha_composite(rim)
    white = Image.new('RGBA', (S, S), (255, 255, 255, 255)); white.putalpha(big); out.alpha_composite(white)
    out.alpha_composite(canvas)
    return out

def star(d, cx, cy, r, fill):
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.32
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill)

def layer(): return Image.new('RGBA', (S, S), (0, 0, 0, 0))

def pose_shout(base, col):
    deco = layer(); d = ImageDraw.Draw(deco)
    for i in range(7):  # action marks
        a = math.radians(-160 + i * 24 + random.uniform(-5, 5))
        r0, r1 = 400, 470 + random.randint(0, 40)
        d.line([(512 + r0 * math.cos(a), 512 + r0 * math.sin(a)), (512 + r1 * math.cos(a), 512 + r1 * math.sin(a))], fill=hexrgb(col), width=18)
    star(d, 830, 230, 70, hexrgb('#FFD84A'))
    d.text((150, 150), '!', fill=hexrgb('#E25A6A'))
    deco = grain(deco)
    b = base.rotate(8, resample=Image.BICUBIC, center=(512, 560))
    out = layer(); out.alpha_composite(deco); out.alpha_composite(b)
    # big "!" marks
    d2 = ImageDraw.Draw(out)
    for x, y, h in [(160, 170, 110), (220, 120, 80)]:
        d2.rounded_rectangle([x, y, x + 26, y + h], 13, fill=hexrgb('#E25A6A'))
        d2.ellipse([x, y + h + 14, x + 26, y + h + 40], fill=hexrgb('#E25A6A'))
    return out

def pose_win(base, col):
    deco = layer(); d = ImageDraw.Draw(deco)
    for (x, y, r, c) in [(170, 200, 70, '#FFD84A'), (860, 170, 85, '#FFD84A'), (900, 520, 45, '#A1E6EF'), (120, 560, 50, '#E87D9D'), (780, 880, 40, '#DFF671'), (240, 850, 36, '#A1E6EF')]:
        star(d, x, y, r, hexrgb(c))
    for _ in range(26):
        x, y = random.randint(60, 960), random.randint(40, 980)
        if (x - 512) ** 2 + (y - 520) ** 2 < 330 ** 2: continue
        c = random.choice(['#E87D9D', '#A1E6EF', '#F5E87A', '#DFF671'])
        d.rounded_rectangle([x, y, x + 22, y + 12], 5, fill=hexrgb(c))
    deco = grain(deco, .25)
    b = base.resize((int(S * 1.04), int(S * 1.04)), Image.LANCZOS).rotate(-6, resample=Image.BICUBIC)
    out = layer(); out.alpha_composite(deco); out.alpha_composite(b, (-20, -40))
    return out

def pose_sad(base, col):
    a = base.split()[-1]
    rgb = ImageEnhance.Color(base.convert('RGB')).enhance(0.55)
    rgb = Image.blend(rgb, Image.new('RGB', (S, S), (150, 170, 210)), 0.18)
    b = rgb.convert('RGBA'); b.putalpha(a)
    b = b.resize((S, int(S * 0.94)), Image.LANCZOS)
    out = layer(); out.alpha_composite(b, (0, int(S * 0.06)))
    deco = layer(); d = ImageDraw.Draw(deco)
    # rain cloud
    for cx, cy, r in [(430, 120, 70), (520, 95, 90), (620, 125, 65), (480, 150, 60), (580, 152, 60)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hexrgb('#B9BFD3'))
    for x in (440, 520, 600):
        d.ellipse([x - 12, 230, x + 12, 270], fill=hexrgb('#8FC9F0'))
        d.polygon([(x - 12, 245), (x + 12, 245), (x, 215)], fill=hexrgb('#8FC9F0'))
    for (x, y) in [(300, 420), (740, 400)]:  # sweat / tears
        d.ellipse([x - 16, y, x + 16, y + 44], fill=hexrgb('#8FC9F0'))
        d.polygon([(x - 16, y + 18), (x + 16, y + 18), (x, y - 20)], fill=hexrgb('#8FC9F0'))
    deco = grain(deco, .3)
    out.alpha_composite(deco)
    return out

def circle_icon(base, light, size=128):
    im = base.crop((112, 112, 912, 912)).resize((size - 12, size - 12), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(out)
    d.ellipse([2, 2, size - 3, size - 3], fill=(255, 255, 255, 255), outline=hexrgb('#2E2433'), width=4)
    d.ellipse([8, 8, size - 9, size - 9], fill=hexrgb(light))
    out.alpha_composite(im, (6, 6))
    return out

def paper_pattern(w, h, col, light, kind):
    im = Image.new('RGBA', (w, h), hexrgb(light)); d = ImageDraw.Draw(im)
    c = hexrgb(col, 70)
    if kind == 0:
        for x in range(0, w, 36): d.line([(x, 0), (x, h)], fill=c, width=3)
        for y in range(0, h, 36): d.line([(0, y), (w, y)], fill=c, width=3)
    elif kind == 1:
        for y in range(0, h, 40):
            for x in range((y // 40) % 2 * 20, w, 40): d.ellipse([x, y, x + 12, y + 12], fill=c)
    else:
        for x in range(-h, w, 44): d.line([(x, 0), (x + h, h)], fill=c, width=10)
    return grain(im, .12)

def card_back(base, col, light, i):
    W_, H_ = 300, 450
    out = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); d = ImageDraw.Draw(out)
    d.rounded_rectangle([0, 0, W_ - 1, H_ - 1], 30, fill=hexrgb('#2E2433'))
    inner = paper_pattern(W_ - 36, H_ - 36, col, light, i % 3)
    m = Image.new('L', inner.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, inner.width - 1, inner.height - 1], 20, fill=255)
    out.paste(inner, (18, 18), m)
    ch = base.resize((230, 230), Image.LANCZOS)
    out.alpha_composite(ch, (35, 110))
    # corner tabs like the front
    for (x, y) in [(18, 18), (W_ - 18 - 62, H_ - 18 - 62)]:
        d.rounded_rectangle([x, y, x + 62, y + 62], 14, fill=hexrgb('#2E2433'))
        star(d, x + 31, y + 31, 22, hexrgb('#F5E87A'))
    return out

def main():
    for i, (cid, (col, light, acc)) in enumerate(CH.items()):
        d = os.path.join(OUT, cid); os.makedirs(os.path.join(d, 'voice'), exist_ok=True)
        base = sticker(os.path.join(SRC, cid + '.png'))
        base.save(os.path.join(d, 'idle.png'))
        pose_shout(base, col).save(os.path.join(d, 'shout.png'))
        pose_win(base, col).save(os.path.join(d, 'win.png'))
        pose_sad(base, col).save(os.path.join(d, 'sad.png'))
        base.resize((512, 512), Image.LANCZOS).save(os.path.join(d, 'card_art.png'))
        circle_icon(base, light).save(os.path.join(d, 'emblem.png'))
        card_back(base, col, light, i).save(os.path.join(d, 'card_back.png'))
        paper_pattern(800, 800, col, light, i % 3).save(os.path.join(d, 'bg.png'))
        print('ok', cid)

if __name__ == '__main__':
    main()
