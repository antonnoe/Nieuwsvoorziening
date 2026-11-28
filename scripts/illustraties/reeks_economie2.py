# Twee economiebeelden (28-11-2026): loonstrook (loon en salaris) en dalende grafiek (krimp, recessie).
# Draaien vanuit public/illustraties: PYTHONPATH=../../scripts/illustraties python3 ../../scripts/illustraties/reeks_economie2.py
from teken import *
A={}
A["economie-loonstrook-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,660,1600,240,"#a8743f"),
 # envelop (achter)
 r(840,380,480,300,"#e3d6c6",10),p("M840 390 L1080 560 L1320 390","none",'stroke="#1f1a18" stroke-width="5"'),p("M840 680 L1020 520 M1320 680 L1140 520","none",'stroke="#1f1a18" stroke-width="3"'),
 # loonstrook
 r(320,130,520,590,W,6),r(360,170,440,56,"#2a3f8f",4),r(360,254,200,16,L),r(360,284,280,16,L),
 *[r(360,330+k*46,300,14,L)+r(700,330+k*46,100,14,"#d9cdbf") for k in range(5)],
 r(360,590,440,90,M,8),r(400,620,160,16,W),r(630,612,130,32,OK,6),
 # kalender
 r(1130,110,330,280,W,14),r(1130,110,330,64,M,14),r(1130,150,330,24,M),
 *[r(1155+i*60,200+j*58,44,40,"#e7dfd8" if (i,j)!=(3,1) else G,6) for i in range(5) for j in range(3)],
 # munten
 *[e(1420,y,90,26,"#d7b04f") for y in (640,610,580)],e(1420,550,90,26,OK),c(1100,640,48,"#d7b04f"),c(1100,640,32,OK),c(1210,660,42,"#d7b04f"),c(1210,660,28,OK))
A["economie-dalende-grafiek-fr"]=svgo(r(0,0,1600,900,"#eef0f2"),r(0,700,1600,200,"#d9cdbf"),
 # bord op poten
 r(380,140,860,560,"#c9cdd1",16),r(410,170,800,500,W,8),r(480,700,26,160,GR),r(1110,700,26,160,GR),
 lijn("M470 600 h680",GR,6),lijn("M470 600 V230",GR,6),
 *[r(520+i*120,600-h,80,h,M if i<4 else MD,4) for i,h in enumerate([340,290,220,150,80])],
 lijn("M520 210 L1030 440","#c0392b",18),p("M1036 390 L1000 474 L1115 476 Z","#c0392b"),
 # fabriek
 p("M1300 700 V520 l80 -50 v50 l80 -50 v50 l80 -50 V700 z",GR),r(1330,380,36,140,M),e(1348,360,46,20,"#d6cec6"),e(1380,330,34,16,"#d6cec6"),*[r(1350+i*70,580,34,50,"#c9b8a8") for i in range(3)])
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
