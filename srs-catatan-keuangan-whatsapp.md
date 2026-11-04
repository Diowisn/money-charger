# SRS — Money-Charger SaaS

| Atribut | Nilai |
|---|---|
| Status | Draft untuk validasi teknis |
| Versi | 1.0 |
| Tanggal | 4 November 2026 |
| Terkait PRD | [PRD](./prd-catatan-keuangan-whatsapp.md) |
| Platform sasaran | SaaS bersama, multi-tenant; Next.js dengan modul HMVC internal |

> SRS ini menetapkan perilaku target. Implementasi saat ini masih aplikasi satu pemilik. Tidak satu pun persyaratan multi-tenant di bawah boleh dianggap tersedia sampai migrasi dan acceptance test selesai.

## 1. Tujuan dan konvensi

SRS ini merinci persyaratan fungsional dan nonfungsional, batas integrasi, model data logis, pengujian, dan migrasi untuk mengubah Money-Charger menjadi SaaS multi-tenant.

- **MUST** = wajib untuk rilis beta eksternal.
- **SHOULD** = sebaiknya untuk beta; penyimpangan perlu alasan dan pemilik.
- **MAY** = opsional/fase berikutnya.
- Setiap waktu bisnis disimpan sebagai tanggal dengan zona waktu tenant; default pasar Indonesia adalah `Asia/Jakarta`.
- Semua nominal MVP berupa bilangan bulat rupiah. Nilai pecahan ditolak.
- Setiap requirement mempunyai ID stabil untuk traceability pengembangan dan pengujian.

## 2. Kondisi sistem saat ini dan batas perubahan

Sistem sekarang memakai Next.js API routes dan modul HMVC internal (`src/modules/*`), aturan domain di `src/lib`, PostgreSQL melalui `PgRepo`, dan adapter AI/Groq. Fitur yang ada termasuk parser pesan, budget periode, transaksi, rencana, pos, dashboard, login password tunggal, ekspor CSV bertoken, dan endpoint health.

Kesenjangan arsitektural yang wajib ditutup:

- Tabel bisnis tidak memiliki `tenant_id`; `groups`, `sub_posts`, `aliases`, `plan_versions`, `plan_items`, `transactions`, `pending_actions`, `inbound_messages`, dan `config` global.
- `allowed_numbers` hanya whitelist global, bukan integrasi WhatsApp yang dimiliki tenant.
- Login memakai satu password deployment; belum ada akun dan sesi yang terkait pengguna.
- `PgRepo.load()` memuat semua transaksi; pembatasan satu pool/advisory lock global tidak sesuai beban banyak tenant.
- Webhook menunggu proses AI dan pengiriman balasan; kegagalan kirim balasan dicatat tetapi event masuk sudah idempoten, sehingga retry Meta tidak otomatis memperbaiki balasan.
- Riwayat dashboard dibatasi 120 baris tanpa pencarian/paginasi server-side.

Fitur inti keuangan dipertahankan kecuali perubahan eksplisit requirement AI-konfirmasi, audit, tenant scope, dan status pesan di bawah.

## 3. Arsitektur target

### 3.1 Lapisan

1. **Transport/adapters** — Next.js route handlers untuk web, REST internal, dan webhook.
2. **HMVC modules** — `auth`, `tenant`, `onboarding`, `finance`, `whatsapp`, `export`, `billing`, `admin`, dan `health`, masing-masing memisahkan controller/use case, model/domain, dan view/serializer.
3. **Domain** — mesin anggaran dan aturan transaksi murni; tidak bergantung langsung pada framework/vendor.
4. **Ports** — kontrak `TenantRepository`, `IdentityProvider`, `MessagingProvider`, `AiProvider`, `JobQueue`, `SecretStore`, `BillingProvider`, dan `Mailer`.
5. **Adapters** — implementasi vendor yang dapat diganti dan dikonfigurasi; tidak ada dependensi vendor di perhitungan uang.
6. **Persistence** — Postgres dengan migrasi versi, cakupan tenant wajib, foreign key yang mencegah relasi lintas tenant, dan indeks berdasarkan pola akses.
7. **Workers** — proses antrean untuk balasan outbox, tugas berulang, ekspor/penghapusan, dan rekonsiliasi.

Pemilihan vendor identitas, queue, secret manager/KMS, email, billing, dan provider AI/WhatsApp merupakan keputusan implementasi terpisah. Adapter tidak berarti integrasi provider alternatif sudah disediakan.

### 3.2 Konteks tenant

- Tenant adalah batas pemilik data. Setiap akun pelanggan membuat satu tenant pribadi pada MVP.
- `tenant_id` berasal dari sesi autentikasi yang tervalidasi atau dari pemetaan `phone_number_id` webhook ke integrasi aktif yang telah diverifikasi.
- Klien dilarang menentukan/mengganti tenant hanya dengan mengirim `tenant_id` di body, header, query, URL, atau identifier resource.
- Service-to-service dan worker menerima konteks tenant eksplisit yang ditandatangani/diambil dari record antrean tepercaya.
- Semua akses data melalui repository/use case yang memerlukan `TenantContext`; pengecualian hanya untuk lookup integrasi webhook dan tugas platform yang dibatasi secara eksplisit.

## 4. Aktor dan hak akses

