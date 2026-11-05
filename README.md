# Money-Charger

Bot WhatsApp pribadi untuk mencatat gaji dan pengeluaran, plus dashboard web ringkas untuk melihat ringkasan, mengatur jatah, dan mengelola transaksi/pos.
Next.js di Vercel + Postgres online di Neon + Groq (AI cadangan). Tidak perlu memasang DBMS di komputer.

Acuan: [PRD Money-Charger SaaS](./prd-catatan-keuangan-whatsapp.md) dan [SRS](./srs-catatan-keuangan-whatsapp.md).

## Struktur

| Lokasi | Isi |
|---|---|
| `src/lib/engine.ts` | Mesin uang (fungsi murni): periode, jatah, Dana Darurat, Saldo, bonus, evaluasi |
| `src/lib/parse/` | Parser nominal, tanggal, alias pos, perintah |
| `src/lib/handler.ts` | Aturan domain pemrosesan pesan dan transaksi |
| `src/lib/ai.ts` | Groq sebagai cadangan bahasa bebas, beserta validasi hasil AI |
| `src/lib/ai-vision.ts` | Groq vision untuk membaca foto struk/transaksi, beserta validasi hasil |
| `src/lib/insight.ts` | Konteks keuangan untuk asisten AI + klien Groq tanya jawab (tab Asisten) |
| `src/lib/pg-repo.ts` | Akses Neon Postgres. `mem-repo.ts` adalah versi memori untuk tes |
| `src/modules/whatsapp/` | Modul HMVC webhook: controller, model, dan respons |
| `src/modules/finance/` | Modul HMVC keuangan/dashboard: controller, model, view, dan halaman dashboard |
| `src/modules/auth/` | Modul HMVC autentikasi dashboard |
| `src/modules/export/` | Modul HMVC unduh CSV |
| `src/modules/health/` | Modul HMVC diagnosa kesiapan |
| `src/modules/email/` | Modul HMVC penerima email payroll generik (`/api/email/inbound`) |
| `src/modules/insight/` | Modul HMVC asisten tanya jawab keuangan (`/api/insight`) |
| `src/lib/email.ts` | Heuristik ekstraksi nominal & deteksi "gaji/payroll" dari teks email |
| `src/app/api/` | Adapter Next.js tipis yang meneruskan request ke controller modul |
| `src/app/page.tsx` | Adapter halaman dashboard Next.js |
| `src/app/login/` | Halaman login password |
| `src/lib/auth.ts` | Sesi cookie HMAC (`DASHBOARD_PASSWORD` + `AUTH_SECRET`) |
| `src/lib/dashboard.ts` | View-model dashboard dari `State` + engine |
| `src/lib/web-actions.ts` | Aksi web: simpan rencana, transaksi, pos, setup |
| `db/schema.sql` | Skema tabel |
| `tests/` | 135 tes, termasuk skenario AC-01 sampai AC-26, aksi web, piutang/utang, target tabungan, biaya admin, foto struk, tren pengeluaran, konteks asisten, dan controller HMVC |

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

### 3. Meta WhatsApp Cloud API
1. Buat aplikasi Meta dengan use case **Connect with customers through WhatsApp** dan buka **Langkah 1. Cobalah**.
2. Untuk uji awal, gunakan nomor uji Meta dan tambahkan nomor WhatsApp pribadi sebagai penerima yang diizinkan. Kirim pesan uji dari halaman tersebut.
3. Catat `Phone Number ID` (`WA_PHONE_NUMBER_ID`) dan buat access token dari halaman API Setup (`WA_ACCESS_TOKEN`). Token uji dapat kedaluwarsa; gunakan hanya untuk pengujian.
4. Ambil **App Secret** dari **Pengaturan aplikasi > Dasar** (`WA_APP_SECRET`). Jangan bagikan token atau App Secret.
5. Untuk penggunaan berkelanjutan, siapkan kredensial produksi WhatsApp dan access token yang tidak kedaluwarsa seperti token System User (`WA_ACCESS_TOKEN`). Jangan mengandalkan token uji sementara.

