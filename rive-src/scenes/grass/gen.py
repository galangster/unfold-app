from unfold_rml import *
sc=Scene("Unfold_grass",seed=9); BASE=445
slots=[150+i*23+random.uniform(-6,6) for i in range(11)]
for k,x in enumerate(slots):
    depth=random.random(); h=random.uniform(55,135)*(0.7+0.5*depth); bend=random.uniform(14,46)
    op=0.18+0.72*depth; weight=0.55+0.45*depth; per=random.choice(CYCLES[1:5]); ph=random.randint(0,per); amp=random.uniform(0.03,0.07)*(1 if bend>0 else -1)
    tip=-0.95 if bend>0 else -2.2; pts=[cubic(0,0,1.5708,h*0.5),cubic(bend,-h,tip,h*0.28)]
    paints=tapered(VM['accent'],op,weight,taper=(0.0,0.5),glow=depth>0.85) if depth>0.6 else stroke(VM['artwork'],op,weight)
    sc.node(f"Blade{k}",shape("B",path(pts)+paints),x,BASE+random.uniform(-4,8),sway(ROT,0,amp,per,ph))
# seeds drifting up and away on the wind
for k in range(16):
    x=random.uniform(150,380); y=random.uniform(280,440); L=random.choice(CYCLES[2:6]); ph=random.randint(0,L)
    sc.add(lambda i,x=x,y=y:shape(f"Seed{k}",ellipse(2.2)+fill(VM['artwork'],1),x,y,i),lifecycle(Y,y,-120,random.uniform(0.3,0.6),L,ph),lifecycle(X,x,random.uniform(20,60),0.5,L,ph)[:0]+keyed(X,"".join(kd(v,f) for f,v in [(ff,x+val) for base in range(-ph,DUR,L) for ff,val in ((base,0),(base+L,random.uniform(20,60))) if 0<=ff<=DUR])))
print(sc.write())
