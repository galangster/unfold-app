"""today-clouds: generates scene.rml. Rules: rive-src/DESIGN-REFERENCE.md."""
import random
random.seed(7)
W,H,DUR=390,844,7200   # 120 s at 60 fps
VM={'artwork':'0:42','glow':'0:43','bg':'0:44','ms':'0:45','me':'0:46','accent':'0:47'}
GOLD='FFC8A55C'
def bind(prop,key=37): return f'<DataBindContext sourcePathIds="0:40-{prop}" propertyKey="{key}"/>'
def paint_color(prop,opacity):
    # alpha on a bound color is overwritten by the bind, so opacity lives on a flat gradient
    return (f'<LinearGradient startX="0" startY="0" endX="1" endY="0" opacity="{opacity}" name="G">'
            f'<GradientStop colorValue="{GOLD}" position="0">{bind(prop,38)}</GradientStop>'
            f'<GradientStop colorValue="{GOLD}" position="1">{bind(prop,38)}</GradientStop></LinearGradient>')
# A cloud is one open calligraphic line over the tops of four lobes, trailing off at both ends.
# Weight varies along the line by stacking the same path: hairline full length, heavier strokes
# trimmed to the middle, round caps so the steps read as a taper.
LOBES=[(-52,11),(-20,21),(16,19),(48,9)]
def cloud_line(s,jx=0,jy=0):
    v=[f'<CubicMirroredVertex x="{(-82)*s+jx:.1f}" y="{3*s+jy:.1f}" rotation="-0.18" distance="{14*s:.1f}"/>']
    for i,(cx,r) in enumerate(LOBES):
        v.append(f'<CubicMirroredVertex x="{cx*s+jx:.1f}" y="{-r*s+jy:.1f}" rotation="0" distance="{r*s*0.9:.1f}"/>')
        if i<len(LOBES)-1:
            nx,nr=LOBES[i+1]; v.append(f'<CubicMirroredVertex x="{(cx+r+nx-nr)/2*s+jx:.1f}" y="{-min(r,nr)*s*0.55+jy:.1f}" rotation="0" distance="{7*s:.1f}"/>')
    v.append(f'<CubicMirroredVertex x="{80*s+jx:.1f}" y="{2*s+jy:.1f}" rotation="0.15" distance="{14*s:.1f}"/>')
    return "".join(v)
def stroke(prop,opacity,thick,trim=None,halo=0):
    fx=f'<TrimPath start="{trim[0]}" end="{trim[1]}" name="T"/>' if trim else ''
    fe=f'<Feather strength="{halo}" name="F"/>' if halo else ''
    return f'<Stroke thickness="{thick}" cap="round" join="round" name="S">{paint_color(prop,opacity)}{fx}{fe}</Stroke>'
def contour(name,s,prop,opacity,weight,jx=0,jy=0,halo=0,taper=(0.3,0.72)):
    """weight: hairline thickness; the taper band gets 1.9x and its core 2.8x."""
    t0,t1=taper; mid=((t0+t1)/2); core=((mid-(t1-t0)*0.18),(mid+(t1-t0)*0.18))
    paints=(stroke(VM['glow'],0.14,weight*6,halo=weight*6) if halo else '')
    paints+=stroke(prop,opacity,weight)+stroke(prop,opacity,weight*1.9,trim=(t0,t1))+stroke(prop,opacity,weight*2.8,trim=core)
    return f'<Shape name="{name}"><PointsPath isClosed="false" name="P">{cloud_line(s,jx,jy)}</PointsPath>{paints}</Shape>'
nodes=[];keyed=[];nid=100
def key_x(kf): return f'<KeyedProperty propertyKey="13">{kf}</KeyedProperty>'
def kd(v,f,ease=True):
    return (f'<KeyFrameDouble value="{v:.2f}" frame="{f}" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble>' if ease
            else f'<KeyFrameDouble value="{v:.2f}" frame="{f}" interpolationType="linear"/>')
