# Money-Charger

Bot WhatsApp pribadi untuk mencatat gaji dan pengeluaran, plus dashboard web ringkas untuk melihat ringkasan, mengatur jatah, dan mengelola transaksi/pos.
Next.js di Vercel + Postgres online di Neon + Groq (AI cadangan). Tidak perlu memasang DBMS di komputer.

SRS SaaS adalah target masa depan; aplikasi ini masih satu pemilik. Multi-tenant, akun pelanggan, billing, dan isolasi data tenant belum tersedia—jangan buka sebagai layanan publik/berbayar.

Acuan: [PRD Money-Charger SaaS](./prd-catatan-keuangan-whatsapp.md) dan [SRS](./srs-catatan-keuangan-whatsapp.md). Roadmap fitur premium pribadi: [PRD premium pribadi](./prd-fitur-premium-pribadi.md) dan [SRS premium pribadi](./srs-fitur-premium-pribadi.md).

## Struktur

| Lokasi | Isi |
|---|---|
| `src/lib/engine.ts` | Mesin uang (fungsi murni): periode, jatah, Dana Darurat, Saldo, bonus, evaluasi |
| `src/lib/parse/` | Parser nominal, tanggal, alias pos, perintah |
| `src/lib/handler.ts` | Aturan domain pemrosesan pesan dan transaksi |
| `src/lib/ai.ts` | Groq sebagai cadangan bahasa bebas, beserta validasi hasil AI |
| `src/lib/ai-vision.ts` | Groq vision untuk membaca foto struk/transaksi, beserta validasi hasil |
| `src/lib/insight.ts` | Konteks keuangan untuk asisten AI + klien Groq tanya jawab (web dan WhatsApp) |
| `src/lib/pg-repo.ts` | Akses Neon Postgres. `mem-repo.ts` adalah versi memori untuk tes |
| `src/lib/inbound-queue.ts` | Antrean pesan masuk durable: idempoten, lease, retry, retensi |
| `src/lib/outbox.ts` | Antrean balasan WhatsApp, retry backoff, dan pembersihan pesan lama |
| `src/lib/audit.ts` | Audit event tanpa isi pesan atau rahasia |
| `src/modules/whatsapp/` | Modul HMVC webhook: controller, model, worker antrean, dan respons |
| `src/modules/finance/` | Modul HMVC keuangan/dashboard: controller, model, view, dan halaman dashboard |
| `src/modules/auth/` | Modul HMVC autentikasi dashboard |
| `src/modules/profile/` | Modul HMVC profil akun: nama, email, foto, password, 2FA, hapus akun |
| `src/modules/export/` | Modul HMVC unduh CSV dan ekspor terenkripsi |
| `src/lib/totp.ts` | TOTP 2FA tanpa dependensi tambahan |
| `src/lib/export-enkripsi.ts` | Enkripsi ekspor AES-256-GCM dengan scrypt |
| `src/modules/health/` | Modul HMVC diagnosa kesiapan |
| `src/modules/outbox/` | Endpoint terjaga untuk memproses ulang balasan WhatsApp tertunda |
| `src/modules/email/` | Modul HMVC penerima email payroll generik (`/api/email/inbound`) |
| `src/modules/insight/` | Modul HMVC asisten tanya jawab keuangan (`/api/insight`) |
| `src/lib/email.ts` | Heuristik ekstraksi nominal, penyedia, dompet, dan deteksi "gaji/payroll" dari teks email |
| `src/modules/kalender/` | Modul HMVC unduhan kalender `.ics` (`/api/kalender`) |
| `src/modules/sheets/` | Modul HMVC sinkron Google Sheets (`/api/sheets`) |
| `src/lib/ics.ts` | Pembuat kalender RFC 5545 tanpa dependensi tambahan |
| `src/lib/sheets.ts` | Penyusun baris spreadsheet dan validasi URL web app Apps Script |
| `src/lib/google-sheets.ts` | Klien Google Sheets API: refresh token, buat spreadsheet, tulis nilai |
| `src/lib/google-token.ts` | Enkripsi AES-256-GCM refresh token Google |
| `src/app/api/` | Adapter Next.js tipis yang meneruskan request ke controller modul |
| `src/app/page.tsx` | Adapter halaman dashboard Next.js |
| `src/app/login/` | Halaman masuk, daftar akun, dan tombol Google/Facebook |
| `src/lib/auth.ts` | Sesi akun berbasis cookie acak yang disimpan sebagai hash di database |
| `src/lib/dashboard.ts` | View-model dashboard dari `State` + engine |
| `src/lib/web-actions.ts` | Aksi web: simpan rencana, transaksi, pos, setup |
| `db/schema.sql` | Skema tabel |
| `tests/` | Tes parser, domain, controller, rate limit, outbox retry, dan failover model AI |

## Arsitektur aplikasi (HMVC internal)

Proyek memakai pola HMVC yang dibangun di atas Next.js—**tidak memasang framework baru**. Next.js tetap menangani URL, HTTP, dan deployment; setiap fitur aplikasi dikelompokkan sebagai modul di `src/modules/<nama-modul>/`.

