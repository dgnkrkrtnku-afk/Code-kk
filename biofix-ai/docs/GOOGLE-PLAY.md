# Google Play ödemelerini kurma

Kod tarafı hazır; bu belge **senin Google tarafında yapman gereken** adımları anlatır. Menü adları
Google tarafından zaman zaman değiştirilir; aynı adı bulamazsan Play Console'un arama kutusunu kullan.

> Bu akış gerçek bir Android cihazda ve gerçek bir Google Play hesabıyla **henüz denenmedi**
> (geliştirme ortamında Play yoktu). Sunucu tarafı, Google'ın yanıtlarını taklit eden testlerle doğrulandı.
> İlk gerçek denemeyi aşağıdaki “Test” bölümündeki gibi, deneme kullanıcılarıyla yap.

## Nasıl çalışıyor

```
1. Kullanıcı uygulamada "Google Play ile abone ol" ya da "Satın al"a basar.
2. Google Play ödemeyi alır ve telefona bir satın alma anahtarı verir.
3. Uygulama anahtarı sunucuya gönderir.
4. Sunucu anahtarı Google'a sorar: gerçek mi, hangi ürün, ödendi mi, ne zaman bitiyor?
5. Yalnızca Google "evet" derse plan açılır ya da puan eklenir.
```

Aynı anahtar ikinci kez ya da başka bir hesapta kullanılamaz. Abonelik yenilenince, iptal edilince ya da
iade edilince Google sunucuya haber verir (6. adım) ve plan buna göre güncellenir.

## Satılan ürünler

Kimlikler kodda sabittir (`server/src/billing.ts`). Play Console'da **birebir aynı** yazılmalıdır.

**Abonelikler** — her biri için iki temel plan: `monthly` (aylık) ve `yearly` (yıllık)

| Ürün kimliği | Plan | Kodda liste fiyatı (aylık / yıllık) |
|---|---|---|
| `biofix_pro` | Bireysel Pro | 12 $ / 120 $ |
| `biofix_trainer` | Eğitici | 29 $ / 290 $ |
| `biofix_biz` | Ticari Satıcı | 79 $ / 790 $ |
| `biofix_org` | Kurum | 249 $ / 2.490 $ |

**Puan paketleri** — tek seferlik, tüketilebilir ürünler (1 $ = 50 puan)

| Ürün kimliği | Puan | Liste fiyatı |
|---|---|---|
| `biofix_points_500` | 500 | 10 $ |
| `biofix_points_1500` | 1.500 | 30 $ |
| `biofix_points_3000` | 3.000 | 60 $ |
| `biofix_points_6000` | 6.000 | 120 $ |

Kullanıcıdan tahsil edilen tutar Play Console'da girdiğin fiyattır; uygulama, Play'in bildirdiği fiyatı gösterir.
Eğitim programları doğrudan kartla değil **puanla** satılır; puanı yetmeyen kullanıcı puan paketi alır.

## Adımlar

### 1. Uygulamayı Play Console'da oluştur

