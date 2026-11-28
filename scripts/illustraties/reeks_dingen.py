from teken import *
A={}
def lucht(c="#e7eef1"): return r(0,0,1600,900,c)
def binnen(c="#efe6da",v="#c9b8a8"): return r(0,0,1600,900,c)+r(0,700,1600,200,v)
# verkeer
A["verkeer-stoplicht-fr"]=svgo(lucht(),r(0,660,1600,240,"#9a9188"),*[r(x,660,80,240,W) for x in range(200,1400,160)],r(760,140,80,520,GR),r(700,140,200,400,I,20),
 c(800,220,50,"#5a2a2a"),c(800,340,50,"#5a4a2a"),c(800,460,50,"#2f9e6a"),boom(200,660,.8),r(1100,300,300,360,"#e3d6c6"),kozijn(1160,360),kozijn(1290,360))
A["verkeer-oversteekplaats-fr"]=svgo(lucht(),r(0,560,1600,340,"#9a9188"),r(0,520,1600,40,"#c9b8a8"),*[r(300+k*0,600+k*60,1000,36,W) for k in range(5)],
 *[figuur(x,y,.7,c2) for x,y,c2 in [(600,760,I),(800,820,GR),(1000,700,M)]],r(1350,300,20,240,GR),r(1300,240,120,90,"#2a3f8f",6),r(1340,260,40,50,W))
A["verkeer-bromfiets-fr"]=svgo(lucht("#f6efe2"),r(0,640,1600,260,"#9a9188"),
 c(520,640,90,I),c(520,640,40,GR),c(1060,640,90,I),c(1060,640,40,GR),p("M520 640 L640 480 h260 l120 160 M900 480 l40 -120 h80",M),p("M600 560 h340 l40 -80 h-320 z",M),
 r(700,400,180,60,I,20),c(980,350,30,OK))
A["verkeer-landweg-platanen-fr"]=svgo(lucht("#f6efe2"),p("M0 500 q800 -40 1600 0 V900 H0 z","#bfcfa9"),p("M720 500 h160 L1300 900 H300 z","#9a9188"),lijn("M800 500 L800 900","#e3c26b",6),
 *[r(x,y-h,w,h,"#c9bfa8")+e(x+w/2,y-h-w*1.6,w*3.2,w*2,"#5d7a4f") for x,y,h,w in [(640,520,60,10),(560,580,120,16),(440,680,200,24),(260,820,320,34),(940,520,60,10),(1020,580,120,16),(1130,680,200,24),(1300,820,320,34)]])
A["verkeer-vrachtwagen-fr"]=svgo(lucht(),r(0,660,1600,240,"#9a9188"),lijn("M0 760 h1600",W,6),
 r(200,360,900,300,W),r(200,360,900,30,M),p("M1100 660 v-260 h180 q60 0 90 60 l40 80 v120 z","#2a3f8f"),r(1140,420,140,90,"#9fb6bf"),
 *[c(x,670,55,I)+c(x,670,24,GR) for x in (320,480,900,1300)])
A["verkeer-laadpaal-fr"]=svgo(lucht(),r(0,660,1600,240,"#c9b8a8"),r(400,300,160,400,W,16),r(420,340,120,80,"#16323f",8),r(450,360,60,40,"#2f9e6a"),p("M480 460 l-20 40 h30 l-20 40","none",'stroke="#2f9e6a" stroke-width="8"'),
 lijn("M540 500 q120 60 200 0 q60 -40 120 20",I,10),p("M760 660 v-90 q0 -40 50 -50 l60 -60 h240 l80 60 q80 10 80 60 v80 z","#3d7a47"),r(900,480,140,60,"#9fb6bf"),c(850,670,44,I),c(1180,670,44,I))
# klussen
A["algemeen-klus-stoppenkast-fr"]=svgo(binnen(),r(500,140,600,520,"#d6dbe0",10),r(530,170,540,460,"#eef1f4",6),*[r(570+i*80,220+j*140,50,90,W,4)+r(580+i*80,250+j*140,30,30,[I,"#2f9e6a"][i%2]) for i in range(6) for j in range(3)],
 r(980,240,60,120,M,6),lijn("M560 640 v60 M1040 640 v60",GR,10))