- `controller.ts`: menerima request dari adapter Next.js, memeriksa autentikasi, memanggil model, lalu memilih respons.
- `model.ts`: menjalankan use case dan berinteraksi dengan aturan domain serta penyimpanan atau layanan eksternal.
- `view.ts` / `dashboard-view.tsx`: membentuk respons HTTP atau tampilan modul.
- `src/app/api/**/route.ts`: hanya menghubungkan metode HTTP Next.js ke controller terkait.

Aturan keuangan tetap berada di `src/lib/engine.ts` dan `src/lib/handler.ts`; modul mengatur alur fitur tanpa menggandakan aturan tersebut. `Repo` dan `AiClient` sudah menjadi titik substitusi untuk penyimpanan dan AI. Bila vendor WhatsApp atau layanan lain perlu diganti, tambahkan adapter pada batas modul tanpa menanam logika vendor di aturan keuangan.

Struktur ini **belum** menjadikan aplikasi multi-pelanggan: autentikasi, whitelist, transaksi, dan konfigurasi masih untuk satu pemilik. Jangan mengaktifkan beberapa pelanggan pada deployment/database yang sama sebelum isolasi data dan akun per tenant dirancang serta diuji. Sasaran produk dan persyaratan migrasinya dijelaskan di [PRD](./prd-catatan-keuangan-whatsapp.md) dan [SRS](./srs-catatan-keuangan-whatsapp.md).

## Setup (urutan disarankan)

### 1. Neon (database)
1. Daftar di neon.tech, buat project, aktifkan 2FA.
2. Salin connection string yang **pooled** (host berisi `-pooler`) sebagai `DATABASE_URL`.

### 2. Groq (AI cadangan)
1. Daftar di console.groq.com, aktifkan 2FA.
2. **Nyalakan Zero Data Retention di pengaturan akun dulu**, baru buat API key.
3. Model awal `openai/gpt-oss-20b`. Ganti lewat `GROQ_MODEL` bila akurasinya kurang.
4. Bot tetap jalan tanpa Groq (`GROQ_API_KEY` kosong): kalimat bebas dibalas permintaan format kaku.
5. Key Groq yang sama juga dipakai untuk membaca **foto struk/screenshot transaksi** yang dikirim ke bot
   (model vision diatur lewat `GROQ_VISION_MODEL`, default `qwen/qwen3.8-27b`; Llama 4 Scout tidak tersedia
   di akun Groq gratis saat uji).
   Tanpa `GROQ_API_KEY`, foto dibalas permintaan catat manual seperti pesan teks lainnya.
6. Isi pesan bebas dikirim ke Groq hanya bila AI aktif. Ketik `ai off` untuk mencabut izin, `ai on` untuk
   mengaktifkan lagi. Dengan `ai konfirmasi on` (bawaan), hasil AI ditampilkan sebagai pratinjau dan baru
   dicatat setelah balasan `ya`; `ai konfirmasi off` mengembalikan pencatatan langsung.
7. Tab **Asisten** di dashboard memakai key yang sama untuk tanya jawab keuangan (`GROQ_INSIGHT_MODEL`,
    default mengikuti `GROQ_MODEL`). AI hanya menerima ringkasan agregat dashboard, bukan nomor telepon atau data mentah.
8. Di WhatsApp, aktifkan AI dengan `ai on`, lalu tanyakan `tanya berapa pengeluaran makan 3 bulan terakhir`.
   Perintah memakai agregat dashboard + riwayat, tidak mengubah transaksi, dan dibatasi 20 pertanyaan/jam per nomor.
   `ai off` mencabut izin AI untuk pertanyaan maupun kalimat bebas.

### 3. Meta WhatsApp Cloud API
1. Buat aplikasi Meta dengan use case **Connect with customers through WhatsApp** dan buka **Langkah 1. Cobalah**.
2. Untuk uji awal, gunakan nomor uji Meta dan tambahkan nomor WhatsApp pribadi sebagai penerima yang diizinkan. Kirim pesan uji dari halaman tersebut.
3. Catat `Phone Number ID` (`WA_PHONE_NUMBER_ID`) dan buat access token dari halaman API Setup (`WA_ACCESS_TOKEN`). Token uji dapat kedaluwarsa; gunakan hanya untuk pengujian.
4. Ambil **App Secret** dari **Pengaturan aplikasi > Dasar** (`WA_APP_SECRET`). Jangan bagikan token atau App Secret.
5. Untuk penggunaan berkelanjutan, siapkan kredensial produksi WhatsApp dan access token yang tidak kedaluwarsa seperti token System User (`WA_ACCESS_TOKEN`). Jangan mengandalkan token uji sementara.

