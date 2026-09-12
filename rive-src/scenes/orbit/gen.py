from unfold_rml import *
sc=Scene("Unfold_orbit"); CX,CY=245,265
# soft bokeh discs behind (Endel-style), breathing scale
for k,(dx,dy,r,op,per) in enumerate([(-55,-35,95,0.02,3600),(55,35,120,0.018,2400)]):
    sc.node(f"Bokeh{k}",shape("D",ellipse(2*r)+fill(VM['artwork'],op)),CX+dx,CY+dy,sway(SX,1,0.08,per,k*500),sway(SY,1,0.08,per,k*500))
# concentric hairline rings, opacity tiers, slight ellipse so rotation reads
for k,(r,op,thick,turns,ell) in enumerate([(42,0.95,1.0,1,1.0),(78,0.55,0.8,-1,0.94),(118,0.32,0.7,2,1.0),(162,0.18,0.6,-1,0.9)]):
    inner=shape("R",ellipse(2*r)+stroke(VM['accent' if k==0 else 'artwork'],op,thick))
    if k==0: inner=shape("R",ellipse(2*r)+halo(6)+stroke(VM['accent'],op,thick)+stroke(VM['accent'],op,2.6,trim=(0.05,0.32)))
    # planet on the ring
    inner+=shape("P",ellipse(4.4 if k<2 else 3.2)+fill(VM['accent'],0.95)+halo(4),r,0)
    tilt=[0,0.35,0,-0.5][k]
    sc.node(f"Ring{k}",f'<Node scaleY="{ell}" rotation="{tilt}" name="E">{inner}</Node>',CX,CY,spin(k*0.7,turns))
sc.motes(22,(110,370),(120,520),rise=70)
print(sc.write())