1. [Google Play Console](https://play.google.com/console)'da geliştirici hesabı aç (tek seferlik kayıt ücreti vardır).
2. “Uygulama oluştur” → paket adı `com.biofix.ai` olmalı (`app/app.json` → `android.package` ile aynı).
3. Ödeme alabilmek için **ödeme profili / satıcı hesabı** kur (Play Console seni yönlendirir).

### 2. İlk derlemeyi yükle

Ürün oluşturabilmek için önce ödeme kütüphanesini içeren bir derleme yüklenmiş olmalı.

```bash
cd biofix-ai/app
npx eas-cli@latest build --platform android --profile production
```

Öncesinde `app/eas.json` → `production.env.EXPO_PUBLIC_API_URL` değerine sunucunun `https://` adresini yaz
(ana README'deki örnek). Çıkan `.aab` dosyasını Play Console → **Test → Dahili test** kanalına yükle.

### 3. Ürünleri oluştur

* **Abonelikler:** “Para kazanma → Ürünler → Abonelikler” → yukarıdaki dört ürün kimliğiyle abonelik oluştur.
  Her birine iki temel plan ekle: kimliği `monthly` (otomatik yenilenen, 1 ay) ve `yearly` (otomatik yenilenen, 1 yıl).
  Fiyatları gir ve temel planları **etkinleştir**.
* **Puan paketleri:** “Para kazanma → Ürünler → Uygulama içi ürünler” (yeni adıyla “tek seferlik ürünler”) →
  dört puan paketini oluştur, fiyatlarını gir, **etkinleştir**.

Ürünlerin uygulamada görünmesi oluşturduktan sonra bir süre (genellikle dakikalar, bazen birkaç saat) alabilir.

### 4. Sunucunun Google'a soru sorabilmesi için hizmet hesabı

1. [Google Cloud Console](https://console.cloud.google.com)'da bir proje seç ya da oluştur.
2. “API'ler ve Hizmetler” → **Google Play Android Developer API**'yi etkinleştir.
3. “IAM ve Yönetici → Hizmet hesapları” → hizmet hesabı oluştur → “Anahtarlar” → **JSON anahtarı** indir.
4. Play Console → “Kullanıcılar ve izinler” → “Yeni kullanıcı davet et” → hizmet hesabının e-posta adresini ekle
   (`…@….iam.gserviceaccount.com`). Uygulama için şu izinleri ver:
   * Finansal verileri, siparişleri ve iptal anketi yanıtlarını görüntüleme
   * Siparişleri ve abonelikleri yönetme
5. JSON dosyasını sunucuya `server/play-service-account.json` olarak koy (bu ad `.gitignore` içindedir;
   **depoya yükleme**) ve `server/.env` dosyasına ekle:

   ```
   GOOGLE_PLAY_PACKAGE=com.biofix.ai
   GOOGLE_SERVICE_ACCOUNT_FILE=./play-service-account.json
   ```

Yeni izinlerin geçerli olması bazen bir güne kadar sürebilir. Sunucu açılışta `play: on (com.biofix.ai)` yazmalı.

### 5. Demo ödemeleri kapat

`server/.env` içinde `DEMO_PAYMENTS` satırı **olmamalı**. Açık kalırsa herkes ödemeden plan alabilir;
sunucu açılışta bunu “Security notes” altında uyarır.

### 6. Anlık bildirimler (yenileme, iptal, iade)

Bu adım olmadan da abonelikler çalışır (sunucu günde bir kez ve süre dolunca Google'a sorar), ama
**iadeler** ancak bu bildirimle öğrenilir.

1. `server/.env` → `PLAY_RTDN_SECRET=<en az 16 karakterlik rastgele değer>` (`openssl rand -hex 24`).
2. Google Cloud Console → **Pub/Sub** → konu (topic) oluştur.
3. Konunun izinlerine `google-play-developer-notifications@system.gserviceaccount.com` hesabını
   **Pub/Sub Yayıncısı** olarak ekle.
4. Konuya **push** türünde abonelik ekle; uç nokta adresi:

   ```
   https://SENIN-SUNUCUN/api/billing/rtdn?token=<PLAY_RTDN_SECRET değeri>
   ```

5. Play Console → “Para kazanma → Para kazanma kurulumu” → “Gerçek zamanlı geliştirici bildirimleri” →
   konu adını yaz → “Test bildirimi gönder”. Sunucu hata vermemeli.

Bu adres gizli anahtarı içerdiği için kimseyle paylaşma; sızarsa `PLAY_RTDN_SECRET` değerini değiştirip
Pub/Sub aboneliğindeki adresi güncelle.

## Test

1. Play Console → “Ayarlar → Lisans testi” → deneme yapacak Google hesaplarını ekle. Bu hesaplar
   **gerçek para ödemeden** satın alma yapabilir; deneme abonelikleri birkaç dakikada yenilenir.
2. Aynı hesapları “Dahili test” kanalının test kullanıcılarına ekle ve uygulamayı Play Store'daki
   test bağlantısından yükle (Expo Go'da ödeme çalışmaz).
3. Sırayla dene ve her birinde Hesap ekranındaki planı / puanı kontrol et:
   * Puan paketi satın al → puan artmalı; aynı paketi yeniden alabilmelisin.
   * Abonelik başlat → plan değişmeli, “… tarihinde yenilenir” yazmalı.
   * Başka bir plana geç → eski abonelik yerine yenisi geçmeli (iki abonelik oluşmamalı).
   * Play Store → Abonelikler'den iptal et → “… tarihinde sona erer” yazmalı; süre dolunca Başlangıç planına dönmeli.
   * Uygulamayı silip yeniden yükle, giriş yap → abonelik kendiliğinden geri gelmeli (ya da Hesap → “Satın alımları geri yükle”).
   * Başka bir BioFix hesabıyla aynı telefonda giriş yap → ilk hesabın aboneliği bu hesaba **geçmemeli**.

Bir adım beklendiği gibi çalışmazsa sunucu çıktısındaki `Play …` satırlarına bak; en sık nedenler
paket adının uyuşmaması, hizmet hesabı izinlerinin henüz etkinleşmemesi ve ürünlerin “etkin” olmamasıdır.

## Google'ın ayrıca istedikleri

* **Gizlilik politikası** adresi (Play Console → Uygulama içeriği).
* **Veri güvenliği** formu: hangi verinin toplandığı [GUVENLIK.md](GUVENLIK.md) → “Saklanan veriler” bölümünde.
* **Hesap silme:** uygulama içinde var (Hesap → Hesabı sil). Google ayrıca uygulama dışından talep
  edilebilecek bir web adresi ister; basit bir sayfa ya da e-posta adresi yeterlidir.
* Abonelik ekranında fiyat, dönem ve iptal yolu açıkça yazmalıdır; uygulama bunları satın alma öncesinde gösterir.
