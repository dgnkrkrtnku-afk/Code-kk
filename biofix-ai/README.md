# BioFix AI

Tıbbi cihaz arızaları için saha asistanı. Biyomedikal teknisyen ve mühendisler arızayı (ve isterse
fotoğrafını) yazar; asistan geliştiricilerin yüklediği servis manuellerini ve sahadaki kullanıcıların
öğrettiği çözümleri tarayıp adım adım kontrol listesi, olası nedenler, parça önerileri ve güvenlik
uyarıları içeren bir iş föyü üretir.

Bu klasör, claude.ai'daki HTML prototipinin gerçek bir mobil uygulamaya dönüştürülmüş halidir.

```
biofix-ai/
  app/      Expo (React Native) mobil uygulama — Android, iOS ve web
  server/   Node.js API sunucusu — bilgi bankası, kullanıcılar, Claude API çağrıları
```

## Mimari

```
 Telefon (Expo app)  ──HTTPS/JSON──▶  server (Express)
                                        ├─ Bilgi bankası: manuel bölümleri + topluluk çözümleri (BM25 arama)
                                        ├─ Kullanıcı, puan, plan, eğitim, pazar yeri verisi (JSON dosyası)
                                        └─ Claude API (claude-opus-5-5) — teşhis, devam sorusu,
                                           çözüm ön incelemesi, manuel sayfası okuma (OCR)
```

* **Anahtar telefonda durmaz.** Claude API anahtarı yalnızca sunucuda bulunur.
* **Manueller yalnızca geliştiricilerden gelir.** Yükleme uçları `ADMIN_TOKEN` ile korunur; uygulamada
  Hesap → “Geliştirici anahtarı” girilince Geliştirici paneli açılır.
* **Yapılandırılmış çıktı.** Teşhis ve ön inceleme yanıtları Zod şemasıyla doğrulanan JSON olarak gelir
  (`server/src/ai.ts`). Modelin güvenlik reddi halinde sunucu tarafı yedek model (`fallbacks: "default"`) açıktır.
* **AI anahtarı yoksa** uygulama çalışmaya devam eder: asistan, kılavuz bölümlerini ve topluluk
  çözümlerini listeler (prototipteki “AI kapalı” modu).

## Prototipten taşınan özellikler

| Sekme | Özellikler |
|---|---|
| Asistan | Cihaz seçimi, arıza metni, fotoğrafla teşhis (Pro+), güven/kaynak rozetleri, adım adım işaretlenebilir kontrol listesi, parça önerisi → Pazarda ara, güvenlik uyarıları, kullanılan kılavuz bölümleri, devam sorusu, geçmiş, günlük kota |
| Çözümler | Çözüm öğret (+20), AI ön incelemesi (kılavuzla uyum, güvenlik riski), “Bende çalıştı / Çalışmadı” oylaması (+5), 3 onayla doğrulama (+100), puan hareketleri |
| Eğitim | Program listesi, önizleme/kilitli dersler, kartla veya puanla satın alma, eğitici paneli (satış, kazanç, platform payı), program oluşturma (Eğitici/Kurum planı) |
| Pazar | Kategori/durum/ülke filtresi, arama, ilan detayı, kullanıcı değerlendirmeleri (aboneler), bilinen arıza çözümü sayısı, teklif isteme, ilan verme (Ticari/Kurum planı), ilan bildirme |
| Hesap | Plan, puan, kullanım, dil (TR/EN), para birimi, tema (sistem/açık/tam siyah), yüksek kontrast, teklif isteklerim, sunucu adresi, verileri sıfırlama |
| Planlar | 5 plan, aylık/yıllık, kartla (demo) ya da puanla geçiş |
| Geliştirici | Eğitim gelirleri, platform payı oranı, manuel ekleme (metin, PDF/TXT dosyası, sayfa fotoğrafı OCR), arama testi |

## Çalıştırma

Gereken: Node.js 22+.

### 1. Sunucu

```bash
cd biofix-ai/server
npm install
cp .env.example .env      # ANTHROPIC_API_KEY ve ADMIN_TOKEN değerlerini gir
npm start                 # http://localhost:8787
npm test                  # birim + API testleri
```

| Değişken | Açıklama |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API anahtarı. Boşsa AI kapalı modda çalışır. |
| `ADMIN_TOKEN` | Geliştirici paneli anahtarı (uzun, rastgele bir değer). |
| `BIOFIX_MODEL` | Model (varsayılan `claude-opus-5-5`). |
| `DEMO_PAYMENTS` | `false` yapılırsa demo kart ödemesi ve “Demo:” butonları kapanır. |
| `DATA_FILE` | Veri dosyası (varsayılan `./data/db.json`). |
| `PORT` | Varsayılan 8787. |

### 2. Mobil uygulama

```bash
cd biofix-ai/app
npm install
EXPO_PUBLIC_API_URL=http://<bilgisayarın-yerel-IP'si>:8787 npx expo start
```

* Telefonda **Expo Go** ile QR kodu okut. Telefon ve bilgisayar aynı ağda olmalı;
  `localhost` telefondan erişilemez, bilgisayarın yerel IP adresini kullan.
  Android emülatöründe adres `http://10.0.2.2:8787` olur.
* Sunucu adresi uygulama içinden de değiştirilebilir: Hesap → Sunucu adresi.
* Web'de denemek için: `npx expo start --web`.
* Kontrol: `npx tsc --noEmit`.

### 3. Mağaza derlemesi (EAS)

```bash
cd biofix-ai/app
npx eas-cli@latest build --platform android   # Google Play için .aab
```

Paket adı `com.biofix.ai` (`app.json` içinde değiştirilebilir).

## Yayına almadan önce yapılması gerekenler

Prototipteki “demo” kısımlar bilinçli olarak işaretli bırakıldı:

1. **Kimlik doğrulama.** Şu an her cihaz rastgele bir kimlikle (`x-user-id`) tanınıyor. Gerçek giriş
   (e-posta bağlantısı, Google ile giriş vb.) eklenmeli.
2. **Ödeme.** Abonelik ve eğitim satın alma Google Play Faturalandırma ile doğrulanmalı;
   `server/src/routes.ts` içinde `billing_not_configured` dönen yerler bunun için ayrıldı.
   `DEMO_PAYMENTS=false` ile demo ödeme kapanır.
3. **Veritabanı.** `server/src/store.ts` tek bir JSON dosyasına yazar; pilot için yeterli, çok kullanıcılı
   yayında PostgreSQL/SQLite'a taşınmalı (fonksiyon arayüzü aynı kalabilir).
4. **Teklif istekleri** şu an kullanıcının hesabına kaydediliyor; satıcıya e-posta/uygulama içi mesaj
   olarak iletilmeli.
5. **Kur bilgisi** göstergedir (`app/src/lib/app-context.tsx` → `RATES`); canlı kur servisine bağlanmalı.
6. Örnek manuel metinleri (PM-12, VX-300, DF-200) eğitim amaçlı uydurma içeriktir; gerçek manueller
   yalnızca kullanım hakkı olan belgelerden yüklenmeli.
