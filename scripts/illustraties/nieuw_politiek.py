from teken import *
A={}
TRI=lambda x,y,w=40,h=50: r(x,y,w,h,"#2a3f8f")+r(x+w,y,w,h,W)+r(x+2*w,y,w,h,M)
A["politiek-rechtszaal-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,640,1600,260,"#a8743f"),*[r(120+i*280,80,40,560,ZA) for i in range(6)],
 r(520,330,560,310,"#7a532c"),r(500,310,600,30,"#5c3b1e"),r(620,200,360,130,M),c(800,250,40,OK),
 r(250,520,220,120,"#8a6a4a"),r(1130,520,220,120,"#8a6a4a"),figuur(800,330,.6,I),figuur(360,520,.5,GR),figuur(1240,520,.5,GR),
 *[lijn(f"M0 {660+k*60} h1600","#7a532c",2) for k in range(4)])
A["politiek-gerechtshof-trappen-fr"]=svgo(wolk(260,110),r(0,760,1600,140,B),
 *[r(300-k*40,620+k*35,1000+k*80,35,[ZA,"#e9dcc8"][k%2]) for k in range(4)],r(350,280,900,340,"#e9dcc8"),p("M320 290 L800 150 L1280 290 Z","#d6c7b4"),
 *[r(390+i*140,300,50,320,W) for i in range(7)],c(800,220,30,OK),r(760,460,80,160,I),figuur(1350,800,.6,GR),lantaarn(200,760))
A["politiek-campagnepodium-fr"]=svgo(r(0,0,1600,900,"#2a3f8f"),*[c(200+i*300,120,90,"#3a52a8") for i in range(5)],r(0,620,1600,280,"#1f2d5c"),
 r(560,420,480,220,W),r(560,420,480,40,M),r(780,320,40,100,GR),*[e(780+i*20,315,14,20,I) for i in range(3)],
 *[figuur(150+i*160,900,.9,[I,GR][i%2]) for i in range(3)],*[figuur(1100+i*160,900,.9,[GR,I][i%2]) for i in range(3)],
 *[r(120+i*290,500,90,60,[W,M,OK,W,M,OK][i],4) for i in (0,1,4,5)])
A["politiek-peilingsgrafiek-fr"]=svgo(r(0,0,1600,900,"#f3ece4"),r(300,140,1000,600,W,10),
 *[lijn(f"M340 {220+k*110} h920","#e7dfd8",2) for k in range(5)],
 *[r(400+i*170,720-h,110,h,[M,"#2a3f8f",G,OK,GR][i]) for i,h in enumerate([380,300,250,170,120])],
 lijn("M380 520 Q700 360 1000 420 T1260 300",M,8),r(300,740,1000,14,I))
