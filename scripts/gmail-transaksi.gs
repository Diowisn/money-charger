// Tempel file ini ke Google Apps Script (script.google.com) milik akun Gmail penerima.
// Isi CONFIG, jalankan pasangTrigger sekali, lalu izinkan akses Gmail.

const CONFIG = {
  WEBHOOK_URL: 'https://GANTI-DOMAIN-ANDA.vercel.app/api/email/inbound',
  SECRET: 'GANTI_DENGAN_EMAIL_INBOUND_SECRET',
  UMUR_EMAIL: '1d',
  MAKS_THREAD_PER_SUMBER: 15,
  BATAS_MENIT: 4,
};

// Hapus/komentari sumber yang tidak dipakai. `subjek` opsional; kosong = semua email dari domain itu.
const SUMBER = [
  { nama: 'BSI', dari: ['bankbsi.co.id'], subjek: ['QRIS', 'Pembayaran', 'INCOMING TRANSACTION'] },
  { nama: 'BCA', dari: ['bca.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS', 'Internet Banking'] },
  { nama: 'Mandiri', dari: ['bankmandiri.co.id', 'mandiri.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS'] },
  { nama: 'BRI', dari: ['bri.co.id'], subjek: ['Transaksi', 'Notifikasi', 'BRImo', 'QRIS'] },
  { nama: 'BNI', dari: ['bni.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS'] },
  { nama: 'CIMB Niaga', dari: ['cimbniaga.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS'] },
  { nama: 'Permata', dari: ['permatabank.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS'] },
  { nama: 'BTN', dari: ['btn.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS'] },
  { nama: 'Jenius', dari: ['jenius.com'], subjek: ['Transaksi', 'Notifikasi', 'QRIS', 'Transfer'] },
  { nama: 'Jago', dari: ['jago.com'], subjek: ['Transaksi', 'Notifikasi', 'QRIS', 'Transfer'] },
  { nama: 'SeaBank', dari: ['seabank.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS', 'Transfer'] },
  { nama: 'Blu', dari: ['blu.id', 'blubybcadigital.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS', 'Transfer'] },
  { nama: 'Neo', dari: ['neo.co.id', 'bankneocommerce.co.id'], subjek: ['Transaksi', 'Notifikasi', 'QRIS', 'Transfer'] },
  { nama: 'GoPay', dari: ['gopay.co.id', 'gojek.com'], subjek: ['Transaksi', 'Pembayaran', 'Notifikasi', 'GoPay'] },
  { nama: 'OVO', dari: ['ovo.id'], subjek: ['Transaksi', 'Pembayaran', 'Notifikasi', 'OVO'] },
  { nama: 'DANA', dari: ['dana.id'], subjek: ['Transaksi', 'Pembayaran', 'Notifikasi', 'DANA'] },
  { nama: 'ShopeePay', dari: ['shopeepay.co.id', 'shopee.co.id'], subjek: ['Transaksi', 'Pembayaran', 'Notifikasi', 'ShopeePay'] },
  { nama: 'LinkAja', dari: ['linkaja.id'], subjek: ['Transaksi', 'Pembayaran', 'Notifikasi', 'LinkAja'] },
];

function daftarSumber() {
  if (!Array.isArray(SUMBER)) {
    Logger.log('SUMBER bukan array; tidak ada sumber yang diproses.');
    return [];
  }
  return SUMBER.filter((s) => {
    const sah = Boolean(s && Array.isArray(s.dari) && s.dari.length > 0);
    if (!sah) Logger.log('Entri SUMBER tidak valid, dilewati: ' + JSON.stringify(s));
    return sah;
  });
}

function querySumber(sumber) {
  if (!sumber || !Array.isArray(sumber.dari)) {
    throw new Error('querySumber hanya untuk internal. Jalankan pasangTrigger atau prosesEmailTransaksi.');
  }
  const dari = sumber.dari.map((d) => 'from:' + d).join(' OR ');
  const subjek = (sumber.subjek || [])
    .map((k) => 'subject:' + (k.indexOf(' ') >= 0 ? '"' + k + '"' : k))
    .join(' OR ');
  return 'newer_than:' + CONFIG.UMUR_EMAIL + ' in:anywhere (' + dari + ')' + (subjek ? ' (' + subjek + ')' : '');
}

function kirimKeWebhook(msg, akun, penyedia) {
  const teks = msg.getPlainBody();
  const html = msg.getBody();
  const payload = {
    id: msg.getId(),
    from: msg.getFrom(),
    subject: msg.getSubject(),
    text: teks && teks.trim() ? teks : html,
    akun,
    penyedia,
    tanggal: Utilities.formatDate(msg.getDate(), 'Asia/Jakarta', 'yyyy-MM-dd'),
  };

  let res;
  try {
    res = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Email-Secret': CONFIG.SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('Gagal koneksi ke webhook: ' + e);
    return false;
  }

  const code = res.getResponseCode();
  Logger.log('Webhook ' + penyedia + ' HTTP ' + code + ': ' + res.getContentText());
  if (code >= 200 && code < 300) {
    msg.markRead();
    return true;
  }
  return false;
}

function prosesEmailTransaksi() {
  const mulai = Date.now();
  const akun = Session.getEffectiveUser().getEmail();
  Logger.log('Akun Gmail: ' + akun);
  let diproses = 0;

  for (const sumber of daftarSumber()) {
    if (Date.now() - mulai > CONFIG.BATAS_MENIT * 60 * 1000) {
      Logger.log('Batas waktu tercapai; sumber tersisa diproses pada jadwal berikutnya.');
      break;
    }

    const query = querySumber(sumber);
    const threads = GmailApp.search(query, 0, CONFIG.MAKS_THREAD_PER_SUMBER);
    Logger.log(sumber.nama + ' [' + query + '] -> ' + threads.length + ' thread');

    for (const thread of threads) {
      for (const msg of thread.getMessages()) {
        Logger.log('Kandidat: ' + msg.getDate() + ' | ' + msg.getFrom() + ' | ' + msg.getSubject());
        if (kirimKeWebhook(msg, akun, sumber.nama)) diproses++;
      }
    }
  }
  Logger.log('Selesai. Email diproses: ' + diproses);
}

// Jalankan ini untuk melihat query dan email yang cocok dari setiap bank/e-wallet.
function debugEmailTransaksi() {
  Logger.log('Akun Gmail aktif: ' + Session.getActiveUser().getEmail());
  for (const sumber of daftarSumber()) {
    const query = querySumber(sumber);
    const hasil = GmailApp.search(query, 0, 5);
    Logger.log('[' + sumber.nama + '] ' + hasil.length + ' thread | ' + query);
    for (const thread of hasil) {
      for (const msg of thread.getMessages().slice(-3)) {
        Logger.log('  ' + msg.getDate() + ' | ' + msg.getFrom() + ' | ' + msg.getSubject());
      }
    }
  }
}

// Jalankan ini untuk memastikan URL dan SECRET benar. HTTP 400 = secret benar.
function tesKoneksi() {
  const res = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Email-Secret': CONFIG.SECRET },
    payload: JSON.stringify({ from: 'tes@contoh.co.id' }),
    muteHttpExceptions: true,
  });
  Logger.log('HTTP ' + res.getResponseCode() + ': ' + res.getContentText());
}

function pasangTrigger() {
  const handler = ['prosesEmailBsi', 'prosesEmailTransaksi'];
  ScriptApp.getProjectTriggers()
    .filter((t) => handler.indexOf(t.getHandlerFunction()) >= 0)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('prosesEmailTransaksi').timeBased().everyMinutes(5).create();
}
