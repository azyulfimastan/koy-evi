import os
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
def run(p,name,vp,mobile):
    ctx=p.chromium.launch(args=ARGS).new_context(viewport=vp,has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_nothumb','1')"); pg=ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector("input[type=password]"); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Rehber"); pg.click("button.primary"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(500)
    out={}
    out["step1"]=pg.locator(".guide .gtxt b").inner_text()
    pg.screenshot(path=f"{OUT}{tag}-{name}-g1.png")
    pg.click(".guide .go"); pg.wait_for_timeout(200)
    out["tool_plot_on"]=pg.locator(".modes button.on").inner_text()
    box=pg.locator(".cv canvas").bounding_box(); cx,cy=box["x"]+box["width"]/2,box["y"]+box["height"]/2
    sc=min(box["width"],box["height"])/520
    P=lambda x,y:(cx+x*sc,cy+y*sc)
    pts=[(-150,-100),(150,-100),(150,100),(-150,100)]
    for x,y in pts: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(60)
    pg.mouse.click(*P(*pts[0])); pg.wait_for_timeout(300)
    out["step2"]=pg.locator(".guide .gtxt b").inner_text()
    pg.screenshot(path=f"{OUT}{tag}-{name}-g2.png")
    pg.click("text=Atla"); pg.wait_for_timeout(200)
    out["after_skip"]=pg.locator(".guide .gtxt b").inner_text()
    pg.click("[aria-label='Yönlendirmeyi kapat']"); pg.wait_for_timeout(200)
    out["closed"]=pg.locator(".guide").count()
    pg.click("text=🧭"); pg.wait_for_timeout(200)
    out["reopened"]=pg.locator(".guide").count()
    out["errors"]=errs
    return out
with sync_playwright() as p:
    print(json.dumps({"desktop":run(p,"desktop",{"width":1280,"height":800},False),"phone":run(p,"phone",{"width":390,"height":844},True)},ensure_ascii=False))
