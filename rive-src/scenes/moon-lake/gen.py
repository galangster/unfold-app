"""today-moon-lake: John's crescent over a hatched massif and a long still lake (art.svg), with keyframed life.
Life: the water is one field, waves travel along every line and nearer water moves more; moonlight glitters on the
lines under the moon; the moon's glow breathes from the inside out; light drifts over the hatching and runs the ridges.
Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import random
from unfold_rml import *
from life_rml import Life
from field_rml import *

art = Art('art.svg')
sc = Scene("Unfold_moon_lake", seed=11, mask=text_veil() + veil_mask(500, 740), shift=40); life = Life(sc); rnd = random.Random(44)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']

discs = art.discs()
moon_disc = [it for it in art.items if it.kind == 'path' and it.tone < 0.7 and it.bbox()[3] < 262 and it.bbox()[2] - it.bbox()[0] > 60]
crescent = [it for it in art.items if it.kind == 'path' and it.tone == 1.0 and 180 < it.bbox()[1] < 200 and it.bbox()[2] - it.bbox()[0] > 40]
stars = [it for it in art.items if it.opacity < 0.5 and not it.overlay]
water = [it for it in art.items if it.fill.get('kind') == 'grad']
land = [it for it in art.items if it.fill.get('kind') == 'solid' and it.bbox()[1] > 300 and it.bbox()[3] < 425 and not it.overlay and it.opacity == 1]
ridges = [it for it in land if it.bbox()[2] - it.bbox()[0] > 60]
hatch = [it for it in land if it not in ridges]
MX = moon_disc[0].centroid()[0]
MY = moon_disc[0].centroid()[1]
print(f"discs {len(discs)} moon {len(moon_disc)} crescent {len(crescent)} stars {len(stars)} water {len(water)} ridges {len(ridges)} hatch {len(hatch)}")
HORIZON = min(it.bbox()[1] for it in water)

# ---- front: motes over the water, a rare mist, light on the ridges ----
wind_motes(sc, 14, (120, 370, 400, 500), rnd, drift=(60, -8), sizes=(0.5, 0.7, 0.9), peak=(0.22, 0.48))
for k, it in enumerate(sorted(ridges, key=lambda r: -(r.bbox()[2] - r.bbox()[0]))[:3]):
    L, ph, active = [(2400, 2160, 520), (3600, 1500, 620), (1800, 900, 420)][k]
    line_glint(life, f"Ridge{k}", it, ACC, L, ph, active, peak=0.9, halo_w=5, halo_alpha=0.28)

# ---- the lake: every line carries the same travelling wave, scaled by its distance ----
lake_lines(sc, water, rnd, HORIZON, glitter=(MX, 26, 62))

# ---- the massif: ridges exact, with light drifting across the hatching in slopes ----
sc.node("Ridges", ''.join(merged(f"R{k}", [it], ACC, 0.95, weight=0.2) for k, it in enumerate(ridges)), 0, 0)
hatch_light(sc, hatch, ART)

# ---- the moon: drawn lines, then the glow behind ----
ring = moon_disc[0]; arc = crescent[0]
moon = merged("Ring", [ring], ACC, 0.62, origin=(MX, MY), weight=0.1) + merged("Crescent", [arc], ACC, 1.0, origin=(MX, MY), weight=0.22)
sc.node("Moon", moon, MX, MY, sway(Y, MY - 1.2, 2.4, 1200, 0), sway(OPACITY, 0.92, 0.08, 720, 90))
glow_stack(sc, discs, GLOW, period=720, lag=60, breath=0.3, grow=0.06, gain=1.2)

# ---- stars ----
twinkle_field(sc, stars, ART, rnd)

print(sc.write())
