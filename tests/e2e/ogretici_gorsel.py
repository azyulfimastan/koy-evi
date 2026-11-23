# Öğretici: sıfırdan iki katlı küçük ev çizerken adım adım, kırmızı çerçeveli ekran görüntüleri
import os, sys, json
from playwright.sync_api import sync_playwright
BASE, PW = sys.argv[1], sys.argv[2]
OUT = "/home/claude/ogretici/"
JS_ON = """([sel, text, pad, where]) => {
  const r = sel;
  const d = document.createElement('div'); d.className='__hl';
  d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px;border:4px solid #e11d48;border-radius:12px;box-shadow:0 0 0 3px rgba(255,255,255,.7)`;
  document.body.appendChild(d);
  if (text) { const t = document.createElement('div'); t.className='__hl';
    const y = where==='below' ? r.bottom+pad+8 : r.top-pad-42;
    t.style.cssText = `position:fixed;z-index:99999;pointer-events:none;left:${Math.max(8,Math.min(r.left-pad, innerWidth-330))}px;top:${Math.max(6,y)}px;background:#e11d48;color:#fff;font:600 15px system-ui;padding:7px 12px;border-radius:9px;max-width:320px`;
    t.textContent = text; document.body.appendChild(t); }
  return true; }"""
JS_OFF = "() => document.querySelectorAll('.__hl').forEach(e=>e.remove())"
with sync_playwright() as p:
    ctx=p.chromium.launch().new_context(viewport={"width":1280,"height":800})
    ctx.add_init_script("localStorage.setItem('kte_guide','off');localStorage.setItem('kte_fold','open');localStorage.setItem('kte_nothumb','1')")
    pg=ctx.new_page(); errs=[]; pg.set_default_timeout(60000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    def shot(name, marks=()):
        for m in marks:
            try:
                bb = pg.locator(m[0]).first.bounding_box()
                if bb: pg.evaluate(JS_ON, [{"left":bb["x"],"top":bb["y"],"right":bb["x"]+bb["width"],"bottom":bb["y"]+bb["height"],"width":bb["width"],"height":bb["height"]}, m[1], m[2], m[3]])
            except Exception as e: errs.append("hl "+str(e)[:60])
        pg.wait_for_timeout(150); pg.screenshot(path=f"{OUT}{name}.png"); pg.evaluate(JS_OFF)
    pg.goto(BASE); pg.fill("input[type=password]",PW); pg.click("button.primary"); pg.wait_for_selector(".page")
    pg.fill(".newp input","Benim evim")
    shot("a01-yeni-ev", [(".tpl:has-text('Boş arsa')","1) Boş arsa seç",6,"below"), (".newp button.primary","2) Oluştur",6,"below")])
    pg.click(".tpl:has-text('Boş arsa')"); pg.click(".newp button.primary"); pg.wait_for_selector("canvas"); pg.wait_for_timeout(700)
    box=pg.locator("canvas").first.bounding_box(); cx,cy=box["x"]+box["width"]/2,box["y"]+box["height"]/2; sc=min(box["width"],box["height"])/520
    P=lambda x,y:(cx+x*sc,cy+y*sc)
    # ARSA
    arsa=[(-200,-130),(180,-130),(210,0),(170,140),(-110,160),(-200,70)]
    for x,y in arsa[:4]: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(60)
    shot("a02-arsa", [(".modes button:has-text('Arsa')","Arsa aracı: köşelere sırayla dokun",4,"below")])
    for x,y in arsa[4:]: pg.mouse.click(*P(x,y)); pg.wait_for_timeout(60)
    pg.mouse.click(*P(*arsa[0])); pg.wait_for_timeout(250)
    # DUVAR
    pg.click(".modes >> text=Duvar")
    pg.mouse.click(*P(-150,-90)); pg.wait_for_timeout(80); pg.mouse.move(*P(110,-84)); pg.wait_for_timeout(250)
    shot("a03-duvar-kilit", [(".modes button:has-text('Duvar')","Duvar aracı",4,"below")])
    pg.mouse.click(*P(110,-84)); pg.mouse.move(*P(106,100)); pg.wait_for_timeout(250)
    shot("a04-duvar-90")
    pg.mouse.click(*P(106,100)); pg.wait_for_timeout(60)
    pg.mouse.click(*P(-150,100)); pg.wait_for_timeout(60); pg.mouse.click(*P(-150,-90)); pg.wait_for_timeout(200)
    # iç duvar
    pg.mouse.click(*P(-20,-90)); pg.wait_for_timeout(60); pg.mouse.click(*P(-20,100)); pg.wait_for_timeout(60); pg.mouse.click(*P(-20,100)); pg.wait_for_timeout(150)
    # rakamla ölçü: yeni duvar 3 m
    pg.click(".modes >> text=Seç"); pg.wait_for_timeout(150)
    pg.mouse.click(*P(40,-90)); pg.wait_for_timeout(100); pg.mouse.click(*P(40,-90)); pg.wait_for_timeout(250)
    shot("a05-cift-tik-olcu")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    # KAPI / PENCERE
    pg.click(".modes >> text=Kapı"); pg.mouse.click(*P(-60,100)); pg.wait_for_timeout(250)
    pg.click(".modes >> text=Kapı"); pg.mouse.click(*P(-20,20)); pg.wait_for_timeout(250)
    shot("a06-kapi", [(".modes button:has-text('Kapı')","Kapı aracı: duvara dokun",4,"below")])
    for x,y in [(-100,-90),(60,-90),(110,-10),(-150,0),(40,100)]:
        pg.click(".modes >> text=Pencere"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(200)
    shot("a07-pencere", [(".modes button:has-text('Pencere')","Pencere aracı: duvara dokun",4,"below")])
    # ODA
    pg.click(".modes >> text=Oda"); pg.mouse.click(*P(-85,-40)); pg.wait_for_timeout(400)
    shot("a08-oda-renk-zemin", [(".modes button:has-text('Oda')","Oda aracı: odanın içine dokun",4,"below"), (".side","Adı, rengi ve zemini buradan",4,"below")])
    pg.click(".modes >> text=Oda"); pg.mouse.click(*P(45,-40)); pg.wait_for_timeout(400)
    # DUVAR RENGİ / YÜKSEKLİK
    pg.click(".modes >> text=Seç"); pg.wait_for_timeout(100); pg.mouse.click(*P(-48,-90)); pg.wait_for_timeout(400)
    shot("a09-duvar-renk-yukseklik", [(".side","Kalınlık, yükseklik ve boya rengi",4,"below")])
    # EŞYA
    pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(300)
    shot("a10-esya-secimi", [(".chips","Önce kategori seç",4,"below"), (".catgrid","Sonra eşyaya dokun, planda yerine dokun",4,"above")])
    def place(cat,item,x,y):
        pg.click(f".chips button:text-is('{cat}')"); pg.click(f".catgrid button:has-text('{item}')"); pg.mouse.click(*P(x,y)); pg.wait_for_timeout(150)
        pg.keyboard.press("Escape"); pg.click(".modes >> text=Eşya"); pg.wait_for_timeout(100)
    for a in [("Oturma","Üçlü kanepe",-85,60),("Yatak odası","Çift kişilik yatak",50,-30),("Mutfak","Ocak",-110,-70),("Mutfak","Evye",-70,-70)]:
        try: place(*a)
        except Exception as e: errs.append("place "+a[1]+" "+str(e)[:80])
    pg.mouse.click(*P(160,-120)); pg.wait_for_timeout(300)
    shot("a11-esya-yerlesti")
    # 2. KAT
    pg.click(".floors .add"); pg.wait_for_timeout(600)
    shot("a12-yeni-kat", [(".floors .add","+ Kat ile yeni kat ekle",4,"below")])
    pg.click("text=Alt katın duvarlarını kopyala"); pg.wait_for_timeout(700)
    shot("a13-ust-kat-duvarlar", [("text=Alt katın duvarlarını kopyala","Alt katın duvarlarını kopyala",4,"below")])
    pg.click(".floors >> text=Zemin kat"); pg.wait_for_timeout(300)
    # MERDİVEN
    pg.click(".modes >> text=Merdiven"); pg.wait_for_timeout(200); pg.mouse.click(*P(70,60)); pg.wait_for_timeout(500)
    shot("a14-merdiven", [(".modes button:has-text('Merdiven')","Merdiven aracı",4,"below")])
    # ÇATI
    pg.click(".modes >> text=Çatı"); pg.wait_for_timeout(400)
    shot("a15-cati", [(".modes button:has-text('Çatı')","Çatı: tür, eğim, renk",4,"below")])
    # 3D
    pg.click(".floors .v3btn >> nth=0") if False else None
    print(json.dumps({"errors":errs}, ensure_ascii=False))
