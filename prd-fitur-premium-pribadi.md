# PRD — Fitur Premium Pribadi Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Aktif; penggunaan pribadi, tanpa paywall |
| Versi | 1.5 |
| Tanggal | 11 November 2026 |
| Pemilik dokumen | Pemilik produk |
| Dokumen induk | [PRD utama](./prd-catatan-keuangan-whatsapp.md) |
| Dokumen teknis | [SRS fitur premium pribadi](./srs-fitur-premium-pribadi.md) |

> Semua fitur di dokumen ini terbuka untuk pemilik. Tidak ada billing, subscription, entitlement, atau pembatasan paket. Istilah “premium” berarti kualitas/kemampuan fitur kelas berbayar, bukan paywall. Mekanik pembayaran hanya dibahas sebagai rencana masa depan jika aplikasi dipublikasikan.

**Riwayat versi**

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 9 Nov 2026 | Dokumen awal; recurring, impor CSV, wawasan. |
| 1.1 | 10 Nov 2026 | Digest, multi-dompet, laporan lanjutan. |
| 1.2 | 10 Nov 2026 | AI Pro, kolaborasi, keamanan. |
| 1.3 | 10 Nov 2026 | Email, kalender, Google Sheets, meter pemakaian. |
| 1.4 | 11 Nov 2026 | Lengkapi alur, prioritas, NFR, privasi, operasi, roadmap, matriks fitur, paywall, dan traceability. |
| 1.5 | 11 Nov 2026 | Implementasi ubah transaksi dan filter pos/dompet. |

**Konvensi status**

- **Selesai:** tersedia dan dipakai pemilik.
- **Sebagian:** tersedia dengan batas atau hanya sebagian alur.
- **Belum:** belum ada implementasi.
- **Ditangguhkan:** kode/skema ada, tetapi akses sengaja dimatikan.
- **Di luar lingkup:** tidak dikerjakan pada tahap ini.

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

### Ringkasan

- **Fondasi inti sudah ada:** autentikasi per akun, transaksi, pos/kategori, dompet, ringkasan, pencarian, ekspor, piutang/utang, target tabungan, dan asisten AI.
- **Lapisan premium pribadi sudah ada:** wawasan, transaksi otomatis, impor CSV, digest WhatsApp, multi-dompet, laporan lanjutan, AI Pro, keamanan akun, email transaksi, kalender `.ics`, Google Sheets, dan meter pemakaian.
- **Kolaborasi keluarga ditangguhkan:** model, tabel, dan pengujian peran masih ada, tetapi API `/api/keluarga` sengaja mengembalikan `410` karena berbagi data lintas akun belum diizinkan. Dokumen ini tidak boleh lagi menyebut fitur tersebut “selesai” sampai keputusan dan threat model workspace disetujui.
- **Yang belum ada dan menjadi kandidat berikutnya:** tag, template input, lampiran struk tersimpan, multi-mata uang, audit log lengkap dengan UI, recovery 2FA, backup/restore satu klik, API/webhook publik, laporan laba rugi/arus kas formal, simulasi skenario, otomatisasi aturan, Telegram, dan white-label PDF.
- **Paywall/billing tetap di luar lingkup** selama aplikasi dipakai pribadi.

Matriks status per fitur ada di bagian 8. Detail teknis ada di [SRS](./srs-fitur-premium-pribadi.md).

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
- Tanya jawab atas seluruh riwayat dari web dan WhatsApp (`tanya <pertanyaan>`).
- Deteksi anomali dan kebocoran pengeluaran.
- Tetap opt-in dan dapat dicabut melalui `ai off`; maksimal 20 pertanyaan WhatsApp per jam per nomor untuk menjaga biaya.

### F-PREM-08 Kolaborasi

**Status: ditangguhkan.** Skema `workspace_members`, model peran, dan pengujian izin tersedia, tetapi API `/api/keluarga` mengembalikan `410` dan `pemilikRequest` selalu memakai data akun sendiri. Fitur baru boleh diaktifkan kembali hanya setelah isolasi workspace, audit akses, dan threat model disetujui.

- Anggota keluarga, peran, izin.
- Anggaran bersama.
- Persetujuan transaksi.
- Beberapa nomor WhatsApp per workspace.

### F-PREM-09 Keamanan dan paywall

- 2FA TOTP, manajemen sesi, ekspor terenkripsi.
- Billing, entitlement, trial, invoice, dunning hanya jika dipublikasikan.

### F-PREM-10 Integrasi

- Impor email bank/e-wallet: deteksi penyedia (BCA, Mandiri, BRI, BNI, BSI, CIMB, Permata, BTN, GoPay, OVO, DANA, ShopeePay, LinkAja, Jenius, Jago, SeaBank, Blu, Neo).
- Cocokkan dompet sumber dan pos otomatis bila unik; jika ambigu, pakai dompet bawaan dan tanpa pos.
- Kalender `.ics`: tagihan berulang, jatuh tempo utang/piutang, dan target tabungan 6 bulan ke depan.
- Kalender langganan: URL feed bertoken agar Google/Apple Calendar memperbarui otomatis tanpa unduh ulang manual.
- Google Sheets: hubungkan akun Google sekali; aplikasi membuat spreadsheet privat dan menyalin seluruh transaksi tanpa Apps Script.
- Google Sheets otomatis: setelah terhubung, cron menyinkron sekali sehari tanpa klik manual.
- Cadangan Apps Script tetap tersedia bila pengguna tidak ingin memberi akses Google Drive.