| Aktor | Hak minimum |
|---|---|
| Pengunjung | Melihat halaman publik dan membuat akun |
| Pemilik tenant | Mengakses/mengekspor data sendiri, mengatur keuangan, nomor, AI, privasi, serta menutup tenant |
| Anggota tenant (fase berikutnya) | Hak eksplisit berbasis peran; tidak aktif pada beta awal |
| Worker | Menjalankan hanya job dengan tenant dan izin yang tercatat |
| Support | Metadata status layanan; akses data transaksi ditolak secara default |
| Operator admin | Mengelola status tenant/integrasi; tindakan sensitif beralasan dan diaudit |
| Administrator keamanan | Mengelola insiden/kunci dan memeriksa audit dengan least privilege |

## 5. Persyaratan fungsional

### 5.1 Akun, autentikasi, dan tenant

- **FR-AUTH-01 MUST** Sistem menyediakan registrasi terbatas/undangan dengan email unik, validasi input, verifikasi email, dan pencatatan versi persetujuan syarat serta privasi.
- **FR-AUTH-02 MUST** Sistem menyediakan login individual, logout, reset kata sandi melalui proses bertoken berumur pendek, dan pencabutan seluruh sesi.
- **FR-AUTH-03 MUST** Sesi disimpan/ditandatangani secara aman, memiliki kedaluwarsa idle dan absolut yang diverifikasi server-side, dapat dicabut, serta menggunakan cookie `HttpOnly`, `Secure` pada HTTPS, dan kebijakan `SameSite` yang sesuai.
- **FR-AUTH-04 MUST** Login, reset password, verifikasi email, dan endpoint sensitif memiliki rate limit; error tidak membocorkan apakah akun/email terdaftar.
- **FR-TEN-01 MUST** Pendaftaran sukses membuat tenant pribadi, keanggotaan owner, setelan default, dan audit event secara atomik atau dapat dipulihkan.
- **FR-TEN-02 MUST** Semua model bisnis memiliki tenant owner atau relasi eksplisit yang menjamin tenant owner sama. Tidak boleh ada data transaksi global.
- **FR-TEN-03 MUST** Semua endpoint memeriksa sesi dan otorisasi sebelum memuat/mengubah resource; resource tenant lain merespons 404 atau penolakan yang tidak membocorkan keberadaan.
- **FR-TEN-04 MUST** Tenant yang dinonaktifkan tidak dapat menulis data atau menerima pemrosesan pesan baru; pembacaan/ekspor mengikuti status layanan dan kebijakan akun.
- **FR-TEN-05 SHOULD** Sistem mendukung beberapa anggota tenant di masa depan, tetapi fitur undangan/peran tidak tampil sebelum model dan aturan konflik perubahan disetujui.

### 5.2 Onboarding dan integrasi WhatsApp

- **FR-WA-01 MUST** Wizard setup menjelaskan bahwa satu nomor WhatsApp bot akan terikat ke satu tenant dan memverifikasi kepemilikan sebelum mengaktifkan koneksi.
- **FR-WA-02 MUST** Informasi integrasi mencatat tenant, provider, business/WABA ID seperlunya, phone number ID, status, waktu koneksi/validasi terakhir, dan referensi rahasia terenkripsi—bukan token akses dalam teks biasa.
- **FR-WA-03 MUST** Sistem menyediakan tindakan cek status, cabut koneksi, dan rotasi/pembaruan rahasia sesuai kemampuan provider.
- **FR-WA-04 MUST** Webhook memverifikasi tanda tangan atas body mentah sebelum memproses payload.
- **FR-WA-05 MUST** Tenant penerima ditentukan dari identifier nomor bot/provider yang telah diverifikasi, bukan hanya dari nomor pengirim. Nomor pengirim kemudian diverifikasi sebagai nomor owner/anggota yang diizinkan tenant itu.
- **FR-WA-06 MUST** Webhook menerima notifikasi status yang valid tanpa membuat transaksi; tipe pesan tidak didukung mendapat respons produk yang jelas.
- **FR-WA-07 MUST** Proses integrasi dan kredensial khusus tenant terisolasi; satu token tenant tidak dapat digunakan untuk mengirim atas nama tenant lain.
- **FR-WA-08 SHOULD** Onboarding beta boleh dibantu operator, tetapi operator tidak boleh meminta pelanggan mengirim token rahasia melalui chat/email biasa. Alur dan tanggung jawab pencabutan akses didokumentasikan.
- **FR-WA-09 MAY** Embedded Signup/lebih dari satu nomor per tenant ditambahkan setelah kelayakan, kebijakan Meta, persetujuan, dan audit keamanan diverifikasi.

### 5.3 Transaksi dan anggaran

