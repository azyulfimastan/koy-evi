# v2.4: kaide (yükseltilmiş temel) + dış merdiven (sihirbaz ve editör)
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
    pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg")
    pg.click(".wzchips button:text-is('2 kat')"); pg.wait_for_timeout(300)
    pg.fill("input[aria-label='Zeminden yükseklik (cm)']","120"); pg.wait_for_timeout(500)
    res["giris_secenegi"]=pg.locator("label.wchk:has-text('Girişe dış merdiven')").count()==1
    pg.locator("label.wchk:has-text('1. kata dış merdiven') input").check(); pg.wait_for_timeout(800)
    pg.click(".wztabs button:text-is('3D')"); pg.wait_for_selector(".wzview canvas"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-sihirbaz3d.png")
    pg.click(".wztabs button:text-is('2D plan')"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-sihirbaz2d.png")
    pg.click(".wzsteps button >> nth=3"); pg.fill(".wname","Kaideli "+sfx)
    pg.click(".wnav .go"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1500)
    res["editor"]=True
    pg.click(".tools.modes button:text-is('Dış merdiven')"); pg.wait_for_timeout(300)
    res["ipucu"]="Dış merdiven için" in pg.locator(".hint").inner_text()
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-editor2d.png")
    pg.click(".tools.modes button:text-is('Seç')")
    # Yapı paneli kaide alanı
    if pg.locator(".tools.modes button:text-is('Yapı')").count()==0: pg.click(".tools.modes .more"); pg.wait_for_timeout(200)
    pg.click(".tools.modes button:text-is('Yapı')"); pg.wait_for_timeout(300)
    res["kaide_alani"]=pg.locator("text=Kaide (yükseltilmiş temel)").count()>0
    res["kaide_deger"]=pg.locator("label:has-text('Ev zeminden ne kadar yüksekte') input").input_value()
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-04-editor3d.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