## 5. Di luar lingkup saat ini

- Pembayaran berlangganan.
- Multi-tenant pelanggan luar.
- Akses langsung ke rekening bank.
- Pembukuan pajak formal.

## 6. Ukuran keberhasilan pribadi

| Metrik | Baseline | Target | Cara ukur |
|---|---|---|---|
| Waktu mencatat transaksi rutin | Input manual >30 detik | <15 detik via WhatsApp, <30 detik via web | Uji 20 transaksi |
| Transaksi otomatis ganda | Belum terukur | 0 per aturan per bulan | Cek `recurring_runs` |
| Duplikat impor CSV | Belum terukur | 0 pada impor ulang | Uji impor 100 baris dua kali |
| Peringatan sebelum masalah | Reaktif | Anggaran ≥80%, proyeksi minus, tagihan ≤7 hari | Cek daftar peringatan |
| Laporan terjadwal ganda | Belum terukur | 0 per kunci periode | Cek `config.laporan_terakhir` |
| Waktu buka dashboard | Belum terukur | p95 <2 detik untuk 10.000 transaksi | Ukur lokal/produksi |
| Biaya AI bulanan | Belum dibatasi | Di bawah anggaran pribadi | Meter `/api/health` |
| Pemulihan data | Bergantung Neon | Ekspor terenkripsi <5 menit; restore teruji | Latihan restore |

**Definisi sukses P1:** semua metrik di atas terpenuhi selama satu bulan pemakaian nyata, tanpa transaksi ganda dan tanpa kehilangan data.

## 7. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Cron tidak berjalan | Tagihan, digest, laporan, Sheets tidak diproses | `/api/health` menampilkan `cronTerakhir` dan memperingatkan bila >26 jam; retry; jatuh tempo idempoten |
| CSV kotor | Transaksi salah atau impor gagal | Validasi per baris, laporan error, batas 1000 baris/2 MB |
| Deteksi langganan salah | Keputusan keliru | Heuristik konservatif, hanya tampilan, bukan mutasi |
| Saldo proyeksi menyesatkan | Rencana belanja salah | Label “proyeksi”, rumus transparan, tidak mengubah data |
| Perubahan skema | Data lama rusak | `db:setup` idempoten, snapshot Neon sebelum migrasi berisiko |
| Token Google dicabut/kedaluwarsa | Sinkron Sheets berhenti | Tampilkan status, minta hubungkan ulang, jangan hapus data lokal |
| Kuota Google/AI/WhatsApp habis | Fitur otomatis gagal | Backoff, batas laju, meter pemakaian, fallback tanpa AI |
| Webhook email dipalsukan | Transaksi palsu | `EMAIL_INBOUND_SECRET`, `EMAIL_ALLOWED_SENDERS`, idempoten `email:<id>` |
| Anggota workspace salah akses | Kebocoran data | Fitur keluarga tetap ditangguhkan sampai isolasi dan audit disetujui |
| 2FA perangkat hilang | Akun tidak bisa diakses | **Belum ada recovery code**; tambahkan sebelum mengaktifkan 2FA sebagai wajib |
| Ekspor tidak lengkap | Data tidak bisa dipindahkan | Ekspor saat ini hanya transaksi; tambahkan seluruh entitas pada P2 |
| Dokumen dan kode tidak sinkron | Keputusan salah | Status di dokumen harus mengikuti kode; review setiap rilis |

## 8. Lingkup, prioritas, dan matriks fitur

### 8.1 Definisi prioritas

| Prioritas | Arti | Aturan rilis |
|---|---|---|
| P0 | Fondasi yang wajib ada sebelum fitur lain | Tidak boleh dikunci paywall |
| P1 | Premium pribadi yang sudah dipakai pemilik | Selesai sebelum menambah P2 |
| P2 | Penguatan produk berikutnya | Diambil berurutan; harus punya acceptance criteria |
| P3 | Kandidat SaaS/paywall | Butuh keputusan bisnis dan threat model |
| N/A | Tidak relevan untuk pemakaian pribadi | Tidak dikerjakan |

### 8.2 Fitur inti

| Fitur | Status | Catatan |
|---|---|---|
| Catat transaksi: tambah | Selesai | Web dan WhatsApp; tanggal, nominal, pos, catatan, dompet |
| Catat transaksi: ubah | Selesai | Pemasukan/pengeluaran berlaku; tipe tidak bisa diubah; ledger di-rechain |
| Catat transaksi: hapus | Sebagian | Pembatalan (`batal`) untuk menjaga audit, bukan hapus permanen |
| Kategori/pos dan kategori sendiri | Selesai | Pos, grup, alias, aktif/nonaktif |
| Dompet/akun dengan saldo | Selesai | Tunai, bank, e-wallet; saldo dihitung dari transaksi |
| Ringkasan pemasukan/pengeluaran/saldo per periode | Selesai | Ringkasan, rekap, laporan |
| Filter dan pencarian | Selesai | Filter bulan, pos, dompet, dan kata kunci |
| Autentikasi dan data terpisah per pengguna | Selesai | Email/password, Google/Facebook, sesi per akun |

