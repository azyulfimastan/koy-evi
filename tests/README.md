# Köy Evi Tasarım — testler

## Hızlı birim testleri (saniyeler)
```
npm test
```
Şablonları, oda alanı hesabını, yedek dosyası okumayı ve bozuk veri onarmayı dener.

## Tarayıcı testleri (Python + Playwright)
Bilgisayar ve telefon boyutunda gerçek tarayıcıyla uygulamayı kullanır, ekran görüntüsü alır.

Kurulum (bir kez):
```
pip install playwright && python -m playwright install chromium
```
Uygulamayı test şifresiyle başlat:
```
npm run build && APP_PASSWORD=test1234 npx next start -p 3100
```
Sonra `tests/e2e` klasöründen (görüntüler `tests/shots/` içine düşer):

| Dosya | Ne dener |
|---|---|
| `esya_test.py` | eşya ekleme/döndürme, kayıt |
| `ucboyut_test.py` | 3D, çevre nesneleri, güneş, odaya girme, dokunarak seçme, iki parmak |
| `rapor_test.py` | rapor ekranı ve PDF indirme |
| `rehber_test.py` | adım adım yönlendirme |
| `kesit_test.py` | yatay/dikey kesit, kata tepeden bakış, duvardan geçme |
| `yedek_test.py` | şablon, yedek indir/yükle, sürüm geçmişi, çöp kutusu |
| `balkon_test.py` | balkon aracı, panel, şablondaki balkon, 3D |
| `demo_test.py` | uygulama içi 🎬 demo, örnek uygula düğmeleri |
| `v20_test.py` | arsa eğimi, fiyatlı metraj, elektrik-tesisat noktaları, telefonda dokunmayla ↕ tutamacı |
| `v21_test.py` | alternatif kopyala, karşılaştırma, aile özeti ve oy, Daha fazla, katlanabilir 3D panel |
| `insaat_test.py` | çatı yok, inşaat aşamaları, orta tuşla döndürme, duvarı tutup yukarı çekme, direkler |
| `akicilik_test.py` | telefon hızında kare süreleri (2D önizleme, kaydırma, 3D döndürme) |
| `cizim_test.py` | duvar çizerken 90° kilidi, rakamla ölçü, çift tıkla ölçü, 90° yap |
| `villa_gorsel.py`, `ogretici_gorsel.py` | süper ev şablonu ve öğretici için ekran görüntüleri |
| `performans_test.py` | 3 katlı büyük evde 3D kurulum süresi |
| `v22_test.py` | adım adım izle: ileri/geri, aşama atlama, oynat, Evlerim listesinden izleme |
| `v23_test.py` | sihirbaz: rakam gir, 2D + 3D önizleme, ev oluştur |
| `v24_test.py` | kaide (yükseltilmiş temel) + dış merdiven: sihirbaz, editör aracı, Yapı paneli |
| `v25_test.py` | sihirbaz ev şekilleri: L, T, U, kendi şeklim (kanatlar), çok parçalı çatı |
| `v26_test.py` | otomatik çatı parçalama, sihirbazda oda sırası / yeri / eşya yönü |
| `foto_test.py` | gerçekçi fotoğraf modu (küçük boyutta) |
| `gorsel.py`, `liste_gorsel.py` | örnek evin ekran görüntüleri |

Örnek: `cd tests/e2e && python3 yedek_test.py http://localhost:3100 test1234 deneme`
