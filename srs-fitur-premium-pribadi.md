# SRS — Fitur Premium Pribadi Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Implementasi bertahap; pemakaian pribadi |
| Versi | 1.6 |
| Tanggal | 11 November 2026 |
| Pemilik dokumen | Pemilik produk |
| Terkait PRD | [PRD fitur premium pribadi](./prd-fitur-premium-pribadi.md) |
| Terkait SRS utama | [SRS utama](./srs-catatan-keuangan-whatsapp.md) |

> Tidak ada billing atau entitlement pada tahap ini. Semua fitur tersedia untuk pemilik. Dokumen ini mencatat implementasi yang sudah ada, batas kepercayaan, kontrak API, kegagalan yang diketahui, dan rencana teknis berikutnya.

**Riwayat versi**

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 9 Nov 2026 | Recurring, impor CSV, wawasan. |
| 1.1 | 10 Nov 2026 | Digest, dompet, laporan. |
| 1.2 | 10 Nov 2026 | AI Pro, keluarga, keamanan. |
| 1.3 | 10 Nov 2026 | Email, kalender, Sheets, meter. |
| 1.4 | 11 Nov 2026 | Perbaiki heading, status keluarga, tambah arsitektur, aktor, kontrak API, data, flow, NFR, threat model, failure mode, verifikasi, traceability per FR, keputusan terbuka, glosarium. |
| 1.5 | 11 Nov 2026 | Implementasi `PATCH /api/transactions`, filter pos/dompet, audit perubahan, dan test ledger. |
| 1.6 | 11 Nov 2026 | Implementasi tag transaksi (schema v10) dan rekap 24 bulan. |

**Konvensi status**

- **Selesai:** kode dan jalur UI/API tersedia.
- **Sebagian:** jalur utama ada, tetapi ada batas yang harus disebutkan.
- **Belum:** belum ada implementasi.
- **Ditangguhkan:** kode/skema ada, akses sengaja dimatikan.
- **Di luar lingkup:** tidak dikerjakan pada tahap ini.

## 1. Ruang lingkup implementasi saat ini

Sudah diimplementasikan:

- `WawasanData` dan tab Wawasan.
- `recurring_rules`, `recurring_runs`, worker transaksi berulang.
- API `/api/recurring`.
- Impor CSV melalui `/api/import`.
- Digest WhatsApp mingguan dan peringatan proaktif melalui cron/outbox.
- Multi-dompet: tabel `accounts`, saldo per dompet, transfer, net worth.
- Laporan lanjutan: periode kustom, cetak/simpan PDF, laporan terjadwal ke WhatsApp/email.
- AI Pro: review bulanan otomatis, tanya jawab seluruh riwayat di web dan WhatsApp (`tanya <pertanyaan>`), deteksi anomali.
- Keamanan: 2FA TOTP, manajemen sesi, ekspor terenkripsi.
- Integrasi email bank/e-wallet: deteksi penyedia, dompet sumber, dan pos otomatis.
- Integrasi kalender `.ics` dan sinkron Google Sheets via OAuth langsung.
- Peringatan dalam aplikasi.
- Skema versi v10 (`workspace_members`, nomor WhatsApp anggota, kolom 2FA, `google_sheets`, `email_links`, `transactions.tags`).

**Ditangguhkan:** kolaborasi keluarga. Tabel `workspace_members`, model peran, dan `tolakPeran` masih ada, tetapi `GET/POST /api/keluarga` mengembalikan `410` dan `pemilikRequest` selalu memakai `userId = actorId`. Jangan menganggap fitur ini aktif sampai isolasi workspace disetujui.

**Belum ada:** template, lampiran struk tersimpan, multi-mata uang, audit UI, recovery 2FA, backup/restore satu klik, API/webhook publik, laporan laba rugi formal, simulasi skenario, aturan auto-kategorisasi buatan pengguna, Telegram, white-label PDF, PIN/biometrik.

### 1.1 Aktor dan matriks akses

| Aksi | Owner | Admin | Member | Viewer | Publik |
|---|---|---|---|---|---|
| Lihat data sendiri | Ya | Ya | Ya | Ya | Tidak |
| Catat transaksi | Ya | Ya | Ajukan | Tidak | Tidak |
| Ubah pengaturan/anggota | Ya | Ya | Tidak | Tidak | Tidak |
| Setujui pengajuan | Ya | Ya | Tidak | Tidak | Tidak |
| Impor CSV/recurring | Ya | Ya | Tidak | Tidak | Tidak |
| Hubungkan Sheets/kalender | Ya | Ya | Tidak | Tidak | Tidak |
| Unduh ekspor | Ya | Ya | Tidak | Tidak | Tidak |
| Baca feed kalender bertoken | Ya | Ya | Ya | Ya | Token saja |
| Webhook email/Sheets | Sistem | Sistem | Sistem | Sistem | Secret saja |
| Cron | Sistem | Sistem | Sistem | Sistem | Secret saja |

**Catatan:** pada kode saat ini `pemilikRequest` selalu mengembalikan `role: "owner"` dan `userId = actorId`; matriks peran adalah target, bukan perilaku API keluarga yang aktif. API `/api/keluarga` mengembalikan `410`.

### 1.2 Batas kepercayaan

| Zona | Isi | Aturan |
|---|---|---|
| Client | Browser, cookie sesi | Tidak dipercaya; semua validasi di server |
| Aplikasi | Route handler, model, worker | Sesi + `user_id` dari sesi; `user_id` body ditolak/diabaikan |
| Database | Neon Postgres | Kredensial server; query selalu ber-scope pemilik |
| WhatsApp | Meta webhook | Verifikasi signature/verify token; nomor milik pemilik |
| Email inbound | Forwarder bank/e-wallet | `EMAIL_INBOUND_SECRET` + allowlist pengirim |
| Google | OAuth/Sheets/Calendar | Scope minimal `drive.file`; token dienkripsi |
| AI | Groq | Opt-in; konteks agregat; tanpa data mentah berlebihan |
| Cron | Scheduler eksternal | `CRON_SECRET`; idempoten; tidak menerima input pengguna |

### 1.3 Komponen

- **Web:** Next.js app router, dashboard, form, tab.
- **API:** route handler per domain, envelope `{ok,data|error}`.
- **Domain modules:** `finance`, `accounts`, `recurring`, `importcsv`, `digest`, `laporan`, `insight`, `keluarga`, `kalender`, `sheets`, `email`, `profile`.
- **Worker:** satu endpoint cron menjalankan inbound → recurring → digest → laporan → review AI → Sheets → outbox.
- **Storage:** Neon Postgres; `config` untuk status kecil; `audit_events` untuk jejak aksi.
- **Integrasi keluar:** Meta WhatsApp, Resend/email, Groq, Google Sheets/OAuth, Apps Script webhook.

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
  - Perintah WhatsApp `tanya <pertanyaan>` memakai `InsightClient` yang sama, memvalidasi 3–400 karakter, menghormati `ai_aktif`, dan dibatasi 20 pertanyaan/jam per nomor.
  - `deteksiAnomali(state, hariIni)` mendeteksi lonjakan bulanan/kategori dan transaksi besar.
- `src/modules/insight/model.ts`
  - `tanyaInsight` memakai konteks dashboard + seluruh riwayat.
  - `prosesReviewBulanan(hariIni)` membuat review AI bulan lalu dan mengirim ke outbox.
- Status disimpan di `config`: `ai_review_aktif`, `ai_review_terakhir`.
- Cron `/api/cron/outbox` memanggil review bulanan setelah laporan terjadwal.
- UI: toggle review di tab Asisten; anomali tampil di tab Wawasan.

