import os
import sys, json, time
from playwright.sync_api import sync_playwright
from fixture import house
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
res = sys.argv[4] if len(sys.argv) > 4 else "360"
inside = len(sys.argv) > 5 and sys.argv[5] == "in"
phone = len(sys.argv) > 5 and sys.argv[5] == "phone"
OUT = os.environ.get("SHOTS", "tests/shots/")
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,device_scale_factor=2) if phone else p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
    ctx.add_init_script(f"localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1');localStorage.setItem('kte_photo_res','{res}')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(600000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.type+": "+m.text[:300]) if m.type in ("error",) else None)
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.evaluate("""async (d)=>{const p=await (await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Foto testi'})})).json();
      p.data=d; await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}); sessionStorage.setItem('kte_open',p.id)}""", house())
    pg.reload(); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(500)
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas",timeout=90000); pg.wait_for_timeout(3000)
    if inside:
        pg.select_option(".side select >> nth=0", label="Salon"); pg.click("text=İçeri gir"); pg.wait_for_timeout(2500)
    pg.click(".v3bar .ph"); pg.wait_for_selector(".photo")
    t0=time.time(); last=""
    while time.time()-t0 < 600:
        txt=pg.locator(".prog span").inner_text()
        if txt!=last: print(round(time.time()-t0), txt, flush=True); last=txt
        if "geçiş" in txt:
            try:
                n=int(txt.split("·")[1].strip().split("/")[0])
            except Exception: n=0
            if n>=(6 if phone else 24): break
        if "Bitti" in txt or pg.locator(".pwait.err").count(): break
        pg.wait_for_timeout(5000)
    pg.screenshot(path=f"{OUT}{tag}-photo-ui.png")
    url=pg.evaluate("document.querySelector('.pview canvas').toDataURL('image/png')")
    import base64
    open(f"{OUT}{tag}-photo.png","wb").write(base64.b64decode(url.split(",")[1]))
    print(json.dumps({"errors":errs[:5], "secs": round(time.time()-t0)}, ensure_ascii=False))
