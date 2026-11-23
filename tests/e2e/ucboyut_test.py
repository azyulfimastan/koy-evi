import os
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

def run(p, name, vp, mobile):
    ctx = p.chromium.launch(args=ARGS).new_context(viewport=vp, has_touch=mobile, is_mobile=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1')"); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.goto(BASE); pg.wait_for_selector("input[type=password]")
    pg.fill("input[type=password]", PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input", f"3D {name}"); pg.click("button.primary"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(500)
    box = pg.locator(".cv canvas").bounding_box()
    cx, cy = box["x"] + box["width"]/2, box["y"] + box["height"]/2
    sc = min(box["width"], box["height"]) / 520
    P = lambda x, y: (cx + x*sc, cy + y*sc)
    arsa = [(-190,-130),(170,-130),(210,-20),(170,140),(-100,160),(-190,80)]
    for x,y in arsa: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(50)
    pg.mouse.click(*P(*arsa[0])); pg.wait_for_timeout(250)
    pg.click(".modes >> text=Duvar")
    sq = [(-150,-90),(110,-90),(110,100),(-150,100)]
    for x,y in sq: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(60)
    pg.mouse.click(*P(*sq[0])); pg.wait_for_timeout(150)
    pg.mouse.click(*P(-20,-90)); pg.wait_for_timeout(50); pg.mouse.click(*P(-20,100)); pg.wait_for_timeout(50); pg.mouse.click(*P(-20,100)); pg.wait_for_timeout(150)
    for x,y in [(30,100),(-20,40)]: pg.click(".modes >> text=Kapı"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(150)
    for x,y in [(-90,-90),(50,-90),(110,-30),(-150,0),(-100,100)]: pg.click(".modes >> text=Pencere"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(150)
    pg.click(".modes >> text=Oda")
    for x,y in [(-85,-60),(40,-60)]: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(200)
    pg.click(".modes >> text=Seç"); pg.mouse.click(*P(-110,60)); pg.wait_for_timeout(200)
    pg.locator(".side select").first.select_option("parquet"); pg.wait_for_timeout(150)
    pg.mouse.click(*P(-20,-20)); pg.wait_for_timeout(200)
    wall_sel = pg.locator(".side h3").first.inner_text()
    pg.screenshot(path=f"{OUT}{tag}-{name}-w-wallpanel.png")
    pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(150)
    def place(cat, item, x, y):
        pg.click(f".chips button:text-is('{cat}')"); pg.click(f".catgrid button:has-text('{item}')"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(120)
        pg.keyboard.press("Escape"); pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(80)
    place("Yatak odası", "Çift kişilik yatak", -85, -30)
    place("Yatak odası", "Gardırop", -85, 85)
    place("Oturma", "Üçlü kanepe", 20, -72)
    place("Yemek", "Yuvarlak masa", 15, 10)
    place("Yemek", "Sandalye", -3, 10)
    place("Çalışma / Diğer", "Halı", 20, -45)
    pg.click(".modes >> text=Merdiven"); pg.mouse.click(*P(75,20)); pg.wait_for_timeout(250)
    pg.click(".floors >> text=+ Kat"); pg.wait_for_timeout(300)
    pg.click("text=Alt katın duvarlarını kopyala"); pg.wait_for_timeout(300)
    for x,y in [(-90,-90),(50,-90),(-90,100),(30,100),(110,-30)]: pg.click(".modes >> text=Pencere"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(150)
    pg.click(".floors >> text=Zemin kat"); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-0-plan.png")
    pg.click(".modes >> text=Çevre"); pg.wait_for_timeout(150)
    def envplace(kind, x, y):
        pg.click(f".catgrid button:has-text('{kind}')"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(150)
        pg.keyboard.press("Escape"); pg.click(".modes >> text=Çevre"); pg.wait_for_timeout(80)
    envplace("Ağaç", -215, 60); envplace("Çam", 220, 90); envplace("Çalı", -150, 120); envplace("Yol", 235, -60); envplace("Komşu bina", -200, -110)
    pg.screenshot(path=f"{OUT}{tag}-{name}-e-plan.png")
    envn = pg.locator(".side .muted.small").last.inner_text()
    # 3D
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas", timeout=90000); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}{tag}-{name}-1-3d-noon.png")
    # sabah güneşi (saat 8, Aralık)
    pg.locator(".side select").nth(1).select_option("12") if False else None
    sels = pg.locator(".side select")
    cnt = sels.count()
    month_sel = pg.locator(".side label.edge:has(> span:text-is('Ay')) select")
    month_sel.select_option("12")
    rng = pg.locator(".side input[type=range]").first
    rng.evaluate("e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(e,'9'); e.dispatchEvent(new Event('input',{bubbles:true})); }")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}{tag}-{name}-2-3d-dec9.png")
    rng.evaluate("e => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(e,'17'); e.dispatchEvent(new Event('input',{bubbles:true})); }")
    month_sel.select_option("6")
    pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}{tag}-{name}-3-3d-jun17.png")
    # orta tuşla döndür
    vb = pg.locator(".v3 canvas").bounding_box()
    vx, vy = vb["x"] + vb["width"]/2, vb["y"] + vb["height"]/2
    mid_ok = None
    if not mobile:
        pg.mouse.move(vx, vy); pg.mouse.down(button="middle"); pg.mouse.move(vx+260, vy-30, steps=10); pg.mouse.up(button="middle"); pg.wait_for_timeout(400)
        pg.screenshot(path=f"{OUT}{tag}-{name}-4-3d-middle.png")
    two_ok = None
    if mobile:
        import hashlib
        before = hashlib.md5(pg.screenshot(clip={"x": vb["x"], "y": vb["y"]+70, "width": vb["width"], "height": vb["height"]-140})).hexdigest()
        cdp = ctx.new_cdp_session(pg)
        import math
        def pts(a, d):
            return [{"x": vx + d*math.cos(a), "y": vy + d*math.sin(a), "id": 1}, {"x": vx - d*math.cos(a), "y": vy - d*math.sin(a), "id": 2}]
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pts(0, 80)})
        for i in range(1, 13):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": pts(i*0.1, 80)})
            pg.wait_for_timeout(30)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        pg.wait_for_timeout(500)
        after = hashlib.md5(pg.screenshot(clip={"x": vb["x"], "y": vb["y"]+70, "width": vb["width"], "height": vb["height"]-140})).hexdigest()
        two_ok = before != after
        pg.screenshot(path=f"{OUT}{tag}-{name}-4-3d-twofinger.png")
    # odaya gir
    pg.click("text=İçeri gir (360°)"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-5-walk.png")
    # ileri yürü + etrafa bak
    if mobile:
        btn = pg.locator(".pad .up").bounding_box()
        pg.mouse.move(btn["x"]+20, btn["y"]+20)
        pg.evaluate("() => 0")
        pg.dispatch_event(".pad .up", "pointerdown", {"pointerId": 7, "pointerType": "touch", "isPrimary": True})
        pg.wait_for_timeout(700)
        pg.dispatch_event(".pad .up", "pointerup", {"pointerId": 7, "pointerType": "touch"})
    else:
        pg.keyboard.down("w"); pg.wait_for_timeout(700); pg.keyboard.up("w")
        pg.keyboard.down("e"); pg.wait_for_timeout(900); pg.keyboard.up("e")
    pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}{tag}-{name}-6-walk-moved.png")
    if not mobile:
        pg.mouse.move(vx, vy); pg.mouse.down(); pg.mouse.move(vx-220, vy+10, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}{tag}-{name}-7-walk-look.png")
    # duvara dokun -> renk panelini gör
    (pg.touchscreen.tap(vx+130, vy-70) if mobile else pg.mouse.click(vx, vy)); pg.wait_for_timeout(500)
    pk = pg.locator(".pk h4")
    pick_txt = pk.first.inner_text() if pk.count() else "YOK"
    if pk.count():
        pg.locator(".pk .sw button").nth(3).click(); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}{tag}-{name}-8-walk-pick.png")
    pg.click("text=⬅ Dışarı çık"); pg.wait_for_timeout(600)
    pg.screenshot(path=f"{OUT}{tag}-{name}-9-exit.png")
    ctx.close()
    return {"two_finger_rotated": two_ok, "env": envn, "pick": pick_txt, "errors": [e for e in errs if "ReadPixels" not in e][:10]}

with sync_playwright() as p:
    print(json.dumps({"desktop": run(p, "desktop", {"width":1280,"height":800}, False), "phone": run(p, "phone", {"width":390,"height":844}, True)}, ensure_ascii=False))
