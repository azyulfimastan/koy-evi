# Kırp aracı: duvar parçasına dokun -> en yakın kesişime kadar kırpılır
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1:4]
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
with sync_playwright() as p:
  ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
  ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
  pg=ctx.new_page(); errs=[]; pg.set_default_timeout(70000); pg.on("pageerror", lambda e: errs.append(str(e)))
  pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
  pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Kirp"); pg.click(".wnav .go")
  pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1200)
  r={}
  txt=lambda: pg.locator(".side .muted, .side p").all_inner_texts()
  before=pg.locator("text=/\\d+ duvar/").first.inner_text()
  pg.locator("button:text-is('✂ Kırp')").click(); pg.wait_for_timeout(300)
  r["ipucu"]=pg.locator("text=Fazla uzayan duvar").count()==1
  # evin üst dış duvarı üzerinde orta bir noktaya dokun (iç duvarlarla kesişim arası)
  pg.mouse.click(540,430) ; pg.wait_for_timeout(500)
  after=pg.locator("text=/\\d+ duvar/").first.inner_text()
  r["once"]=before; r["sonra"]=after
  pg.screenshot(path=f"/tmp/shots/{tag}-kirp.png")
  r["err"]=errs
  print(json.dumps(r, ensure_ascii=False))