A["politiek-congreszaal-burgemeesters-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,0,1600,140,"#d6c7b4"),r(400,170,800,300,"#cfdbe5"),r(420,190,760,260,"#e7eef1"),
 c(800,320,70,"#2a3f8f"),*[e(800+90*__import__('math').cos(k*.52),320+90*__import__('math').sin(k*.52),10,10,OK) for k in range(12)],
 r(650,500,300,90,M),*[figuur(120+(i%14)*105,780+(i//14)*80,.55,[I,GR,M][i%3]) for i in range(14)],
 *[p(f"M{120+i*105} {660} l-20 20 l20 20 l20 -20 z","#2a3f8f") for i in range(0,14,3)])
A["politiek-debatstudio-fr"]=svgo(r(0,0,1600,900,"#1f2d3a"),*[lijn(f"M{x} 0 l-200 900","#2c3e50",6) for x in range(200,1800,200)],r(0,640,1600,260,"#2c3e50"),
 r(300,480,280,160,"#2a3f8f"),r(1020,480,280,160,M),r(380,440,10,40,I),r(1100,440,10,40,I),figuur(440,640,.8,W),figuur(1160,640,.8,W),
 r(700,520,200,120,GR),r(560,150,480,240,"#3a6ea5",10),*[r(600+i*80,200,50,140,"#7fb0e0") for i in range(5)],c(1450,180,40,OK),lijn("M1450 220 l-80 240","#e3c26b",6))
A["politiek-onderhandelingstafel-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,0,1600,120,"#d6c7b4"),*[r(140+i*230,40,8,200,GR)+r(148+i*230,45,70,46,c2) for i,c2 in enumerate(["#2a3f8f",M,G,OK,"#2a3f8f",M,G])],
 e(800,620,620,160,"#7a532c"),e(800,600,600,150,"#a8743f"),*[r(260+i*180,560,90,60,W,4)+r(300+i*180,530,8,30,I) for i in range(7)],
 *[figuur(300+i*180,520,.45,I) for i in range(7)],*[c(380+i*180,600,14,"#cfe3ee") for i in range(6)])
A["politiek-presidentsvliegtuig-rode-loper-fr"]=svgo(r(0,0,1600,900,"#e7eef1"),wolk(300,100),r(0,600,1600,300,"#9a9188"),
 p("M200 520 h900 q100 0 140 40 q-40 40 -140 40 h-900 q-40 -40 0 -80 z",W),r(200,560,1040,16,"#2a3f8f"),p("M600 520 l160 -140 h70 l-80 140 z","#2a3f8f"),p("M600 600 l160 120 h70 l-80 -120 z","#2a3f8f"),
 p("M220 520 l-50 -100 h60 l70 100 z","#2a3f8f"),*[c(400+i*70,550,10,"#b8c9cf") for i in range(9)],
 p("M820 600 l60 -40 l30 0 l-60 40 z",GR),p("M880 600 L1400 900 H1250 L840 610 z",M),*[figuur(1320+i*80,880,.5,I) for i in range(3)])
A["politiek-eu-top-vlaggenrij-fr"]=svgo(r(0,0,1600,900,"#eef1f4"),r(0,680,1600,220,"#c9cdd1"),r(200,300,1200,380,"#cfdbe5"),*[r(200,330+k*50,1200,4,"#b0c2d0") for k in range(7)],r(700,540,200,140,I),
 *[r(120+i*140,140,6,540,GR)+r(126+i*140,150,80,52,c2) for i,c2 in enumerate(["#2a3f8f",M,G,OK,"#2a3f8f",W,M,G,OK,"#2a3f8f",M])],
 *[c(166+140*5+20*__import__('math').cos(k*.52),176+20*__import__('math').sin(k*.52),3,OK) for k in range(12)])
A["politiek-grondwet-boek-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,620,1600,280,"#7a532c"),
 p("M380 600 q210 -60 420 0 v-360 q-210 -60 -420 0 z",W),p("M800 600 q210 -60 420 0 v-360 q-210 -60 -420 0 z",W),lijn("M800 240 v360",GR,4),
 *[lijn(f"M440 {300+k*40} q160 -30 300 0",L,4) for k in range(7)],*[lijn(f"M860 {300+k*40} q160 -30 300 0",L,4) for k in range(7)],
 r(560,250,80,6,M),c(1000,280,20,M),r(1250,480,180,140,"#2a3f8f",8),r(1300,440,80,40,I,6))
A["politiek-huiszoeking-dossiers-fr"]=svgo(r(0,0,1600,900,"#e9e2d8"),r(0,640,1600,260,"#c9b8a8"),
 *[r(150+i*200,160,170,480,GR,6)+''.join(r(165+i*200,180+k*110,140,90,"#8a7b6c",4)+r(215+i*200,215+k*110,40,14,W) for k in range(4)) for i in range(3)],
 *[r(800+i*170,520,150,120,"#c8924a",4)+r(830+i*170,560,90,40,W) for i in range(3)],*[p(f"M{820+i*80} 500 l40 -60 h120 l-40 60 z","#e3c26b") for i in range(3)],
 figuur(1450,800,.7,I),r(1400,620,100,30,"#2a3f8f",4))
A["politiek-spanje-parlement-fr"]=svgo(wolk(280,110),r(0,700,1600,200,B),r(300,300,1000,400,"#e9dcc8"),p("M560 300 L800 200 L1040 300 Z","#d6c7b4"),
 *[r(600+i*100,320,40,380,W) for i in range(5)],r(760,560,80,140,I),c(450,640,60,"#8a6a4a"),c(1150,640,60,"#8a6a4a"),r(420,520,60,60,"#a89a88"),r(1120,520,60,60,"#a89a88"),
 r(795,100,6,110,GR),r(801,105,100,24,"#c60b1e"),r(801,129,100,40,"#ffc400"),r(801,169,100,24,"#c60b1e"))
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
