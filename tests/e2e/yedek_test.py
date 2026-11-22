# v1.2: şablon, yedek indir/yükle, sürüm geçmişi, çöp kutusu
import sys, json, os
from playwright.sync_api import sync_playwright
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
def run(p, name, vp, mobile):
    ctx=p.chromium.launch(args=ARGS).new_context(viewport=vp,has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1, accept_downloads=True)
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(60000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    out={}
    nm=f"Şablon testi {name}"
    pg.fill(".newp input", nm); pg.click(".tpl:has-text('Küçük köy evi')")
    pg.screenshot(path=f"{OUT}{tag}-{name}-list-tpl.png")
    pg.click(".newp button.primary"); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(1200)
    out["info"]=pg.locator(".info, .stats, .muted:has-text('duvar')").first.inner_text() if pg.locator(".info, .stats, .muted:has-text('duvar')").count() else ""
    pg.screenshot(path=f"{OUT}{tag}-{name}-tpl-plan.png")
    # bir değişiklik: kat ekle → kayıt → sürüm oluşur (önceki hâl)
    pg.click("text=+ Kat"); pg.wait_for_timeout(1500)
    pg.click(".bar .bak"); pg.wait_for_selector(".mcard"); pg.wait_for_selector(".hrow, .mcard .muted:has-text('Henüz')")
    pg.wait_for_timeout(800)
    out["snaps"]=pg.locator(".hrow").count()
    pg.screenshot(path=f"{OUT}{tag}-{name}-backup.png")
    with pg.expect_download() as d:
        pg.click("text=Yedeği indir")
    path=f"/tmp/{tag}-{name}-yedek.json"; d.value.save_as(path)
    j=json.load(open(path)); out["backup_floors"]=len(j["projects"][0]["data"]["floors"])
    if out["snaps"]:
        pg.click(".hrow >> nth=0 >> text=Bu sürüme dön"); pg.click("text=Evet, dön"); pg.wait_for_selector(".mcard .note")
        out["restore_note"]=pg.locator(".mcard .note").inner_text()
        pg.click(".mhead button"); pg.wait_for_timeout(600)
        out["floors_after_restore"]=pg.locator(".floors button").filter(has_text="kat").count()
    else:
        pg.click(".mhead button")
    pg.click("text=← Evlerim"); pg.wait_for_selector(".pcard")
    # yedekten yükle
    pg.set_input_files(".bkbar input[type=file]", path); pg.wait_for_selector(".note"); out["import"]=pg.locator(".note").inner_text()
    # sil → çöp kutusu → geri getir
    card=pg.locator(".pcard", has_text=nm).first
    card.locator("button[aria-label='Sil']").click(); card.locator("text=Çöpe at").click(); pg.wait_for_selector(".trash")
    pg.click(".trash .link"); pg.wait_for_selector(".trow")
    pg.screenshot(path=f"{OUT}{tag}-{name}-trash.png", full_page=True)
    pg.locator(".trow", has_text=nm).first.locator("text=Geri getir").click(); pg.wait_for_timeout(1500)
    out["restored_in_list"]=pg.locator(".pcard", has_text=nm).count()
    out["errors"]=errs
    return out
with sync_playwright() as p:
    print(json.dumps({"desktop":run(p,"desktop",{"width":1280,"height":800},False),"phone":run(p,"phone",{"width":390,"height":844},True)},ensure_ascii=False))
