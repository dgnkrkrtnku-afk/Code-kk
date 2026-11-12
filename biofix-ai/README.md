# BioFix AI

Tıbbi cihaz arızaları için saha asistanı. Biyomedikal teknisyen ve mühendisler arızayı yazar (isterse
fotoğraf, hata günlüğü ya da PDF ekler); asistan geliştiricilerin yüklediği servis manuellerini ve
sahadaki kullanıcıların öğrettiği çözümleri tarayıp önce saniyesinde bulduklarını gösterir, ardından
“ilk yapılacak iş”, adım adım kontrol listesi, olası nedenler, parça önerileri ve güvenlik uyarıları
içeren bir iş föyü üretir. Eklenen günlük ve ölçüm tablolarını yorumlar; adımlarda ölçülen değerleri
kılavuzdaki beklenen değerle karşılaştırır.

Bu klasör, claude.ai'daki HTML prototipinin gerçek bir mobil uygulamaya dönüştürülmüş halidir.

```
biofix-ai/
  app/      Expo (React Native) mobil uygulama — Android, iOS ve web
  server/   Node.js API sunucusu — hesaplar, bilgi bankası, ödeme doğrulama, Claude API çağrıları
  docs/     Güvenlik ve Google Play kurulum belgeleri
```

Diğer belgeler:

* [docs/GUVENLIK.md](docs/GUVENLIK.md) — alınan güvenlik önlemleri, saklanan veriler, yayın öncesi kontrol listesi
* [docs/GOOGLE-PLAY.md](docs/GOOGLE-PLAY.md) — Google Play ödemelerini açmak için adım adım kurulum

## Mimari

```
 Telefon (Expo app)  ──HTTPS/JSON──▶  server (Express)
   oturum anahtarı cihazın               ├─ Hesaplar: e-posta + şifre, oturumlar
   güvenli deposunda                     ├─ Bilgi bankası: manuel bölümleri + topluluk çözümleri (BM25 arama)
                                         ├─ Puan, plan, eğitim, pazar yeri verisi (şifrelenebilir JSON dosyası)
   Google Play ──satın alma──▶ app ──▶   ├─ Google Play Developer API: satın almaları doğrular
                                         └─ Claude API (claude-opus-5-5): teşhis ve devam sorusu (yazılırken
                                            ekrana akar), çözüm ön incelemesi, cihaz etiketi okuma,
                                            manuel okuma (taranmış PDF, sayfa fotoğrafı) ve dizinleme
```

* **Gizli anahtarlar telefonda durmaz.** Claude API anahtarı ve Google hizmet hesabı yalnızca sunucudadır.
* **Telefon hiçbir hak vermez.** Uygulama satın almayı yalnızca başlatır; planı ya da puanı sunucu,
  satın almayı Google'a doğrulattıktan sonra verir.
* **Manueller yalnızca geliştiricilerden gelir.** Yükleme uçları `ADMIN_TOKEN` ile korunur; uygulamada
  Hesap → “Geliştirici anahtarı” girilince Geliştirici paneli açılır.
* **AI anahtarı yoksa** uygulama çalışmaya devam eder: asistan hata kodunun kılavuzdaki karşılığını,
  doğrulanmış topluluk çözümlerini ve ilgili kılavuz bölümlerini listeler (“AI kapalı” modu).

### Asistan çözüme nasıl hızlı ulaştırır

Bir arıza gönderildiğinde yanıt üç katmanda gelir; ilk ikisi yapay zekâ beklemeden, anında:

1. **Hata kodu kartı.** Arızada geçen kod (`E21`, `e-21`, `hata 105`…) seçili cihazın kılavuzundaki hata
   kodu tablosunda aranır; anlamı ve çaresi en üstte gösterilir. Başka cihazın aynı adlı kodu gösterilmez.
2. **Hızlı sonuçlar.** Aynı cihazda doğrulanmış topluluk çözümleri ve en ilgili kılavuz bölümleri.
   Arama Türkçe karakter yazılmasa da çalışır ve Türkçe arızayı İngilizce kılavuzda (ya da tersini) bulur.
   Cihaz seçiliyken ve o cihazın kendi kılavuzu ya da çözümü varken yalnızca onlar kullanılır; başka
   cihazın prosedürü ne ekrana ne de AI'a gider. Hakkında henüz hiçbir şey yüklenmemiş bir cihazda ise
   benzer arızalar için genel sonuçlar gösterilir (kartlarda hangi cihaza ait olduğu yazar).
