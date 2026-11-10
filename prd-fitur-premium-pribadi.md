# PRD — Fitur Premium Pribadi Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Aktif; penggunaan pribadi, tanpa paywall |
| Versi | 1.1 |
| Tanggal | 10 November 2026 |
| Dokumen induk | [PRD utama](./prd-catatan-keuangan-whatsapp.md) |
| Dokumen teknis | [SRS fitur premium pribadi](./srs-fitur-premium-pribadi.md) |

> Semua fitur di dokumen ini terbuka untuk pemilik. Tidak ada billing, subscription, entitlement, atau pembatasan paket. Istilah “premium” berarti kualitas/kemampuan fitur kelas berbayar, bukan paywall. Mekanik pembayaran hanya dibahas sebagai rencana masa depan jika aplikasi dipublikasikan.

## 1. Tujuan

Membuat Money-Charger terasa seperti aplikasi keuangan kelas berbayar untuk pemakaian pribadi:

- Mengurangi input manual.
- Memberi peringatan sebelum masalah terjadi.
- Menampilkan analisis yang biasanya ada di paket Pro.
- Menjaga data tetap aman dan dapat dipulihkan.

## 2. Prinsip

1. **Pemilik tunggal:** semua fitur aktif untuk pemilik, tanpa login pelanggan atau tenant.
2. **Data yang sudah ada dipakai lebih dulu:** hindari skema baru jika derivasi cukup.
3. **Otomasi harus idempoten:** cron/worker tidak boleh menggandakan transaksi.
4. **Transparan:** setiap angka dapat ditelusuri ke transaksi/sumber.
5. **Tetap bisa dipulihkan:** fitur baru tidak boleh menghapus data lama tanpa backup.

## 3. Status implementasi

### Sudah ada

- Dashboard keuangan, WhatsApp, anggaran, ekspor, piutang/utang, target tabungan, AI assistant.
- **Wawasan**: skor kesehatan finansial, proyeksi pengeluaran/saldo akhir bulan, rasio tabungan, deteksi langganan, peringatan dalam aplikasi.
- **Transaksi otomatis**: aturan tagihan bulanan, jeda/lanjutkan/hapus, anti-duplikat per bulan.
- **Impor mutasi CSV**: out/in, pos, biaya admin, wadah, anti-duplikat berbasis hash.
- **Digest WhatsApp**: ringkasan mingguan, peringatan anggaran/tagihan, anti-duplikat harian/mingguan, dapat dimatikan.
- **Multi-dompet dan net worth**: saldo per rekening/e-wallet, transfer antar dompet, kekayaan bersih.
- **Laporan lanjutan**: periode kustom, cetak/simpan PDF, laporan terjadwal ke WhatsApp/email.
- **AI Pro**: review bulanan otomatis, tanya jawab seluruh riwayat, deteksi anomali.
- **Kolaborasi keluarga**: anggota, peran, anggaran bersama, persetujuan transaksi, nomor WhatsApp anggota.
- Backup/restore melalui Neon Console, audit log dasar, ekspor CSV.

### Berikutnya, berurutan

1. **Integrasi**: impor email bank/e-wallet yang lebih kaya, Google Sheets, kalender.
2. **Keamanan/kepercayaan**: 2FA, manajemen sesi, ekspor terenkripsi.
3. **Mekanik paywall**: hanya jika akan dipublikasikan; tidak diperlukan untuk pemakaian pribadi.

## 4. Kebutuhan per fitur

### F-PREM-01 Wawasan

- Skor 0–100 dari anggaran, tabungan, dana darurat, dan arus saldo.
- Proyeksi pengeluaran dan saldo akhir bulan.
- Deteksi langganan bulanan berulang.
- Peringatan: anggaran ≥80%, proyeksi saldo minus, saldo hampir habis, tagihan jatuh tempo ≤7 hari.
- Tab **Wawasan** di sidebar dan navigasi bawah.

**Sukses:** pemilik dapat memahami kondisi keuangan <1 menit tanpa membaca seluruh transaksi.

### F-PREM-02 Transaksi otomatis

