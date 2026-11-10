?# SRS — Fitur Premium Pribadi Money-Charger

| Atribut | Nilai |
|---|---|
| Status | Implementasi bertahap; pemakaian pribadi |
| Versi | 1.3 |
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
- AI Pro: review bulanan otomatis, tanya jawab seluruh riwayat di web dan WhatsApp (`tanya <pertanyaan>`), deteksi anomali.
- Kolaborasi keluarga: anggota, peran, persetujuan transaksi, nomor WhatsApp anggota.
- Keamanan: 2FA TOTP, manajemen sesi, ekspor terenkripsi.
- Integrasi email bank/e-wallet: deteksi penyedia, dompet sumber, dan pos otomatis.
- Integrasi kalender `.ics` dan sinkron Google Sheets via Apps Script.
- Peringatan dalam aplikasi.
- Skema versi v6 (`workspace_members`, nomor WhatsApp anggota, kolom 2FA).

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

### 2.8 Kolaborasi keluarga

- Tabel `workspace_members(owner_id, member_id, role, status, wa_number)`.
- `pemilikRequest` memetakan sesi anggota ke data pemilik workspace dan mengembalikan peran.
- Peran: `admin` (kelola penuh), `member` (transaksi diajukan), `viewer` (lihat saja).
- API `/api/keluarga`: daftar anggota, tambah/ubah peran/hapus, setujui/tolak transaksi.
- Persetujuan memakai `pending_actions` jenis `persetujuan_transaksi`.
- Anggaran dan dompet otomatis bersama karena memakai data pemilik yang sama.
- Nomor WhatsApp anggota masuk `allowed_numbers`; worker memetakan nomor ke pemilik lewat `workspace_members`.
- UI: `src/modules/finance/view/tab-keluarga.tsx`.

### 2.9 Keamanan dan sesi

- `src/lib/totp.ts`: base32, `kodeTotp`, `verifikasiTotp`, dan `otpauthUri`.
- Kolom `auth_users.totp_secret` dan `auth_users.totp_aktif` (skema v6).
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
- `src/lib/sheets.ts`: `bangunBarisSheets` (header + transaksi kronologis) dan `validasiUrlSheets` (hanya `https://script.google.com/macros/s/.../exec`).
- `src/modules/sheets/`: `/api/sheets` menyimpan URL web app dan mengirim salinan penuh transaksi.
- Sinkron otomatis: `prosesSinkronSheets(hariIni)` dipanggil cron `/api/cron/outbox` setelah review bulanan; `sudahSinkronHariIni(terakhir, hariIni)` membatasi maksimal sekali per hari WIB.
- Pemantauan cron: cron sukses mencatat `config.cron_terakhir` (global, `user_id` NULL); `/api/health` menampilkan `database.cronTerakhir` dan menambah peringatan via `cronBasi` bila belum pernah jalan atau >26 jam.
- Meter pemakaian: `src/lib/usage.ts` menambah counter `config` global `usage:<YYYY-MM>:<jenis>` (`ai_parse`, `ai_vision`, `ai_insight`) tiap panggilan AI; `pemakaianBulanIni` merangkum counter + hitungan `inbound_messages`/`outbox` bulan berjalan (WIB). Hanya jumlah, tanpa isi pesan/PII; tampil di `/api/health` (butuh `HEALTH_TOKEN`).
- `scripts/google-sheets.gs`: template web app Apps Script yang menulis ke sheet `Transaksi`; mendukung `SHEETS_WEBHOOK_SECRET` opsional.
- Status disimpan di `config` (`sheets_url`, `sheets_terakhir`, `kalender_token`), tanpa tabel baru.
- UI: tombol unduh `.ics` dan salin URL langganan di tab Transaksi otomatis; pengaturan dan sinkron Google Sheets di tab Laporan.

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

### FR-KEL - Kolaborasi keluarga

