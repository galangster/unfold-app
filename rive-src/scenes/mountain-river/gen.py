"""today-mountain-river: the designer's engraved massif and river (art.svg) converted exactly, with keyframed life.
Life: star twinkle, light drifting across the hatched slopes, mist wisps between the
ridges, light flowing down the four river lines, rising valley motes, two rare flocks of birds.
Rules: rive-src/DESIGN-REFERENCE.md. Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import bisect, math, random
from unfold_rml import *
from svg_rml import Svg, fill_shape, flatten, points_path
from life_rml import Life, shimmer

S = 390 / 768
svg = Svg('art.svg', S)
sc = Scene("Unfold_mountain_river", seed=9); life = Life(sc); rnd = random.Random(33)
ACC, ART = VM['accent'], VM['artwork']
stars, hatch, river, ridges = (svg.layer(L) for L in ('Layer_9', 'Layer_11', 'Layer_12', 'Layer_10'))

# ---- front: birds (rare), valley motes, mist ----
life.flock("FlockA", 138, 7200, 2700, 1200, [(0, 0, 4.2, 0), (-12, -5, 3.8, 9), (-24, 4, 3.6, 17), (-37, -3, 3.4, 25)])
life.flock("FlockB", 98, 7200, 6300, 1200, [(0, 0, 3.4, 0), (-11, 4, 3.1, 13), (-22, -4, 3.0, 27)], peak=0.55)
sc.motes(22, (200, 380), (330, 560), rise=90, sizes=(1.0, 1.4, 1.9), peak=(0.25, 0.5), cycles=(600, 720, 900))
def wisp(w, h):
    return path([cubic(-w, 0, -0.16, w * 0.4), cubic(-w * 0.35, -h, 0.05, w * 0.3), cubic(w * 0.3, h * 0.6, -0.08, w * 0.3), cubic(w, -1, 0.12, w * 0.35)])
for k, (x0, y0, w, h, L, ph) in enumerate([(150, 344, 70, 5, 1200, 0), (250, 372, 95, 6, 1800, 700), (190, 404, 60, 4, 900, 300),
                                            (280, 438, 85, 5, 1200, 800), (160, 468, 75, 6, 1800, 1400), (230, 498, 55, 4, 900, 600)]):
    inner = shape("W", wisp(w, h) + tapered(ART, 0.24, 0.55, taper=(0.3, 0.72)))
    sc.node(f"Mist{k}", inner, x0, y0, lifecycle(X, x0, 80, 1, L, ph, ease_move=True), sway(Y, y0, 3, L // 2, ph))

# ---- river: light flows down each line (three windows per line, evenly phased) ----
for k, el in enumerate(river):
    segs, _ = el.subs[0]; pts = flatten(segs, 6)
    cum = [0.0]
    for a, b in zip(pts, pts[1:]): cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    bottom = max(range(len(pts)), key=lambda i: pts[i][1]); f_bottom = cum[bottom] / cum[-1]
    assert pts[len(pts) // 4][1] > pts[0][1] + 20, f"river {k}: first half of the outline should run downhill"
    L = 1200
    outline = points_path(segs, True)
    for j in range(3):
        life.glint(f"Flow{k}_{j}", pts, ACC, L, j * L // 3 + k * 100, L, width=0.08, peak=1.0, thickness=1.5, halo_w=6, halo_alpha=0.35, span=(0.0, f_bottom), closed=True, path_markup=outline)
# light also runs along three ridge lines, rarely, so the massif is not a still engraving
for k, (L, ph, active) in {2: (2400, 0, 420), 15: (3600, 900, 480), 18: (1800, 1500, 360)}.items():
    pts, _ = ridges[k].centerline()
    life.glint(f"RidgeGlint{k}", pts, ACC, L, ph, active, width=0.12, peak=0.9, thickness=1.1, halo_w=6, halo_alpha=0.3)

# ---- the massif: ridge outlines exact (near ones emboldened a touch), the river lines, then the hatching ----
sc.node("Ridges", ''.join(fill_shape(el, ACC, f"Ridge{k}", weight=0.3) for k, el in enumerate(ridges)), 0, 0)
sc.node("River", ''.join(fill_shape(el, ACC, f"River{k}", weight=0.2) for k, el in enumerate(river)), 0, 0, opacity=0.55)   # a dimmer tier so the flow windows read
groups = [[], [], [], []]
for el in hatch:
    groups[bisect.bisect((200, 300, 420), el.centroid()[1])].append(el)
for g, (L, ph) in enumerate([(600, 0), (900, 300), (720, 150), (1200, 600)]):
    sc.node(f"Slope{g}", ''.join(fill_shape(el, ART, f"H{g}_{k}") for k, el in enumerate(groups[g])), 0, 0, sway(OPACITY, 0.7, 0.3, L, ph))

# ---- star field (Layer_4 orbs and Moonlight disc removed: Nick, 2026-09-15) ----
life.stars(stars, ART, rnd)

print(sc.write())
