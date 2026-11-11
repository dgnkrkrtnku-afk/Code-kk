# BioFix AI — Güvenlik ve veri gizliliği

Bu belge üç şeyi anlatır: uygulamada **hangi önlemlerin alındığını**, **hangi verinin nerede durduğunu**
ve yayına çıkmadan önce **senin yapman gerekenleri**. Hukuki metin değildir; gizlilik politikası ve
KVKK aydınlatma metni için “Saklanan veriler” bölümünü bir hukukçuya verebilirsin.

## 1. Alınan önlemler

### Hesap ve oturum

| Konu | Nasıl korunuyor |
|---|---|
| Şifreler | Sunucuda düz metin olarak hiç saklanmaz; her şifre ayrı tuzla `scrypt` ile özetlenir. |
| Zayıf şifre | En az 8 karakter; çok yaygın şifreler, tek karakter tekrarı, adın ya da e-postan reddedilir. |
| Oturum anahtarı | 256 bit rastgele değer. Sunucu yalnızca özetini (SHA-256) saklar; veri dosyası çalınsa bile oturum açılamaz. |
| Telefonda saklama | Oturum ve geliştirici anahtarı cihazın güvenli deposunda (Android Keystore / iOS Keychain) durur; şifre telefonda saklanmaz. |
| Oturum sonu | Çıkışta, şifre değiştirince (diğer cihazlar), şifre sıfırlayınca (tüm cihazlar) ve hesap silinince oturumlar kapanır. 90 gün kullanılmayan oturum düşer; hesap başına en çok 10 oturum. |
| Şifre deneme saldırısı | Aynı adresten aynı hesaba 15 dakikada 10 deneme; hesap başına ve adres başına ek sınırlar. |
| E-posta doğrulama | Kayıttan sonra adrese 6 haneli kod gider; kod girilene kadar hesap hiçbir özelliği kullanamaz. Bunu yalnızca uygulama değil **sunucu** uygular: doğrulanmamış oturumun her isteği reddedilir (kod girme, yeniden gönderme, çıkış ve hesabı silme dışında). Kod 30 dakika geçerli, 5 yanlış denemede iptal, saatte en çok 5 kod; yenisi istenince eskisi geçersiz olur. Sunucu yalnızca kodun özetini saklar. |
| Başkasının adresiyle kayıt | Doğrulanmayan kayıt adresi yalnızca 30 dakika tutar; sonra adresin gerçek sahibi kendi kaydını yapabilir ve eski kayıt silinir. Hiç doğrulanmayan hesaplar 7 gün sonra temizlenir. |
| Şifre sıfırlama | 6 haneli kod, 15 dakika geçerli, 5 yanlış denemede iptal, saatte 3 kod. Yanıt, hesabın var olup olmadığını belli etmez. Kod adrese gittiği için başarılı sıfırlama adresi de doğrulanmış sayar. |
| Geliştirici anahtarı | En az 24 karakter olmak zorunda (kısaysa yok sayılır); 20 yanlış denemeden sonra o adres 1 saat kilitlenir. |

### Sunucu

| Konu | Nasıl korunuyor |
|---|---|
| Yetki | Giriş, kayıt, şifre sıfırlama, sağlık kontrolü ve Google Play bildirim adresi (ayrı bir gizli anahtarla korunur) dışındaki her istek geçerli oturum ister. Herkes yalnızca kendi geçmişini, tekliflerini ve satın almalarını görür; silme işlemleri yalnızca sahibine ya da geliştiriciye açıktır. |
| Girdi doğrulama | Her istek şemayla doğrulanır; bilinmeyen alanlar atılır. Plan adları yalnızca gerçek planlarla eşleşir. |
| İstek boyutu | Oturumsuz isteklerde 64 KB. Fotoğraf ve manuel gibi büyük yüklemeler yalnızca giriş yapıldıktan sonra, ilgili adreslerde kabul edilir. |
| Fotoğraflar | Dosya imzası kontrol edilir (gerçekten JPEG/PNG/WebP mi). Başkalarına gösterilen önizlemeyi sunucu üretir; uygulama dışarıdan resim adresi gönderemez. |
| Kota | Günlük AI hakkı, AI çağrısından önce düşülür; aynı anda gönderilen istekler kotayı aşamaz. “Sınırsız” planlarda da hesap başına günlük tavan vardır. |
| Hız sınırları | Adres başına ve hesap başına genel sınırlar; yazma işlemleri, çözüm öğretme ve AI çağrıları için ayrı sınırlar. |
| Yanıt başlıkları | `nosniff`, çerçeveleme yasağı, önbelleğe alma yasağı (yanıtlar kişisel veri içerir), HTTPS'te HSTS. |
| CORS | `NODE_ENV=production` iken yalnızca `CORS_ORIGIN` listesindeki siteler tarayıcıdan çağırabilir. |
| Kayıtlar (log) | Şifre, oturum anahtarı ve istek gövdesi hiçbir zaman yazılmaz. Güvenlik olayları (giriş, hatalı giriş, şifre değişimi, satın alma, geliştirici işlemleri) e-posta içermeden, kullanıcı numarasıyla kaydedilir. |
| Veri dosyası | Yalnızca sunucu kullanıcısı okuyabilir (0600). `DATA_ENCRYPTION_KEY` verilirse AES-256-GCM ile şifrelenir. |
| Güvenli varsayılanlar | Demo ödemeler ve e-posta kodlarının ekrana yazılması yalnızca açıkça açılırsa çalışır (`NODE_ENV=production` iken kodlar hiçbir koşulda yazılmaz); ayar unutulursa kapalıdır. E-posta gönderilemiyorsa sunucu kayıt kabul etmez. Sunucu açılışta riskli ayarları uyarı olarak listeler. |