- **FR-FIN-01 MUST** Sistem mempertahankan perintah inti: pemasukan, gaji, pengeluaran, bonus, koreksi/pembatalan, rencana, pos, saldo/wadah, laporan, dan ekspor sesuai fitur saat ini.
- **FR-FIN-02 MUST** Semua perhitungan dilakukan dengan integer IDR pada domain; input pecahan, overflow, nominal negatif yang tidak valid, serta tanggal tidak valid ditolak dengan pesan yang dapat dipahami.
- **FR-FIN-03 MUST** Setiap mutasi transaksi dilakukan atomik; induk dan transaksi turunannya dibatalkan/diperbarui bersama.
- **FR-FIN-04 MUST** Transaksi menyimpan tenant, actor/source, waktu pencatatan, tanggal bisnis, sumber input, dan relasi audit yang diperlukan.
- **FR-FIN-05 MUST** Koreksi tidak menghapus jejak: perubahan dicatat sebagai pembatalan/pengganti atau audit sebelum/sesudah sesuai rancangan data final.
- **FR-FIN-06 MUST** Sistem mempertahankan zona waktu tenant pada parser tanggal dan tampilan laporan; pesan yang datang terlambat tetap memakai timestamp provider dengan aturan koreksi yang terdokumentasi.
- **FR-FIN-07 MUST** Pengguna dapat meninjau transaksi, memfilter tanggal/jenis/pos/status, menavigasi halaman riwayat, serta melihat status sumber AI dan kegagalan.
- **FR-FIN-08 MUST** Operasi transaksi yang berpotensi menutup periode/berdampak besar, seperti gaji ganda, tetap memerlukan konfirmasi eksplisit dan kedaluwarsa yang jelas.
- **FR-FIN-09 MUST** Ekspor hanya memuat data tenant peminta, berumur pendek, sekali pakai atau memerlukan autentikasi ulang, dan tidak menaruh data finansial dalam URL.
- **FR-FIN-10 SHOULD** Sistem menyediakan jejak audit yang bisa dibaca pengguna untuk pencatatan, koreksi, pembatalan, perubahan rencana, dan impor.

### 5.4 AI dan parser

- **FR-AI-01 MUST** Penggunaan AI nonaktif sampai pelanggan memberi persetujuan eksplisit; pelanggan dapat mencabutnya kapan pun tanpa kehilangan parser format baku.
- **FR-AI-02 MUST** UI menjelaskan jenis isi pesan yang dikirim ke provider AI, tujuan, provider aktif, dan tautan kebijakan/retensi yang telah diverifikasi.
- **FR-AI-03 MUST** Parser deterministik dipakai lebih dahulu. AI tidak boleh menentukan atau mengubah nominal yang tidak terdapat dalam teks asli.
- **FR-AI-04 MUST** Hasil AI yang tidak lengkap, ambigu, tidak valid, terlalu besar, atau berisi intent yang tidak didukung tidak boleh menulis transaksi.
- **FR-AI-05 MUST** Hasil AI ditampilkan sebagai pratinjau berisi jenis, nominal, pos, tanggal, dan label. Mutasi dilakukan hanya setelah tindakan konfirmasi eksplisit sebelum batas waktu.
- **FR-AI-06 MUST** Pesan konfirmasi mengikat persetujuan ke satu payload/tenant/pengguna, berumur pendek, hanya dapat digunakan sekali, dan tidak dapat menyetujui aksi tenant lain.
- **FR-AI-07 MUST** Tiap transaksi hasil AI ditandai sumber/provider/model seperlunya, tanpa menyimpan prompt atau isi mentah ke log umum.
- **FR-AI-08 MUST** Timeout, kuota, provider error, atau validasi gagal menghasilkan fallback aman dan tidak menggandakan transaksi.
- **FR-AI-09 SHOULD** Sediakan batas penggunaan AI per tenant dan kontrol admin untuk menonaktifkan provider saat insiden.

### 5.5 Webhook, antrean, dan pengiriman

- **FR-MSG-01 MUST** Peristiwa webhook sah disimpan secara idempoten berdasarkan provider, akun/integrasi, dan ID pesan/event.
- **FR-MSG-02 MUST** Setelah event dan job penerimaan tersimpan secara durable, webhook boleh memberi acknowledgment; pemrosesan lambat/AI/pengiriman tidak menahan koneksi webhook.
- **FR-MSG-03 MUST** Perubahan transaksi dan pembuatan outbox balasan terjadi dalam transaksi database yang sama.
- **FR-MSG-04 MUST** Worker mengirim outbox dengan retry backoff terbatas, batas attempt, jitter, timeout, dan status final; dead-letter/failed message dapat ditinjau dan dipulihkan.
- **FR-MSG-05 MUST** Retry tidak membuat transaksi ganda. Pengiriman balasan dapat at-least-once; duplikasi balasan harus ditekan menggunakan status/idempotensi provider bila tersedia dan dinyatakan jelas.
- **FR-MSG-06 MUST** Setiap kegagalan terminal memicu metrik/alert dan menyediakan jalur rekonsiliasi yang tidak membocorkan isi finansial.
- **FR-MSG-07 MUST** Event yang datang tidak berurutan menggunakan timestamp provider untuk tanggal bisnis; proses konfirmasi/urutan saldo harus memiliki perilaku yang deterministik.
- **FR-MSG-08 SHOULD** Batas ukuran body dan jumlah event per webhook diterapkan untuk menghindari beban tak terkendali.

### 5.6 Privasi, data, dan akun

