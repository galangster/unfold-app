"""SVG (Illustrator outlined-stroke art) -> RML geometry for Unfold Today scenes.

The designer's files draw every line as a thin filled sliver (an outlined stroke) and
the fades as userSpaceOnUse linear gradients. This module reads that geometry, maps it
onto the 390x844 artboard, and emits Shapes that use the ViewModel color contract from
unfold_rml (paint opacity lives on a flat gradient; a fade's transparent end is bound to the
surface colour so no accent leaks baked gold). Rules: rive-src/DESIGN-REFERENCE.md.
"""
import math, re, xml.etree.ElementTree as ET
from unfold_rml import GOLD, bind, transparent_stop

NS = '{http://www.w3.org/2000/svg}'
XL = '{http://www.w3.org/1999/xlink}'
NUM = re.compile(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


# ---- affine helpers: (a,b,c,d,e,f) as in SVG matrix(), applied x' = a x + c y + e ----
def mmul(m, n):
    a, b, c, d, e, f = m; g, h, i, j, k, l = n
    return (a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f)
def mapply(m, x, y):
    a, b, c, d, e, f = m; return (a * x + c * y + e, b * x + d * y + f)
def minv(m):
    a, b, c, d, e, f = m; det = a * d - b * c
    return (d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det)
def parse_transform(s):
    m = (1, 0, 0, 1, 0, 0)
    if not s: return m
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', s):
        v = [float(x) for x in NUM.findall(args)]
        if name == 'translate': t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == 'scale': t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == 'rotate':
            r = math.radians(v[0]); cs, sn = math.cos(r), math.sin(r); t = (cs, sn, -sn, cs, 0, 0)
            if len(v) == 3: t = mmul(mmul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        elif name == 'matrix': t = tuple(v)
        else: raise ValueError(name)
        m = mmul(m, t)
    return m


# ---- path data -> subpaths of segments ('L',p0,p1) | ('C',p0,c1,c2,p1) ----
def parse_path(d):
    toks = re.findall(r'[MmLlHhVvCcSsQqTtZzAa]|' + NUM.pattern, d)
    i = 0; cmd = None; cur = (0.0, 0.0); start = cur; last_c2 = None; subs = []; segs = []; closed = False
    def num():
        nonlocal i; v = float(toks[i]); i += 1; return v
    def flush():
        nonlocal segs, closed
        if segs: subs.append((segs, closed))
        segs = []; closed = False
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]): cmd = toks[i]; i += 1
        rel = cmd.islower(); c = cmd.upper()
        if c == 'M':
            flush(); x, y = num(), num()
            cur = (cur[0] + x, cur[1] + y) if rel else (x, y); start = cur; cmd = 'l' if rel else 'L'; last_c2 = None
        elif c == 'Z':
            if segs and segs[-1][-1] != start: segs.append(('L', cur, start))
            closed = True; cur = start; flush(); last_c2 = None
        elif c == 'L':
            x, y = num(), num(); p = (cur[0] + x, cur[1] + y) if rel else (x, y); segs.append(('L', cur, p)); cur = p; last_c2 = None
        elif c == 'H':
            x = num(); p = (cur[0] + x if rel else x, cur[1]); segs.append(('L', cur, p)); cur = p; last_c2 = None
        elif c == 'V':
            y = num(); p = (cur[0], cur[1] + y if rel else y); segs.append(('L', cur, p)); cur = p; last_c2 = None
        elif c in 'CS':
            if c == 'C':
                x1, y1, x2, y2, x, y = (num() for _ in range(6))
                c1 = (cur[0] + x1, cur[1] + y1) if rel else (x1, y1)
            else:
                x2, y2, x, y = (num() for _ in range(4))
                c1 = (2 * cur[0] - last_c2[0], 2 * cur[1] - last_c2[1]) if last_c2 else cur
            c2 = (cur[0] + x2, cur[1] + y2) if rel else (x2, y2); p = (cur[0] + x, cur[1] + y) if rel else (x, y)
            segs.append(('C', cur, c1, c2, p)); cur = p; last_c2 = c2
        elif c in 'QT':
            if c == 'Q':
                qx, qy, x, y = (num() for _ in range(4)); q = (cur[0] + qx, cur[1] + qy) if rel else (qx, qy)
            else:
                x, y = num(), num(); q = (2 * cur[0] - last_c2[0], 2 * cur[1] - last_c2[1]) if last_c2 else cur
            p = (cur[0] + x, cur[1] + y) if rel else (x, y)
            c1 = (cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])); c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
            segs.append(('C', cur, c1, c2, p)); cur = p; last_c2 = q
        else: raise ValueError(f'unsupported path command {cmd}')
    flush()
    return subs


