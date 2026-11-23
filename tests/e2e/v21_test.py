# v2.1: alternatif kopyala, karşılaştır, aile özeti ve oy, Daha fazla, katlanabilir 3D panel
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "/tmp/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(w,h,sfx):
  res={}
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Alt "+sfx); pg.click(".tpl >> nth=1"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1500)
    # Daha fazla
    res["daha_fazla_var"]= pg.locator(".tools.modes .more").count()>0
    res["yapi_gorunur_once"]= pg.locator(".tools.modes button:text-is('Yapı')").count()>0
    if pg.locator(".tools.modes .more").count():
        pg.click(".tools.modes .more"); pg.wait_for_timeout(200)
    res["yapi_gorunur_sonra"]= pg.locator(".tools.modes button:text-is('Yapı')").count()>0
    # 3D panel katlanır mı
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(3500)
    res["kesit_kapali"]= pg.locator("h4.foldh.closed:has-text('Kesit')").count()>0
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-3d-panel.png")
    pg.locator("h4.foldh:has-text('Kesit')").click(); pg.wait_for_timeout(200)
    res["kesit_acildi"]= pg.locator("h4.foldh.closed:has-text('Kesit')").count()==0
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_timeout(500)  # 2D'ye dön
    pg.click("button:has-text('Evlerim')"); pg.wait_for_selector(".pcard"); pg.wait_for_timeout(500)
    # kopyala
    n0=pg.locator(".pcard").count()
    pg.locator(".pcard").first.locator("button:has-text('Alternatif kopyala')").click(); pg.wait_for_timeout(2500)
    res["kopya_eklendi"]= pg.locator(".pcard").count()==n0+1
    # iki evi seç, karşılaştır
    cbs=pg.locator(".pcard .psel")
    cbs.nth(0).check(); cbs.nth(1).check(); pg.wait_for_timeout(300)
    pg.click(".cmpbar button"); pg.wait_for_selector("table.cmp"); pg.wait_for_timeout(500)
    res["karsilastirma_satir"]= pg.locator("table.cmp tbody tr").count()
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-karsilastir.png")
    pg.locator("table.cmp button:has-text('Özet')").first.click(); pg.wait_for_selector(".sumbox h2"); pg.wait_for_timeout(500)
    pg.fill(".voteform input >> nth=0","Anne"); pg.click(".voteform button.go"); pg.wait_for_timeout(1200)
    res["oy_eklendi"]= pg.locator(".vote:has-text('Anne')").count()==1
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-ozet.png", full_page=False)
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
