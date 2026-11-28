from teken import *
A={}
def lucht(c="#e7eef1"): return r(0,0,1600,900,c)
def gevel(x,y,w,h,col,ramen=2,dak=None):
    s=r(x,y,w,h,col)+''.join(kozijn(x+20+i*(w-40)/max(ramen,1),y+40,40,60) for i in range(ramen))
    if dak: s+=p(f"M{x-10} {y} L{x+w/2} {y-60} L{x+w+10} {y} Z",dak)
    return s
A["algemeen-stad-parijs-fr"]=svgo(lucht(),wolk(260,120),r(0,640,1600,260,"#7c9aa8"),*[lijn(f"M{x} 720 q40 -12 80 0","#b8cdd6",4) for x in range(60,1600,240)],
 r(0,600,1600,40,"#c9b8a8"),*[gevel(60+i*170,420,150,180,["#e9dcc8","#e3d6c6"][i%2],2) for i in (0,1,2)],*[p(f"M{60+i*170} 420 h150 l-20 -40 h-110 z","#5c6a75") for i in (0,1,2)],
 p("M960 600 L1040 200 L1060 80 L1080 200 L1160 600 h-50 q-50 -120 -100 0 z","#6f6660"),lijn("M1000 400 h120 M1020 300 h80 M1035 220 h50","#4a4440",5),r(1056,40,8,40,I),
 *[gevel(1250+i*170,440,150,160,["#e9dcc8","#e3d6c6"][i%2],2) for i in (0,1)],p("M500 640 q100 -60 200 0","none"),boom(820,600,.6))
A["algemeen-stad-lyon-fr"]=svgo(lucht("#f3ece4"),p("M0 520 Q500 200 1000 360 T1600 300 V900 H0 z","#7d9067"),
 r(560,200,300,180,W),*[r(570+i*70,160,40,60,W) for i in range(4)],p("M680 200 l30 -60 l30 60 z",W),lijn("M710 140 v-30",I,4),
 r(0,600,1600,300,"#e3d6c6"),*[r(40+i*130,480,120,120,["#e9a23b","#d98a5f","#e3c26b","#c97a5a"][i%4])+kozijn(70+i*130,510,40,50) for i in range(12)],
 r(0,700,1600,90,"#7c9aa8"),r(0,800,1600,100,"#9a9188"),lijn("M200 700 q100 -40 200 0 M900 700 q100 -40 200 0",I,4))
A["algemeen-stad-marseille-fr"]=svgo(lucht("#e3eef3"),p("M300 420 Q600 120 900 420 z","#c9b8a8"),r(560,200,80,140,"#e9dcc8"),r(585,120,30,80,"#e9dcc8"),c(600,110,16,OK),
 r(0,420,1600,180,"#d9cdbf"),*[r(60+i*140,330,120,90,["#e9dcc8","#e3c79a","#e3d6c6"][i%3])+kozijn(95+i*140,350,40,40) for i in range(11)],
 r(0,600,1600,300,"#3d7f9f"),*[p(f"M{x} {y} h120 l-20 30 h-80 z",W)+lijn(f"M{x+60} {y} v-90",I,4)+p(f"M{x+64} {y-85} v70 l50 -10 z",W) for x,y in [(150,660),(400,700),(700,650),(1000,720),(1300,670)]])
A["algemeen-stad-lille-fr"]=svgo(lucht(),wolk(1200,110),r(0,680,1600,220,"#c9b8a8"),*[lijn(f"M{x} 680 l-40 220","#b0a090",2) for x in range(80,1700,120)],
 r(680,180,140,500,"#c47a4a"),r(660,160,180,40,"#a8643a"),p("M700 160 l50 -100 l50 100 z","#3d7a47"),c(750,260,30,W),*[kozijn(705+i*60,340,30,70) for i in range(2)],
 *[r(60+i*150,360,140,320,["#c47a4a","#e3c26b","#9a3b2a","#e9dcc8"][i%4])+p(f"M{60+i*150} 360 v-30 h20 v-20 h20 v-20 h60 v20 h20 v20 h20 v30 z",["#c47a4a","#e3c26b","#9a3b2a","#e9dcc8"][i%4])+kozijn(95+i*150,420,70,80) for i in (0,1,2,3)],
 *[r(880+i*150,360,140,320,["#e3c26b","#c47a4a","#e9dcc8","#9a3b2a"][i%4])+p(f"M{880+i*150} 360 v-30 h20 v-20 h20 v-20 h60 v20 h20 v20 h20 v30 z",["#e3c26b","#c47a4a","#e9dcc8","#9a3b2a"][i%4])+kozijn(915+i*150,420,70,80) for i in range(4)])
A["algemeen-stad-bordeaux-fr"]=svgo(lucht(),r(0,560,1600,340,"#b8c9d0"),r(200,240,1200,320,"#e9dcc8"),p("M650 240 L800 140 L950 240 Z","#d6c7b4"),
 *[kozijn(250+i*110,290,60,90) for i in range(11)],*[p(f"M{250+i*110} 470 v-40 q30 -30 60 0 v40 z",GR) for i in range(11)],p("M200 240 h1200 v-20 h-1200 z","#5c6a75"),
 p("M0 620 h1600 v280 h-1600 z","#9fc3d0",'opacity="0.6"'),r(200,640,1200,10,"#e9dcc8",0,'opacity="0.5"'),*[figuur(300+i*260,720,.4,GR) for i in range(4)])
