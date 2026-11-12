# SRS — Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Spesifikasi bertahap; Rilis 0 untuk implementasi sekarang |
| Versi | 1.1 |
| Tanggal | 9 November 2026 |
| Terkait PRD | [PRD](./prd-catatan-keuangan-whatsapp.md) |
| Platform | Next.js, TypeScript, PostgreSQL/Neon; aplikasi pribadi |

> SRS ini membedakan kondisi implementasi, kebutuhan penggunaan pribadi (Rilis 0), dan gerbang masa depan untuk beta/produk berbayar. Persyaratan Rilis 1/2 bukan izin membuka aplikasi ke pengguna luar.

## 1. Tujuan dan konvensi

Dokumen ini menentukan perilaku sistem yang dapat diuji untuk penggunaan pemilik tunggal dan persiapan migrasi yang terukur. Tidak menetapkan multi-tenant atau billing sebagai kebutuhan sekarang.

- **MUST R0** = wajib untuk penggunaan pribadi yang aman.
- **MUST R1/R2** = wajib hanya sebelum gerbang tahap tersebut dibuka.
- **SHOULD** = sasaran yang dapat ditunda dengan alasan.
- Nominal merupakan integer rupiah; pecahan ditolak.
- Tanggal bisnis menggunakan zona waktu `Asia/Jakarta` kecuali konfigurasi menyatakan lain.
- ID requirement stabil untuk traceability.

## 2. Sistem dan batas tahap

### 2.1 Kondisi implementasi

Aplikasi memakai Next.js API routes dan modul di `src/modules/*`, aturan bersama di `src/lib`, PostgreSQL melalui `pg`, sesi autentikasi individual, login email/password dan OAuth opsional, dashboard keuangan, ekspor, serta integrasi WhatsApp Cloud API. Skema dan beberapa alur integrasi masih memiliki asumsi satu pemilik. Tabel operasional tertentu bersifat global; implementasi belum boleh dipakai beberapa pelanggan.

Webhook WhatsApp memverifikasi signature dan membatasi ukuran request; pesan masuk diproses melalui antrean idempoten, balasan memakai outbox/retry, dan cron dapat menjalankan worker. Kondisi dan batas aktual harus diverifikasi melalui tes/operasi, bukan disimpulkan dari rancangan.

### 2.2 Rilis 0 — penggunaan pribadi

Mencakup akun pemilik, transaksi/anggaran, WhatsApp milik pemilik, pengamanan route, backup/pemulihan, migrasi aman, dan pemantauan kegagalan. Registrasi hanya untuk bootstrap akun pertama; setelah itu pembuatan akun baru ditolak. Tidak ada entitlement berbayar, subscription, tenant/workspace bersama, atau pembayaran.

### 2.3 Rilis 1 — beta eksternal (gerbang masa depan)

Hanya setelah persetujuan product owner dan lulus audit isolasi serta keamanan: registrasi/onboarding pelanggan, tenant terisolasi, integrasi WhatsApp per pelanggan, privasi/dukungan/penghapusan yang siap. Semua data, operasi, job, cache, ekspor, dan webhook harus mempunyai pemilik/tenant tepercaya. Tidak aktif pada Rilis 0.

### 2.4 Rilis 2 — berbayar (gerbang masa depan)

Hanya setelah pilot, ekonomi unit, paket/harga, provider, syarat bisnis, dan tinjauan yang relevan diputuskan: checkout, subscription, webhook pembayaran, entitlement, invoice/nota, masa tenggang, pembatalan/refund, rekonsiliasi, dan pembatasan fitur tanpa penghapusan data. Tidak aktif pada Rilis 0.

## 3. Arsitektur dan batas kepercayaan

