// Demo content ported from the BioFix AI prototype. Manual texts are sample/educational content.
import type { Course, Listing, Review, SeedDoc, SeedSolution } from './types.js';

export const SEED_DOCS: SeedDoc[] = [
  {
    "title": "Hasta monitörü güç kartı arıza giderme",
    "brand": "Örnek",
    "model": "Hasta Monitörü PM-12",
    "text": "# Genel\nBu belge eğitim amaçlı örnek içeriktir. PM-12 hasta monitörü 100-240 V AC şebekeden ve dahili Li-Ion bataryadan beslenir. Güç kartı (PSU-A) 15 V ana hat, 5 V mantık hattı ve 3.3 V işlemci hattı üretir.\n\n# Belirti: Cihaz açılmıyor, güç LED'i yanıp sönüyor\nGüç LED'inin saniyede bir yanıp sönmesi, güç kartının aşırı akım korumasına girdiğini gösterir. En sık neden 5 V hattındaki kısa devredir.\n1. Cihazı şebekeden ve hastadan ayırın, bataryayı çıkarın. Büyük kondansatörlerin boşalması için 2 dakika bekleyin.\n2. TP1 (15 V) test noktasını ölçün. Beklenen değer 14.7-15.3 V.\n3. TP2 (5 V) test noktasını ölçün. Beklenen değer 4.9-5.1 V. 1 V altında bir değer kısa devreyi gösterir.\n4. 5 V hattı ile şase arasındaki direnci ölçün. 10 ohm altı ise Q3 MOSFET ve C14 tantal kondansatörü sırayla kontrol edin.\n5. Q3 diyot testinde iki yönde de iletim gösteriyorsa değiştirin (parça kodu PM12-Q3-AO4407).\n6. C14 şişmiş ya da kısa devre ise değiştirin (parça kodu PM12-C14-100U16). Q3 arızalarının çoğunda C14 de hasarlıdır.\n\n# Belirti: Batarya şarj olmuyor\nŞarj LED'i hiç yanmıyorsa F2 sigortasını (2 A, yavaş) kontrol edin. Sigorta sağlamsa şarj entegresi U7 girişinde 15 V olmalıdır. Batarya uç gerilimi 9 V altına düşmüşse batarya paketi derin deşarj korumasına girmiştir; paketi değiştirin (parça kodu PM12-BAT-11V).\n\n# Hata kodları\nE21: Güç kartı haberleşme hatası. Ana kart ile güç kartı arasındaki J5 yassı kablosunu yeniden oturtun.\nE24: Batarya sıcaklık sensörü hatası. NTC direncini ölçün, 25 derecede 10 kohm olmalıdır.\nE30: Fan hatası. Fan konnektörü J9 ve fanın kendisini kontrol edin.\n\n# Onarım sonrası\nOnarımdan sonra elektriksel güvenlik testi (kaçak akım, koruyucu toprak direnci) ve fonksiyon testi yapılmadan cihaz kullanıma verilmez."
  },
  {
    "title": "Ventilatör akış sensörü ve kalibrasyon",
    "brand": "Örnek",
    "model": "Ventilatör VX-300",
    "text": "# Genel\nBu belge eğitim amaçlı örnek içeriktir. VX-300 ventilatörde ekspirasyon akışı sıcak telli akış sensörü ile ölçülür. Sensör sarf niteliğindedir.\n\n# Belirti: Akış sensörü kalibrasyonu 3. adımda hata veriyor\nKalibrasyonun 3. adımı sıfır akış referansını ölçer. Bu adımda hata alınıyorsa sırayla şunları kontrol edin.\n1. Hasta devresini çıkarın, ekspirasyon portunun açık olduğundan emin olun.\n2. Akış sensörünü yuvasından çıkarın, telin kopuk ya da kirli olmadığına bakın. Kirli sensörü %70 etanolde 1 saat bekletin ve 30 dakika kurutun.\n3. Sensör konnektöründe oksitlenme olup olmadığına bakın. Pinleri kontak temizleyici ile temizleyin.\n4. Yazılım sürümü 2.3 ve altında ise kalibrasyon toleransı dardır; 2.4 sürümüne güncelleyin.\n5. Hata sürerse akış sensörünü değiştirin (parça kodu VX3-FS-01).\n6. Yeni sensörle de hata sürüyorsa sensör arayüz kartı (parça kodu VX3-SIF-02) arızalıdır.\n\n# Belirti: Düşük hava yolu basıncı alarmı\nÖnce hasta devresinde kaçak testi yapın. Kaçak yoksa ekspirasyon valfi diyaframını kontrol edin; yırtık ya da sertleşmiş diyaframı değiştirin (parça kodu VX3-EV-D). Basınç sensörü sıfır kayması için servis menüsünden P-zero kalibrasyonu yapın.\n\n# Periyodik bakım\nHer 12 ayda bir: hava giriş filtresi, O2 hücresi kontrolü, batarya kapasite testi. Her 24 ayda bir: türbin çalışma saati kontrolü, 20.000 saat üzerinde türbin değişimi."
  },
  {
    "title": "Defibrilatör şarj devresi",
    "brand": "Örnek",
    "model": "Defibrilatör DF-200",
    "text": "# Güvenlik\nBu belge eğitim amaçlı örnek içeriktir. Yüksek gerilim kondansatörü 2000 V üzerinde enerji depolar. Kapağı açmadan önce dahili deşarj prosedürünü çalıştırın ve kondansatör uçlarını deşarj çubuğu ile boşaltıp gerilimsizliği ölçerek doğrulayın.\n\n# Belirti: Şarj süresi uzadı\n200 J için şarj süresi 7 saniyenin altında olmalıdır. 10 saniyeyi aşıyorsa sırayla kontrol edin.\n1. Batarya kapasite testini çalıştırın. Kapasite %70 altında ise bataryayı değiştirin (parça kodu DF2-BAT-14V).\n2. Batarya sağlamsa şebeke beslemesi ile şarj süresini ölçün. Şebekede de uzunsa sorun şarj devresindedir.\n3. Yüksek gerilim kondansatörünün ESR değerini ölçün. Kapasite nominalin %10 altına düşmüşse kondansatörü değiştirin (parça kodu DF2-HVC-196U).\n4. Şarj trafosu primer akımını ölçün; 12 A üzerinde ise anahtarlama transistörü Q1 arızalıdır.\n\n# Belirti: Enerji doğrulama testi başarısız\nDefibrilatör analizörü ile 50, 100 ve 200 J değerlerinde ölçüm yapın. Sapma %15 üzerinde ise enerji kalibrasyonunu servis menüsünden yapın. Kalibrasyon tutmuyorsa hasta rölesi kontaklarını kontrol edin.\n\n# Hata kodları\nD03: Şarj zaman aşımı. D07: Kaşık (paddle) bağlantı hatası. D11: Enerji boşaltma rölesi yapışık; cihazı kullanım dışı bırakın."
  }
];