### 2.8 Kolaborasi keluarga (ditangguhkan)

- Tabel `workspace_members(owner_id, member_id, role, status, wa_number)` masih ada.
- Model peran, `pending_actions` jenis `persetujuan_transaksi`, dan UI `tab-keluarga.tsx` masih ada, tetapi tidak dapat dipakai lewat API.
- `pemilikRequest` **tidak** memetakan anggota ke pemilik; selalu `userId = actorId` dan `role = "owner"`.
- `GET/POST /api/keluarga` mengembalikan `410` dengan pesan bahwa berbagi data lintas akun dinonaktifkan.
- Nomor WhatsApp anggota tidak dipetakan ke workspace pemilik.
- Aktivasi kembali memerlukan isolasi workspace, audit akses, persetujuan anggota, dan uji AC-KEL target.

### 2.9 Keamanan dan sesi

- `src/lib/totp.ts`: base32, `kodeTotp`, `verifikasiTotp`, dan `otpauthUri`.
- Kolom `auth_users.totp_secret` dan `auth_users.totp_aktif` (skema v6); tabel `google_sheets` (skema v7).
- `src/modules/profile/model.ts`: `mulai2fa`, `aktifkan2fa`, `matikan2fa`; mematikan 2FA wajib password.
- Login `masuk` mengembalikan status `2fa`; UI login menampilkan kolom kode 6 digit.
- `/api/auth/sessions`: daftar sesi aktif milik sendiri (tanpa mengirim ID sesi saat ini ke client) dan cabut sesi lain.
- `src/lib/export-enkripsi.ts`: AES-256-GCM + scrypt; `/api/export/encrypted` mengunduh CSV terenkripsi.
- UI: bagian 2FA, perangkat/sesi, dan ekspor terenkripsi di tab Profil.

### 2.10 Impor email bank/e-wallet

- `src/lib/email.ts`
  - `deteksiPenyediaEmail(dari, subjek, teks)` mengenali bank/e-wallet dari domain pengirim atau teks.
  - `ekstrakDompetEmail(teks)` mengambil petunjuk rekening/dompet sumber tanpa menipu frasa "Rekening Anda".
  - `ekstrakDetailEmail` menambahkan `dompet`, `metode`, dan `status` ke detail transaksi.
- `src/lib/parse/dompet.ts`: `cocokAkun(accounts, hints)` mencocokkan penyedia/dompet ke dompet aktif; hanya cocok tunggal yang dipakai.
- `src/modules/email/model.ts` memuat state, memetakan dompet sumber dan pos (nama/alias), lalu mencatat transaksi.
- Input webhook menerima `dompet`/`wallet` dan `penyedia`/`provider` opsional.
- Tidak ada tabel baru; idempotensi tetap memakai `email:<id>`.

### 2.11 Kalender dan Google Sheets

- `src/lib/ics.ts`: pembuat `.ics` (RFC 5545) untuk event all-day, escape teks, lipat baris, dan alarm.
- `src/modules/kalender/`: `/api/kalender` mengunduh tagihan berulang, jatuh tempo utang/piutang, dan target tabungan 6 bulan ke depan.
- Kalender langganan: `GET /api/kalender?token=...` memakai token feed (`config.kalender_token`, 32 byte base64url); `POST /api/kalender` mengembalikan URL langganan untuk pemilik yang login. Token dibuat sekali dan dipakai ulang.
- `src/lib/google-sheets.ts`: refresh access token, buat spreadsheet baru, dan tulis ulang sheet `Transaksi`.
- `src/lib/google-token.ts`: enkripsi AES-256-GCM refresh token Google sebelum disimpan.
- `src/modules/sheets/`: `/api/sheets` untuk status, sinkron manual, dan putus koneksi; `/api/sheets/oauth/start` meminta scope `drive.file` lewat callback OAuth Google yang sudah ada.
- Tabel `google_sheets` menyimpan refresh token terenkripsi, `spreadsheet_id`, `spreadsheet_url`, dan email Google.
- `src/lib/sheets.ts`: `bangunBarisSheets` (header + transaksi kronologis) dan `validasiUrlSheets` untuk cadangan web app Apps Script.
- Sinkron otomatis: `prosesSinkronSheets(hariIni)` dipanggil cron `/api/cron/outbox` setelah review bulanan; `sudahSinkronHariIni(terakhir, hariIni)` membatasi maksimal sekali per hari WIB.
- Pemantauan cron: cron sukses mencatat `config.cron_terakhir` (global, `user_id` NULL); `/api/health` menampilkan `database.cronTerakhir` dan menambah peringatan via `cronBasi` bila belum pernah jalan atau >26 jam.
- Meter pemakaian: `src/lib/usage.ts` menambah counter `config` global `usage:<YYYY-MM>:<jenis>` (`ai_parse`, `ai_vision`, `ai_insight`) tiap panggilan AI; `pemakaianBulanIni` merangkum counter + hitungan `inbound_messages`/`outbox` bulan berjalan (WIB). Hanya jumlah, tanpa isi pesan/PII; tampil di `/api/health` (butuh `HEALTH_TOKEN`).
- `scripts/google-sheets.gs`: cadangan web app Apps Script yang menulis ke sheet `Transaksi`; mendukung `SHEETS_WEBHOOK_SECRET` opsional.
- Status disimpan di `config` (`sheets_url`, `sheets_terakhir`, `kalender_token`) dan tabel `google_sheets`.
- UI: tombol unduh `.ics` dan salin URL langganan di tab Transaksi otomatis; hubungkan/sinkron/putus Google Sheets di tab Laporan.

### 2.12 Kontrak API

Semua endpoint kecuali yang ditandai publik memakai cookie sesi `mc_auth`. Envelope sukses `{ ok: true, data?, pesan? }`; error `{ ok: false, error }`. `Cache-Control: no-store` untuk data sensitif.

| Endpoint | Metode | Auth | Input | Output/efek | Error |
|---|---|---|---|---|---|
| `/api/dashboard` | GET | Sesi | — | State dashboard | 401, 500 |
| `/api/transactions` | POST | Sesi + tulis | `tipe,nominal,tanggal,label,tags,accountId,subPostId,wadah,...` | Transaksi baru | 400, 401, 403 |
| `/api/transactions` | PATCH | Sesi + tulis | `{id,tanggal,nominal,label,tags,accountId,subPostId,biayaAdmin}` | Ubah pemasukan/pengeluaran; rechaining ledger | 400, 401, 403, 404 |
| `/api/transactions` | DELETE | Sesi + kelola | `{id}` | Pembatalan transaksi | 400, 401, 403, 404 |
| `/api/accounts` | POST | Sesi + kelola | `aksi:tambah|pindah` | Dompet/transfer | 400, 401, 403 |
| `/api/recurring` | POST | Sesi + kelola | `aksi:tambah|status|hapus` | Aturan berubah | 400, 401, 403 |
| `/api/import` | POST | Sesi + kelola | `{csv}` maks 2 MB | `{berhasil,gagal,duplikat}` | 400, 401, 403 |
| `/api/laporan` | GET | Sesi | `dari,sampai` | Ringkasan laporan | 400, 401 |
| `/api/insight` | POST | Sesi | `{pertanyaan}` | `{jawaban}` | 400, 401, 429 |
| `/api/kalender` | GET | Sesi atau `?token=` | — | `text/calendar` | 401 |
| `/api/kalender` | POST | Sesi | — | `{url}` feed | 401 |
| `/api/sheets` | GET | Sesi | — | Status koneksi | 401 |
| `/api/sheets` | POST | Sesi + kelola | `aksi:simpan|sinkron|putus` | Status/sinkron | 400, 401, 403 |
| `/api/sheets/oauth/start` | GET | Sesi | — | Redirect OAuth `drive.file` | 401, 503 |
| `/api/keluarga` | GET/POST | Sesi | — | **410 ditangguhkan** | 410 |
| `/api/profile/2fa` | GET/POST | Sesi | `aksi:mulai|aktifkan|matikan` | Status 2FA/secret | 400, 401 |
| `/api/auth/sessions` | GET/DELETE | Sesi | `id?` | Daftar/cabut sesi | 401 |
| `/api/export` | GET | Sesi + token sekali pakai | `t` | CSV unduhan | 404 |
| `/api/export/encrypted` | POST | Sesi | `{password}` min 8 | Berkas terenkripsi | 400, 401 |
| `/api/health` | GET | `HEALTH_TOKEN` opsional | — | Status ringkas/detail | 401 |
| `/api/email/inbound` | POST | `X-Email-Secret` | Payload email | Transaksi/idempoten | 401, 400 |
| `/api/cron/outbox` | POST | `Bearer CRON_SECRET` | — | Ringkasan worker | 401, 503 |