A["algemeen-stad-toulouse-fr"]=svgo(lucht("#f6efe2"),r(0,520,1600,380,"#7c9aa8"),
 r(0,300,1600,220,"#d98a6a"),*[kozijn(40+i*130,340,50,70) for i in range(12)],r(700,180,200,120,"#d98a6a"),p("M690 180 L800 120 L910 180 Z","#a8543a"),
 p("M0 560 h1600 v40 h-1600 z","#c4704a"),*[p(f"M{60+i*260} 600 q110 -110 220 0 v20 h-220 z","#7c9aa8") for i in range(6)],*[c(170+i*260,560,24,"#7c9aa8") for i in range(6)],
 *[lijn(f"M{x} 720 q40 -12 80 0","#b8cdd6",4) for x in range(80,1600,280)])
A["algemeen-stad-nice-fr"]=svgo(lucht("#e3f0f6"),r(0,380,1600,220,"#3d9fbf"),r(0,600,1600,300,"#e9dcc8"),lijn("M0 600 h1600",W,8),
 *[r(x,640,50,10,"#3d6fb0")+r(x+40,600,10,50,"#3d6fb0")+r(x,650,8,40,GR)+r(x+42,650,8,40,GR) for x in range(80,1600,180)],
 *[r(x,380,16,240,"#a8743f")+e(x+8,370,90,30,G)+e(x+8,380,70,40,GL) for x in (300,900,1400)],c(200,160,60,OK))
A["algemeen-stad-nantes-fr"]=svgo(lucht(),wolk(1200,110),r(0,620,1600,280,"#7c9aa8"),r(300,300,900,320,"#e9e4df"),
 *[r(260+i*300,220,120,400,"#e9e4df")+p(f"M{250+i*300} 220 l70 -80 l70 80 z","#5c6a75") for i in range(4)],*[r(360+i*120,240,40,40,W) for i in range(7)],
 r(700,460,120,160,"#7a532c"),p("M700 460 q60 -60 120 0",GR),lijn("M640 620 v-0",I),boom(120,620,.8))
A["algemeen-stad-straatsburg-fr"]=svgo(lucht(),r(0,700,1600,200,"#7c9aa8"),
 p("M700 700 V300 h200 v400 z","#c47a6a"),p("M800 300 L840 260 V120 L860 60 L880 120 V300","#c47a6a"),p("M700 300 l100 -100 l0 100 z","#a8643a"),c(800,420,50,"#9fb6bf"),
 *[r(60+i*150,420,140,280,W)+lijn(f"M{60+i*150} 480 h140 M{60+i*150} 560 h140 M{130+i*150} 420 v280 M{60+i*150} 420 l140 140 M{200+i*150} 420 l-140 140","#7a532c",6)+p(f"M{50+i*150} 420 L{130+i*150} 320 L{210+i*150} 420 Z","#9a3b2a") for i in range(4)],
 *[r(960+i*150,420,140,280,W)+lijn(f"M{960+i*150} 480 h140 M{960+i*150} 560 h140 M{1030+i*150} 420 v280","#7a532c",6)+p(f"M{950+i*150} 420 L{1030+i*150} 320 L{1110+i*150} 420 Z","#9a3b2a") for i in range(4)])
A["algemeen-stad-montpellier-fr"]=svgo(lucht("#f6efe2"),r(0,640,1600,260,"#e3d6c6"),*[r(60+i*300,280,260,360,"#e9dcc8")+''.join(kozijn(90+i*300+k*80,320,40,70) for k in range(3))+''.join(kozijn(90+i*300+k*80,440,40,70) for k in range(3)) for i in range(5)],
 p("M520 900 V720 q60 -100 120 -100 q60 0 120 100 v180 z","#e9dcc8"),c(640,700,30,"#9fc3d0"),
 p("M900 760 h500 q40 0 50 40 v60 h-560 v-60 q0 -40 10 -40 z","#3d6fb0"),*[r(940+i*110,780,80,40,"#9fc3d0") for i in range(4)],lijn("M900 700 h560",I,4))
A["algemeen-stad-rennes-fr"]=svgo(lucht(),wolk(300,110),r(0,700,1600,200,"#c9b8a8"),
 *[r(80+i*190,300-(i%2)*30,170,400+(i%2)*30,["#e3c26b","#c97a5a","#9fc3d0","#e9a23b","#b8c9a0","#d98a5f","#e3c26b","#c97a5a"][i])+lijn(f"M{80+i*190} {400-(i%2)*30} h170 M{80+i*190} {520-(i%2)*30} h170 M{165+i*190} {300-(i%2)*30} v400 M{80+i*190} {300-(i%2)*30} l85 100 l85 -100","#5c3b1e",6)+p(f"M{70+i*190} {300-(i%2)*30} L{165+i*190} {200-(i%2)*30} L{260+i*190} {300-(i%2)*30} Z","#5c6a75") for i in range(8)])
A["algemeen-stad-dijon-fr"]=svgo(lucht(),r(0,700,1600,200,"#d9cdbf"),r(300,380,1000,320,"#e9dcc8"),*[kozijn(360+i*130,460,60,90) for i in range(7)],
 p("M260 380 L800 140 L1340 380 Z","#7a532c"),*[p(f"M{x} {y} l25 -18 l25 18 l-25 18 z",col) for k,(x0,y,n) in enumerate([(420,330,8),(500,280,6),(600,230,4),(680,190,3)]) for i,(x,col) in enumerate([(x0+j*90,["#2f6b3a","#e3c26b","#9a3b2a","#1f1a18"][(j+k)%4]) for j in range(n)])],
 r(780,600,120,100,I))
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