- **SRS-ARCH-01 MUST R0:** domain keuangan mempertahankan integer rupiah dan tidak bergantung pada provider pembayaran.
- **SRS-ARCH-02 MUST R0:** route web memvalidasi sesi server-side sebelum akses data pemilik; identitas pemilik berasal dari sesi, bukan ID pengguna bebas dari klien.
- **SRS-ARCH-03 MUST R0:** webhook hanya menerima payload setelah validasi signature dan ukuran; nomor pengirim harus cocok dengan whitelist yang dikonfigurasi.
- **SRS-ARCH-04 MUST R0:** secret hanya berasal dari environment/secret store; tidak ditulis ke repository, respons, URL, atau log.
- **SRS-ARCH-05 MUST R0:** perubahan skema dicatat dan dapat diulang dengan aman; migrasi destruktif memerlukan snapshot, verifikasi, dan rencana rollback/forward-fix.
- **SRS-ARCH-06 MUST R1:** setiap record bisnis/operasional yang terkait pelanggan mempunyai pemilik/tenant dan akses repository memerlukan konteks otorisasi tepercaya.
- **SRS-ARCH-07 MUST R2:** billing provider berada di boundary integrasi; database tidak menyimpan PAN/CVV atau rahasia pembayaran.

Tidak perlu membangun abstraksi provider, service, queue, tenant, atau billing yang belum punya implementasi kedua/kebutuhan aktif.

## 4. Aktor dan akses

| Aktor | Rilis | Hak |
|---|---|---|
| Pemilik | R0 | Mengelola akun, data keuangan, integrasi, ekspor, dan sesi miliknya |
| Worker/cron | R0 | Memproses job internal tervalidasi; endpoint operasi dilindungi secret |
| Provider WhatsApp | R0 | Mengakses webhook hanya dengan verifikasi challenge/signature sesuai metode |
| Pelanggan | R1 | Mengakses tenant miliknya setelah autentikasi dan otorisasi |
| Support/admin | R1 | Metadata minimum; akses sensitif terpisah, beralasan, dan diaudit |
| Provider pembayaran | R2 | Mengirim event bertanda tangan; tidak menentukan entitlement dari payload tak terverifikasi |

## 5. Persyaratan fungsional

### 5.1 Identitas dan sesi

- **FR-AUTH-01 MUST R0:** bootstrap hanya membuat akun pertama; bila akun sudah ada, registrasi publik maupun OAuth tidak boleh membuat akun kedua atau memindahkan record pemilik.
- **FR-AUTH-02 MUST R0:** login, logout, reset password bertoken sekali pakai/berumur pendek, dan pencabutan semua sesi berfungsi server-side.
- **FR-AUTH-03 MUST R0:** token sesi acak tidak disimpan mentah di database; sesi kedaluwarsa dan cookie memakai `HttpOnly`, `SameSite` sesuai kebutuhan, `Secure` di production.
- **FR-AUTH-04 MUST R0:** endpoint login/registrasi/reset memiliki rate limit dan pesan kegagalan tidak membocorkan rahasia.
- **FR-AUTH-05 MUST R0:** route privat mengembalikan 401 tanpa sesi sah; logout/reset seluruh sesi membuat cookie lama tidak dapat dipakai.
- **FR-AUTH-06 MUST R1:** setiap akun terikat ke tenant/membership; verifikasi email dan persetujuan versi syarat/privasi selesai sebelum layanan eksternal dibuka.

### 5.2 Keuangan

- **FR-FIN-01 MUST R0:** fitur yang ada untuk pemasukan, pengeluaran, gaji/bonus, pos, rencana anggaran, saldo/wadah, laporan, koreksi, piutang/utang, target tabungan, dan ekspor tidak mengalami regresi.
- **FR-FIN-02 MUST R0:** validasi menolak nominal pecahan, overflow, tanggal tidak sah, dan input yang tidak sesuai aturan domain; pesan kesalahan dapat dipahami.
- **FR-FIN-03 MUST R0:** transaksi dan perubahan terkait bersifat atomik; kegagalan tidak meninggalkan perubahan parsial.
- **FR-FIN-04 MUST R0:** operasi mutasi memakai identitas pemilik dari sesi/konteks internal tervalidasi, bukan `userId` arbitrer dari request.
- **FR-FIN-05 MUST R0:** ekspor hanya berisi data pemilik, memakai token sekali pakai/berumur pendek atau autentikasi yang sesuai, dan tidak mengungkap data finansial pada URL/log.
- **FR-FIN-06 MUST R1:** koreksi, pembatalan, laporan, dan ekspor tenant dibatasi penuh pada tenant peminta.

