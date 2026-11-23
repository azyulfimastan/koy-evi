# Hazır şablonları oluşturup 2D ve 3D görüntülerini alır
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    for key in ["Küçük köy evi","Bağ evi"]:
        pg.fill(".newp input", ""); pg.click(f".tpl:has-text('{key}')"); pg.click(".newp button.primary")
        pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1000)
        k=key.split()[0].lower()
        pg.screenshot(path=f"{OUT}{tag}-{k}-plan.png")
        pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4000)
        pg.screenshot(path=f"{OUT}{tag}-{k}-3d.png")
        pg.click(".floors .v3btn >> nth=0"); pg.wait_for_timeout(500)
        pg.click("text=← Evlerim"); pg.wait_for_selector(".pcard")
    print(json.dumps({"errors":errs}))
