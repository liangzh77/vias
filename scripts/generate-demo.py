"""Generate original illustrations and synthetic, NON-NAVIGABLE example tracks.
Optional developer tool: Python 3 + Pillow. Outputs are committed; not required to build.
No network, phone files, photographs or third-party route data are used.
"""
from pathlib import Path
import json, math, datetime
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'client/src/static/demo'
OUT.mkdir(parents=True, exist_ok=True)
def font(size):
    try: return ImageFont.load_default(size=size)
    except TypeError: return ImageFont.load_default()
def landscape(name, variant=0, heading=None):
    im=Image.new('RGB',(1000,600)); d=ImageDraw.Draw(im)
    for y in range(600):
        t=y/600
        d.line((0,y,1000,y),fill=(int(181-80*t),int(224-66*t),int(231-61*t)))
    d.ellipse((750,50,830,130),fill='#fff3b4')
    for offset,color in [(0,'#aac9ba'),(100,'#71a891'),(200,'#387c68')]:
        d.polygon([(0,400+offset),(150,150+offset),(300,320+offset),(550,80+offset),(830,340+offset),(1000,230+offset),(1000,600),(0,600)],fill=color)
    d.line([(360,600),(440,510),(390,445),(500+variant*20,360)],fill='#f8e6b9',width=8)
    if heading:d.text((55,60),heading,font=font(48),fill='white');d.text((58,125),'SYNTHETIC SCENERY / NOT A REAL DESTINATION',font=font(19),fill='white')
    im.save(OUT/(name+'.png'),optimize=True)
landscape('banner',heading='VIAS / EXPLORE OUTDOORS')
for i,n in enumerate(['footprint-1','footprint-2','photo-1','photo-2','photo-3','photo-4','route-demo-loop','route-demo-ridge']):landscape(n,i%3)
im=Image.new('RGB',(280,110),'white');d=ImageDraw.Draw(im);d.text((12,15),'VIAS',font=font(54),fill='#00ad78');d.text((14,77),'LOCAL TRAIL LAB',font=font(18),fill='#687d76');im.save(OUT/'brand.png')
for name,color,letter in [('route','#00c874','R'),('destination','#17bada','D'),('photo','#ffb341','P'),('circle','#ff789a','C')]:
    im=Image.new('RGBA',(180,180),(255,255,255,0));d=ImageDraw.Draw(im);d.ellipse((2,2,178,178),fill=color);d.text((62,45),letter,font=font(76),fill='white');im.save(OUT/f'entry-{name}.png')
routes=[]
for j,(id,title,place) in enumerate([('demo-loop','合成示例环线（不可导航）','示例区域 A'),('demo-ridge','合成示例山脊（不可导航）','示例区域 B')]):
    pts=[]
    for i in range(81):
        a=i/80*math.tau
        pts.append({'lat':round(35+j+0.015*math.sin(a),6),'lon':round(110+j+0.02*math.cos(a),6),'ele':round(100+80*(1-math.cos(a)),1),'time':(datetime.datetime(2020,1,1,tzinfo=datetime.timezone.utc)+datetime.timedelta(seconds=i*60)).isoformat().replace('+00:00','Z')})
    def dist(a,b):
        r=math.pi/180;h=math.sin((b['lat']-a['lat'])*r/2)**2+math.cos(a['lat']*r)*math.cos(b['lat']*r)*math.sin((b['lon']-a['lon'])*r/2)**2
        return 6371008.8*2*math.asin(math.sqrt(h))
    meters=sum(dist(a,b) for a,b in zip(pts,pts[1:]))
    routes.append({'id':id,'title':title,'author':'Vias 示例','activity':'徒步' if j==0 else '登山','difficulty':'未评估','place':place,'distance':round(meters/1000,3),'duration':4800,'ascent':160,'descent':160,'maxEle':260,'maxSpeed':0,'source':'数学合成示例；非真实道路，不可用于导航','cover':f'/static/demo/route-{id}.png','segments':[pts],'waypoints':[]})
(ROOT/'client/src/core/demo-routes.json').write_text(json.dumps(routes,ensure_ascii=False,indent=2)+'\n')
print('Generated 2 synthetic tracks and original illustrations; no research assets accessed.')