- **FR-DATA-01 MUST** Pelanggan dapat melihat persetujuan yang pernah diberikan, mencabut AI, mencabut integrasi WhatsApp, meminta ekspor, meminta penutupan akun, dan melihat status permintaannya.
- **FR-DATA-02 MUST** Ekspor akun mencakup transaksi, pos/alias, rencana, setelan, dan metadata yang diperlukan dalam format terdokumentasi; tidak menyertakan rahasia provider.
- **FR-DATA-03 MUST** Penghapusan mengidentifikasi seluruh record terkait tenant, job, cache, referensi integrasi, dan data yang dapat dihapus pada sistem vendor.
- **FR-DATA-04 MUST** Permintaan penghapusan menonaktifkan tenant/integrasi sesuai kebijakan dan menghasilkan audit event tanpa mengekalkan isi keuangan yang sudah dihapus.
- **FR-DATA-05 MUST** Data dalam backup kedaluwarsa sesuai jadwal terdokumentasi; sistem tidak boleh menjanjikan penghapusan instan dari backup jika mekanisme backup tidak mendukungnya.
- **FR-DATA-06 MUST** Log aplikasi, monitoring, dan analytics tidak menyimpan isi pesan, nominal, label transaksi, token, password, atau connection string.
- **FR-DATA-07 MUST** Halaman publik menyediakan kebijakan privasi, syarat layanan, kontak dukungan/privasi, dan penjelasan batasan bahwa produk adalah pencatat manual, bukan saldo rekening.

### 5.7 Billing dan administrasi

- **FR-BILL-01 MUST (gerbang komersial)** Sebelum paket berbayar umum, pelanggan dapat melihat paket, harga, batas pemakaian, periode, kebijakan pembatalan/refund, dan status langganan sebelum membayar.
- **FR-BILL-02 MUST (gerbang komersial)** Perubahan status subscription diverifikasi dari provider server-side; webhook billing idempoten dan tenant subscription tidak dapat ditentukan klien.
- **FR-BILL-03 MUST (gerbang komersial)** Kegagalan pembayaran mengikuti masa tenggang dan kebijakan pembatasan yang diumumkan; data tidak dihapus otomatis karena pembayaran gagal.
- **FR-BILL-04 MUST** Sistem tidak menyimpan nomor kartu/kredensial pembayaran yang seharusnya ditangani provider pembayaran.
- **FR-ADM-01 MUST** Admin dapat menangguhkan/mengaktifkan tenant dan mengelola status integrasi dengan audit actor, waktu, alasan, dan perubahan.
- **FR-ADM-02 MUST** Akses support terhadap isi transaksi tidak tersedia secara default; jika dibutuhkan untuk tiket/insiden, gunakan persetujuan yang tercatat, akses terbatas waktu, dan audit.
- **FR-ADM-03 MUST** Endpoint health publik, bila tetap ada, hanya mengembalikan status generik. Rincian diagnostik memerlukan autentikasi admin dan tidak membocorkan jumlah tenant/pesan atau konfigurasi rahasia.

## 6. Model data logis minimum

Nama tabel bersifat usulan; skema fisik harus mengikuti migrasi yang direview. Semua tabel tenant-scoped memiliki `tenant_id NOT NULL`.

| Entitas | Kunci/relasi penting | Data sensitif dan aturan |
|---|---|---|
| `users` | `id`, email ternormalisasi, status | Password/session dikelola adapter identitas; jangan simpan plaintext |
| `tenants` | `id`, status, locale, timezone, created/closed | Satu pelanggan pemilik per tenant pada MVP |
| `memberships` | `(tenant_id,user_id)`, role, status | FK komposit/constraint cegah relasi lintas tenant |
| `consents` | tenant/user, jenis, versi, diberikan/dicabut | Audit persetujuan privasi/AI/syarat |
| `integrations` | tenant, provider, external account ID, status | Unique partial constraint untuk satu nomor aktif per tenant sesuai aturan |
| `integration_secrets` | integration, encrypted secret/reference, version | Enkripsi envelope/KMS atau secret manager; tidak masuk response/log |
| `transactions` | tenant, id, type, amount, business date, source | Unique/idempotency sesuai event; soft-cancel/audit |
| `groups`, `sub_posts`, `aliases` | tenant-scoped ID dan relasi | Nama unik hanya dalam tenant |
| `plan_versions`, `plan_items` | tenant-scoped version dan items | Versi historis tetap bisa dijelaskan |
| `pending_actions` | tenant, user, type, payload, expiry, status | Token/action hash; payload minimum; consume atomik |
| `inbound_events` | integration, provider event ID, status, received time | Unique `(integration_id, provider_event_id)`; raw body tidak disimpan default |
| `outbox_messages` | tenant, event, recipient ref, status, attempt, next retry | Isi balasan seperlunya dan terenkripsi/retensi singkat bila perlu |
| `audit_events` | tenant nullable untuk event platform, actor, action, resource, time | Jangan simpan rahasia atau nilai transaksi lengkap di metadata umum |
| `subscriptions` | tenant, provider customer/subscription refs, status, plan | Data kartu tidak disimpan |
| `deletion_requests` | tenant, status, deadline, completion evidence | Dapat diproses berulang tanpa menghapus tenant salah |

### 6.1 Constraint dan indeks

