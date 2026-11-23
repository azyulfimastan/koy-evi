# v2.6: çatı duvarlara göre otomatik, sihirbazda oda sırası / yeri / eşya yönü
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
    pg.click(".wzsteps button >> nth=2"); pg.wait_for_timeout(400)
    names0=pg.locator(".wzlist span").all_inner_texts()
    pg.locator(".wroom").first.locator("button[aria-label='Aşağı taşı']").click(); pg.wait_for_timeout(300)
    pg.locator(".wroom").nth(1).locator("select[aria-label='Odanın yeri']").select_option("N"); pg.wait_for_timeout(300)
    pg.locator(".wroom").nth(1).locator("select[aria-label='Eşya yönü']").select_option("3"); pg.wait_for_timeout(600)
    res["kontrol_var"]= pg.locator(".wopts").count()==4
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-oda-kontrol.png")
    pg.click(".wzsteps button >> nth=1"); pg.wait_for_timeout(300)
    pg.click(".wzchips button:text-is('L')"); pg.wait_for_timeout(1200)
    pg.click(".wztabs button:text-is('3D')"); pg.wait_for_selector(".wzview canvas"); pg.wait_for_timeout(4500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-L-3d.png")
    pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Cati "+sfx)
    pg.click(".wnav .go"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1500)
    # editörde çatıyı seç: panelde çatı alanı hata vermemeli
    if pg.locator(".tools.modes button:text-is('Çatı')").count()==0: pg.click(".tools.modes .more")
    pg.click(".tools.modes button:text-is('Çatı')"); pg.wait_for_timeout(500)
    res["cati_paneli"]=pg.locator("text=Tepe yüksekliği").count()>0
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-editor3d.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