**Aturan kontrak:** `user_id` tidak pernah dibaca dari body; validasi domain di server; perubahan status mengembalikan data terbaru; endpoint tulis menolak `viewer`; endpoint publik hanya health ringkas, kalender bertoken, email inbound, dan cron.

### 2.13 Katalog data

| Tabel/objek | Kolom kunci | Constraint/index | Retensi |
|---|---|---|---|
| `transactions` | `id,user_id,tipe,nominal,tanggal,sub_post_id,account_id,tags,detail,status` | FK user/pos/dompet; status `berlaku|batal`; GIN tags; hash ledger | Selama akun aktif |
| `accounts` | `id,user_id,nama,tipe,saldo_awal,urutan` | Unik `(user_id,lower(nama))`; index user | Selama akun aktif |
| `recurring_rules` | `id,user_id,nama,nominal,hari,mulai,aktif` | FK user/pos; hari 1–31 | Selama aturan ada |
| `recurring_runs` | `rule_id,periode,transaction_id` | PK `(rule_id,periode)` | Selama aturan ada |
| `workspace_members` | `owner_id,member_id,role,status,wa_number` | Unik `wa_number`; index owner/member | Ditangguhkan |
| `google_sheets` | `user_id,refresh_token_enc,spreadsheet_id,url,email` | PK `user_id` | Sampai diputus |
| `auth_users` | `id,email,password_hash,totp_secret,totp_aktif` | Unik email | Selama akun aktif |
| `auth_sessions` | `token_hash,user_id,expires_at` | Index token; 30 hari | Sampai kedaluwarsa/dicabut |
| `pending_actions` | `user_id,jenis,payload,status,kedaluwarsa` | Jenis approval; 7 hari | 7 hari |
| `inbound_messages` | `id,wa_number,pesan,diterima_pada` | Idempoten pesan | Sesuai operasi |
| `outbox` | `id,wa_number,pesan,status,percobaan,berikutnya_pada` | Index antre | 30 hari setelah selesai |
| `audit_events` | `id,aktor,aksi,detail,dibuat_pada` | Index waktu; detail whitelist | 180 hari |
| `config` | `user_id,kunci,nilai` | Unik `(user_id,kunci)`; global `user_id NULL` | Selama dibutuhkan |

### 2.14 Katalog config

| Kunci | Scope | Fungsi |
|---|---|---|
| `saldo_awal` | user | Saldo awal dompet utama |
| `digest_aktif`, `digest_minggu`, `digest_harian` | user | Toggle dan anti-duplikat digest |
| `laporan_aktif`, `laporan_jadwal`, `laporan_terakhir` | user | Laporan terjadwal |
| `ai_review_aktif`, `ai_review_terakhir` | user | Review AI bulanan |
| `ai_aktif` | user | Opt-in AI WhatsApp |
| `sheets_url`, `sheets_terakhir` | user | Webhook Apps Script dan status sinkron |
| `kalender_token` | user | Token feed `.ics` |
| `cron_terakhir` | global | Deteksi cron basi |
| `usage:<YYYY-MM>:<jenis>` | global | Meter AI per bulan |

### 2.15 Alur kritis teknis

1. **Recurring:** cron → ambil aturan aktif (`FOR UPDATE SKIP LOCKED` bila perlu) → hitung `jatuhTempo` → insert `recurring_runs` (`ON CONFLICT` diam) → insert transaksi → update `terakhir_jalan`. Jika insert transaksi gagal, reservasi run dihapus.
2. **Impor CSV:** validasi header → parse baris → normalisasi tanggal/nominal → cocokkan pos/alias/dompet → cek `detail.importHash` → insert; kumpulkan error per baris.
3. **Digest/laporan/AI:** worker membangun data → cek kunci periode di `config` → insert `outbox`/email → tandai terkirim; tidak mengirim langsung.
4. **Sheets OAuth:** start OAuth → callback menukar code → enkripsi refresh token → buat/pakai spreadsheet → sinkron awal → simpan status. Sinkron harian hanya sekali per hari WIB.
5. **Email inbound:** verifikasi secret → batasi pengirim → parse → cek `email:<id>` → catat transaksi → audit. Isi email tidak dipercaya untuk `user_id`.
6. **Kalender:** buat event dari recurring, utang/piutang, target → escape RFC 5545 → lipat baris → sajikan `text/calendar`.
7. **2FA:** mulai → secret baru + URI → verifikasi kode 6 digit → aktifkan; login meminta kode bila aktif; matikan wajib password. **Recovery code belum ada.**

### 2.16 NFR dan observability

| Area | Target | Implementasi |
|---|---|---|
| Latensi dashboard | p95 <2 dtk (10k tx) | Query ber-index; `no-store` |
| Laporan | <5 dtk untuk 3 tahun | Batas rentang |
| Impor | <60 dtk untuk 1000 baris | Batas 2 MB; validasi per baris |
| Cron | <30 dtk per fungsi | `maxDuration=30`; pekerjaan per domain di-try/catch |
| Idempotensi | 0 duplikat | PK run, hash impor, kunci periode, `email:<id>` |
| Observability | Health + log terstruktur | `cronTerakhir`, meter pemakaian, error per domain |
| Alert | Cron >26 jam, error berulang | `/api/health` + log |
| Keamanan | Tanpa secret/PII di log | Masking nomor; whitelist audit |
| Aksesibilitas | WCAG 2.1 AA | Kontras, keyboard, label, fokus |
| Kompatibilitas | Browser modern, mobile 360px, cetak | CSS responsif + print |

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

### FR-AI — AI Pro

- **FR-AI-01 MUST:** tanya jawab memakai agregat seluruh riwayat, bukan hanya transaksi terbaru.
- **FR-AI-02 MUST:** deteksi anomali hanya tampilan/insight; tidak membuat mutasi.
- **FR-AI-03 MUST:** review bulanan opt-in dan maksimal sekali per bulan.
- **FR-AI-04 MUST:** review bulanan dikirim melalui outbox, bukan langsung.
- **FR-AI-05 MUST:** tanpa `GROQ_API_KEY`, fitur AI dilewati tanpa menggagalkan cron.
- **FR-AI-06 MUST:** perintah WhatsApp `tanya <pertanyaan>` menjawab dari agregat dashboard dan konteks riwayat yang sama dengan web; tidak mengubah transaksi.
- **FR-AI-07 MUST:** perintah `tanya` hanya mengirim data ke provider saat `ai_aktif`; saat nonaktif ditolak sebelum panggilan AI.
- **FR-AI-08 MUST:** pertanyaan mengikuti validasi panjang 3–400 karakter dan dibatasi 20 panggilan per jam per nomor WhatsApp.
- **FR-AI-09 MUST:** tanpa klien AI, bot memberi pesan konfigurasi yang jelas dan transaksi tetap dapat dicatat dengan perintah biasa.