- Unique constraints dan relasi antarentitas tenant harus mengikutkan tenant dalam kunci yang relevan; foreign key hanya boleh menyambungkan record pada tenant yang sama.
- Tambahkan indeks komposit sesuai pola akses seperti `(tenant_id, business_date DESC, id DESC)`, `(tenant_id, status)`, dan unique idempotency key.
- Hindari memuat seluruh riwayat tenant untuk setiap request; gunakan agregasi yang terukur, rentang tanggal, cursor pagination, dan proyeksi kolom seperlunya.
- Jumlah nominal disimpan pada tipe yang tidak mengalami overflow; serialisasi JSON menggunakan batas aman dan validasi sebelum konversi.
- Kebijakan Row-Level Security dapat ditambahkan sebagai defense-in-depth setelah diuji dengan pola pooling/transaksi yang benar; aplikasi tetap wajib menerapkan otorisasi tenant pada layer repository/use case.

## 7. Persyaratan antarmuka

### 7.1 Web

- Semua halaman dan API privat memerlukan sesi individual.
- Validasi body memakai skema terketik di boundary; jangan mengandalkan cast TypeScript untuk validasi runtime.
- Mutasi cookie-authenticated memakai perlindungan CSRF/origin sesuai arsitektur deployment.
- Pesan error aman, konsisten, berbahasa Indonesia, dan tidak berisi stack trace/SQL/provider secret.
- UI menampilkan status sesi/integrasi/AI, indikator catatan hasil AI, keadaan antrean bila gagal, dan konfirmasi sebelum operasi destruktif.
- Riwayat transaksi menggunakan pagination/filter server-side dan selalu terikat tenant.

### 7.2 WhatsApp

- Signature webhook diverifikasi dengan secret aplikasi sesuai konfigurasi provider sebelum parsing event.
- Pemetaan nomor bot ke tenant memeriksa status integrasi aktif; nomor pengirim divalidasi terhadap keanggotaan/integrasi yang telah disetujui.
- Respons teks tidak menyatakan catatan tersimpan sebelum commit database berhasil.
- Balasan di luar jendela/aturan provider harus ditangani sesuai aturan WhatsApp yang berlaku; jangan mengirim template/promosi tanpa persetujuan dan verifikasi kebijakan terkini.

### 7.3 Integrasi eksternal

Semua adapter harus memetakan error provider ke kategori internal terstruktur: transient, permanent, rate-limited, invalid-credential, dan unavailable. Rahasia/provider payload tidak boleh diteruskan ke klien atau log umum. Provider API version, timeout, retry, serta batas ukuran dikonfigurasi dan memiliki nilai default yang diuji.

## 8. Persyaratan nonfungsional

### 8.1 Keamanan

- **NFR-SEC-01 MUST:** 100% jalur akses data pelanggan melalui tenant authorization; tes matriks lintas tenant untuk operasi baca, ubah, hapus, ekspor, laporan, konfirmasi, job, dan dukungan harus lulus.
- **NFR-SEC-02 MUST:** TLS untuk semua koneksi eksternal; enkripsi at-rest di database/backup sesuai kemampuan provider; token WhatsApp per tenant dienkripsi atau disimpan dalam secret manager dengan kontrol least privilege dan rotasi.
- **NFR-SEC-03 MUST:** tidak ada rahasia dalam source, git, browser, URL, log, error monitoring, atau output health. Rahasia uji dan produksi terpisah.
- **NFR-SEC-04 MUST:** rate limiting login, reset, webhook, AI, dan API mutasi; batas ukuran request; validasi signature; pencegahan replay/idempotensi.
- **NFR-SEC-05 MUST:** sesi bisa dicabut server-side; password reset token sekali pakai dan berumur pendek; privileged action memerlukan re-authentication.
- **NFR-SEC-06 MUST:** sebelum peluncuran dilakukan threat modeling, dependency/security scan, pemeriksaan kontrol akses, dan uji penetrasi/assessment yang sesuai skala; temuan kritis/tinggi yang dapat dieksploitasi harus ditutup.
- **NFR-SEC-07 MUST:** administrator dan support memakai akun individual, MFA sesuai provider, least privilege, dan audit untuk aksi sensitif.

### 8.2 Reliabilitas, performa, dan kapasitas

- **NFR-REL-01 MUST:** webhook menerima dan menyimpan event/job durable dengan p95 ≤ 2 detik saat layanan normal; acknowledgment setelah durable write, bukan setelah respons AI/pesan.
- **NFR-REL-02 MUST:** setiap pesan/event tidak menghasilkan lebih dari satu transaksi bisnis meski webhook diterima berulang.
- **NFR-REL-03 MUST:** outbox retry menggunakan backoff dengan batas; job gagal terminal dapat ditemukan, diperbaiki, dan diproses ulang dengan idempotensi.
- **NFR-PERF-01 SHOULD:** API dashboard p95 ≤ 1 detik pada beban uji 50 request bersamaan per deployment, tenant uji dengan 10.000 transaksi, tanpa query lintas tenant.
- **NFR-PERF-02 MUST:** load test mengevaluasi antrean webhook 10 event/detik selama 15 menit; kapasitas final ditinjau berdasarkan batas hosting/provider, bukan dianggap otomatis terpenuhi.
- **NFR-PERF-03 MUST:** koneksi database tidak dibuat berlebihan pada serverless; pool/pooling dan transaksi advisory lock dipilih berdasarkan uji konkurensi multi-tenant. Lock satu kunci global tidak boleh menserialkan semua tenant.
- **NFR-REL-04 SHOULD:** target availability beta internal 99,5% per bulan, tidak termasuk gangguan upstream yang dijelaskan; tidak menjadi SLA kontraktual sebelum instrumentasi dan operasi membuktikannya.

