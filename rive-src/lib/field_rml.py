"""John's 2026-10-30 place scenes: SVG reader plus the coherent fields that move them (water, wind, sky light).

The files flatten everything under one layer, draw lines as outlined slivers, and use radial glow stacks,
multi-stop line gradients, overlay star copies and black occluder circles. `Art` reads all of that.
The motion targets come from filming the shipped scenes: 3.5 to 20 pt/s, eased, every element on its own
clock, and frame 0 equal to the designer's composition. Rules: rive-src/DESIGN-REFERENCE.md."""
import math, re, xml.etree.ElementTree as ET
from unfold_rml import *
from life_rml import flap_keys, shimmer
from svg_rml import NS, XL, NUM, Elem, flatten, fmt, flat_paint, mapply, mmul, minv, parse_path, parse_transform, points_path, seg_map

SCALE = 390 / 768
VERTEX_Y, PAINT_OPACITY = 25, 46
INK = 0xED   # the red channel of John's brightest ink, #edc885: every other ink is a tier below it


def tone(color):
    """A hex ink as an opacity tier of the accent. The app paints one accent, so depth lives in opacity."""
    c = color.strip().lstrip('#')
    if len(c) == 3: c = ''.join(ch * 2 for ch in c)
    return min(1.0, int(c[:2], 16) / INK)


class Item(Elem):
    """One element in artboard space, in John's paint order."""
    def __init__(self, kind, opacity, fill):
        super().__init__(kind, opacity, fill)
        self.tone = 1.0; self.stroke = None; self.overlay = False; self.index = 0; self.group = ()
    def base(self):
        """The lowest point of the outline: a plant's root."""
        pts = [p for segs, _ in self.subs for p in flatten(segs, 4)]
        return max(pts, key=lambda p: p[1])