### 5.3 WhatsApp, antrean, dan balasan

- **FR-WA-01 MUST R0:** webhook membatasi ukuran body dan memverifikasi signature terhadap body mentah sebelum memproses pesan.
- **FR-WA-02 MUST R0:** pesan pengirim yang tidak diizinkan tidak dapat membaca atau mengubah data; webhook duplikat tidak membuat transaksi ganda.
- **FR-WA-03 MUST R0:** event inbound dicatat idempoten sebelum pemrosesan; kegagalan pemrosesan dapat ditemukan/dicoba ulang tanpa mutasi duplikat.
- **FR-WA-04 MUST R0:** transaksi yang berhasil disimpan tetap ada jika pengiriman balasan gagal; status outbox/retry tidak boleh dilaporkan seolah terkirim.
- **FR-WA-05 MUST R0:** retry memakai backoff dan batas percobaan; status gagal terminal bisa diidentifikasi lewat log/status operasional dan ditangani ulang dengan aman.
- **FR-WA-06 MUST R0:** log webhook/worker tidak berisi token, isi finansial mentah, atau nomor penuh yang tidak diperlukan.
- **FR-WA-07 MUST R1:** nomor bot dan pengirim dipetakan ke integrasi dan tenant yang diverifikasi, bukan whitelist global.

### 5.4 AI dan privasi

- **FR-AI-01 MUST R0:** parser deterministik tetap tersedia; input tidak valid/ambigu tidak menghasilkan mutasi keuangan tanpa jalur konfirmasi yang sudah didukung dan diuji.
- **FR-AI-02 MUST R0:** AI tidak mengubah nominal yang tidak didukung teks sumber; kegagalan provider tidak menghapus/ menggandakan transaksi.
- **FR-DATA-01 MUST R0:** ekspor data pengguna tetap tersedia dan tidak bocor ke akun lain.
- **FR-DATA-02 MUST R1:** consent AI, retensi per kelas data, penutupan akun, pencabutan integrasi, dan penghapusan sesuai kebijakan yang sudah ditinjau.

### 5.5 Paket dan billing (R2 saja)

- **FR-BILL-01 MUST R2:** entitlement ditentukan server-side dari subscription/payment state yang telah diverifikasi; UI bukan kontrol akses.
- **FR-BILL-02 MUST R2:** payment webhook memvalidasi signature, timestamp/replay sesuai provider, dan idempotency key; event duplikat/tidak berurutan tidak merusak status.
- **FR-BILL-03 MUST R2:** status subscription mencakup trial/aktif, gagal bayar, masa tenggang, ditangguhkan, dibatalkan, kedaluwarsa, dan refund sesuai model bisnis terpilih.
- **FR-BILL-04 MUST R2:** pembatasan paket tidak menghapus data; akses baca/ekspor setelah berhenti mengikuti kebijakan yang diumumkan.
- **FR-BILL-05 MUST R2:** rekonsiliasi internal/provider dapat menemukan perbedaan; tindakan admin atas status billing diaudit.
- **FR-BILL-06 MUST R2:** tidak menyimpan data kartu; invoice/nota/pajak mengikuti keputusan bisnis dan tinjauan yang sesuai.

## 6. Data dan migrasi

- **FR-DB-01 MUST R0:** skema yang ada tetap idempoten untuk setup; semua perubahan baru mendapat versi/rekaman migrasi sebelum diterapkan ke data produksi.
- **FR-DB-02 MUST R0:** sebelum migrasi berisiko tersedia snapshot/backup dan pemeriksaan pascamigrasi.
- **FR-DB-03 MUST R0:** migrasi data lama merekonsiliasi jumlah record, relasi, status, tanggal, dan nilai saldo/ringkasan yang diketahui.
- **FR-DB-04 MUST R0:** rollback/forward-fix dibuktikan pada staging untuk migrasi yang dapat memengaruhi data.
- **FR-DB-05 MUST R1:** proses backfill tenant legacy dilakukan pada clone/staging, memeriksa seluruh tabel bisnis, cache/job/outbox/audit/export dan tidak mengaktifkan signup sebelum tes isolasi lulus.
- **FR-DB-06 MUST R2:** subscription, invoice, payment event, dan entitlement memiliki unique key/provider reference yang menjaga idempotensi dan riwayat audit.