### FR-WS — Wawasan dan peringatan

- **FR-WS-01 MUST:** skor 0–100 dengan label.
- **FR-WS-02 MUST:** proyeksi bulanan dihitung dari pengeluaran bulan berjalan dibagi hari berjalan.
- **FR-WS-03 MUST:** peringatan anggaran muncul saat rasio ≥80%.
- **FR-WS-04 MUST:** peringatan proyeksi saldo negatif, saldo habis <7 hari, dan tagihan ≤7 hari.
- **FR-WS-05 MUST:** deteksi langganan hanya tampilan; tidak membuat mutasi.
- **FR-WS-06 SHOULD:** algoritma langganan memakai minimal 2 bulan, nominal stabil ±15%, maksimal 2 transaksi/bulan.

### FR-LAP — Laporan lanjutan

- **FR-LAP-01 MUST:** laporan menerima periode kustom `dari`/`sampai` dan menolak tanggal terbalik atau masa depan.
- **FR-LAP-02 MUST:** ringkasan memisahkan pemasukan, pengeluaran, biaya admin, arus bersih, dan rata-rata harian.
- **FR-LAP-03 MUST:** transaksi batal dan transaksi turunan tidak dihitung.
- **FR-LAP-04 MUST:** kategori pengeluaran memakai pos, lalu label, lalu “(Tanpa pos)”.
- **FR-LAP-05 MUST:** laporan dapat dicetak atau disimpan sebagai PDF dari browser.
- **FR-LAP-06 MUST:** laporan terjadwal membuat baris `outbox`, bukan mengirim langsung.
- **FR-LAP-07 MUST:** laporan terjadwal maksimal sekali per kunci periode (minggu ISO/bulan).
- **FR-LAP-08 MUST:** laporan terjadwal opt-in dan hanya dikirim ke nomor pemilik serta email akun.
- **FR-LAP-09 SHOULD:** rentang laporan dibatasi maksimal 3 tahun.

### FR-KEL - Kolaborasi keluarga (target P2, ditangguhkan)

- **FR-KEL-00 MUST:** selama ditangguhkan, API mengembalikan `410` dan tidak ada data lintas akun yang dapat diakses.
- **FR-KEL-01 MUST (P2):** anggota diidentifikasi lewat email akun terdaftar; pemilik tidak bisa ditambahkan sebagai anggota.
- **FR-KEL-02 MUST (P2):** peran `admin`, `member`, dan `viewer`; hanya pemilik/admin yang boleh mengelola anggota dan pengaturan.
- **FR-KEL-03 MUST (P2):** `viewer` tidak boleh menulis; `member` mengajukan transaksi, bukan langsung mencatat.
- **FR-KEL-04 MUST (P2):** pengajuan disimpan di `pending_actions` jenis `persetujuan_transaksi` dan kedaluwarsa setelah 7 hari.
- **FR-KEL-05 MUST (P2):** persetujuan mencatat transaksi ke data pemilik dan tidak memproses pengajuan yang sama dua kali.
- **FR-KEL-06 MUST (P2):** anggota memakai data pemilik sehingga anggaran dan dompet otomatis bersama.
- **FR-KEL-07 MUST (P2):** nomor WhatsApp anggota opsional, unik, dan dipetakan ke pemilik workspace saat pesan masuk.
- **FR-KEL-08 SHOULD (P2):** menghapus anggota membatalkan pengajuan yang masih menunggu.

### FR-SEC - Keamanan akun

- **FR-SEC-01 MUST:** 2FA memakai TOTP dan hanya aktif setelah kode 6 digit dari secret baru diverifikasi.
- **FR-SEC-02 MUST:** akun dengan 2FA aktif wajib mengirim kode yang valid saat login.
- **FR-SEC-03 MUST:** mematikan 2FA wajib password; memulai 2FA baru saat masih aktif ditolak.
- **FR-SEC-04 MUST:** daftar sesi hanya menampilkan sesi milik akun sendiri dan pencabutan dibatasi `user_id` tersebut.
- **FR-SEC-05 MUST:** ekspor terenkripsi memakai AES-256-GCM dengan kunci turunan scrypt dan password minimal 8 karakter.
- **FR-SEC-06 SHOULD:** pencabutan sesi dicatat di audit tanpa menyimpan token.

### FR-EML - Impor email bank/e-wallet

- **FR-EML-01 MUST:** deteksi penyedia dari domain pengirim lebih diutamakan daripada teks.
- **FR-EML-02 MUST:** kata umum seperti "dana masuk" tidak boleh disalahartikan sebagai e-wallet DANA.
- **FR-EML-03 MUST:** dompet sumber hanya dipakai bila cocok tunggal dengan dompet aktif; jika ambigu, pakai dompet bawaan.
- **FR-EML-04 MUST:** pos hanya dipetakan bila nama/alias pos cocok tunggal dengan merchant/jenis transaksi/label.
- **FR-EML-05 MUST:** email tetap idempoten per `id` dan tidak membuat transaksi ganda.
- **FR-EML-06 SHOULD:** detail transaksi menyimpan penyedia, dompet, metode, dan status dari email.

### FR-INT - Kalender dan Google Sheets

- **FR-INT-01 MUST:** `/api/kalender` hanya dapat diakses pemilik yang login dan mengembalikan `text/calendar`.
- **FR-INT-02 MUST:** event kalender mencakup tagihan berulang aktif, jatuh tempo utang/piutang aktif, dan target tabungan aktif dalam 6 bulan.
- **FR-INT-03 MUST:** teks event di-escape dan baris panjang dilipat sesuai RFC 5545.
- **FR-INT-04 MUST:** koneksi Google Sheets langsung memakai OAuth scope `drive.file` dan redirect URI callback Google yang sudah ada; URL webhook cadangan hanya menerima `https://script.google.com/macros/s/.../exec`.
- **FR-INT-05 MUST:** sinkron Google Sheets mengirim salinan penuh transaksi dan tidak mengubah data lokal.
- **FR-INT-06 MUST:** refresh token Google disimpan terenkripsi AES-256-GCM; token tidak pernah dikirim ke client atau log.
- **FR-INT-07 MUST:** feed kalender bertoken hanya valid untuk token yang tersimpan di `config.kalender_token`; token salah mendapat 401.
- **FR-INT-08 MUST:** URL langganan hanya dapat diminta pemilik yang login; token tidak pernah dicatat di log.
- **FR-INT-09 MUST:** sinkron Google Sheets otomatis berjalan maksimal sekali per hari WIB per pengguna dan dilewati bila belum ada koneksi Google maupun URL webhook.
- **FR-INT-10 SHOULD:** kegagalan sinkron otomatis satu pengguna tidak menghentikan pengguna lain dan tidak menggagalkan cron.
- **FR-INT-11 MUST:** cron sukses mencatat `cron_terakhir`; health memperingatkan bila cron belum pernah jalan atau terakhir >26 jam.
- **FR-INT-12 MUST:** meter pemakaian hanya menyimpan jumlah per bulan per jenis; tidak ada isi pesan, nominal, atau nomor telepon.
- **FR-INT-13 MUST:** kegagalan mencatat/membaca meter tidak menggagalkan fitur AI maupun health.

### FR-CAP — Kapasitas dan entitlement (P2/P3)