def seg_map(seg, fn):
    return (seg[0],) + tuple(fn(*p) for p in seg[1:])
def flatten(segs, n=8):
    pts = []
    for s in segs:
        if s[0] == 'L': pts.append(s[1])
        else:
            p0, c1, c2, p1 = s[1:]
            for k in range(n):
                t = k / n; u = 1 - t
                pts.append((u**3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * p1[0],
                            u**3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * p1[1]))
    if segs: pts.append(segs[-1][-1])
    return pts
def signed_area(pts):
    return 0.5 * sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))


class Elem:
    """One drawable SVG element in artboard space. kind: circle | poly | path. opacity: effective."""
    def __init__(self, kind, opacity, fill):
        self.kind, self.opacity, self.fill = kind, opacity, fill
        self.subs = []      # for poly/path: [(segs, closed)] in artboard space
        self.cx = self.cy = self.r = None
        self.center = None  # for thin rects: the two mid-points of the short sides
    def bbox(self):
        if self.kind == 'circle': return (self.cx - self.r, self.cy - self.r, self.cx + self.r, self.cy + self.r)
        pts = [p for segs, _ in self.subs for p in flatten(segs)]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; return (min(xs), min(ys), max(xs), max(ys))
    def centroid(self):
        b = self.bbox(); return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    def alpha_at(self, x, y):
        """Fill alpha (0..1) at an artboard point, from the SVG gradient if any."""
        if not self.fill or self.fill.get('kind') != 'grad': return 1.0
        g = self.fill; px, py = mapply(g['inv'], x, y)
        gx, gy = g['p1']; hx, hy = g['p2']; dx, dy = hx - gx, hy - gy; L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0.0, min(1.0, ((px - gx) * dx + (py - gy) * dy) / L))
        stops = g['stops']
        for (o0, a0), (o1, a1) in zip(stops, stops[1:]):
            if o0 <= t <= o1: return a0 if o1 == o0 else a0 + (a1 - a0) * (t - o0) / (o1 - o0)
        return stops[0][1] if t < stops[0][0] else stops[-1][1]
    def centerline(self, tol=2.6):
        """Centerline of a sliver as an ordered point list (artboard space).
        Thin rects report their axis. Polyline slivers cluster the outline corners and read the
        first pass through them; a closed loop sliver returns its outer contour."""
        if self.center: return list(self.center), False
        segs, closed = self.subs[0]
        pts = [s[1] for s in segs]
        clusters = []
        for p in pts:
            for c in clusters:
                if math.hypot(c[0][0] - p[0], c[0][1] - p[1]) <= tol: c.append(p); break
            else: clusters.append([p])
        order = []; seen = set()
        for p in pts:
            ci = next(i for i, c in enumerate(clusters) if p in c)
            if ci in seen:
                if len(order) >= 2 and ci == order[-2]: break     # the return trip started
                continue
            seen.add(ci); order.append(ci)
        line = [(sum(p[0] for p in clusters[i]) / len(clusters[i]), sum(p[1] for p in clusters[i]) / len(clusters[i])) for i in order]
        loop = len(self.subs) > 1 and len(order) == len(clusters)
        return line, loop


