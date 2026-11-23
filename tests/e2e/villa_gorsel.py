# Süper iki katlı ev şablonunu oluşturur, öğretici için sıralı ekran görüntüleri alır
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(120000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.screenshot(path=f"{OUT}{tag}-00-sablon-secimi.png")
    pg.fill(".newp input", "Süper ev"); pg.click(".tpl >> nth=1"); pg.screenshot(path=f"{OUT}{tag}-00-sablon-secimi.png"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{OUT}{tag}-01-zemin-plan.png")
    pg.click(".floors >> text=1. kat"); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{OUT}{tag}-02-ust-plan.png")
    pg.click(".floors >> text=Zemin kat"); pg.wait_for_timeout(500)
    # duvar yüksekliği: bar duvarına tıkla
    box=pg.locator("canvas").first.bounding_box()
    pg.click(".modes >> text=Seç")
    # 3D
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(5000)
    pg.screenshot(path=f"{OUT}{tag}-03-3d-dis.png")
    pg.click("button:has-text('Zemin kat') >> nth=-1") if False else None
    pg.locator("h4:has-text('Kata tepeden bak') ~ div button >> nth=1").click(); pg.wait_for_timeout(5000)
    pg.screenshot(path=f"{OUT}{tag}-04-3d-ust-kat-ici.png")
    pg.locator("h4:has-text('Kata tepeden bak') ~ div button >> nth=0").click(); pg.wait_for_timeout(5000)
    pg.screenshot(path=f"{OUT}{tag}-05-3d-zemin-ici.png")
    print(json.dumps({"errors":errs}))
