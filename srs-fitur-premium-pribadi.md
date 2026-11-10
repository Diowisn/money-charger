# SRS â€” Fitur Premium Pribadi Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Implementasi bertahap; pemakaian pribadi |
| Versi | 1.1 |
| Tanggal | 10 November 2026 |
| Terkait PRD | [PRD fitur premium pribadi](./prd-fitur-premium-pribadi.md) |
| Terkait SRS utama | [SRS utama](./srs-catatan-keuangan-whatsapp.md) |

> Tidak ada billing atau entitlement pada tahap ini. Semua fitur tersedia untuk pemilik. Dokumen ini mencatat implementasi yang sudah ada dan rencana teknis berikutnya.

## 1. Ruang lingkup implementasi saat ini

Sudah diimplementasikan:

- `WawasanData` dan tab Wawasan.
- `recurring_rules`, `recurring_runs`, worker transaksi berulang.
- API `/api/recurring`.
- Impor CSV melalui `/api/import`.
- Digest WhatsApp mingguan dan peringatan proaktif melalui cron/outbox.
- Multi-dompet: tabel `accounts`, saldo per dompet, transfer, net worth.
- Laporan lanjutan: periode kustom, cetak/simpan PDF, laporan terjadwal ke WhatsApp/email.
- AI Pro: review bulanan otomatis, tanya jawab seluruh riwayat, deteksi anomali.
- Peringatan dalam aplikasi.
- Skema versi v3 (laporan tidak menambah tabel).

## 2. Arsitektur tambahan

### 2.1 Modul recurring

- `src/modules/recurring/model.ts`
  - `jatuhTempo(rule, periode)` menghitung tanggal efektif; tanggal > akhir bulan dipotong.
  - `berikutnyaJatuhTempo(rule, hariIni)` menghitung jadwal berikutnya.
  - `daftarAturan(userId)` mengembalikan aturan + nama pos.
  - `tambahAturan`, `ubahStatusAturan`, `hapusAturan`.
  - `prosesTransaksiBerulang(hariIni)` memproses aturan aktif.
- `src/modules/recurring/controller.ts` + `src/app/api/recurring/route.ts`.
- Cron `/api/cron/outbox` memanggil worker setelah inbound/outbox.
- Tabel:
  - `recurring_rules(id, user_id, nama, nominal, sub_post_id, hari, mulai, aktif, terakhir_jalan)`
  - `recurring_runs(rule_id, periode, transaction_id)` dengan primary key `(rule_id, periode)`.

### 2.2 Impor CSV

- `src/modules/importcsv/model.ts`
  - `parseCsv`: mendukung koma/titik koma, tanda kutip, escape `""`, BOM.
  - `nominalDariCsv`: menormalkan format rupiah Indonesia/umum.
  - `tanggalDariCsv`: ISO, `DD/MM/YYYY`, `DD/MM`.
  - `imporTransaksi`: validasi per baris, pencocokan pos/alias, dedup hash.
- `src/modules/importcsv/controller.ts` + `src/app/api/import/route.ts`.
- Kolom: wajib `tanggal,tipe,nominal`; opsional `label,pos,biaya_admin,wadah`.
- Maksimal 1000 baris; ukuran body maksimal 2 MB.
- Dedup memakai `detail.importHash` dan query `transactions`.

### 2.3 Wawasan

- `bangunDashboard` mengisi:
  - `wawasan.skor`, `label`, `faktor`, `peringatan`.
  - `wawasan.proyeksiPengeluaran`, `proyeksiSaldo`, `rasioTabungan`.
  - `wawasan.langganan`, `totalLangganan`.
- Fungsi murni:
  - `hitungSkorKesehatan`
  - `proyeksiPengeluaranBulan`
  - `deteksiLangganan`
  - `hitungSisaAman`
  - `hitungPerubahanKategori`
- UI: `src/modules/finance/view/tab-wawasan.tsx`.

### 2.4 Digest WhatsApp

