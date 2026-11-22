# Akıcılık ölçümü: 4 kat yavaşlatılmış işlemciyle (telefon benzeri) kare süreleri
import os, sys, json
from playwright.sync_api import sync_playwright
from fixture import house
BASE, PW, tag = sys.argv[1], sys.argv[2], sys.argv[3]
ARGS=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]
FR = """() => { window.__fr=[]; let last=performance.now(); const f=(t)=>{ window.__fr.push(t-last); last=t; if(window.__frOn) requestAnimationFrame(f)}; window.__frOn=true; requestAnimationFrame(f); }"""
STOP = """() => { window.__frOn=false; const a=window.__fr.slice(2); a.sort((x,y)=>x-y); const avg=a.reduce((s,x)=>s+x,0)/Math.max(1,a.length); return {frames:a.length, ort_ms:Math.round(avg), p90_ms:Math.round(a[Math.floor(a.length*0.9)]||0), en_kotu_ms:Math.round(a[a.length-1]||0)} }"""
with sync_playwright() as p:
    ctx=p.chromium.launch(args=ARGS).new_context(viewport={"width":1280,"height":800})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); pg.set_default_timeout(120000)
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.evaluate("""async (d)=>{const p=await (await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Akıcılık'})})).json();
      p.data=d; await fetch('/api/projects/'+p.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)}); sessionStorage.setItem('kte_open',p.id)}""", house())
    pg.reload(); pg.wait_for_selector(".cv canvas"); pg.wait_for_timeout(800)
    cdp=ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate",{"rate":4})
    box=pg.locator(".cv canvas").bounding_box(); cx=box["x"]+box["width"]/2; cy=box["y"]+box["height"]/2
    out={}
    # 1) eşya aracıyla gezinme (önizleme)
    pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(300)
    pg.locator(".catgrid button").first.click() if pg.locator(".catgrid button").count() else None
    pg.evaluate(FR)
    for i in range(40): pg.mouse.move(cx-150+i*8, cy-40+(i%5)*6)
    out["2d_esya_onizleme"]=pg.evaluate(STOP)
    pg.keyboard.press("Escape"); pg.click(".modes >> text=Seç"); pg.wait_for_timeout(300)
    # 2) plan kaydırma (boş alanda sürükle)
    pg.evaluate(FR)
    pg.mouse.move(box["x"]+40, box["y"]+box["height"]-60); pg.mouse.down()
    for i in range(40): pg.mouse.move(box["x"]+40+i*6, box["y"]+box["height"]-60-i*2)
    pg.mouse.up()
    out["2d_kaydirma"]=pg.evaluate(STOP)
    # 3) bir eşyayı sürükle (salondaki kanepe: dünya koordinatından ekrana)
    # 3D
    pg.click(".floors .v3btn >> nth=0"); pg.wait_for_selector(".v3 canvas"); pg.wait_for_timeout(4000)
    vb=pg.locator(".v3 canvas.v3cv").bounding_box(); vx=vb["x"]+vb["width"]/2; vy=vb["y"]+vb["height"]/2
    pg.evaluate(FR)
    pg.mouse.move(vx,vy); pg.mouse.down()
    for i in range(30): pg.mouse.move(vx+i*8, vy+(i%3))
    pg.mouse.up(); pg.wait_for_timeout(200)
    out["3d_dondurme"]=pg.evaluate(STOP)
    print(json.dumps(out, ensure_ascii=False))
