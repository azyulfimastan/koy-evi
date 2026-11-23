# v2.3: Hadi beraber oluşturalım sihirbazı (rakam gir -> 2D + 3D ev)
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "/tmp/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(w,h,sfx):
  res={}
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-00-liste.png")
    pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-adim1.png")
    pg.click(".wzchips button:text-is('2 kat')"); pg.wait_for_timeout(600)
    res["kat_sekmesi"]=pg.locator(".wztabs button.fl").count()
    pg.click(".wzsteps button >> nth=1"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-odalar.png")
    res["oda_satiri"]=pg.locator(".wroom").count()
    pg.click(".wzchips.small button:text-is('3+1')"); pg.wait_for_timeout(500)
    res["oda_3arti1"]=pg.locator(".wroom").count()
    pg.click(".wzsteps button >> nth=2"); pg.click(".wadd"); pg.wait_for_timeout(600)
    res["balkon"]=pg.locator(".wroom.bal").count()
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-balkon.png")
    pg.click(".wztabs button:text-is('3D')"); pg.wait_for_selector(".wzview canvas"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-04-3d.png")
    pg.click(".wztabs button:text-is('2D plan')")
    pg.click(".wzsteps button >> nth=3"); pg.fill(".wname","Sihirbaz deneme "+sfx); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-05-son.png")
    res["uyari"]=pg.locator(".wwarn").count()
    pg.click(".wnav .go"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1500)
    res["editor_acildi"]=True
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-06-editor.png")
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(3500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-07-editor3d.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
