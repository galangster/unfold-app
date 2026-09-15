"""Shared RML building blocks for Unfold Today ambience scenes. Rules: rive-src/DESIGN-REFERENCE.md."""
import math, random, re
W,H,DUR,FPS=390,844,7200,60   # 120 s loop
VM={'artwork':'0:42','glow':'0:43','bg':'0:44','ms':'0:45','me':'0:46','accent':'0:47'}
GOLD='FFC8A55C'
X,Y,ROT,SX,SY,OPACITY=13,14,15,16,17,18   # TransformComponent property keys

def bind(prop,key=37): return f'<DataBindContext sourcePathIds="0:40-{prop}" propertyKey="{key}"/>'
def paint(prop,opacity=1):
    """A bound color with an opacity. The bind overwrites alpha, so opacity lives on a flat gradient."""
    return (f'<LinearGradient startX="0" startY="0" endX="1" endY="0" opacity="{opacity}" name="G">'
            f'<GradientStop colorValue="{GOLD}" position="0">{bind(prop,38)}</GradientStop>'
            f'<GradientStop colorValue="{GOLD}" position="1">{bind(prop,38)}</GradientStop></LinearGradient>')
def stroke(prop,opacity,thick,trim=None,halo=0,cap="round"):
    fx=f'<TrimPath start="{trim[0]}" end="{trim[1]}" name="T"/>' if trim else ''
    fe=f'<Feather strength="{halo}" name="F"/>' if halo else ''
    return f'<Stroke thickness="{thick}" cap="{cap}" join="round" name="S">{paint(prop,opacity)}{fx}{fe}</Stroke>'
def halo(thick): return stroke(VM['glow'],0.14,thick,halo=thick)
def tapered(prop,opacity,weight,taper=(0.3,0.72),glow=False):
    """Single line with varying weight: hairline full length, 1.9x over the taper band, 2.8x at its core."""
    t0,t1=taper; mid=(t0+t1)/2; core=(mid-(t1-t0)*0.18, mid+(t1-t0)*0.18)
    return (halo(weight*6) if glow else '')+stroke(prop,opacity,weight)+stroke(prop,opacity,weight*1.9,trim=(t0,t1))+stroke(prop,opacity,weight*2.8,trim=core)
def cubic(x,y,rot,dist): return f'<CubicMirroredVertex x="{x:.1f}" y="{y:.1f}" rotation="{rot:.3f}" distance="{dist:.1f}"/>'
def straight(x,y,radius=0): return f'<StraightVertex x="{x:.1f}" y="{y:.1f}" radius="{radius:.1f}"/>'
def path(vertices,closed=False): return f'<PointsPath isClosed="{str(closed).lower()}" isClockwise="true" name="P">{"".join(vertices)}</PointsPath>'
def shape(name,inner,x=0,y=0,sid=None): return f'<Shape x="{x:.1f}" y="{y:.1f}" name="{name}"{f" id={chr(34)}{sid}{chr(34)}" if sid else ""}>{inner}</Shape>'
def ellipse(w,h=None): return f'<Ellipse width="{w}" height="{h or w}" originX="0.5" originY="0.5" name="E"/>'
def fill(prop,opacity): return f'<Fill name="F">{paint(prop,opacity)}</Fill>'

# ---- keyframes ----
def kd(v,f,ease=True):
    return (f'<KeyFrameDouble value="{v:.3f}" frame="{int(f)}" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble>' if ease
            else f'<KeyFrameDouble value="{v:.3f}" frame="{int(f)}" interpolationType="linear"/>')