### 4. Isi environment
Salin `.env.example` ke `.env.local` dan isi. `ALLOWED_NUMBERS` adalah nomor pribadi Anda, format `62812...` tanpa plus.
Isi `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` dan `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` untuk mengaktifkan tombol login provider. Untuk Facebook boleh memakai `META_APP_ID`/`WA_APP_SECRET` bila memakai aplikasi Meta yang sama. Callback OAuth memakai origin request; `AUTH_CALLBACK_BASE_URL` hanya diperlukan untuk memaksa origin tertentu. Untuk Google Sheets otomatis, tambahkan scope `https://www.googleapis.com/auth/drive.file` di OAuth consent screen dan isi `GOOGLE_TOKEN_ENCRYPTION_KEY` (opsional; bila kosong memakai `GOOGLE_CLIENT_SECRET`).
Untuk percobaan lokal, isi variabel WhatsApp berikut sesuai API Setup Meta: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`. Buat sendiri nilai acak untuk `WA_VERIFY_TOKEN`; gunakan nilai yang sama saat mendaftarkan webhook. Versi Graph API bawaan adalah `v25.0`; samakan dengan versi yang ditampilkan Meta.

```bash
npm install
npm run db:setup     # memastikan skema, mencatat baseline v1-v7, seed default, dan whitelist nomor
npm run lint
npm run typecheck
npm test
```

### 5. Deploy ke Vercel
1. Push ke repo GitHub baru (akun terpisah dari Redigma), import di Vercel.
2. Di **Vercel > Project > Settings > Environment Variables**, tambahkan variabel yang sama dengan `.env.example` untuk **Production**. Untuk uji awal, masukkan token uji Meta; jangan masukkan rahasia ke Git atau chat. Isi `APP_BASE_URL` dengan URL production Vercel Anda.
3. Redeploy setelah menambah atau mengubah environment variables.
4. Tambahkan GitHub repository secrets `APP_BASE_URL` dan `CRON_SECRET` untuk mengaktifkan retry outbox setiap 10 menit.
5. Di pengaturan WhatsApp aplikasi Meta, daftarkan webhook:
   - Callback URL: `https://<domain-vercel-anda>/api/whatsapp/webhook`
   - Verify token: nilai `WA_VERIFY_TOKEN` yang sama persis dengan di Vercel
   - Subscribe ke field `messages`
6. Setelah webhook terverifikasi, kirim `bantuan` dari nomor penerima uji yang sudah diizinkan Meta. Untuk nomor produksi, pastikan nomor pengirim juga ada di `ALLOWED_NUMBERS`.

#### Contoh nilai Production di Vercel

Contoh berikut hanya format pengisian. Ganti semua nilai bertanda `GANTI_...` dengan nilai asli dari akun Anda. Jangan gunakan placeholder ini sebagai kredensial aktif atau mengirimkannya ke chat.

| Name | Contoh Value |
|---|---|
| `WA_PHONE_NUMBER_ID` | `GANTI_DENGAN_PHONE_NUMBER_ID_DARI_META` |
| `WA_ACCESS_TOKEN` | `GANTI_DENGAN_TOKEN_PRODUKSI_META` |
| `WA_APP_SECRET` | `GANTI_DENGAN_APP_SECRET_META` |
| `WA_VERIFY_TOKEN` | `GANTI_DENGAN_STRING_ACAK_PANJANG_YANG_SAMA_DI_WEBHOOK` |
| `WA_API_VERSION` | `v25.0` |
| `ALLOWED_NUMBERS` | `6281234567890` (nomor dummy; ganti dengan nomor Anda, tanpa `+`) |
| `APP_BASE_URL` | `https://nama-proyek-anda.vercel.app` |
| `DATABASE_URL` | Connection string pooled dari Neon |
| `GROQ_API_KEY` | `GANTI_DENGAN_API_KEY_GROQ` |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `GROQ_FALLBACK_MODELS` | opsional; model cadangan Groq dipisahkan koma (error model/server, bukan 429) |
| `CRON_SECRET` | secret untuk `POST /api/cron/outbox` |
| `GOOGLE_CLIENT_ID` | Client ID OAuth Google |
| `GOOGLE_CLIENT_SECRET` | Client Secret OAuth Google |
| `FACEBOOK_APP_ID` | App ID Facebook Login (opsional bila memakai `META_APP_ID`) |
| `FACEBOOK_APP_SECRET` | App Secret Facebook Login (opsional bila memakai `WA_APP_SECRET`) |
| `RESEND_API_KEY` | API key Resend untuk kirim tautan reset password |
| `EMAIL_FROM` | Pengirim email terverifikasi, mis. `Money-Charger <reset@domain.com>`; tanpa ini reset dikirim lewat WhatsApp nomor akun |
| `HEALTH_TOKEN` | opsional; bila diisi, detail `/api/health` hanya bisa dibuka dengan header `X-Health-Token` atau `Authorization: Bearer <nilai ini>` |

Di halaman Webhooks Meta, gunakan:

- **URL Callback**: `https://nama-proyek-anda.vercel.app/api/whatsapp/webhook`
- **Verifikasi token**: nilai rahasia yang sama persis dengan `WA_VERIFY_TOKEN` di Vercel
- Subscribe ke field **messages**

Nomor telepon, token, dan App Secret harus berasal dari aset Meta yang benar-benar Anda miliki; jangan mengisi data bisnis palsu. Setelah menyimpan environment variables di Vercel, lakukan redeploy.

### 5b. Diagnosa setelah deploy

