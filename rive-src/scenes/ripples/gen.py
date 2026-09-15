from unfold_rml import *
sc=Scene("Unfold_ripples"); CX,CY=250,300
# expanding rings: scale 0.1 -> 1, opacity 0.8 -> 0, staggered
N=5; L=3000
for k in range(N):
    ph=k*L//N; r=200
    ring=shape("R",f'<Ellipse width="{2*r}" height="{2*r*0.62}" originX="0.5" originY="0.5" name="E"/>'+stroke(VM['accent'] if k%3==0 else VM['artwork'],1,0.9 if k%3==0 else 0.7))
    grow=lambda key:cycle_keys(key,L,ph,[(0,0.06),(1,1.0)],ease=False)
    fade=cycle_keys(OPACITY,L,ph,[(0,0),(0.12,0.8),(0.9,0.0),(1,0)])
    sc.node(f"Ripple{k}",ring,CX,CY,grow(SX),grow(SY),fade)
# the drop: a tiny tapered arc that pulses at the center
sc.node("Drop",shape("D",ellipse(10)+halo(5)+stroke(VM['accent'],0.9,1.0)+stroke(VM['accent'],0.9,2.4,trim=(0.1,0.45))),CX,CY,sway(SX,1,0.35,L,0),sway(SY,1,0.35,L,0),twinkle(0.5,1,L,0))
# still water lines, swaying
for k,(y,w,op) in enumerate([(CY+130,300,0.35),(CY+165,230,0.22),(CY+95,180,0.18)]):
    pts=[cubic(-w/2,0,0.05,w*0.18),cubic(-w/6,-3,0,w*0.16),cubic(w/6,3,0,w*0.16),cubic(w/2,0,-0.05,w*0.18)]
    sc.node(f"Water{k}",shape("L",path(pts)+stroke(VM['artwork'],op,0.7)),CX-10,y,sway(Y,y,4-k,CYCLES[5+k%2],k*700),sway(X,CX-10,8,CYCLES[6],k*900))
sc.motes(14,(120,370),(140,420),rise=50,peak=(0.25,0.5))
print(sc.write())
