import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")

def run(p, name, vp, mobile):
    ctx = p.chromium.launch().new_context(viewport=vp, has_touch=mobile, is_mobile=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')"); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE); pg.wait_for_selector("input[type=password]")
    pg.fill("input[type=password]", PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input", f"Cizim {name}"); pg.click("button.primary"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(500)
    box = pg.locator("canvas").bounding_box()
    cx, cy = box["x"] + box["width"]/2, box["y"] + box["height"]/2
    sc = min(box["width"], box["height"]) / 520
    P = lambda x, y: (cx + x*sc, cy + y*sc)
    arsa = [(-190,-130),(170,-130),(210,-20),(170,140),(-100,160),(-190,80)]
    for x,y in arsa: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(50)
    pg.mouse.click(*P(*arsa[0])); pg.wait_for_timeout(250)
    pg.click(".modes >> text=Duvar")
    out = {}
    # 1) hafif eğik fare ile çiz -> yatay kilit
    pg.mouse.click(*P(-150,-90)); pg.wait_for_timeout(80)
    pg.mouse.move(*P(100,-84)); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-1-kilit.png")
    pg.mouse.click(*P(100,-84)); pg.wait_for_timeout(100)
    # 2) aşağı doğru hafif eğik -> dik (90°)
    pg.mouse.move(*P(106,50)); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-2-dik.png")
    pg.mouse.click(*P(106,50)); pg.wait_for_timeout(100)
    # 3) rakam yaz: 3 m
    pg.mouse.move(*P(-60,52)); pg.wait_for_timeout(150)
    if not mobile:
        pg.keyboard.press("3"); pg.wait_for_timeout(150)
    else:
        pg.click("text=📏 Ölçü yaz"); pg.keyboard.type("3"); pg.wait_for_timeout(150)
    out["lenbox_draw"] = pg.locator(".lenbox input").count()
    pg.screenshot(path=f"{OUT}{tag}-{name}-3-olcu-yaz.png")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    pg.click("text=Duvarı bitir"); pg.wait_for_timeout(100)
    # 4) çift tıkla ölçü değiştir
    pg.click(".modes >> text=Seç"); pg.wait_for_timeout(150)
    pg.mouse.click(*P(-20,-90)); pg.wait_for_timeout(120)
    pg.mouse.click(*P(-20,-90)); pg.wait_for_timeout(250)
    out["lenbox_dbl"] = pg.locator(".lenbox input").count()
    pg.screenshot(path=f"{OUT}{tag}-{name}-4-cift-tik.png")
    pg.fill(".lenbox input", "5,5"); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    out["len_after"] = pg.locator(".side .edge input").first.input_value()
    # 5) 90° / düz yap
    out["straight_btn"] = pg.locator("text=90° / düz yap").count()
    if out["straight_btn"]: pg.click("text=90° / düz yap"); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{OUT}{tag}-{name}-5-son.png")
    ctx.close()
    out["errors"] = [e for e in errs if "401" not in e]
    return out

with sync_playwright() as p:
    print(json.dumps({"desktop": run(p, "desktop", {"width":1280,"height":800}, False), "phone": run(p, "phone", {"width":390,"height":844}, True)}, ensure_ascii=False))