Buka `https://<domain-vercel-anda>/api/health` (kirim header `X-Health-Token: <HEALTH_TOKEN>` bila variabel itu diisi). Tanpa `HEALTH_TOKEN`, endpoint hanya mengembalikan `{ ok, waktu }`. Dengan token, endpoint melaporkan **ada/tidaknya** variabel (tanpa nilainya) dan status koneksi Neon.

Contoh bila belum lengkap:

```json
{
  "ok": false,
  "env": { "DATABASE_URL": true, "WA_ACCESS_TOKEN": false, "...": false },
  "whatsapp": { "webhookSiap": false },
  "database": { "tersambung": true, "skemaSiap": true, "jumlah": { "nomor_aktif": 1 } },
  "peringatan": ["WA_ACCESS_TOKEN belum diisi."]
}
```

Arti hasil penting:

- `database.tersambung: false` + `error: getaddrinfo ENOTFOUND` → `DATABASE_URL` salah, memakai host lama, atau DNS sedang gagal. Coba lagi, lalu samakan string pooled dari Neon.
- `database.tersambung: false` + `error: DATABASE_URL belum diatur` → variabel belum masuk ke Vercel (atau belum redeploy).
- `skemaSiap: false` → `npm run db:setup` belum dijalankan pada database yang dipakai Vercel.
- `jumlah.nomor_aktif: 0` → jalankan `npm run db:setup` lagi setelah mengisi `ALLOWED_NUMBERS`.
- `ok: true` berarti konfigurasi dasar, DB, dan whitelist siap; lanjut verifikasi webhook di Meta.

Tanpa `HEALTH_TOKEN`, endpoint ini hanya memberi status ringkas. Isi `HEALTH_TOKEN` untuk
melihat detail diagnosa; detail hanya bisa dibaca dengan header token. Health terautentikasi menghitung `inbound_gagal` dan `outbox_gagal`, tanpa mengembalikan payload pesan. Untuk cek manual, gunakan `Invoke-RestMethod` dengan header `X-Health-Token`; jangan masukkan token ke URL atau log terminal yang dibagikan.

#### Retry balasan WhatsApp

Webhook menyimpan pesan ke antrean inbound sebelum membalas 200; pemrosesan AI dan pengiriman
dijalankan setelah respons. Balasan disimpan di outbox; bila Meta gagal, retry memakai backoff
(1 menit, 5 menit, 15 menit, 1 jam, 6 jam). Workflow GitHub `Process WhatsApp queues` memanggil
worker tiap 10 menit. Isi repository secrets `APP_BASE_URL` dan `CRON_SECRET` untuk mengaktifkannya.
Payload job selesai dibersihkan setelah 7 hari, job gagal setelah 30 hari; outbox 30 hari; audit 180 hari.

`Keluar semua` di dashboard menghapus semua baris sesi akun. Daftar sesi di tab Profil dapat mencabut sesi lain satu per satu; 2FA TOTP opt-in dan ekspor CSV terenkripsi juga tersedia di sana.

#### Backup dan restore melalui Neon

Gunakan Neon Console → **Backup & Restore**. Jangan simpan `RESTORE_DATABASE_URL` atau `RESTORE_CONFIRM` di `.env.local`; keduanya tidak diperlukan untuk alur Console.

- **Buat snapshot:** pilih project dan branch `main`, buka **Backup & Restore** → **Create snapshot**. Pastikan kartu snapshot muncul beserta waktu dan sumber sebelum migrasi skema berisiko. Jadwal otomatis dan retensi bergantung pada paket Neon; label **Upgrade for schedules** berarti jadwal belum dikonfigurasi/tersedia pada paket saat ini.
- **Drill dari snapshot:** untuk restore point-in-time historis, buat branch baru dari snapshot/waktu yang dipilih agar tidak menimpa `main` atau branch `restore-drill`. Branch `restore-drill` yang sudah ada boleh dipakai untuk uji salinan terkini, tetapi reset dari parent menimpa isi branch itu. Pastikan expiry branch sebelum mulai.
- **Validasi:** sambungkan aplikasi lokal sementara ke branch drill melalui **Connect** dan URL branch tersebut di `.env.local` lokal saja. Jangan commit atau kirim URL/password. Sebelum `npm run db:setup`, cek lagi host/branch yang dipilih pada Neon dan bahwa terminal memakai URL branch drill; command ini memastikan skema, mencatat baseline v1-v7, seed default, dan whitelist nomor. Periksa login, jumlah transaksi, pos, rencana, relasi, saldo dan laporan periode yang dikenal; bandingkan dengan keadaan yang diharapkan untuk waktu snapshot.
- **Pemulihan main:** gunakan **Restore from history** atau **Restore from a snapshot** pada branch `main` hanya saat memang ingin mengganti keadaan database produksi. Pilih point-in-time/snapshot dengan teliti dan ikuti konfirmasi Neon; tindakan ini dapat mengubah data aplikasi.
- **Selesai drill:** catat waktu snapshot, branch yang diuji, hasil hitungan/cek laporan, lalu hapus branch uji bila tidak diperlukan lagi.
- **Periksa kegagalan pesan:** `jumlah.inbound_gagal` dan `jumlah.outbox_gagal` yang bukan nol menandakan perlu investigasi. Periksa cron GitHub `Process WhatsApp queues`, `CRON_SECRET`, log deployment, dan status provider. Retry otomatis memproses job yang memenuhi jadwal; jangan menghapus atau mengedit record DB secara manual.