## 7. Antarmuka API dan keamanan

| Operasi | Rilis | Autentikasi/otorisasi minimum |
|---|---|---|
| Login/reset | R0 | Publik dengan rate limit; token reset sekali pakai |
| Register | R0 | Bootstrap akun pertama saja; setelah ada akun ditolak |
| Dashboard/keuangan/pengaturan | R0 | Sesi pemilik sah; ID dari klien tidak mengganti owner |
| Ekspor | R0 | Pemilik sah atau token ekspor pendek/sekali pakai |
| Webhook WhatsApp | R0 | Challenge/signature provider dan validasi payload |
| Cron/outbox/email internal | R0 | Secret header server-side; tidak menerima secret di query string |
| Health | R0 | Publik hanya status generik; detail memakai token dan tidak membocorkan secret |
| Operasi tenant/admin | R1 | Akun terpisah, least privilege, audit |
| Billing webhook/portal | R2 | Signature provider dan autentikasi pelanggan; entitlement server-side |

- **NFR-SEC-01 MUST R0:** HTTPS pada production dan cookie sesi aman.
- **NFR-SEC-02 MUST R0:** validasi input pada trust boundary; SQL memakai parameter, bukan interpolasi input.
- **NFR-SEC-03 MUST R0:** secrets dan PII finansial tidak dicatat atau dikirim pada analytics tanpa kebutuhan/izin yang ditinjau.
- **NFR-SEC-04 MUST R0:** error internal tersanitasi; health/log tidak memaparkan URL DB, token, body pesan, atau stack trace publik.
- **NFR-SEC-05 MUST R1:** uji isolasi untuk seluruh endpoint, query, UI, ekspor, job, webhook, cache, dan akses admin sebelum pelanggan luar.
- **NFR-SEC-06 MUST R2:** billing webhooks tahan replay dan payment details ditangani provider.

## 8. Reliabilitas, pemulihan, dan observabilitas

- **NFR-REL-01 MUST R0:** duplicate webhook/job tidak membuat transaksi ganda.
- **NFR-REL-02 MUST R0:** kegagalan balasan tercatat dengan status/percobaan; job terminal tidak hilang diam-diam.
- **NFR-REL-03 MUST R0:** setiap perubahan data penting dapat di-backup dan dipulihkan dari snapshot sesuai fasilitas database aktif.
- **NFR-BCP-01 MUST R0:** owner, lokasi, jadwal, retensi, akses, dan biaya backup database/configuration penting didokumentasikan; jangan menyimpan dump finansial pada lokasi publik atau repository.
- **NFR-BCP-02 MUST R0:** restore diuji ke database terpisah; rekonsiliasi jumlah transaksi, rencana, relasi, dan saldo/ringkasan dikenal dicatat sebelum migrasi berisiko.
- **NFR-BCP-03 MUST R0:** backup dianggap valid hanya setelah bukti pemulihan; retensi dan akses backup ditinjau berkala.
- **NFR-BCP-04 MUST R0:** migrasi produksi memiliki snapshot yang sesuai, pemeriksaan pascamigrasi, dan rencana rollback/forward-fix.
- **NFR-OBS-01 MUST R0:** status DB, webhook, inbound/outbox, retry, kegagalan terminal, dan cron dapat didiagnosis tanpa log sensitif.
- **NFR-OBS-02 MUST R1:** alert operasional dan metrik layanan digunakan sebelum pilot eksternal.
- **NFR-OBS-03 MUST R2:** status biaya provider pesan/AI/pembayaran dan kegagalan billing dapat ditelusuri secara agregat per tenant.

## 9. Alur kritis

### 9.1 Bootstrap dan login

