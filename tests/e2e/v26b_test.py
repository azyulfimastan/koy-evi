# v2.6: 2D çizerken yan canlı 3D
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1:4]
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(w,h,sfx):
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Yan3D "+sfx); pg.click(".wnav .go")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1000)
    pg.click(".floors .v3btn.live"); pg.wait_for_selector(".live3 canvas"); pg.wait_for_timeout(4500)
    ok1=pg.locator(".live3 canvas").count()==1 and pg.locator(".cv canvas").count()==1
    a=pg.locator(".live3").bounding_box(); c=pg.locator(".cv").bounding_box()
    pg.screenshot(path=f"/tmp/shots/{tag}-{sfx}-yan3d.png")
    pg.click(".floors .v3btn.live"); pg.wait_for_timeout(400)
    print(sfx, json.dumps({"ok":ok1,"live":a,"cv":c,"kapandi":pg.locator(".live3").count()==0,"err":errs}))
run(1280,800,"pc"); run(390,800,"tel")
