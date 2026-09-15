"""today-moon v2: engraved crescent (hatched, clipped), tapered rim, script-driven wisps, stars, shooting stars, stardust."""
from unfold_rml import *
sc=Scene("Unfold_moon",seed=3); MX,MY,R=262,222,64
# --- crescent geometry: outer circle minus an offset inner circle, sampled into a smooth closed path ---
IX,IY,IR=-0.36*R,-0.08*R,0.93*R
def crescent_vertices(n=16):
    """Outer circle (0,0,R) minus inner circle (IX,IY,IR): the two arcs between their intersection points."""
    d=math.hypot(IX,IY); a=(R*R-IR*IR+d*d)/(2*d); h=math.sqrt(R*R-a*a)
    px,py=a*IX/d,a*IY/d; rx,ry=-IY/d*h,IX/d*h
    p1=(px+rx,py+ry); p2=(px-rx,py-ry)              # intersections
    t1,t2=math.atan2(p1[1],p1[0]),math.atan2(p2[1],p2[0])
    # outer arc: the one passing through angle 0 (the lit limb on the right)
    if t1>t2: t1,t2=t2,t1
    if not (t1<0<t2): t1,t2=t2,t1+2*math.pi
    v=[]
    for k in range(n+1):
        t=t1+(t2-t1)*k/n; v.append(cubic(R*math.cos(t),R*math.sin(t),t+math.pi/2,(t2-t1)*R/(n*3)))
    # inner arc from p2 back to p1, the side facing the limb (through angle 0 as seen from the inner centre)
    e=(R*math.cos(t2),R*math.sin(t2)); s0=(R*math.cos(t1),R*math.sin(t1))
    u2=math.atan2(e[1]-IY,e[0]-IX); u1=math.atan2(s0[1]-IY,s0[0]-IX)
    # two candidate arcs from u2 to u1; keep the one whose midpoint lies inside the outer circle
    cands=[]
    for end in (u1,u1+2*math.pi,u1-2*math.pi):
        m=(u2+end)/2; mx,my=IX+IR*math.cos(m),IY+IR*math.sin(m)
        if mx*mx+my*my<R*R: cands.append(end)
    end=min(cands,key=lambda x:abs(x-u2))
    sign=1 if end>u2 else -1
    for k in range(1,n):
        u=u2+(end-u2)*k/n; v.append(cubic(IX+IR*math.cos(u),IY+IR*math.sin(u),u+sign*math.pi/2,abs(end-u2)*IR/(n*3)))
    return v
CRESCENT=crescent_vertices()
clip_id="0:60"
crescent_clip=f'<Shape name="CrescentClip" id="{clip_id}"><PointsPath isClosed="true" isClockwise="true" name="P">{"".join(CRESCENT)}</PointsPath></Shape>'
# --- hatching: fine parallel lines at -32 degrees, clipped to the crescent, brighter toward the limb ---
ang=math.radians(-32); dx,dy=math.cos(ang),math.sin(ang); nx,ny=-dy,dx
hatch=''
for k in range(-30,31):
    off=k*3.4; cx,cy=nx*off,ny*off
    # brightness rises toward the outer limb (positive x side)
    limb=max(0.0,min(1.0,(off*nx+R*0.4)/(R*1.1)))
    op=0.10+0.42*limb
    line=path([straight(cx-dx*R*1.3,cy-dy*R*1.3),straight(cx+dx*R*1.3,cy+dy*R*1.3)])
    hatch+=f'<Shape name="H{k}"><ClippingShape sourceId="{clip_id}" name="C"/>{line}{stroke(VM["artwork"],op,0.55,cap="butt")}</Shape>'