export const SEED_SOLUTIONS: SeedSolution[] = [
  {
    "by": "Mehmet T.",
    "brand": "Philips",
    "model": "MX450",
    "symptom": "Ekran açılıyor ama dokunmatik tepki vermiyor",
    "code": "",
    "ok": 9,
    "fail": 1,
    "ai": null,
    "steps": "1. Cihazı kapat, şebekeden ayır ve bataryayı çıkar.\n2. Arka kapağı aç, dokunmatik panelin yassı kablosunu ana karttaki soketinden çıkar.\n3. Kablo uçlarını izopropil alkolle temizle, soket kilidini açıp kabloyu tam oturtarak yeniden tak.\n4. Cihazı topla, servis menüsünden dokunmatik kalibrasyonunu çalıştır.",
    "part": "Parça değişmedi, yassı kablo yeniden oturtuldu"
  },
  {
    "by": "Ayşe K.",
    "brand": "Dräger",
    "model": "Evita V300",
    "symptom": "Akış sensörü kalibrasyonu hata veriyor, sensör yeni",
    "code": "",
    "ok": 6,
    "fail": 0,
    "ai": null,
    "steps": "1. Sensörü yuvasından çıkar.\n2. Yuvadaki konnektör pinlerine büyüteçle bak; yeşil-beyaz oksit tabakası varsa kontak temizleyici ve fırça ile temizle.\n3. Pinleri kuruttuktan sonra sensörü tak ve kalibrasyonu yeniden başlat.",
    "part": "Parça değişmedi"
  },
  {
    "by": "Burak Ş.",
    "brand": "Örnek",
    "model": "Hasta Monitörü PM-12",
    "symptom": "Açılmıyor, güç LED’i saniyede bir yanıp sönüyor",
    "code": "",
    "ok": 5,
    "fail": 1,
    "ai": {
      "v": "consistent",
      "note": "Kılavuzdaki TP2, Q3 ve C14 kontrol sırasıyla uyumlu.",
      "safe": false
    },
    "steps": "1. Şebekeden ayır, bataryayı çıkar, 2 dakika bekle.\n2. TP2 noktasında 5 V hattını ölç; bende 0.2 V çıktı.\n3. Q3 MOSFET’i sök, diyot testinde iki yönde iletim varsa değiştir.\n4. C14’ü de mutlaka değiştir; yalnızca Q3’ü değiştirdiğimde arıza iki hafta sonra tekrarladı.",
    "part": "Q3 MOSFET ve C14 tantal kondansatör"
  },
  {
    "by": "Selin K.",
    "brand": "Mindray",
    "model": "BeneHeart D3",
    "symptom": "Batarya dolu göründüğü halde şarj süresi uzuyor",
    "code": "D03",
    "ok": 1,
    "fail": 0,
    "ai": null,
    "steps": "1. Bataryayı çıkar, batarya yuvasındaki yaylı kontaklara bak.\n2. Kontaklarda kararma varsa cam elyaf kalemle temizle.\n3. Bataryayı tak, 200 J şarj süresini kronometreyle ölç.",
    "part": "Parça değişmedi"
  },
  {
    "by": "Can D.",
    "brand": "GE Healthcare",
    "model": "Logiq P9",
    "symptom": "Prob takılı ama sistem probu tanımıyor",
    "code": "",
    "ok": 2,
    "fail": 1,
    "ai": null,
    "steps": "1. Probu başka bir porta tak; orada tanınıyorsa sorun porttadır.\n2. Arızalı portun pin yuvalarına bak, eğik pin varsa düzelt.\n3. Prob konnektörünü kuru hava ile temizle.",
    "part": ""
  }
];

