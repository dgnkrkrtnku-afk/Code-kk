// Strings added for the native app (server connection, errors, admin token) on top of the prototype's set.
export const EXTRA = {
  tr: {
    h_server: 'Sunucu adresi', h_server_ph: 'https://api.ornek.com', h_name: 'Görünen ad', h_name_ph: 'Örn. Ayşe K.',
    h_admin: 'Geliştirici anahtarı', h_admin_ph: 'Yalnızca geliştiriciler', h_save: 'Kaydet', h_saved: 'Kaydedildi.',
    e_offline: 'Sunucuya bağlanılamadı. Hesap sekmesinden sunucu adresini kontrol et.', e_quota: 'Günlük ücretsiz çözüm hakkın doldu. Pro planda sınır yok.',
    e_photo_plan: 'Fotoğrafla teşhis Pro ve üstü planlarda var.', e_plan_required: 'Bu işlem için planını yükseltmelisin.', e_points: 'Puanın yetmiyor.',
    e_billing: 'Ödeme sistemi henüz yapılandırılmadı.', e_not_configured: 'Sunucuda AI anahtarı tanımlı değil.', e_admin: 'Geliştirici anahtarı geçersiz.',
    e_invalid: 'Bilgiler eksik ya da hatalı.', e_listing_limit: 'Plan ilan sınırına ulaştın.', e_pdf_empty: 'PDF’te metin bulunamadı (taranmış olabilir). Sayfa fotoğrafı olarak ekle.',
    e_pdf_failed: 'PDF okunamadı. Metni yapıştırarak ekle.', e_perm: 'Fotoğraflara erişim izni gerekli.',
    retry: 'Yeniden dene', loading: 'Yükleniyor…', camera: 'Kamera', gallery: 'Galeri', pick: 'Seç',
  },
  en: {
    h_server: 'Server address', h_server_ph: 'https://api.example.com', h_name: 'Display name', h_name_ph: 'E.g. Jane D.',
    h_admin: 'Developer key', h_admin_ph: 'Developers only', h_save: 'Save', h_saved: 'Saved.',
    e_offline: 'Could not reach the server. Check the server address in Account.', e_quota: 'You have used today’s free solutions. Pro has no limit.',
    e_photo_plan: 'Photo diagnosis is available on Pro and above.', e_plan_required: 'Upgrade your plan to do this.', e_points: 'Not enough points.',
    e_billing: 'Payments are not configured yet.', e_not_configured: 'The server has no AI key configured.', e_admin: 'Developer key is not valid.',
    e_invalid: 'Some information is missing or invalid.', e_listing_limit: 'You reached your plan’s listing limit.', e_pdf_empty: 'No text found in the PDF (it may be scanned). Add it as page photos.',
    e_pdf_failed: 'Could not read the PDF. Paste the text instead.', e_perm: 'Photo access permission is required.',
    retry: 'Retry', loading: 'Loading…', camera: 'Camera', gallery: 'Gallery', pick: 'Select',
  },
} as const;
