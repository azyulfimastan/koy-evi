# v1.7: çatı yok, inşaat aşamaları, orta tuş ile döndürme, duvarı tutup yukarı çekme, direkler
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
res={}
def run(w,h,suffix):
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(120000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input", "Insaat "+suffix); pg.click(".tpl:has-text('Süper iki katlı')"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1200)
    # Yapı aracı
    pg.click(".tools >> text=Yapı"); pg.wait_for_timeout(300)
    assert pg.locator("text=Direkler (kolonlar)").count()>0
    pg.screenshot(path=f"{OUT}{tag}-{suffix}-01-yapi.png")
    box=pg.locator(".cv canvas").first.bounding_box()
    pg.mouse.click(box["x"]+box["width"]*0.5, box["y"]+box["height"]*0.5); pg.wait_for_timeout(300)
    res["elle_direk"]=pg.locator(".side .stats div:has-text(\"Elle koyduğun\")").inner_text()
    # Çatı: yok seçeneği
    pg.click(".tools >> text=Çatı"); pg.select_option(".panel select >> nth=0","none") if pg.locator(".panel select").count() else None
    pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}{tag}-{suffix}-02-cati-yok.png")
    # 3D
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{OUT}{tag}-{suffix}-03-3d-catisiz.png")
    # aşamalar
    sl=pg.locator("input[aria-label='İnşaat aşaması']")
    if sl.count()==0:
        pg.locator("button:has-text('3D'), .v3bar button").first.click() if False else None
    sl.scroll_into_view_if_needed()
    res["asama_sayisi"]=int(sl.get_attribute("max"))+1
    for i,name in ((1,"kazi"),(2,"temel"),(4,"direk")):
        sl.fill(str(i)); pg.wait_for_timeout(2500)
        res[f"asama_{name}"]=pg.locator(".stagename").inner_text()
        pg.screenshot(path=f"{OUT}{tag}-{suffix}-04-{name}.png")
    sl.fill(str(res["asama_sayisi"]-1)); pg.wait_for_timeout(2500)
    # orta tuş döndürme
    cv=pg.locator(".v3 canvas").first.bounding_box()
    cx,cy=cv["x"]+cv["width"]/2, cv["y"]+cv["height"]/2
    a=pg.evaluate("window.__v3ms||0")
    pg.screenshot(path=f"{OUT}{tag}-{suffix}-05-once.png")
    pg.mouse.move(cx,cy); pg.mouse.down(button="middle"); pg.mouse.move(cx+200,cy+20,steps=8); pg.mouse.up(button="middle"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}{tag}-{suffix}-06-orta-tus.png")
    a=open(f"{OUT}{tag}-{suffix}-05-once.png","rb").read(); b=open(f"{OUT}{tag}-{suffix}-06-orta-tus.png","rb").read()
    res["orta_tus_degisti"]= a!=b
    # duvar seç ve tutamacı sürükle
    pg.mouse.click(cx,cy+cv["height"]*0.12); pg.wait_for_timeout(1200)
    hd=pg.locator(".h3handle")
    res["tutamac_gorunur"]= hd.is_visible()
    if hd.is_visible():
        hb=hd.bounding_box()
        pg.mouse.move(hb["x"]+22,hb["y"]+22); pg.mouse.down(); pg.mouse.move(hb["x"]+22,hb["y"]-60,steps=6); pg.mouse.up(); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{OUT}{tag}-{suffix}-07-duvar-yuksek.png")
    res["errors"]=errs
    print(suffix, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc")
run(390,800,"tel")