3. **AI teşhisi.** Yazılırken ekrana akar: önce özet ve **“ilk yapılacak”** iş, sonra nedenler, adımlar,
   parçalar, uyarılar. Sonunda teşhisi netleştirecek 1-3 soru önerir; yanıtlanınca devam yanıtı da akarak gelir.

Cihaz seçilince o cihazda **çözülmüş arızalar** ve **hata kodları** tek dokunuşluk kısayol olarak çıkar.
Cihaz listede aranmak yerine **etiketinin fotoğrafından** da seçilebilir.

Bekleme süresini kısaltan diğer düzenler:

* **Kayıtlı yanıt.** Yalnızca metinle sorulmuş bir arıza aynı cihaz için yeniden sorulursa (kim sorarsa sorsun)
  AI'a gidilmez; önceki yanıt anında gösterilir ve günlük hak düşülmez. Kılavuzlar ya da çözümler
  değişince kayıtlı yanıtlar geçersiz olur. Raporun üstündeki “Yeniden üret” yeni bir yanıt ister.
* **Yüklemeyi beklemeyen hızlı sonuçlar.** Fotoğraf ya da dosya eklendiğinde hızlı sonuçlar ayrı ve küçük bir
  istekle hemen gelir; yükleme arkada sürer.
* **AI yanıt veremezse** (servis yoğun, bağlantı koptu, süre doldu) hızlı sonuçlar ekranda kalır, neden
  açıkça yazılır ve “Yeniden dene” düğmesi çıkar. Başarısız istek günlük haktan düşmez.

### Veri yorumlama

