# pencereyle köşe seç + açı/ölçü kutusu, orta tuş gezinme, çöp boşalt
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1:4]
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
with sync_playwright() as p:
  ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
  ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
  pg=ctx.new_page(); errs=[]; pg.set_default_timeout(60000); pg.on("pageerror", lambda e: errs.append(str(e)))
  pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
  pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Kose"); pg.click(".wnav .go")
  pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1200)
  r={}
  bb=pg.locator(".cv").bounding_box()
  # orta tuşla gezin
  cx,cy=bb["x"]+bb["width"]/2, bb["y"]+bb["height"]/2
  pg.mouse.move(cx,cy); pg.mouse.down(button="middle"); pg.mouse.move(cx+50,cy+30,steps=4); pg.mouse.up(button="middle")
  r["orta_tus_secim_yok"]=pg.locator(".cbox").count()==0 and pg.locator(".marq").count()==0
  # tüm evi kapsayan pencere
  pg.mouse.move(bb["x"]+20,bb["y"]+60); pg.mouse.down(); pg.mouse.move(bb["x"]+bb["width"]*0.5,bb["y"]+bb["height"]*0.5,steps=6)
  r["pencere_gorunur"]=pg.locator(".marq").count()==1
  pg.mouse.move(bb["x"]+bb["width"]-20,bb["y"]+bb["height"]-20,steps=6); pg.mouse.up(); pg.wait_for_timeout(500)
  n=pg.locator(".cmark").count(); r["koseler"]=n
  pg.screenshot(path=f"/tmp/shots/{tag}-pencere.png")
  if n:
    pg.locator(".cmark").first.dblclick(); pg.wait_for_timeout(500)
    r["kutu"]=pg.locator(".cbox").count()==1
    pg.screenshot(path=f"/tmp/shots/{tag}-kutu.png")
    if pg.locator(".cbox").count():
      pg.locator(".cbox button:text-is('90° yap')").click() if pg.locator(".cbox button:text-is('90° yap')").count() else pg.locator(".cbox button.primary").click()
      pg.wait_for_timeout(500); r["kutu_kapandi"]=pg.locator(".cbox").count()==0
  r["err"]=errs
  print(json.dumps(r))