def sway(v0,amp,period,phase):
    """v0 -> v0+amp -> v0 over `period` frames, repeated to DUR, shifted by `phase` frames, eased."""
    pts=[];f=-phase
    while f<DUR:
        for frac,val in ((0,0),(0.5,amp),(1,0)):
            ff=f+frac*period
            if 0<=ff<=DUR: pts.append((int(ff),v0+val))
        f+=period
    if not pts or pts[0][0]!=0: pts.insert(0,(0,v0+amp*(0.5-abs(((phase/period)%1)-0.5))*2))
    if pts[-1][0]!=DUR: pts.append((DUR,v0))
    return "".join(kd(v,f) for f,v in pts)
def lifecycle(prop_key,base,delta,peak,L,phase):
    """Repeating spawn/drift/fade cycle: a keyed transform property plus opacity 0 -> peak -> 0."""
    moves=[];fades=[];f=-phase
    while f<DUR:
        for frac,o in ((0,0),(0.3,peak),(0.7,peak),(1,0)):
            ff=f+frac*L
            if 0<=ff<=DUR: moves.append(kd(base+frac*delta,int(ff),False)); fades.append(kd(o,int(ff)))
        f+=L
    return f'<KeyedProperty propertyKey="{prop_key}">{"".join(moves)}</KeyedProperty><KeyedProperty propertyKey="18">{"".join(fades)}</KeyedProperty>'
# ---- cloud bank: hero, mid, far (opacity tiers) ----
CLOUDS=[  # name, x, y, scale, tier opacity, halo, drift amp, drift period, phase
 ("Hero",250,230,1.5,0.95,1,22,3600,0),
 ("Mid",165,318,0.95,0.48,0,-16,3000,900),
 ("Far",300,135,0.62,0.22,0,10,4200,1500),
]
for name,x,y,s,op,halo,amp,per,ph in CLOUDS:
    inner=contour(name+"A",s,VM['accent'],op,0.9,halo=halo,taper=(0.28,0.7))
    inner+=contour(name+"B",s*0.92,VM['artwork'],op*0.35,0.6,jx=6*s,jy=9*s,taper=(0.45,0.85))
    nodes.append(f'<Node x="{x}" y="{y}" name="Cloud{name}" id="0:{nid}">{inner}</Node>')
    keyed.append(f'<KeyedObject objectId="0:{nid}">{key_x(sway(x,amp,per,ph))}<KeyedProperty propertyKey="14">{sway(y,-5,per*0.8,ph+400)}</KeyedProperty></KeyedObject>')
    nid+=1
# ---- wisps: open hairline arcs that drift and fade ----
for i in range(4):
    x=random.uniform(140,330); y=random.uniform(170,420); L=random.choice([1800,2400,3600]); ph=random.randint(0,L)
    w=random.uniform(40,90)
    path=(f'<PointsPath isClosed="false" name="P"><CubicMirroredVertex x="{-w:.0f}" y="6" rotation="-0.2" distance="{w*0.5:.0f}"/>'
          f'<CubicMirroredVertex x="0" y="-4" rotation="0.15" distance="{w*0.45:.0f}"/><CubicMirroredVertex x="{w:.0f}" y="3" rotation="-0.1" distance="{w*0.4:.0f}"/></PointsPath>')
    nodes.append(f'<Node x="{x:.0f}" y="{y:.0f}" name="Wisp{i}" id="0:{nid}"><Shape name="W">{path}<Stroke thickness="0.8" cap="round" name="S">{paint_color(VM["artwork"],0.35)}</Stroke></Shape></Node>')
    keyed.append(f'<KeyedObject objectId="0:{nid}">{lifecycle(13,x,70,1,L,ph)}</KeyedObject>')
    nid+=1
# ---- motes: rising dust with a fade lifecycle ----
for i in range(28):
    x=random.uniform(110,370); y=random.uniform(150,560); L=random.choice([600,720,800,900,1200,1440]); ph=random.randint(0,L)
    r=random.choice([1.2,1.6,2.2]); peak=random.uniform(0.35,0.7)
    nodes.append(f'<Shape x="{x:.0f}" y="{y:.0f}" name="Mote{i}" id="0:{nid}"><Ellipse width="{2*r}" height="{2*r}" originX="0.5" originY="0.5" name="E"/><Fill name="F">{paint_color(VM["artwork"],1)}</Fill></Shape>')
    keyed.append(f'<KeyedObject objectId="0:{nid}">{lifecycle(14,y,-90,peak,L,ph)}</KeyedObject>')
    nid+=1