### 4. Isi environment
Salin `.env.example` ke `.env.local` dan isi. `ALLOWED_NUMBERS` adalah nomor pribadi Anda, format `62812...` tanpa plus.
Isi `DASHBOARD_PASSWORD` dengan password kuat untuk halaman web. `AUTH_SECRET` opsional; bila kosong, cookie ditandatangani dengan password tersebut. Tanpa `DASHBOARD_PASSWORD`, halaman web menolak login tetapi bot WhatsApp tetap berjalan.
Untuk percobaan lokal, isi variabel WhatsApp berikut sesuai API Setup Meta: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`. Buat sendiri nilai acak untuk `WA_VERIFY_TOKEN`; gunakan nilai yang sama saat mendaftarkan webhook. Versi Graph API bawaan adalah `v25.0`; samakan dengan versi yang ditampilkan Meta.

```bash
npm install
npm run db:setup     # membuat tabel, mengisi Draft 1 + alias, dan whitelist nomor
npm test             # opsional, memastikan mesin uang benar
```

### 5. Deploy ke Vercel
1. Push ke repo GitHub baru (akun terpisah dari Redigma), import di Vercel.
2. Di **Vercel > Project > Settings > Environment Variables**, tambahkan variabel yang sama dengan `.env.example` untuk **Production**. Untuk uji awal, masukkan token uji Meta; jangan masukkan rahasia ke Git atau chat. Isi `APP_BASE_URL` dengan URL production Vercel Anda.
3. Redeploy setelah menambah atau mengubah environment variables.
4. Di pengaturan WhatsApp aplikasi Meta, daftarkan webhook:
   - Callback URL: `https://<domain-vercel-anda>/api/whatsapp/webhook`
   - Verify token: nilai `WA_VERIFY_TOKEN` yang sama persis dengan di Vercel
   - Subscribe ke field `messages`
5. Setelah webhook terverifikasi, kirim `bantuan` dari nomor penerima uji yang sudah diizinkan Meta. Untuk nomor produksi, pastikan nomor pengirim juga ada di `ALLOWED_NUMBERS`.

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
| `DASHBOARD_PASSWORD` | password kuat untuk login dashboard web |
| `AUTH_SECRET` | opsional; string acak panjang untuk menandatangani cookie sesi |
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
melihat detail diagnosa; detail hanya bisa dibaca dengan header token.

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

### 7. Email payroll otomatis (opsional, generik)

`POST /api/email/inbound` mencatat email masuk sebagai **gaji** (bila subjek/isi menyebut "gaji"/"payroll"/"salary"/"upah"/"THR")
atau **pemasukan biasa** ke Saldo. Endpoint ini **tidak terikat ke satu bank atau penyedia email tertentu**: kirim
request JSON dari layanan forwarding email pilihan Anda (mis. Resend Inbound, Cloudflare Email Workers, Mailgun Routes,
atau Zapier/Make yang membaca email lalu memanggil webhook ini).

1. Isi `EMAIL_INBOUND_SECRET` dengan string acak panjang di `.env.local` dan di Vercel, lalu redeploy.
2. Konfigurasikan penyedia forwarding email Anda untuk meneruskan email BSI Syariah payroll ke endpoint ini sebagai
   `POST https://<domain-vercel-anda>/api/email/inbound`, dengan header `X-Email-Secret: <EMAIL_INBOUND_SECRET>`.
   Secret lewat query string tidak lagi diterima agar tidak bocor ke log/proxy.
3. Body JSON yang dikenali:

   ```json
   {
     "id": "id-unik-email-ini",
     "from": "noreply@bsimobile.example",
     "subject": "Notifikasi Gaji Diterima",
     "text": "Dana masuk Rp1.800.000 ke rekening Anda...",
     "nominal": 1800000
   }
   ```

   - `id` wajib dan harus unik per email (dipakai untuk mencegah pencatatan ganda bila penyedia mengirim ulang).
   - `nominal` opsional tapi **sangat disarankan** diisi langsung oleh penyedia (lebih akurat). Bila kosong, server
     mencoba mengambil angka rupiah pertama dari `text`/`html` dengan heuristik sederhana (`Rp1.800.000`, `2.500.000`, dst).
   - Tanggal yang dipakai selalu tanggal hari ini (WIB) saat email diproses, bukan tanggal di isi email.

