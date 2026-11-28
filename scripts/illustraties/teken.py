# Hulpjes voor de illustraties: vaste palet, 1600x900.
M="#800000"; MD="#5c0000"; W="#faf7f4"; B="#efe8e1"; L="#e7dfd8"; I="#1f1a18"; G="#2f6b3a"; GL="#3d7a47"; GR="#6f6660"; ST="#c9b8a8"; ZA="#e3d6c6"; OK="#e3c26b"; HT="#a89a88"
def svg(*d, bg=W): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="{bg}"/>'+"".join(d)+'</svg>'
def r(x,y,w,h,f,rx=0,extra=""): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{f}" {extra}/>'
def p(d,f,extra=""): return f'<path d="{d}" fill="{f}" {extra}/>'
def c(x,y,rr,f): return f'<circle cx="{x}" cy="{y}" r="{rr}" fill="{f}"/>'
def e(x,y,rx,ry,f): return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{f}"/>'
def grond(y=700,f=B): return r(0,y,1600,900-y,f)
def figuur(x,y,s=1,f=I):  # voeten op y
    h=150*s
    return c(x,y-h-22*s,22*s,f)+p(f"M{x-30*s} {y-h+8*s} q{30*s} {-18*s} {60*s} 0 l{10*s} {h-8*s} h{-80*s} z",f)
def boom(x,y,s=1,f=G): return r(x-14*s,y-160*s,28*s,160*s,HT)+e(x,y-200*s,110*s,95*s,f)
def luik(x,y,w=70,h=100): return r(x,y,w,h,GR)+r(x-12,y,12,h,G)+r(x+w,y,12,h,G)
def raam(x,y,w=70,h=100,f=GR): return r(x,y,w,h,f)
def wolk(x,y,s=1,f=L): return e(x,y,160*s,45*s,f)+e(x+120*s,y-15*s,120*s,40*s,f)
# Rijke stijl (28-11-2026): donkere omlijning over alles behalve de achtergrond.
def svgo(*d, bg=W):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="{bg}"/><g stroke="#1f1a18" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">'+"".join(d)+'</g></svg>'
def lijn(d,col=I,w=3.5): return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}"/>'
def tegels(y=700,stap=160,col="#d9cdbf"): return "".join(lijn(f"M{x} {y} l-40 {900-y}",col,2) for x in range(80,1700,stap))
def kozijn(x,y,w=70,h=100): return r(x,y,w,h,GR)+lijn(f"M{x+w/2} {y} v{h} M{x} {y+h/2} h{w}",ZA,3)+r(x-6,y+h,w+12,10,HT)
def plant(x,y,col=GL): return r(x-25,y-50,50,50,"#a8743f",4)+e(x,y-60,40,26,col)
def lantaarn(x,y=700): return r(x-5,y-300,10,300,GR)+p(f"M{x-20} {y-300} h40 l-8 -40 h-24 z",I)
