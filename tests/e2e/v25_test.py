# v2.5: ev şekilleri (L, T, U, kendi şeklim) ve kaide dolgusu
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
    pg.click(".wzchips.small button:text-is('3+1')")  if False else None
    pg.click(".wzsteps button >> nth=1"); pg.wait_for_timeout(300)
    for k in ["L","T","U"]:
        pg.click(f".wzchips button:text-is('{k}')"); pg.wait_for_timeout(900)
        res["kanat_"+k]=pg.locator(".wroom.bal").count()
        pg.screenshot(path=f"{OUT}{tag}-{sfx}-sekil-{k}.png")
    pg.click(".wzchips button:has-text('Kendi şeklim')"); pg.wait_for_timeout(500)
    pg.click(".wadd"); pg.wait_for_timeout(800)
    res["ozel_kanat"]=pg.locator(".wroom.bal").count()
    pg.click(".wzchips button:text-is('L')"); pg.wait_for_timeout(900)
    pg.click(".wztabs button:text-is('3D')"); pg.wait_for_selector(".wzview canvas"); pg.wait_for_timeout(4500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-3d-L.png")
    pg.click(".wztabs button:text-is('2D plan')")
    res["uyari"]=pg.locator(".wwarn").count()
    pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Sekilli "+sfx)
    pg.click(".wnav .go"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-editor2d.png")
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-editor3d.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
