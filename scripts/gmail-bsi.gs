// Tempel file ini ke Google Apps Script (script.google.com) milik akun Gmail penerima.
// Isi CONFIG, jalankan pasangTrigger sekali, lalu izinkan akses Gmail.

const CONFIG = {
  WEBHOOK_URL: 'https://GANTI-DOMAIN-ANDA.vercel.app/api/email/inbound',
  SECRET: 'GANTI_DENGAN_EMAIL_INBOUND_SECRET',
  QUERY: '(from:bankbsi.co.id OR from:noreply-cms@bankbsi.co.id OR from:nonereply.byondbybsi@bankbsi.co.id) newer_than:1d in:anywhere (subject:QRIS OR subject:Pembayaran OR subject:"INCOMING TRANSACTION")',
};

function prosesEmailBsi() {
  const threads = GmailApp.search(CONFIG.QUERY, 0, 20);
  Logger.log('Query: ' + CONFIG.QUERY);
  Logger.log('Thread ditemukan: ' + threads.length);
  let diproses = 0;

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      Logger.log('Kandidat: ' + msg.getDate() + ' | unread=' + msg.isUnread() + ' | ' + msg.getFrom() + ' | ' + msg.getSubject());

      const teks = msg.getPlainBody();
      const html = msg.getBody();
      const payload = {
        id: msg.getId(),
        from: msg.getFrom(),
        subject: msg.getSubject(),
        text: teks && teks.trim() ? teks : html,
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
        continue;
      }

      const code = res.getResponseCode();
      Logger.log('Webhook HTTP ' + code + ': ' + res.getContentText());
      if (code >= 200 && code < 300) {
        msg.markRead();
        diproses++;
      }
    }
  }
  Logger.log('Selesai. Email diproses: ' + diproses);
}

// Jalankan ini untuk melihat akun Gmail aktif dan query mana yang menemukan email.
function debugEmailBsi() {
  Logger.log('Akun Gmail aktif: ' + Session.getActiveUser().getEmail());

  const daftarQuery = [
    'from:noreply-cms@bankbsi.co.id newer_than:7d in:anywhere',
    'from:nonereply.byondbybsi@bankbsi.co.id newer_than:7d in:anywhere',
    'from:bankbsi.co.id newer_than:7d in:anywhere',
    'from:bankbsi newer_than:7d in:anywhere',
    'subject:"INCOMING TRANSACTION" newer_than:7d in:anywhere',
    'subject:QRIS newer_than:7d in:anywhere',
    'newer_than:7d in:anywhere',
  ];

  for (const q of daftarQuery) {
    const hasil = GmailApp.search(q, 0, 5);
    Logger.log('QUERY [' + q + '] -> ' + hasil.length + ' thread');
    for (const thread of hasil) {
      for (const msg of thread.getMessages().slice(-3)) {
        Logger.log('  ' + msg.getDate() + ' | ' + msg.getFrom() + ' | ' + msg.getSubject());
      }
    }
  }

  const cocok = GmailApp.search(CONFIG.QUERY, 0, 20);
  Logger.log('Cocok QUERY utama: ' + cocok.length + ' thread');
  for (const thread of cocok) {
    for (const msg of thread.getMessages()) {
      Logger.log('COCOK: ' + msg.getDate() + ' | unread=' + msg.isUnread() + ' | ' + msg.getSubject());
    }
  }
}

// Jalankan ini untuk memastikan URL dan SECRET benar. HTTP 400 = secret benar.
function tesKoneksi() {
  const res = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Email-Secret': CONFIG.SECRET },
    payload: JSON.stringify({ from: 'tes@bankbsi.co.id' }),
    muteHttpExceptions: true,
  });
  Logger.log('HTTP ' + res.getResponseCode() + ': ' + res.getContentText());
}

function pasangTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'prosesEmailBsi')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('prosesEmailBsi').timeBased().everyMinutes(5).create();
}