- `src/modules/digest/model.ts`
  - `kunciMinggu(iso)` menghasilkan kunci minggu ISO.
  - `pesanMingguan(data)` merangkum pengeluaran, sisa anggaran, proyeksi, dan tagihan â‰¤7 hari.
  - `pesanPeringatan(data)` menyalin peringatan wawasan.
  - `prosesDigest(hariIni)` mengirim melalui outbox dan mencatat status kirim.
- Cron `/api/cron/outbox` memanggil digest setelah transaksi berulang.
- Status disimpan di `config`: `digest_aktif`, `digest_minggu`, `digest_harian`.
- Recipient: nomor aktif pertama di `allowed_numbers`.
- Toggle aktif/mati di tab Wawasan melalui `/api/pengaturan`.

### 2.5 Multi-dompet

- `src/modules/accounts/model.ts`
  - `pastikanAkunDefault(userId)` membuat dompet utama dari `saldo_awal` bila belum ada.
  - `tambahAkunFinance`, `pindahAkunFinance`.
- `src/modules/accounts/controller.ts` + `src/app/api/accounts/route.ts`.
- `src/lib/engine.ts`
  - `hitungAkun(state)` menghitung saldo per dompet dari transaksi.
  - Net worth = total saldo dompet + tabungan + investasi - utang aktif.
- Tabel `accounts`; `transactions.account_id` dan `transactions.account_id_tujuan`.
- UI: `src/modules/finance/view/tab-dompet.tsx`; pilihan dompet di form transaksi.
- Migrasi: `npm run db:setup` membuat dompet utama untuk akun lama.

### 2.6 Laporan lanjutan

- `src/lib/laporan.ts`
  - `validasiPeriode(dari, sampai, hariIni)` memvalidasi rentang; bawaan bulan berjalan.
  - `bangunLaporan(state, dari, sampai)` menghasilkan ringkasan, kategori, jenis, transaksi, dan saldo dompet.
  - `teksLaporan(data)` menyusun teks laporan untuk WhatsApp/email.
  - `periodeLaporanTerakhir(jadwal, hariIni)` memilih pekan/bulan lengkap terakhir.
- `src/modules/laporan/model.ts`
  - `buatLaporan(userId, dari, sampai)` memuat state pemilik dan menyusun laporan.
  - `prosesLaporanTerjadwal(hariIni)` mengirim laporan ke outbox dan email akun.
- `src/modules/laporan/controller.ts` + `src/app/api/laporan/route.ts` (`GET /api/laporan`).
- UI: `src/modules/finance/view/tab-laporan.tsx`; periode preset/kustom, tabel laporan, tombol cetak.
- Status terjadwal disimpan di `config`: `laporan_aktif`, `laporan_jadwal`, `laporan_terakhir`.
- Cron `/api/cron/outbox` memanggil laporan terjadwal setelah digest.
- PDF dihasilkan melalui dialog cetak browser; tidak ada dependensi PDF baru.

### 2.7 AI Pro

- `src/lib/insight.ts`
  - `susunKonteksRiwayat(state, data)` merangkum seluruh bulan, kategori, dan anomali tanpa data mentah berlebihan.
  - `deteksiAnomali(state, hariIni)` mendeteksi lonjakan bulanan/kategori dan transaksi besar.
- `src/modules/insight/model.ts`
  - `tanyaInsight` memakai konteks dashboard + seluruh riwayat.
  - `prosesReviewBulanan(hariIni)` membuat review AI bulan lalu dan mengirim ke outbox.
- Status disimpan di `config`: `ai_review_aktif`, `ai_review_terakhir`.
- Cron `/api/cron/outbox` memanggil review bulanan setelah laporan terjadwal.
- UI: toggle review di tab Asisten; anomali tampil di tab Wawasan.

## 3. Persyaratan fungsional

### FR-REC â€” Transaksi berulang

