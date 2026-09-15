"""Keyframed life for SVG-derived scenes: irregular twinkle, trim glints, streaks, flocks.
Everything tiles over DUR with cycle lengths that divide it, so the 120 s loop stays seamless.
No Luau: the CLI is not signed in and unsigned scripts do not run in production runtimes."""
import math, random
from unfold_rml import *
from svg_rml import fmt, flat_paint, fade_paint, fill_shape, straight_verts
TRIM_OFFSET = 116

def shimmer(lo, hi, L, phase, rnd=random):
    """Irregular twinkle: five random levels per cycle, eased, so no two stars share a waveform."""
    a = [rnd.uniform(lo, hi) for _ in range(5)]
    return cycle_keys(OPACITY, L, phase, [(0, a[0]), (0.18, a[1]), (0.41, a[2]), (0.6, a[3]), (0.82, a[4]), (1, a[0])])

def flap_keys(L, phase, active, flap, ph, beats=4, glide=150):
    """Wing beats (scaleY 1 -> 0.3 -> 1) in bouts of `beats`, then a glide, only while the flock is on screen."""
    pts = []; c = -phase
    while c < DUR:
        f = c + ph
        while f + flap <= c + active:
            for _ in range(beats):
                if f + flap > c + active: break
                for frac, v in ((0, 1.0), (0.5, 0.3), (1, 1.0)):
                    ff = f + frac * flap - (1 if frac == 1 else 0)
                    if 0 <= ff <= DUR: pts.append((int(ff), v))
                f += flap
            f += glide
        c += L
    pts = sorted(set(pts))
    if not pts or pts[0][0] != 0: pts.insert(0, (0, 1.0))
    if pts[-1][0] != DUR: pts.append((DUR, 1.0))
    return keyed(SY, ''.join(kd(v, f) for f, v in pts))