export const SEED_REVIEWS: Omit<Review, 'id' | 'userId'>[] = [
  {
    "key": "philips|mx450",
    "by": "Elif Y.",
    "stars": 5,
    "rel": 5,
    "svc": 4,
    "use": 5,
    "val": 4,
    "again": true,
    "months": "rv_m3",
    "buyer": true,
    "text": "Altı yıldır yoğun bakımda kullanıyoruz. Batarya kapağı mandalı dışında kronik arızası olmadı, parçası kolay bulunuyor."
  },
  {
    "key": "philips|mx450",
    "by": "Murat Ö.",
    "stars": 4,
    "rel": 4,
    "svc": 4,
    "use": 4,
    "val": 3,
    "again": true,
    "months": "rv_m2",
    "buyer": false,
    "text": "Sağlam cihaz ama modül fiyatları yüksek. Dokunmatik kablosu zamanla gevşeyebiliyor."
  },
  {
    "key": "dräger|evita v300",
    "by": "Deniz A.",
    "stars": 4,
    "rel": 5,
    "svc": 3,
    "use": 4,
    "val": 3,
    "again": true,
    "months": "rv_m3",
    "buyer": true,
    "text": "Çok güvenilir, ancak akış sensörü sarf gibi gidiyor ve orijinali pahalı. Bütçeye sensör maliyetini ekleyin."
  },
  {
    "key": "dräger|evita v300",
    "by": "Serkan A.",
    "stars": 3,
    "rel": 4,
    "svc": 2,
    "use": 4,
    "val": 2,
    "again": false,
    "months": "rv_m2",
    "buyer": false,
    "text": "Türbin değişimi maliyetli ve tedarik süresi uzun. 2. el alacaksanız çalışma saatine mutlaka bakın."
  },
  {
    "key": "mindray|beneheart d3",
    "by": "Ayşe K.",
    "stars": 5,
    "rel": 4,
    "svc": 5,
    "use": 5,
    "val": 5,
    "again": true,
    "months": "rv_m2",
    "buyer": true,
    "text": "Fiyatına göre çok iyi. Yedek parça ve ped temini hızlı, servis menüsü anlaşılır."
  },
  {
    "key": "ge healthcare|logiq p9",
    "by": "Can D.",
    "stars": 4,
    "rel": 4,
    "svc": 3,
    "use": 5,
    "val": 4,
    "again": true,
    "months": "rv_m1",
    "buyer": false,
    "text": "Görüntü kalitesi iyi. Prob portlarına dikkat edilmeli, sık tak-çıkar yapılınca pin sorunu çıkıyor."
  }
];