### 8.3 Backup, pemulihan, dan kontinuitas

- **NFR-BCP-01 MUST:** backup otomatis terjadwal untuk data database dan konfigurasi yang diperlukan; frekuensi, retensi, wilayah, pemilik, serta biaya didokumentasikan.
- **NFR-BCP-02 MUST:** target pemulihan beta RPO ≤ 24 jam dan RTO ≤ 4 jam.
- **NFR-BCP-03 MUST:** restore drill dilakukan sebelum beta dan setidaknya per kuartal; drill memeriksa jumlah transaksi, tenants, rencana, relasi, dan kemampuan login/WhatsApp pada lingkungan pemulihan.
- **NFR-BCP-04 MUST:** backup tidak dianggap valid hanya karena pekerjaan sukses; ada alert kegagalan dan bukti pemulihan.
- **NFR-BCP-05 MUST:** migrasi skema produksi memiliki backup/snapshot sesuai kebutuhan, prosedur expand-migrate-contract, pemeriksaan pascamigrasi, dan rollback/forward-fix yang disetujui.

### 8.4 Privasi, audit, dan observabilitas

- **NFR-PRIV-01 MUST:** retensi setiap kelas data memiliki owner, tujuan, jangka waktu, mekanisme penghapusan, dan bukti verifikasi.
- **NFR-PRIV-02 MUST:** data sensitif tidak masuk analytics pihak ketiga tanpa dasar/consent dan tinjauan privasi.
- **NFR-OBS-01 MUST:** metrik mencakup request/latensi/error per modul, jumlah webhook valid/invalid, antrean/backlog/umur pesan, retry/final failures, DB saturation, provider error/kuota, biaya AI agregat, dan status backup.
- **NFR-OBS-02 MUST:** alert terarah pada error tingkat layanan tanpa mengirim isi pesan/transaksi ke kanal alert.
- **NFR-OBS-03 MUST:** request/job memiliki correlation ID yang tidak mengandung nomor telepon atau identifier sensitif; tenant reference di log dipseudonimkan atau dibatasi aksesnya.
- **NFR-AUD-01 MUST:** audit event append-only untuk autentikasi penting, perubahan integrasi, ekspor, tindakan admin/support, penghapusan, serta mutasi keuangan; retensi dan aksesnya dibatasi.

### 8.5 Aksesibilitas dan kompatibilitas

- **NFR-UX-01 SHOULD:** dashboard responsif ponsel dan dapat digunakan dengan keyboard/screen reader untuk fungsi utama.
- **NFR-UX-02 SHOULD:** teks bahasa Indonesia sederhana, error menyatakan cara memperbaiki, dan format tanggal/waktu/IDR konsisten dengan locale tenant.
- **NFR-COMP-01 MUST:** aplikasi utama mendukung browser modern pada versi yang masih mendapat pembaruan keamanan.
- **NFR-COMP-02 MUST:** domain tidak mengimpor SDK provider langsung; boundary integrasi diuji kontraknya sehingga provider dapat diganti.

## 9. API dan kontrak perilaku (logis)

Route aktual dapat berubah, tetapi kontrak berikut wajib:

| Operasi | Autentikasi | Perilaku |
|---|---|---|
| Registrasi/login/logout/reset | Publik dengan rate limit atau sesi | Menerbitkan/mencabut sesi individual, tanpa password bersama |
| Profil dan setup tenant | Sesi + membership | Membaca/mengubah tenant aktif dari server-side context |
| Dashboard/transaksi/rencana/pos | Sesi + permission + tenant context | Mengembalikan resource tenant sendiri, paginasi dan validasi |
| Export | Sesi ulang/one-time authorization | Hanya ekspor tenant sendiri; respons no-store; tanpa data tenant lain |
| Integrasi WhatsApp | Sesi owner + re-auth untuk secret action | Menampilkan metadata/status, bukan secret |
| Webhook WhatsApp | Signature provider | Resolve tenant dari integration ID dan enqueue durable; payload invalid ditolak |
| Worker internal | Identitas service/job bertanda tangan | Memproses satu tenant/job; tidak menerima tenant arbitrer dari publik |
| Health | Status generik publik; detail perlu admin | Tidak menampilkan env presence, jumlah pengguna, host DB, atau rincian exception |
| Admin | Akun admin individual + MFA + audit | Tenant suspend/restore dan dukungan terbatas |
| Billing webhook | Signature provider + idempotensi | Memperbarui subscription berdasarkan referensi provider yang diverifikasi |

Format error umum: `{ code, message, requestId }`; detail validasi boleh menyertakan field yang aman. Error internal selalu disanitasi.

## 10. Alur penerimaan pesan secara rinci