class Life:
    """Scene-level builders for the keyframed life of a scene."""
    def __init__(self, sc): self.sc = sc
    def glint(self, name, pts, prop, L, phase, active, width=0.07, peak=0.85, thickness=0.9, halo_w=5, span=(0.0, 1.0), closed=False, path_markup=None, halo_alpha=0.22):
        """A bright window that travels along `pts` from span[0] to span[1] of the path during `active`
        frames of each cycle, fading at both ends. One keyed TrimPath in a GroupEffect drives the crisp
        stroke and its feathered halo together."""
        gid = self.sc.new_id(); tid = self.sc.new_id(); end = span[1] - (0 if closed else width)
        stops = [(0, span[0]), (active / L, end), (1, end)]
        off0 = cycle_at(L, phase, stops, 0)   # rest pose = frame 0
        eff = f'<GroupEffect name="{name}Fx" id="{gid}"><TrimPath start="0" end="{width}" offset="{off0:.4f}" modeValue="sequential" name="T" id="{tid}"/></GroupEffect>'
        paints = (f'<Stroke thickness="{halo_w}" cap="round" join="round" name="H">{flat_paint(VM["glow"], halo_alpha)}<TargetEffect targetId="{gid}" name="U"/><Feather strength="{halo_w}" name="F"/></Stroke>'
                  f'<Stroke thickness="{thickness}" cap="round" join="round" name="S">{flat_paint(prop, 1)}<TargetEffect targetId="{gid}" name="U"/></Stroke>')
        path = path_markup or f'<PointsPath isClosed="{str(closed).lower()}" isClockwise="true" name="P">{straight_verts(pts)}</PointsPath>'
        sid = self.sc.add(lambda i: f'{eff}<Shape name="{name}" id="{i}">{path}{paints}</Shape>',
                          envelope(L, phase, active, peak))
        self.sc.keyed.append(f'<KeyedObject objectId="{tid}">{cycle_keys(TRIM_OFFSET, L, phase, stops, ease=False)}</KeyedObject>')
        return sid
    def streak(self, name, x0, y0, length, angle, L, phase, active=54, dist=150, peak=0.9):
        """Shooting star: a tail-faded line that slides `dist` px along `angle` (radians, y down) and fades."""
        dx, dy = math.cos(angle), math.sin(angle)
        pts = [(-dx * length, -dy * length), (0.0, 0.0)]
        inner = (f'<Shape name="L"><PointsPath isClosed="false" isClockwise="true" name="P">{straight_verts(pts)}</PointsPath>'
                 f'<Stroke thickness="5" cap="round" join="round" name="H">{fade_paint(VM["glow"], 0.3, pts[0], pts[1], 0, 1)}<Feather strength="5" name="F"/></Stroke>'
                 f'<Stroke thickness="1.0" cap="round" join="round" name="S">{fade_paint(VM["accent"], 1, pts[0], pts[1], 0, 1)}</Stroke></Shape>')
        return self.sc.node(name, inner, x0, y0, travel(X, x0, x0 + dx * dist, L, phase, active), travel(Y, y0, y0 + dy * dist, L, phase, active), envelope(L, phase, active, peak, ramp=0.25))
    def flock(self, name, y, L, phase, active, birds, x_from=430, x_to=-70, peak=0.7, flap=40):
        """A loose V of two-arc birds crossing right to left. Wings flap only while the flock is on screen."""
        inner = ''
        for k, (dx, dy, s, ph) in enumerate(birds):
            path = (f'<PointsPath isClosed="false" isClockwise="true" name="P"><CubicDetachedVertex x="{fmt(-s)}" y="{fmt(s * 0.45)}" inRotation="0" inDistance="0" outRotation="{-0.55:.3f}" outDistance="{fmt(s * 0.55)}"/>'
                    f'<CubicDetachedVertex x="0" y="0" inRotation="{math.pi + 0.3:.3f}" inDistance="{fmt(s * 0.3)}" outRotation="{-0.3:.3f}" outDistance="{fmt(s * 0.3)}"/>'
                    f'<CubicDetachedVertex x="{fmt(s)}" y="{fmt(s * 0.45)}" inRotation="{math.pi + 0.55:.3f}" inDistance="{fmt(s * 0.55)}" outRotation="0" outDistance="0"/></PointsPath>')
            _, bird = self.sc.register(lambda i, dx=dx, dy=dy, path=path, k=k: f'<Shape x="{fmt(dx)}" y="{fmt(dy)}" name="B{k}" id="{i}">{path}<Stroke thickness="0.7" cap="round" join="round" name="S">{flat_paint(VM["accent"], 0.9)}</Stroke></Shape>',
                                       flap_keys(L, phase, active, flap, ph))
            inner += bird
        return self.sc.node(name, inner, x_from, y, travel(X, x_from, x_to, L, phase, active), sway(Y, y, 7, 900, phase), envelope(L, phase, active, peak, ramp=0.12))
    def bokeh(self, els, prop, rnd):
        """Soft discs that float and breathe, each on its own clock."""
        for k, el in enumerate(els):
            L = rnd.choice([900, 1200]); ph = rnd.randint(0, L); amp = rnd.uniform(12, 18) * rnd.choice([-1, 1])
            self.sc.add(lambda i, el=el, k=k: fill_shape(el, prop, f"Bokeh{k}", sid=i),
                        sway(Y, el.cy, amp, L, ph), sway(SX, 0.95, 0.1, L, ph + L // 3), sway(SY, 0.95, 0.1, L, ph + L // 3), sway(OPACITY, 0.7, 0.3, rnd.choice([900, 1200, 1800]), rnd.randint(0, 1800)))
    def stars(self, els, prop, rnd):
        """Every star on its own irregular twinkle."""
        for k, el in enumerate(els):
            L = rnd.choice([600, 720, 900, 1200]); ph = rnd.randint(0, L)
            self.sc.add(lambda i, el=el, k=k: fill_shape(el, prop, f"Star{k}", opacity=1, sid=i), shimmer(0.08, 0.72, L, ph, rnd))
