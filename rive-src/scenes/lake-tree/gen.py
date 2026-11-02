"""today-lake-tree: John's lone tree on the lake under a ringed sun (art.svg), with keyframed life.
Life: the tree sways about its root, the crown moves clump by clump as the same gust passes, the bark holds still against them;
a leaf lets go now and then; waves travel the water lines; the sun swells from the inside out; light runs along the rings.
Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import random
from unfold_rml import *
from life_rml import Life
from field_rml import *

art = Art('art.svg')
sc = Scene("Unfold_lake_tree", seed=51, mask=text_veil() + veil_mask(520, 742), shift=60); life = Life(sc); rnd = random.Random(51)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']

I = art.items
tree = [it for it in I if it.group[2] == 0]
bark = [it for it in tree if it.group[2:4] == (0, 0)]
limbs = [it for it in tree if it.group[2:4] == (0, 1)]
leaves = [it for it in tree if len(it.group) == 4]
discs = art.discs()
rings = [it for it in I if it.group[2:5] == (2, 0, 1)]
stars = [it for it in I if it.opacity < 0.5 and not it.overlay]
place = [it for it in I if it.group[2:5] == (2, 0, 3)]
hills = [it for it in place if it.fill.get('kind') == 'solid' and it.bbox()[3] < 420]
water = [it for it in place if it not in hills]
RX, RY = 287.0, 631.0
print(f"bark {len(bark)} limbs {len(limbs)} leaves {len(leaves)} discs {len(discs)} rings {len(rings)} stars {len(stars)} hills {len(hills)} water {len(water)}")

# ---- leaves let go on the same wind ----
for k, (x, y, dx, dy, L, ph) in enumerate([(330, 400, -120, 200, 1200, 200), (210, 410, -110, 190, 1800, 900), (360, 470, -130, 160, 1440, 500), (170, 450, -90, 170, 2400, 1700), (280, 380, -140, 230, 3600, 2800)]):
    falling_leaf(sc, f"Fall{k}", (x, y), (dx, dy), L, ph, ACC, size=rnd.uniform(2.2, 3.0))
wind_motes(sc, 8, (60, 400, 340, 560), rnd, drift=(-60, 10), sizes=(0.5, 0.7, 0.9), peak=(0.25, 0.55))

# ---- the tree: one Node about the root; clumps move on their own, limbs and bark with the trunk ----
inner = ''
for k, it in enumerate(sorted(leaves, key=lambda l: l.index)):
    c = it.centroid(); w = it.bbox()[2] - it.bbox()[0]
    amp = min(0.045, 0.7 / max(w, 8))
    inner += plant_inner(sc, f"Leaf{k}", [it], ACC, 1.0, c, (RX, RY), bend_keys(amp * 2.2, c[0], c[1], front=0.1, wavelength=300), lift_keys(0.74, 1.0, c[0], c[1], front=0.1, wavelength=300))
inner += merged("Limbs", limbs, ACC, 1.0, origin=(RX, RY)) + merged("Bark", bark, ACC, 0.68, origin=(RX, RY))
sc.node("Tree", inner, RX, RY, cycle_keys(ROT, 3600, gust_phase(RX, 500, L=3600, wavelength=300), gust_stops(0.0085)))

# ---- the lake ----
HORIZON = min(it.bbox()[1] for it in water)
lake_lines(sc, [it for it in water if it.bbox()[2] - it.bbox()[0] >= 12], rnd, HORIZON, amp=(0.6, 2.4), opacity=0.85, travel_right=False, drift=False)

# ---- hills, sun, stars ----
ridge_lights(life, hills, ACC, 1900, peak=0.7)
merged_add(sc, "Hills", hills, ACC, 0.9, 0, 0)
sun_rings(sc, life, rings, ACC)
glow_stack(sc, discs, GLOW, period=720, lag=60, breath=0.32, grow=0.07, gain=1.05)
twinkle_field(sc, stars, ART, rnd)
print(sc.write())
