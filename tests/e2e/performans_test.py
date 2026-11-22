import os
import sys, json, random
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
random.seed(4)
def uid(): return "".join(random.choice("abcdefghijklmnop0123456789") for _ in range(8))
def big():
    floors = []
    for fi in range(3):
        walls=[]; ops=[]; rooms=[]; items=[]
        def W(a,b): 
            i=uid(); walls.append({"id":i,"a":{"x":a[0],"y":a[1]},"b":{"x":b[0],"y":b[1]},"t":0.25,"color":"#cccccc"}); return i
        cols, rws, cw, rh = 6, 4, 4.0, 3.5
        for c in range(cols+1): 
            for r in range(rws): 
                i=W((c*cw, r*rh),(c*cw,(r+1)*rh))
                if 0<c<cols: ops.append({"id":uid(),"wall":i,"pos":1.75,"w":0.9,"h":2.1,"sill":0,"kind":"door","shape":"rect","flip":False,"hinge":False})
        for r in range(rws+1):
            for c in range(cols):
                i=W((c*cw, r*rh),((c+1)*cw,r*rh))
                ops.append({"id":uid(),"wall":i,"pos":2,"w":1.2,"h":1.2,"sill":0.9,"kind":"window","shape":"rect","flip":False,"hinge":False})
        for c in range(cols):
            for r in range(rws):
                rooms.append({"id":uid(),"name":f"Oda {c}{r}","seed":{"x":c*cw+2,"y":r*rh+1.7},"color":"#e8d9b5","floor":"parquet"})
                for k,(key,nm,w,d,h,shape) in enumerate([("bed2","Çift kişilik yatak",1.6,2,0.5,"bed"),("ward","Gardırop",1.8,0.6,2.2,"wardrobe"),("coffee","Orta sehpa",1,0.6,0.45,"rect")]):
                    items.append({"id":uid(),"key":key,"name":nm,"shape":shape,"x":c*cw+1.2+k*0.9,"y":r*rh+1.0+k*0.6,"rot":0,"w":w,"d":d,"h":h,"elev":0,"color":"#8a6a4a"})
        floors.append({"id":uid(),"name":"Zemin kat" if fi==0 else f"{fi}. kat","height":2.8,"walls":walls,"openings":ops,"rooms":rooms,"stairs":[],"items":items})
    objs=[{"id":uid(),"kind":"tree","name":"Ağaç","x":-5+i*3.2,"y":-4,"rot":0,"w":3,"d":3,"h":6,"color":"#4f8a3a"} for i in range(8)]
    objs+=[{"id":uid(),"kind":"pine","name":"Çam","x":-5+i*3.2,"y":16,"rot":0,"w":2.5,"d":2.5,"h":7,"color":"#2f6a3a"} for i in range(8)]
    return {"plot":{"points":[{"x":-8,"y":-8},{"x":32,"y":-8},{"x":32,"y":20},{"x":-8,"y":20}],"closed":True},"snap":0.1,"defT":0.25,"roof":{"kind":"gable","pitch":35,"overhang":0.4,"ridge":"auto","color":"#a5523a","tex":"tile"},"floors":floors,"custom":[],"env":{"sun":{"month":6,"hour":14,"lat":52,"north":0,"shadows":True},"objs":objs}}

def run(p, name, vp, mobile):
    ctx = p.chromium.launch(args=ARGS).new_context(viewport=vp, has_touch=mobile, is_mobile=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')"); pg = ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector("input[type=password]")
    pg.fill("input[type=password]", PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    r = pg.evaluate("""async (d)=>{const p=await (await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Büyük ev'})})).json();
      p.data=d; await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}); return p.id}""", big())
    pg.reload(); pg.wait_for_selector(".page")
    pg.click("text=Büyük ev"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}{tag}-{name}-big-plan.png")
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas", timeout=60000); pg.wait_for_timeout(4000)
    ms = pg.evaluate("window.__v3ms")
    fps = pg.evaluate("""()=>new Promise(r=>{let n=0,t0=performance.now();const f=()=>{n++; if(performance.now()-t0>3000) r(Math.round(n/3)); else requestAnimationFrame(f)};requestAnimationFrame(f)})""")
    tri = pg.locator(".v3stats, .v3 .small").first.inner_text() if pg.locator(".v3stats, .v3 .small").count() else ""
    pg.screenshot(path=f"{OUT}{tag}-{name}-big-3d.png")
    pg.click("text=Rapor"); pg.wait_for_selector(".rpt .rsec")
    t=pg.evaluate("performance.now()")
    return {"build_ms": ms, "fps_swiftshader": fps, "errors": errs}

with sync_playwright() as p:
    print(json.dumps({"desktop": run(p, "desktop", {"width":1280,"height":800}, False), "phone": run(p, "phone", {"width":390,"height":844}, True)}, ensure_ascii=False))
