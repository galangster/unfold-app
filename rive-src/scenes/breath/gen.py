from unfold_rml import *
sc=Scene("Unfold_breath"); CX=235; N=9; TOP,BOT=165,415; WID=260
for k in range(N):
    y=TOP+(BOT-TOP)*k/(N-1); d=abs(k-(N-1)/2)/((N-1)/2)   # 0 center .. 1 edge
    op=0.95-0.72*d; amp=6+6*(1-d); per=CYCLES[4+(k%4)]; ph=k*260
    a=random.uniform(6,12); w=WID*random.uniform(0.85,1.05); pts=[cubic(-w/2,0,0.12,w*0.14),cubic(-w/4,-a,0,w*0.13),cubic(0,a*0.8,0,w*0.13),cubic(w/4,-a,0,w*0.13),cubic(w/2,0,-0.12,w*0.14)]
    prop=VM['accent'] if d<0.2 else VM['artwork']
    paints=tapered(prop,op,0.9,taper=(0.35,0.7),glow=(d<0.2)) if d<0.2 else stroke(prop,op,0.7)
    sc.node(f"Wave{k}",shape("W",path(pts)+paints),CX+random.uniform(-14,14),y,sway(Y,y,amp,per,ph),sway(SX,1,0.03,per*1.5,ph+300))
sc.motes(18,(110,360),(130,480),rise=60,peak=(0.25,0.55))
print(sc.write())