- **FR-KEL-01 MUST:** anggota diidentifikasi lewat email akun terdaftar; pemilik tidak bisa ditambahkan sebagai anggota.
- **FR-KEL-02 MUST:** peran `admin`, `member`, dan `viewer`; hanya pemilik/admin yang boleh mengelola anggota dan pengaturan.
- **FR-KEL-03 MUST:** `viewer` tidak boleh menulis; `member` mengajukan transaksi, bukan langsung mencatat.
- **FR-KEL-04 MUST:** pengajuan disimpan di `pending_actions` jenis `persetujuan_transaksi` dan kedaluwarsa setelah 7 hari.
- **FR-KEL-05 MUST:** persetujuan mencatat transaksi ke data pemilik dan tidak memproses pengajuan yang sama dua kali.
- **FR-KEL-06 MUST:** anggota memakai data pemilik sehingga anggaran dan dompet otomatis bersama.
- **FR-KEL-07 MUST:** nomor WhatsApp anggota opsional, unik, dan dipetakan ke pemilik workspace saat pesan masuk.
- **FR-KEL-08 SHOULD:** menghapus anggota membatalkan pengajuan yang masih menunggu.

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
- **FR-INT-04 MUST:** URL Google Sheets hanya menerima web app Apps Script HTTPS berakhiran `/exec`.
- **FR-INT-05 MUST:** sinkron Google Sheets mengirim salinan penuh transaksi dan tidak mengubah data lokal.
- **FR-INT-06 SHOULD:** sinkron mengirim `SHEETS_WEBHOOK_SECRET` bila dikonfigurasi dan mencatat waktu sinkron terakhir.
- **FR-INT-07 MUST:** feed kalender bertoken hanya valid untuk token yang tersimpan di `config.kalender_token`; token salah mendapat 401.
- **FR-INT-08 MUST:** URL langganan hanya dapat diminta pemilik yang login; token tidak pernah dicatat di log.
- **FR-INT-09 MUST:** sinkron Google Sheets otomatis berjalan maksimal sekali per hari WIB per pengguna dan dilewati bila URL kosong.
- **FR-INT-10 SHOULD:** kegagalan sinkron otomatis satu pengguna tidak menghentikan pengguna lain dan tidak menggagalkan cron.
- **FR-INT-11 MUST:** cron sukses mencatat `cron_terakhir`; health memperingatkan bila cron belum pernah jalan atau terakhir >26 jam.
- **FR-INT-12 MUST:** meter pemakaian hanya menyimpan jumlah per bulan per jenis; tidak ada isi pesan, nominal, atau nomor telepon.
- **FR-INT-13 MUST:** kegagalan mencatat/membaca meter tidak menggagalkan fitur AI maupun health.

## 4. Keamanan dan integritas

- Semua API recurring/import/accounts/laporan memakai `pemilikRequest`.
- `user_id` aturan berasal dari sesi, bukan body.
- Query aturan/CSV dibatasi `user_id` pemilik.
- Tidak ada token/password di log.
- `recurring_runs` mencegah duplikasi; jika insert transaksi gagal, reservasi run dihapus.
- Impor tidak menghapus atau menimpa transaksi lama.
- Semua API keluarga memakai `pemilikRequest` dan `tolakPeran`; `actorId` diambil dari sesi, bukan body.
- Persetujuan diklaim atomik (`status='diproses'`) agar klik ganda tidak membuat transaksi ganda.
- Nomor WhatsApp anggota unik dan dipetakan ke pemilik workspace; nomor dicabut saat anggota dihapus.
- Secret TOTP dan hash token sesi tidak pernah dikirim ke log; daftar sesi tidak mengirim hash token sesi saat ini ke client.
- Ekspor terenkripsi memakai salt dan IV acak per berkas; password tidak disimpan.
- Webhook email tetap memakai `EMAIL_INBOUND_SECRET` dan `EMAIL_ALLOWED_SENDERS`; isi email tidak dipercaya untuk `user_id`.
- URL Google Sheets dibatasi ke `script.google.com` agar server tidak bisa diarahkan ke host sembarang; rahasia webhook tidak disimpan di log.
- Token feed kalender 32 byte acak (base64url), hanya memberi akses baca `.ics`, dan dapat diganti dengan menghapus `config.kalender_token`.

## 5. Migrasi

