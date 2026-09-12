"""today-mountains v2: engraved massif (ridges with slope hatching), low sun with turning rays, script mist and birds."""
from unfold_rml import *
sc=Scene("Unfold_mountains",seed=11)
# ridges: list of (x,y) crest points, far -> near
RIDGES=[
 dict(pts=[(120,330),(175,292),(215,312),(262,262),(305,300),(350,278),(400,318),(430,310)],op=0.22,w=0.55,tier='artwork'),
 dict(pts=[(70,372),(120,340),(160,356),(205,318),(245,352),(290,300),(330,342),(372,330),(430,366)],op=0.42,w=0.65,tier='artwork'),
 dict(pts=[(20,420),(80,385),(130,402),(185,350),(225,392),(262,338),(300,380),(345,362),(400,404),(430,398)],op=0.7,w=0.8,tier='artwork'),
 dict(pts=[(-10,462),(60,432),(110,446),(165,392),(210,438),(255,384),(300,430),(350,414),(400,452),(430,448)],op=0.95,w=0.95,tier='accent'),
]
def ridge_line(pts):
    """Faceted ridge: straight segments, peaks barely rounded, valleys softer."""
    v=[]
    for i,(x,y) in enumerate(pts):
        prev=pts[max(0,i-1)]; nxt=pts[min(len(pts)-1,i+1)]
        peak=y<prev[1] and y<nxt[1]; valley=y>prev[1] and y>nxt[1]
        v.append(straight(x,y,3 if peak else (16 if valley else 8)))
    return v
def hatch(pts,op,tier):
    """Engraved facets: the right-facing (shadow) slopes get dense strokes running down the facet;
    the lit left-facing slopes get a few sparse ticks. Strokes start on the segment so they sit on the line."""
    out=''; random.seed(int(op*100))
    for i in range(len(pts)-1):
        (x0,y0),(x1,y1)=pts[i],pts[i+1]; seg=math.hypot(x1-x0,y1-y0)
        shadow=y1>y0            # descending to the right = facing away from the low sun on the right? no: sun is right, so left-facing slopes are lit
        dense=not shadow        # slopes rising to the right face left: shadow side. Hatch those.
        n=max(2,int(seg/(4.2 if dense else 11)))
        ang=math.atan2(y1-y0,x1-x0)
        for k in range(n):
            u=(k+0.6)/(n+0.2); x=x0+(x1-x0)*u; y=y0+(y1-y0)*u
            # stroke direction: down the facet, i.e. along the segment direction tilted toward vertical
            da=math.pi*0.5+(0.28 if dense else -0.2)   # near-vertical, leaning down the facet
            L=random.uniform(12,34)*(1-0.45*u if dense else 0.55)*(0.7+0.6*random.random())
            o=op*(random.uniform(0.35,0.8) if dense else random.uniform(0.15,0.3))
            out+=shape(f"h{i}_{k}",path([straight(x,y+1),straight(x+math.cos(da)*L,y+1+math.sin(da)*L)])+stroke(VM[tier],o,0.45,cap="butt"))
    return out
massif=''
for r in reversed(RIDGES):   # nearest first so it draws on top
    line=path(ridge_line(r['pts']))
    paints=(tapered(VM['accent'],r['op'],r['w'],taper=(0.35,0.7),glow=True) if r['tier']=='accent' else stroke(VM[r['tier']],r['op'],r['w']))
    massif+=hatch(r['pts'],r['op'],r['tier'])+shape("ridge",line+paints)
sc.node("Massif",massif,0,0,sway(Y,0,2,4800,0))
# low sun: disc with hairline rays that turn very slowly, breathing
rays=''
for k in range(16):
    a=k*math.pi*2/16; r0,r1=22,(46 if k%2==0 else 36)
    rays+=shape(f"ray{k}",path([straight(math.cos(a)*r0,math.sin(a)*r0),straight(math.cos(a)*r1,math.sin(a)*r1)])+stroke(VM['artwork'],0.3 if k%2==0 else 0.16,0.5))
sun=shape("disc",ellipse(30)+halo(8)+stroke(VM['accent'],0.85,0.8)+stroke(VM['accent'],0.85,1.8,trim=(0.55,0.85)))
sc.node("Sun",sun+f'<Node name="rays" id="0:61">{rays}</Node>',300,232,sway(Y,232,4,4800,0),twinkle(0.75,1,3600,0))
sc.keyed.append(f'<KeyedObject objectId="0:61">{spin(0,0.5)}</KeyedObject>')
# scripts: birds far back, mist in front of the far ridges but behind the near one
sc.script("birds","birds.luau"); sc.script("mist","mist.luau")
order=["mist","Massif","Sun","birds"]
sc.nodes.sort(key=lambda n:order.index(next(o for o in order if f'name="{o}"' in n)))
print(sc.write())
