# Quantum Flow Predictor

`AI Predictive Flow (Zeiierman)` göstergesinin geç sinyal problemi çözülerek yeniden
tasarlanmış hali. BIST günlük/haftalık ve BTC/ETH gibi kripto varlıklar için ayrı
hazır ayar setleri var.

```
indicators/quantum_flow_predictor.pine   TradingView göstergesi (Pine v6)
backtest/qfp.py                          motorun birebir Python portu
backtest/selftest.py                     doğrulama testleri
backtest/backtest.py                     gerçek veriyle backtest aracı
```

---

## 1. Eski kod neden geç kalıyordu

Sorun kNN mantığında değil, sinyalin üretilme biçimindeydi:

```pine
pred_ = ta.ema(pred, smth)     // EMA #1  (5)
osc   = ta.ema(predSm, oscLn)  // EMA #2  (3)
sig   = ta.ema(osc, sigLn)     // EMA #3  (5)
bull  = ta.crossover(osc, sig) // ve daha sonra kesişim bekleniyor
```

Üst üste üç EMA, ardından bir kesişim şartı. Sadece filtre gecikmesi ~10 bar, kesişimin
oluşması da ek bar istiyor. Üstelik `ahead = 2` ile 2 bar ilerisi tahmin edilip sonuç
10+ bar geciktiriliyordu.

İkinci sorun: kNN, K komşunun sonucunun **ağırlıklı ortalamasını** alıp tek bir sayı
üretiyordu. Ortalama, "5 komşu güçlü yukarı + 5 komşu güçlü aşağı" ile "10 komşu da
kararsız" durumunu aynı gösterir. Bilginin tamamı ortalamada kayboluyordu.

## 2. Yeni yaklaşım — olasılık bulutu

Tek bir tarihsel benzer örnek tek bir elektron gibidir; ona bakarak bir şey söylenemez.
Yüzlerce benzeri aynı anda ağırlıklandırınca ortaya bir **bulut** çıkar: bir sonraki
barın gidebileceği tüm ihtimallerin dağılımı. Bu kod ortalamayı değil, bulutun
**şeklini** işler.

Her barda K komşudan ağırlıklı bir ampirik dağılım kurulur ve şunlar çıkarılır:

| Büyüklük | Anlamı |
|---|---|
| `P(up)` | Bulutun sıfırın üstünde kalan ağırlık oranı |
| `Edge` = 2·P(up)−1 | Yön eğilimi, −1…+1 |
| `Coherence` | Bulut ne kadar tek bir cevaba çökmüş — belirsizliğin tersi |
| `q05…q95` | Dağılımın kantilleri — ekrandaki bulut bantları |
| `Expected move` | Medyan tahmin, ATR biriminde |

**Coherence** iki bileşenin ortalaması: yön entropisinin karekökü (`√(1−H)`) ve ağırlıklı
ortalamanın Kish etkin örneklem sayısı üzerinden hesaplanan t-istatistiği
(`t/(t+1.5)`). Bulut dağınıksa düşük, tek bir cevaba çökmüşse yüksek olur. İşlem sadece
bulut hem **yönlü** hem **derli toplu** olduğunda açılır — asıl kalite filtresi budur.

### Uzay-zaman örneklemesi

Örüntü, son N barın tamamı yerine **geometrik aralıklı zaman dilimlerinden** örneklenir:

```
lag = (len-1) · (s/(slices-1))^1.6      →  len=24, slices=4 için  0, 3, 11, 23
```

Yakın geçmiş ince, uzak geçmiş kaba çözünürlükle örneklenir. Mesafe metriğinde her dilim
ayrıca zaman sönümü ile ağırlıklandırılır (`ışık konisi`): şu ana yakın dilim daha çok
belirler. Bu hem çok daha hızlı hem de rejim değişimlerine daha duyarlı.

### Momentum ateşlemesi (ignition)

kNN'in yapısal körlüğü şudur: taze bir rejimin bellekte örneği yoktur, bu yüzden bulut
15–20 bar boyunca kararsız hatta yanlış kalır. Bunun için ivmeye dayalı bir kısa yol var:

```
thrust = 0.5·f1 + 0.3·f2 + 0.2·f5        (hız, momentum, ivme — hepsi ATR-normalize)
```

Thrust eşiği aşarsa **ve** bulut aynı yöne bakıyorsa (veto hakkı bulutta kalır) işlem
erken açılır. Ölçüm sonucu: sinyal sayısı 141→154 artarken rejim kırılmasındaki gecikme
**+19 bardan +1 bara** düştü, isabet oranı hiç bozulmadı.

### Gecikmeyi azaltan diğer değişiklikler

- Üç katlı EMA zinciri ve kesişim şartı tamamen kaldırıldı. Sinyal doğrudan olasılıktan
  üretilir.
- Kalan tek yumuşatma sıfır-gecikmeli EMA (varsayılan uzunluk 2).
- Tüm özellikler ATR ile normalize — BIST'in %10 günlük oynaklığı ile BTC'nin oynaklığı
  aynı ölçekte karşılaştırılır, boşluklar (gap) log getiri ile doğal olarak işlenir.