* **Günlük ve tablo özeti (AI'sız, anında).** Arızaya eklenen metin dosyası bir cihaz günlüğü ya da ölçüm
  tablosuysa sunucu onu sayarak özetler: kapsadığı zaman aralığı, hata ve uyarı satırı sayısı, geçen hata
  kodları ve kaçar kez geçtikleri, tekrarlayan ölçümlerin en az / ortalama / en çok / son değeri ve gidişi
  (yükseliyor, düşüyor, sabit), en çok tekrarlanan iletiler. Dosyada geçen kodların kılavuzdaki karşılığı,
  arıza metninde hiç kod yazılmamış olsa da gösterilir.
* **Bulgular.** AI bu kesin sayıları hazır alır ve raporda “Veriden çıkan bulgular” başlığı altında her
  gözlemi tek tek yorumlar: ne görüldü, bu arıza için ne anlama geliyor, normal mi anormal mi. Kaynaklarda
  karşılaştırılacak bir değer yoksa bunu “belirsiz” olarak söyler; sınır uydurmaz.
* **Ölçüm değerlendirme.** Beklenen değeri olan her adımın yanına ölçülen değer yazılır; sunucu onu kılavuzdaki
  ifadeyle (“5,0 V ± 0,25 V”, “4,75–5,25 V”, “en az 2 MΩ”, “max 300 µA”…) anında karşılaştırır: uygun, düşük
  ya da yüksek, sapma yüzdesiyle. Birim dönüştürülür (4600 mV = 4,6 V). Sınır belirtilmemişse hüküm
  verilmez. “Ölçümlere göre yeniden değerlendir” düğmesi bu değerleri AI'a götürür; AI hangi nedenin
  güçlendiğini, hangisinin elendiğini ve sıradaki adımı yazar.

## Özellikler

| Bölüm | Özellikler |
|---|---|
| Giriş | E-posta + şifre ile kayıt ve giriş, **e-posta doğrulama** (adrese gelen 6 haneli kod girilmeden uygulama kullanılamaz), e-postaya gelen kodla şifre sıfırlama, şifre değiştirme, tüm cihazlardan çıkış, hesap silme |
| Asistan | Cihaz seçimi ya da etiketten okuma, cihaz kısayolları, arıza metni, en çok 4 fotoğraf ve bir PDF/metin dosyası eki (Pro+), anında hata kodu ve hızlı sonuçlar, akarak gelen teşhis, “ilk yapılacak” kutusu, günlük/tablo veri özeti, veriden çıkan bulgular, adımlarda ölçüm girişi ve değerlendirmesi, güven/kaynak rozetleri, işaretlenebilir kontrol listesi, parça önerisi → Pazarda ara, güvenlik uyarıları, kullanılan kılavuz bölümleri, netleştirme soruları ve devam sorusu, kayıtlı yanıt / yeniden üret, hata durumunda yeniden deneme, durdurma, geçmiş, günlük kota |
| Çözümler | Çözüm öğret (+20), AI ön incelemesi (kılavuzla uyum, güvenlik riski), “Bende çalıştı / Çalışmadı” oylaması (+5), 3 onayla doğrulama (+100), puan hareketleri |
| Eğitim | Program listesi, önizleme/kilitli dersler, puanla satın alma, eğitici paneli (satış, kazanç, platform payı), program oluşturma (Eğitici/Kurum planı) |
| Pazar | Kategori/durum/ülke filtresi, arama, ilan detayı, kullanıcı değerlendirmeleri (aboneler), teklif isteme, ilan verme (Ticari/Kurum planı), ilan bildirme |
| Planlar | 5 plan, aylık/yıllık; Google Play aboneliği ya da puanla (süreli) satın alma; aboneliği Play'de yönetme |
| Puan yükle | Google Play üzerinden puan paketi satın alma (500 / 1.500 / 3.000 / 6.000) |
| Hesap | Plan ve bitiş tarihi, puan, kullanım, dil (TR/EN), para birimi, tema, yüksek kontrast, teklif isteklerim |
| Geliştirici | Eğitim gelirleri, platform payı, manuel ekleme (metin, PDF/TXT, taranmış PDF'i AI ile okuma, tek ya da çok sayfa fotoğrafı), her manuel için AI dizini ve hata kodu sayısı, e-postası doğrulanmış / doğrulama bekleyen hesap sayıları, arama testi, satıcı doğrulama, AI'ın riskli bulduğu çözümleri onaylama |

## Yerelde deneme

Gereken: Node.js 22+.

### 1. Sunucu

```bash
cd biofix-ai/server
npm install
cp .env.example .env
```

`.env` dosyasını aç. Yerel deneme için şu satırları ekle (bunlar **yalnızca deneme içindir**):

```
ADMIN_TOKEN=<en az 24 karakterlik rastgele bir değer>
DEMO_PAYMENTS=true        # "kart (demo)" ve "Yükle (demo)" düğmeleri çalışır, yeni hesaba 500 puan verilir
PRINT_EMAIL_CODES=true    # e-posta doğrulama ve şifre sıfırlama kodları e-posta yerine sunucu ekranına yazılır
ANTHROPIC_API_KEY=<varsa Claude API anahtarın; yoksa boş bırak>
```

Kayıt olurken uygulama 6 haneli doğrulama kodu ister. Yerel denemede kod, sunucunun çalıştığı pencerede
`verification code for <adres>: 123456` satırı olarak görünür. (`SMTP_URL` de `PRINT_EMAIL_CODES` de yoksa
sunucu kayıt kabul etmez; çünkü kodu gönderemeyeceği bir hesabı açmaz.)

```bash
npm start     # http://localhost:8787 — açılışta hangi ayarların açık olduğunu ve güvenlik notlarını yazar
npm test      # giriş, e-posta doğrulama, ödeme doğrulama, güvenlik, arama ve asistan testleri
```

### 2. Mobil uygulama

```bash
cd biofix-ai/app
npm install
npx expo start
```

* Telefonda **Expo Go** ile QR kodu okut. Giriş ekranının altındaki “Sunucu adresi” bölümüne
  bilgisayarının yerel IP adresini yaz (örn. `http://192.168.1.25:8787`). Telefon ve bilgisayar aynı ağda olmalı.
  Android emülatöründe adres `http://10.0.2.2:8787` olur.
* Tarayıcıda denemek için: `npx expo start --web` (sunucu adresi `http://localhost:8787` olarak hazır gelir).
* Expo Go'da Google Play ödemesi **çalışmaz** (yerel modül yoktur); demo ödemeler açıksa onlar kullanılır.
* Tip kontrolü: `npx tsc --noEmit`.

## Yayına alma

Sırayla:

1. **Sunucuyu HTTPS arkasında yayınla.** Yayın sürümündeki uygulama `http://` adreslere bağlanmayı reddeder.
2. **Sunucu ayarları** (`server/.env.example` içindeki açıklamalarla):

   | Değişken | Yayında |
   |---|---|
   | `NODE_ENV=production` | Zorunlu |
   | `ANTHROPIC_API_KEY` | Zorunlu (AI için) |
   | `ADMIN_TOKEN` | En az 24 karakter, rastgele: `openssl rand -base64 32` |
   | `DATA_ENCRYPTION_KEY` | Önerilir: `openssl rand -base64 32` (yedeğini sakla; kaybolursa veri okunamaz) |
   | `TRUST_PROXY=1` | Sunucu bir ters vekilin (nginx, Render, Fly, Railway…) arkasındaysa zorunlu |
   | `SMTP_URL`, `MAIL_FROM` | **Zorunlu.** Kayıtta adres doğrulama kodu ve şifre sıfırlama kodu bununla gönderilir; yoksa kimse kayıt olamaz |
   | `GOOGLE_PLAY_PACKAGE`, `GOOGLE_SERVICE_ACCOUNT_FILE`, `PLAY_RTDN_SECRET` | Ödemeler için ([docs/GOOGLE-PLAY.md](docs/GOOGLE-PLAY.md)) |
   | `DEMO_PAYMENTS`, `PRINT_EMAIL_CODES` | **Olmamalı** (satırları sil) |
   | `BIOFIX_EFFORT`, `BIOFIX_SPEED`, `BIOFIX_LIGHT_MODEL`, `MAX_ATTACH_PAGES` | İsteğe bağlı: AI yanıt hızı / maliyet ayarları (aşağıda) |
   | `APP_TIMEZONE` | Günlük hakların sıfırlandığı ve tarihlerin değiştiği saat dilimi (varsayılan `Europe/Istanbul`) |

3. **Uygulamayı sunucu adresiyle derle.** `app/eas.json` içinde `production` (ve deneme APK'sı için `preview`)
   profilindeki boş alanları doldur:

   ```json
   "env": {
     "EXPO_PUBLIC_API_URL": "https://SENIN-SUNUCUN",
     "EXPO_PUBLIC_PRIVACY_URL": "https://SENIN-SITEN/gizlilik"
   }
   ```

   ```bash
   cd biofix-ai/app
   npx eas-cli@latest build --platform android --profile production   # Google Play için .aab
   ```

   Yayın sürümünde sunucu adresi uygulamanın içine gömülür ve kullanıcı tarafından değiştirilemez.
   Adres boş bırakılırsa uygulama açılışta “Uygulama yapılandırılmamış” uyarısı gösterir.
   Paket adı `com.biofix.ai` (`app.json` içinde değiştirilebilir; Play Console'daki adla aynı olmalı).

4. **Google Play ödemelerini kur:** [docs/GOOGLE-PLAY.md](docs/GOOGLE-PLAY.md).
5. **Yayın öncesi kontrol listesini** tamamla: [docs/GUVENLIK.md](docs/GUVENLIK.md).

### AI hızı ve maliyeti

Yapay zekâ kullanımı Anthropic'e, okunan ve yazılan metin miktarına göre ödenir. Ayarlar `server/.env` içindedir:

| Ayar | Ne yapar |
|---|---|
| `BIOFIX_EFFORT=low\|medium\|high\|auto` | Teşhiste modelin ne kadar derin düşüneceği. Varsayılan `high` (en dikkatli). Düşürmek yanıtı hızlandırır ve ucuzlatır. `auto`: bilgi bankasının zaten yanıtladığı arızalarda (kılavuz bildirilen kodu açıklıyor ya da o cihaz için doğrulanmış çözüm var) `medium`, geri kalanında `high`. |
| `BIOFIX_SPEED=fast` | Aynı model, yanıtı yaklaşık 2,5 kata kadar hızlı yazar; birim fiyat 2 katıdır (`claude-opus-5-5` için 1 milyon belirteçte girdi 8 $, çıktı 40 $; normali 4 $ / 20 $). Düşünme süresini değil yazma hızını artırır. Yalnızca `claude-opus-5-5` ve `claude-fable-5-2` ile. Hızlı şerit doluysa istek beklemeden normal hızda gönderilir. |
| `BIOFIX_MODEL` | Varsayılan `claude-opus-5-5`. Daha ucuz ve hızlı: `claude-sonnet-5-5`, `claude-haiku-5-5`. |
| `BIOFIX_LIGHT_MODEL` | İsteğe bağlı: etiket okuma, sayfa/PDF okuma ve manuel dizinleme için daha hafif bir model (ör. `claude-haiku-5-5`). Teşhis ve çözüm ön incelemesi ana modelde kalır. |
| `BIOFIX_AI_TIMEOUT_S` | Bir yanıt için en uzun bekleme (varsayılan 240 sn). Dolunca istek bırakılır, hak iade edilir, kullanıcıya “yeniden dene” sunulur. |
| `BIOFIX_PARALLEL` | Manuel okuma ve dizinlemede aynı anda yürüyen AI çağrısı (varsayılan 3). |
| `MAX_ATTACH_PAGES` | Arızaya eklenebilecek PDF'in sayfa sınırı (varsayılan 30). Her sayfa ücretlidir. |

Kayıtlı yanıtlar, yüklemeyi beklemeyen hızlı sonuçlar ve fotoğrafsız listeler gibi düzenler her zaman
açıktır ve yanıtın içeriğini değiştirmez. `BIOFIX_EFFORT` (düşük ayarlar), `BIOFIX_MODEL` ve
`BIOFIX_LIGHT_MODEL` ise hızı kalite karşılığında, `BIOFIX_SPEED` para karşılığında artırır; bu ayarların
yanıt kalitesine etkisi bu uygulama için **ölçülmedi** (geliştirme ortamında API anahtarı yoktu). Açmadan
önce kendi arıza örneklerinle eski ve yeni yanıtları yan yana karşılaştır.

Maliyeti en çok etkileyenler: arızaya eklenen PDF ve fotoğraflar, taranmış manuellerin AI ile okunması
(sayfa başına) ve yeni manuelin AI ile dizinlenmesi (manuel başına bir kez). Hata kodu kartı ve hızlı
sonuçlar ücretsizdir; AI'a hiç gitmez.

Bir güvenlik sınıflandırıcısı isteği geri çevirirse (tıbbi ya da siber güvenlikle ilgili masum bir
arızada nadiren olabilir) istek, API'nin önerdiği yedek modelde kendiliğinden yeniden çalıştırılır.

## Bilinen eksikler

* **iOS ödemeleri yok.** App Store'da satış için Apple'ın kendi ödeme sistemi ayrıca eklenmeli.
* **İki adımlı giriş yok.** (E-posta adresi kayıtta kodla doğrulanıyor; girişte ikinci bir adım istenmiyor.)
* **AI çağrıları gerçek anahtarla denenmedi.** Geliştirme ortamında Claude API anahtarı yoktu; teşhis,
  etiket okuma, PDF okuma ve dizinleme otomatik testlerde ve tarayıcı denemesinde yapay zekânın yerine
  geçen bir taklitle sınandı. Anahtarı ekledikten sonra ilk iş olarak bir arıza çözdür, bir etiket
  okut ve taranmış birkaç sayfalık bir PDF yükle.
* **Veriler tek bir JSON dosyasında.** Pilot için yeterli; çok kullanıcılı yayında gerçek bir veritabanına
  taşınmalı (`server/src/store.ts` arkasındaki işlevler aynı kalabilir).
* **Teklif istekleri** kullanıcının hesabına kaydediliyor; satıcıya e-posta/uygulama içi mesaj olarak iletilmiyor.
* **Eğitici ödemeleri** hesaplanıyor ama ödeme yapan bir sistem yok.
* **Kur bilgisi** göstergedir (`app/src/lib/app-context.tsx` → `RATES`).
* Örnek manuel metinleri (PM-12, VX-300, DF-200) eğitim amaçlı uydurma içeriktir; gerçek manueller
  yalnızca kullanım hakkı olan belgelerden yüklenmeli.