### Ödemeler

| Konu | Nasıl korunuyor |
|---|---|
| Doğrulama | Her satın alma, hak verilmeden önce sunucudan Google Play Developer API ile doğrulanır. Telefonun söylediğine güvenilmez. |
| Tekrar kullanım | Bir satın alma anahtarı yalnızca bir hesaba bağlanır ve bir kez işlenir; başka hesapta ya da ikinci kez kullanılamaz. |
| Ürün eşleşmesi | Anahtarın ait olduğu ürün, istenen ürünle karşılaştırılır; beklemedeki ya da iptal edilmiş ödemeler reddedilir. |
| Süre ve iptal | Abonelik bitişi, iptali ve iadesi Google'dan öğrenilir (kullanıcı uygulamayı kullandıkça günde bir yeniden kontrol + anlık bildirim). Anlık bildirim kuruluysa iade edilen puan paketinin puanı geri alınır. |
| Fiyat | Fiyatlar sunucuda ve Play Console'da durur; uygulamadan fiyat gönderilemez. |

### Yapay zekâ ve topluluk içeriği

| Konu | Nasıl korunuyor |
|---|---|
| Talimat enjeksiyonu | Kurallar sistem isteminde, kullanıcı ve manuel metinleri ayrı etiketli veri bloklarında gider; metnin kendi bloğunu kapatıp talimat gibi görünmesi engellenir. |
| Ekli dosyalar | Arızaya eklenen dosya yalnızca PDF ya da düz metin olabilir; PDF imzası ve sayfa sayısı (en çok 30) kontrol edilir, şifreli PDF reddedilir, metin 200 bin karakterle sınırlıdır. Ek, yalnızca fotoğrafla teşhis içeren planlarda kabul edilir. Dosyanın içeriği de “veri” olarak işaretlenir; içindeki talimatlar izlenmez. |
| Eklerin saklanması | Eklenen fotoğraf ve dosyalar sunucuda **saklanmaz**; teşhis için Claude API'ye iletilir ve bırakılır. Geçmişte yalnızca dosyanın adı ve fotoğraf sayısı kalır. |
| Kötüye kullanım sınırları | Etiket okuma hesap başına günde 20; teşhis kotası AI çağrısından önce düşülür ve durdurulan ya da başarısız olan istekte iade edilir. Manuel okuma ve dizinleme yalnızca geliştirici anahtarıyla çalışır; aynı anda en çok 2 PDF okuma işi yürür. |
| Tehlikeli çözümler | AI ön incelemesinin güvenlik riski işaretlediği çözüm, oy sayısı ne olursa olsun “Doğrulandı” olmaz ve başkalarının teşhisine verilmez; bir geliştirici inceleyip onaylamalıdır. |
| Puan suistimali | Çözüm öğretme, oy verme ve doğrulanma ödülleri günlük sınırlıdır. Gerçek ödeme açıkken yeni hesaba ücretsiz puan verilmez. |
| Satıcı rozeti | “Doğrulanmış satıcı” rozeti otomatik verilmez; Geliştirici panelinden onay gerekir. |

### Uygulama