def keyed(key,frames): return f'<KeyedProperty propertyKey="{key}">{frames}</KeyedProperty>'
def sway(key,v0,amp,period,phase=0):
    """v0 -> v0+amp -> v0 per period, eased, repeated across DUR with a phase offset. Seamless when period divides DUR."""
    assert DUR%period==0, f"sway period {period} must divide DUR {DUR} or the loop pops"
    pts=[];f=-phase
    while f<DUR:
        for frac,val in ((0,0),(0.5,amp),(1,0)):
            ff=f+frac*period
            if 0<=ff<=DUR: pts.append((int(ff),v0+val))
        f+=period
    edge=v0+amp*(1-abs(((phase/period)%1)*2-1))   # the wave's value at frame 0, and again at DUR when period divides DUR
    if not pts or pts[0][0]!=0: pts.insert(0,(0,edge))
    if pts[-1][0]!=DUR: pts.append((DUR,edge))
    pts=sorted(set(pts))   # cycle end and next cycle start land on one frame; keep one key
    return keyed(key,"".join(kd(v,f) for f,v in pts))
def spin(v0,turns,period=DUR):
    """Continuous rotation, seamless: linear from v0 to v0 + turns*2pi over `period`, tiled across DUR."""
    out=[];f=0
    while f<DUR:
        out.append(kd(v0,f,False)); out.append(kd(v0+turns*2*math.pi,min(f+period,DUR)-(1 if f+period<DUR else 0),False)); f+=period
    return keyed(ROT,"".join(out))
def cycle_at(L,phase,stops,t):
    """Value of a tiled cycle (see cycle_keys) at absolute frame t."""
    p=((t+phase)%L)/L
    for (f0,v0),(f1,v1) in zip(stops,stops[1:]):
        if f0<=p<=f1: return v0 if f1==f0 else v0+(v1-v0)*(p-f0)/(f1-f0)
    return stops[-1][1]
def cycle_keys(key,L,phase,stops,ease=True):
    """Tile `stops` [(frac,value)...] over cycles of L frames shifted by `phase`, clipped to [0,DUR] with
    interpolated values at both ends so the loop is seamless whatever the phase."""
    assert DUR%L==0, f"cycle length {L} must divide DUR {DUR} or the loop pops"
    at=lambda t:cycle_at(L,phase,stops,t)
    pts=[(0,at(0))]; c=-phase
    while c<DUR:
        for frac,val in stops:
            f=c+frac*L-(1 if frac>=1 else 0)   # end stop sits one frame before the next cycle's start
            if 0<f<DUR: pts.append((int(f),val))
        c+=L
    pts.append((DUR,at(DUR))); pts=sorted(set(pts))
    return keyed(key,"".join(kd(v,f,ease) for f,v in pts))
def envelope(L,phase,active,peak,ramp=0.15):
    """Opacity 0 -> peak -> 0 during the first `active` frames of each L-frame cycle, dark otherwise."""
    a=active/L
    return cycle_keys(OPACITY,L,phase,[(0,0),(a*ramp,peak),(a*(1-ramp),peak),(a,0),(1,0)])
def travel(key,v0,v1,L,phase,active,ease=False):
    """`key` moves v0 -> v1 during the first `active` frames of each cycle, then holds."""
    return cycle_keys(key,L,phase,[(0,v0),(active/L,v1),(1,v1)],ease=ease)
def burst(key,base,delta,peak,active,period,phase):
    """A rare event: moves base -> base+delta while fading in and out during the first `active` frames of each `period`."""
    return travel(key,base,base+delta,period,phase,active)+envelope(period,phase,active,peak,ramp=0.2)
def lifecycle(key,base,delta,peak,L,phase,ease_move=False):
    """Spawn, drift, fade: `key` moves base -> base+delta while opacity goes 0 -> peak -> 0, repeated across DUR."""
    return (cycle_keys(key,L,phase,[(0,base),(1,base+delta)],ease=ease_move)
            +cycle_keys(OPACITY,L,phase,[(0,0),(0.3,peak),(0.7,peak),(1,0)]))
def twinkle(lo,hi,period,phase): return sway(OPACITY,lo,hi-lo,period,phase)
CYCLES=[600,720,800,900,1200,1440,1800,2400,3600]   # all divide DUR

# ---- scene furniture ----
def transparent_stop(pos):
    """A fully transparent gradient stop bound to the surface colour, so a fade never carries baked gold under another accent."""
    return f'<GradientStop colorValue="000A0A0A" position="{pos}">{bind(VM["ms"],38)}</GradientStop>'