Jangan menganggap **Restore from history** sebagai backup terpisah: jendela point-in-time bergantung pada paket. Buat snapshot sebelum perubahan berisiko dan verifikasi fitur/retensi aktual pada project Neon. Pemulihan `main` dari history/snapshot adalah perubahan produksi: pastikan waktu/branch, baca dialog konfirmasi Neon, dan lanjut hanya bila memang ingin database `main` kembali ke titik tersebut.

#### Contoh panggilan WhatsApp Cloud API (PowerShell)

Gunakan hanya setelah nomor penerima mengirim pesan terlebih dahulu dan jendela percakapan layanan masih terbuka. Ganti placeholder dengan nilai Anda secara lokal; jangan tempel token ke chat atau commit ke repo.

```powershell
$version = "v25.0"
$phoneNumberId = "GANTI_DENGAN_PHONE_NUMBER_ID_DARI_META"
$accessToken = "GANTI_DENGAN_TOKEN_PRODUKSI_META"
$recipient = "6281234567890"
$body = @{
  messaging_product = "whatsapp"
  to = $recipient
  type = "text"
  text = @{ body = "bantuan" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "https://graph.facebook.com/$version/$phoneNumberId/messages" `
  -Headers @{ Authorization = "Bearer $accessToken" } `
  -ContentType "application/json" `
  -Body $body
