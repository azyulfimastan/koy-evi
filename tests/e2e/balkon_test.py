# v1.8: balkon aracı — şablondaki balkon, araçla ekleme, panel, 3D, rapor
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
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(120000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Balkon "+sfx); pg.click(".tpl:has-text('Süper iki katlı')"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1000)
    pg.click(".floors >> text=1. kat"); pg.wait_for_timeout(600)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-plan-1kat.png")
    # 2. balkon: aracı kullan, kuzey duvarının dışına dokun
    pg.click(".tools >> text=Balkon"); pg.wait_for_timeout(300)
    cv=pg.locator(".cv canvas").first.bounding_box()
    # önce plan görünür bölge: kuzey duvarın biraz üstüne tıkla (dış yan)
    # duvar konumunu bulmak için ekranda tara
    import itertools
    added=False
    for fy in (0.20,0.22,0.24,0.26,0.28,0.30,0.32):
        pg.mouse.click(cv["x"]+cv["width"]*0.5, cv["y"]+cv["height"]*fy); pg.wait_for_timeout(300)
        if pg.locator(".side h3:has-text('Balkon')").count():
            added=True; break
    res["arac_ile_eklendi"]=added
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-panel.png")
    if added:
        pg.locator(".side button:has-text('Diğer yöne')").click(); pg.wait_for_timeout(300)
        pg.locator(".side button:has-text('Balkonu sil')").click(); pg.wait_for_timeout(300)
    # 3D
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-3d.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
