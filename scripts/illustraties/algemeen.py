from teken import *
A={}
# 1 gemeentehuis
A["algemeen-gemeentehuis-fr"]=svg(wolk(300,130),wolk(1150,110,.8),grond(690),
 r(450,300,700,400,ZA),p("M420 310 L800 200 L1180 310 Z",GR),r(760,140,80,90,ZA),p("M750 145 L800 110 L850 145 Z",GR),c(800,185,24,W),
 *[raam(500+i*130,360) for i in range(5)],r(740,520,120,180,I),*[raam(500+i*130,520,70,110) for i in (0,1,3,4)],
 r(795,40,8,110,GR),r(803,45,30,50,"#2a3f8f"),r(833,45,30,50,W),r(863,45,30,50,M),
 p("M700 700 h200 l40 30 h-280 z",L),boom(250,700,.9),boom(1350,700,.9,GL),figuur(1000,780,.6))
# 2 huisarts: groot hoofdobject (dokterstas en stethoscoop op het bureau)
A["algemeen-huisarts-fr"]=svg(r(0,0,1600,900,"#eef3ef"),r(1100,120,380,300,"#dde7df"),r(1115,135,350,270,W),boom(1290,405,.7,GL),
 r(0,560,1600,340,"#c9b8a8"),r(0,560,1600,24,"#a89a88"),
 p("M260 560 q0 -170 60 -200 h420 q60 30 60 200 z",M),r(300,330,440,40,MD,14),p("M440 330 q0 -70 80 -70 q80 0 80 70","none",'stroke="#5c0000" stroke-width="22"'),r(505,420,30,90,W),r(475,450,90,30,W),
 p("M880 520 q-40 -260 130 -300 q170 -30 190 160","none",'stroke="#1f1a18" stroke-width="18" stroke-linecap="round"'),
 p("M1200 380 q10 120 -60 160","none",'stroke="#1f1a18" stroke-width="18" stroke-linecap="round"'),c(1140,545,46,GR),c(1140,545,26,W),
 c(880,522,18,I),c(1200,380,16,I),r(100,500,80,60,G,8),e(140,490,50,20,GL))
# 3 ziekenhuis
A["algemeen-ziekenhuis-fr"]=svg(wolk(250,120),grond(700),r(300,220,1000,480,W,0,'stroke="#e7dfd8" stroke-width="6"'),r(300,220,1000,40,L),
 *[raam(350+i*120,300+j*120,80,70,"#b8c9cf") for i in range(8) for j in range(3)],r(700,560,200,140,I),r(650,520,300,40,M),
 r(760,150,80,80,W),r(788,158,24,64,M),r(768,178,64,24,M),r(790,220,20,0,W),
 p("M1310 700 h220 v-120 q-20 -50 -80 -50 h-140 z",W,'stroke="#1f1a18" stroke-width="5"'),r(1340,600,100,40,M),c(1350,705,30,I),c(1490,705,30,I),boom(150,700,.9))
# 4 apotheek
A["algemeen-apotheek-fr"]=svg(grond(720),r(250,180,1100,540,ZA),r(250,180,1100,60,GR),r(330,330,420,300,"#b8c9cf"),r(330,330,420,300,"none",0,'stroke="#1f1a18" stroke-width="8"'),
 r(850,330,180,390,G),r(870,350,140,180,"#b8c9cf"),
 r(1130,260,170,170,G,12),r(1190,280,50,130,"#7fd18a"),r(1150,320,130,50,"#7fd18a"),r(1210,430,10,60,GR),
 *[r(360+i*80,520,50,60,[M,W,OK,G][i%4],4) for i in range(5)],*[r(360+i*80,430,50,50,[W,M,G,OK][i%4],4) for i in range(5)],figuur(1150,800,.6,GR))
# 5 school
A["algemeen-school-fr"]=svg(wolk(1200,120),grond(700),r(350,260,900,440,"#e9d9c2"),p("M320 270 L800 150 L1280 270 Z",M),
 *[raam(420+i*140,340,90,120) for i in range(6)],r(740,520,120,180,I),r(760,200,80,60,W),c(800,230,22,"none")+'<circle cx="800" cy="230" r="22" fill="none" stroke="#1f1a18" stroke-width="5"/>',
 r(100,560,250,140,G),r(1250,600,300,20,GR),*[figuur(400+i*70,800,.35+0.05*(i%2),[I,GR][i%2]) for i in range(4)],r(1300,520,10,80,GR),c(1305,515,25,OK))