### 8.3 Analisis dan laporan

| Fitur | Status | Catatan |
|---|---|---|
| Dashboard tren bulanan | Selesai | Grafik 6 bulan dan tren 14 hari |
| Perbandingan pemasukan vs pengeluaran | Selesai | Grafik batang dan ringkasan |
| Pengeluaran terbesar per kategori | Sebagian | Perubahan kategori vs bulan lalu; ranking eksplisit belum |
| Laporan harian/mingguan/bulanan/tahunan | Sebagian | Periode kustom, preset bulan/3 bulan/tahun; preset harian belum |
| Ekspor PDF | Sebagian | Dialog cetak/simpan PDF browser, bukan generator PDF server |
| Ekspor Excel/CSV | Selesai | XLSX per bulan di web; CSV seluruh transaksi di server |
| Perbandingan antar periode | Sebagian | Perubahan kategori bulan ini vs bulan lalu; perbandingan penuh belum |

### 8.4 Perencanaan

| Fitur | Status | Catatan |
|---|---|---|
| Anggaran per kategori + peringatan | Selesai | Rencana per pos; peringatan rasio ≥80% |
| Target tabungan dengan progres | Selesai | Target, setoran bertahap, status tercapai |
| Transaksi berulang | Selesai | Gaji, cicilan, langganan; anti-duplikat per bulan |
| Pengingat tagihan/jatuh tempo | Sebagian | Peringatan dalam aplikasi, digest, dan kalender; push notification belum |
| Utang-piutang | Selesai | Pihak, nominal, pembayaran sebagian, lunas, batal |

### 8.5 Kemudahan

| Fitur | Status | Catatan |
|---|---|---|
| Transfer antar dompet | Selesai | Tidak dihitung sebagai pemasukan/pengeluaran |
| Lampiran bukti/struk | Sebagian | Foto struk diproses OCR via WhatsApp; file tidak disimpan sebagai lampiran transaksi |
| Tag transaksi | Belum | Belum ada skema/UI tag |
| Template input cepat | Belum | Perintah WhatsApp cepat, tetapi template yang bisa disimpan belum ada |
| Input via WhatsApp | Selesai | Perintah teks, foto struk, tanya jawab |
| Input via Telegram | Belum | Belum ada adapter Telegram |
| Impor mutasi CSV | Selesai | Hash anti-duplikat, validasi per baris |
| Multi-mata uang | Belum | Hanya IDR; tidak ada kurs atau akun multi-currency |
| Mode gelap dan responsif | Selesai | Tema terang/gelap, layout mobile, CSS cetak |

### 8.6 Fitur lanjutan

| Fitur | Status | Catatan |
|---|---|---|
| Prediksi pengeluaran | Selesai | Proyeksi pengeluaran/saldo akhir bulan |
| Deteksi pengeluaran tidak wajar | Selesai | Anomali bulanan/kategori dan transaksi besar |
| Pemindaian struk (OCR) | Selesai | Groq vision via WhatsApp; tanpa simpan lampiran |
| Ruang bersama keluarga/tim | Ditangguhkan | API `/api/keluarga` 410; model dan tabel ada |
| Audit log riwayat perubahan | Sebagian | `audit_events` mencatat aksi tertentu; UI dan cakupan transaksi belum lengkap |
| Backup dan restore | Sebagian | Backup Neon + ekspor terenkripsi; restore satu klik belum |

### 8.7 Kapasitas dan fitur premium lanjutan