```

### 6. Ganti nomor bot (FR-83)
Ganti `WA_PHONE_NUMBER_ID` dan `WA_ACCESS_TOKEN` di Vercel, redeploy. Kode dan data tidak berubah.
Ganti nomor pribadi: ubah `ALLOWED_NUMBERS`, jalankan `npm run db:setup` lagi.

### 7. Email transaksi otomatis (opsional, dua arah)

`POST /api/email/inbound` mencatat email notifikasi transaksi menjadi:
- **Pengeluaran** (`out`) untuk email pembayaran/QRIS. Label diambil dari `Nama Merchant`.
- **Gaji** untuk email payroll/gaji/THR.
- **Pemasukan** ke Saldo untuk transfer masuk biasa.

Arah dideteksi dari subjek/isi email. Email yang arahnya tidak dikenali dilewati, bukan dicatat asal-asalan.
Penyedia bank/e-wallet dideteksi dari domain pengirim atau teks (BCA, Mandiri, BRI, BNI, BSI, CIMB, Permata,
BTN, GoPay, OVO, DANA, ShopeePay, LinkAja, Jenius, Jago, SeaBank, Blu, Neo). Dompet sumber dan pos dipetakan
otomatis hanya bila hasilnya tunggal; jika ambigu, transaksi memakai dompet bawaan dan tanpa pos.

1. Isi `EMAIL_INBOUND_SECRET` dengan string acak panjang di `.env.local` dan di Vercel, lalu redeploy.
   Opsional: batasi pengirim lewat `EMAIL_ALLOWED_SENDERS`, satu atau beberapa domain dipisah koma. Daftar bank/e-wallet yang didukung (tanpa Neo dan Blu):
   `bankbsi.co.id,bca.co.id,bankmandiri.co.id,mandiri.co.id,bri.co.id,bni.co.id,cimbniaga.co.id,permatabank.co.id,btn.co.id,jenius.com,jago.com,seabank.co.id,gopay.co.id,gojek.com,ovo.id,dana.id,shopeepay.co.id,shopee.co.id,linkaja.id`. Kosong = semua pengirim.
2. Jembatan termudah untuk Gmail: buka `script.google.com`, buat project baru, tempel isi
   [`scripts/gmail-transaksi.gs`](./scripts/gmail-transaksi.gs), ganti `WEBHOOK_URL` dan `SECRET`, lalu jalankan
   `pasangTrigger` sekali dan izinkan akses Gmail. Script memeriksa email 24 jam terakhir tiap 5 menit untuk BSI,
   BCA, Mandiri, BRI, BNI, CIMB Niaga, Permata, BTN, Jenius, Jago, SeaBank, Blu, Neo, GoPay, OVO, DANA,
   ShopeePay, dan LinkAja, lalu meneruskannya ke webhook bersama nama `penyedia`. Edit array `SUMBER` untuk
   menambah/menghapus bank atau e-wallet; `subjek` boleh dikosongkan agar semua email dari domain itu diperiksa.
   Email yang sudah pernah dikirim dilewati oleh idempotensi server. Untuk diagnosa, jalankan
   `debugEmailTransaksi` (lihat query dan email yang cocok) atau `tesKoneksi` (HTTP 400 berarti secret benar).
   Alternatif: Resend Inbound, Cloudflare Email Workers, Mailgun Routes, atau Zapier/Make.
   - **Multi-user tanpa tercampur:** satu project Apps Script boleh dipakai bersama. Bagikan project sebagai
     Editor (atau minta tiap pengguna membuat salinan), lalu tiap pengguna login ke Gmail masing-masing,
     membuka project itu, dan menjalankan `pasangTrigger` sekali. Trigger berjalan sebagai pengguna yang
     memasangnya, hanya membaca inbox Gmail pengguna itu, dan mengirim `akun` = email Gmail tersebut. Satu
     project bisa punya banyak trigger, satu per pengguna; server mencocokkan `akun` ke akun terdaftar.
   - Email akun Money-Charger harus sama dengan email Gmail yang menjalankan trigger. Bila berbeda, ubah email
     profil atau daftarkan akun dengan email Gmail itu. Satu Gmail berisi banyak bank/e-wallet tetap masuk ke
     satu pengguna, bukan dipecah per bank.
   - Satu Gmail yang menerima notifikasi banyak orang tidak dipisah otomatis; pakai Gmail terpisah per pengguna.
     `SECRET` dipakai bersama di project, jadi jangan bagikan project ke luar pengguna yang dipercaya.
   - Bila `akun` tidak cocok: pada sistem single-user transaksi tetap masuk ke satu-satunya akun; setelah ada
     lebih dari satu pengguna, email dilewati agar tidak salah masuk ke akun utama.
   - **Tombol setup di dashboard:** deploy project sebagai **Web app** dengan **Execute as: User accessing the
     web app** dan **Who has access: Anyone with Google account**. Salin URL `/exec` ke `GMAIL_SETUP_URL`.
     Tombol **Aktifkan email otomatis** muncul di tab Transaksi otomatis; tautan membawa email akun yang sedang
     login, dan Apps Script menolak bila Gmail yang dipilih berbeda. Setelah trigger dipasang, Apps Script
     memanggil `/api/email/link` sehingga status **Tertaut** muncul di akun itu. Tombol **Periksa sekarang**
     menjalankan pemeriksaan sekali. Bila memakai `SETUP_TOKEN` di script, sertakan `?token=...` pada
     `GMAIL_SETUP_URL`. Google tetap mewajibkan tiap pengguna memberi izin Gmail sekali; server tidak bisa
     memasang trigger ke mailbox orang lain tanpa persetujuan pemiliknya.
3. Body JSON yang dikenali:

   ```json
   {
     "id": "id-unik-email-ini",
     "from": "noreply-cms@bankbsi.co.id",
     "subject": "INCOMING TRANSACTION NOTIFICATION",
     "text": "Nominal\n1,800,000.00\nJenis Transaksi\nPayroll",
     "akun": "email-akun-anda@gmail.com",
     "tanggal": "2026-10-31",
     "nominal": 1800000,
     "dompet": "BCA ****1234",
     "penyedia": "BCA"
   }
   ```

   - `id` wajib dan harus unik per email (dipakai untuk mencegah pencatatan ganda bila penyedia mengirim ulang).
   - `akun` opsional: email kotak masuk penerima. Bila cocok dengan email akun yang terdaftar/login, transaksi masuk ke akun itu.
     Script Gmail mengisinya otomatis. Bila tidak cocok, transaksi memakai akun pertama.
   - `nominal` opsional. Bila kosong, server membaca label `Nominal`/`Nominal Transaksi`/`Total`, lalu angka `Rp`,
     lalu angka bergrup; mendukung `Rp 25.925,00` maupun `1,800,000.00`.
   - `tanggal` opsional (`YYYY-MM-DD`). Bila kosong, server mencoba membaca tanggal dari isi email
     (`31-OKT-26`, `5 November 2026`), lalu memakai tanggal hari ini (WIB).
   - `dompet`/`wallet` dan `penyedia`/`provider` opsional. Bila kosong, server mendeteksi penyedia dan dompet
     sumber dari isi email. Dompet dipakai hanya jika cocok tunggal dengan dompet aktif.

4. Uji dengan `curl`/Postman sebelum menyambungkan penyedia sungguhan. Email yang sama boleh dikirim ulang:
   `id` yang sama tidak dicatat dua kali.

### 8. Kalender dan Google Sheets (opsional)

- **Kalender:** buka tab **Transaksi otomatis**, bagian **Aturan Saya**. Tombol **Unduh kalender (.ics)** berisi
  tagihan berulang, jatuh tempo utang/piutang, dan target tabungan 6 bulan ke depan. Tombol **Salin URL langganan**
  memberi feed bertoken agar Google/Apple Calendar memperbarui sendiri tanpa unduh ulang.
- **Google Sheets otomatis:** jalankan `npm run db:setup` sekali untuk skema v7, lalu buka tab Laporan >
  Google Sheets, klik **Hubungkan Google Sheets**, pilih akun Google, dan setujui izin Drive. Server membuat
  spreadsheet privat **Money-Charger** dengan sheet **Transaksi**, mengisi seluruh transaksi, dan
  menyinkronkan ulang otomatis sekali sehari saat cron. Tidak perlu membuat spreadsheet atau menyalin URL.
  - Setiap akun yang menghubungkan Google mendapat spreadsheet sendiri. Menghubungkan ulang dengan akun Google
    yang sama memakai spreadsheet lama.
  - Pembuatan otomatis butuh izin OAuth, jadi baru terjadi setelah pengguna menekan tombol hubungkan. Register
    atau login dengan Google saja belum memberi izin Drive, sehingga spreadsheet tidak bisa dibuat saat register.
  - Aktifkan **Google Sheets API** di Google Cloud project, lalu tambahkan scope
    `https://www.googleapis.com/auth/drive.file` di OAuth consent screen. Redirect URI tetap
    `/api/auth/oauth/google/callback`.
  - Refresh token disimpan terenkripsi. Isi `GOOGLE_TOKEN_ENCRYPTION_KEY` dengan string acak panjang; bila kosong,
    server memakai `GOOGLE_CLIENT_SECRET` sebagai bahan kunci.
  - **Putuskan** menghapus koneksi dan token, tetapi tidak menghapus file spreadsheet dari Google Drive.
    Untuk membuat spreadsheet baru, putuskan lalu hubungkan ulang.