1. Pengguna membuat akun awal melalui registrasi atau OAuth yang dikonfigurasi.
2. Operasi pembuatan akun diserialisasi; hanya jika jumlah akun nol, akun pertama boleh dibuat.
3. Akun pertama mewarisi data legacy yang belum memiliki `user_id` dalam satu transaksi.
4. Jika akun sudah ada, registrasi/OAuth untuk identity baru ditolak; OAuth identity yang telah terhubung atau email pemilik yang telah ada dapat login/ditautkan sesuai implementasi.
5. Login mengeluarkan token sesi acak; database menyimpan hash. Logout/reset/cabut semua sesi menolak token lama.

### 9.2 Pencatatan WhatsApp

1. Webhook membatasi body dan memverifikasi signature.
2. Payload tervalidasi dan whitelist pengirim diperiksa.
3. Pesan masuk dicatat secara idempoten, kemudian diproses melalui antrean.
4. Domain memvalidasi nominal, tanggal, jenis, dan pos.
5. Transaksi dan balasan outbox disimpan secara atomik bila memungkinkan.
6. Worker mengirim balasan; transient failure dijadwalkan ulang dengan backoff, terminal failure tetap terlihat.

### 9.3 Backup/restore sebelum migrasi

1. Pastikan target backup dan restore adalah database terpisah yang terkendali dan akses rahasianya tidak dicatat.
2. Buat snapshot melalui fasilitas provider yang tersedia; catat waktu dan identitas snapshot tanpa menyalin rahasia.
3. Pulihkan ke database terisolasi; jangan arahkan aplikasi produksi ke hasil restore.
4. Jalankan pemeriksaan skema, jumlah transaksi/pos/rencana, relasi parent-child, rentang tanggal, dan saldo/ringkasan yang diketahui.
5. Catat hasil dan bersihkan database restore sesuai kebijakan retensi.
6. Jangan mulai migrasi produksi jika restore atau rekonsiliasi gagal.

## 10. Acceptance criteria

### Rilis 0

- **AC-R0-01:** akun pertama dapat dibuat dan data legacy tanpa owner terikat ke akun tersebut secara atomik.
- **AC-R0-02:** ketika akun ada, percobaan registrasi password kedua tidak menambah pengguna, sesi, atau mengubah owner data.
- **AC-R0-03:** OAuth identity baru tidak dapat membuat akun kedua; identity pemilik yang sudah terhubung tetap dapat login.
- **AC-R0-04:** request tanpa sesi ke route privat mendapat 401; sesi yang dicabut/expired tidak dapat mengakses route.
- **AC-R0-05:** webhook signature salah/ukuran melebihi batas ditolak; webhook duplikat menghasilkan maksimal satu mutasi.
- **AC-R0-06:** transaksi tersimpan tetap satu saat pengiriman balasan gagal; retry sukses memperbarui status outbox.
- **AC-R0-07:** gagal terminal dapat ditemukan dan tidak diakui sebagai balasan terkirim.
- **AC-R0-08:** restore database terpisah lulus pemeriksaan integritas dan rekonsiliasi sebelum migrasi berisiko.
- **AC-R0-09:** tidak ada secret/body transaksi dalam log publik, URL, atau file repository.

### Gerbang Rilis 1

- **AC-R1-01:** dua tenant dengan data serupa tidak dapat membaca/mengubah/mengekspor data satu sama lain melalui route, query, job, webhook, cache, atau admin.
- **AC-R1-02:** seluruh data operasional terkait pelanggan dimiliki tenant; signup tetap tertutup sampai tes matrix lulus.
- **AC-R1-03:** persetujuan privasi/AI, ekspor, pencabutan integrasi, dukungan dan penghapusan diuji serta kebijakannya disetujui.

### Gerbang Rilis 2

- **AC-R2-01:** webhook pembayaran signature-invalid/replay ditolak; event duplikat/tidak berurutan tidak menggandakan entitlement atau invoice.
- **AC-R2-02:** siklus sukses, gagal bayar, masa tenggang, pembatalan, refund, dan rekonsiliasi lulus sandbox.
- **AC-R2-03:** setelah entitlement turun/berakhir, data tidak terhapus dan akses mengikuti kebijakan yang diumumkan.
- **AC-R2-04:** tidak ada data kartu disimpan; harga, ketentuan, dukungan, dan kewajiban dokumen ditinjau sebelum produksi.

