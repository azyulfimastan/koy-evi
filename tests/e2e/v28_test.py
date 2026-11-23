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
    pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Btn "+sfx); pg.click(".wnav .go")
    pg.wait_for_selector(".cv canvas"); pg.click(".floors .v3btn.live"); pg.wait_for_selector(".live3 canvas"); pg.wait_for_timeout(2500)
    r={}
    pg.screenshot(path=f"/tmp/shots/{tag}-{sfx}-butonlar.png")
    for name,sel,cls in (("plan",".cv .fsbtn","fs-plan"),):
      pg.locator(sel).click(); pg.wait_for_timeout(1000)
      r[name]=pg.locator(".stage."+cls).count()==1
      pg.locator(".fsback").click(); pg.wait_for_timeout(500)
    pg.locator(".live3 .fsbtn").click(); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"/tmp/shots/{tag}-{sfx}-3dbtn.png")
    pg.locator(".fsbtn.m3").click(); pg.wait_for_timeout(1000)
    r["main3d"]=pg.locator(".stage.fs-main3d").count()==1
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    r["geri"]=pg.locator(".stage.fs").count()==0; r["err"]=errs
    print(sfx, json.dumps(r))
run(1280,800,"pc"); run(390,800,"tel")