1. **Terima:** route membatasi ukuran body dan memverifikasi signature atas byte/body asli.
2. **Parse envelope:** validasi skema event dengan parser runtime; event status/unsupported diproses sebagai event non-transaksi atau diabaikan secara terukur.
3. **Resolve integration:** cari integrasi aktif dari ID nomor bisnis penerima; pastikan tenant aktif.
4. **Authorize sender:** cocokkan nomor pengirim dengan identitas WhatsApp yang terhubung ke tenant. Pesan asing tidak menghasilkan akses maupun balasan yang membocorkan tenant.
5. **Idempotency:** insert `inbound_event` unique; event yang sudah selesai tidak diproses ulang. Event yang sedang diproses dapat diambil alih setelah lease kedaluwarsa.
6. **Durable queue:** simpan event/job minimal dan acknowledge webhook. Jangan membuat mutasi keuangan sebelum validasi/konfirmasi.
7. **Interpretasi:** proses perintah deterministik; AI hanya jika consent aktif. Hasil AI menghasilkan aksi pending berumur pendek.
8. **Commit:** transaksi, audit event, idempotency result, dan outbox dibuat dalam transaksi yang atomik.
9. **Deliver:** worker mengirim balasan/outbox. Retry transient dengan batas; error permanent menjadi terminal dengan pemberitahuan/rekonsiliasi.
10. **Observe:** catat durasi, kategori error, attempt, status akhir, tanpa raw message atau secret.

## 11. Migrasi dari aplikasi satu pemilik

- **MIG-01 MUST:** lakukan inventarisasi jumlah baris, konfigurasi, nomor aktif, pending action, transaksi berlaku/batal, dan rentang tanggal.
- **MIG-02 MUST:** buat snapshot/backup dan rehearsal migrasi pada clone/staging sebelum database produksi diubah.
- **MIG-03 MUST:** buat satu tenant legacy dan satu owner terverifikasi untuk pemilik saat ini.
- **MIG-04 MUST:** tambahkan tenant ID nullable terlebih dahulu, backfill semua record dan relasi ke tenant legacy, lalu validasi tidak ada `NULL`/relasi lintas tenant.
- **MIG-05 MUST:** migrasikan nomor WhatsApp whitelist menjadi integrasi tenant; kredensial provider tidak disalin dari data global yang tidak sesuai, dan diuji setelah migrasi.
- **MIG-06 MUST:** ubah repository untuk memerlukan tenant context; aktifkan constraint NOT NULL/foreign key/index sesudah rekonsiliasi.
- **MIG-07 MUST:** catat rekonsiliasi jumlah transaksi/plan/pos/pending sebelum dan sesudah; total saldo serta hasil laporan periode yang dikenal harus sama.
- **MIG-08 MUST:** selama beta, signup publik tetap tertutup sampai semua endpoint, UI, worker, ekspor, webhook, health, serta admin menjalankan tenant isolation.
- **MIG-09 MUST:** siapkan rollback atau forward-fix. Jangan menghapus kolom legacy atau backup sebelum release stabil dan jangka rollback berakhir.

## 12. Acceptance criteria

### Isolasi dan autentikasi

- **AC-TEN-01:** dua tenant A/B mempunyai nama pos, rencana, transaksi, ekspor, dan nomor berbeda; seluruh endpoint A hanya mengembalikan/mengubah data A.
- **AC-TEN-02:** ubah ID transaksi, pos, ekspor, action pending, membership, atau parameter tenant dari A menjadi ID milik B; respons tidak membocorkan data dan tidak mengubah B.
- **AC-TEN-03:** query/repository bisnis tidak dapat dipanggil tanpa tenant context; pengujian static/contract mengidentifikasi jalur pengecualian yang disetujui.
- **AC-AUTH-01:** akun A logout/revoke; cookie lama ditolak server-side pada halaman, API, dan ekspor.
- **AC-AUTH-02:** rate limit login berlaku, reset token hanya dapat dipakai sekali sebelum kedaluwarsa, dan respons tidak membedakan email tidak ada dengan password salah.
- **AC-AUTH-03:** aksi perubahan integrasi, ekspor sensitif, dan tutup akun menolak request tanpa re-authentication yang valid.

### Pesan dan idempotensi

- **AC-MSG-01:** signature salah atau body diubah setelah signature dibuat ditolak sebelum enqueue.
- **AC-MSG-02:** webhook yang sama dikirim 10 kali menghasilkan maksimal satu mutasi transaksi.
- **AC-MSG-03:** pesan untuk `phone_number_id` tenant A dan pengirim tak dikenal tidak dapat menulis atau membaca data A/B.
- **AC-MSG-04:** database commit tetapi provider kirim balasan timeout; transaksi tetap satu, outbox berstatus retry, retry sukses memperbarui status.
- **AC-MSG-05:** kegagalan provider terminal terlihat pada dashboard/alert operasional dan dapat dipulihkan tanpa transaksi ganda.
- **AC-MSG-06:** burst event valid diakui setelah durable queue tanpa menunggu AI atau Graph API.

### Keuangan dan AI

- **AC-FIN-01:** seluruh skenario regresi mesin uang AC-01—AC-26 yang ada tetap menghasilkan hasil identik untuk tenant legacy.
- **AC-FIN-02:** satu operasi ubah rencana yang gagal di tengah transaksi tidak meninggalkan versi aktif/selisih parsial.
- **AC-FIN-03:** pagination/filter transaksi konsisten, tidak menghilangkan record di batas halaman saat ada transaksi baru.
- **AC-AI-01:** AI default off; tanpa consent, teks bebas tidak pernah dikirim ke provider AI.
- **AC-AI-02:** nilai AI dengan nominal/date yang tidak didukung teks asal, intent tak dikenal, JSON invalid, atau nominal batas ditolak dan tidak mengubah saldo.
- **AC-AI-03:** interpretasi sah ditampilkan sebagai preview; tidak ada transaksi sampai pengguna menyetujui preview yang sama sebelum expiry.
- **AC-AI-04:** retry pesan konfirmasi lama, konfirmasi tenant lain, atau konfirmasi setelah expiry tidak membuat transaksi.
- **AC-AI-05:** cabut consent langsung menghentikan pemanggilan AI untuk pesan berikutnya dan fallback format baku tetap berfungsi.

