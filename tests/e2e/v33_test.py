# adım adım izle: 2D / 3D / yan yana seçimi
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1:4]
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(w,h,sfx):
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(70000); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Izle "+sfx); pg.click(".tpl >> nth=1"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.click(".floors .tourbtn"); pg.wait_for_selector(".helpmenu"); pg.click(".helpmenu .replaybtn")
    pg.wait_for_selector(".replay canvas"); r={}
    for _ in range(8): pg.click(".rprow button.go")
    r["2d_varsayilan"]= pg.locator(".rp3d").count()==0
    pg.click(".rpmode button:text-is('Yan yana')"); pg.wait_for_selector(".rp3d canvas"); pg.wait_for_timeout(3500)
    r["yan_yana"]= pg.locator(".rpcv").is_visible() and pg.locator(".rp3d canvas").count()==1
    pg.screenshot(path=f"/tmp/shots/{tag}-{sfx}-yanyana.png")
    pg.click(".rpmode button:text-is('3D')"); pg.wait_for_timeout(1500)
    r["sadece_3d"]= pg.locator(".rpcv").is_hidden() and pg.locator(".rp3d canvas").count()==1
    pg.screenshot(path=f"/tmp/shots/{tag}-{sfx}-3d.png")
    pg.wait_for_timeout(500)
    pg.click(".rpmode button:text-is('2D')"); pg.wait_for_timeout(500)
    r["sadece_2d"]= pg.locator(".rpcv").is_visible() and pg.locator(".rp3d").count()==0
    r["err"]=errs; print(sfx, json.dumps(r))
run(1280,800,"pc"); run(390,800,"tel")