| Fitur | Status | Catatan |
|---|---|---|
| Dompet/kategori/anggaran/target tanpa batas | Selesai | Pemakaian pribadi tidak diberi kuota; entitlement belum ada |
| Riwayat data lebih panjang | Selesai | Tidak ada retensi transaksi; audit 180 hari |
| Penyimpanan lampiran lebih besar | Belum | Belum ada penyimpanan lampiran |
| Transaksi berulang/pengingat tanpa batas | Selesai | Tidak ada batas jumlah aturan |
| Laporan laba rugi dan arus kas | Sebagian | Ringkasan pemasukan/pengeluaran/arus bersih; format laporan formal belum |
| Laporan kustom periode/kategori/dompet | Sebagian | Periode kustom ada; filter kategori/dompet belum |
| Perbandingan multi-tahun dan tren panjang | Belum | Grafik saat ini 6 bulan |
| Skor kesehatan, rasio tabungan, rasio utang | Sebagian | Skor dan rasio tabungan ada; rasio utang eksplisit belum |
| Insight otomatis | Selesai | Anomali, langganan, perubahan kategori |
| Prediksi saldo dan simulasi skenario | Sebagian | Prediksi ada; simulasi “hemat 10%” belum |
| Auto-kategorisasi berbasis aturan | Sebagian | Alias pos dan merchant email; aturan buatan pengguna belum |
| Impor mutasi otomatis | Sebagian | Email bank/e-wallet; koneksi API bank langsung belum |
| Laporan terjadwal email/WhatsApp | Selesai | Mingguan/bulanan, anti-duplikat |
| Kolaborasi dan hak akses | Ditangguhkan | Lihat F-PREM-08 |
| Alur persetujuan nominal tertentu | Ditangguhkan | Model `pending_actions` ada; API keluarga dimatikan |
| Akses akuntan hanya lihat | Belum | Butuh workspace/eksternal access yang aman |
| Sinkron Google Sheets | Selesai | OAuth `drive.file`, manual + harian |
| Ekspor ke software akuntansi | Belum | Belum ada format khusus |
| API dan webhook publik | Belum | Webhook internal email/Sheets ada; API key publik belum |
| PDF white-label | Belum | Cetak browser belum mendukung logo/identitas usaha |
| Backup otomatis terjadwal + restore satu klik | Sebagian | Backup Neon dan ekspor; orkestrasi restore belum |
| 2FA | Selesai | TOTP; recovery code belum |
| PIN/biometrik | Belum | Belum ada |
| Audit log lengkap | Sebagian | Lihat 8.6 |
| Ekspor seluruh data kapan saja | Sebagian | Ekspor terenkripsi saat ini hanya transaksi |
| Bebas iklan | Selesai | Tidak ada iklan |
| Tema/dashboard kustom | Sebagian | Tema terang/gelap; dashboard kustom belum |
| Dukungan prioritas | N/A | Pemakaian pribadi |

### 8.8 Roadmap P2 dan P3

| Prioritas | Item | Alasan | Kriteria selesai |
|---|---|---|---|
| P2 | Ubah transaksi + filter pos/dompet **(selesai)** | Koreksi data tanpa hapus; pencarian lebih cepat | Edit tercatat audit; filter bekerja di riwayat |
| P2 | Tag + template + lampiran struk | Input lebih cepat dan bukti tersimpan | Tag CRUD; template CRUD; lampiran terhubung transaksi |
| P2 | Recovery 2FA + audit UI + ekspor penuh | Keamanan dan kepercayaan | Recovery code sekali pakai; audit bisa dicari; ekspor semua entitas |
| P2 | Re-enable kolaborasi/approval | Nilai keluarga | Isolasi workspace, audit akses, dan AC-KEL lulus |
| P2 | Laporan laba rugi/arus kas + multi-tahun + simulasi | Analisis lebih dalam | Laporan formal, tren >1 tahun, simulasi tanpa mutasi |
| P2 | API/webhook publik + ekspor akuntansi | Integrasi | API key, scope, rate limit, dokumentasi, audit |
| P3 | Paywall/entitlement + kuota | Hanya jika dipublikasikan | Matriks paket, billing webhook idempoten, uji refund/dunning |
| P3 | PIN/biometrik, white-label PDF, akuntan eksternal | Kebutuhan SaaS | Threat model dan uji akses |

## 9. Alur utama

### 9.1 Catat transaksi

- **Aktor:** pemilik atau anggota berizin tulis.
- **Web:** pilih jenis, nominal, tanggal, pos/dompet, catatan, simpan.
- **WhatsApp:** kirim `out 25rb kopi` atau foto struk; AI mem-parse bila perlu.
- **Sukses:** transaksi muncul di ringkasan, saldo dompet berubah, audit tercatat.
- **Gagal:** nominal/tanggal tidak valid ditolak dengan pesan yang bisa diperbaiki; tidak ada mutasi.

### 9.2 Transaksi berulang dan cron

- **Aktor:** sistem.
- **Langkah:** cron memanggil `/api/cron/outbox`; worker memproses aturan aktif dengan jatuh tempo ≤ hari ini; reservasi `recurring_runs` mencegah duplikat; transaksi dibuat.
- **Sukses:** satu transaksi per aturan per bulan; tanggal 29–31 dipotong ke akhir bulan.
- **Gagal:** satu aturan gagal tidak menghentikan aturan lain; error dicatat; `cron_terakhir` diperbarui.

### 9.3 Impor CSV

- **Aktor:** pemilik/admin.
- **Langkah:** unggah/tempel CSV; validasi header; parse per baris; cocokkan pos/dompet; dedup hash; simpan.
- **Sukses:** baris valid masuk, duplikat dilewati, laporan jumlah berhasil/gagal.
- **Gagal:** header salah ditolak sebelum mutasi; baris invalid dilaporkan tanpa menggagalkan seluruh impor.

### 9.4 Laporan dan laporan terjadwal

- **Aktor:** pemilik.
- **Langkah:** pilih preset/rentang; server menyusun ringkasan; cetak/simpan PDF; opt-in laporan mingguan/bulanan.
- **Sukses:** angka dapat ditelusuri ke transaksi; laporan terjadwal masuk outbox/email sekali per periode.
- **Gagal:** rentang terbalik/masa depan ditolak; tanpa nomor/email tujuan, laporan dilewati dengan status jelas.