* Yayın sürümü yalnızca HTTPS ile konuşur ve sunucu adresi uygulamanın içine gömülüdür (değiştirilemez).
* Mikrofon izni istenmez; Android'de uygulama verisi cihaz/bulut yedeğine alınmaz.
* Uygulamada reklam, izleme ya da analiz kütüphanesi yoktur.
* Fotoğraf ya da dosya eklerken kullanıcıya hasta bilgisi görünmemesi gerektiği hatırlatılır.
* Fotoğraflar gönderilmeden önce telefonda küçültülüp yeniden kodlanır; bu, konum gibi gömülü bilgileri de siler.

## 2. Saklanan veriler

| Veri | Nerede | Not |
|---|---|---|
| E-posta, görünen ad, şifre özeti, kayıt zamanı | Sunucu veri dosyası | Görünen ad, öğretilen çözümlerde ve yorumlarda herkese görünür. |
| Oturum özetleri | Sunucu veri dosyası | Anahtarın kendisi yalnızca telefondadır. |
| Plan, puan, puan hareketleri, günlük kullanım | Sunucu veri dosyası | |
| Arıza soruları, AI yanıtları, devam soruları | Sunucu veri dosyası | Kullanıcı başına son 20 kayıt; yalnızca sahibi görür. Eklenen dosyanın yalnızca adı ve fotoğraf sayısı tutulur, kendileri tutulmaz. |
| E-posta doğrulama ve şifre sıfırlama kodları | Sunucu veri dosyası | Yalnızca özetleri; süresi dolunca silinir. |
| Öğretilen çözümler, oylar, yorumlar, ilanlar, eğitim programları, teklif istekleri | Sunucu veri dosyası | Çözüm fotoğrafı (varsa) dahil. |
| Satın alma kayıtları | Sunucu veri dosyası | Satın alma anahtarının özeti, ürün, sipariş numarası; abonelik anahtarı (yeniden doğrulama için). |
| Güvenlik kayıtları | Sunucu çıktısı (log) | Kullanıcı numarası ve hatalı girişlerde IP adresi. |
| Oturum anahtarı, dil/tema ayarları | Telefon | Oturum anahtarı güvenli depoda. |

**Üçüncü taraflara giden veri**

| Kime | Ne | Neden |
|---|---|---|
| Anthropic (Claude API) | Arıza metni, seçilen cihaz, eklenen fotoğraflar ve dosya (PDF/metin), cihaz etiketi fotoğrafı, ilgili manuel bölümleri ve topluluk çözümleri; geliştiricinin yüklediği manuel sayfaları (okuma ve dizinleme için) | Teşhis üretmek, etiketi ve manuelleri okumak için. Ad, e-posta ya da hesap numarası gönderilmez. |
| Google Play | Satın alma anahtarı; satın almayı hesaba bağlamak için iç kullanıcı numarası | Ödeme ve doğrulama. |
| E-posta sağlayıcın (SMTP) | E-posta adresi; doğrulama ya da sıfırlama kodu | Adres doğrulama ve şifre sıfırlama. |

Toplanmayanlar: konum, rehber, reklam kimliği, cihaz tanımlayıcıları, kullanım analitiği.

**Hesap silme:** Hesap → “Hesabı sil” (şifreyle onay). Hesap, oturumlar, geçmiş, öğretilen çözümler, oylar,
yorumlar, ilanlar ve eğitim programları silinir. Satın alma kayıtları (kişisel bilgi içermez) aynı
anahtarın yeniden kullanılmaması için kalır.

## 3. Yayın öncesi kontrol listesi

Bunlar kodla çözülemeyen, senin yapman gereken adımlar:

- [ ] Sunucu **HTTPS** arkasında; `NODE_ENV=production`, `TRUST_PROXY=1` (vekil arkasındaysa) ayarlı.
- [ ] `.env` içinde `DEMO_PAYMENTS` ve `PRINT_EMAIL_CODES` (eski adıyla `PRINT_RESET_CODES`) **yok**. Sunucu açılışında “Security notes” altında uyarı kalmadı.
- [ ] `ADMIN_TOKEN` ve `DATA_ENCRYPTION_KEY` rastgele üretildi (`openssl rand -base64 32`) ve bir parola yöneticisinde saklanıyor.
- [ ] `.env` ve Google hizmet hesabı dosyası depoya (GitHub) **yüklenmedi**; yalnızca sunucuda duruyor.
- [ ] Veri dosyasının düzenli, **şifreli yedeği** alınıyor (`DATA_ENCRYPTION_KEY` yedeği ayrı bir yerde).
- [ ] Sunucunun önünde bir CDN / güvenlik duvarı var (Cloudflare vb.). Büyük ölçekli saldırıları uygulama tek başına karşılayamaz.
- [ ] `SMTP_URL` ayarlı; kayıt doğrulama ve şifre sıfırlama e-postaları gerçekten geliyor (gereksiz klasörüne düşmüyor: gönderen alan adı için SPF/DKIM kayıtları tanımlı).
- [ ] Gizlilik politikası ve KVKK aydınlatma metni bir hukukçuyla hazırlandı, bir web adresinde yayında ve `EXPO_PUBLIC_PRIVACY_URL` ile uygulamaya eklendi.
- [ ] Google Play “Veri güvenliği” formu yukarıdaki tabloya göre dolduruldu; uygulama dışından hesap silme talebi için bir web sayfası / e-posta adresi var (Google bunu ister).
- [ ] Yayından önce bağımsız bir sızma testi yaptırıldı.

