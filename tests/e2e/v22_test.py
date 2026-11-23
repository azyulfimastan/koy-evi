# v2.2: adım adım izle (ileri / geri), hem editörden hem Evlerim listesinden
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "/tmp/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(w,h,sfx):
  res={}
  with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":w,"height":h})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_fold','open')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Izle "+sfx); pg.click(".tpl >> nth=1"); pg.click(".newp button.primary")
    pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1500)
    # editörden
    pg.click(".floors .tourbtn"); pg.wait_for_selector(".helpmenu")
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-01-menu.png")
    pg.click(".helpmenu .replaybtn"); pg.wait_for_selector(".replay canvas"); pg.wait_for_timeout(500)
    txt=lambda: pg.locator(".rpmeta").inner_text()
    res["bas"]=txt().replace("\n"," ")
    n=int(txt().split("/")[-1].strip())
    res["adim_sayisi"]=n
    for _ in range(12): pg.click(".rprow button.go")
    pg.wait_for_timeout(300); res["ileri12"]=txt().replace("\n"," ")
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-02-duvarlar.png")
    for _ in range(4): pg.click(".rprow button.big:not(.go)")
    res["geri4"]=txt().replace("\n"," ")
    pg.click(".rprow button[aria-label='Sonraki aşama']"); pg.wait_for_timeout(200)
    res["sonraki_asama"]=pg.locator(".rpmeta span").first.inner_text()
    pg.fill(".rpcard input[type=range]", str(n-1)) if False else pg.locator(".rpcard input[type=range]").evaluate("(e,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}", n//2)
    pg.wait_for_timeout(300); pg.screenshot(path=f"{OUT}{tag}-{sfx}-03-orta.png")
    pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowLeft")
    pg.click(".rpbar button"); pg.wait_for_timeout(300)
    res["kapandi"]=pg.locator(".replay").count()==0
    # liste
    pg.click("button:has-text('Evlerim')"); pg.wait_for_selector(".pcard"); pg.wait_for_timeout(500)
    pg.locator(".pcard").first.locator("button:has-text('Adım adım izle')").click()
    pg.wait_for_selector(".replay canvas"); pg.wait_for_timeout(500)
    res["liste_acildi"]=pg.locator(".rpcard b").count()==1
    pg.click(".rprow button:has-text('Oynat')"); pg.wait_for_timeout(2200)
    res["oynat_ilerledi"]=txt().split("/")[0].strip().split()[-1]!="1"
    pg.screenshot(path=f"{OUT}{tag}-{sfx}-04-liste.png")
    res["errors"]=errs
  print(sfx, json.dumps(res, ensure_ascii=False))
run(1280,800,"pc"); run(390,800,"tel")