export const SEED_COURSES: Omit<Course, 'id' | 'ownerId'>[] = [
  {
    "title": "Hasta monitörlerinde güç kartı arıza giderme",
    "by": "Müh. Selin Kaya",
    "cat": "svc",
    "level": "i",
    "hours": 6,
    "usd": 60,
    "rating": 4.7,
    "n": 214,
    "desc": "Güç kartı blok şemasından başlayıp test noktası ölçümüne, kısa devre aramaya ve onarım sonrası testlere kadar uygulamalı bir program.",
    "lessons": [
      {
        "t": "Güç kartı blok şeması ve besleme hatları",
        "c": "Bir hasta monitörünün güç kartı genellikle şebeke girişi, batarya şarj katı ve birkaç DC hat üreten dönüştürücülerden oluşur. Bu derste her bloğun görevini ve arıza anında hangi belirtiyi verdiğini eşleştiriyoruz."
      },
      {
        "t": "Test noktalarında ölçüm ve yorum",
        "c": "Ölçüme her zaman girişten başlayıp çıkışa doğru ilerleyin. Beklenen değeri servis manuelinden alın; ölçtüğünüz değerle farkı not edin. Düşük gerilim çoğu zaman o hattaki aşırı yükü gösterir."
      },
      {
        "t": "Kısa devre arama yöntemleri",
        "c": "Hat ile şase arasındaki direnci ölçün. Düşük direnç varsa hattı besleyen ve hattan beslenen elemanları sırayla ayırarak arızalı bölgeyi daraltın."
      },
      {
        "t": "Onarım sonrası güvenlik ve fonksiyon testi",
        "c": "Onarım bittiğinde cihaz kullanıma verilmeden önce elektriksel güvenlik testi ve fonksiyon testi yapılır, sonuçlar bakım kaydına işlenir."
      }
    ]
  },
  {
    "title": "Ventilatör kullanıcı eğitimi: modlar ve alarmlar",
    "by": "Uzm. Hem. Deniz Arı",
    "cat": "use",
    "level": "b",
    "hours": 4,
    "usd": 35,
    "rating": 4.5,
    "n": 388,
    "desc": "Yoğun bakım hemşireleri ve yeni başlayan teknik personel için temel ventilasyon modları, alarm yönetimi ve günlük kontroller.",
    "lessons": [
      {
        "t": "Kullanım öncesi kontrol",
        "c": "Her hastadan önce cihazın kendi kendine testini çalıştırın, hasta devresinde kaçak testini yapın ve alarm sınırlarını hastaya göre ayarlayın."
      },
      {
        "t": "Temel modlar",
        "c": "Hacim kontrollü ve basınç kontrollü modların farkını, hangi parametrenin sabit hangisinin değişken olduğunu örneklerle işliyoruz."
      },
      {
        "t": "Alarm geldiğinde ne yapılır",
        "c": "Önce hastaya, sonra devreye, en son cihaza bakın. Alarmı susturmak sorunu çözmez; nedenini bulmadan sıfırlamayın."
      }
    ]
  },
  {
    "title": "Defibrilatör periyodik bakımı ve enerji doğrulama",
    "by": "Müh. Burak Şen",
    "cat": "svc",
    "level": "a",
    "hours": 5,
    "usd": 75,
    "rating": 4.8,
    "n": 96,
    "desc": "Yüksek gerilim güvenliği, batarya kapasite testi, analizörle enerji doğrulama ve bakım kaydı.",
    "lessons": [
      {
        "t": "Yüksek gerilimde güvenli çalışma",
        "c": "Kapağı açmadan önce dahili deşarj prosedürünü çalıştırın ve kondansatörün gerilimsiz olduğunu ölçerek doğrulayın. Tek elle çalışma alışkanlığı edinin."
      },
      {
        "t": "Batarya kapasite testi",
        "c": "Bataryayı tam şarj edin, üreticinin tarif ettiği deşarj testini çalıştırın ve sonucu kabul sınırıyla karşılaştırın."
      },
      {
        "t": "Analizörle enerji doğrulama",
        "c": "Farklı enerji seviyelerinde atış yapıp analizörde okunan değeri ayarlanan değerle karşılaştırın. Sapma sınırını cihazın servis manuelinden alın."
      }
    ]
  },
  {
    "title": "Elektriksel güvenlik testleri (IEC 62353)",
    "by": "Müh. Elif Yıldırım",
    "cat": "svc",
    "level": "i",
    "hours": 3,
    "usd": 40,
    "rating": 4.6,
    "n": 172,
    "desc": "Periyodik ve onarım sonrası elektriksel güvenlik testlerinin sırası, ölçüm düzenekleri ve kayıt altına alınması.",
    "lessons": [
      {
        "t": "Standardın kapsamı",
        "c": "IEC 62353, tıbbi elektrikli cihazların kullanım ömrü boyunca yapılan periyodik testlerini ve onarım sonrası testlerini tarif eder."
      },
      {
        "t": "Ölçümler",
        "c": "Gözle kontrol, koruyucu toprak direnci, cihaz kaçak akımı ve uygulanan parça kaçak akımı ölçümleri bu sırayla yapılır."
      },
      {
        "t": "Kayıt ve izlenebilirlik",
        "c": "Her test sonucu cihazın künyesiyle birlikte saklanır; ilk ölçüm değerleri sonraki testler için referans olur."
      }
    ]
  }
];

