"""today-falling-stars: John's crescent with falling stars over the hills and a long lake (art.svg), with keyframed life.
Life: four stars fall slowly on their own clocks, trailing light; small sparks swell and fade; the moon's glow breathes from
the inside out; moonlight shimmers down the column of dashes on the water; waves travel the lines; the clouds cross the sky.
Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import random
from unfold_rml import *
from life_rml import Life, shimmer
from field_rml import *

art = Art('art.svg')
sc = Scene("Unfold_falling_stars", seed=41, mask=text_veil() + veil_mask(520, 742)); life = Life(sc); rnd = random.Random(41)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']

I = art.items
discs = art.discs()
ring = next(it for it in I if it.kind == 'circle' and it.stroke)
arc = next(it for it in I if it.kind == 'path' and it.stroke)
stars = [it for it in I if it.opacity < 0.5 and not it.overlay]
sparks = [it for it in I if abs(item_tone(it) - 0.6) < 0.01]
trails = [it for it in I if it.fill.get('kind') == 'grad' and it.bbox()[3] < 240 and it.bbox()[3] - it.bbox()[1] > 40]
heads = []
for t in trails:
    bx = (t.bbox()[0] + t.bbox()[2]) / 2
    heads.append([it for it in I if it.fill.get('kind') == 'solid' and it.tone == 1.0 and it.opacity == 1 and not it.overlay and not it.stroke and it.bbox()[2] - it.bbox()[0] < 15 and abs(it.centroid()[0] - bx) < 3 and abs(it.centroid()[1] - t.bbox()[3]) < 12])
lake = [it for it in I if it.fill.get('kind') == 'grad' and it not in trails]
lines = [it for it in lake if it.bbox()[2] - it.bbox()[0] > 200]
dashes = [it for it in lake if it not in lines]
hills = [it for it in I if it.index >= 108 and it.index < 112]
clouds = [it for it in I if it.index >= 137]
MX, MY = ring.cx, ring.cy
HORIZON = min(it.bbox()[1] for it in lines)
print(f"discs {len(discs)} stars {len(stars)} sparks {len(sparks)} falling {[len(h) for h in heads]} lines {len(lines)} dashes {len(dashes)} hills {len(hills)} clouds {len(clouds)}")

# ---- the falling stars: frame 0 is John's sky, and each then falls and returns on its own clock ----
# a star fades before it would reach the clouds; it never falls behind them
# the left-hand stars move right of the text column; the last would land on the title, so it stays out
SPEC = [(1200, 105, 90, 165), (1440, 150, 70, 0), (1440, 105, 100, 0), (1200, 68, 120, 276)]
FALL = 18.0   # pt/s
for k, (t, h, (L, reach, before, dx)) in enumerate(zip(trails, heads, SPEC)):
    cx = (t.bbox()[0] + t.bbox()[2]) / 2; cy = t.bbox()[3]
    act = (before + reach) / FALL * 60 / L
    p0 = int(before / (before + reach) * act * L)   # the frame of the cycle at which the star sits where John drew it
    glint = merged("Head", h, ACC, 1.0, origin=(cx, cy))
    tail = f'<Shape name="Trail">{paths_of([t], (cx, cy))}<Fill name="F">{item_paint(t, ACC, 0.95, (cx, cy))}</Fill></Shape>'
    sc.node(f"Fall{k}", glint + tail, cx + dx, cy,
            cycle_keys(Y, L, p0, [(0, cy - before), (act, cy + reach), (1, cy + reach)], ease=False),
            cycle_keys(OPACITY, L, p0, [(0, 0), (act * 0.22, 1.0), (act * 0.72, 1.0), (act, 0), (1, 0)]))

# ---- moonlight down the water, waves along the lines ----
for k, it in enumerate(dashes):
    c = it.centroid(); L = rnd.choice([360, 450, 600, 720]); ph = rnd.randint(0, L)
    sc.add(lambda i, it=it, c=c, k=k: f'<Shape x="{fmt(c[0])}" y="{fmt(c[1])}" name="Dash{k}" id="{i}">{paths_of([it], c)}<Fill name="F">{item_paint(it, ACC, 1.0, c)}</Fill></Shape>',
           shimmer(0.3, 1.0, L, ph, rnd), sway(SX, 1.0, rnd.uniform(0.18, 0.4), rnd.choice([360, 450, 600]), rnd.randint(0, 300)), sway(X, c[0] - 1.5, 3, rnd.choice([720, 900]), rnd.randint(0, 600)))
lake_lines(sc, lines, rnd, HORIZON, amp=(0.8, 2.6), glitter=(MX, 22, 58))

# ---- hills, with light along the long ridge ----
ridge_lights(life, hills, ACC, 2100)
merged_add(sc, "Hills", hills, ACC, 0.95, 0, 0)

# ---- the high clouds cross the sky on their own gusts; the low bank leans, because it would run through the hills ----
cloud_banks(sc, life, clouds, ACC, [(7200, 3, 12), (6000, 2, 14), None], [300, 1000, 2400])

# ---- the moon: drawn lines, then the glow behind ----
moon = stroke_item("Ring", ring, ACC, 0.62, origin=(MX, MY)) + stroke_item("Crescent", arc, ACC, 1.0, origin=(MX, MY))
sc.node("Moon", moon, MX, MY, sway(Y, MY - 1.2, 2.4, 1200, 0), sway(OPACITY, 0.92, 0.08, 720, 90))
glow_stack(sc, discs, GLOW, period=720, lag=60, breath=0.3, grow=0.06, gain=1.2)

# ---- small sparks and stars ----
for k, it in enumerate(sparks):
    c = it.centroid(); L = rnd.choice([600, 720, 900]); ph = rnd.randint(0, L)
    plant(sc, f"Spark{k}", [it], ACC, 1.0, c, shimmer(0.35, 1.0, L, ph, rnd), sway(SX, 0.8, 0.4, L, ph), sway(SY, 0.8, 0.4, L, ph))
twinkle_field(sc, stars, ART, rnd)
print(sc.write())