- **FR-CAP-01 MUST (P3):** entitlement disimpan di server, bukan hanya UI; setiap endpoint premium memeriksa hak akses.
- **FR-CAP-02 MUST (P3):** paket gratis tetap dapat mencatat transaksi, membuat pos, dan melihat ringkasan tanpa gangguan.
- **FR-CAP-03 SHOULD (P3):** kuota dompet/kategori/anggaran/target, riwayat, lampiran, recurring, dan AI dapat dikonfigurasi per paket.
- **FR-CAP-04 MUST:** selama tanpa paywall, tidak ada batas buatan yang menghalangi pemakaian pribadi.

### FR-ANL — Analisis lanjutan (P2)

- **FR-ANL-01 SHOULD:** laporan laba rugi dan arus kas memisahkan pemasukan, pengeluaran, biaya admin, arus bersih, dan saldo awal/akhir.
- **FR-ANL-02 SHOULD:** laporan kustom dapat memfilter periode, pos, dan dompet.
- **FR-ANL-03 SHOULD (selesai):** tren multi-tahun memakai agregat bulanan; UI rekap 6/12/24 bulan tanpa memuat transaksi mentah.
- **FR-ANL-04 SHOULD:** rasio utang dihitung dari utang aktif dibagi pemasukan periode, dengan label dan rumus transparan.
- **FR-ANL-05 SHOULD:** simulasi skenario hanya mengubah tampilan; tidak membuat mutasi.
- **FR-ANL-06 MUST:** semua angka analisis dapat ditelusuri ke transaksi/sumber.

### FR-AUTO — Otomatisasi lanjutan (P2)

- **FR-AUTO-01 SHOULD:** pengguna dapat membuat aturan auto-kategorisasi (kata kunci/merchant → pos) dan melihat dampaknya sebelum menyimpan.
- **FR-AUTO-02 SHOULD:** impor mutasi otomatis dari email tetap idempoten dan tidak menebak nominal.
- **FR-AUTO-03 SHOULD:** adapter Telegram memakai pipeline transaksi yang sama; tidak menduplikasi logika.
- **FR-AUTO-04 SHOULD:** OCR web menyimpan lampiran secara aman atau tidak menyimpan sama sekali; tidak pernah menebak nominal.
- **FR-AUTO-05 MUST:** otomatisasi gagal tidak menggagalkan pencatatan manual.

### FR-COL — Kolaborasi dan approval (P2, ditangguhkan)

- **FR-COL-01 MUST:** fitur keluarga hanya diaktifkan setelah isolasi workspace, audit akses, dan persetujuan anggota disetujui.
- **FR-COL-02 MUST:** peran `admin/member/viewer` divalidasi di server; `viewer` tidak dapat menulis.
- **FR-COL-03 MUST:** approval memakai klaim atomik agar klik ganda tidak membuat transaksi ganda.
- **FR-COL-04 SHOULD:** ambang nominal approval dapat diatur per workspace.
- **FR-COL-05 SHOULD:** akses akuntan eksternal bersifat hanya lihat, berbatas waktu, dan dapat dicabut.

### FR-INT2 — Integrasi dan ekspor lanjutan (P2/P3)

- **FR-INT2-01 SHOULD:** ekspor ke format software akuntansi memakai pemetaan yang terdokumentasi.
- **FR-INT2-02 SHOULD (P3):** API publik memakai API key/scope, rate limit, audit, dan dokumentasi.
- **FR-INT2-03 SHOULD:** webhook publik menandatangani payload, idempoten, dan tahan replay.
- **FR-INT2-04 SHOULD:** PDF white-label memakai logo/identitas usaha tanpa mengubah data.

### FR-SEC2 — Keamanan dan pemulihan lanjutan (P2)

- **FR-SEC2-01 MUST:** 2FA menyediakan recovery code sekali pakai sebelum dapat diwajibkan.
- **FR-SEC2-02 SHOULD:** PIN/biometrik hanya menjadi faktor tambahan, bukan pengganti password tanpa pemulihan.
- **FR-SEC2-03 SHOULD:** backup terjadwal dan restore satu klik diuji; restore tidak menimpa data tanpa konfirmasi.
- **FR-SEC2-04 SHOULD:** audit UI dapat mencari aksi sensitif; audit tetap tanpa token/PII.
- **FR-SEC2-05 MUST:** ekspor seluruh data mencakup transaksi, pos, dompet, anggaran, target, utang, dan pengaturan aman.
- **FR-SEC2-06 MUST:** rotasi secret tidak memutus data lama tanpa prosedur migrasi.

### FR-UX — Koreksi dan kemudahan input (P2)

- **FR-UX-01 MUST (selesai):** transaksi `out`/`in` yang masih berlaku dapat diubah; tipe transaksi tidak dapat diubah.
- **FR-UX-02 MUST (selesai):** perubahan nominal, tanggal, catatan, dompet, pos (out), dan biaya admin (out) divalidasi di server.
- **FR-UX-03 MUST (selesai):** transaksi batal, turunan, `gaji`, `bonus`, `tarik`, atau `pindah` tidak dapat diubah lewat endpoint ini.
- **FR-UX-04 MUST (selesai):** update hanya menyentuh transaksi dengan `id` dan `user_id` sesi; ledger hash dihitung ulang dalam transaksi DB.
- **FR-UX-05 MUST (selesai):** riwayat dapat difilter per bulan, pos, dompet, dan kata kunci; filter tidak mengubah data.
- **FR-UX-06 MUST (selesai):** filter menerima `semua`, `tanpa pos`, atau ID pos/dompet aktif.
- **FR-UX-07 SHOULD (selesai):** audit mencatat ID, nominal, dan tanggal tanpa label/catatan transaksi.
- **FR-UX-08 SHOULD:** dashboard kustom tidak boleh menyembunyikan peringatan keamanan/finansial wajib.

### FR-TAG — Fitur berikutnya (P2)

- **FR-TAG-01 SHOULD (selesai):** tag transaksi bebas, dinormalisasi, disimpan di `transactions.tags`, difilter, dan diekspor CSV.
- **FR-TAG-02 SHOULD:** template menyimpan field transaksi yang sering dipakai tanpa menyimpan nominal terakhir diam-diam.
- **FR-TAG-03 SHOULD:** lampiran struk divalidasi ukuran/tipe dan dihapus bersama transaksi.
- **FR-TAG-04 SHOULD:** multi-mata uang menyimpan mata uang asal, kurs, nilai dasar IDR, dan aturan pembulatan.

## 4. Keamanan dan integritas

- Semua API recurring/import/accounts/laporan memakai `pemilikRequest`.
- `user_id` aturan berasal dari sesi, bukan body.
- Query aturan/CSV dibatasi `user_id` pemilik.
- Tidak ada token/password di log.
- `recurring_runs` mencegah duplikasi; jika insert transaksi gagal, reservasi run dihapus.
- Impor tidak menghapus atau menimpa transaksi lama.
- API keluarga **ditangguhkan**: `GET/POST /api/keluarga` mengembalikan `410`; `pemilikRequest` selalu memakai data akun sendiri dan tidak memetakan anggota ke pemilik.
- Model peran dan `tolakPeran` tetap diuji sebagai unit, tetapi belum menjadi jalur akses produksi.
- Bila keluarga diaktifkan kembali: persetujuan wajib diklaim atomik (`status='diproses'`), nomor WhatsApp anggota unik, dan nomor dicabut saat anggota dihapus.
- Secret TOTP dan hash token sesi tidak pernah dikirim ke log; daftar sesi tidak mengirim hash token sesi saat ini ke client.
- Ekspor terenkripsi memakai salt dan IV acak per berkas; password tidak disimpan.
- Webhook email tetap memakai `EMAIL_INBOUND_SECRET` dan `EMAIL_ALLOWED_SENDERS`; isi email tidak dipercaya untuk `user_id`.
- URL webhook Google Sheets dibatasi ke `script.google.com` agar server tidak bisa diarahkan ke host sembarang; rahasia webhook tidak disimpan di log.
- Koneksi Google Sheets langsung memakai scope `drive.file`; refresh token dienkripsi AES-256-GCM dengan kunci dari `GOOGLE_TOKEN_ENCRYPTION_KEY` atau `GOOGLE_CLIENT_SECRET`, dan tidak pernah dikirim ke client/log.
- Token feed kalender 32 byte acak (base64url), hanya memberi akses baca `.ics`, dan dapat diganti dengan menghapus `config.kalender_token`.

