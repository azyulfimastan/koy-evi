# v1.9: uygulama içi adım adım demo (🎬)
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
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(60000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Demo "+sfx); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(800)
    pg.click(".tourbtn"); pg.wait_for_selector(".tcard")
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-hosgeldin.png")
    msgs=[]
    for n in range(1,7):
        pg.click(".tcard button:has-text('İleri')"); pg.wait_for_timeout(500)
        if pg.locator(".tcard button:has-text('▶ ')").count() and n<=6:
            pg.click(".tcard button.go"); pg.wait_for_timeout(500)
            msgs.append(pg.locator(".tmsg").inner_text() if pg.locator(".tmsg").count() else "")
        if n in (2,6): pg.screenshot(path=f"{OUT}{tag}-{sfx}-0{n}-adim.png")
    res["mesajlar"]=msgs
    res["bilgi"]=pg.locator(".stat, .info, .hdr").first.inner_text() if pg.locator(".stat").count() else ""
    for _ in range(11): 
        if pg.locator(".tcard button:has-text('İleri')").count(): pg.click(".tcard button:has-text('İleri')"); pg.wait_for_timeout(250)
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-07-son-adimlar.png")
    pg.click(".tcard button:has-text('Bitir')"); pg.wait_for_timeout(300)
    res["kapandi"]= pg.locator(".tcard").count()==0
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-08-sonuc.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