mask=(f'<Shape x="0" y="{H*0.55:.0f}" name="BottomMask" id="0:3"><Rectangle width="{W}" height="{H*0.45:.0f}" originX="0" originY="0" name="R"/><Fill name="F">'
      f'<LinearGradient startX="{W/2}" startY="0" endX="{W/2}" endY="{H*0.45:.0f}" name="MG"><GradientStop colorValue="000A0A0A" position="0">{bind(VM["ms"],38)}</GradientStop>'
      f'<GradientStop colorValue="FF0A0A0A" position="1">{bind(VM["me"],38)}</GradientStop></LinearGradient></Fill></Shape>')
def glow_rect(name,top,opacity,gid):
    h=H-top
    return (f'<Shape x="0" y="{top:.0f}" name="{name}" id="{gid}"><Rectangle width="{W}" height="{h:.0f}" originX="0" originY="0" name="R"/><Fill name="F">'
            f'<LinearGradient startX="{W/2}" startY="0" endX="{W/2}" endY="{h:.0f}" opacity="{opacity}" name="GG"><GradientStop colorValue="00C8A55C" position="0"/>'
            f'<GradientStop colorValue="{GOLD}" position="1">{bind(VM["glow"],38)}</GradientStop></LinearGradient></Fill></Shape>')
glow=glow_rect("GlowFar",H*0.48,0.55,"0:4")+glow_rect("GlowNear",H*0.70,0.9,"0:5")
out=f'''<Rive version="1" kind="fragment">
<Artboard defaultStateMachineId="0:7" viewModelId="0:40" viewModelInstanceId="0:41" clip="true" width="{W}" height="{H}" name="Unfold_clouds" id="0:2">
<Fill name="Background"><SolidColor colorValue="00000000" name="BG">{bind(VM["bg"])}</SolidColor></Fill>
{glow}
{mask}
{"".join(nodes)}
<StateMachine name="State Machine 1" id="0:7"><StateMachineLayer name="Layer 1" id="0:8"><AnyState x="200" y="-120"/><ExitState x="400" y="-120"/><EntryState><StateTransition stateToId="0:12"/></EntryState><AnimationState x="200" animationId="0:6" id="0:12"/></StateMachineLayer></StateMachine>
<LinearAnimation loopValue="loop" fps="60" duration="{DUR}" name="Drift" id="0:6">{"".join(keyed)}</LinearAnimation>
</Artboard>
<ViewModel defaultInstanceId="0:41" name="ViewModel1" id="0:40">
<ViewModelPropertyColor name="artwork_color" id="0:42"/><ViewModelPropertyColor name="glow_color" id="0:43"/><ViewModelPropertyColor name="background_color" id="0:44"/>
<ViewModelPropertyColor name="mask_gradient_start" id="0:45"/><ViewModelPropertyColor name="mask_gradient_end" id="0:46"/><ViewModelPropertyColor name="accentColor" id="0:47"/>
<ViewModelInstance exports="true" name="Default" id="0:41">
<ViewModelInstanceColor propertyValue="{GOLD}" viewModelPropertyId="0:42"/><ViewModelInstanceColor propertyValue="{GOLD}" viewModelPropertyId="0:43"/><ViewModelInstanceColor propertyValue="00000000" viewModelPropertyId="0:44"/>
<ViewModelInstanceColor propertyValue="000A0A0A" viewModelPropertyId="0:45"/><ViewModelInstanceColor propertyValue="FF0A0A0A" viewModelPropertyId="0:46"/><ViewModelInstanceColor propertyValue="{GOLD}" viewModelPropertyId="0:47"/>
</ViewModelInstance></ViewModel></Rive>
'''
open("scene.rml","w").write(out); print("bytes",len(out))