- **Cadangan Apps Script:** bila tidak ingin memberi akses Drive, buka bagian **Cadangan: web app Apps Script**
  di tab Laporan, lalu ikuti langkah di [`scripts/google-sheets.gs`](./scripts/google-sheets.gs).
  - Opsional: isi `SHEETS_WEBHOOK_SECRET` di server dan `SECRET` di script.
  - Setiap sinkron menyalin ulang seluruh transaksi (bukan incremental), jadi spreadsheet selalu mencerminkan
    data terbaru.

## Dashboard web

Buka `https://<domain-vercel-anda>/login`, pilih **Daftar akun baru**, lalu isi email dan password minimal 12 karakter. Akun pertama otomatis memiliki seluruh data lama. Login berikutnya memakai email/password atau tombol Google/Facebook yang sudah dikonfigurasi. Untuk lokal: `npm run dev`, buka `http://localhost:3000`, lalu daftar akun pertama.

Isi dashboard:

- **Ringkasan**: sisa uang, rasio terpakai, pendapatan/pengeluaran bulan ini, alokasi per grup, dan detail pos yang bisa dilipat.
- **Sisa aman**: batas belanja harian dari sisa jatah periode, rata-rata belanja 14 hari, dan perkiraan berapa hari saldo masih cukup.
- **Perubahan kategori**: kategori yang naik/turun paling besar dibanding bulan lalu di tab Rekap.
- **Wawasan**: skor kesehatan finansial, proyeksi pengeluaran/saldo akhir bulan, rasio tabungan, deteksi langganan bulanan, peringatan otomatis, dan daftar hal yang perlu diperhatikan.
- **Transaksi otomatis**: aturan tagihan/langganan bulanan (nama, nominal, tanggal, pos). Cron yang sama dengan antrean WhatsApp mencatat transaksi pada tanggal jatuh tempo dan tidak menggandakan bulan yang sama.
- **Impor mutasi CSV**: unggah/tempel CSV dengan kolom `tanggal,tipe,nominal` (opsional `label,pos,biaya_admin,wadah`), lengkap dengan deteksi duplikat.
- **Laporan**: pilih periode preset atau rentang tanggal kustom, lihat ringkasan pemasukan/pengeluaran per pos dan dompet, lalu cetak atau simpan PDF. Laporan mingguan/bulanan dapat dikirim otomatis ke WhatsApp dan email akun.
- **Privasi per akun**: setiap akun hanya bisa membaca dan mengubah transaksi, dompet, pos, serta anggarannya sendiri. Berbagi data lintas akun sudah dinonaktifkan; nomor WhatsApp dipetakan ke akun pemilik nomor. Setiap transaksi diberi rantai hash (HMAC bila `LEDGER_SECRET` diisi) dan status keutuhannya tampil di tab Transaksi.
- **Rencana**: slider jatah per pos, Dana Darurat, Tabungan, dan Investasi. Simpan membuat versi rencana baru (versi lama diarsipkan). Opsi "berlaku juga di periode berjalan" menyesuaikan gaji periode aktif dan mencatat selisih ke Saldo.
- **Transaksi**: catat pengeluaran, pemasukan, gaji, bonus, tarik, dan pindah; ubah pemasukan/pengeluaran yang masih berlaku; hapus transaksi (pembatalan, bukan hapus permanen). Riwayat bisa difilter per bulan, pos, dompet, dan kata kunci. Menghapus gaji juga membatalkan alokasi dan selisihnya.
- **Pos**: tambah pos (langsung masuk rencana aktif), ganti nama, tambah alias, nonaktifkan, dan setup awal sebelum gaji pertama.
- **Piutang**: catat piutang (orang berutang ke kita) dan utang (kita berutang), bayar sebagian/lunas, atau batalkan.
- **Target**: buat target tabungan (nama, nominal, target tanggal opsional), lihat saran sisihan per bulan/minggu, tambah tabungan sebagian demi sebagian, otomatis "Tercapai" saat terkumpul mencapai target.
- **Tren pengeluaran**: grafik batang 14 hari terakhir di Ringkasan, lengkap dengan total, rata-rata, dan hari tertinggi.
- **Asisten**: tanya jawab bebas tentang kondisi keuangan (pos paling boros, sisa uang, saran menabung) yang dijawab dari data dashboard, bukan tebakan.
- **Profil & keamanan**: ubah profil dan password, aktifkan 2FA TOTP, lihat/cabut sesi perangkat lain, dan unduh cadangan CSV terenkripsi AES-256-GCM.