- **FR-REC-01 MUST:** aturan aktif dengan tanggal jatuh tempo â‰¤ hari ini diproses cron.
- **FR-REC-02 MUST:** satu aturan menghasilkan maksimal satu transaksi per `periode` (`YYYY-MM`).
- **FR-REC-03 MUST:** aturan dengan `mulai` setelah tanggal jatuh tempo bulan berjalan tidak diproses mundur.
- **FR-REC-04 MUST:** tanggal 29â€“31 dipotong ke akhir bulan sesuai kalender.
- **FR-REC-05 MUST:** aturan bisa dijeda/dihapus tanpa menghapus transaksi historis.
- **FR-REC-06 MUST:** transaksi otomatis memakai pos jika ada dan tetap tunduk pada validasi domain.
- **FR-REC-07 SHOULD:** kegagalan satu aturan tidak menghentikan aturan lain.

### FR-CSV â€” Impor mutasi

- **FR-CSV-01 MUST:** header tanpa `tanggal`, `tipe`, atau `nominal` ditolak sebelum mutasi.
- **FR-CSV-02 MUST:** baris invalid dicatat sebagai gagal dan tidak menghentikan baris lain.
- **FR-CSV-03 MUST:** tipe menerima `out/in`, `keluar/masuk`, `debit/kredit`.
- **FR-CSV-04 MUST:** tanggal masa depan ditolak.
- **FR-CSV-05 MUST:** nominal harus bilangan bulat rupiah >0.
- **FR-CSV-06 MUST:** transaksi dengan `importHash` sama untuk pengguna yang sama dilewati.
- **FR-CSV-07 MUST:** impor hanya membuat `out`/`in`; gaji/bonus lewat jalur transaksi biasa.
- **FR-CSV-08 SHOULD:** pos dicocokkan berdasarkan nama/alias aktif; jika ambigu, transaksi tanpa pos.

### FR-DIG â€” Digest WhatsApp

- **FR-DIG-01 MUST:** digest membuat baris `outbox`, bukan mengirim langsung.
- **FR-DIG-02 MUST:** ringkasan mingguan maksimal sekali per minggu ISO.
- **FR-DIG-03 MUST:** peringatan proaktif maksimal sekali per hari.
- **FR-DIG-04 MUST:** digest dapat dimatikan dari pengaturan.
- **FR-DIG-05 MUST:** recipient hanya nomor aktif di `allowed_numbers`.

### FR-DOM â€” Multi-dompet

- **FR-DOM-01 MUST:** dompet punya nama, tipe, saldo awal, dan urutan.
- **FR-DOM-02 MUST:** saldo dompet dihitung dari transaksi, bukan disimpan.
- **FR-DOM-03 MUST:** transfer antar dompet membuat transaksi `pindah` dengan dompet asal/tujuan.
- **FR-DOM-04 MUST:** transfer ditolak bila saldo dompet asal kurang.
- **FR-DOM-05 MUST:** transaksi pengeluaran/pemasukan/gaji/bonus dapat memilih dompet.
- **FR-DOM-06 MUST:** net worth = saldo dompet + tabungan + investasi - utang aktif.

### FR-AI â€” AI Pro

- **FR-AI-01 MUST:** tanya jawab memakai agregat seluruh riwayat, bukan hanya transaksi terbaru.
- **FR-AI-02 MUST:** deteksi anomali hanya tampilan/insight; tidak membuat mutasi.
- **FR-AI-03 MUST:** review bulanan opt-in dan maksimal sekali per bulan.
- **FR-AI-04 MUST:** review bulanan dikirim melalui outbox, bukan langsung.
- **FR-AI-05 MUST:** tanpa `GROQ_API_KEY`, fitur AI dilewati tanpa menggagalkan cron.

### FR-WS â€” Wawasan dan peringatan

- **FR-WS-01 MUST:** skor 0â€“100 dengan label.
- **FR-WS-02 MUST:** proyeksi bulanan dihitung dari pengeluaran bulan berjalan dibagi hari berjalan.
- **FR-WS-03 MUST:** peringatan anggaran muncul saat rasio â‰¥80%.
- **FR-WS-04 MUST:** peringatan proyeksi saldo negatif, saldo habis <7 hari, dan tagihan â‰¤7 hari.
- **FR-WS-05 MUST:** deteksi langganan hanya tampilan; tidak membuat mutasi.
- **FR-WS-06 SHOULD:** algoritma langganan memakai minimal 2 bulan, nominal stabil Â±15%, maksimal 2 transaksi/bulan.

