from unfold_rml import *
sc=Scene("Unfold_constellation",seed=5); CX,CY=245,255
raw=[(random.uniform(-120,120),random.uniform(-130,130)) for _ in range(9)]
pts=[raw.pop(0)]   # greedy nearest-neighbour chain reads as a figure, not a graph
while raw:
    lx,ly=pts[-1]; raw.sort(key=lambda p:(p[0]-lx)**2+(p[1]-ly)**2); pts.append(raw.pop(0))
links=path([straight(x,y) for x,y in pts])
group=shape("Links",links+stroke(VM['artwork'],0.3,0.6))
for k,(x,y) in enumerate(pts):
    r=random.choice([1.4,1.8,2.4,3.0]); group+=shape(f"N{k}",ellipse(2*r)+fill(VM['accent'],0.9)+(halo(5) if r>=2.4 else ''),x,y)
    group+=shape(f"H{k}",ellipse(2*r+8)+stroke(VM['artwork'],0.25,0.5),x,y)
sc.node("Cluster",group,CX,CY,sway(X,CX,10,4800,0),sway(Y,CY,7,3600,900),sway(ROT,0,0.025,7200,0))
# background stars twinkling
for k in range(40):
    x=random.uniform(20,375); y=random.uniform(30,500); r=random.choice([0.8,1.1,1.5]); per=random.choice(CYCLES[:5])
    sc.node(f"Bg{k}",shape("S",ellipse(2*r)+fill(VM['artwork'],1)),x,y,twinkle(random.uniform(0.1,0.3),random.uniform(0.5,0.8),per,random.randint(0,per)))
sc.node("Shoot",shape("T",path([straight(0,0),straight(80,-24)])+stroke(VM['accent'],0.9,0.8)),80,110,burst(X,80,170,0.9,150,3600,2000))
print(sc.write())