### 9.5 AI Pro

- **Aktor:** pemilik.
- **Langkah:** aktifkan AI; ajukan pertanyaan di web atau `tanya <pertanyaan>`; server menyusun konteks agregat; provider AI menjawab; hasil dikembalikan sebagai teks.
- **Sukses:** jawaban memakai seluruh riwayat, bukan hanya transaksi terbaru; tidak ada mutasi.
- **Gagal:** AI nonaktif, pertanyaan di luar 3–400 karakter, atau kuota habis ditolak sebelum panggilan provider; transaksi manual tetap bisa dicatat.

### 9.6 Google Sheets

- **Aktor:** pemilik.
- **Langkah:** hubungkan Google dengan scope `drive.file`; aplikasi membuat spreadsheet privat; refresh token dienkripsi; sinkron manual/harian menulis ulang sheet `Transaksi`.
- **Sukses:** spreadsheet mencerminkan seluruh transaksi; data lokal tidak berubah.
- **Gagal:** token dicabut/kuota habis → status error, minta hubungkan ulang; tidak menghapus file atau data lokal.

### 9.7 Kalender

- **Aktor:** pemilik atau aplikasi kalender.
- **Langkah:** unduh `.ics` atau salin URL bertoken; feed memuat tagihan, jatuh tempo utang/piutang, dan target 6 bulan.
- **Sukses:** event all-day sesuai RFC 5545; aplikasi kalender memperbarui sendiri.
- **Gagal:** token salah 401; token dapat diganti dengan menghapus `config.kalender_token`.

### 9.8 Kolaborasi keluarga (target, ditangguhkan)

- **Aktor:** pemilik, admin, member, viewer.
- **Langkah target:** pemilik menambah anggota; member mengajukan transaksi; admin menyetujui; transaksi masuk ke data pemilik; viewer hanya membaca.
- **Status:** API dimatikan; alur ini belum boleh dipakai sampai isolasi workspace dan audit akses disetujui.
- **Gagal:** pengajuan kedaluwarsa 7 hari; persetujuan ganda dicegah atomik.

### 9.9 Login 2FA dan pemulihan

- **Aktor:** pemilik.
- **Langkah:** login password; bila 2FA aktif, masukkan kode TOTP 6 digit; sesi dibuat.
- **Sukses:** sesi valid 30 hari; sesi lain bisa dicabut.
- **Gagal:** kode salah ditolak; perangkat hilang **belum ada recovery code** — ini gap yang harus ditutup pada P2.

### 9.10 Ekspor dan pemulihan

- **Aktor:** pemilik.
- **Langkah:** minta ekspor CSV/terenkripsi; unduh; simpan di tempat aman; restore memakai backup Neon.
- **Sukses:** ekspor terenkripsi hanya bisa dibuka dengan password yang sama.
- **Gagal:** password <8 karakter ditolak; restore satu klik belum tersedia.

## 10. Non-functional requirements

| Area | Target | Catatan |
|---|---|---|
| Performa dashboard | p95 <2 detik untuk 10.000 transaksi | Ukur di produksi; hindari query tanpa indeks |
| Laporan 3 tahun | <5 detik | Batas rentang maksimal 3 tahun |
| Impor CSV 1000 baris | <60 detik | Batas 2 MB; validasi per baris |
| Cron | Selesai <30 detik per fungsi | `maxDuration` Vercel 30 detik; pekerjaan berat dipecah |
| Ketersediaan | 99% bulanan untuk dashboard | Pemakaian pribadi; downtime cron tidak boleh menggandakan data |
| Integritas | 0 duplikat transaksi otomatis/impor | Unique constraint, hash, `recurring_runs` |
| Keamanan | OWASP dasar, TLS, cookie HttpOnly/SameSite | Tidak ada secret/PII di log |
| Privasi | AI opt-in, data minimal, tanpa iklan | Provider AI wajib Zero Data Retention |
| Aksesibilitas | WCAG 2.1 AA untuk alur utama | Kontras, keyboard, label form, fokus |
| Kompatibilitas | Chrome/Edge/Firefox/Safari modern, mobile 360px | CSS cetak untuk laporan |
| Batas AI | 20 pertanyaan WhatsApp/jam/nomor; 10 permintaan web/menit/IP | Tolak dengan pesan jelas |
| Biaya | AI/WhatsApp/Google/email di bawah anggaran bulanan | Meter pemakaian + peringatan |
| Retensi | Transaksi tanpa batas; audit 180 hari; outbox 30 hari | Kebijakan dapat berubah dengan persetujuan pemilik |

## 11. Keamanan, privasi, dan kepercayaan

### 11.1 Klasifikasi data