### FR-LAP â€” Laporan lanjutan

- **FR-LAP-01 MUST:** laporan menerima periode kustom `dari`/`sampai` dan menolak tanggal terbalik atau masa depan.
- **FR-LAP-02 MUST:** ringkasan memisahkan pemasukan, pengeluaran, biaya admin, arus bersih, dan rata-rata harian.
- **FR-LAP-03 MUST:** transaksi batal dan transaksi turunan tidak dihitung.
- **FR-LAP-04 MUST:** kategori pengeluaran memakai pos, lalu label, lalu â€œ(Tanpa pos)â€.
- **FR-LAP-05 MUST:** laporan dapat dicetak atau disimpan sebagai PDF dari browser.
- **FR-LAP-06 MUST:** laporan terjadwal membuat baris `outbox`, bukan mengirim langsung.
- **FR-LAP-07 MUST:** laporan terjadwal maksimal sekali per kunci periode (minggu ISO/bulan).
- **FR-LAP-08 MUST:** laporan terjadwal opt-in dan hanya dikirim ke nomor pemilik serta email akun.
- **FR-LAP-09 SHOULD:** rentang laporan dibatasi maksimal 3 tahun.

## 4. Keamanan dan integritas

- Semua API recurring/import/accounts/laporan memakai `pemilikRequest`.
- `user_id` aturan berasal dari sesi, bukan body.
- Query aturan/CSV dibatasi `user_id` pemilik.
- Tidak ada token/password di log.
- `recurring_runs` mencegah duplikasi; jika insert transaksi gagal, reservasi run dihapus.
- Impor tidak menghapus atau menimpa transaksi lama.

## 5. Migrasi

- Skema v2 menambahkan `recurring_rules` dan `recurring_runs`.
- Skema v3 menambahkan `accounts` dan kolom dompet pada `transactions`.
- Jalankan `npm run db:setup` untuk menerapkan skema idempoten dan dompet utama.
- Sebelum migrasi berisiko, buat snapshot Neon.
- Marker versi dicatat di `schema_version`.
- Digest tidak menambah tabel; status kirim disimpan di `config`.
- Laporan lanjutan tidak menambah tabel; status dikirim disimpan di `config` (`laporan_aktif`, `laporan_jadwal`, `laporan_terakhir`).

## 6. Acceptance criteria

### Recurring

- **AC-REC-01:** aturan tanggal 31 diproses 28 Feb 2026 dan 29 Feb 2028.
- **AC-REC-02:** cron dijalankan dua kali pada bulan yang sama hanya membuat satu transaksi.
- **AC-REC-03:** aturan dengan `mulai` bulan depan tidak membuat transaksi bulan ini.
- **AC-REC-04:** aturan dijeda tidak diproses; transaksi lama tetap ada.
- **AC-REC-05:** nama aturan, nominal, dan pos muncul pada transaksi otomatis.

### CSV

- **AC-CSV-01:** CSV dengan kutip dan koma di label terbaca benar.
- **AC-CSV-02:** nominal `Rp25.000`, `1.200.000`, `25,000.00` menjadi 25.000/1.200.000/25.000.
- **AC-CSV-03:** impor ulang CSV yang sama menambah 0 transaksi.
- **AC-CSV-04:** satu baris invalid menghasilkan error baris dan baris valid tetap masuk.
- **AC-CSV-05:** tanggal masa depan ditolak.

### Digest

- **AC-DIG-01:** dua cron pada minggu yang sama hanya membuat satu ringkasan mingguan.
- **AC-DIG-02:** dua cron pada hari yang sama hanya membuat satu peringatan harian.
- **AC-DIG-03:** digest mati tidak membuat outbox.
- **AC-DIG-04:** tanpa nomor aktif di `allowed_numbers`, digest dilewati.

### Dompet