Perubahan dari web dan WhatsApp memakai database yang sama. Dashboard menyegarkan data otomatis setiap 5 detik dan saat tab kembali aktif/fokus, jadi transaksi dari WhatsApp muncul tanpa hard reload. Respons dashboard memakai `no-store` agar tidak tertahan cache browser/CDN. Semua API dashboard wajib login; `/api/health` hanya
memberi status ringkas tanpa `HEALTH_TOKEN`.

Saat deploy, jalankan `npm run db:setup` untuk menerapkan skema akun, lalu daftar akun pertama lewat `/login`. Daftarkan callback OAuth `<origin>/api/auth/oauth/google/callback` dan `<origin>/api/auth/oauth/facebook/callback` di konsol provider. Profil akun (nama, email, foto, password, hapus akun) dikelola dari tab Profil dashboard.

## Perintah chat

Ketik `bantuan` di bot. Contoh: `out 25rb kopi`, `gaji masuk 1.8 juta`, `bonus 200rb`, `saldo`, `aman`, `sisa jajan`, `laporan`, `evaluasi`, `hapus terakhir`, `ekspor`.

Perintah tambahan: `piutang 100rb Andi` / `utang 50rb Budi` (catat), `piutang` / `utang` (lihat daftar aktif),
`bayar piutang Andi 50rb` / `lunasi piutang Andi`; `target 5 juta Laptop Baru` (buat target tabungan), `target`
(lihat progres), `nabung 100rb Laptop Baru` (tambah tabungan ke target itu).

### Foto struk / screenshot transaksi

Kirim foto struk belanja atau tangkapan layar transaksi bank/e-wallet ke bot (tanpa teks tambahan, atau dengan
caption bila perlu konteks). Groq vision membaca nominal total, nama toko, dan mencoba menebak posnya; hasilnya
langsung tercatat sebagai pengeluaran (ditandai "dibaca AI", bisa dibatalkan dengan `hapus terakhir`). Bila foto
tidak jelas atau nominal totalnya tidak terbaca, bot membalas minta foto ulang atau catat manual — tidak pernah
menebak nominal.

## Yang WAJIB dicek sebelum dipakai sungguhan

Hal ini belum bisa diverifikasi dari sandbox dan juga ditandai terbuka di SRS bagian 14:

1. **Batas waktu fungsi Vercel gratis.** Webhook hanya menyimpan job lalu membalas; pemrosesan AI dijalankan setelah respons (`maxDuration` 30 detik). Bila fungsi terhenti, job/outbox tetap tersimpan dan dicoba ulang oleh scheduler. Isi secrets agar worker terjadwal aktif.
2. **Verifikasi bisnis Meta** untuk pemakaian pribadi, dan apakah SIM cadangan bisa menerima OTP.
3. **Backup.** Neon punya pemulihan bawaan (cek jendela waktunya di paket gratis). Cadangan tambahan: ketik `ekspor` berkala dan simpan CSV-nya.
4. **Akurasi Groq untuk bahasa Indonesia** (AC-12): uji dengan 50 kalimat sebelum percaya penuh. 
Setiap catatan hasil AI selalu ditandai "(dibaca AI)" dan bisa dibatalkan dengan `hapus terakhir`.
   Dengan pratinjau (`ai konfirmasi on`, bawaan), catatan baru dibuat setelah balasan `ya`.
5. **Kuota Groq gratis** saat uji: 8.000 token/menit. Foto struk memakai ~1.900 token, jadi beberapa
   foto/pertanyaan beruntun bisa kena 429. Bot otomatis jatuh ke format kaku; tunggu sebentar lalu ulangi.
6. Versi API Meta di `WA_API_VERSION` (bawaan `v25.0`): samakan dengan versi yang didukung dan ditampilkan di Meta.

## Catatan perilaku yang perlu diketahui

- Sintaks `gaji` sengaja ketat: hanya `gaji [masuk] <nominal> [tgl <n>]`. Kalimat seperti "gaji udah masuk 1,8 juta" ditolak dengan contoh format, karena gaji menutup periode.
- Usulan evaluasi tidak dibuat bila periode yang ditutup tidak punya pengeluaran tercatat sama sekali (kalau tidak, semua jatah disarankan jadi Rp0).
- Gaji di bawah/atas total rencana: selisihnya masuk/keluar Saldo. Karena itu, setelah `set makan 400rb` total rencana menjadi Rp1.850.000, dan gaji Rp1,8 juta akan menampilkan selisih -Rp50.000. Sesuaikan pos lain bila ingin total tetap Rp1,8 juta.