| Data | Sensitivitas | Perlakuan |
|---|---|---|
| Password, hash sesi, secret TOTP | Kritis | Hash/enkripsi; tidak pernah dikirim ke client/log |
| Transaksi, saldo, utang, target | Tinggi | Isolasi per `user_id`; ekspor hanya oleh pemilik |
| Nomor WhatsApp, email | Tinggi | Masking di log; pemetaan hanya untuk pemilik |
| Refresh token Google | Kritis | AES-256-GCM; kunci dari env; tidak pernah ke client/log |
| Isi email bank/e-wallet | Tinggi | Hanya diproses untuk transaksi; tidak disimpan mentah |
| Prompt/jawaban AI | Tinggi | Kirim agregat; opt-in; tanpa PII berlebihan |
| Audit event | Sedang | Aktor disamarkan; detail dibatasi whitelist |
| Lampiran struk | Tinggi | **Belum disimpan**; bila ditambahkan, wajib enkripsi dan retensi |

### 11.2 Kontrol wajib

- Semua API premium memakai sesi; `user_id` dari sesi, bukan body.
- Peran ditolak di server (`tolakPeran`), bukan hanya disembunyikan di UI.
- 2FA TOTP; mematikan 2FA wajib password; sesi lain bisa dicabut.
- Ekspor terenkripsi AES-256-GCM + scrypt; password tidak disimpan.
- Webhook email wajib secret dan allowlist pengirim; idempoten per `email:<id>`.
- Google OAuth memakai `drive.file`; token dienkripsi; URL webhook Apps Script dibatasi `script.google.com`.
- Token feed kalender 32 byte acak, hanya baca `.ics`, dapat diganti.
- Rate limit AI web dan WhatsApp; batas ukuran body/CSV.
- Audit untuk aksi sensitif: login, 2FA, sesi, ekspor, dompet, transaksi, recurring, impor, laporan, Sheets, kalender, keluarga.
- **Gap:** audit belum mencakup semua aksi premium; belum ada recovery code 2FA; belum ada PIN/biometrik.

### 11.3 Persetujuan dan transparansi

- AI hanya aktif setelah pemilik opt-in; `ai off` mencabut izin.
- Pengiriman ke provider AI dijelaskan di UI/README dan hanya memakai konteks agregat.
- Pengguna dapat mengekspor data dan meminta penghapusan akun.
- Tidak ada iklan, profiling pihak ketiga, atau penjualan data.
- Fitur keluarga tidak diaktifkan sampai ada persetujuan anggota, audit akses, dan mekanisme pencabutan yang jelas.

### 11.4 Retensi dan penghapusan

| Data | Retensi | Penghapusan |
|---|---|---|
| Transaksi | Tanpa batas selama akun aktif | Ikut hapus akun; pembatalan menyimpan jejak audit |
| Audit event | 180 hari | Otomatis oleh cron |
| Outbox terkirim/gagal | 30 hari | Otomatis oleh cron |
| `pending_actions` | 7 hari | Kedaluwarsa |
| Inbound/email mentah | Tidak disimpan sebagai arsip | Hanya diproses |
| Backup Neon | Mengikuti paket Neon | Restore oleh pemilik |
| Ekspor terenkripsi | Diunduh pemilik | Tidak disimpan di server |

## 12. Operasi dan dukungan

### 12.1 Cron

`POST /api/cron/outbox` dengan `Authorization: Bearer <CRON_SECRET>` menjalankan berurutan:

1. Antrean inbound WhatsApp.
2. Transaksi berulang.
3. Digest WhatsApp.
4. Laporan terjadwal.
5. Review AI bulanan.
6. Sinkron Google Sheets.
7. Antrean outbox.
8. Catat `cron_terakhir`.

Jadwalkan berkala; `/api/health` memperingatkan bila cron belum pernah jalan atau terakhir >26 jam.

### 12.2 Environment utama

- Database: `DATABASE_URL`.
- WhatsApp: `WA_TOKEN`, `WA_PHONE_ID`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `ALLOWED_NUMBERS`.
- AI: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `GROQ_MODEL_CADANGAN`.
- Keamanan: `CRON_SECRET`, `HEALTH_TOKEN`, `LEDGER_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- Email: `EMAIL_INBOUND_SECRET`, `EMAIL_ALLOWED_SENDERS`, `RESEND_API_KEY`, `EMAIL_FROM`.
- Integrasi: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_BASE_URL`, `SHEETS_WEBHOOK_SECRET`.

### 12.3 Runbook

- **Cron basi:** cek scheduler, `CRON_SECRET`, log `/api/cron/outbox`, lalu jalankan manual.
- **AI 429:** tunggu, cek kuota Groq, pastikan fallback non-AI tetap mencatat transaksi.
- **Sheets gagal:** cek koneksi Google, scope, kuota, dan `GOOGLE_TOKEN_ENCRYPTION_KEY`; minta hubungkan ulang bila token dicabut.
- **WhatsApp gagal:** cek token Meta, nomor, dan status outbox; job tetap tersimpan untuk retry.
- **Data rusak:** hentikan cron, snapshot Neon, pulihkan, lalu verifikasi hash transaksi.
- **Kebocoran secret:** rotasi secret terkait, cabut sesi, audit akses, dan beri tahu pemilik.

### 12.4 Backup dan restore

