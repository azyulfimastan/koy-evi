import os
import sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")

def run(p, name, vp, mobile):
    ctx = p.chromium.launch().new_context(viewport=vp, has_touch=mobile, is_mobile=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1')"); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE); pg.wait_for_selector("input[type=password]")
    pg.fill("input[type=password]", PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input", f"Esya {name}"); pg.click("button.primary"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(500)
    box = pg.locator("canvas").bounding_box()
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
    pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(200)
    def place(cat, item, x, y):
        pg.click(f".chips button:text-is('{cat}')"); pg.click(f".catgrid button:has-text('{item}')"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(150)
        pg.keyboard.press("Escape")  # seçimi bırak
        pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(100)
    place("Yatak odası", "Çift kişilik yatak", -80, -35)
    place("Yatak odası", "Gardırop", -80, 85)
    place("Oturma", "Üçlü kanepe", 45, -60)
    place("Mutfak", "Ocak", 90, 80)
    place("Mutfak", "Evye", 55, 85)
    place("Yemek", "Yuvarlak masa", 50, 20)
    place("Banyo", "Klozet", -40, 80)
    # özel eşya
    pg.click(".chips button:text-is('Özel')")
    pg.fill(".edge input[placeholder='Örn. Dolap']", "Sandık")
    pg.locator(".row3 input").nth(0).fill("80"); pg.locator(".row3 input").nth(1).fill("40"); pg.locator(".row3 input").nth(2).fill("50")
    pg.click("text=Listeye ekle ve seç"); pg.mouse.click(*P(-130,-70)); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-1-items.png")
    h3 = pg.locator(".side h3").first.inner_text()
    pg.click("text=↻ 90° döndür"); pg.wait_for_timeout(200)
    angle = pg.locator(".side .edge input").nth(4).input_value()
    pg.screenshot(path=f"{OUT}{tag}-{name}-2-rot.png")
    # yeniden aç
    pg.click("text=← Evlerim"); pg.wait_for_selector(".pcard"); pg.click(".pcard .link >> nth=0"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(700)
    pg.click(".modes >> text=Seç"); pg.wait_for_timeout(200)
    info = pg.locator(".side .muted.small").first.inner_text()
    pg.screenshot(path=f"{OUT}{tag}-{name}-3-reopen.png")
    ctx.close()
    return {"selected": h3, "angle": angle, "info": info, "errors": [e for e in errs if "401" not in e]}

with sync_playwright() as p:
    print(json.dumps({"desktop": run(p, "desktop", {"width":1280,"height":800}, False), "phone": run(p, "phone", {"width":390,"height":844}, True)}, ensure_ascii=False))
