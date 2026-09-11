from unfold_rml import *
sc=Scene("Unfold_mountains",seed=11)
def ridge(y,peaks,op,prop,weight,glow=False):
    pts=[cubic(70,y+8,0,40)]
    for px,ph in peaks: pts.append(cubic(px,y-ph,0,26))
    pts.append(cubic(430,y,0,30))
    return shape("R",path(pts)+(tapered(prop,op,weight,taper=(0.3,0.62),glow=glow) if glow else stroke(prop,op,weight)))
sc.node("Far",ridge(330,[(150,70),(230,50),(320,110),(390,50)],0.22,VM['artwork'],0.6),0,0)
sc.node("Mid",ridge(370,[(140,60),(210,120),(300,80),(370,40)],0.5,VM['artwork'],0.75),0,0,sway(Y,0,2,3600,0))
sc.node("Near",ridge(415,[(150,60),(230,140),(300,90),(360,60)],0.95,VM['accent'],0.9,glow=True),0,0,sway(Y,0,3,2400,600))
# mist: soft horizontal strands drifting between the ridges, fading in and out
for k in range(7):
    y=random.uniform(320,420); w=random.uniform(90,180); x=random.uniform(150,330); L=random.choice(CYCLES[5:8]); ph=random.randint(0,L)
    strand=shape("M",path([cubic(-w/2,0,0.05,w*0.3),cubic(0,-2,0,w*0.3),cubic(w/2,1,-0.05,w*0.3)])+stroke(VM['glow'],0.6,2.2,halo=5))
    sc.node(f"Mist{k}",strand,x,y,lifecycle(X,x,random.choice([60,-50,80]),0.7,L,ph,ease_move=True))
# a small sun/moon disc low on the horizon, breathing
sc.node("Disc",shape("D",ellipse(28)+halo(8)+stroke(VM['accent'],0.8,0.8)),300,250,sway(Y,250,4,4800,0),twinkle(0.6,1,3600,0))
sc.motes(12,(60,370),(200,430),rise=45,peak=(0.2,0.45))
print(sc.write())