# second, sparser cross-hatch near the limb for depth
for k in range(-14,15):
    off=k*5.2; cx,cy=ny*off*-1,nx*off; a2=ang+math.radians(58); ex,ey=math.cos(a2),math.sin(a2)
    limb=max(0.0,min(1.0,(cx/R+0.55)/1.1)); op=0.05+0.22*limb
    line=path([straight(cx-ex*R*1.3,cy-ey*R*1.3),straight(cx+ex*R*1.3,cy+ey*R*1.3)])
    hatch+=f'<Shape name="X{k}"><ClippingShape sourceId="{clip_id}" name="C"/>{line}{stroke(VM["artwork"],op,0.5,cap="butt")}</Shape>'
# craters: small engraved arcs inside the lit crescent
for k,(cx,cy,cr,op) in enumerate([(0.62*R,-0.18*R,0.16*R,0.5),(0.52*R,0.3*R,0.11*R,0.4),(0.72*R,0.12*R,0.07*R,0.35)]):
    hatch+=f'<Shape x="{cx:.1f}" y="{cy:.1f}" name="Cr{k}"><ClippingShape sourceId="{clip_id}" name="C"/>{ellipse(2*cr,2*cr*0.8)}{stroke(VM["artwork"],op,0.55,trim=(0.1,0.75))}{stroke(VM["artwork"],op*0.5,0.5,trim=(0.8,1.0))}</Shape>'
# --- rim: the outer limb as one tapered line with halo ---
rim=shape("Rim",ellipse(2*R)+halo(9)+stroke(VM['accent'],0.95,0.9,trim=(0.86,1.0))+stroke(VM['accent'],0.95,0.9,trim=(0.0,0.22))
          +stroke(VM['accent'],0.95,1.9,trim=(0.93,1.0))+stroke(VM['accent'],0.95,1.9,trim=(0.0,0.14))+stroke(VM['accent'],0.95,2.7,trim=(0.98,1.0))+stroke(VM['accent'],0.95,2.7,trim=(0.0,0.06)))
# inner terminator: faint line where shadow meets light
term=shape("Term",f'<Node x="{IX:.1f}" y="{IY:.1f}" name="n">{shape("i",ellipse(2*IR)+stroke(VM["artwork"],0.45,0.6,trim=(0.86,1.0))+stroke(VM["artwork"],0.45,0.6,trim=(0.0,0.2)))}</Node>')
moon=crescent_clip+hatch+term+rim
sc.node("Moon",moon,MX,MY,sway(Y,MY,5,4800,0),sway(ROT,0,0.02,3600,600))
# a thin haze arc under the moon (atmosphere), breathing
glowdisc=(f'<Shape name="Hz"><Ellipse width="{R*3.2:.0f}" height="{R*3.2:.0f}" originX="0.5" originY="0.5" name="E"/><Fill name="F">'
          f'<RadialGradient startX="0" startY="0" endX="{R*1.6:.0f}" endY="0" opacity="0.28" name="RG"><GradientStop colorValue="{GOLD}" position="0">{bind(VM["glow"],38)}</GradientStop>'
          f'<GradientStop colorValue="00C8A55C" position="1"/></RadialGradient></Fill></Shape>')
sc.node("Haze",glowdisc,MX,MY,sway(SX,1,0.05,3600,0),sway(SY,1,0.05,3600,0),twinkle(0.7,1,2400,0))
# scripts: sky behind the moon, wisps in front
sc.nodes.insert(0,'')  # placeholder keeps order explicit: earlier siblings draw on top
sc.script("wisps","clouds.luau")
sc.nodes.append(sc.nodes.pop(sc.nodes.index('')))  # no-op cleanup
sc.script("sky","sky.luau")
# draw order: first declared on top -> wisps (front), Haze, Moon, sky (back). Reorder nodes accordingly.
order=["wisps","Haze","Moon","sky"]
sc.nodes=[n for n in sc.nodes if n]; sc.nodes.sort(key=lambda n:[o for o in order if f'name="{o}"' in n][0] if any(f'name="{o}"' in n for o in order) else "zz")
sc.nodes.sort(key=lambda n:order.index(next(o for o in order if f'name="{o}"' in n)))
print(sc.write())
