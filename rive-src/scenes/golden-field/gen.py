"""today-golden-field: John's field under a low sun (art.svg), with keyframed life.
Life: one wind crosses the whole field, so gusts ripple through it and the plants catch the light as they bend; pollen rides
that wind; the sun swells from the inside out behind the hill; the flock flaps on its own clocks; the clouds cross the sky on the same wind and catch light.
Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import random
from unfold_rml import *
from life_rml import Life
from field_rml import *

art = Art('art.svg')
sc = Scene("Unfold_golden_field", seed=21, mask=text_veil() + veil_mask(500, 730)); life = Life(sc); rnd = random.Random(21)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']

discs = art.discs()
hill_mask = next(it for it in art.items if it.fill.get('kind') == 'grad' and item_tone(it) == 0)
river = [art.items[5]]
banks = [it for it in art.items if abs(item_tone(it) - 0.38) < 0.01]
birds = [it for it in art.items if abs(item_tone(it) - 0.6) < 0.01]
body = [it for it in art.items if it.kind == 'path' and it.tone == 1.0 and it not in river and it is not hill_mask]
sky = [it for it in body if it.bbox()[3] < 200]
horizon = [it for it in body if it.bbox()[3] <= 372 and it.bbox()[2] - it.bbox()[0] > 150 and it not in sky]
field = [it for it in body if it not in sky and it not in horizon]

# one piece per plant John grouped, one piece per grid cell for his loose blades
groups = {}
for it in field: groups.setdefault(it.group[:-1], []).append(it)
plants = [v for v in groups.values() if 3 <= len(v) <= 40]
loose = [it for v in groups.values() if not (3 <= len(v) <= 40) for it in v]
cells = {}
for it in loose:
    x, y = it.base(); row = int((y - 360) / 62); size = 34 + 16 * row
    cells.setdefault((row, int(x // size)), []).append(it)
units = [u for u in plants + list(cells.values()) if in_view(u)]
print(f"discs {len(discs)} clouds {len(sky)} horizon {len(horizon)} plants {len(plants)} cells {len(cells)} units {len(units)} birds {len(birds)} verts {sum_verts(field)}")

# ---- front: pollen in the wind, then the field, nearest plants first ----
wind_motes(sc, 18, (150, 400, 330, 560), rnd, drift=(-90, -14), sizes=(0.5, 0.7, 0.9), peak=(0.3, 0.6))
units.sort(key=lambda u: -max(it.base()[1] for it in u))
for k, u in enumerate(units):
    root = max((it.base() for it in u), key=lambda p: p[1]); cx = sum(it.centroid()[0] for it in u) / len(u); root = (cx, root[1])
    near = plane_mix(root[1], 372, 700); height = root[1] - min(it.bbox()[1] for it in u)
    amp = min(0.11, (2.2 + 4.5 * near) / max(height, 30))
    plant(sc, f"P{k}", u, ACC, 1.0, root, bend_keys(amp, *root), lift_keys(0.74, 1.0, *root))

# ---- the river, its banks, the far hills ----
merged_add(sc, "Banks", banks, ACC, 0.38, 0, 0)
sc.add(lambda i: f'<Shape name="River" id="{i}">{paths_of(river)}<Fill name="F">{item_paint(river[0], ACC, 0.3)}</Fill></Shape>', sway(OPACITY, 0.78, 0.22, 900, 0))
for k, it in enumerate(sorted(horizon, key=lambda r: r.bbox()[1])[:2]):
    line_glint(life, f"Hill{k}", it, ACC, [2400, 3600][k], [2160, 2000][k], [560, 700][k], peak=0.85, halo_w=3, halo_alpha=0.18)
merged_add(sc, "Horizon", horizon, ACC, 0.95, 0, 0)

# ---- the hill hides the sun, the sun sits behind it ----
sc.add(lambda i: f'<Shape name="HillMask" id="{i}">{paths_of([hill_mask])}<Fill name="F">{item_paint(hill_mask, VM["me"], 1.0)}</Fill></Shape>')
glow_stack(sc, discs, GLOW, period=720, lag=60, breath=0.34, grow=0.08, gain=1.1)

# ---- the flock, and the clouds crossing the sky with light along their top ribs ----
flock_in_place(sc, birds, rnd, 52)
cloud_banks(sc, life, sky, ACC, [(7200, 3, 12), (7200, 2, 16), (6000, 4, 8)], [500, 1400, 2600], gap=3.0)

print(sc.write())