A["algemeen-klus-stopcontact-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(560,240,480,420,W,40),r(600,280,400,340,"#f3ece4",200),c(720,450,30,I),c(880,450,30,I),r(785,520,30,40,"#c9cdd1"),
 lijn("M1100 480 q100 0 140 120 t140 200",I,10),r(1260,560,120,60,W,10))
A["algemeen-klus-loodgieter-fr"]=svgo(binnen("#eef1f4"),r(400,300,800,400,W),r(380,280,840,30,"#c9cdd1"),r(520,380,560,320,"#e3d6c6"),lijn("M800 380 v160 q0 60 60 60 h80",GR,20),
 p("M880 260 q0 -80 80 -80 h40",GR),figuur(520,760,.9,"#2a3f8f"),lijn("M600 560 l120 -40",GR,14),r(700,500,60,40,M,6))
A["algemeen-klus-lekkage-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,0,1600,160,"#e3d6c6"),e(800,170,260,60,"#c9b8a8"),*[e(x,y,10,16,"#7fb0d0") for x,y in [(760,260),(820,330),(790,420),(830,520)]],
 p("M640 760 q160 -80 320 0 z","#9fc3d0"),r(620,640,360,120,"#9aa3aa",10),e(800,640,180,24,"#c9cdd1"),r(0,760,1600,140,"#c9b8a8"))
A["algemeen-klus-badkamer-fr"]=svgo(binnen("#eef3f4","#dfe7ea"),*[lijn(f"M0 {y} h1600","#d6e0e4",3) for y in range(80,700,80)],*[lijn(f"M{x} 0 v700","#d6e0e4",3) for x in range(80,1600,80)],
 p("M200 520 h700 v120 q0 60 -60 60 h-580 q-60 0 -60 -60 z",W),r(200,500,700,30,W),lijn("M250 500 v-160 q0 -40 40 -40 h40",GR,10),
 r(1100,200,300,500,"#cfe0e6"),lijn("M1250 200 v-40 h80",GR,10),e(1330,190,40,14,GR),r(1000,520,60,180,W))
A["algemeen-klus-keuken-fr"]=svgo(binnen("#efe6da","#c9b8a8"),r(200,460,1200,240,"#a8743f"),r(180,440,1240,30,"#e3d6c6"),*[r(240+i*290,500,260,180,"#c8924a",6)+c(370+i*290,520,8,I) for i in range(4)],
 r(200,120,1200,200,"#a8743f"),*[r(240+i*290,140,260,160,"#c8924a",6) for i in range(4)],r(700,380,200,60,"#c9cdd1"),lijn("M800 380 v-50 h40",GR,8),e(1150,420,70,18,"#6f6660"))
A["algemeen-klus-zolderisolatie-fr"]=svgo(r(0,0,1600,900,"#efe6da"),p("M0 900 L800 120 L1600 900 z","#c9a27a"),p("M100 900 L800 220 L1500 900 z","#e3d6c6"),
 *[lijn(f"M{800-k*140} {220+k*136} L{800+k*140} {220+k*136}","#a8743f",10) for k in range(1,6)],
 *[e(x,y,60,24,"#e9c46a") for x,y in [(500,700),(620,710),(740,700),(860,712),(980,700),(1100,710),(560,760),(700,770),(840,760),(980,770)]],figuur(1250,880,.7,"#e9a23b"))
A["algemeen-klus-warmtepomp-fr"]=svgo(lucht(),r(0,700,1600,200,"#c9b8a8"),r(200,140,700,560,"#e3d6c6"),kozijn(300,240),kozijn(600,240),
 r(950,420,500,280,W,12),c(1140,560,110,"#c9cdd1"),*[lijn(f"M{1140} 560 l{90*__import__('math').cos(k*1.05)} {90*__import__('math').sin(k*1.05)}",GR,10) for k in range(6)],
 *[lijn(f"M1290 {460+k*30} h120",GR,6) for k in range(7)],lijn("M900 600 h50",GR,12))
A["algemeen-klus-dubbel-glas-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(400,140,800,600,"#e3d6c6"),r(460,200,680,480,W),r(480,220,310,440,"#cfe3ee"),r(810,220,310,440,"#cfe3ee"),
 r(500,240,290,420,"#e3eef5"),r(830,240,290,420,"#e3eef5"),lijn("M560 280 l120 120 M890 280 l120 120",W,10),r(380,740,840,30,"#c9b8a8"),boom(1400,740,.8))