class Art:
    """Flat, ordered, culled reading of an SVG. Artboard = svg * SCALE, top anchored."""
    def __init__(self, file):
        self.root = ET.parse(file).getroot(); self.items = []; self.cls = {}
        style = self.root.find(f'.//{NS}style').text
        for m in re.finditer(r'([^{}]+)\{([^}]*)\}', style):
            for s in [s.strip().lstrip('.') for s in m.group(1).split(',')]:
                self.cls.setdefault(s, {}).update({k: v.strip() for k, v in re.findall(r'([\w-]+):\s*([^;]+)', m.group(2))})
        self.grads = {g.get('id'): g for tag in ('linearGradient', 'radialGradient') for g in self.root.iter(f'{NS}{tag}')}
        self.clips = {c.get('id'): c for c in self.root.iter(f'{NS}clipPath')}
        self._walk(self.root, (SCALE, 0, 0, SCALE, 0, 0), 1.0, False, ())
        for k, it in enumerate(self.items): it.index = k

    def stops(self, g):
        """[(offset, tier, alpha)], following xlink:href to the stops."""
        src = g
        while len(list(src)) == 0 and src.get(f'{XL}href'): src = self.grads[src.get(f'{XL}href').lstrip('#')]
        out = []
        for s in src:
            alpha = float(s.get('stop-opacity')) if s.get('stop-opacity') is not None else 1.0
            out.append((float(s.get('offset') or 0), tone(s.get('stop-color', '#000')), alpha))
        return out

    def paint(self, name, world):
        """A class's fill or stroke value as a paint record, or None for no paint."""
        if name is None or name == 'none': return None
        m = re.match(r'url\(#([^)]+)\)', name)
        if not m: return dict(kind='solid', tier=tone(name))
        g = self.grads[m.group(1)]; stops = self.stops(g); tr = mmul(world, parse_transform(g.get('gradientTransform')))
        def attr(name):
            src = g
            while src.get(name) is None and src.get(f'{XL}href'): src = self.grads[src.get(f'{XL}href').lstrip('#')]
            return float(src.get(name))
        if g.tag.endswith('radialGradient'):
            cx, cy = mapply(tr, attr('cx'), attr('cy'))
            return dict(kind='radial', cx=cx, cy=cy, r=attr('r') * SCALE, stops=stops)
        return dict(kind='grad', p1=mapply(tr, attr('x1'), attr('y1')), p2=mapply(tr, attr('x2'), attr('y2')), stops=stops, inv=minv(tr), world=tr)

    def _walk(self, e, world, op, overlay, group):
        tag = e.tag.replace(NS, '')
        if tag in ('defs', 'style', 'title', 'clipPath'): return
        info = self.cls.get(e.get('class'), {}) if e.get('class') else {}
        op *= float(info.get('opacity', 1)); overlay = overlay or info.get('mix-blend-mode') == 'overlay'
        clip = re.match(r'url\(#([^)]+)\)', info.get('clip-path', ''))
        if clip and self._clip_is_offscreen(clip.group(1)): return
        if tag in ('g', 'svg'):
            w = mmul(world, parse_transform(e.get('transform')))
            for n, ch in enumerate(e): self._walk(ch, w, op, overlay, group + (n,))
            return
        it = self._leaf(e, tag, world, op, info)
        if it is None: return
        it.overlay = overlay; it.group = group
        if self._is_furniture(it): return
        b = it.bbox()
        if b[2] < -1 or b[0] > W + 1 or b[3] < -1 or b[1] > 700: return
        self.items.append(it)

    def _clip_is_offscreen(self, cid):
        """John parked drafts beside the artboard behind a clip. A clip rect wholly off the artboard drops its subtree."""
        for ch in self.clips[cid]:
            if ch.tag.endswith('rect') and float(ch.get('x', 0)) + float(ch.get('width', 0)) <= 0: return True
            if ch.tag.endswith('rect') and float(ch.get('x', 0)) >= 768: return True
        return False

    def _leaf(self, e, tag, world, op, info):
        fill = self.paint(info.get('fill', '#000'), world); stroke = self.paint(info.get('stroke'), world)
        if fill is None and stroke is None: return None
        it = Item('path', op, fill or {'kind': 'solid'})
        if stroke: it.stroke = (stroke, float(info.get('stroke-width', '1').rstrip('px')) * SCALE)
        if tag == 'circle':
            it.kind = 'circle'; it.cx, it.cy = mapply(world, float(e.get('cx')), float(e.get('cy'))); it.r = float(e.get('r')) * SCALE
        elif tag == 'rect':
            x, y, w, h = (float(e.get(k, 0)) for k in ('x', 'y', 'width', 'height'))
            m = mmul(world, parse_transform(e.get('transform')))
            c = [mapply(m, *p) for p in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
            it.subs = [([('L', c[i], c[(i + 1) % 4]) for i in range(4)], True)]
        elif tag in ('polygon', 'polyline'):
            v = [float(t) for t in NUM.findall(e.get('points'))]; pts = [mapply(world, v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
            if pts[0] == pts[-1]: pts.pop()
            n = len(pts); it.subs = [([('L', pts[i], pts[(i + 1) % n]) for i in range(n)], True)]
        elif tag == 'path':
            m = mmul(world, parse_transform(e.get('transform')))
            it.subs = [([seg_map(s, lambda x, y: mapply(m, x, y)) for s in segs], closed) for segs, closed in parse_path(e.get('d'))]
        else: return None
        if it.subs and not any(segs for segs, _ in it.subs): return None
        if fill and fill['kind'] == 'solid': it.tone = fill['tier']
        return it

    def _is_furniture(self, it):
        """The full-bleed background and John's bottom veil. Scene furniture (glow, mask) replaces both."""
        if it.kind == 'circle' or it.fill.get('kind') != 'grad': return False
        b = it.bbox()
        return b[2] - b[0] >= W - 1 and b[3] - b[1] > 200

    def discs(self): return [it for it in self.items if it.kind == 'circle' and it.fill.get('kind') == 'radial']


# ---- paints ----
def stops_paint(prop, p1, p2, stops, opacity, gid=None):
    """Multi-stop line gradient. Alpha can only be fully on or fully off under a bound color, which is all John's fades use."""
    idattr = f' id="{gid}"' if gid else ''
    out = []
    for off, _, a in stops:
        out.append(transparent_stop(f'{off:.3f}') if a < 0.5 else f'<GradientStop colorValue="{GOLD}" position="{off:.3f}">{bind(prop, 38)}</GradientStop>')
    return (f'<LinearGradient startX="{fmt(p1[0])}" startY="{fmt(p1[1])}" endX="{fmt(p2[0])}" endY="{fmt(p2[1])}" opacity="{opacity:.3f}" name="G"{idattr}>{"".join(out)}</LinearGradient>')

def item_tone(it):
    if it.fill.get('kind') == 'grad': return max(s[1] for s in it.fill['stops'])
    return it.tone

def item_paint(it, prop, opacity=None, origin=(0.0, 0.0)):
    op = (it.opacity * item_tone(it)) if opacity is None else opacity
    f = it.fill
    if f.get('kind') == 'grad':
        p1 = (f['p1'][0] - origin[0], f['p1'][1] - origin[1]); p2 = (f['p2'][0] - origin[0], f['p2'][1] - origin[1])
        return stops_paint(prop, p1, p2, f['stops'], op)
    return flat_paint(prop, op)

def paths_of(items, origin=(0.0, 0.0)):
    """Every item's outline as PointsPaths offset by `origin`, for one merged Shape."""
    out = []
    for it in items:
        for segs, closed in it.subs:
            moved = [seg_map(s, lambda x, y: (x - origin[0], y - origin[1])) for s in segs]
            out.append(points_path(moved, closed, 'P'))
    return ''.join(out)

def merged(name, items, prop, opacity=None, x=0.0, y=0.0, weight=0.0, sid=None, origin=None):
    """Same-ink items as one Shape with one paint: one draw call, and the group moves as a piece about (x, y).
    Nested in a Node, leave x and y at 0 and pass the Node's position as `origin`."""
    op = (items[0].opacity * item_tone(items[0])) if opacity is None else opacity
    idattr = f' id="{sid}"' if sid else ''
    paint = flat_paint(prop, op)
    st = f'<Stroke thickness="{weight:.2f}" cap="round" join="round" name="W">{paint}</Stroke>' if weight else ''
    return f'<Shape x="{fmt(x)}" y="{fmt(y)}" name="{name}"{idattr}>{paths_of(items, origin or (x, y))}<Fill fillRule="nonZero" name="F">{paint}</Fill>{st}</Shape>'

def merged_add(sc, name, items, prop, opacity, x, y, *keyed_props):
    return sc.add(lambda i: merged(name, items, prop, opacity, x, y, sid=i), *keyed_props)


# ---- furniture ----
def veil_mask(top=488.0, bottom=688.0):
    """John's veil as the text-protection mask: art fades out from svg y 960 to y 1355, fully hidden below."""
    h = H - top
    return (f'<Shape x="0" y="{top:.0f}" name="BottomMask" id="0:3"><Rectangle width="{W}" height="{h:.0f}" originX="0" originY="0" name="R"/><Fill name="F">'
            f'<LinearGradient startX="{W / 2}" startY="0" endX="{W / 2}" endY="{h:.0f}" name="MG"><GradientStop colorValue="000A0A0A" position="0">{bind(VM["ms"], 38)}</GradientStop>'
            f'<GradientStop colorValue="FF0A0A0A" position="{(bottom - top) / h:.3f}">{bind(VM["me"], 38)}</GradientStop>'
            f'<GradientStop colorValue="FF0A0A0A" position="1">{bind(VM["me"], 38)}</GradientStop></LinearGradient></Fill></Shape>')


VEIL_CLEAR = 150.0   # left of this x the text veil hides the art completely

def text_veil(full_at=280.0):
    """The shipped scenes leave Today's text column empty and live on the right. Art dissolves into the surface toward the left.
    It sits under the bottom glow, so the glow still runs the full width."""
    return (f'<Shape x="0" y="0" name="TextVeil" id="0:21"><Rectangle width="{full_at:.0f}" height="{H}" originX="0" originY="0" name="R"/><Fill name="F">'
            f'<LinearGradient startX="0" startY="0" endX="{full_at:.0f}" endY="0" name="TG"><GradientStop colorValue="FF0A0A0A" position="0">{bind(VM["me"], 38)}</GradientStop>'
            f'<GradientStop colorValue="FF0A0A0A" position="{VEIL_CLEAR / full_at:.3f}">{bind(VM["me"], 38)}</GradientStop>'
            f'<GradientStop colorValue="000A0A0A" position="1">{bind(VM["ms"], 38)}</GradientStop></LinearGradient></Fill></Shape>')


def in_view(items, shift=0):
    """False for art the text veil hides completely. It costs bytes and draw time and nobody sees it."""
    return max(it.bbox()[2] for it in items) + shift >= VEIL_CLEAR

def move_group(sc, name, first, dx, dy):
    """Move every node added since `first` as one piece, keyframes intact."""
    inner = "".join(sc.nodes[first:]); del sc.nodes[first:]
    return sc.node(name, inner, dx, dy)


# ---- light in the sky ----
def glow_disc(sc, it, prop, period, phase, breath, grow, gain=1.0, paper=0.26):
    """One radial layer of a glow stack. Its transparent stop is where John's fade ends, so the disc can stay small.
    Two layers on one clock: a `screen` layer is the light on a dark surface and all but vanishes on paper, and a thin
    normal layer keeps a soft tint there. A normal-only disc reads as a brown stain on the light theme."""
    f = it.fill; last = next((s for s in f['stops'] if s[2] < 0.5), f['stops'][-1])
    r = f['r'] * last[0]
    op = min(1.0, max(s[1] for s in f['stops']) * it.opacity * gain)
    inner = f['stops'][0][0] / last[0] if last[0] else 0
    def markup(i, level=op, mode=''):
        return (f'<Shape x="{fmt(f["cx"])}" y="{fmt(f["cy"])}"{mode} name="Glow" id="{i}"><Ellipse width="{fmt(2 * r)}" height="{fmt(2 * r)}" originX="0.5" originY="0.5" name="E"/><Fill name="F">'
                f'<RadialGradient startX="0" startY="0" endX="{fmt(r)}" endY="0" opacity="{level:.3f}" name="RG"><GradientStop colorValue="{GOLD}" position="{inner:.3f}">{bind(prop, 38)}</GradientStop>{transparent_stop(1)}</RadialGradient></Fill></Shape>')
    keys = (sway(OPACITY, 1 - breath, breath, period, phase), sway(SX, 1.0, grow, period, phase), sway(SY, 1.0, grow, period, phase))
    sc.add(lambda i: markup(i, op * paper), *keys)
    return sc.add(lambda i: markup(i, op, ' blendModeValue="screen"'), *keys)

def glow_stack(sc, discs, prop, period=720, lag=48, breath=0.26, grow=0.05, gain=1.0):
    """The light breathes from the inside out: the core swells first and the swell reaches each outer layer later.
    `discs` runs outermost first, in John's paint order, so the core gets the leading phase. The core peaks at frame 0.
    One muted accent reads dimmer than John's amber tiers, so `gain` lifts the stack to his visual weight."""
    n = len(discs)
    for k, it in enumerate(discs):
        step = n - 1 - k          # 0 for the core
        glow_disc(sc, it, prop, period, (period // 2 - step * lag) % period, breath * (0.75 + 0.25 * (n - k) / n), grow * (1 + step * 0.35), gain)

def twinkle_field(sc, items, prop, rnd, lo=0.06, hi=0.62):
    """Every star on its own irregular clock, between `lo` and `hi`, whatever John drew it at."""
    for k, it in enumerate(items):
        L = rnd.choice([600, 720, 900, 1200]); ph = rnd.randint(0, L)
        sc.add(lambda i, it=it, k=k: merged(f"Star{k}", [it], prop, 1.0, sid=i), shimmer(lo, hi, L, ph, rnd))


# ---- water ----
def centerline(it, ds):
    """A horizontal sliver's centerline at about `ds` pt spacing: the mean of the walls at each column."""
    pts = [p for segs, _ in it.subs for p in flatten(segs, 10)]
    edges = list(zip(pts, pts[1:] + pts[:1]))
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    n = max(3, int(round((x1 - x0) / ds))); out = []; thick = []
    for k in range(n + 1):
        x = x0 + (x1 - x0) * min(max(k / n, 0.002), 0.998)
        ys = [a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) for a, b in edges if (a[0] - x) * (b[0] - x) <= 0 and a[0] != b[0]]
        if ys:
            out.append((x, (min(ys) + max(ys)) / 2)); thick.append(max(ys) - min(ys))
    return out, (sorted(thick)[len(thick) // 2] if thick else 0.5)

def wave_line(sc, it, prop, wavelength, period, amp, opacity, weight=None, travel_right=True, glitter=None, drift=None, rnd=None, name="Wave"):
    """One water line that truly undulates: a wave travels along it through keyed vertices, in John's exact line.
    `glitter` = (center_x, half_width, peak, period, phase) lays a shimmering light on the line under the sky's light.
    `drift` = (dx, dy, period, phase) lets the whole line breathe across and along the plane."""
    line, thick = centerline(it, wavelength / 7)
    w = weight or max(0.45, thick)
    verts = []; keyed_verts = []
    for k, (x, y) in enumerate(line):
        vid = sc.new_id()
        ph = (((-x if travel_right else x) / wavelength) % 1.0) * period
        kp = sway(VERTEX_Y, y - amp / 2, amp, period, int(ph))
        y0 = float(re.search(r'value="([^"]+)" frame="0"', kp).group(1))
        a = line[max(k - 1, 0)]; b = line[min(k + 1, len(line) - 1)]
        rot = math.atan2(b[1] - a[1], b[0] - a[0]); dist = (b[0] - a[0]) / 6
        verts.append(f'<CubicMirroredVertex x="{fmt(x)}" y="{y0:.3f}" rotation="{rot:.4f}" distance="{fmt(dist)}" name="V" id="{vid}"/>')
        keyed_verts.append(f'<KeyedObject objectId="{vid}">{kp}</KeyedObject>')
    sc.keyed.extend(keyed_verts)
    path = f'<PointsPath isClosed="false" isClockwise="true" name="P">{"".join(verts)}</PointsPath>'
    base = item_paint(it, prop, opacity)
    extra = ''
    if glitter:
        cx, half, peak, gl, gp = glitter; gid = sc.new_id()
        kp = shimmer(peak * 0.15, peak, gl, gp, rnd).replace(f'propertyKey="{OPACITY}"', f'propertyKey="{PAINT_OPACITY}"')
        v0 = float(re.search(r'value="([^"]+)" frame="0"', kp).group(1))
        sc.keyed.append(f'<KeyedObject objectId="{gid}">{kp}</KeyedObject>')
        extra = (f'<Stroke thickness="{w * 1.25:.2f}" cap="round" join="round" name="L"><LinearGradient startX="{fmt(cx - half)}" startY="0" endX="{fmt(cx + half)}" endY="0" opacity="{v0:.3f}" name="LG" id="{gid}">'
                 f'{transparent_stop(0)}<GradientStop colorValue="{GOLD}" position="0.5">{bind(VM["accent"], 38)}</GradientStop>{transparent_stop(1)}</LinearGradient></Stroke>')
    keyed = []
    if drift:
        dx, dy, dl, dp = drift
        keyed = [sway(X, -dx / 2, dx, dl, dp), sway(Y, -dy / 2, dy, dl // 2, dp)]
    return sc.add(lambda i: f'<Shape name="{name}" id="{i}">{path}<Stroke thickness="{w:.2f}" cap="round" join="round" name="S">{base}</Stroke>{extra}</Shape>', *keyed)

def plane_mix(y, horizon, near=700.0):
    """0 at the horizon, 1 at the near edge of the water. Perspective: nearer water moves more, and on longer waves."""
    return max(0.0, min(1.0, (y - horizon) / (near - horizon)))


# ---- wind ----
WEATHER = ((0.0, 0.1), (0.055, 0.45), (0.11, -0.12), (0.17, 0.32), (0.215, -0.2), (0.255, 1.0), (0.33, -0.25), (0.39, 0.3), (0.44, -0.1),
           (0.5, 0.62), (0.565, -0.18), (0.62, 0.28), (0.67, -0.12), (0.72, 0.85), (0.79, -0.22), (0.85, 0.35), (0.91, -0.1), (0.96, 0.25), (1.0, 0.1))

def gust_stops(amp, lo=0.0, floor=None):
    """One 60 s stretch of weather. The air never stops: a breeze rocks everything, and it strengthens into gusts now and then.
    Below `floor` a value holds there, so a plant only catches the light while it leans into the wind."""
    return [(at, lo + amp * (s if floor is None else max(s, floor))) for at, s in WEATHER]

def gust_phase(x, y, wavelength=420.0, slant=0.5, L=3600, front=0.1):
    """The same gust reaches each plant in turn, so the whole field ripples as one wave moving right to left."""
    return int(((x + slant * y) / wavelength) * front * L) % L

def bend_keys(amp, x, y, L=3600, **kw):
    return cycle_keys(ROT, L, gust_phase(x, y, L=L, **kw), gust_stops(-amp))

def lift_keys(lo, hi, x, y, L=3600, **kw):
    """The plants catch the light as they bend: opacity rides the same gust."""
    return cycle_keys(OPACITY, L, gust_phase(x, y, L=L, **kw), gust_stops(hi - lo, lo, floor=0.0))

def plant(sc, name, items, prop, opacity, pivot, *keyed_props):
    """Same-ink items that move as one piece about their root."""
    return merged_add(sc, name, items, prop, opacity, pivot[0], pivot[1], *keyed_props)

def plant_inner(sc, name, items, prop, opacity, pivot, node_origin, *keyed_props):
    """`plant`, nested inside a Node at `node_origin`."""
    return sc.register(lambda i: merged(name, items, prop, opacity, pivot[0] - node_origin[0], pivot[1] - node_origin[1], sid=i, origin=pivot), *keyed_props)[1]

def wind_motes(sc, n, region, rnd, drift=(-70, -8), sizes=(0.6, 0.8, 1.0), peak=(0.28, 0.6), cycles=(600, 720, 900)):
    """Pollen carried by the same wind as the plants: it travels with the gust direction on a loose curve, never straight up."""
    x0, x1, y0, y1 = region
    for k in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1); L = rnd.choice(cycles); ph = rnd.randint(0, L); r = rnd.choice(sizes); p = rnd.uniform(*peak)
        wob = rnd.uniform(3, 7); dx, dy = drift
        ys = [(0, y), (0.33, y + dy * 0.33 - wob), (0.66, y + dy * 0.66 + wob), (1, y + dy)]
        sc.add(lambda i, x=x, y=y, r=r, k=k: shape(f"Mote{k}", ellipse(2 * r) + fill(VM["artwork"], 1), x, y, i),
               cycle_keys(X, L, ph, [(0, x), (1, x + dx * rnd.uniform(0.8, 1.2))], ease=False), cycle_keys(Y, L, ph, ys),
               cycle_keys(OPACITY, L, ph, [(0, 0), (0.25, p), (0.72, p), (1, 0)]))

def falling_leaf(sc, name, start, drift, L, phase, prop, size=2.6, peak=0.7, swing=9.0):
    """A leaf let go by the gust: it slides down the same wind on a swinging path, turning as it goes."""
    (x, y), (dx, dy) = start, drift
    s = size
    leaf = (f'<PointsPath isClosed="true" isClockwise="true" name="P">'
            f'<CubicDetachedVertex x="{fmt(-s)}" y="0" inRotation="0" inDistance="0" outRotation="-0.7" outDistance="{fmt(s * 0.7)}"/>'
            f'<CubicDetachedVertex x="{fmt(s)}" y="0" inRotation="{math.pi + 0.7:.3f}" inDistance="{fmt(s * 0.7)}" outRotation="{math.pi - 0.7:.3f}" outDistance="{fmt(s * 0.7)}"/>'
            f'</PointsPath>')
    xs = [(0, x), (0.25, x + dx * 0.25 + swing), (0.5, x + dx * 0.5 - swing), (0.75, x + dx * 0.75 + swing), (1, x + dx)]
    return sc.add(lambda i: f'<Shape x="{fmt(x)}" y="{fmt(y)}" name="{name}" id="{i}">{leaf}<Stroke thickness="0.45" cap="round" join="round" name="S">{flat_paint(prop, 1)}</Stroke></Shape>',
                  cycle_keys(X, L, phase, xs), cycle_keys(Y, L, phase, [(0, y), (1, y + dy)], ease=False),
                  cycle_keys(ROT, L, phase, [(0, 0.2), (0.25, -0.9), (0.5, 0.7), (0.75, -0.8), (1, 0.4)]),
                  cycle_keys(OPACITY, L, phase, [(0, 0), (0.12, peak), (0.8, peak), (1, 0)]))


# ---- single elements ----
def stroke_item(name, it, prop, opacity, origin):
    """John's stroked circle or arc as a true stroke, in a Shape nested at `origin`."""
    if it.kind == 'circle':
        body = f'<Ellipse x="{fmt(it.cx - origin[0])}" y="{fmt(it.cy - origin[1])}" width="{fmt(2 * it.r)}" height="{fmt(2 * it.r)}" originX="0.5" originY="0.5" name="E"/>'
    else: body = paths_of([it], origin)
    return f'<Shape x="0.00" y="0.00" name="{name}">{body}<Stroke thickness="{it.stroke[1]:.2f}" cap="round" join="round" name="S">{flat_paint(prop, opacity)}</Stroke></Shape>'

def occluder_disc(name, it, origin=(0.0, 0.0)):
    """John's black circle behind an outline. It hides what is behind it in the surface color, so it works on either theme."""
    return f'<Shape x="{fmt(it.cx - origin[0])}" y="{fmt(it.cy - origin[1])}" name="{name}"><Ellipse width="{fmt(2 * it.r)}" height="{fmt(2 * it.r)}" originX="0.5" originY="0.5" name="E"/><Fill name="F">{flat_paint(VM["me"], 1)}</Fill></Shape>'

def line_glint(life, name, it, prop, L, phase, active, **kw):
    """Light running along a drawn sliver, on its long side only: the far point splits it into its two walls."""
    segs, _ = it.subs[0]; pts = flatten(segs, 6); cum = [0.0]
    for a, b in zip(pts, pts[1:]): cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    far = max(range(len(pts)), key=lambda i: abs(pts[i][0] - pts[0][0])); end = cum[far] / cum[-1]
    kw.setdefault('width', 0.1); kw.setdefault('thickness', 1.0)
    return life.glint(name, pts, prop, L, phase, active, span=(0.0, end), closed=True, path_markup=points_path(segs, True), **kw)

def clusters(items, gap=14.0):
    """Items whose boxes touch (within `gap`) as one bank. John's clouds are several ribs each."""
    groups = []
    for it in items:
        b = it.bbox(); hit = [g for g in groups if g['b'][0] - gap <= b[2] and b[0] - gap <= g['b'][2] and g['b'][1] - gap <= b[3] and b[1] - gap <= g['b'][3]]
        g = dict(b=list(b), items=[it])
        for h in hit:
            groups.remove(h); g['items'] += h['items']
            g['b'] = [min(g['b'][0], h['b'][0]), min(g['b'][1], h['b'][1]), max(g['b'][2], h['b'][2]), max(g['b'][3], h['b'][3])]
        groups.append(g)
    return [g['items'] for g in groups]

def nearest_point(items, targets):
    """The point of `items`' outlines closest to any point of `targets`: where a leaf meets its vine."""
    tp = [p for t in targets for segs, _ in t.subs for p in flatten(segs, 3)]
    return min((p for it in items for segs, _ in it.subs for p in flatten(segs, 3)), key=lambda p: min((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 for q in tp))

def sum_verts(items): return sum(len(s) for it in items for s, _ in it.subs)


# ---- scene furniture John's places share ----
def lake_lines(sc, lines, rnd, horizon, amp=(0.7, 2.6), opacity=0.9, travel_right=True, glitter=None, drift=True):
    """Every water line carries the same wave, scaled by its distance: nearer water moves more, on longer waves.
    `glitter` = (center_x, near_half_width, far_half_width_gain) lays the sky's light on the lines beneath it."""
    for k, it in enumerate(sorted(lines, key=lambda w: w.bbox()[1])):
        d = plane_mix(it.centroid()[1], horizon)
        period = rnd.choice([1800, 1440]) if d < 0.3 else rnd.choice([1200, 1440]) if d < 0.65 else rnd.choice([900, 1200])
        light = (glitter[0], glitter[1] + glitter[2] * d, 0.95, rnd.choice([360, 450, 600]), rnd.randint(0, 600)) if glitter else None
        breath = (2 + 7 * d, 1.2 + 1.6 * d, rnd.choice([1800, 2400, 3600]), rnd.randint(0, 3600)) if drift else None
        wave_line(sc, it, VM['accent'], 95 + 150 * d, period, amp[0] + amp[1] * d, opacity, travel_right=travel_right, glitter=light, drift=breath, rnd=rnd, name=f"Wave{k}")

def hatch_light(sc, hatch, prop):
    """Light drifting across a ridge's hatching, one slope at a time."""
    cols = [[] for _ in range(5)]
    for it in hatch: cols[min(4, int(it.centroid()[0] / (W / 5)))].append(it)
    for k, (L, ph) in enumerate([(720, 0), (900, 300), (600, 150), (1200, 500), (800, 650)]):
        if cols[k]: merged_add(sc, f"Slope{k}", cols[k], prop, 0.85, 0, 0, sway(OPACITY, 0.62, 0.38, L, ph))

def ridge_lights(life, items, prop, late, peak=0.9):
    """Light runs the two longest ridges, starting a few seconds in. `late` is the second ridge's phase. Flat lines carry none."""
    tall = [it for it in items if it.bbox()[3] - it.bbox()[1] > 6]
    for k, it in enumerate(sorted(tall, key=lambda r: -(r.bbox()[2] - r.bbox()[0]))[:2]):
        line_glint(life, f"Ridge{k}", it, prop, [2400, 3600][k], [2160, late][k], [560, 700][k], peak=peak, halo_w=4, halo_alpha=0.22)

def sky_crossing(x0, x1, cross, gust_turns, gust_amp):
    """X offset for a bank spanning x0..x1 that rides the wind right to left and re-enters unseen. Frame 0 is where John
    drew it. It crosses in `cross` frames, waits off screen for the rest of the loop, and gusts push and slacken it."""
    margin = gust_amp + 6; enter, leave = W - x0 + margin, -x1 - margin; span = leave - enter
    assert gust_amp * 2 * math.pi * gust_turns / DUR < abs(span) / cross, "a gust must never push the bank backwards"
    drawn = -enter / span * cross   # the frame of the crossing at which the bank sits where John drew it
    def at(t):
        u = (t + drawn) % DUR
        return enter + span * min(u, cross) / cross + gust_amp * math.sin(2 * math.pi * gust_turns * t / DUR)
    wrap = math.ceil(DUR - drawn)
    frames = sorted({*range(0, DUR + 1, 240), wrap - 1, wrap, int(cross - drawn)})
    return keyed(X, "".join(kd(at(f), f, False) for f in frames))

def cloud_banks(sc, life, clouds, prop, crossings, light_phases, gap=14.0):
    """Each bank crosses the sky on its own gusts, and light runs its highest rib with it. The other ribs slide a little
    against that rib, so a bank reads as weather and not a sticker. `crossings` holds (cross, gust_turns, gust_amp) per bank,
    or None for a low bank that only leans with the wind and stays clear of what it would cross. `gap` splits the banks."""
    for k, c in enumerate(sorted(clusters(clouds, gap), key=lambda c: min(it.bbox()[1] for it in c))):
        boxes = [it.bbox() for it in c]; x0, x1 = min(b[0] for b in boxes), max(b[2] for b in boxes)
        drift = sky_crossing(x0, x1, *crossings[k]) if crossings[k] else sway(X, -8, 16, 3600, 900)
        bob = sway(Y, -1.5, 3, 2400, 600)
        top = min(c, key=lambda it: it.bbox()[1])
        line_glint(life, f"CloudLight{k}", top, prop, [1800, 2400, 3600][k % 3], light_phases[k % 3], [420, 500, 620][k % 3], peak=0.8, halo_w=4, halo_alpha=0.2, extra=(drift, bob))
        inner = merged(f"Top{k}", [top], prop, 0.9)
        for j, it in enumerate(i for i in c if i is not top):
            L = [1440, 1800, 2400][j % 3]   # L/4 and 3L/4 are the frames at which a sway sits at its middle, so frame 0 stays John's
            inner += plant_inner(sc, f"Rib{k}_{j}", [it], prop, 0.9, (0, 0), (0, 0), sway(X, -3, 6, L, L // 4 if j % 2 else 3 * L // 4))
        sc.node(f"Cloud{k}", inner, 0, 0, drift, bob)

def sun_rings(sc, life, rings, prop):
    """The rings hold still and pulse with the core, and light runs round them now and then."""
    for k, it in enumerate(rings):
        line_glint(life, f"RingLight{k}", it, prop, [1800, 2400][k], [1500, 1300][k], [300, 360][k], peak=0.7, width=0.18, thickness=0.9, halo_w=4, halo_alpha=0.3)
        merged_add(sc, f"Ring{k}", [it], prop, [0.68, 1.0][k], 0, 0, sway(OPACITY, 0.8, 0.2, 720, 60 * (k + 1)))

def flock_in_place(sc, birds, rnd, reach):
    """John's flock where he drew it, each bird on its own beat, the whole drifting `reach` pt and back."""
    cx = sum(it.centroid()[0] for it in birds) / len(birds); cy = sum(it.centroid()[1] for it in birds) / len(birds)
    inner = ''
    for k, it in enumerate(birds):
        L = rnd.choice([360, 450, 600])
        inner += plant_inner(sc, f"B{k}", [it], VM['accent'], 0.95, it.centroid(), (cx, cy), flap_keys(L, rnd.randint(0, L), L, rnd.choice([34, 40, 46]), rnd.randint(0, 40), beats=3, glide=rnd.choice([40, 90])))
    sc.node("Flock", inner, cx, cy, sway(X, cx - reach / 2, reach, 1800, 900), sway(Y, cy - 3, 6, 720, 180))
