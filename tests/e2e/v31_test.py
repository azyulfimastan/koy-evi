# kenara çift tıkla hızlı açı/ölçü (arsa + duvar), Esc, üst 3D düğmesi yok, Büyüt tam 3D açar
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1:4]
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
with sync_playwright() as p:
  ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
  ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
  pg=ctx.new_page(); errs=[]; pg.set_default_timeout(70000); pg.on("pageerror", lambda e: errs.append(str(e)))
  pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
  pg.click(".wizbtn"); pg.wait_for_selector(".wiz .wzsvg svg"); pg.click(".wzsteps button >> nth=4"); pg.fill(".wname","Kenar"); pg.click(".wnav .go")
  pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1200)
  r={}
  try:
    r["ust_3d_dugmesi_yok"]= pg.locator(".floors .v3btn:has-text('3D görünüm')").count()==0
    pg.keyboard.press("Escape")
    # arsa üst kenarı (plan 1280x800'de y≈308)
    pg.mouse.dblclick(495,278); pg.wait_for_timeout(500)
    r["arsa_kutu"]= pg.locator(".cbox b:text-is('Arsa köşesi')").count()==1
    if r["arsa_kutu"]:
      pg.locator(".cbox input").nth(1).fill("30"); pg.keyboard.press("Enter"); pg.wait_for_timeout(400)
      r["arsa_uygulandi"]= pg.locator(".cbox").count()==0
      pg.screenshot(path=f"/tmp/shots/{tag}-arsa.png")
    # duvar: evin sol duvarı (x≈464, y≈500 civarı); önce ev ortada olmayabilir -> sığdır
    pg.wait_for_timeout(300)
    # Büyüt -> tam 3D
    pg.click(".floors .v3btn.live"); pg.wait_for_selector(".live3 canvas"); pg.wait_for_timeout(2000)
    pg.locator(".live3 .fsbtn").click(); pg.wait_for_timeout(2500)
    r["tam3d_panel"]= pg.locator(".side h3:text-is('3D görünüm')").count()==1
    pg.click(".floors .v3btn.on"); pg.wait_for_timeout(800)
    r["2d_geri"]= pg.locator(".cv").is_visible()
    r["err"]=errs
    pass

  except Exception as ex:
    r['hata']=str(ex)[-500:]; pg.screenshot(path=f'/tmp/shots/{tag}-hata.png')
  print(json.dumps(r))
