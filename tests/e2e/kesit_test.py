# v1.3: serbest kesit, kata tepeden bakış, duvardan geçme
import os, sys, json, hashlib
from playwright.sync_api import sync_playwright
from fixture import house
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(p, name, vp, mobile):
    ctx=p.chromium.launch(args=ARGS).new_context(viewport=vp,has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_ghost','0')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(90000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.evaluate("""async (d)=>{const p=await (await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Kesit testi'})})).json();
      p.data=d; await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}); sessionStorage.setItem('kte_open',p.id)}""", house())
    pg.reload(); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(500)
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(3000)
    side = ".side" 
    if mobile and pg.locator("text=Panel ▴").count(): pg.click("text=Panel ▴")
    cv=".v3 canvas.v3cv"
    def h(): return hashlib.md5(pg.locator(cv).screenshot()).hexdigest()
    out={}
    pg.click(".chips.seg >> text=Yatay"); pg.wait_for_timeout(2500); a=h()
    pg.screenshot(path=f"{OUT}{tag}-{name}-k1-yatay.png")
    pg.locator("input[aria-label='Kesit yeri']").fill("4.1"); pg.wait_for_timeout(1500); b=h()
    out["yatay_kaydir_degisti"]= a!=b
    pg.click(".chips.seg >> text=Doğu–Batı"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{OUT}{tag}-{name}-k2-dogubati.png"); c=h()
    pg.click("text=Diğer tarafı göster"); pg.wait_for_timeout(1500)
    out["cevir_degisti"]= c!=h()
    pg.screenshot(path=f"{OUT}{tag}-{name}-k3-ters.png")
    pg.click(".chips.seg >> text=Kuzey–Güney"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{OUT}{tag}-{name}-k4-kuzeyguney.png")
    # tepeden
    pg.locator(".chips.seg").nth(1).locator("text=1. kat").click(); pg.wait_for_timeout(3000)
    pg.screenshot(path=f"{OUT}{tag}-{name}-k5-ust-kat-tepeden.png")
    pg.locator(".chips.seg").nth(1).locator("text=Zemin kat").click(); pg.wait_for_timeout(3000)
    pg.screenshot(path=f"{OUT}{tag}-{name}-k6-zemin-tepeden.png")
    # seçim: kesitte görünen bir şeye dokun
    pg.click("text=Bütün ev"); pg.wait_for_timeout(2500)
    out["butun_ev_kesit_yok"]= pg.locator(".chips.seg").first.locator("button.on").inner_text()
    # yürüme + duvardan geçme
    pg.select_option(".side select >> nth=0", label="Salon"); pg.click("text=İçeri gir"); pg.wait_for_timeout(2500)
    def walk(ms):
        pad=pg.locator(".pad button, .padl button").first
        if mobile:
            pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(ms); pg.keyboard.up("ArrowUp")
        else:
            pg.keyboard.down("w"); pg.wait_for_timeout(ms); pg.keyboard.up("w")
        pg.wait_for_timeout(400)
    pg.locator(".v3 canvas.v3cv").click(position={"x":5,"y":5}) if not mobile else None
    w0=h(); walk(2500); w1=h(); walk(2500); w2=h()
    out["duvar_kapali_takildi"]= w1==w2
    pg.screenshot(path=f"{OUT}{tag}-{name}-k7-duvar-kapali.png")
    pg.click(".v3bar .ghost3"); pg.wait_for_timeout(300)
    out["ghost_btn"]=pg.locator(".v3bar .ghost3").inner_text()
    walk(15000); w3=h()
    out["duvardan_gecti"]= w3!=w2
    pg.screenshot(path=f"{OUT}{tag}-{name}-k8-duvardan-gecti.png")
    out["errors"]=errs
    return out
with sync_playwright() as p:
    print(json.dumps({"desktop":run(p,"desktop",{"width":1280,"height":800},False),"phone":run(p,"phone",{"width":390,"height":844},True)},ensure_ascii=False))
