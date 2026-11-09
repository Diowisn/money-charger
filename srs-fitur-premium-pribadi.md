# SRS — Fitur Premium Pribadi Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Implementasi bertahap; pemakaian pribadi |
| Versi | 1.0 |
| Tanggal | 9 November 2026 |
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
- Peringatan dalam aplikasi.
- Skema versi v3.

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
  - `pesanMingguan(data)` merangkum pengeluaran, sisa anggaran, proyeksi, dan tagihan ≤7 hari.
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

## 3. Persyaratan fungsional

### FR-REC — Transaksi berulang

- **FR-REC-01 MUST:** aturan aktif dengan tanggal jatuh tempo ≤ hari ini diproses cron.
- **FR-REC-02 MUST:** satu aturan menghasilkan maksimal satu transaksi per `periode` (`YYYY-MM`).
- **FR-REC-03 MUST:** aturan dengan `mulai` setelah tanggal jatuh tempo bulan berjalan tidak diproses mundur.
- **FR-REC-04 MUST:** tanggal 29–31 dipotong ke akhir bulan sesuai kalender.
- **FR-REC-05 MUST:** aturan bisa dijeda/dihapus tanpa menghapus transaksi historis.
- **FR-REC-06 MUST:** transaksi otomatis memakai pos jika ada dan tetap tunduk pada validasi domain.
- **FR-REC-07 SHOULD:** kegagalan satu aturan tidak menghentikan aturan lain.

### FR-CSV — Impor mutasi

- **FR-CSV-01 MUST:** header tanpa `tanggal`, `tipe`, atau `nominal` ditolak sebelum mutasi.
- **FR-CSV-02 MUST:** baris invalid dicatat sebagai gagal dan tidak menghentikan baris lain.
- **FR-CSV-03 MUST:** tipe menerima `out/in`, `keluar/masuk`, `debit/kredit`.
- **FR-CSV-04 MUST:** tanggal masa depan ditolak.
- **FR-CSV-05 MUST:** nominal harus bilangan bulat rupiah >0.
- **FR-CSV-06 MUST:** transaksi dengan `importHash` sama untuk pengguna yang sama dilewati.
- **FR-CSV-07 MUST:** impor hanya membuat `out`/`in`; gaji/bonus lewat jalur transaksi biasa.
- **FR-CSV-08 SHOULD:** pos dicocokkan berdasarkan nama/alias aktif; jika ambigu, transaksi tanpa pos.

### FR-DIG — Digest WhatsApp

- **FR-DIG-01 MUST:** digest membuat baris `outbox`, bukan mengirim langsung.
- **FR-DIG-02 MUST:** ringkasan mingguan maksimal sekali per minggu ISO.
- **FR-DIG-03 MUST:** peringatan proaktif maksimal sekali per hari.
- **FR-DIG-04 MUST:** digest dapat dimatikan dari pengaturan.
- **FR-DIG-05 MUST:** recipient hanya nomor aktif di `allowed_numbers`.

### FR-DOM — Multi-dompet

- **FR-DOM-01 MUST:** dompet punya nama, tipe, saldo awal, dan urutan.
- **FR-DOM-02 MUST:** saldo dompet dihitung dari transaksi, bukan disimpan.
- **FR-DOM-03 MUST:** transfer antar dompet membuat transaksi `pindah` dengan dompet asal/tujuan.
- **FR-DOM-04 MUST:** transfer ditolak bila saldo dompet asal kurang.
- **FR-DOM-05 MUST:** transaksi pengeluaran/pemasukan/gaji/bonus dapat memilih dompet.
- **FR-DOM-06 MUST:** net worth = saldo dompet + tabungan + investasi - utang aktif.

### FR-WS — Wawasan dan peringatan

- **FR-WS-01 MUST:** skor 0–100 dengan label.
- **FR-WS-02 MUST:** proyeksi bulanan dihitung dari pengeluaran bulan berjalan dibagi hari berjalan.
- **FR-WS-03 MUST:** peringatan anggaran muncul saat rasio ≥80%.
- **FR-WS-04 MUST:** peringatan proyeksi saldo negatif, saldo habis <7 hari, dan tagihan ≤7 hari.
- **FR-WS-05 MUST:** deteksi langganan hanya tampilan; tidak membuat mutasi.
- **FR-WS-06 SHOULD:** algoritma langganan memakai minimal 2 bulan, nominal stabil ±15%, maksimal 2 transaksi/bulan.

## 4. Keamanan dan integritas

- Semua API recurring/import/accounts memakai `pemilikRequest`.
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

### Wawasan

- **AC-WS-01:** skor selalu 0–100.
- **AC-WS-02:** proyeksi 310.000 pada hari ke-10 bulan 31 hari = 961.000.
- **AC-WS-03:** peringatan anggaran muncul pada rasio ≥0,8.
- **AC-WS-04:** langganan dengan 2 bulan nominal sama terdeteksi; transaksi harian tidak.

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

### 7.3 Laporan lanjutan

- Laporan PDF/print dari data dashboard.
- Periode kustom.
- Ekspor terjadwal melalui outbox/email.

### 7.4 AI Pro

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
| F-PREM-06–09 | Bagian 7 | Belum diimplementasikan |
