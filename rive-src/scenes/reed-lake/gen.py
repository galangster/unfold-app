"""today-reed-lake: John's cattails in a still lake under two soft lights (art.svg), with keyframed life.
Life: wind moves the three stands as one field, heads nodding about the root; waves travel the water lines; fireflies drift
through the reeds; the two lights breathe out of step; rare rings open flat on the water.
Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import random
from unfold_rml import *
from life_rml import Life
from field_rml import *

art = Art('art.svg')
sc = Scene("Unfold_reed_lake", seed=31, mask=text_veil() + veil_mask(520, 742), shift=30); life = Life(sc); rnd = random.Random(31)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']

discs = art.discs()
stars = [it for it in art.items if it.opacity < 0.5 and not it.overlay]
water = [it for it in art.items if it.fill.get('kind') == 'grad']
stands = {}
for it in art.items:
    if it.kind == 'path' and it.group[-3] == 0 and it.group[-2] in (6, 7, 8): stands.setdefault(it.group[-2], []).append(it)
reed_ids = {id(it) for v in stands.values() for it in v}
land = [it for it in art.items if it.kind == 'path' and id(it) not in reed_ids and it.fill.get('kind') == 'solid' and not it.overlay and it.opacity == 1 and it.bbox()[3] < 395]
ridges = [it for it in land if it.bbox()[2] - it.bbox()[0] > 60]
hatch = [it for it in land if it not in ridges]
HORIZON = min(it.bbox()[1] for it in water)
print(f"discs {len(discs)} stars {len(stars)} water {len(water)} stands {[len(v) for v in stands.values()]} ridges {len(ridges)} hatch {len(hatch)}")

# ---- front: fireflies among the reeds ----
wind_motes(sc, 12, (10, 380, 400, 540), rnd, drift=(-46, -18), sizes=(0.7, 0.9, 1.1), peak=(0.4, 0.8), cycles=(720, 900, 1200))

# ---- the reeds: a head is one piece with the stem it tops, and each stem bends about its own root ----
k = 0
for sid, items in stands.items():
    heads = [it for it in items if sum_verts([it]) <= 10]; stems = [it for it in items if it not in heads]
    mine = {id(s): [] for s in stems}
    for h in heads:
        c = h.centroid()
        mine[id(min(stems, key=lambda s: min((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 for p in flatten(s.subs[0][0], 4))))].append(h)
    for s in sorted(stems, key=lambda s: s.bbox()[1]):
        root = s.base(); height = root[1] - s.bbox()[1]; k += 1
        bend = bend_keys(min(0.05, 11.0 / height), root[0], 500, front=0.14)
        if mine[id(s)]:
            inner = plant_inner(sc, f"Head{k}", mine[id(s)], ACC, 1.0, root, root) + plant_inner(sc, f"Stem{k}", [s], ACC, 0.92, root, root)
            sc.node(f"Reed{k}", inner, root[0], root[1], bend)
        else: plant(sc, f"Blade{k}", [s], ACC, 0.9, root, bend)

# ---- the lake ----
lake_lines(sc, water, rnd, HORIZON, amp=(0.9, 2.8), travel_right=False)

# ---- a ring opening on the water, flat on the plane: a fish, somewhere, now and then ----
for k, (x, y, w, L, ph) in enumerate([(120, 462, 34, 1800, 400), (262, 505, 46, 2400, 1500), (72, 560, 58, 3600, 2600)]):
    h = w * (0.11 + 0.05 * k)
    inner = f'<Shape name="R"><Ellipse width="{w}" height="{h:.1f}" originX="0.5" originY="0.5" name="E"/><Stroke thickness="0.5" cap="round" name="S">{flat_paint(ACC, 1)}</Stroke></Shape>'
    active = 300
    sc.node(f"Ring{k}", inner, x, y, cycle_keys(SX, L, ph, [(0, 0.1), (active / L, 1.0), (1, 1.0)]), cycle_keys(SY, L, ph, [(0, 0.1), (active / L, 1.0), (1, 1.0)]), envelope(L, ph, active, 0.8, ramp=0.25))

# ---- the far hills ----
ridge_lights(life, ridges, ACC, 1800)
sc.node("Ridges", ''.join(merged(f"R{k}", [it], ACC, 0.95, weight=0.2) for k, it in enumerate(ridges)), 0, 0)
hatch_light(sc, hatch, ART)

# ---- stars, then the two lights, out of step ----
twinkle_field(sc, stars, ART, rnd)
glow_disc(sc, discs[0], GLOW, 900, 450, 0.3, 0.06, gain=1.35)
glow_disc(sc, discs[1], GLOW, 1200, 300, 0.3, 0.06, gain=1.35)
print(sc.write())
