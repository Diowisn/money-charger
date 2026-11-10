/**
 * Web app Google Apps Script untuk menerima salinan transaksi Money-Charger.
 *
 * 1. Buat Google Sheets baru, lalu Extensions > Apps Script.
 * 2. Tempel file ini, ganti SPREADSHEET_ID dengan ID spreadsheet Anda.
 * 3. Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 * 4. Salin URL /exec ke dashboard Money-Charger (tab Laporan > Google Sheets).
 *
 * Jika SHEETS_WEBHOOK_SECRET diisi di server Money-Charger, isi SECRET dengan
 * nilai yang sama agar permintaan lain ditolak.
 */
const SPREADSHEET_ID = "GANTI_DENGAN_ID_SPREADSHEET";
const NAMA_SHEET = "Transaksi";
const SECRET = "";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (SECRET && body.secret !== SECRET) {
      return json({ ok: false, error: "Secret tidak cocok." });
    }
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ ok: false, error: "Data kosong." });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(NAMA_SHEET) || ss.insertSheet(NAMA_SHEET);
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);

    return json({ ok: true, baris: rows.length - 1 });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function json(nilai) {
  return ContentService.createTextOutput(JSON.stringify(nilai)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