- Skema v2 menambahkan `recurring_rules` dan `recurring_runs`.
- Skema v3 menambahkan `accounts` dan kolom dompet pada `transactions`.
- Skema v4 menambahkan `workspace_members` untuk kolaborasi keluarga.
- Skema v5 menambahkan `workspace_members.wa_number` dan indeks uniknya.
- Skema v6 menambahkan `auth_users.totp_secret` dan `auth_users.totp_aktif`.
- Jalankan `npm run db:setup` untuk menerapkan skema idempoten dan dompet utama.
- Sebelum migrasi berisiko, buat snapshot Neon.
- Marker versi dicatat di `schema_version`.
- Digest tidak menambah tabel; status kirim disimpan di `config`.
- Laporan lanjutan tidak menambah tabel; status dikirim disimpan di `config` (`laporan_aktif`, `laporan_jadwal`, `laporan_terakhir`).
- Impor email tidak menambah tabel; idempotensi memakai `email:<id>` di `pending_actions`.
- Kalender dan Google Sheets tidak menambah tabel; status disimpan di `config` (`sheets_url`, `sheets_terakhir`, `kalender_token`).

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

### Kolaborasi keluarga

- **AC-KEL-01:** transaksi dari `member` masuk sebagai pengajuan; dashboard pemilik belum berubah sampai disetujui.
- **AC-KEL-02:** dua permintaan setujui pada pengajuan yang sama hanya menghasilkan satu transaksi.
- **AC-KEL-03:** `viewer` ditolak (403) saat mencoba menulis atau menghapus data.
- **AC-KEL-04:** `member` melihat data pemilik setelah ditambahkan ke workspace.
- **AC-KEL-05:** pesan WhatsApp dari nomor anggota diproses pada workspace pemilik.
- **AC-KEL-06:** menghapus anggota mencabut nomornya dari `allowed_numbers` dan membatalkan pengajuan yang menunggu.

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
- **AC-INT-04:** URL `https://example.com/exec` ditolak.
- **AC-INT-05:** URL `https://script.google.com/macros/s/.../exec` diterima.
- **AC-INT-06:** sinkron mengirim seluruh transaksi dan tidak mengubah data lokal.
- **AC-INT-07:** `GET /api/kalender?token=salah` mendapat 401; token valid mendapat `text/calendar` tanpa login.
- **AC-INT-08:** dua kali `POST /api/kalender` mengembalikan token yang sama.
- **AC-INT-09:** dua cron pada hari WIB yang sama hanya menjalankan satu sinkron Sheets otomatis per pengguna.
- **AC-INT-10:** pengguna tanpa `sheets_url` dilewati tanpa error.
- **AC-INT-11:** `cron_terakhir` kosong atau >26 jam memunculkan peringatan di health; cron dalam 26 jam tidak.
- **AC-INT-12:** counter pemakaian bertambah per panggilan AI dengan kunci `usage:<YYYY-MM>:<jenis>` dan tidak memuat isi pesan.
- **AC-INT-13:** health tanpa `HEALTH_TOKEN` tidak menampilkan pemakaian; dengan token menampilkan agregat bulan berjalan.

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

### 7.5 Keamanan dan paywall (sudah diimplementasikan)

- 2FA TOTP, manajemen sesi, dan ekspor terenkripsi sudah diimplementasikan (bagian 2.9).
- OAuth tidak melewati pemeriksaan 2FA; akun ber-2FA wajib login dengan password + TOTP.
- Paywall/billing tetap di luar lingkup selama aplikasi dipakai pribadi.

### 7.6 Impor email bank/e-wallet (sudah diimplementasikan)

- Deteksi penyedia dari domain/teks dan pengambilan dompet sumber (bagian 2.10).
- Pencocokan dompet dan pos hanya bila hasilnya tunggal.

### 7.7 Kalender dan Google Sheets (sudah diimplementasikan)

- Kalender `.ics` berisi tagihan berulang, jatuh tempo utang/piutang, dan target tabungan 6 bulan.
- Kalender dapat diunduh manual atau dilanggan via URL bertoken sehingga aplikasi kalender memperbarui sendiri.
- Google Sheets memakai web app Apps Script; tidak perlu OAuth atau service account.
- Sinkron bersifat salinan penuh (bukan incremental) agar spreadsheet selalu mencerminkan data terbaru.
- Sinkron berjalan manual (tombol) dan otomatis sekali sehari via cron bila URL tersimpan.

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
| F-PREM-08 | FR-KEL | AC-KEL |
| F-PREM-09 | FR-SEC | AC-SEC |
| F-PREM-10 | FR-EML, FR-INT | AC-EML, AC-INT |
