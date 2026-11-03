# Money-Charger

Bot WhatsApp pribadi untuk mencatat gaji dan pengeluaran. Tidak ada website: semua lewat chat.
Next.js (hanya API route) di Vercel + Postgres online di Neon + Groq (AI cadangan). Tidak perlu memasang DBMS di komputer.

Acuan: `prd-catatan-keuangan-whatsapp.md` dan `srs-catatan-keuangan-whatsapp.md`.

## Struktur

| Lokasi | Isi |
|---|---|
| `src/lib/engine.ts` | Mesin uang (fungsi murni): periode, jatah, Dana Darurat, Saldo, bonus, evaluasi |
| `src/lib/parse/` | Parser nominal, tanggal, alias pos, perintah |
| `src/lib/handler.ts` | Satu pesan masuk -> satu balasan (dalam satu transaksi database) |
| `src/lib/ai.ts` | Groq sebagai cadangan, beserta validasi hasil AI |
| `src/lib/pg-repo.ts` | Akses Neon Postgres. `mem-repo.ts` adalah versi memori untuk tes |
| `src/app/api/whatsapp/webhook/route.ts` | Webhook Meta (GET verifikasi, POST pesan) |
| `src/app/api/export/route.ts` | Unduh CSV (token 15 menit, sekali pakai) |
| `db/schema.sql` | Skema tabel |
| `tests/` | 93 tes, termasuk skenario AC-01 sampai AC-26 |

## Setup (urutan disarankan)

### 1. Neon (database)
1. Daftar di neon.tech, buat project, aktifkan 2FA.
2. Salin connection string yang **pooled** (host berisi `-pooler`) sebagai `DATABASE_URL`.

### 2. Groq (AI cadangan)
1. Daftar di console.groq.com, aktifkan 2FA.
2. **Nyalakan Zero Data Retention di pengaturan akun dulu**, baru buat API key.
3. Model awal `openai/gpt-oss-20b`. Ganti lewat `GROQ_MODEL` bila akurasinya kurang.
4. Bot tetap jalan tanpa Groq (`GROQ_API_KEY` kosong): kalimat bebas dibalas permintaan format kaku.

### 3. Meta WhatsApp Cloud API
1. Buat aplikasi Meta dengan use case **Connect with customers through WhatsApp** dan buka **Langkah 1. Cobalah**.
2. Untuk uji awal, gunakan nomor uji Meta dan tambahkan nomor WhatsApp pribadi sebagai penerima yang diizinkan. Kirim pesan uji dari halaman tersebut.
3. Catat `Phone Number ID` (`WA_PHONE_NUMBER_ID`) dan buat access token dari halaman API Setup (`WA_ACCESS_TOKEN`). Token uji dapat kedaluwarsa; gunakan hanya untuk pengujian.
4. Ambil **App Secret** dari **Pengaturan aplikasi > Dasar** (`WA_APP_SECRET`). Jangan bagikan token atau App Secret.
5. Untuk penggunaan berkelanjutan, siapkan kredensial produksi WhatsApp dan access token yang tidak kedaluwarsa seperti token System User (`WA_ACCESS_TOKEN`). Jangan mengandalkan token uji sementara.

### 4. Isi environment
Salin `.env.example` ke `.env.local` dan isi. `ALLOWED_NUMBERS` adalah nomor pribadi Anda, format `62812...` tanpa plus.
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
| `HEALTH_TOKEN` | opsional; bila diisi, `/api/health` hanya bisa dibuka dengan `?token=<nilai ini>` |

Di halaman Webhooks Meta, gunakan:

- **URL Callback**: `https://nama-proyek-anda.vercel.app/api/whatsapp/webhook`
- **Verifikasi token**: nilai rahasia yang sama persis dengan `WA_VERIFY_TOKEN` di Vercel
- Subscribe ke field **messages**

Nomor telepon, token, dan App Secret harus berasal dari aset Meta yang benar-benar Anda miliki; jangan mengisi data bisnis palsu. Setelah menyimpan environment variables di Vercel, lakukan redeploy.

### 5b. Diagnosa setelah deploy

Buka `https://<domain-vercel-anda>/api/health` (tambahkan `?token=<HEALTH_TOKEN>` bila variabel itu diisi). Endpoint ini hanya melaporkan **ada/tidaknya** variabel, tanpa menampilkan nilainya, ditambah status koneksi Neon.

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

Endpoint ini publik untuk memudahkan diagnosa. Isi `HEALTH_TOKEN` bila tidak ingin hasilnya dapat dibaca orang lain.

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

## Perintah chat

Ketik `bantuan` di bot. Contoh: `out 25rb kopi`, `gaji masuk 1.8 juta`, `bonus 200rb`, `saldo`, `sisa jajan`, `laporan`, `evaluasi`, `hapus terakhir`, `ekspor`.

## Yang WAJIB dicek sebelum dipakai sungguhan

Hal ini belum bisa diverifikasi dari sandbox dan juga ditandai terbuka di SRS bagian 14:

1. **Batas waktu fungsi Vercel gratis.** Webhook menyelesaikan semuanya (termasuk Groq sampai 20 detik) dalam satu permintaan, dan `maxDuration` diset 30. Kalau paket Anda membatasi lebih pendek, pesan format kaku tetap aman, tetapi pesan lewat AI bisa terpotong. Meta lalu mengirim ulang dan pencatatan ganda dicegah oleh ID pesan.
2. **Verifikasi bisnis Meta** untuk pemakaian pribadi, dan apakah SIM cadangan bisa menerima OTP.
3. **Backup.** Neon punya pemulihan bawaan (cek jendela waktunya di paket gratis). Cadangan tambahan: ketik `ekspor` berkala dan simpan CSV-nya.
4. **Akurasi Groq untuk bahasa Indonesia** (AC-12): uji dengan 50 kalimat sebelum percaya penuh. Setiap catatan hasil AI selalu ditandai "(dibaca AI)" dan bisa dibatalkan dengan `hapus terakhir`.
5. Versi API Meta di `WA_API_VERSION` (bawaan `v25.0`): samakan dengan versi yang didukung dan ditampilkan di Meta.

## Catatan perilaku yang perlu diketahui

- Sintaks `gaji` sengaja ketat: hanya `gaji [masuk] <nominal> [tgl <n>]`. Kalimat seperti "gaji udah masuk 1,8 juta" ditolak dengan contoh format, karena gaji menutup periode.
- Usulan evaluasi tidak dibuat bila periode yang ditutup tidak punya pengeluaran tercatat sama sekali (kalau tidak, semua jatah disarankan jadi Rp0).
- Gaji di bawah/atas total rencana: selisihnya masuk/keluar Saldo. Karena itu, setelah `set makan 400rb` total rencana menjadi Rp1.850.000, dan gaji Rp1,8 juta akan menampilkan selisih -Rp50.000. Sesuaikan pos lain bila ingin total tetap Rp1,8 juta.
