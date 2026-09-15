"""today-moon-stars: the designer's moon & constellation art (art.svg) converted exactly, with keyframed life.
Life: irregular star twinkle, pulsing constellation nodes, glints that trace the
constellation lines, a moon that breathes with its halo, rising stardust, two rare shooting stars.
Rules: rive-src/DESIGN-REFERENCE.md. Build: PYTHONPATH=../../lib python3 gen.py && rive . --once"""
import math, random
from unfold_rml import *
from svg_rml import Svg, fill_shape, flat_paint
from life_rml import Life, shimmer

S = 390 / 768                         # fit the 768-wide art to the artboard width, top anchored
svg = Svg('art.svg', S)
sc = Scene("Unfold_moon_stars", seed=5); life = Life(sc); rnd = random.Random(21)
ACC, ART, GLOW = VM['accent'], VM['artwork'], VM['glow']
stars, hatch, lines, crescent, nodes = (svg.layer(L) for L in ('Layer_9', 'Layer_6', 'Layer_8', 'Layer_5', 'Layer_7'))
MX, MY, MR = 613.88 * S, 599.70 * S, 104.68 * S    # the crescent's outer circle (from the SVG path)

# ---- front: shooting stars (rare), stardust, glints ----
life.streak("Shot1", 60, 96, 46, math.radians(21), 7200, 1500, active=48, dist=175, peak=0.85)
life.streak("Shot2", 150, 52, 36, math.radians(31), 3600, 2950, active=42, dist=140, peak=0.7)
sc.motes(24, (190, 375), (210, 620), rise=100, sizes=(1.0, 1.4, 1.9), peak=(0.28, 0.55), cycles=(600, 720, 900))
GLINTS = {0: (3600, 540, 540), 2: (2400, 1260, 480), 3: (3600, 2220, 600), 7: (2400, 60, 360), 8: (1800, 1620, 360),
          12: (3600, 420, 360), 13: (2400, 900, 450), 16: (1800, 780, 360)}   # phases spread so at most two run at once
for k, (L, ph, active) in GLINTS.items():
    pts, loop = lines[k].centerline()
    life.glint(f"Glint{k}", pts, ACC, L, ph, active, width=0.10, peak=0.95, thickness=1.1, halo_w=6, halo_alpha=0.3, closed=loop)

# ---- constellation nodes: gold dots only (no glow disc) ----
for k, el in enumerate(nodes):
    inner = f'<Shape name="D"><Ellipse width="{2 * el.r:.2f}" height="{2 * el.r:.2f}" originX="0.5" originY="0.5" name="E"/><Fill name="F">{flat_paint(ACC, 1)}</Fill></Shape>'
    L = rnd.choice([360, 450, 600, 720]); ph = rnd.randint(0, L)
    sc.node(f"Node{k}", inner, el.cx, el.cy, sway(OPACITY, 0.7, 0.3, L, ph), sway(SX, 0.9, 0.15, L, ph), sway(SY, 0.9, 0.15, L, ph))

# ---- constellation lines: exact geometry, a breath of opacity over the whole web ----
web = ''.join(fill_shape(el, ACC, f"Line{k}", weight=0.28) for k, el in enumerate(lines))
sc.node("Lines", web, 0, 0, sway(OPACITY, 0.86, 0.14, 3600, 1200))

# ---- moon: halo arc behind, the two engraved bands and the stripe hatching, exact ----
halo_arc = (f'<Shape name="Halo"><Ellipse width="{2 * MR:.2f}" height="{2 * MR:.2f}" originX="0.5" originY="0.5" name="E"/>'
            f'{stroke(GLOW, 0.16, 9, trim=(0.04, 0.72), halo=9)}</Shape>')
moon = ''.join(fill_shape(el, ART, f"Hatch{k}", origin=(MX, MY)) for k, el in enumerate(hatch))
moon += ''.join(fill_shape(el, ACC, f"Band{k}", weight=0.3, origin=(MX, MY)) for k, el in enumerate(crescent) if k in (0, 3))
sc.node("Moon", halo_arc + moon, MX, MY, sway(Y, MY, 3, 1200, 0))

# ---- star field (Layer_4 bokeh orbs removed: Nick, 2026-09-15) ----
life.stars(stars, ART, rnd)

print(sc.write())
