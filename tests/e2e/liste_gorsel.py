import os
import sys, json
from playwright.sync_api import sync_playwright
from fixture import house
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(p,name,vp,mobile,make):
    ctx=p.chromium.launch(args=ARGS).new_context(viewport=vp,has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off')")
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector("input[type=password]"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}{tag}-{name}-login.png")
    pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    if make:
        pg.evaluate("""async (d)=>{const all=await (await fetch('/api/projects')).json(); for (const q of all) await fetch('/api/projects/'+q.id,{method:'DELETE'});
          for (const nm of ['Köy evi (anneme)','Yazlık ev']) {const p=await (await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:nm})})).json();
          p.data=d; await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)});}
          await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Boş proje'})});}""", house())
        pg.reload(); pg.wait_for_selector(".pcard")
        pg.click("text=Köy evi (anneme)"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(800)
        # küçük bir değişiklik: kat adını değiştir ki "değişti" sayılsın
        pg.click("text=← Evlerim"); pg.wait_for_selector(".pcard", timeout=60000); pg.wait_for_timeout(800)
        pg.click("text=Yazlık ev"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(800)
        pg.click("text=← Evlerim"); pg.wait_for_selector(".pcard", timeout=60000); pg.wait_for_timeout(1200)
    else:
        pg.wait_for_selector(".pcard"); pg.wait_for_timeout(1000)
    pg.screenshot(path=f"{OUT}{tag}-{name}-list.png")
    return {"thumbs": pg.locator(".pthumb img").count(), "errors": errs}
with sync_playwright() as p:
    print(json.dumps({"desktop":run(p,"desktop",{"width":1280,"height":800},False,True),"phone":run(p,"phone",{"width":390,"height":844},True,False)},ensure_ascii=False))
