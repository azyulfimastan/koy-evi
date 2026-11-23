# v2.9: yan 3D'de eşyayı sürükle -> 2D plan eş zamanlı değişir
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
    pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Surukle "+sfx); pg.click(".wnav .go")
    pg.wait_for_selector(".cv canvas"); pg.click(".floors .v3btn.live"); pg.wait_for_selector(".live3 canvas"); pg.wait_for_timeout(3000)
    # kapı-pencere görünsün diye yakınlaştır: 3D'de kaydırma ile
    live=pg.locator(".live3"); bb=live.bounding_box()
    pg.mouse.move(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]/2)
    for _ in range(6): pg.mouse.wheel(0,-300); pg.wait_for_timeout(150)
    pg.wait_for_timeout(1000)
    cv=pg.locator(".cv"); before=cv.screenshot()
    hit=None
    for gy in range(8):
      for gx in range(8):
        x=bb["x"]+bb["width"]*(0.1+0.8*gx/7); y=bb["y"]+bb["height"]*(0.15+0.75*gy/7)
        pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+25,y+8,steps=3); pg.mouse.move(x+60,y+20,steps=3); pg.mouse.up(); pg.wait_for_timeout(150)
        if cv.screenshot()!=before: hit=(round(x),round(y)); break
      if hit: break
    pg.screenshot(path=f"/tmp/shots/{tag}-{sfx}-surukle.png")
    print(sfx, json.dumps({"2d_degisti": hit is not None, "nokta": hit, "err": errs}))
run(1280,800,"pc")