- **AC-DOM-01:** gaji, alokasi, pengeluaran, dan transfer mengubah saldo dompet yang benar.
- **AC-DOM-02:** transfer melebihi saldo dompet asal ditolak.
- **AC-DOM-03:** transaksi tanpa dompet memakai dompet utama.
- **AC-DOM-04:** net worth mengikuti saldo dompet + tabungan + investasi - utang aktif.

### AI Pro

- **AC-AI-01:** konteks tanya jawab memuat seluruh bulan dan kategori.
- **AC-AI-02:** lonjakan bulanan/kategori terdeteksi sebagai anomali.
- **AC-AI-03:** dua cron pada bulan yang sama hanya membuat satu review.
- **AC-AI-04:** review mati tidak membuat outbox.

### Wawasan

- **AC-WS-01:** skor selalu 0â€“100.
- **AC-WS-02:** proyeksi 310.000 pada hari ke-10 bulan 31 hari = 961.000.
- **AC-WS-03:** peringatan anggaran muncul pada rasio â‰¥0,8.
- **AC-WS-04:** langganan dengan 2 bulan nominal sama terdeteksi; transaksi harian tidak.

### Laporan

- **AC-LAP-01:** periode `2026-11-01`â€“`2026-11-30` menghitung 30 hari dan transaksi di dalam rentang saja.
- **AC-LAP-02:** pengeluaran `Rp25.000` dengan biaya admin `Rp2.500` masuk sebagai `Rp27.500`.
- **AC-LAP-03:** transaksi batal dan `alokasi_gaji` tidak muncul pada ringkasan maupun daftar.
- **AC-LAP-04:** tombol cetak membuka dialog cetak dan CSS cetak menyembunyikan navigasi.
- **AC-LAP-05:** dua cron pada pekan/bulan yang sama hanya membuat satu laporan terjadwal.
- **AC-LAP-06:** laporan terjadwal mati tidak membuat outbox/email.

## 7. Rencana fitur berikutnya

### 7.1 Digest WhatsApp (sudah diimplementasikan)

- Status kirim di `config` untuk mencegah duplikat harian/mingguan.
- Worker membuat outbox, bukan mengirim langsung.
- Konten: pengeluaran, sisa anggaran, proyeksi, tagihan terdekat.
- Recipient: nomor pemilik yang terverifikasi di `allowed_numbers`.
- Bisa dimatikan dari tab Wawasan.

### 7.2 Multi-dompet (sudah diimplementasikan)

- Tabel `accounts` dengan tipe, saldo awal, urutan.
- Transfer antar akun sebagai transaksi.
- Net worth dari akun + tabungan + investasi - utang.
- Migrasi saldo lama ke akun default.

### 7.3 Laporan lanjutan (sudah diimplementasikan)

- Laporan periode kustom dari data transaksi, bukan hanya 120 transaksi dashboard.
- Cetak/simpan PDF melalui dialog cetak browser dan CSS cetak.
- Laporan terjadwal mingguan/bulanan melalui outbox WhatsApp dan email akun.
- Anti-duplikat per kunci periode di `config.laporan_terakhir`.

### 7.4 AI Pro (sudah diimplementasikan)

- Review bulanan dari agregat dashboard, bukan data mentah.
- Tanya jawab seluruh riwayat dengan batas biaya.
- Deteksi anomali sebagai insight, bukan mutasi.

### 7.5 Kolaborasi dan keamanan

- Anggota/workspace hanya jika aplikasi dipublikasikan.
- 2FA dan manajemen sesi untuk pemilik.
- Ekspor terenkripsi.

## 8. Traceability

| PRD | SRS | Acceptance |
|---|---|---|
| F-PREM-01 | FR-WS | AC-WS |
| F-PREM-02 | FR-REC | AC-REC |
| F-PREM-03 | FR-CSV | AC-CSV |
| F-PREM-04 | FR-DIG | AC-DIG |
| F-PREM-05 | FR-DOM | AC-DOM |
| F-PREM-06 | FR-LAP | AC-LAP |
| F-PREM-07 | FR-AI | AC-AI |
| F-PREM-08-09 | Bagian 7.5 | Belum diimplementasikan |
