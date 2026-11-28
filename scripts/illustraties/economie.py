from teken import *
A={}
A["economie-markthal-fr"]=open('scripts/illustraties/markthal.svg').read()
A["economie-winkelstraat-rolluiken-fr"]=svg(wolk(300,110),grond(720,"#d9cdbf"),
 *[r(60+i*380,220,360,500,[ZA,"#e9dcc8",ZA,"#e3d6c6"][i])+r(100+i*380,280,110,120,GR)+r(250+i*380,280,110,120,GR)+r(100+i*380,470,280,250,"#a89a88")+''.join(r(100+i*380,470+k*24,280,6,"#8f8273") for k in range(10))+r(100+i*380,440,280,24,[M,G,MD,GR][i]) for i in range(4)],
 figuur(1450,820,.6,GR))
A["economie-fabriek-fr"]=svg(r(0,0,1600,900,"#ebe5df"),wolk(1250,140,.9,"#d6cec6"),grond(700,"#d9cdbf"),
 p("M200 700 V420 l150 -90 v90 l150 -90 v90 l150 -90 v90 l150 -90 V700 z",GR),r(950,380,400,320,"#8a7b6c"),*[raam(990+i*110,450,70,80,"#c9b8a8") for i in range(3)],
 r(1050,160,50,220,M),r(1180,200,50,180,M),e(1075,140,70,30,"#d6cec6"),e(1205,180,60,26,"#d6cec6"),r(380,600,140,100,I))
A["economie-haven-containers-fr"]=svg(r(0,0,1600,900,"#eef0f2"),r(0,640,1600,260,"#7c8d96"),r(0,600,1100,60,GR),
 *[r(80+i*170,500-j*70,160,66,[M,"#2a3f8f",G,OK,GR,MD][(i+j)%6]) for i in range(6) for j in range(2)],
 r(1150,180,24,420,OK),r(1060,180,320,24,OK),r(1220,200,8,200,I),r(1200,400,50,40,M),
 p("M1150 700 h400 l-40 70 h-320 z",I),r(1260,620,160,80,W))
A["economie-tankstation-fr"]=svg(grond(720),r(250,240,1100,50,M),r(300,290,30,430,GR),r(1270,290,30,430,GR),
 *[r(460+i*360,460,150,260,W,12,'stroke="#1f1a18" stroke-width="6"')+r(480+i*360,490,110,70,"#b8c9cf",6)+r(500+i*360,600,70,16,GR) for i in range(2)],
 p("M640 520 q60 0 60 80 v120","none",'stroke="#1f1a18" stroke-width="10"'),figuur(1150,820,.6),r(1380,300,140,420,GR),r(1395,330,110,260,W),*[r(1410,350+k*60,80,30,[M,G,OK,"#2a3f8f"][k]) for k in range(4)])
A["economie-energiemeter-fr"]=svg(r(0,0,1600,900,"#e9e2d8"),r(500,150,600,620,"#d6e7c4",30,'stroke="#1f1a18" stroke-width="10"'),r(560,230,480,170,"#1f1a18",12),
 *[r(600+i*85,280,60,70,"#7fd18a",6) for i in range(5)],c(800,520,40,G),r(620,620,360,40,W,8),r(640,470,60,60,GR,8),r(900,470,60,60,GR,8),
 p("M800 770 v130","none",'stroke="#1f1a18" stroke-width="20"'),p("M1200 300 l-60 140 h70 l-60 140","none",'stroke="#e3c26b" stroke-width="18" stroke-linejoin="round"'))
A["economie-belastingbrief-fr"]=svg(r(0,0,1600,900,"#f3ece4"),r(0,620,1600,280,"#c9b8a8"),
 p("M380 230 h740 v460 h-740 z",W,'stroke="#1f1a18" stroke-width="8"'),r(420,270,260,40,"#2a3f8f"),r(420,330,200,14,L),r(420,360,240,14,L),
 r(780,300,300,180,W,0,'stroke="#1f1a18" stroke-width="5"'),*[r(800,320+k*36,260,12,L) for k in range(4)],r(860,560,220,70,M,6),
 r(1180,560,200,30,GR,6),c(1280,520,60,OK),c(1280,520,40,"#d7b04f"))
A["economie-graanakker-fr"]=svg(r(0,0,1600,900,"#f6efe2"),c(1300,180,90,OK),p("M0 520 q400 -60 800 -20 t800 -10 V900 H0 z","#e3c26b"),
 *[p(f"M{x} 900 q20 -260 0 -380","none",'stroke="#c9a24a" stroke-width="6"')+e(x+4,520+(x%40),10,26,"#c9a24a") for x in range(40,1600,55)],
 p("M0 520 q400 -60 800 -20 t800 -10 V560 q-400 30 -800 0 t-800 0 z","#d7b04f"),r(200,380,180,120,M),p("M190 390 L290 320 L390 390 Z",MD))
A["economie-pensioenbrief-twee-landen-nl"]=svg(r(0,0,1600,900,"#f3ece4"),r(0,620,1600,280,"#c9b8a8"),
 p("M250 240 h560 v380 h-560 z",W,'stroke="#1f1a18" stroke-width="8"'),p("M250 240 l280 200 l280 -200","none",'stroke="#1f1a18" stroke-width="8"'),r(680,270,90,110,"#ae1c28",4),r(696,290,58,70,W),r(705,305,40,40,"#21468b"),
 p("M820 280 h560 v380 h-560 z",W,'stroke="#1f1a18" stroke-width="8"'),p("M820 280 l280 200 l280 -200","none",'stroke="#1f1a18" stroke-width="8"'),r(1250,310,90,110,"#2a3f8f",4),r(1266,330,58,70,W),r(1275,345,40,40,M),
 c(800,760,70,OK),c(800,760,48,"#d7b04f"))
A["economie-bankzaken-twee-landen-nl"]=svg(r(0,0,1600,900,"#eef0f4"),r(0,640,1600,260,"#c9b8a8"),
 r(280,240,520,330,"#21468b",26),r(280,320,520,50,I),r(330,430,90,70,OK,10),r(470,460,250,20,"#7d9ad6"),
 r(820,300,520,330,M,26),r(820,380,520,50,I),r(870,490,90,70,OK,10),r(1010,520,250,20,"#c97a7a"),
 *[c(560+i*90,760,34,"#d7b04f") for i in range(5)])
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