def glow_rect(name,top,opacity,gid):
    h=H-top
    return (f'<Shape x="0" y="{top:.0f}" name="{name}" id="{gid}"><Rectangle width="{W}" height="{h:.0f}" originX="0" originY="0" name="R"/><Fill name="F">'
            f'<LinearGradient startX="{W/2}" startY="0" endX="{W/2}" endY="{h:.0f}" opacity="{opacity}" name="GG">{transparent_stop(0)}'
            f'<GradientStop colorValue="{GOLD}" position="1">{bind(VM["glow"],38)}</GradientStop></LinearGradient></Fill></Shape>')
GLOW=glow_rect("GlowFar",H*0.48,0.55,"0:4")+glow_rect("GlowNear",H*0.70,0.9,"0:5")
GLOW_BREATH=f'<KeyedObject objectId="0:4">{sway(OPACITY,1.0,-0.12,1800,0)}</KeyedObject><KeyedObject objectId="0:5">{sway(OPACITY,1.0,-0.12,1200,0)}</KeyedObject>'   # the shipped glows breathe about 10%
KEY_ATTR={X:'x',Y:'y',ROT:'rotation',SX:'scaleX',SY:'scaleY',OPACITY:'opacity'}
def rest_pose(markup,i,keyed_props):
    """Write every keyed property's frame-0 value into the element's authored attributes, so the un-advanced
    artboard (the runtime's first paint, and --advance=0) equals frame 0 of the loop instead of popping."""
    at=markup.find(f'id="{i}"')
    if at<0: return markup
    lt=markup.rfind('<',0,at); gt=markup.find('>',at); tag=markup[lt:gt+1]
    for kp in keyed_props:
        for key,body in re.findall(r'<KeyedProperty propertyKey="(\d+)">(.*?)</KeyedProperty>',kp):
            m=re.search(r'value="([^"]+)" frame="0"',body); attr=KEY_ATTR.get(int(key))
            if not m or not attr: continue
            if re.search(rf'(?<![A-Za-z]){attr}="[^"]*"',tag): tag=re.sub(rf'(?<![A-Za-z]){attr}="[^"]*"',f'{attr}="{m.group(1)}"',tag,count=1)
            else: tag=tag.replace(' name=',f' {attr}="{m.group(1)}" name=',1)
    return markup[:lt]+tag+markup[gt+1:]
MASK=(f'<Shape x="0" y="{H*0.55:.0f}" name="BottomMask" id="0:3"><Rectangle width="{W}" height="{H*0.45:.0f}" originX="0" originY="0" name="R"/><Fill name="F">'
      f'<LinearGradient startX="{W/2}" startY="0" endX="{W/2}" endY="{H*0.45:.0f}" name="MG"><GradientStop colorValue="000A0A0A" position="0">{bind(VM["ms"],38)}</GradientStop>'
      f'<GradientStop colorValue="FF0A0A0A" position="1">{bind(VM["me"],38)}</GradientStop></LinearGradient></Fill></Shape>')