- Backup utama: Neon (sesuai paket).
- Backup tambahan: ekspor CSV/terenkripsi berkala.
- Sebelum migrasi berisiko: snapshot Neon.
- Uji restore minimal sekali sebelum menambah fitur destruktif.
- Restore satu klik dan backup terjadwal belum diimplementasikan; ini P2.

## 13. Asumsi, ketergantungan, dan keputusan terbuka

### 13.1 Asumsi

- Pemilik memakai satu akun utama; data pribadi tidak dibagikan lintas akun.
- Mata uang utama IDR; multi-mata uang bukan kebutuhan P1.
- Pemilik bersedia memberi akses Google `drive.file` bila memakai Sheets.
- Provider AI dapat diaktifkan/dimatikan kapan saja; tanpa AI, pencatatan manual tetap berfungsi.
- Cron dijalankan oleh scheduler eksternal; aplikasi tidak mengasumsikan cron selalu hidup.
- Pemakaian pribadi tidak memerlukan SLA komersial, invoice, atau dukungan 24/7.

### 13.2 Ketergantungan

| Pihak | Dipakai untuk | Dampak bila gagal |
|---|---|---|
| Neon Postgres | Seluruh data | Aplikasi read-only/gagal; backup penting |
| Meta WhatsApp Cloud API | Input, digest, notifikasi | Input via WhatsApp berhenti; web tetap jalan |
| Groq | Parse bahasa bebas, vision, insight | Fallback non-AI/manual |
| Google OAuth/Sheets/Calendar | Sheets dan feed kalender | Integrasi berhenti; data lokal aman |
| Resend/email | Reset password, laporan | Reset via WhatsApp bila tersedia |
| Scheduler cron | Otomasi | Fitur terjadwal tertunda; health memberi peringatan |

### 13.3 Keputusan terbuka

1. Apakah kolaborasi keluarga diaktifkan kembali? Jika ya, bagaimana isolasi workspace, persetujuan anggota, dan audit akses?
2. Apakah 2FA diwajibkan? Jika ya, recovery code harus ada sebelum diwajibkan.
3. Berapa target RPO/RTO backup dan seberapa sering uji restore?
4. Apakah lampiran struk disimpan? Jika ya, enkripsi, ukuran maksimum, dan retensi?
5. Apakah multi-mata uang dibutuhkan? Jika ya, sumber kurs dan pembulatan?
6. Apakah API/webhook publik dibuka? Jika ya, skema API key, scope, rate limit, dan audit?
7. Apakah paywall dibuat? Jika ya, fitur mana yang gratis vs premium?
8. Format ekspor akuntansi mana yang didukung lebih dulu?

## 14. Kriteria kesiapan

### 14.1 P1 — premium pribadi

- Semua fitur P1 lulus acceptance criteria di SRS.
- Tidak ada duplikat transaksi otomatis, impor, digest, laporan, atau Sheets pada uji ulang.
- Ekspor terenkripsi berhasil dibuka dengan password yang sama.
- `/api/health` menunjukkan cron terakhir <26 jam dan meter pemakaian.
- Tidak ada secret/PII di log; audit aksi sensitif tersedia.
- Backup Neon dan ekspor terenkripsi diuji minimal sekali.

### 14.2 P2 — penguatan

- Ubah transaksi, filter pos/dompet, tag, template, dan lampiran lulus uji.
- Recovery 2FA tersedia dan diuji; audit UI dapat mencari aksi sensitif.
- Ekspor seluruh entitas (bukan hanya transaksi) tersedia.
- Laporan laba rugi/arus kas, multi-tahun, dan simulasi tidak mengubah data.
- Kolaborasi hanya diaktifkan setelah threat model dan AC-KEL lulus.
- API/webhook publik punya autentikasi, scope, rate limit, dan audit.

### 14.3 P3 — paywall/SaaS

- Matriks entitlement, kuota, dan gating disetujui.
- Billing webhook idempoten, tahan replay, dan dapat direkonsiliasi.
- Uji trial, prorata, invoice, dunning, refund, dan pembatalan.
- Kebijakan privasi, retensi, penghapusan, pajak, dan dukungan tersedia.
- Tidak ada fitur inti yang dikunci sampai pengguna tidak bisa mencatat dengan nyaman.

## 15. Pengalaman pengguna

### 15.1 Inventaris layar

| Layar | Isi utama | Status |
|---|---|---|
| Ringkasan | Saldo, sisa aman, aksi cepat, transaksi terakhir | Selesai |
| Rekap | Total masuk/keluar, grafik 6 bulan, tren 14 hari, perubahan kategori | Selesai |
| Transaksi | Form catat dan riwayat + filter/cari + ekspor XLSX | Selesai; filter pos/dompet belum |
| Wawasan | Skor, proyeksi, langganan, peringatan, anomali | Selesai |
| Rencana | Anggaran per pos, dana darurat, tabungan, investasi | Selesai |
| Pos | Kategori/pos, alias, aktif/nonaktif | Selesai |
| Dompet | Saldo, transfer, net worth | Selesai |
| Laporan | Periode, ringkasan, cetak PDF, laporan terjadwal, Sheets | Selesai |
| Impor | Tempel/unggah CSV, hasil validasi | Selesai |
| Otomatis | Aturan recurring, kalender `.ics` | Selesai |
| Piutang | Utang/piutang, pembayaran, status | Selesai |
| Target | Target tabungan dan progres | Selesai |
| Asisten | Tanya jawab AI | Selesai |
| Profil | Profil, password, 2FA, sesi, tema, ekspor, hapus akun | Selesai |
| Keluarga | Anggota, peran, approval | Ditangguhkan |
| Akuntan | Akses hanya lihat | Belum |