export const SEED_LISTINGS: Omit<Listing, 'ownerId'>[] = [
  {
    "id": "d1",
    "cat": "device",
    "tr": "Hasta monitörü IntelliVue MX450",
    "en": "Patient monitor IntelliVue MX450",
    "brand": "Philips",
    "model": "MX450",
    "year": 2019,
    "cond": "refurb",
    "usd": 5200,
    "seller": "Kuzey Biyomedikal",
    "ok": 1,
    "c": "TR",
    "stock": 4,
    "reg": "UDI kayıtlı",
    "dtr": "Test raporlu, 12 ay satıcı garantili. SpO₂, NIBP ve 5 uçlu EKG kablosu dahil.",
    "den": "With test report and 12-month seller warranty. SpO₂, NIBP and 5-lead ECG cables included."
  },
  {
    "id": "d2",
    "cat": "device",
    "tr": "Ventilatör Evita V300",
    "en": "Ventilator Evita V300",
    "brand": "Dräger",
    "model": "Evita V300",
    "year": 2018,
    "cond": "used",
    "usd": 9200,
    "seller": "MedParts Europe",
    "ok": 1,
    "c": "DE",
    "stock": 2,
    "reg": "UDI kayıtlı",
    "dtr": "8.400 çalışma saati. Son periyodik bakım raporu ilanla birlikte verilir.",
    "den": "8,400 operating hours. Latest maintenance report supplied with the unit."
  },
  {
    "id": "d3",
    "cat": "device",
    "tr": "Defibrilatör BeneHeart D3",
    "en": "Defibrillator BeneHeart D3",
    "brand": "Mindray",
    "model": "BeneHeart D3",
    "year": 2024,
    "cond": "new",
    "usd": 6900,
    "seller": "Delta Clinical Supply",
    "ok": 1,
    "c": "AE",
    "stock": 15,
    "reg": "UDI kayıtlı",
    "dtr": "Kutusunda, 24 ay üretici garantili. Erişkin ped seti dahil.",
    "den": "Boxed, 24-month manufacturer warranty. Adult pad set included."
  },
  {
    "id": "d4",
    "cat": "device",
    "tr": "Ultrason Logiq P9",
    "en": "Ultrasound Logiq P9",
    "brand": "GE Healthcare",
    "model": "Logiq P9",
    "year": 2019,
    "cond": "refurb",
    "usd": 18500,
    "seller": "MedParts Europe",
    "ok": 1,
    "c": "NL",
    "stock": 1,
    "reg": "UDI kayıtlı",
    "dtr": "Konveks ve lineer prob ile. Prob testleri yapılmış, sonuçlar ekte.",
    "den": "With convex and linear probes. Probe tests done, results attached."
  },
  {
    "id": "p1",
    "cat": "part",
    "tr": "Akış sensörü, ventilatör için",
    "en": "Flow sensor for ventilator",
    "brand": "Dräger",
    "model": "Evita V300",
    "year": 2025,
    "cond": "new",
    "usd": 420,
    "seller": "Kuzey Biyomedikal",
    "ok": 1,
    "c": "TR",
    "stock": 38,
    "reg": "ÜTS kayıtlı",
    "dtr": "Orijinal ambalajında. 5 adet ve üzeri alımda teklif isteyin.",
    "den": "Original packaging. Request a quote for 5 or more."
  },
  {
    "id": "p2",
    "cat": "part",
    "tr": "Güç kartı, hasta monitörü",
    "en": "Power board, patient monitor",
    "brand": "GE Healthcare",
    "model": "Carescape B650",
    "year": 2017,
    "cond": "used",
    "usd": 780,
    "seller": "Atlas Yedek Parça",
    "ok": 0,
    "c": "TR",
    "stock": 3,
    "reg": "",
    "dtr": "Çalışır cihazdan sökülmüş, yük altında test edildi. 3 ay garanti.",
    "den": "Pulled from a working unit, tested under load. 3-month warranty."
  },
  {
    "id": "p3",
    "cat": "part",
    "tr": "Yüksek gerilim kondansatörü 196 µF",
    "en": "High-voltage capacitor 196 µF",
    "brand": "Mindray",
    "model": "BeneHeart D3",
    "year": 2025,
    "cond": "new",
    "usd": 310,
    "seller": "Delta Clinical Supply",
    "ok": 1,
    "c": "AE",
    "stock": 12,
    "reg": "",
    "dtr": "Defibrilatör şarj devresi için. Yalnızca yetkin teknik personelce takılmalıdır.",
    "den": "For the defibrillator charge circuit. To be fitted by qualified staff only."
  },
  {
    "id": "c1",
    "cat": "cons",
    "tr": "Defibrilasyon pedi, erişkin (10’lu)",
    "en": "Defibrillation pads, adult (pack of 10)",
    "brand": "Mindray",
    "model": "MR60",
    "year": 2026,
    "cond": "new",
    "usd": 480,
    "seller": "Delta Clinical Supply",
    "ok": 1,
    "c": "AE",
    "stock": 200,
    "reg": "ÜTS kayıtlı",
    "dtr": "Son kullanma tarihi en az 18 ay.",
    "den": "At least 18 months to expiry."
  },
  {
    "id": "c2",
    "cat": "cons",
    "tr": "İnfüzyon seti (25’li)",
    "en": "Infusion set (pack of 25)",
    "brand": "Fresenius Kabi",
    "model": "Agilia VP",
    "year": 2026,
    "cond": "new",
    "usd": 140,
    "seller": "Kuzey Biyomedikal",
    "ok": 1,
    "c": "TR",
    "stock": 520,
    "reg": "ÜTS kayıtlı",
    "dtr": "Steril, tek kullanımlık.",
    "den": "Sterile, single use."
  },
  {
    "id": "a1",
    "cat": "acc",
    "tr": "SpO₂ parmak probu, erişkin",
    "en": "SpO₂ finger probe, adult",
    "brand": "Philips",
    "model": "M1191B",
    "year": 2025,
    "cond": "new",
    "usd": 180,
    "seller": "MedParts Europe",
    "ok": 1,
    "c": "DE",
    "stock": 60,
    "reg": "UDI kayıtlı",
    "dtr": "Tekrar kullanılabilir, 2 m kablo.",
    "den": "Reusable, 2 m cable."
  },
  {
    "id": "a2",
    "cat": "acc",
    "tr": "Konveks prob C1-6",
    "en": "Convex probe C1-6",
    "brand": "GE Healthcare",
    "model": "C1-6-D",
    "year": 2020,
    "cond": "refurb",
    "usd": 2900,
    "seller": "Sonda Imaging",
    "ok": 1,
    "c": "US",
    "stock": 5,
    "reg": "",
    "dtr": "Lens ve kablo yenilendi, eleman testi raporlu.",
    "den": "Lens and cable renewed, with element test report."
  }
];

export const COUNTRIES = [
  "TR",
  "DE",
  "US",
  "AE",
  "NL",
  "IN",
  "GB"
];