## 3. Ekranın okunuşu

- **Bulut bantları** — %90 / %60 / %30 olasılık aralıkları. Dar ve tek renk = kararlı
  beklenti; geniş ve sıfırı kapsıyor = fikir yok, girme.
- **Beklenen yol** (kalın çizgi) — medyan tahmin, ATR biriminde. Çizginin saydamlığı
  coherence ile değişir: soluk = güvensiz.
- **Kanaat kolonları** — `Edge × Coherence`.
- **Arka plan** — tahmin edilen rejim.
- **Üçgenler** giriş, **noktalar** erken uyarı, **×** "kenara çekil".
- **Panel** — P(up), coherence, beklenen hareket, hedef fiyat, durum ve göstergenin
  kendi sinyallerinin geçmiş isabet oranı.

Paneldeki `Hit rate` alanı önemlidir: sistem kendi sinyallerini geriye dönük puanlar,
yani parametreleri o sembolde körlemesine değil ölçerek ayarlayabilirsiniz.

## 4. Ayarlar

**Preset** enstrümanı seçer: `BIST Daily`, `BIST Weekly`, `Crypto Daily`,
`Crypto Intraday`, `Custom`.

**Signal Mode** agresifliği seçer:

| Mod | Edge | Coherence | Min hareket | Ateşleme | Karakter |
|---|---|---|---|---|---|
| Early | 0.13 | 0.22 | 0.10 ATR | açık (0.85) | çok sinyal, erken, gürültülü |
| Balanced | 0.20 | 0.34 | 0.18 ATR | açık (1.25) | varsayılan |
| Conservative | 0.30 | 0.48 | 0.30 ATR | kapalı | az ama seçici sinyal |

`Confirm On Bar Close` varsayılan **açık** — sinyaller sadece bar kapanışında basılır,
yani geçmişe dönük repaint yoktur. Kapatırsanız bar içinde daha erken görürsünüz ama
sinyal bar kapanana kadar geçicidir.

BIST'te açığa satış yoksa `Conservative` + sadece uzun (long) tarafı kullanın.

## 5. Backtest

Bu depodaki `backtest/qfp.py`, Pine kodunun bar-bar birebir Python portudur — Pine test
edilemediği için doğrulama burada yapılır.

```bash
pip install numpy

python3 backtest/selftest.py                                   # doğrulama testleri
python3 backtest/backtest.py --binance BTCUSDT --interval 1d --preset crypto_daily --modes
python3 backtest/backtest.py --yahoo THYAO.IS --preset bist_daily --long-only --cost-bps 15
python3 backtest/backtest.py --csv TradingView_export.csv --preset bist_weekly
```

TradingView'den CSV dışa aktarıp `--csv` ile de verebilirsiniz.

### Bu ortamda çalıştırılan doğrulama sonuçları

```
[leakage]    5 kesim noktası, |tam seri − kesilmiş seri| farkı = 0.000e+00
[randomwalk] 12 koşu, 1978 sinyal, ortalama isabet = 48.5%
[learnable]  8 koşu, 1859 sinyal, ortalama isabet = 65.7%
[latency]    rejim kırılması: motor +1 bar, bulut-only +19 bar, eski EMA zinciri +14 bar
```

Sırasıyla: geleceğe bakma (lookahead) sızıntısı **yok**; saf gürültüde sahte bir üstünlük
uydurmuyor (%48.5 ≈ yazı-tura); içine gerçek bir örüntü gömülmüş seride onu buluyor
(%65.7); ve rejim değişimine eski kodun kesişim mantığından daha hızlı tepki veriyor.

## 6. Dürüst sınırlar

- **Bu ortamda gerçek piyasa verisiyle backtest yapılamadı.** Ağ politikası Binance,
  Yahoo Finance ve TradingView dahil tüm piyasa-veri sunucularını kapatıyor (403).
  Yukarıdaki sayılar sentetik serilerden ve doğrulama testlerinden gelir; BIST veya BTC
  getirisi hakkında hiçbir şey söylemezler. Gerçek rakamlar için yukarıdaki komutları
  kendi makinenizde çalıştırın.
- Yüksek kazanma oranı garanti edilemez. Bu kod **erken ve ölçülebilir** sinyal üretir;
  bir sembolde gerçekten kâr edip etmediği panelin `Hit rate` alanı ve backtest ile
  test edilmelidir.
- kNN yalnızca **benzeri daha önce yaşanmış** durumları öngörebilir. Görülmemiş bir
  şok (temettü, sermaye artırımı, tavan-taban serisi, borsa kapanışı) için bellekte
  karşılık yoktur; ignition yolu bu boşluğu kısmen kapatır, tamamen değil.
- Sinyal sıklığı çok artarsa `Cooldown Bars` ve `Coherence Threshold` değerlerini
  yükseltin: BIST'te işlem maliyeti + spread, sık işlemde tek başına kazandırmaz.

Lisans: CC BY-NC-SA 4.0 (orijinal eserden devralındı).