## 4. Bilinen sınırlar ve önerilen sonraki adımlar

Önem sırasıyla:

1. **E-posta doğrulama sahte hesabı zorlaştırır, bitirmez.** Artık her hesabın arkasında sahibinin
   erişebildiği gerçek bir adres var; ama bir kişi birden çok adresle (ya da tek kullanımlık e-posta
   servisleriyle) birden çok hesap açıp birbirinin çözümünü “doğrulayarak” puan toplayabilir. Günlük
   ödül sınırları bunu yavaşlatır. *Suistimal görülürse: tek kullanımlık e-posta alan adlarını reddet,
   ya da puan kazanımı için telefon numarası doğrulaması iste.*
2. **Kazanılan puanlarla abonelik alınabiliyor.** Puan ücretsiz kazanılabildiği için bu bir iş kararıdır.
   Suistimal görülürse: ödül miktarlarını düşür, ya da kazanılan puanları satın alınan puanlardan ayırıp
   abonelikte yalnızca satın alınanları geçerli say.
3. **Eğitici ödemeleri.** Ödeme sistemi eklendiğinde yalnızca gerçek parayla alınmış puanlarla yapılan
   satışlara ödeme yapılmalı. Her satış kaydında ödeme türü (`how`) bu yüzden tutuluyor.
4. **İki adımlı giriş yok.** Özellikle geliştirici hesabı için eklenmesi iyi olur.
5. **Veriler tek JSON dosyasında.** Kullanıcı sayısı arttıkça veritabanına ve fotoğraflar için dosya
   deposuna taşınmalı.
6. **“Onaylı alıcı” rozeti**, gerçek satın almayı değil, o ilan için teklif istenmiş olmasını gösterir.
7. **Web sürümü geliştirme içindir.** Tarayıcıda oturum anahtarı tarayıcı deposunda durur; herkese açık
   bir web uygulaması olarak yayınlanacaksa ayrıca ele alınmalı.
8. **Fotoğraflardaki ve dosyalardaki kişisel veri.** Uygulama uyarır ama eki incelemez; ekranda hasta adı
   görünen bir fotoğraf ya da hasta bilgisi içeren bir hata günlüğü Claude API'ye gider ve (çözüm
   fotoğrafıysa) diğer kullanıcılara gösterilir. AI'a, gördüğü kişisel veriyi yanıtında tekrarlamaması
   söylenir; bu bir güvence değil, ek bir önlemdir.
9. **Hesabı silinen kullanıcının etkin Play aboneliği** kendiliğinden iptal olmaz; uygulama silmeden önce uyarır.
10. **Geliştirme araçlarındaki açıklar.** `npm audit`, Expo komut satırı aracının kullandığı `glob`/`minimatch`
    paketlerinde orta düzey 5 uyarı gösterir. Bunlar telefondaki uygulamaya girmez; Expo güncellemesiyle kapanır.
    Sunucu bağımlılıklarında bilinen açık yoktur.

## 5. Bir şey ters giderse

* **Geliştirici anahtarı sızdıysa:** `ADMIN_TOKEN` değerini değiştir, sunucuyu yeniden başlat.
* **Claude ya da Google anahtarı sızdıysa:** ilgili panelden anahtarı iptal edip yenisini üret, `.env` dosyasını güncelle.
* **Bir hesabın ele geçirildiğinden şüpheleniyorsan:** kullanıcı “Şifremi unuttum” ile şifresini yenilesin; bu, tüm cihazlardaki oturumları kapatır.
* **Veri dosyası sızdıysa:** şifreler özet olarak saklandığı için doğrudan okunamaz, ama kullanıcılara haber verip şifre yenilemelerini iste; KVKK kapsamındaki bildirim yükümlülüklerini hukukçunla değerlendir.
