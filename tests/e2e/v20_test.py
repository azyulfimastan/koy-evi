# v2.0: arsa eğimi, fiyatlı metraj, kapı/pencere hazır ölçüleri, elektrik/tesisat noktaları, balkon sürükleme, telefonda dokunma ile ↕
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "/tmp/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(w,h,sfx,touch):
  res={}
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h},has_touch=touch,is_mobile=touch)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","V20 "+sfx); pg.click(".tpl >> nth=1"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1000)
    # elektrik / tesisat kategorisi
    pg.click(".tools >> text=Eşya"); pg.wait_for_timeout(300)
    res["elektrik_kat"]= pg.locator(".side button:has-text('Elektrik'), .side .chips button:has-text('Elektrik')").count()>0
    if res["elektrik_kat"]:
        pg.locator(".side button:has-text('Elektrik')").first.click(); pg.wait_for_timeout(200)
        res["priz_var"]= pg.locator(".side :text('Priz')").count()>0
    # arsa eğimi
    pg.click(".tools >> text=Arsa"); pg.wait_for_timeout(300)
    res["egim_alani"]= pg.locator("text=Arsa eğimi").count()>0
    inp=pg.locator(".side .edge:has-text('Eğim (%)') input").first
    inp.fill("12"); inp.press("Enter"); inp.blur(); pg.wait_for_timeout(400)
    pg.locator(".side .edge:has-text('Alçalma yönü') select").select_option('180')
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4500)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-egimli-3d.png")
    # rapor + fiyat
    pg.click(".floors .v3btn.rep"); pg.wait_for_selector(".rpt"); pg.wait_for_timeout(500)
    pi=pg.locator(".rprice input").first
    pi.fill("100"); pi.blur(); pg.wait_for_timeout(300)
    res["maliyet"]=pg.locator("text=TL").first.inner_text()[:40] if pg.locator("text=TL").count() else ""
    res["cokol_satiri"]= pg.locator("text=cokol betonu").count()>0
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-rapor.png")
    pg.click(".rbar button:has-text('Kapat')"); pg.wait_for_timeout(300)
    # 3D'de duvar seç, ↕ tutamacı sürükle (telefonda gerçek dokunma olayı)
    cv=pg.locator(".v3 canvas").first.bounding_box()
    cx,cy=cv["x"]+cv["width"]/2, cv["y"]+cv["height"]*0.55
    hd=pg.locator(".h3handle"); found=False
    for fy in (0.55,0.6,0.65,0.5,0.7):
        pg.mouse.click(cv["x"]+cv["width"]/2, cv["y"]+cv["height"]*fy) if not touch else pg.touchscreen.tap(cv["x"]+cv["width"]/2, cv["y"]+cv["height"]*fy)
        pg.wait_for_timeout(900)
        if hd.is_visible(): found=True; break
    res["tutamac_gorunur"]=found
    if found:
        hb=hd.bounding_box(); x=hb["x"]+hb["width"]/2; y=hb["y"]+hb["height"]/2
        if touch:
            cdp=ctx.new_cdp_session(pg)
            cdp.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":x,"y":y}]})
            for k in range(1,8): cdp.send("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":x,"y":y-k*10}]}); pg.wait_for_timeout(60)
            cdp.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
        else:
            pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x,y-70,steps=6); pg.mouse.up()
        pg.wait_for_timeout(1200)
        hb2=hd.bounding_box()
        res["tutamac_hareket_px"]=round(hb["y"]-hb2["y"])
        pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-tutamac.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(390,800,"tel",True)