## 11. Rencana verifikasi

1. Jalankan regression/unit suite untuk parser, domain keuangan, autentikasi, repository, dan skema idempoten.
2. Uji registrasi pertama, registrasi kedua, OAuth identity baru setelah owner ada, dan login identity yang sudah terhubung.
3. Uji API authorization matrix: tanpa sesi, sesi dicabut, resource ID tidak sah, ekspor, route operasional, health, dan cron.
4. Uji WhatsApp: signature valid/tidak valid, body limit, pengirim asing, duplikat, retry inbound/outbox, terminal failure, dan replay.
5. Uji restore database di lingkungan terpisah dan catat rekonsiliasi sebelum migrasi berisiko.
6. Jalankan lint, typecheck, test, dan build yang disediakan repository sebelum rilis.
7. Jangan menjalankan tes integrasi produksi atau mengubah database produksi tanpa persetujuan dan prosedur backup/rollback.

Rilis R0 ditahan bila akun kedua dapat dibuat, sesi yang dicabut tetap berlaku, ada transaksi duplikat/hilang, secret terekspos, atau restore belum dibuktikan sebelum migrasi berisiko. Rilis R1/R2 tetap tertutup sampai seluruh acceptance criteria tahap terkait lulus.

## 12. Traceability PRD

| Area PRD | Requirement | Acceptance |
|---|---|---|
| Persiapan pribadi | SRS-ARCH-01–05, FR-AUTH-01–05, FR-FIN-01–05 | AC-R0-01–04 |
| WhatsApp andal | FR-WA-01–06, NFR-REL-01–02 | AC-R0-05–07 |
| Backup/migrasi | FR-DB-01–04, NFR-BCP | AC-R0-08 |
| Privasi/secrets | FR-DATA, NFR-SEC-01–04 | AC-R0-09 |
| SaaS beta masa depan | FR-AUTH-06, FR-WA-07, FR-DB-05, NFR-SEC-05 | AC-R1 |
| Billing masa depan | FR-BILL, FR-DB-06, NFR-SEC-06 | AC-R2 |

## 13. Keputusan terbuka

- **R0:** provider/fasilitas backup, retensi dan akses snapshot; target RPO/RTO realistis; status terminal yang perlu ditampilkan; kebutuhan AI pribadi.
- **R1:** target pasar, isolasi skema/tenant, onboarding Meta, email verification, dukungan, kebijakan privasi/retensi/penghapusan, dan akses admin.
- **R2:** paket/harga/kuota, gateway, jadwal dan prorata, retry/masa tenggang, pembatalan/refund, invoice/pajak, serta akses ekspor setelah berhenti.
- Jangan menetapkan harga, SLA, retensi hukum, atau klaim kepatuhan tanpa validasi pihak yang sesuai.

## 14. Lampiran fitur premium pribadi

Spesifikasi implementasi fitur kelas berbayar untuk pemakaian pribadi ada di [SRS fitur premium pribadi](./srs-fitur-premium-pribadi.md), dengan ringkasan produk di [PRD fitur premium pribadi](./prd-fitur-premium-pribadi.md). Tidak ada billing/tenant pada tahap ini.

Status ringkas per 11 November 2026: skema v11 (`recurring_rules`, `recurring_runs`, `accounts`, `workspace_members`, kolom 2FA, `auth_recovery_codes`, `google_sheets`), worker transaksi berulang, impor CSV, digest, laporan lanjutan, AI Pro, keamanan akun dengan kode pemulihan 2FA, email inbound, kalender, Sheets, meter pemakaian, ubah transaksi, filter pos/dompet, tag transaksi, dan rekap 24 bulan sudah diimplementasikan. Kolaborasi keluarga ditangguhkan: API `/api/keluarga` mengembalikan 410 dan `pemilikRequest` tidak memetakan anggota ke pemilik. Rincian kontrak, threat model, kegagalan, dan roadmap ada di SRS premium bagian 2.12, 4.1, dan 7.