A["algemeen-klus-zonnepanelen-fr"]=svgo(lucht(),c(1350,160,70,OK),r(0,720,1600,180,"#bfcfa9"),r(300,420,900,300,"#e3d6c6"),p("M260 430 L750 160 L1240 430 Z","#9a3b2a"),
 *[p(f"M{460+i*150} {360-0} l130 0 l60 -80 l-130 0 z","#2a3f8f",'transform="translate(0,0)"') for i in range(4)],*[lijn(f"M{525+i*150} 360 l30 -80","#7d9ad6",3) for i in range(4)],
 kozijn(400,500),kozijn(1000,500),r(700,560,100,160,G))
A["algemeen-klus-energielabel-dpe-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(380,120,840,660,W,12),
 *[r(440,160+k*80,260+k*80,64,c2,4)+p(f"M{700+k*80} {160+k*80} l40 32 l-40 32 z",c2) for k,c2 in enumerate(["#2f9e6a","#5cb85c","#a6c94a","#f2d04a","#f0a43a","#e8743a","#d9442e"])],
 p("M1180 400 h-80 l-30 32 l30 32 h80 z",I))
A["algemeen-klus-metselen-fr"]=svgo(binnen("#f3ece4"),*[r(300+(i%6)*150+((i//6)%2)*75,640-(i//6)*60,140,52,"#c47a4a",2) for i in range(30) if not (i//6==4 and i%6>3)],
 figuur(1350,800,1.2,"#e9a23b"),p("M1290 450 q60 -60 120 0 v14 h-120 z",OK),p("M1180 560 l120 -60 l20 20 l-110 70 z","#9aa3aa"),r(160,620,120,80,"#9aa3aa",6))
A["algemeen-klus-natuurstenen-muur-fr"]=svgo(binnen("#f3ece4","#bfcfa9"),
 *[p(f"M{x} {y} q{w/2} -14 {w} 0 l-6 {h} q{-w/2} 10 {-w+12} 0 z",["#c9b8a8","#b8a48a","#d6c7b4"][(i+j)%3]) for j,y in enumerate(range(260,700,70)) for i,(x,w,h) in enumerate([(200+(k*170)+(j%2)*60,160,60) for k in range(7)])],
 lijn("M1300 300 l80 -60",I,8),p("M1370 230 l60 -20 l-20 60 z","#9aa3aa"))
A["algemeen-klus-tegelvloer-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,0,1600,300,"#e3d6c6"),p("M0 300 h1600 v600 h-1600 z","#d98a6a"),
 *[lijn(f"M{800+(k-8)*60} 300 L{800+(k-8)*200} 900","#b0603a",4) for k in range(17)],*[lijn(f"M0 {300+y} h1600","#b0603a",4) for y in (60,140,240,370,520)],
 figuur(1200,800,1.0,GR),r(1000,700,120,60,"#9aa3aa",6))
# gelegenheden
A["toerisme-restaurant-fr"]=svgo(lucht("#f6efe2"),r(0,680,1600,220,"#c9b8a8"),r(200,200,1200,480,"#e3d6c6"),p("M200 300 h1200 l40 80 h-1280 z",M),
 *[p(f"M{200+i*150} 380 q75 40 150 0 z",M) for i in range(8)],r(320,440,300,240,"#9fb6bf"),r(980,440,300,240,"#9fb6bf"),r(700,460,200,220,"#7a532c"),
 *[e(x,740,80,16,W)+r(x-6,740,12,70,GR)+r(x-60,770,30,40,"#a8743f")+r(x+30,770,30,40,"#a8743f") for x in (300,1300)])
A["toerisme-hotel-fr"]=svgo(lucht(),wolk(1250,100),r(0,720,1600,180,"#c9b8a8"),r(400,140,800,580,"#e9dcc8"),*[kozijn(460+i*140,200+j*110) for i in range(5) for j in range(4)],
 r(700,620,200,100,"#7a532c"),p("M640 620 h320 l-30 -40 h-260 z",M),r(380,620,40,100,G),r(1180,620,40,100,G),*[c(500+i*600,690,30,GL) for i in range(2)])
A["economie-bouwmarkt-fr"]=svgo(lucht(),r(0,700,1600,200,"#9a9188"),r(150,260,1300,440,"#e9a23b"),r(150,240,1300,40,"#c97f1f"),r(600,520,400,180,"#9fc3d0"),
 *[r(220+i*90,420,60,60,W) for i in range(4)],*[p(f"M{1150+i*90} 480 h60 l-10 -60 h-40 z",GR) for i in range(3)],
 p("M300 760 h160 l20 -60 h-200 z",GR),c(320,770,16,I),c(440,770,16,I),r(1200,720,220,80,"#a8743f"))
A["economie-supermarkt-fr"]=svgo(binnen("#f3f1ec","#d6d0c8"),*[r(100+i*480,200,420,500,"#e3d6c6")+''.join(r(120+i*480,230+k*110,380,8,GR)+''.join(r(130+i*480+m*60,180+k*110+50-20,40,40+((m+k)%3)*10,["#c0392b","#2f9e6a","#e3c26b","#2a3f8f","#e9a23b","#c97a9a"][(m+k+i)%6],4) for m in range(6)) for k in range(4)) for i in range(3)],
 p("M700 840 h220 l30 -120 h-280 z","#9aa3aa"),c(730,860,16,I),c(890,860,16,I))
A["economie-vismarkt-fr"]=svgo(r(0,0,1600,900,"#e9eef1"),r(0,700,1600,200,"#c9cdd1"),r(200,420,1200,280,"#e3eef3"),r(180,400,1240,30,"#9aa3aa"),p("M180 400 h1240 l-40 -120 h-1160 z","#3d6fb0"),
 *[p(f"M{x} {y} q60 -40 120 0 l40 -20 v40 l-40 -20 q-60 40 -120 0 z",["#9aa3aa","#c9cdd1","#e8a08a"][i%3]) for i,(x,y) in enumerate([(260,500),(460,520),(660,500),(860,520),(1060,500),(260,600),(460,620),(860,610),(1060,620)])],
 *[r(x,470,40,24,W,3) for x in (330,730,1130)],figuur(1300,800,.8,"#2a3f8f"))
A["toerisme-kledingmarkt-fr"]=svgo(lucht("#f6efe2"),r(0,680,1600,220,"#d9cdbf"),*[p(f"M{100+i*500} 300 h420 l-30 -80 h-360 z",[M,G,"#2a3f8f"][i])+r(110+i*500,300,10,380,GR)+r(510+i*500,300,10,380,GR)+lijn(f"M120 {330} h0",I) for i in range(3)],
 *[lijn(f"M{120+i*500} 340 h390",GR,6) for i in range(3)],*[p(f"M{150+i*500+k*70} 340 l-20 40 h20 v120 h60 v-120 h20 l-20 -40 z",["#e9a23b","#c97a9a","#7fb0d0","#e3c26b","#9fc3d0"][(k+i)%5]) for i in range(3) for k in range(5)])
# gereedschap
A["algemeen-mobiele-telefoon-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,640,1600,260,"#a8743f"),r(620,140,360,600,I,40),r(645,190,310,480,"#9fc3d0",14),
 *[r(675+i*90,230+j*100,70,70,["#2f9e6a","#e9a23b","#2a3f8f","#c0392b","#e3c26b","#7fb0d0"][(i+j)%6],14) for i in range(3) for j in range(3)],c(800,705,18,"#3a3842"))
A["algemeen-radio-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,640,1600,260,"#a8743f"),r(420,300,760,360,M,40),c(620,480,120,"#5c0000"),*[c(620,480,r_,"none") for r_ in (40,80)],
 r(800,380,300,80,"#f2d58a",10),lijn("M830 420 h240",I,3),r(940,390,8,60,M),c(860,560,30,I),c(1040,560,30,I),lijn("M1100 300 L1200 120",GR,8))
A["algemeen-schroevendraaier-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,640,1600,260,"#a8743f"),
 p("M300 560 l420 -240 q60 -30 90 20 q20 50 -40 80 l-420 240 q-60 30 -80 -20 q-20 -50 30 -80 z",M),p("M790 340 l520 -300 l20 30 l-520 300 z","#9aa3aa"),p("M1310 40 l60 -30 l-10 50 z","#6f6660"),
 *[c(x,y,8,"#c9cdd1") for x,y in [(1000,700),(1060,720),(940,730)]])
A["algemeen-boormachine-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,700,1600,200,"#a8743f"),
 p("M500 300 h500 q60 0 60 60 v80 q0 60 -60 60 h-200 l-40 260 h-160 l40 -260 h-140 q-60 0 -60 -60 v-80 q0 -60 60 -60 z","#2f6b3a"),r(560,620,240,60,I,10),
 r(1060,370,200,40,"#9aa3aa"),p("M1260 370 l120 20 l-120 20 z","#6f6660"),r(650,520,80,40,I,8),c(620,370,20,OK))
A["algemeen-gereedschapskist-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,700,1600,200,"#a8743f"),r(400,420,800,300,M,14),r(380,400,840,60,"#5c0000",14),p("M640 400 v-80 h320 v80","none",'stroke="#1f1a18" stroke-width="22"'),
 r(740,500,120,40,"#9aa3aa",6),p("M470 400 l40 -160 l30 0 l-20 160 z","#9aa3aa"),p("M1080 400 l-80 -140 l30 -16 l90 156 z","#c97f1f"))
# media
A["algemeen-sociale-media-telefoon-fr"]=svgo(r(0,0,1600,900,"#eef1f4"),r(620,120,360,660,I,40),r(645,170,310,560,W,14),
 *[c(700,240+k*140,30,["#c97a9a","#7fb0d0","#e3c26b","#2f9e6a"][k])+r(750,220+k*140,170,14,L)+r(750,250+k*140,120,14,L)+r(680,290+k*140,240,50,"#e7eef1",8) for k in range(4)],
 *[c(x,y,34,c2)+p(f"M{x-14} {y-4} q14 -20 28 0 q-14 22 -28 0","#fff") for x,y,c2 in [(1150,240,"#c0392b"),(1250,420,"#3d6fb0"),(420,320,"#2f9e6a")]])
A["algemeen-tijdschrift-fr"]=svgo(r(0,0,1600,900,"#efe6da"),r(0,640,1600,260,"#a8743f"),
 p("M420 160 h460 v520 h-460 z",M,'transform="rotate(-6 650 420)"'),p("M760 180 h460 v520 h-460 z",W,'transform="rotate(5 990 440)"'),
 r(810,240,360,220,"#9fc3d0",0,'transform="rotate(5 990 440)"'),*[r(810,490+k*40,360,14,L,0,'transform="rotate(5 990 440)"') for k in range(4)],r(470,220,360,60,W,0,'transform="rotate(-6 650 420)"'))
A["algemeen-nieuwsbrief-mailbox-fr"]=svgo(r(0,0,1600,900,"#eef1f4"),r(300,140,1000,600,"#2c3e50",16),r(330,190,940,520,W,6),r(330,190,260,520,"#e7eef1"),
 *[r(350,220+k*70,220,40,["#9fc3d0",L,L,L,L,L][k],6) for k in range(6)],r(620,220,600,180,"#9fc3d0",6),*[r(620,430+k*40,600,16,L) for k in range(5)],
 c(1300,180,60,M),p("M1270 170 l30 20 l30 -20 v40 h-60 z",W))
A["algemeen-podcastmicrofoon-fr"]=svgo(r(0,0,1600,900,"#2c2a33"),r(0,680,1600,220,"#3a3842"),r(700,140,200,340,"#9aa3aa",100),*[lijn(f"M720 {220+k*40} h160","#6b7278",5) for k in range(5)],
 p("M640 360 q0 200 160 200 q160 0 160 -200","none",'stroke="#9aa3aa" stroke-width="16"'),r(790,560,20,120,"#9aa3aa"),r(680,680,240,20,"#9aa3aa",6),
*[p(f"M{1050+k*50} 300 q30 30 0 60","none",'stroke="#e3c26b" stroke-width="8"') for k in range(3)])
# sport
A["algemeen-sport-rugby-fr"]=svgo(lucht(),r(0,520,1600,380,"#3d7a47"),*[lijn(f"M0 {560+k*80} h1600","#5d9a67",4) for k in range(5)],
 lijn("M600 520 V200 M1000 520 V200 M600 380 h400",W,14),'<ellipse cx="800" cy="700" rx="90" ry="56" fill="#a8743f" transform="rotate(-25 800 700)"/>',lijn("M760 700 h80",W,6))
A["algemeen-sport-tennis-fr"]=svgo(lucht(),p("M200 900 L500 420 H1100 L1400 900 z","#c8643a"),lijn("M200 900 L500 420 H1100 L1400 900 M800 420 V900 M340 680 H1260",W,6),
 r(260,640,1080,80,"#2c2a2a",0,'opacity="0.6"'),lijn("M260 640 h1080",W,8),c(1120,360,26,"#d8e04a"),'<ellipse cx="500" cy="300" rx="70" ry="90" fill="none" stroke="#1f1a18" stroke-width="10"/>',lijn("M500 390 v150",I,14))
A["algemeen-sport-zwemmen-fr"]=svgo(r(0,0,1600,900,"#e9eef1"),r(0,300,1600,600,"#3d9fbf"),*[lijn(f"M0 {380+k*120} h1600",["#e8743a","#f2d04a"][k%2],10) for k in range(5)],
 *[lijn(f"M{x} {y} q40 -14 80 0","#b8e4f0",4) for x,y in [(200,450),(700,580),(1200,700)]],c(900,500,26,I),p("M900 500 q-120 30 -220 0","none",'stroke="#1f1a18" stroke-width="20"'),r(0,260,1600,40,W))
A["algemeen-sport-schaatsen-fr"]=svgo(r(0,0,1600,900,"#e9eff3"),p("M0 600 q800 -60 1600 0 V900 H0 z","#cfe0ea"),
 p("M500 520 v-200 q0 -60 60 -60 h120 v220 q200 0 260 60 v20 h-440 z",I),r(480,560,500,14,"#9aa3aa"),lijn("M480 570 q-20 -20 0 -40",GR,6),
 p("M900 520 v-200 q0 -60 60 -60 h120 v220 q200 0 260 60 v20 h-440 z","#2c2a2a"),r(880,560,500,14,"#9aa3aa"))
A["algemeen-sport-skien-fr"]=svgo(r(0,0,1600,900,"#e3ecf2"),p("M0 300 L1600 800 V900 H0 z",W),p("M0 300 L400 200 L800 340 z","#9aa3aa"),
 figuur(800,600,1.1,M),p("M760 380 q30 -40 60 0 v14 h-60 z","#2a3f8f"),lijn("M620 620 L1000 680 M640 600 L1020 660",I,8),lijn("M700 480 l-60 140 M900 480 l60 140",GR,5),
 *[c(x,y,4,W) for x,y in [(200,100),(500,80),(1100,150),(1400,90)]])
A["algemeen-sport-zeilen-fr"]=svgo(r(0,0,1600,900,"#e3eef3"),c(1300,150,60,OK),r(0,560,1600,340,"#3d8fb0"),*[lijn(f"M{x} {y} q40 -14 80 0","#b8dce8",5) for x,y in [(100,640),(500,720),(1100,660),(1400,780)]],
 p("M500 600 h600 l-60 80 h-480 z",W),lijn("M800 600 V160",GR,10),p("M810 170 L1150 560 H810 z",W),p("M790 220 L560 560 H790 z",M))
A["algemeen-sport-wielrennen-fr"]=svgo(lucht("#f6efe2"),p("M0 560 q800 -100 1600 -40 V900 H0 z","#bfcfa9"),p("M0 760 q800 -120 1600 -40 v60 q-800 -80 -1600 40 z","#9a9188"),
 '<circle cx="640" cy="660" r="80" fill="none" stroke="#1f1a18" stroke-width="10"/><circle cx="960" cy="640" r="80" fill="none" stroke="#1f1a18" stroke-width="10"/>',
 lijn("M640 660 l140 -160 h140 l40 140 M780 500 l-20 -40 M920 500 l30 -60 h50",M,12),c(830,320,30,I),p("M830 350 q-30 60 -60 150 l120 0 q20 -60 0 -120 z",OK),p("M800 290 q30 -40 60 0 v14 h-60 z",W),
 *[r(x,440,6,120,GR) for x in (200,1400)])
for k,v in A.items(): open(k+".svg","w").write(v)
print(len(A))
