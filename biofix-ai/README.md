# BioFix AI

Tıbbi cihaz arızaları için saha asistanı. Biyomedikal teknisyen ve mühendisler arızayı (ve isterse
fotoğrafını) yazar; asistan geliştiricilerin yüklediği servis manuellerini ve sahadaki kullanıcıların
öğrettiği çözümleri tarayıp adım adım kontrol listesi, olası nedenler, parça önerileri ve güvenlik
uyarıları içeren bir iş föyü üretir.

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
                                         └─ Claude API (claude-opus-5-5): teşhis, devam sorusu,
                                            çözüm ön incelemesi, manuel sayfası okuma (OCR)
```

* **Gizli anahtarlar telefonda durmaz.** Claude API anahtarı ve Google hizmet hesabı yalnızca sunucudadır.
* **Telefon hiçbir hak vermez.** Uygulama satın almayı yalnızca başlatır; planı ya da puanı sunucu,
  satın almayı Google'a doğrulattıktan sonra verir.
* **Manueller yalnızca geliştiricilerden gelir.** Yükleme uçları `ADMIN_TOKEN` ile korunur; uygulamada
  Hesap → “Geliştirici anahtarı” girilince Geliştirici paneli açılır.
* **AI anahtarı yoksa** uygulama çalışmaya devam eder: asistan, kılavuz bölümlerini ve topluluk
  çözümlerini listeler (“AI kapalı” modu).

## Özellikler

| Bölüm | Özellikler |
|---|---|
| Giriş | E-posta + şifre ile kayıt ve giriş, e-postaya gelen kodla şifre sıfırlama, şifre değiştirme, tüm cihazlardan çıkış, hesap silme |
| Asistan | Cihaz seçimi, arıza metni, fotoğrafla teşhis (Pro+), güven/kaynak rozetleri, işaretlenebilir kontrol listesi, parça önerisi → Pazarda ara, güvenlik uyarıları, kullanılan kılavuz bölümleri, devam sorusu, geçmiş, günlük kota |
| Çözümler | Çözüm öğret (+20), AI ön incelemesi (kılavuzla uyum, güvenlik riski), “Bende çalıştı / Çalışmadı” oylaması (+5), 3 onayla doğrulama (+100), puan hareketleri |
| Eğitim | Program listesi, önizleme/kilitli dersler, puanla satın alma, eğitici paneli (satış, kazanç, platform payı), program oluşturma (Eğitici/Kurum planı) |
| Pazar | Kategori/durum/ülke filtresi, arama, ilan detayı, kullanıcı değerlendirmeleri (aboneler), teklif isteme, ilan verme (Ticari/Kurum planı), ilan bildirme |
| Planlar | 5 plan, aylık/yıllık; Google Play aboneliği ya da puanla (süreli) satın alma; aboneliği Play'de yönetme |
| Puan yükle | Google Play üzerinden puan paketi satın alma (500 / 1.500 / 3.000 / 6.000) |
| Hesap | Plan ve bitiş tarihi, puan, kullanım, dil (TR/EN), para birimi, tema, yüksek kontrast, teklif isteklerim |
| Geliştirici | Eğitim gelirleri, platform payı, manuel ekleme (metin, PDF/TXT, sayfa fotoğrafı OCR), arama testi, satıcı doğrulama, AI'ın riskli bulduğu çözümleri onaylama |

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
PRINT_RESET_CODES=true    # şifre sıfırlama kodu e-posta yerine sunucu ekranına yazılır
ANTHROPIC_API_KEY=<varsa Claude API anahtarın; yoksa boş bırak>
```

```bash
npm start     # http://localhost:8787 — açılışta hangi ayarların açık olduğunu ve güvenlik notlarını yazar
npm test      # giriş, ödeme doğrulama ve güvenlik testleri
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
   | `SMTP_URL`, `MAIL_FROM` | Şifre sıfırlama e-postaları için zorunlu |
   | `GOOGLE_PLAY_PACKAGE`, `GOOGLE_SERVICE_ACCOUNT_FILE`, `PLAY_RTDN_SECRET` | Ödemeler için ([docs/GOOGLE-PLAY.md](docs/GOOGLE-PLAY.md)) |
   | `DEMO_PAYMENTS`, `PRINT_RESET_CODES` | **Olmamalı** (satırları sil) |

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

## Bilinen eksikler

* **iOS ödemeleri yok.** App Store'da satış için Apple'ın kendi ödeme sistemi ayrıca eklenmeli.
* **E-posta doğrulama ve iki adımlı giriş yok.** Kayıtta e-postanın gerçekten o kişiye ait olduğu kontrol edilmiyor.
* **Veriler tek bir JSON dosyasında.** Pilot için yeterli; çok kullanıcılı yayında gerçek bir veritabanına
  taşınmalı (`server/src/store.ts` arkasındaki işlevler aynı kalabilir).
* **Teklif istekleri** kullanıcının hesabına kaydediliyor; satıcıya e-posta/uygulama içi mesaj olarak iletilmiyor.
* **Eğitici ödemeleri** hesaplanıyor ama ödeme yapan bir sistem yok.
* **Kur bilgisi** göstergedir (`app/src/lib/app-context.tsx` → `RATES`).
* Örnek manuel metinleri (PM-12, VX-300, DF-200) eğitim amaçlı uydurma içeriktir; gerçek manueller
  yalnızca kullanım hakkı olan belgelerden yüklenmeli.
