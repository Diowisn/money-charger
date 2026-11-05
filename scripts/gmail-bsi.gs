// Tempel file ini ke Google Apps Script (script.google.com) milik akun Gmail penerima.
// Isi CONFIG, jalankan pasangTrigger sekali, lalu izinkan akses Gmail.

const CONFIG = {
  WEBHOOK_URL: 'https://GANTI-DOMAIN-ANDA.vercel.app/api/email/inbound',
  SECRET: 'GANTI_DENGAN_EMAIL_INBOUND_SECRET',
  QUERY: 'from:(banksi.co.id) is:unread newer_than:7d {subject:(QRIS) subject:(Pembayaran) subject:("INCOMING TRANSACTION")}',
};

function prosesEmailBsi() {
  const threads = GmailApp.search(CONFIG.QUERY, 0, 20);
  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (!msg.isUnread()) continue;
      const payload = {
        id: msg.getId(),
        from: msg.getFrom(),
        subject: msg.getSubject(),
        text: msg.getPlainBody(),
        tanggal: Utilities.formatDate(msg.getDate(), 'Asia/Jakarta', 'yyyy-MM-dd'),
      };
      const res = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Email-Secret': CONFIG.SECRET },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        msg.markRead();
      } else {
        console.error('Gagal memproses email', code, res.getContentText());
      }
    }
  }
}

function pasangTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'prosesEmailBsi')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('prosesEmailBsi').timeBased().everyMinutes(5).create();
}
