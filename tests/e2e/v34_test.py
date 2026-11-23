from playwright.sync_api import sync_playwright
import os
os.makedirs("/tmp/shots", exist_ok=True)
B="http://localhost:3100"
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=swiftshader","--enable-unsafe-swiftshader"])
    for tag,vp in (("pc",{"width":1280,"height":800}),("ph",{"width":390,"height":800})):
        pg=b.new_page(viewport=vp); pg.goto(B); pg.fill("input[type=password]","test1234"); pg.keyboard.press("Enter"); pg.wait_for_selector(".tpl",timeout=20000)
        n=pg.locator(".tpl").count(); assert n==17,n
        pg.screenshot(path=f"/tmp/shots/v34_list_{tag}.png")
        pg.locator(".tpl").nth(9).click(); pg.fill(".newrow input","Test L"); pg.click(".newrow .primary"); pg.wait_for_selector("canvas",timeout=20000); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"/tmp/shots/v34_edit_{tag}.png")
    b.close()
print("ok")