- Aturan: nama, nominal, tanggal 1–31, pos, tanggal mulai.
- Aksi: tambah, jeda, lanjutkan, hapus.
- Cron mencatat transaksi pada tanggal jatuh tempo.
- Satu aturan hanya menghasilkan satu transaksi per bulan.
- Tanggal 29–31 menyesuaikan akhir bulan.

**Sukses:** tagihan rutin tercatat tanpa interaksi manual dan tanpa duplikat.

### F-PREM-03 Impor CSV

- Header wajib: `tanggal,tipe,nominal`.
- Opsional: `label,pos,biaya_admin,wadah`.
- Menerima format tanggal ISO/Indonesia dan nominal rupiah.
- Maksimal 1000 baris per impor.
- Duplikat dengan isi sama dilewati.
- Baris gagal dilaporkan tanpa menggagalkan seluruh impor.

**Sukses:** impor 100 baris selesai <1 menit dan tidak menggandakan transaksi.

### F-PREM-04 Digest WhatsApp

- Ringkasan mingguan: pengeluaran, sisa anggaran, proyeksi, tagihan terdekat.
- Peringatan anggaran/tagihan proaktif.
- Dapat dimatikan pemilik.
- Tidak mengirim data ke nomor selain pemilik.
- Anti-duplikat: satu ringkasan per minggu ISO dan satu peringatan per hari.

### F-PREM-05 Multi-dompet

- Rekening/e-wallet dengan saldo masing-masing.
- Transfer antar dompet.
- Transaksi dapat dicatat dari dompet pilihan.
- Net worth = total saldo dompet + tabungan + investasi - utang.

### F-PREM-06 Laporan lanjutan

- Laporan periode kustom: pilih rentang tanggal bebas hingga 3 tahun.
- Ringkasan pemasukan, pengeluaran, biaya admin, arus bersih, dan rata-rata harian.
- Rincian pengeluaran per pos, per jenis transaksi, saldo dompet, dan daftar transaksi.
- Cetak atau simpan PDF melalui dialog cetak browser.
- Laporan terjadwal mingguan/bulanan ke WhatsApp pemilik dan email akun.
- Laporan terjadwal opt-in, dapat dimatikan, dan anti-duplikat per periode.

**Sukses:** pemilik dapat membuat dan mencetak laporan periode apa pun tanpa menyusun ulang data, dan menerima laporan periode terakhir secara otomatis.

### F-PREM-07 AI Pro

- Review bulanan otomatis.
- Tanya jawab atas seluruh riwayat.
- Deteksi anomali dan kebocoran pengeluaran.
- Tetap opt-in dan dapat dicabut.

### F-PREM-08 Kolaborasi

- Anggota keluarga, peran, izin.
- Anggaran bersama.
- Persetujuan transaksi.
- Beberapa nomor WhatsApp per workspace.

### F-PREM-09 Keamanan dan paywall (masa depan)

- 2FA, manajemen sesi, ekspor terenkripsi.
- Billing, entitlement, trial, invoice, dunning hanya jika dipublikasikan.

## 5. Di luar lingkup saat ini

- Pembayaran berlangganan.
- Multi-tenant pelanggan luar.
- Akses langsung ke rekening bank.
- Pembukuan pajak formal.

## 6. Ukuran keberhasilan pribadi

- Tidak ada transaksi otomatis ganda.
- Impor CSV menghasilkan 0 duplikat.
- Peringatan muncul sebelum saldo/anggaran bermasalah.
- Waktu input transaksi rutin turun mendekati nol.
- Laporan periode kustom dapat dicetak dan laporan terjadwal tidak terkirim ganda.

## 7. Risiko

| Risiko | Mitigasi |
|---|---|
| Cron tidak berjalan | Status worker/health, retry, tanggal jatuh tempo idempoten |
| CSV kotor | Validasi per baris, laporan error, batas baris |
| Deteksi langganan salah | Heuristik konservatif, hanya tampilan, bukan mutasi |
| Saldo proyeksi menyesatkan | Label “proyeksi”, transparansi rumus |
| Perubahan skema | `db:setup` idempoten, snapshot sebelum migrasi berisiko |
