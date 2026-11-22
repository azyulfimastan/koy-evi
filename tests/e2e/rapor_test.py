import os
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

def run(p, name, vp, mobile):
    ctx = p.chromium.launch(args=ARGS).new_context(viewport=vp, has_touch=mobile, is_mobile=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')"); pg = ctx.new_page(); errs = []
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
    pg.click("text=Rapor"); pg.wait_for_selector(".rpt .rsec"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}{tag}-{name}-r1-report.png")
    txt = pg.locator(".rbody").inner_text()
    pg.locator(".rbody").evaluate("e => e.scrollTop = 700"); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-r2-report-scroll.png")
    with pg.expect_download(timeout=120000) as d:
        pg.click("text=PDF indir")
    path = f"/tmp/{tag}-{name}.pdf"; d.value.save_as(path)
    import os
    return {"txt": txt[:700], "pdf": os.path.getsize(path), "errors": errs}

with sync_playwright() as p:
    out = {"desktop": run(p, "desktop", {"width": 1280, "height": 800}, False), "phone": run(p, "phone", {"width": 390, "height": 844}, True)}
    print(json.dumps(out, ensure_ascii=False))