### 15.2 State wajib

- **Empty:** belum ada transaksi/dompet/target; beri aksi awal.
- **Loading:** skeleton/teks memuat; jangan tampilkan angka palsu.
- **Error:** pesan spesifik, tombol coba lagi, data lama tidak hilang.
- **Disabled:** jelaskan alasan (mis. AI nonaktif, viewer, fitur ditangguhkan).
- **Print:** navigasi disembunyikan; angka dan tabel tetap terbaca.
- **Mobile:** target sentuh ≥44px; tidak ada horizontal scroll.

### 15.3 Konten WhatsApp

- Perintah utama: `bantuan`, `out`, `in`, `gaji`, `bonus`, `tarik`, `pindah`, `saldo`, `aman`, `sisa jajan`, `laporan`, `evaluasi`, `hapus terakhir`, `ekspor`.
- Utang/piutang: `piutang`, `utang`, `bayar piutang`, `lunasi piutang`.
- Target: `target`, `nabung`.
- AI: `tanya <pertanyaan>`, `ai on`, `ai off`.
- Setiap perintah gagal harus memberi contoh format yang benar, bukan diam.

## 16. Paywall dan billing (masa depan)

Paywall hanya dibuat jika aplikasi dipublikasikan. Prinsip: fitur inti tetap nyaman di paket gratis; premium menambah kemudahan, kedalaman analisis, kapasitas, dan kolaborasi.

### 16.1 Kandidat gating

| Kapabilitas | Gratis | Premium |
|---|---|---|
| Dompet/kategori/anggaran/target | Batas wajar (mis. 3 dompet) | Tanpa batas |
| Riwayat data | 6 bulan | Selamanya |
| Lampiran struk | Kecil | Lebih besar |
| Transaksi berulang/pengingat | Terbatas | Tanpa batas |
| Laporan laba rugi/arus kas | Ringkasan dasar | Laporan formal + ekspor |
| Laporan kustom/multi-tahun/simulasi | Tidak | Ya |
| OCR/auto-kategorisasi/otomatisasi | Terbatas | Penuh |
| Kolaborasi/approval/akuntan | Tidak | Ya |
| Google Sheets/API/white-label | Tidak | Ya |
| 2FA/recovery/audit lengkap | 2FA dasar | Recovery + audit penuh |
| Dukungan | Standar | Prioritas |

### 16.2 Kebutuhan billing

- Paket, harga, kuota, dan entitlement tersimpan di server.
- Webhook pembayaran terverifikasi, idempoten, tahan replay, dan dapat direkonsiliasi.
- Uji trial, prorata, invoice, dunning, refund, pembatalan, dan perubahan paket.
- Kebijakan privasi, retensi, penghapusan, pajak, dan akses setelah berhenti.
- Jangan mengunci fitur inti sampai pencatatan dasar tidak nyaman.

## 17. Traceability

| PRD | SRS | Acceptance |
|---|---|---|
| F-PREM-01 | FR-WS | AC-WS |
| F-PREM-02 | FR-REC | AC-REC |
| F-PREM-03 | FR-CSV | AC-CSV |
| F-PREM-04 | FR-DIG | AC-DIG |
| F-PREM-05 | FR-DOM | AC-DOM |
| F-PREM-06 | FR-LAP | AC-LAP |
| F-PREM-07 | FR-AI | AC-AI |
| F-PREM-08 | FR-KEL (ditangguhkan) | AC-KEL |
| F-PREM-09 | FR-SEC | AC-SEC |
| F-PREM-10 | FR-EML, FR-INT | AC-EML, AC-INT |
| Roadmap 8.8 | FR-CAP, FR-ANL, FR-AUTO, FR-COL, FR-INT2, FR-SEC2, FR-UX | AC-P2 |

## 18. Glosarium

- **Pemilik:** akun utama yang memiliki seluruh data.
- **Pos:** kategori/sub-kategori pengeluaran atau pemasukan.
- **Dompet:** akun kas, bank, atau e-wallet dengan saldo sendiri.
- **Wadah:** saldo, tabungan, atau investasi.
- **Periode:** rentang gaji/bulan berjalan yang dipakai untuk anggaran.
- **Recurring:** aturan transaksi otomatis bulanan.
- **Digest:** ringkasan/peringatan WhatsApp terjadwal.
- **Outbox:** antrean pesan keluar yang dikirim cron.
- **Entitlement:** hak akses fitur berdasarkan paket (belum dipakai).
- **RPO/RTO:** toleransi kehilangan data dan waktu pemulihan.
- **P1/P2/P3:** prioritas rilis, bukan tingkat keparahan bug.
