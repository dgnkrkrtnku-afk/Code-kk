# BioFix AI

Tıbbi cihaz arızaları için saha asistanı. Biyomedikal teknisyen ve mühendisler arızayı yazar (isterse
fotoğraf, hata günlüğü ya da PDF ekler); asistan geliştiricilerin yüklediği servis manuellerini ve
sahadaki kullanıcıların öğrettiği çözümleri tarayıp önce saniyesinde bulduklarını gösterir, ardından
“ilk yapılacak iş”, adım adım kontrol listesi, olası nedenler, parça önerileri ve güvenlik uyarıları
içeren bir iş föyü üretir.

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
3. **AI teşhisi.** Yazılırken ekrana akar: önce özet ve **“ilk yapılacak”** iş, sonra nedenler, adımlar,
   parçalar, uyarılar. Sonunda teşhisi netleştirecek 1-3 soru önerir; yanıtlanınca devam yanıtı da akarak gelir.

Cihaz seçilince o cihazda **çözülmüş arızalar** ve **hata kodları** tek dokunuşluk kısayol olarak çıkar.
Cihaz listede aranmak yerine **etiketinin fotoğrafından** da seçilebilir.

## Özellikler

| Bölüm | Özellikler |
|---|---|
| Giriş | E-posta + şifre ile kayıt ve giriş, **e-posta doğrulama** (adrese gelen 6 haneli kod girilmeden uygulama kullanılamaz), e-postaya gelen kodla şifre sıfırlama, şifre değiştirme, tüm cihazlardan çıkış, hesap silme |
| Asistan | Cihaz seçimi ya da etiketten okuma, cihaz kısayolları, arıza metni, en çok 4 fotoğraf ve bir PDF/metin dosyası eki (Pro+), anında hata kodu ve hızlı sonuçlar, akarak gelen teşhis, “ilk yapılacak” kutusu, güven/kaynak rozetleri, işaretlenebilir kontrol listesi, parça önerisi → Pazarda ara, güvenlik uyarıları, kullanılan kılavuz bölümleri, netleştirme soruları ve devam sorusu, durdurma, geçmiş, günlük kota |
| Çözümler | Çözüm öğret (+20), AI ön incelemesi (kılavuzla uyum, güvenlik riski), “Bende çalıştı / Çalışmadı” oylaması (+5), 3 onayla doğrulama (+100), puan hareketleri |
| Eğitim | Program listesi, önizleme/kilitli dersler, puanla satın alma, eğitici paneli (satış, kazanç, platform payı), program oluşturma (Eğitici/Kurum planı) |
| Pazar | Kategori/durum/ülke filtresi, arama, ilan detayı, kullanıcı değerlendirmeleri (aboneler), teklif isteme, ilan verme (Ticari/Kurum planı), ilan bildirme |
| Planlar | 5 plan, aylık/yıllık; Google Play aboneliği ya da puanla (süreli) satın alma; aboneliği Play'de yönetme |
| Puan yükle | Google Play üzerinden puan paketi satın alma (500 / 1.500 / 3.000 / 6.000) |
| Hesap | Plan ve bitiş tarihi, puan, kullanım, dil (TR/EN), para birimi, tema, yüksek kontrast, teklif isteklerim |
| Geliştirici | Eğitim gelirleri, platform payı, manuel ekleme (metin, PDF/TXT, taranmış PDF'i AI ile okuma, tek ya da çok sayfa fotoğrafı), her manuel için AI dizini ve hata kodu sayısı, arama testi, satıcı doğrulama, AI'ın riskli bulduğu çözümleri onaylama |

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
   | `BIOFIX_EFFORT`, `BIOFIX_SPEED`, `MAX_ATTACH_PAGES` | İsteğe bağlı: AI yanıt hızı / maliyet ayarları (aşağıda) |

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
| `BIOFIX_EFFORT=low\|medium\|high` | Teşhiste modelin ne kadar derin düşüneceği. Varsayılan `high` (en dikkatli). Düşürmek yanıtı hızlandırır ve ucuzlatır. |
| `BIOFIX_SPEED=fast` | Aynı model, yaklaşık 2,5 kata kadar hızlı yazar; birim fiyat 2 katıdır. Yalnızca `claude-opus-5-5` ve `claude-fable-5-2` ile. |
| `BIOFIX_MODEL` | Varsayılan `claude-opus-5-5`. Daha ucuz ve hızlı: `claude-sonnet-5-5`, `claude-haiku-5-5`. |
| `MAX_ATTACH_PAGES` | Arızaya eklenebilecek PDF'in sayfa sınırı (varsayılan 30). Her sayfa ücretlidir. |

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
