from unfold_rml import *
sc=Scene("Unfold_moon",seed=3); MX,MY,R=262,222,50
# crescent: outer arc tapered + inner arc, glow halo
outer=shape("O",ellipse(2*R)+halo(7)+stroke(VM['accent'],0.95,0.9,trim=(0.12,0.68))+stroke(VM['accent'],0.95,1.8,trim=(0.25,0.55))+stroke(VM['accent'],0.95,2.6,trim=(0.34,0.46)))
inner=shape("I",f'<Node x="-14" y="-6" name="n">{shape("i",ellipse(2*R*0.86)+stroke(VM["artwork"],0.55,0.7,trim=(0.13,0.62)))}</Node>')
sc.node("Moon",outer+inner,MX,MY,sway(Y,MY,6,3600,0),sway(ROT,0,0.03,2400,600))
# stars: twinkling dots in the upper half, a few larger with 4-point sparkle line
for k in range(34):
    x=random.uniform(30,370); y=random.uniform(40,470)
    if (x-MX)**2+(y-MY)**2<(R+30)**2: continue
    r=random.choice([0.9,1.2,1.6,2.2]); per=random.choice(CYCLES[:5]); ph=random.randint(0,per)
    sc.node(f"Star{k}",shape("S",ellipse(2*r)+fill(VM['artwork'],1)),x,y,twinkle(random.uniform(0.15,0.4),random.uniform(0.7,1),per,ph),opacity=0.6)
# two shooting stars, rare: one streak every 60 s each, offset
for k,(x,y,ph) in enumerate([(110,105,900),(290,70,4500)]):
    streak=shape("T",path([straight(0,0),straight(70,-28)])+stroke(VM['accent'],0.9,0.8))
    sc.node(f"Shoot{k}",streak,x,y,burst(X,x,150,0.9,150,3600,ph),burst(Y,y,-60,0.9,150,3600,ph)[:0])
sc.motes(10,(130,370),(120,480),rise=40,peak=(0.15,0.35))
print(sc.write())