### 4.1 Threat model

| Ancaman | Vektor | Kontrol saat ini | Gap |
|---|---|---|---|
| Akses data akun lain | IDOR/body `user_id` | `user_id` dari sesi; query ber-scope | Perlu uji negatif rutin |
| Sesi dicuri | XSS/cookie | HttpOnly, SameSite=Lax, Secure di produksi | Belum ada CSP ketat |
| 2FA dikalahkan | Phishing/replay | TOTP 6 digit; verifikasi server | Belum ada recovery code; belum ada anti-replay eksplisit |
| OAuth CSRF | Callback Google | State OAuth | Perlu verifikasi state di callback |
| Token Google bocor | DB/log | AES-256-GCM; tidak dikirim ke client | Rotasi kunci belum terdokumentasi |
| Webhook email palsu | Request langsung | Secret + allowlist pengirim | Perlu rate limit/replay window |
| Cron dipicu pihak lain | Endpoint publik | Bearer `CRON_SECRET` | Perlu rotasi dan log akses |
| Kalender token bocor | URL dibagikan | Hanya baca `.ics`; bisa diganti | Tidak ada masa berlaku |
| AI membocorkan data | Prompt berisi PII | Opt-in, konteks agregat | Perlu audit isi prompt |
| Excel/CSV injection | Label pengguna | Escape formula di CSV/Sheets | Perlu uji semua ekspor |
| Kehilangan data | Hapus/migrasi | Backup Neon + ekspor | Restore satu klik belum |
| Anggota keluarga salah akses | Workspace | Fitur dimatikan | Perlu isolasi + audit |

### 4.2 Katalog audit

| Aksi | Aktor | Status |
|---|---|---|
| `login_berhasil`, `login_gagal`, `logout`, `sesi_dicabut` | web/IP | Selesai |
| `reset_password_diminta`, `reset_password_berhasil` | web/IP | Selesai |
| `transaksi_ditambah`, `transaksi_diubah`, `transaksi_dibatalkan` | web | Selesai |
| `dompet_ditambah`, `dompet_dipindah` | web | Selesai |
| `rencana_diubah`, `gaji_pokok_diubah`, `digest_diubah`, `ai_review_diubah`, `laporan_diubah` | web | Selesai |
| `email_diproses` | email | Selesai |
| `pesan_diproses` | WhatsApp | Selesai |
| `recurring_ditambah/diubah/dihapus` | web | **Belum** |
| `impor_csv` | web | **Belum** |
| `sheets_dihubungkan/diputus/disinkron` | web | **Belum** |
| `kalender_token_dibuat` | web | **Belum** |
| `2fa_diaktifkan/dimatikan` | web | **Belum** |
| `ekspor_dibuat` | web | **Belum** |

### 4.3 Retensi dan penghapusan

| Data | Retensi | Mekanisme |
|---|---|---|
| Transaksi | Selama akun aktif | Hapus akun; pembatalan menyimpan status |
| Audit | 180 hari | Cron outbox |
| Outbox selesai/gagal | 30 hari | Cron outbox |
| `pending_actions` | 7 hari | Kedaluwarsa |
| Inbound/email mentah | Tidak diarsipkan | Hanya diproses |
| Google token | Sampai diputus | Hapus baris `google_sheets` |
| Kalender token | Sampai diganti | Hapus `config.kalender_token` |
| Ekspor terenkripsi | Tidak disimpan server | Unduhan langsung |
| Lampiran (belum ada) | Belum ditentukan | Wajib diputuskan sebelum implementasi |

## 5. Migrasi

- Skema v2 menambahkan `recurring_rules` dan `recurring_runs`.
- Skema v3 menambahkan `accounts` dan kolom dompet pada `transactions`.
- Skema v4 menambahkan `workspace_members` untuk kolaborasi keluarga.
- Skema v5 menambahkan `workspace_members.wa_number` dan indeks uniknya.
- Skema v6 menambahkan `auth_users.totp_secret` dan `auth_users.totp_aktif`.
- Skema v7 menambahkan `google_sheets` (refresh token Google terenkripsi, spreadsheet, email).
- Skema v8 menambahkan isolasi transaksi per akun dan rantai hash.
- Skema v9 menambahkan `email_links` untuk Apps Script Gmail.
- Skema v10 menambahkan `transactions.tags` dan index GIN.
- Jalankan `npm run db:setup` untuk menerapkan skema idempoten dan dompet utama.
- Sebelum migrasi berisiko, buat snapshot Neon.
- Marker versi dicatat di `schema_version`.
- Digest tidak menambah tabel; status kirim disimpan di `config`.
- Laporan lanjutan tidak menambah tabel; status dikirim disimpan di `config` (`laporan_aktif`, `laporan_jadwal`, `laporan_terakhir`).
- Impor email tidak menambah tabel; idempotensi memakai `email:<id>` di `pending_actions`.
- Kalender tidak menambah tabel; token feed dan status disimpan di `config` (`sheets_url`, `sheets_terakhir`, `kalender_token`).
- Google Sheets langsung menambah tabel `google_sheets` (skema v7); mode webhook tetap memakai `config.sheets_url`.

### 5.1 Riwayat skema

| Versi | Perubahan | Kompatibilitas |
|---|---|---|
| v1 | Baseline | Data lama menjadi milik akun pertama |
| v2 | `recurring_rules`, `recurring_runs` | Aditif |
| v3 | `accounts`, kolom dompet di `transactions` | Aditif; dompet utama dibuat untuk akun lama |
| v4 | `workspace_members` | Aditif; fitur ditangguhkan |
| v5 | `workspace_members.wa_number` + unique index | Aditif; fitur ditangguhkan |
| v6 | `auth_users.totp_secret`, `totp_aktif` | Aditif |
| v7 | `google_sheets` | Aditif |
| v8 | Isolasi per akun + hash ledger | Aditif/backfill |
| v9 | `email_links` | Aditif |
| v10 | `transactions.tags` + GIN | Aditif |

### 5.2 Aturan migrasi dan rollback

- Jalankan `npm run db:setup`; semua DDL harus idempoten (`IF NOT EXISTS`).
- Sebelum migrasi berisiko: snapshot Neon dan catat versi `schema_version`.
- Migrasi aditif tidak boleh menghapus kolom/data lama.
- Backfill harus dapat diulang dan dibatasi `user_id`.
- Rollback: pulihkan snapshot; jangan menjalankan DDL destruktif tanpa backup.
- Uji migrasi pada salinan database, bukan produksi.
- Setelah migrasi: cek jumlah transaksi, hash ledger, saldo dompet, dan health.

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
- **AC-AI-05:** `tanya ...` mengirim pertanyaan dan konteks agregat ke insight client lalu mengembalikan jawaban; tidak membuat transaksi.
- **AC-AI-06:** `ai off` menolak `tanya` tanpa memanggil insight client.
- **AC-AI-07:** tanpa insight client atau pertanyaan di luar 3–400 karakter, bot memberi pesan aman tanpa memanggil provider.
- **AC-AI-08:** panggilan ke-21 dalam satu jam dari nomor yang sama ditolak; nomor lain punya batas terpisah.

