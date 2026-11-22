import os
# Hızlı görsel kontrol: örnek evi yükle, 2D + 3D + iç mekan görüntüsü al
import sys, json
from playwright.sync_api import sync_playwright
from fixture import house
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
which = sys.argv[4] if len(sys.argv) > 4 else "dpi"
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(p,name,vp,mobile):
    ctx=p.chromium.launch(args=ARGS).new_context(viewport=vp,has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off')")
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text[:300]) if m.type=="error" else None)
    pg.goto(BASE); pg.wait_for_selector("input[type=password]"); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.evaluate("""async (d)=>{const p=await (await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Örnek köy evi'})})).json();
      p.data=d; await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}); sessionStorage.setItem('kte_open',p.id)}""", house())
    pg.reload(); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}{tag}-{name}-plan.png")
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas",timeout=60000); pg.wait_for_timeout(3500)
    pg.screenshot(path=f"{OUT}{tag}-{name}-3d.png")
    if "i" in which:
        pg.select_option(".side select >> nth=0", label="Salon") if pg.locator(".side select >> nth=0").count() else None
        pg.click("text=İçeri gir"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f"{OUT}{tag}-{name}-in.png")
        pg.click("text=Dışarı çık >> nth=0"); pg.wait_for_timeout(800)
    if "c" in which:
        pg.click(".chips.seg >> text=Yatay"); pg.wait_for_timeout(3000)
        pg.screenshot(path=f"{OUT}{tag}-{name}-cut.png")
        pg.click(".chips.seg >> text=Yok"); pg.wait_for_timeout(1500)
    if "n" in which:
        pg.locator(".side input[type=range]").first.fill("21"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f"{OUT}{tag}-{name}-night.png")
    return errs
with sync_playwright() as p:
    out={}
    if "d" in which: out["desktop"]=run(p,"desktop",{"width":1280,"height":800},False)
    if "p" in which: out["phone"]=run(p,"phone",{"width":390,"height":844},True)
    print(json.dumps(out,ensure_ascii=False)[:1500])