4. Uji dengan `curl`/Postman sebelum menyambungkan penyedia sungguhan, supaya format JSON dan heuristik nominal sudah
   sesuai dengan contoh email BSI Syariah Anda yang sebenarnya.

Catatan penting: parser nominal ini adalah heuristik umum, **belum disesuaikan dengan format email BSI Syariah yang
sebenarnya** karena belum ada contoh email asli. Setelah menerima contoh (boleh dengan nominal/identitas disamarkan),
sesuaikan `ekstrakNominalEmail` di `src/lib/email.ts` agar presisi, dan pertimbangkan mengirim `nominal` langsung dari
penyedia forwarding bila formatnya mendukung ekstraksi di sisi mereka.

## Dashboard web

Buka `https://<domain-vercel-anda>/login` lalu masukkan `DASHBOARD_PASSWORD`. Untuk lokal: `npm run dev`, buka `http://localhost:3000`, dan lihat nilai `DASHBOARD_PASSWORD` di `.env.local`.

Isi dashboard:

- **Ringkasan**: sisa uang, rasio terpakai, pendapatan/pengeluaran bulan ini, alokasi per grup, dan detail pos yang bisa dilipat.
- **Rencana**: slider jatah per pos, Dana Darurat, Tabungan, dan Investasi. Simpan membuat versi rencana baru (versi lama diarsipkan). Opsi "berlaku juga di periode berjalan" menyesuaikan gaji periode aktif dan mencatat selisih ke Saldo.
- **Transaksi**: catat pengeluaran, pemasukan, gaji, bonus, tarik, dan pindah; hapus transaksi (pembatalan, bukan hapus permanen). Menghapus gaji juga membatalkan alokasi dan selisihnya.
- **Pos**: tambah pos (langsung masuk rencana aktif), ganti nama, tambah alias, nonaktifkan, dan setup awal sebelum gaji pertama.
- **Piutang**: catat piutang (orang berutang ke kita) dan utang (kita berutang), bayar sebagian/lunas, atau batalkan.
- **Target**: buat target tabungan (nama, nominal, target tanggal opsional), tambah tabungan sebagian demi sebagian, otomatis "Tercapai" saat terkumpul mencapai target.
- **Tren pengeluaran**: grafik batang 14 hari terakhir di Ringkasan, lengkap dengan total, rata-rata, dan hari tertinggi.
- **Asisten**: tanya jawab bebas tentang kondisi keuangan (pos paling boros, sisa uang, saran menabung) yang dijawab dari data dashboard, bukan tebakan.

Perubahan dari web dan WhatsApp memakai database yang sama. Dashboard menyegarkan data otomatis setiap 5 detik dan saat tab kembali aktif/fokus, jadi transaksi dari WhatsApp muncul tanpa hard reload. Respons dashboard memakai `no-store` agar tidak tertahan cache browser/CDN. Semua API dashboard wajib login; `/api/health` hanya
memberi status ringkas tanpa `HEALTH_TOKEN`.

Saat deploy, tambahkan `DASHBOARD_PASSWORD` (dan `AUTH_SECRET` bila dipakai) di Vercel, lalu redeploy. Tanpa itu halaman login akan menampilkan pesan bahwa password belum diatur.

## Perintah chat

Ketik `bantuan` di bot. Contoh: `out 25rb kopi`, `gaji masuk 1.8 juta`, `bonus 200rb`, `saldo`, `sisa jajan`, `laporan`, `evaluasi`, `hapus terakhir`, `ekspor`.

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

1. **Batas waktu fungsi Vercel gratis.** Webhook menyelesaikan semuanya (termasuk Groq sampai 20 detik) dalam satu permintaan, dan `maxDuration` diset 30. Kalau paket Anda membatasi lebih pendek, pesan format kaku tetap aman, tetapi pesan lewat AI bisa terpotong. Meta lalu mengirim ulang dan pencatatan ganda dicegah oleh ID pesan.
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