# 6 gendarmerie
A["algemeen-gendarmerie-fr"]=svg(grond(690),r(200,250,700,440,ZA),*[raam(260+i*150,320,80,110) for i in range(4)],r(500,500,120,190,I),r(200,230,700,30,GR),
 p("M950 700 v-190 q0 -40 40 -40 h360 q60 0 90 60 l60 80 v90 z","#24386e"),r(1000,500,150,70,"#b8c9cf"),r(1180,500,140,70,"#b8c9cf"),r(950,620,500,12,W),
 r(1150,445,60,25,"#3f6fd1",6),c(1030,710,42,I),c(1380,710,42,I),c(1030,710,18,GR),c(1380,710,18,GR),boom(120,690,.8,GL))
# 7 bakkerij dorp
A["algemeen-bakkerij-dorp-fr"]=svg(grond(720),r(250,200,1100,520,"#eadfce"),r(250,180,1100,40,GR),r(330,300,380,140,M),r(330,300,380,30,MD),
 r(350,460,340,240,"#f3e6c8"),*[e(420+i*80,560,30,12,"#c8924a") for i in range(4)],*[p(f"M{380+i*90} 640 q40 -30 80 0 z","#c8924a") for i in range(3)],
 r(800,380,140,340,G),r(820,400,100,160,"#b8c9cf"),*[luik(1050+i*160,330) for i in range(2)],figuur(1000,820,.6),p("M1035 700 l40 -10 l20 30 z","#c8924a"))
# 8 postkantoor dorp
A["algemeen-postkantoor-dorp-fr"]=svg(wolk(350,110),grond(710),r(450,260,700,450,ZA),p("M420 270 L800 180 L1180 270 Z",GR),*[luik(530+i*190,330) for i in range(3)],
 r(720,520,160,190,"#2a3f8f"),r(300,540,90,170,OK,10),r(315,560,60,12,I),boom(1350,710,.8),figuur(1000,790,.55,GR))
# 9 consulaat: paspoort groot op de voorgrond, gebouw klein erachter
A["algemeen-consulaat-paspoort-nl"]=svg(r(0,0,1600,900,W),r(0,520,1600,380,B),
 r(900,250,560,270,W,0,'stroke="#e7dfd8" stroke-width="5"'),*[r(930+i*100,250,26,270,L) for i in range(6)],r(900,230,560,26,GR),r(1140,420,80,100,I),
 r(1400,90,6,140,GR),r(1406,95,90,20,"#ae1c28"),r(1406,115,90,20,W,0,'stroke="#e7dfd8" stroke-width="2"'),r(1406,135,90,20,"#21468b"),
 p("M180 300 l420 -80 l90 470 l-420 80 z",M),p("M195 312 l400 -76","none",'stroke="#5c0000" stroke-width="6"'),
 c(440,450,70,"none")+'<circle cx="440" cy="450" r="70" fill="none" stroke="#e3c26b" stroke-width="10"/>',c(440,450,24,OK),
 p("M330 640 l200 -38","none",'stroke="#e3c26b" stroke-width="10"'),p("M310 330 l240 -46","none",'stroke="#e3c26b" stroke-width="10"'),boom(820,520,.6))
# 10 verhuisdozen emigratie (nl)
A["algemeen-verhuisdozen-emigratie-nl"]=svg(wolk(1250,120),grond(690),r(200,250,600,440,"#d9c7b1"),p("M180 260 L500 150 L820 260 Z","#9a3b2a"),luik(280,330),luik(560,330),r(440,520,110,170,G),
 *[r(860+x,y,w,h,"#c8924a",4,'stroke="#8a6a3d" stroke-width="4"') for x,y,w,h in [(0,610,150,120),(160,640,130,90),(40,510,120,100),(180,560,100,80)]],
 p("M1150 730 v-110 q0 -30 30 -30 h200 q50 0 80 50 l30 40 v50 z",GR),r(1180,600,90,50,"#b8c9cf"),r(1290,600,80,50,"#b8c9cf"),r(1420,690,70,26,OK,3),c(1220,735,30,I),c(1440,735,30,I),figuur(1080,800,.55,GR))
import json
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
