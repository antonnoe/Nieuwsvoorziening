from teken import *
A={}
TRI=lambda x,y,w=40,h=50: r(x,y,w,h,"#2a3f8f")+r(x+w,y,w,h,W,0,'stroke="#e7dfd8" stroke-width="3"')+r(x+2*w,y,w,h,M)
A["politiek-parlement-fr"]=svgo(r(0,0,1600,900,"#f3ece4"),
 *[p(f"M{800-(260+i*90)} 820 A{260+i*90} {150+i*55} 0 0 1 {800+(260+i*90)} 820","none",f'stroke="{[M,MD,M,MD,M][i]}" stroke-width="44"') for i in range(5)],
 r(720,640,160,180,GR),r(700,620,200,30,I),*[r(150+i*300,120,40,260,L) for i in range(5)],r(100,100,1400,30,GR))
A["politiek-elysee-fr"]=svgo(wolk(250,110),grond(700),r(350,330,900,370,W,0,'stroke="#e7dfd8" stroke-width="5"'),r(330,300,940,40,L),
 *[raam(400+i*120,380,70,120,"#b8c9cf") for i in range(7)],*[raam(400+i*120,540,70,120,"#b8c9cf") for i in range(7)],r(740,520,120,180,I),
 r(150,690,1300,14,GR),*[r(150+i*65,640,8,60,GR) for i in range(21)],r(795,180,6,130,GR),TRI(801,185),boom(200,620,.6),boom(1400,620,.6))
A["politiek-senaat-fr"]=svgo(grond(720),r(250,300,1100,420,"#e3d6c6"),p("M650 300 q150 -160 300 0 z",GR),
 *[r(300+i*110,340,40,380,L) for i in range(10)],r(740,560,120,160,I),*[e(250+i*300,820,60,20,G) for i in range(5)],r(795,60,6,80,GR),TRI(801,62,30,36))
A["politiek-stembus-fr"]=svgo(r(0,0,1600,900,"#f3ece4"),r(0,640,1600,260,"#c9b8a8"),
 r(560,280,480,380,"#dfeaf0",14,'stroke="#1f1a18" stroke-width="10"'),r(540,260,520,40,I,8),r(720,272,160,10,W),
 p("M760 250 l90 -150 l40 25 l-90 150 z",W,'stroke="#1f1a18" stroke-width="6"'),
 r(1150,200,260,460,GR),r(1150,200,260,40,I),p("M1170 240 q60 150 0 420","none",'stroke="#800000" stroke-width="40"'),figuur(1330,700,.9))
A["politiek-prefectuur-fr"]=svgo(wolk(1300,100),grond(700),r(300,250,1000,450,"#e9dcc8"),p("M260 260 L800 140 L1340 260 Z","#8a7b6c"),
 *[raam(360+i*120,310,70,120) for i in range(8)],*[raam(360+i*120,480,70,110) for i in (0,1,2,5,6,7)],r(720,470,160,230,I),r(680,440,240,30,GR),
 r(150,700,1300,20,GR),*[r(150+i*100,640,10,70,I) for i in range(14)],r(795,60,6,90,GR),TRI(801,62,30,36))
A["politiek-demonstratie-fr"]=svgo(r(0,0,1600,900,"#f3ece4"),r(0,620,1600,280,"#d9cdbf"),*[r(100+i*300,250,200,370,ZA) for i in range(5)],
 *[figuur(180+i*95,800+(i%3)*20,.75+.08*(i%2),[I,GR,MD][i%3]) for i in range(14)],
 *[r(170+i*190,500,10,170,GR)+r(110+i*190,450,130,70,[M,W,OK,G,M,W,OK][i%7],4,'stroke="#1f1a18" stroke-width="4"') for i in range(7)])
A["politiek-wetboek-fr"]=svgo(r(0,0,1600,900,"#f3ece4"),r(0,600,1600,300,"#a89a88"),
 r(420,280,700,340,M,14),r(420,280,60,340,MD,14),r(470,610,640,24,W),r(470,595,640,15,L),
 c(800,440,70,"none")+'<circle cx="800" cy="440" r="70" fill="none" stroke="#e3c26b" stroke-width="10"/>',r(780,420,40,40,OK),
 r(1180,360,220,250,GR,10),r(1180,330,220,40,I,10),r(1220,250,140,90,"#c9b8a8"))
A["politiek-burgemeester-sjerp-fr"]=svgo(r(0,0,1600,900,"#eef0f4"),r(0,700,1600,200,B),r(1050,180,420,520,ZA),r(1110,250,110,160,GR),r(1290,250,110,160,GR),r(1200,500,120,200,I),
 c(600,220,80,I),p("M450 330 q150 -60 300 0 l60 470 h-420 z",I),
 p("M470 360 L760 640 L780 600 L500 330 Z","#2a3f8f"),p("M490 340 L780 610 L790 580 L520 320 Z",W),p("M520 330 L790 590 L790 560 L545 320 Z",M),c(780,640,26,OK))
A["politiek-eu-gebouw-fr"]=svgo(wolk(300,120),grond(710),r(300,240,1000,470,"#cfdbe5"),*[r(300,280+i*60,1000,6,"#b0c2d0") for i in range(7)],
 r(700,560,200,150,I),*[r(420+i*160,40,6,200,GR)+r(426+i*160,45,90,60,"#2a3f8f") for i in range(5)],
 *[c(471+i*160+16*__import__('math').cos(k*0.52),75+16*__import__('math').sin(k*0.52),3,OK) for i in range(5) for k in range(12)])
A["politiek-briefstem-buitenland-nl"]=svgo(r(0,0,1600,900,"#f3ece4"),r(0,620,1600,280,"#c9b8a8"),
 p("M300 260 h700 v420 h-700 z",W,'stroke="#1f1a18" stroke-width="8"'),p("M300 260 l350 240 l350 -240","none",'stroke="#1f1a18" stroke-width="8"'),
 r(860,290,100,120,"#ae1c28",4),r(880,310,60,80,W),r(890,330,40,40,"#21468b"),
 p("M1080 220 l300 -40 l40 330 l-300 40 z",W,'stroke="#1f1a18" stroke-width="6"'),r(1150,300,40,40,"none",0,'stroke="#1f1a18" stroke-width="6"'),p("M1150 320 l15 15 l30 -40","none",'stroke="#800000" stroke-width="10"'),
 *[r(1220,300+j*70,140,10,L) for j in range(3)])
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