### Wawasan

- **AC-WS-01:** skor selalu 0–100.
- **AC-WS-02:** proyeksi 310.000 pada hari ke-10 bulan 31 hari = 961.000.
- **AC-WS-03:** peringatan anggaran muncul pada rasio ≥0,8.
- **AC-WS-04:** langganan dengan 2 bulan nominal sama terdeteksi; transaksi harian tidak.

### Laporan

- **AC-LAP-01:** periode `2026-11-01`–`2026-11-30` menghitung 30 hari dan transaksi di dalam rentang saja.
- **AC-LAP-02:** pengeluaran `Rp25.000` dengan biaya admin `Rp2.500` masuk sebagai `Rp27.500`.
- **AC-LAP-03:** transaksi batal dan `alokasi_gaji` tidak muncul pada ringkasan maupun daftar.
- **AC-LAP-04:** tombol cetak membuka dialog cetak dan CSS cetak menyembunyikan navigasi.
- **AC-LAP-05:** dua cron pada pekan/bulan yang sama hanya membuat satu laporan terjadwal.
- **AC-LAP-06:** laporan terjadwal mati tidak membuat outbox/email.

### Kolaborasi keluarga (ditangguhkan)

- **AC-KEL-00:** `GET /api/keluarga` dan `POST /api/keluarga` mengembalikan `410`; tidak ada data lintas akun yang bisa dibaca/ditulis.
- **AC-KEL-01 (target P2):** transaksi dari `member` masuk sebagai pengajuan; dashboard pemilik belum berubah sampai disetujui.
- **AC-KEL-02 (target P2):** dua permintaan setujui pada pengajuan yang sama hanya menghasilkan satu transaksi.
- **AC-KEL-03 (target P2):** `viewer` ditolak (403) saat mencoba menulis atau menghapus data.
- **AC-KEL-04 (target P2):** `member` melihat data pemilik setelah ditambahkan ke workspace.
- **AC-KEL-05 (target P2):** pesan WhatsApp dari nomor anggota diproses pada workspace pemilik.
- **AC-KEL-06 (target P2):** menghapus anggota mencabut nomornya dari `allowed_numbers` dan membatalkan pengajuan yang menunggu.
- **AC-KEL-07 (target P2):** aktivasi hanya setelah threat model, audit akses, dan persetujuan anggota tersedia.

### Keamanan akun

- **AC-SEC-01:** setelah 2FA diaktifkan, login tanpa kode ditolak dan login dengan kode valid berhasil.
- **AC-SEC-02:** kode 2FA salah ditolak.
- **AC-SEC-03:** mematikan 2FA dengan password salah ditolak; dengan password benar berhasil.
- **AC-SEC-04:** memulai 2FA saat 2FA masih aktif ditolak.
- **AC-SEC-05:** sesi lain yang dicabut tidak bisa dipakai lagi.
- **AC-SEC-06:** berkas ekspor terenkripsi hanya bisa didekripsi dengan password yang sama.

### Impor email bank/e-wallet

- **AC-EML-01:** email dari domain `bca.co.id` terdeteksi sebagai BCA.
- **AC-EML-02:** teks "Dana masuk Rp500.000" tidak terdeteksi sebagai DANA.
- **AC-EML-03:** transaksi dengan "Sumber Dana: BCA ****1234" masuk ke dompet BCA.
- **AC-EML-04:** merchant yang sama dengan satu alias pos otomatis memakai pos tersebut.
- **AC-EML-05:** merchant dengan dua kemungkinan pos dibiarkan tanpa pos, bukan memilih asal.
- **AC-EML-06:** email yang dikirim ulang dengan `id` sama tidak menambah transaksi.

### Kalender dan Google Sheets

- **AC-INT-01:** pengguna belum login mendapat 401 saat membuka `/api/kalender`.
- **AC-INT-02:** aturan tanggal 31 menghasilkan event pada 30/31 sesuai akhir bulan.
- **AC-INT-03:** nama tagihan dengan koma/titik koma tampil benar di kalender.
- **AC-INT-04:** URL webhook `https://example.com/exec` ditolak.
- **AC-INT-05:** URL webhook `https://script.google.com/macros/s/.../exec` diterima.
- **AC-INT-06:** sinkron mengirim seluruh transaksi dan tidak mengubah data lokal.
- **AC-INT-07:** `GET /api/kalender?token=salah` mendapat 401; token valid mendapat `text/calendar` tanpa login.
- **AC-INT-08:** dua kali `POST /api/kalender` mengembalikan token yang sama.
- **AC-INT-09:** dua cron pada hari WIB yang sama hanya menjalankan satu sinkron Sheets otomatis per pengguna.
- **AC-INT-10:** pengguna tanpa koneksi Google dan tanpa `sheets_url` dilewati tanpa error.
- **AC-INT-11:** `cron_terakhir` kosong atau >26 jam memunculkan peringatan di health; cron dalam 26 jam tidak.
- **AC-INT-12:** counter pemakaian bertambah per panggilan AI dengan kunci `usage:<YYYY-MM>:<jenis>` dan tidak memuat isi pesan.
- **AC-INT-13:** health tanpa `HEALTH_TOKEN` tidak menampilkan pemakaian; dengan token menampilkan agregat bulan berjalan.
- **AC-INT-14:** setelah OAuth, spreadsheet privat dibuat dan refresh token tersimpan terenkripsi.
- **AC-INT-15:** `PUTUSKAN` menghapus koneksi/token tetapi tidak menghapus file spreadsheet.

### P2 — roadmap acceptance

- **AC-CAP-01:** tanpa paywall, tidak ada batas buatan pada dompet/pos/anggaran/target/recurring.
- **AC-ANL-01:** laporan laba rugi/arus kas memisahkan masuk, keluar, admin, arus bersih, saldo awal/akhir.
- **AC-ANL-02:** filter pos/dompet pada laporan hanya mengubah hasil, bukan data.
- **AC-ANL-03:** simulasi skenario tidak membuat transaksi baru.
- **AC-AUTO-01:** aturan auto-kategorisasi hanya memetakan pos; nominal tidak berubah.
- **AC-COL-01:** API keluarga tetap 410 sampai gate keamanan disetujui.
- **AC-INT2-01:** API publik menolak request tanpa key/scope yang valid.
- **AC-INT2-02:** webhook publik menandatangani payload dan menolak replay.
- **AC-SEC2-01:** recovery code 2FA sekali pakai dapat memulihkan akun; kode yang sama ditolak pada penggunaan kedua.
- **AC-SEC2-02:** ekspor penuh memuat transaksi, pos, dompet, anggaran, target, utang, dan pengaturan aman.
- **AC-UX-01 (selesai):** ubah transaksi memperbarui data dan audit tanpa membuat transaksi baru.
- **AC-UX-02 (selesai):** filter pos/dompet/rentang tanggal mengembalikan hasil yang tepat.
- **AC-TAG-01 (selesai):** tag dinormalisasi, maksimal 8, unik, tersimpan, tampil di detail, dan bisa difilter.
- **AC-UX-03 (belum):** template/lampiran divalidasi ukuran/tipe dan dihapus bersama transaksi.
- **AC-UX-04 (belum):** transaksi multi-mata uang menyimpan kurs dan nilai IDR secara eksplisit.

## 7. Rencana teknis berikutnya

### 7.1 P2 — penguatan