class Scene:
    """Collects nodes and keyed objects, hands out ids, writes the document."""
    def __init__(self,artboard,seed=7):
        self.artboard=artboard; self.nodes=[]; self.keyed=[]; self.assets=[]; self.nid=100; random.seed(seed)
    def new_id(self):
        i=f"0:{self.nid}"; self.nid+=1; return i
    def register(self,markup_fn,*keyed_props):
        """Allocate an id, build markup_fn(id) with its rest pose, record its KeyedProperty strings.
        Returns (id, markup) without placing the markup, for callers that nest it inside another element."""
        i=self.new_id(); markup=rest_pose(markup_fn(i),i,keyed_props)
        if keyed_props: self.keyed.append(f'<KeyedObject objectId="{i}">{"".join(keyed_props)}</KeyedObject>')
        return i,markup
    def add(self,markup_fn,*keyed_props):
        """markup_fn(id) -> element markup placed in the artboard. keyed_props: KeyedProperty strings for that id."""
        i,markup=self.register(markup_fn,*keyed_props); self.nodes.append(markup); return i
    def node(self,name,inner,x,y,*keyed_props,opacity=1):
        return self.add(lambda i:f'<Node x="{x:.1f}" y="{y:.1f}" opacity="{opacity}" name="{name}" id="{i}">{inner}</Node>',*keyed_props)
    def motes(self,n,xr,yr,rise=90,sizes=(1.2,1.6,2.2),peak=(0.35,0.7),cycles=None):
        for k in range(n):
            x=random.uniform(*xr); y=random.uniform(*yr); L=random.choice(cycles or CYCLES[:6]); ph=random.randint(0,L); r=random.choice(sizes); p=random.uniform(*peak)
            self.add(lambda i,x=x,y=y,r=r:shape(f"Mote{k}",ellipse(2*r)+fill(VM['artwork'],1),x,y,i),lifecycle(Y,y,-rise,p,L,ph))
    def script(self,name,file,x=0,y=0,accent=True):
        """A ScriptedDrawable running `file` (Luau Node protocol) with an `accent` color input bound to accentColor."""
        aid=self.new_id(); self.assets.append(f'<ScriptAsset file="{file}" name="{name}" id="{aid}"/>')
        inp=f'<ScriptInputColor propertyValue="{GOLD}" name="accent">{bind(VM["accent"],836)}</ScriptInputColor>' if accent else ''
        return self.add(lambda i:f'<ScriptedDrawable x="{x}" y="{y}" scriptAssetId="{aid}" name="{name}" id="{i}">{inp}</ScriptedDrawable>')
    def write(self,out="scene.rml"):
        doc=f'''<Rive version="1" kind="fragment">
<Artboard defaultStateMachineId="0:7" viewModelId="0:40" viewModelInstanceId="0:41" clip="true" width="{W}" height="{H}" name="{self.artboard}" id="0:2">
<Fill name="Background"><SolidColor colorValue="00000000" name="BG">{bind(VM["bg"])}</SolidColor></Fill>
{GLOW}
{MASK}
{"".join(self.nodes)}
<StateMachine name="State Machine 1" id="0:7"><StateMachineLayer name="Layer 1" id="0:8"><AnyState x="200" y="-120"/><ExitState x="400" y="-120"/><EntryState><StateTransition stateToId="0:12"/></EntryState><AnimationState x="200" animationId="0:6" id="0:12"/></StateMachineLayer></StateMachine>
<LinearAnimation loopValue="loop" fps="{FPS}" duration="{DUR}" name="Loop" id="0:6">{GLOW_BREATH}{"".join(self.keyed)}</LinearAnimation>
</Artboard>
<ViewModel defaultInstanceId="0:41" name="ViewModel1" id="0:40">
<ViewModelPropertyColor name="artwork_color" id="0:42"/><ViewModelPropertyColor name="glow_color" id="0:43"/><ViewModelPropertyColor name="background_color" id="0:44"/>
<ViewModelPropertyColor name="mask_gradient_start" id="0:45"/><ViewModelPropertyColor name="mask_gradient_end" id="0:46"/><ViewModelPropertyColor name="accentColor" id="0:47"/>
<ViewModelInstance exports="true" name="Default" id="0:41">
<ViewModelInstanceColor propertyValue="{GOLD}" viewModelPropertyId="0:42"/><ViewModelInstanceColor propertyValue="{GOLD}" viewModelPropertyId="0:43"/><ViewModelInstanceColor propertyValue="00000000" viewModelPropertyId="0:44"/>
<ViewModelInstanceColor propertyValue="000A0A0A" viewModelPropertyId="0:45"/><ViewModelInstanceColor propertyValue="FF0A0A0A" viewModelPropertyId="0:46"/><ViewModelInstanceColor propertyValue="{GOLD}" viewModelPropertyId="0:47"/>
</ViewModelInstance></ViewModel>
{"".join(self.assets)}
</Rive>
'''
        open(out,"w").write(doc); return len(doc)