### Privasi, ekspor, penghapusan, operasi

- **AC-DATA-01:** ekspor oleh A mengandung data A dan tidak mengandung identifier/record B; file tidak dapat diakses lagi setelah expiry/pemakaian sesuai kebijakan.
- **AC-DATA-02:** permintaan tutup akun mencabut integrasi dan sesi, menolak pesan baru, membuat job penghapusan idempoten, dan statusnya dapat dilacak.
- **AC-DATA-03:** prosedur menyatakan jadwal penghapusan dari backup dan log; verifikasi restore tidak mengaktifkan tenant yang telah dihapus tanpa prosedur pemulihan sah.
- **AC-OPS-01:** alert terbentuk untuk antrean tertua melebihi ambang, gagal terminal, DB unavailable, dan backup gagal; alert tidak mengandung body pesan/secret.
- **AC-OPS-02:** restore drill memenuhi RPO ≤24 jam dan RTO ≤4 jam serta rekonsiliasi total transaksi per tenant.
- **AC-MIG-01:** migrasi legacy mempertahankan jumlah record, status pembatalan, hubungan parent/child, tanggal bisnis, versi rencana, dan hasil laporan yang diuji.
- **AC-ADM-01:** akses support ke detail tenant ditolak tanpa grant terikat kasus dan waktu; grant dan seluruh pembacaan tercatat audit.

## 13. Rencana pengujian

1. Unit regression untuk mesin uang/parser dan batas nominal/tanggal.
2. Repository contract test berjalan pada Postgres kompatibel, bukan hanya in-memory mock; uji transaksi, FK, unique constraints, dan rollback.
3. Integration test multi-tenant dengan data serupa pada tenant A/B dan tenant C yang dinonaktifkan.
4. API authorization matrix untuk setiap route/method/resource, termasuk IDOR, CSRF, expired session, rate limits, ekspor, dan admin.
5. Webhook contract test untuk signature, payload invalid, event status, duplicate, out-of-order, batch, unknown integration, dan retry.
6. Worker/outbox test untuk crash sebelum/sesudah send, timeout, 429/5xx, permanent error, lease expiry, dan replay.
7. AI safety/evaluation dataset berbahasa Indonesia yang mencakup salah ketik, nominal ambigu, angka dalam label, beberapa nominal, tanggal relatif, prompt injection, serta kalimat non-keuangan. Tidak menggunakan data pribadi nyata tanpa persetujuan.
8. E2E onboarding, setuju AI, cabut AI, catat, koreksi, ekspor, cabut WhatsApp, tutup akun.
9. Load test dan query plan untuk 10.000 transaksi/tenant serta beban antrean yang ditetapkan NFR.
10. Backup restore drill, migrasi staging, security review, dan pemeriksaan log/telemetry terhadap rahasia/PII.

Rilis beta ditahan bila ada kegagalan isolasi, transaksi ganda, mutasi tanpa persetujuan AI, secret di log, restore tidak teruji, atau temuan keamanan critical/high yang belum ditangani.

## 14. Traceability PRD ke SRS

| Tujuan/area PRD | Requirement utama | Acceptance |
|---|---|---|
| SaaS multi-tenant dan privasi | FR-TEN, FR-AUTH, NFR-SEC | AC-TEN, AC-AUTH |
| WhatsApp dan status pesan | FR-WA, FR-MSG | AC-MSG |
| Pencatatan dan koreksi keuangan | FR-FIN | AC-FIN, FR-FIN-01 regression |
| AI aman dan opt-in | FR-AI | AC-AI |
| Ekspor/penghapusan | FR-DATA | AC-DATA |
| Billing dan dukungan | FR-BILL, FR-ADM | AC-ADM; gerbang komersial |
| Reliabilitas/operasi | NFR-REL, NFR-OBS | AC-OPS |
| Pemulihan dan migrasi | NFR-BCP, MIG | AC-OPS-02, AC-MIG |

## 15. Ketergantungan dan keputusan sebelum implementasi

- Model identity provider dan strategi migrasi sesi tunggal ke akun individual.
- Cara onboarding Meta untuk setiap pelanggan, ownership nomor, batas permission, serta rotasi token.
- Queue/worker yang mendukung retry dan durable jobs di lingkungan hosting target.
- Secret manager/encryption key management, rotasi, recovery, dan kontrol akses.
- Billing provider, paket, mata uang, pajak, refund, masa tenggang, dan penghentian layanan.
- Provider AI, persyaratan retensi/region, mekanisme consent, biaya maksimum, dan dataset evaluasi.
- Jadwal retensi data, audit, logs, backup, serta penghapusan akhir.
- Peninjauan legal/privasi, pemasaran, syarat layanan, dan kebutuhan operasional di Indonesia.
- Target SLO produksi setelah pengukuran beta; target dalam dokumen ini belum otomatis menjadi SLA.