| Item | Perubahan teknis | Risiko | Urutan |
|---|---|---|---|
| Ubah transaksi **(selesai)** | Endpoint `PATCH /api/transactions`; audit; rechain hash ledger | Rantai hash dan transaksi turunan | 1 |
| Filter pos/dompet **(selesai)** | Filter UI riwayat; tanpa perubahan data | Query lambat | 2 |
| Tag **(selesai)** + template | `transactions.tags`; tabel template; validasi | Skema baru | 3 |
| Lampiran struk | Storage terbatas/enkripsi; hapus cascade; batas ukuran/tipe | PII dan biaya | 4 |
| Recovery 2FA | Tabel recovery code hash sekali pakai; alur unduh | Kehilangan akun | 5 |
| Audit UI | Halaman audit, filter aksi/tanggal; perluas `catatAudit` | PII di detail | 6 |
| Ekspor penuh | Sertakan pos, dompet, anggaran, target, utang, pengaturan aman | Data sensitif | 7 |
| Laporan formal | Laba rugi/arus kas, filter pos/dompet, multi-tahun | Perf | 8 |
| Simulasi | Fungsi murni di atas state; tanpa mutasi | Angka menyesatkan | 9 |
| Auto-kategorisasi | Aturan user (kata kunci → pos), pratinjau | Salah kategori | 10 |
| Telegram | Adapter baru memakai pipeline transaksi yang sama | Duplikasi logika | 11 |
| Kolaborasi | Isolasi workspace, audit akses, re-enable API | Kebocoran data | 12 |
| API/webhook | API key/scope, rate limit, signature, replay window | Penyalahgunaan | 13 |

### 7.2 P3 — paywall/SaaS

- Entitlement server-side dan matriks paket.
- Billing webhook idempoten, invoice, dunning, refund, pajak.
- Kuota kapasitas, lampiran, AI, dan riwayat.
- White-label PDF, akuntan eksternal, dukungan prioritas.
- Gate keamanan: recovery 2FA, audit penuh, backup/restore teruji.

### 7.3 Pembersihan wajib

- Jangan menyebut kolaborasi “selesai” selama `/api/keluarga` 410.
- Tambahkan audit untuk recurring, impor, Sheets, kalender, 2FA, ekspor.
- Tambahkan recovery code sebelum 2FA diwajibkan.
- Perluas ekspor agar benar-benar “seluruh data”.
- Uji negatif IDOR, OAuth state, replay webhook, dan rate limit.

## 8. Traceability per FR

| PRD | SRS | Acceptance | Status |
|---|---|---|---|
| F-PREM-01 | FR-WS | AC-WS | Selesai |
| F-PREM-02 | FR-REC | AC-REC | Selesai |
| F-PREM-03 | FR-CSV | AC-CSV | Selesai |
| F-PREM-04 | FR-DIG | AC-DIG | Selesai |
| F-PREM-05 | FR-DOM | AC-DOM | Selesai |
| F-PREM-06 | FR-LAP | AC-LAP | Selesai |
| F-PREM-07 | FR-AI | AC-AI | Selesai |
| F-PREM-08 | FR-KEL | AC-KEL | Ditangguhkan |
| F-PREM-09 | FR-SEC, FR-SEC2 | AC-SEC, AC-SEC2 | Sebagian (recovery 2FA belum) |
| F-PREM-10 | FR-EML, FR-INT, FR-INT2 | AC-EML, AC-INT, AC-INT2 | Sebagian |
| Roadmap 8.7 | FR-CAP | AC-CAP | Sebagian (tanpa paywall) |
| Roadmap 8.7 | FR-ANL | AC-ANL | Belum/Sebagian |
| Roadmap 8.7 | FR-AUTO | AC-AUTO | Sebagian |
| Roadmap 8.7 | FR-COL | AC-COL | Ditangguhkan |
| Roadmap 8.7 | FR-INT2 | AC-INT2 | Belum |
| Roadmap 8.7 | FR-UX | AC-UX | Selesai (edit + filter); tag/template/lampiran belum |
| Roadmap 8.7 | FR-TAG | AC-TAG-01, AC-UX-03/04 | Sebagian (tag selesai) |

## 9. Rencana verifikasi

| Area | Test/berkas | Cakupan | Gap |
|---|---|---|---|
| Recurring | `tests/recurring.test.ts` | Jatuh tempo, anti-duplikat, mulai | Uji cron paralel |
| CSV | `tests/importcsv.test.ts`, `tests/input-rupiah.test.ts` | Parse, nominal, dedup, baris invalid | Uji file 2 MB |
| Digest | `tests/digest.test.ts` | Kunci minggu/hari, toggle | Uji tanpa nomor |
| Dompet | `tests/dompet.test.ts` | Saldo, transfer, net worth | Uji transfer negatif |
| Laporan | `tests/laporan.test.ts` | Periode, ringkasan, jadwal | Uji filter pos/dompet (belum ada) |
| AI | `tests/ai-pro.test.ts`, `tests/insight.test.ts`, `tests/handler-ai.test.ts` | Riwayat, anomali, batas | Uji biaya/kuota |
| Keluarga | `tests/keluarga.test.ts` | Unit `tolakPeran` | API 410 belum diuji end-to-end |
| Keamanan | `tests/keamanan.test.ts`, `tests/security.test.ts` | 2FA, sesi, ekspor, TOTP | Recovery code belum ada |
| Email | `tests/parse.test.ts`, `tests/handler.test.ts` | Deteksi penyedia, dompet, idempoten | Replay/rate limit |
| Sheets/kalender | `tests/sheets.test.ts`, `tests/ics.test.ts` | Baris, URL, RFC 5545, token | OAuth callback nyata |
| Meter/health | `tests/usage.test.ts`, `tests/health.test.ts` | Counter, cron basi | Alert eksternal |
| Ubah transaksi + tag | `tests/ubah-transaksi.test.ts`, `tests/pg-repo.test.ts` | Field, tipe terlarang, batal, tanggal masa depan, tag normalisasi/persistensi, isolasi transaksi lain | Filter UI diuji manual |
| Web | `tests/web.test.ts`, `tests/tombol.test.ts` | UI dasar | Aksesibilitas, mobile |

**Aturan:** setiap FR baru harus punya minimal satu AC dan satu test; test tidak boleh hanya menguji fungsi murni bila ada jalur API yang bisa diuji.

## 10. Asumsi, keputusan terbuka, dan glosarium

### 10.1 Asumsi

- Satu pemilik per akun; keluarga ditangguhkan.
- IDR sebagai mata uang utama.
- Cron eksternal tersedia; aplikasi tidak menyimpan scheduler sendiri.
- Provider AI dapat dimatikan; fallback manual selalu tersedia.
- Neon menyediakan backup sesuai paket; aplikasi tidak menyimpan backup sendiri.

### 10.2 Keputusan terbuka

1. Re-enable keluarga: syarat isolasi, audit, dan persetujuan anggota.
2. Recovery 2FA: format, jumlah kode, dan alur unduh.
3. Lampiran: enkripsi, ukuran, retensi, dan biaya storage.
4. Multi-mata uang: sumber kurs, pembulatan, dan laporan.
5. API publik: skema API key, scope, rate limit, dan audit.
6. Paywall: paket, harga, gating, dan uji billing.
7. Ekspor akuntansi: format dan pemetaan akun.
8. Target RPO/RTO dan frekuensi uji restore.

### 10.3 Glosarium

- **Pemilik:** akun utama pemilik data.
- **Pos:** kategori/sub-kategori.
- **Dompet:** akun kas/bank/e-wallet.
- **Wadah:** saldo, tabungan, investasi.
- **Outbox:** antrean pesan keluar.
- **Entitlement:** hak fitur per paket.
- **RPO/RTO:** toleransi kehilangan data/waktu pemulihan.
- **Ditangguhkan:** kode ada, akses sengaja dimatikan.