class Svg:
    """Loads an SVG and maps it onto the artboard: artboard = svg * scale + (ox, oy)."""
    def __init__(self, file, scale, ox=0.0, oy=0.0):
        self.root = ET.parse(file).getroot(); self.scale, self.ox, self.oy = scale, ox, oy
        self.world = (scale, 0, 0, scale, ox, oy)
        self.cls = {}
        style = self.root.find(f'.//{NS}style')
        for m in re.finditer(r'([^{}]+)\{([^}]*)\}', style.text if style is not None else ''):
            body = m.group(2)
            for s in [s.strip().lstrip('.') for s in m.group(1).split(',')]:
                d = self.cls.setdefault(s, {})
                for k, rx in (('opacity', r'opacity:\s*([\d.]+)'), ('fill', r'fill:\s*([^;]+)'), ('clip', r'clip-path:\s*url\(#([^)]+)\)')):
                    mm = re.search(rx, body)
                    if mm: d[k] = mm.group(1).strip()
        self.grads = {g.get('id'): g for g in self.root.iter(f'{NS}linearGradient')}
        self.clips = {c.get('id'): c for c in self.root.iter(f'{NS}clipPath')}
    def gradient(self, gid):
        g = self.grads[gid]; stops = g
        href = g.get(f'{XL}href')
        while href and len(list(stops)) == 0:
            stops = self.grads[href.lstrip('#')]; href = stops.get(f'{XL}href')
        st = [(float(s.get('offset') or 0), float(s.get('stop-opacity') if s.get('stop-opacity') is not None else 1)) for s in stops]
        tr = parse_transform(g.get('gradientTransform'))
        world = mmul(self.world, tr)          # svg gradient space -> artboard
        return dict(kind='grad', p1=(float(g.get('x1')), float(g.get('y1'))), p2=(float(g.get('x2')), float(g.get('y2'))),
                    inv=minv(world), world=world, stops=st)
    def _fill(self, cls):
        f = (self.cls.get(cls, {}) if cls else {}).get('fill', '#a1803e')
        m = re.match(r'url\(#([^)]+)\)', f)
        return self.gradient(m.group(1)) if m else {'kind': 'solid'}
    def layer(self, layer_id):
        out = []; self._clips_done = set()
        self._walk(self.root.find(f"{NS}g[@id='{layer_id}']"), 1.0, None, out)
        return out
    def _walk(self, e, op, clip, out):
        tag = e.tag.replace(NS, ''); cls = e.get('class'); info = self.cls.get(cls, {}) if cls else {}
        op = op * float(info.get('opacity', 1)); clip = info.get('clip', clip)
        if tag == 'g':
            saved, self.world = self.world, mmul(self.world, parse_transform(e.get('transform')))
            try:
                for ch in e: self._walk(ch, op, clip, out)
            finally:
                self.world = saved
            return
        if clip:   # the designer's river: a fill rect clipped to a winding shape. Emit the clip shape once.
            if clip in self._clips_done: return
            self._clips_done.add(clip)
            for ch in self.clips[clip]:
                if ch.tag.replace(NS, '') == 'path':
                    el = Elem('path', op, self._fill(cls)); el.subs = self._path_subs(ch.get('d'), ch.get('transform')); out.append(el)
            return
        if tag == 'circle':
            el = Elem('circle', op, self._fill(cls))
            el.cx, el.cy = mapply(self.world, float(e.get('cx')), float(e.get('cy'))); el.r = float(e.get('r')) * self.scale; out.append(el)
        elif tag == 'rect':
            x, y, w, h = (float(e.get(k, 0)) for k in ('x', 'y', 'width', 'height'))
            m = mmul(self.world, parse_transform(e.get('transform')))
            corners = [mapply(m, *p) for p in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
            el = Elem('poly', op, self._fill(cls)); el.subs = [([('L', corners[i], corners[(i + 1) % 4]) for i in range(4)], True)]
            if min(w, h) <= 1.5:
                el.center = ([mapply(m, x + w / 2, y), mapply(m, x + w / 2, y + h)] if h > w else [mapply(m, x, y + h / 2), mapply(m, x + w, y + h / 2)])
            out.append(el)
        elif tag in ('polygon', 'polyline'):
            v = [float(t) for t in NUM.findall(e.get('points'))]; pts = [mapply(self.world, v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
            if tag == 'polygon' and pts[0] == pts[-1]: pts.pop()
            closed = tag == 'polygon'; n = len(pts)
            el = Elem('poly', op, self._fill(cls)); el.subs = [([('L', pts[i], pts[(i + 1) % n]) for i in range(n if closed else n - 1)], closed)]; out.append(el)
        elif tag == 'path':
            el = Elem('path', op, self._fill(cls)); el.subs = self._path_subs(e.get('d'), e.get('transform')); out.append(el)
    def _path_subs(self, d, transform=None):
        m = mmul(self.world, parse_transform(transform))
        return [([seg_map(s, lambda x, y: mapply(m, x, y)) for s in segs], closed) for segs, closed in parse_path(d)]


# ---- RML emitters ----
def fmt(v): return f'{v:.2f}'
def points_path(segs, closed, name='P'):
    """Segments -> PointsPath. Cubic handles become detached vertices; straight corners stay straight."""
    n = len(segs); verts = []
    for i, s in enumerate(segs):
        prev = segs[i - 1] if (i > 0 or closed) else None
        p = s[1]
        inh = prev[3] if (prev and prev[0] == 'C') else None
        outh = s[2] if s[0] == 'C' else None
        if inh is None and outh is None: verts.append(f'<StraightVertex x="{fmt(p[0])}" y="{fmt(p[1])}"/>')
        else:
            ir, idist = (math.atan2(inh[1] - p[1], inh[0] - p[0]), math.hypot(inh[0] - p[0], inh[1] - p[1])) if inh else (0.0, 0.0)
            orr, odist = (math.atan2(outh[1] - p[1], outh[0] - p[0]), math.hypot(outh[0] - p[0], outh[1] - p[1])) if outh else (0.0, 0.0)
            verts.append(f'<CubicDetachedVertex x="{fmt(p[0])}" y="{fmt(p[1])}" inRotation="{ir:.4f}" inDistance="{fmt(idist)}" outRotation="{orr:.4f}" outDistance="{fmt(odist)}"/>')
    if not closed:   # the final point of an open path
        last = segs[-1]; p = last[-1]
        if last[0] == 'C':
            inh = last[3]; verts.append(f'<CubicDetachedVertex x="{fmt(p[0])}" y="{fmt(p[1])}" inRotation="{math.atan2(inh[1] - p[1], inh[0] - p[0]):.4f}" inDistance="{fmt(math.hypot(inh[0] - p[0], inh[1] - p[1]))}" outRotation="0" outDistance="0"/>')
        else: verts.append(f'<StraightVertex x="{fmt(p[0])}" y="{fmt(p[1])}"/>')
    cw = signed_area(flatten(segs)) > 0
    return f'<PointsPath isClosed="{str(closed).lower()}" isClockwise="{str(cw).lower()}" name="{name}">{"".join(verts)}</PointsPath>'

def flat_paint(prop, opacity):
    return (f'<LinearGradient startX="0" startY="0" endX="1" endY="0" opacity="{opacity:.3f}" name="G">'
            f'<GradientStop colorValue="{GOLD}" position="0">{bind(prop, 38)}</GradientStop>'
            f'<GradientStop colorValue="{GOLD}" position="1">{bind(prop, 38)}</GradientStop></LinearGradient>')
def fade_paint(prop, opacity, p1, p2, a1, a2):
    """Gradient along p1->p2 (artboard/local coords) with alphas a1, a2. A fully transparent end is the
    surface-bound transparent stop. Rive cannot bind alpha separately, so a partially
    transparent end is exact only for a linear ramp: the transparent stop is pushed past the visible
    end until the visible end reads at its alpha, and the gradient opacity carries the brighter end."""
    def stop(pos, a):
        if a <= 0.001: return transparent_stop(pos)
        return f'<GradientStop colorValue="{GOLD}" position="{pos}">{bind(prop, 38)}</GradientStop>'
    lo, hi = min(a1, a2), max(a1, a2)
    if lo > 0.001 and hi - lo < 0.05: return flat_paint(prop, opacity * (lo + hi) / 2)
    if lo > 0.001:   # partial fade: shift the transparent stop outward so the visible end reads at `lo`
        t = lo / hi if hi > 0 else 0
        if a1 < a2: p1 = (p1[0] - (p2[0] - p1[0]) * t / (1 - t), p1[1] - (p2[1] - p1[1]) * t / (1 - t)); a1 = 0
        else: p2 = (p2[0] + (p2[0] - p1[0]) * t / (1 - t), p2[1] + (p2[1] - p1[1]) * t / (1 - t)); a2 = 0
    return (f'<LinearGradient startX="{fmt(p1[0])}" startY="{fmt(p1[1])}" endX="{fmt(p2[0])}" endY="{fmt(p2[1])}" opacity="{opacity * hi:.3f}" name="G">'
            f'{stop(0, a1)}{stop(1, a2)}</LinearGradient>')

def elem_paint(el, prop, opacity, axis=None, origin=(0.0, 0.0)):
    """Fill paint for an element: flat, or a fade sampled (in artboard space) at the ends of `axis`
    (default: the SVG gradient's own axis). `origin` is the Shape's position, so the gradient lands in local space."""
    if not el.fill or el.fill.get('kind') != 'grad': return flat_paint(prop, opacity)
    if axis is None:
        g = el.fill; p1 = mapply(g['world'], *g['p1']); p2 = mapply(g['world'], *g['p2']); axis = (p1, p2)
    a1, a2 = el.alpha_at(*axis[0]), el.alpha_at(*axis[1])
    loc = tuple((x - origin[0], y - origin[1]) for x, y in axis)
    return fade_paint(prop, opacity, loc[0], loc[1], a1, a2)

def fill_shape(el, prop, name, opacity=None, weight=0.0, sid=None, rule='nonZero', origin=(0.0, 0.0)):
    """The element's geometry filled exactly; `weight` adds a same-paint stroke that emboldens a sliver.
    `origin` is the parent Node's position: the Shape is offset so artboard coordinates stay put."""
    op = el.opacity if opacity is None else opacity
    idattr = f' id="{sid}"' if sid else ''
    ox, oy = origin
    if el.kind == 'circle':
        return (f'<Shape x="{fmt(el.cx - ox)}" y="{fmt(el.cy - oy)}" name="{name}"{idattr}><Ellipse width="{fmt(2 * el.r)}" height="{fmt(2 * el.r)}" originX="0.5" originY="0.5" name="E"/>'
                f'<Fill name="F">{elem_paint(el, prop, op, axis=((el.cx, el.cy - el.r), (el.cx, el.cy + el.r)), origin=(el.cx, el.cy))}</Fill></Shape>')
    paths = ''.join(points_path(segs, closed, f'P{i}') for i, (segs, closed) in enumerate(el.subs))
    paint = elem_paint(el, prop, op)
    stroke = f'<Stroke thickness="{weight:.2f}" cap="round" join="round" name="W">{paint}</Stroke>' if weight else ''
    return f'<Shape x="{fmt(-ox)}" y="{fmt(-oy)}" name="{name}"{idattr}>{paths}<Fill fillRule="{rule}" name="F">{paint}</Fill>{stroke}</Shape>'

def straight_verts(pts):
    """StraightVertex markup for a polyline, two decimals like the rest of the converted geometry."""
    return ''.join(f'<StraightVertex x="{fmt(x)}" y="{fmt(y)}"/>' for x, y in pts)

def radial_disc(prop, name, r, opacity, inner=0.0, x=0.0, y=0.0, sid=None):
    """Soft filled glow: bound color at the centre, transparent rim. Feather in a Fill renders nothing, so this is the halo."""
    idattr = f' id="{sid}"' if sid else ''
    return (f'<Shape x="{fmt(x)}" y="{fmt(y)}" name="{name}"{idattr}><Ellipse width="{fmt(2 * r)}" height="{fmt(2 * r)}" originX="0.5" originY="0.5" name="E"/><Fill name="F">'
            f'<RadialGradient startX="0" startY="0" endX="{fmt(r)}" endY="0" opacity="{opacity:.3f}" name="RG">'
            f'<GradientStop colorValue="{GOLD}" position="{inner:.2f}">{bind(prop, 38)}</GradientStop>'
            f'{transparent_stop(1)}</RadialGradient></Fill></Shape>')
