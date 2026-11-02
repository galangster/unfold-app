"""today-vineyard: John's vine aisle running to the château under a ringed sun (art.svg), with keyframed life.
Life: the grape clusters sway from their stems and the leaves flutter about their attach points, on one gust; a small flock
works across the sky; pollen drifts down the aisle; the sun swells from the inside out and light runs the rings and the wires.
Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import random
from unfold_rml import *
from life_rml import Life
from field_rml import *

art = Art('art.svg')
sc = Scene("Unfold_vineyard", seed=61, mask=text_veil() + veil_mask(500, 700), shift=40); life = Life(sc); rnd = random.Random(61)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']

N = {}
for it in art.items: N.setdefault(it.group[4], []).append(it)
def runs(*spans): return [it for a, b in spans for n in range(a, b + 1) for it in N.get(n, [])]
horizon = runs((0, 3)); birds = runs((4, 6)); discs = art.discs(); rings = N[8]
stars = [it for it in N[9] if it.opacity < 0.5 and not it.overlay]
posts = runs((10, 47)); land = runs((48, 51))
vines = runs((69, 72), (78, 78), (86, 92)); chateau = runs((95, 104))
faded = [it for it in runs((93, 94)) if it.group[5] == 0]   # his clipped rects repeat the outline's own fill
leaf_groups = [N[n] for n in range(52, 61)] + [runs((61, 64)), runs((65, 68)), runs((73, 77)), runs((79, 82))]
GRAPES = [(83, (58.0, 310.0)), (84, (38.0, 330.0)), (85, (331.0, 313.0))]
print(f"horizon {len(horizon)} birds {len(birds)} discs {len(discs)} rings {len(rings)} stars {len(stars)} posts {len(posts)} land {len(land)} vines {len(vines)} leaves {len(leaf_groups)}")

# ---- front: pollen down the aisle ----
wind_motes(sc, 14, (120, 330, 350, 490), rnd, drift=(-50, -12), sizes=(0.5, 0.7, 0.9), peak=(0.28, 0.6))

# ---- the clusters hang from their stems: every grape covers the ones John drew before it ----
for n, pivot in GRAPES:
    if not in_view(N[n], sc.shift): continue
    pairs = {}
    for it in N[n]: pairs.setdefault(it.group[5], []).append(it)
    inner = ''
    for g in sorted(pairs, reverse=True):
        disc = next(it for it in pairs[g] if it.kind == 'circle'); line = next(it for it in pairs[g] if it.kind == 'path')
        inner += merged(f"G{g}", [line], ACC, 1.0, origin=pivot) + occluder_disc(f"D{g}", disc, pivot)
    sc.node(f"Cluster{n}", inner, pivot[0], pivot[1], bend_keys(0.032, pivot[0], pivot[1], wavelength=300))

# ---- the leaves flutter where they meet the vine ----
for k, g in enumerate(g for g in leaf_groups if in_view(g, sc.shift)):
    pivot = nearest_point(g, vines); w = max(it.bbox()[2] - it.bbox()[0] for it in g)
    plant(sc, f"Leaf{k}", g, ACC, 1.0, pivot, bend_keys(min(0.09, 2.2 / max(w, 10)), pivot[0], pivot[1], wavelength=300))
for k, it in enumerate(faded):
    sc.add(lambda i, it=it, k=k: f'<Shape name="Faded{k}" id="{i}">{paths_of([it])}<Fill fillRule="nonZero" name="F">{item_paint(it, ACC, 1.0)}</Fill></Shape>')
merged_add(sc, "Vines", vines, ACC, 1.0, 0, 0)

# ---- the château, the wires running to it, the rows ----
merged_add(sc, "Chateau", chateau, ACC, 0.95, 0, 0)
for k, it in enumerate(land):
    line_glint(life, f"Wire{k}", it, ACC, [1800, 2400, 3600, 2400][k], [1560, 1500, 2300, 600][k], [420, 480, 560, 520][k], peak=0.85, halo_w=4, halo_alpha=0.22)
merged_add(sc, "Land", land, ACC, 1.0, 0, 0)
for k, it in enumerate(it for it in posts if in_view([it], sc.shift)):
    sc.add(lambda i, it=it, k=k: f'<Shape name="Post{k}" id="{i}">{paths_of([it])}<Fill name="F">{item_paint(it, ACC, 0.95)}</Fill></Shape>')
merged_add(sc, "Horizon", horizon, ACC, 0.38, 0, 0)

# ---- the sun: rings hold still, the light swells inside them. Raised and moved right so it clears the title ----
sun_first = len(sc.nodes)
sun_rings(sc, life, rings, ACC)
glow_stack(sc, discs, GLOW, period=720, lag=60, breath=0.32, grow=0.07, gain=1.05)
move_group(sc, "Sun", sun_first, 23, -90)

# ---- a small flock ----
flock_in_place(sc, birds, rnd, 44)

twinkle_field(sc, stars, ART, rnd)
print(sc.write())
