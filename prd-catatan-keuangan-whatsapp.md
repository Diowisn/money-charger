# PRD — Money-Charger SaaS

| Atribut | Nilai |
|---|---|
| Status | Draft implementasi bertahap; penggunaan awal pribadi |
| Versi | 1.1 |
| Tanggal | 9 November 2026 |
| Pemilik | Product owner Money-Charger |
| Dokumen teknis | [SRS](./srs-catatan-keuangan-whatsapp.md) |
| Model produk | Aplikasi pribadi sekarang; SaaS multi-tenant sebagai sasaran masa depan |

> Dokumen ini memisahkan persiapan yang aman untuk aplikasi pribadi dari fitur yang baru diperlukan saat menerima pelanggan berbayar. Rancangan SaaS adalah sasaran, bukan klaim bahwa fitur tersebut sudah tersedia. Kewajiban hukum, kontrak pemroses data, kebijakan Meta, dan pajak perlu ditinjau sebelum peluncuran komersial.

## 1. Ringkasan produk

Money-Charger membantu pemilik mencatat pemasukan dan pengeluaran dalam rupiah melalui WhatsApp, lalu melihat keadaan keuangan dan mengatur anggaran lewat dashboard web. Tahap implementasi saat ini tetap aplikasi pribadi. Arsitektur dan keputusan data dibuat agar transisi ke SaaS berbayar kelak mungkin dilakukan dengan migrasi terencana, bukan dengan mengaktifkan pelanggan di sistem yang belum siap.

Sistem memberi ringkasan pencatatan dan anggaran, bukan rekening bank, layanan pembayaran, pembukuan pajak, atau nasihat investasi. Jika kelak dipasarkan, AI hanya membantu memahami teks dan harus tunduk pada aturan validasi serta mekanisme koreksi transparan.

## 2. Latar belakang dan masalah

Versi berjalan sudah memiliki pencatatan WhatsApp, mesin anggaran, dashboard, autentikasi pengguna, dan ekspor. Namun desain data/integrasi belum boleh dianggap siap untuk banyak pelanggan: sejumlah tabel operasional tidak memiliki pemilik/tenant dan aturan nomor WhatsApp masih memiliki asumsi global. Pemakaian pribadi dapat dilanjutkan, tetapi membuka akses pelanggan luar sebelum audit dan perbaikan isolasi berisiko membocorkan data.

Kebutuhan sekarang adalah membuat aplikasi pribadi aman, andal, dapat dicadangkan, dan mudah dimigrasikan. Kebutuhan komersial—tenant, onboarding pelanggan, dukungan, billing, privasi operasional, serta pemulihan—baru menjadi gerbang wajib jika keputusan membuka layanan dibuat. Refaktor HMVC atau multi-tenant penuh bukan tujuan tersendiri.

## 3. Tujuan

1. Mempertahankan penggunaan pribadi yang aman dan tidak mengganggu catatan keuangan yang sudah ada.
2. Memudahkan pencatatan via WhatsApp dan peninjauan/koreksi lewat dashboard.
3. Mencegah transaksi ganda/hilang, serta memastikan kegagalan balasan terlihat dan dapat dipulihkan.
4. Menyediakan ekspor, backup, pemulihan, dan migrasi data yang dapat diverifikasi.
5. Menjaga batas autentikasi, secrets, dan akses data agar fondasi siap diaudit sebelum pelanggan luar diizinkan.
6. Menentukan prasyarat produk, teknis, biaya, dan hukum sebelum paket berbayar diaktifkan.

## 4. Bukan tujuan (rilis awal)

- Mengakses rekening bank, menginisiasi pembayaran, menyimpan kredensial perbankan, atau merekonsiliasi mutasi bank.
- Memberi rekomendasi investasi, kredit, pajak, atau nasihat finansial profesional.
- Mengelola keuangan perusahaan, banyak mata uang, atau pembukuan akuntansi formal.
- Mendukung percakapan grup WhatsApp sebagai ruang keuangan bersama.
- Menjamin interpretasi AI selalu benar atau menyimpan transaksi yang tidak dipahami tanpa memberi tahu pengguna.
- Mengaktifkan banyak pelanggan pada database lama sebelum migrasi dan pemeriksaan isolasi lulus.

## 5. Pengguna dan pemangku kepentingan

### Persona

**Pelanggan individu**  
Ingin mencatat pengeluaran tanpa membuka aplikasi keuangan dan melihat jatah bulanan/periode secara sederhana.

**Pelanggan yang mengutamakan kontrol data**  
Ingin tahu data apa yang diproses AI, dapat mematikannya, mengekspor catatan, dan menutup akun.

**Operator dukungan**  
Membantu onboarding dan diagnosis tanpa dapat membaca data keuangan pelanggan secara default.

**Administrator layanan**  
Mengelola status tenant dan integrasi operasional melalui akses terpisah, terbatas, tercatat, dan dapat diaudit.

### Pekerjaan utama

- “Catat pengeluaran beberapa detik setelah transaksi.”
- “Ketahui jatah yang masih tersedia dan di pos mana uang digunakan.”
- “Perbaiki catatan salah tanpa menghilangkan jejak perubahan.”
- “Pindah nomor/perangkat atau berhenti menggunakan layanan dengan kontrol atas data.”

## 6. Prinsip produk

1. **Isolasi sebagai default:** tenant berasal dari sesi/konteks integrasi yang sudah diverifikasi, tidak pernah dari `tenantId` bebas yang dikirim klien.
2. **Catatan dapat dijelaskan:** setiap angka ringkasan dapat ditelusuri ke transaksi dan versi rencana.
3. **AI tidak berwenang atas uang:** AI mengusulkan interpretasi; domain memvalidasi nominal, tanggal, jenis, dan kategori.
4. **Gagal dengan jujur:** status pending/gagal harus tampak, bukan respons sukses palsu.
5. **Vendor dapat diganti:** domain memakai antarmuka untuk database, identitas, WhatsApp, AI, queue, email, billing, dan secret management.
6. **Minimasi data:** simpan hanya yang dibutuhkan untuk fitur, keamanan, dukungan, dan kewajiban yang telah ditinjau.

## 7. Lingkup dan urutan rilis

### Rilis 0 — Persiapan aplikasi pribadi (prioritas sekarang)

Tujuan: terus memakai Money-Charger sendiri, sambil mengurangi biaya perubahan bila produk kelak dibuka ke pelanggan. Tidak ada signup publik, billing aktif, atau janji layanan komersial pada tahap ini.

- Pertahankan akun dan data pemilik saat ini; migrasi harus punya snapshot, rekonsiliasi jumlah transaksi/saldo, uji staging, dan rollback.
- Selesaikan fitur inti pribadi: pemasukan, pengeluaran, pos, anggaran, saldo/wadah, laporan, koreksi, ekspor, dan pencatatan WhatsApp yang andal.
- Rapikan batas modul untuk identitas pengguna, hak akses, integrasi, dan transaksi. Siapkan pemetaan pemilik/workspace di desain, tetapi jangan menambah abstraksi tenant yang belum dipakai.
- Pastikan setiap query sensitif terikat ke identitas sesi pemilik; lindungi webhook, ekspor, admin/operasi, dan secrets. Backup serta uji pemulihan wajib.
- Siapkan entitlement sederhana di domain hanya bila diperlukan untuk memisahkan fitur gratis/berbayar kelak; jangan membuat tabel harga, checkout, payment provider, atau subscription worker sekarang.
- Tambahkan konfigurasi fitur yang dapat dimatikan dan pencatatan versi skema/migrasi. Hindari hard-code keputusan paket di banyak route.
- Ukur penggunaan dan biaya WhatsApp, AI, database, dan hosting tanpa merekam isi transaksi di telemetry.
- Catat keputusan produk terbuka: target pasar, paket, harga, kuota, kebijakan pembatalan/refund, gateway, dan kanal dukungan. Belum perlu diputuskan untuk pemakaian pribadi.

### Rilis 1 — SaaS beta tertutup (hanya setelah keputusan membuka ke pengguna luar)

Gerbang masuk: pemilik menyetujui pilot eksternal; audit isolasi dan keamanan lulus; kebijakan privasi, syarat, dukungan, biaya, dan proses penghapusan siap. Jika gerbang belum dipenuhi, tetap di Rilis 0.

- Registrasi/undangan, login individual, verifikasi email, reset kata sandi, sesi yang dapat dicabut, dan pengelolaan profil dasar.
- Tenant/workspace pribadi per pelanggan; otorisasi server-side dan isolasi menyeluruh untuk query, cache, ekspor, laporan, webhook, antrean, dan admin.
- Onboarding terpandu: zona waktu, tanggal mulai, saldo awal, rencana anggaran, dan penautan nomor WhatsApp.
- Satu nomor WhatsApp per tenant melalui proses Meta resmi yang disetujui; Embedded Signup keputusan terpisah.
- Riwayat transaksi tenant dengan pencarian/filter dasar dan pagination server-side.
- AI opsional dengan persetujuan eksplisit, penjelasan pemrosesan, indikator sumber, dan konfirmasi untuk hasil ambigu.
- Idempotensi pesan masuk, outbox, retry, log tersanitasi, pemantauan, dukungan, ekspor, dan penutupan akun.
- Pilot terbatas; jangan mengaktifkan pembayaran manual tanpa harga, ketentuan, penagihan, dan dukungan yang disampaikan serta disetujui.

### Rilis 2 — Peluncuran berbayar (P1)

Gerbang masuk: pilot memberi bukti kebutuhan dan willingness-to-pay; ekonomi unit diketahui; target pasar, provider, pajak/nota, refund, pembatalan, dukungan, dan ketentuan telah diputuskan serta ditinjau. Rilis ini tidak diperlukan untuk penggunaan pribadi.

- Paket, harga, entitlement, batas pemakaian, checkout, webhook pembayaran terverifikasi, invoice/nota sesuai tinjauan bisnis dan legal.
- Siklus langganan: aktif, gagal bayar, masa tenggang, ditangguhkan, dibatalkan, kedaluwarsa, refund; idempotensi dan rekonsiliasi transaksi.
- Portal pelanggan untuk melihat paket/status, memperbarui metode pembayaran melalui provider, mengunduh dokumen, dan membatalkan.
- Perubahan paket efektif dan prorata ditetapkan secara eksplisit; pembatasan fitur tidak menghapus atau merusak data pelanggan.
- Admin terbatas untuk melihat status pembayaran dan memperbaiki kasus melalui tindakan audit; jangan simpan data kartu.
- Uji sandbox dan skenario webhook duplikat/tidak berurutan, timeout, kegagalan provider, refund, serta pemulihan.
- Onboarding WhatsApp mandiri, anggota bersama, impor, dan notifikasi hanya bila kebutuhan dan kepatuhan sudah divalidasi.

### Rilis 3 — Pertumbuhan (P2)

- Beberapa nomor/integrasi per tenant, dukungan format/pesan dan bahasa lain, laporan lanjutan berdasarkan riset.
- API publik/mitra dan AI tambahan hanya setelah kebutuhan, otorisasi, batas biaya, privasi, dan keselamatan tervalidasi.

## 8. Alur utama

### 8.1 Registrasi dan aktivasi

1. Pengguna membuat akun atau menerima undangan beta.
2. Sistem memverifikasi alamat email dan menerima persetujuan syarat layanan serta kebijakan privasi yang versinya dicatat.
3. Sistem membuat tenant pribadi dan keanggotaan pemilik.
4. Pengguna mengisi setup awal serta meninjau penjelasan bahwa saldo adalah angka pencatatan manual, bukan saldo bank.
5. Pengguna menghubungkan satu nomor WhatsApp melalui alur yang disetujui, memverifikasi kepemilikan, dan melihat status koneksi.
6. Pengguna mengirim pesan uji; sistem mengonfirmasi tenant/nomor yang terhubung tanpa menampilkan rahasia.
7. Pengguna memilih apakah AI boleh digunakan. Tanpa persetujuan, parser deterministik dan format baku tetap berfungsi.

### 8.2 Catat dan koreksi

1. Pengguna mengirim transaksi teks ke nomor bot.
2. Sistem memverifikasi tanda tangan webhook, memetakan nomor penerima bot ke integrasi aktif, dan memastikan nomor pengirim adalah anggota yang berhak.
3. Pesan dicatat idempoten. Format baku diproses deterministik. Teks bebas hanya dikirim ke AI bila diizinkan.
4. Jika hasil AI memiliki ambiguitas/risiko, sistem meminta konfirmasi; transaksi belum mengubah saldo sampai dikonfirmasi.
5. Sistem menyimpan transaksi dan balasan outbox dalam satu transaksi database.
6. Worker mengirim balasan dan mencatat hasil. Bila gagal, sistem retry dan memberi cara mengecek status.
7. Pengguna dapat mengoreksi atau membatalkan catatan; riwayat audit menjelaskan perubahan.

### 8.3 Tutup akun

1. Pengguna meminta ekspor dan penutupan akun setelah autentikasi ulang.
2. Sistem menjelaskan periode pembatalan/penundaan yang berlaku, data dan integrasi yang akan dihapus, serta retensi cadangan/log.
3. Integrasi WhatsApp dicabut dan tenant dinonaktifkan agar tidak menerima pesan baru.
4. Data operasional dihapus atau dianonimkan setelah masa retensi yang disepakati, termasuk proses kedaluwarsa backup; hasilnya tercatat.

## 9. Kebutuhan produk (prioritas)

### P0 — wajib sebelum beta dengan pelanggan luar

- Tenant dan otorisasi server-side untuk seluruh tabel, query, ekspor, antrean, laporan, dan halaman.
- Akun individual; tidak ada password bersama lintas pelanggan.
- Jalur onboarding dan nomor WhatsApp yang tidak membocorkan token/kredensial.
- Metrik, log tersanitasi, alert untuk kegagalan pesan/queue/database, backup, dan uji pemulihan.
- Persetujuan AI yang dapat dicabut; transaksi ambigu tidak disimpan otomatis.
- Kebijakan privasi, syarat layanan, persetujuan, kontak dukungan, dan proses penghapusan yang telah ditinjau.
- Migrasi tenant pertama dari data pemilik saat ini dengan rekonsiliasi dan rollback.
- Keamanan endpoint login, health, ekspor, dashboard, dan tugas internal.

### P1 — wajib sebelum skala penjualan umum

- Billing/entitlements dan portal pembatalan/paket.
- Self-service WhatsApp onboarding dan rotasi/revokasi token bila dapat dilakukan dengan aman.
- Pencarian/paginasi riwayat dan alat dukungan yang terotorisasi.
- Administrasi/dukungan terpisah dengan audit akses.
- Uji beban, batas penggunaan, estimasi biaya pelanggan, dan prosedur insiden.

## 10. Ukuran keberhasilan

Target berikut usulan, bukan klaim performa saat ini. Tahap pribadi dinilai dari reliabilitas dan keselamatan data; metrik komersial baru berlaku sebelum pilot/penjualan.

- **Keutuhan data pribadi:** migrasi/restore mempertahankan jumlah transaksi dan hasil saldo terrekonsiliasi; tidak ada kehilangan diam-diam.
- **Keberhasilan pencatatan:** pesan berformat baku yang sah tercatat tepat satu kali atau ditolak dengan alasan yang dapat dipahami.
- **Reliabilitas balasan:** status gagal terlihat dan dapat dipulihkan; ukur waktu kirim ketika API provider tersedia.
- **Pemulihan:** backup terjadwal dan restore berhasil diuji sebelum perubahan skema berisiko.
- **Keamanan sebelum pelanggan luar:** 100% tes otorisasi lintas-tenant lulus; tidak ada kebocoran lintas tenant pada pengujian rilis.
- **Pilot:** ukur aktivasi, pengguna aktif, kesalahan/koreksi, tiket dukungan, dan churn; jangan optimalkan jumlah transaksi tanpa mengukur kesalahan.
- **Ekonomi unit sebelum harga publik:** biaya infrastruktur, provider pesan, AI, pembayaran, dan dukungan per pelanggan terukur; harga dan batas pemakaian menutup biaya serta punya alasan produk.

## 11. Keamanan, privasi, dan kepercayaan

- Data keuangan dianggap rahasia. Tenant tidak dapat melihat tenant lain, termasuk melalui ID yang ditebak, tautan ekspor, error, cache, laporan, dan dukungan.
- Terapkan least privilege dan autentikasi ulang untuk ekspor, perubahan kredensial, penghapusan akun, dan perubahan peran sensitif.
- Rahasia provider per tenant tidak disimpan dalam teks biasa; gunakan enkripsi dengan pengelolaan kunci yang dapat dirotasi dan audit akses.
- Jangan menulis token, isi pesan, alamat lengkap, atau data transaksi ke log analitik. Masking nomor bukan pengganti kebijakan minimasi data.
- Dokumentasikan penerima/pemroses data, tujuan, retensi, transfer lintas negara bila relevan, dan pilihan AI. Verifikasi perjanjian/konfigurasi aktual penyedia; jangan mengasumsikan mode retensi tertentu aktif.
- Pelanggan dapat mengekspor dan meminta penghapusan. Retensi hukum, cadangan, dan masa penghapusan akhir harus disepakati serta ditinjau legal.
- Akses dukungan terhadap data pelanggan ditolak secara default, terbatas pada persetujuan/insiden yang sah, berjangka, dan tercatat.
- Dokumen ini bukan nasihat hukum; lakukan peninjauan hukum/perlindungan data dan persyaratan bisnis sebelum peluncuran.

## 12. Operasi dan dukungan

- Status layanan untuk database, penerimaan webhook, antrean, pengiriman pesan, AI, dan billing; endpoint publik tidak boleh mengungkap rahasia atau rincian internal.
- Dashboard internal memantau error, latensi, backlog, retry, pesan gagal, kuota provider, dan biaya agregat.
- Runbook: token WhatsApp kedaluwarsa, webhook invalid, backlog, database tidak tersedia, AI timeout/kuota, pemulihan data, pencabutan akun, dan insiden privasi.
- Tentukan kanal/jam dukungan, target respons, tingkat eskalasi, dan cara pelanggan memberi contoh masalah tanpa mengirim data sensitif.
- Catat audit untuk perubahan tenant, peran, integrasi, billing, ekspor, dan tindakan dukungan.

## 13. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Query lupa menyaring tenant | Kebocoran data antar pelanggan | Tenant context wajib, repository terisolasi, kebijakan database defense-in-depth, tes negatif |
| Webhook duplikat/urutan ulang | Catatan ganda atau periode salah | Kunci idempotensi provider + tenant, urutan berdasarkan timestamp, kasus koreksi |
| Balasan gagal sesudah transaksi tersimpan | Pengguna tidak tahu status pencatatan | Transactional outbox, retry, status pesan dan rekonsiliasi |
| AI salah membaca nominal/pos | Catatan keuangan salah | Persetujuan eksplisit, validasi, tidak menjalankan intent ambigu, undo/audit |
| Token integrasi bocor | Akun WhatsApp diambil alih | Secret manager/enkripsi, redaksi log, rotasi dan pencabutan |
| Penghapusan tidak mencakup backup | Data tetap tersimpan lebih lama dari janji | Kebijakan retensi terukur, proses expiry backup, verifikasi/pencatatan |
| Biaya pesan/AI melebihi pendapatan | Kerugian per pelanggan | Batas penggunaan, metrik biaya per tenant, model harga setelah beta |
| Perubahan Meta/provider | Pesan berhenti atau onboarding gagal | Adapter, pemantauan, versi API terkonfigurasi, prosedur pembaruan dan uji |
| Migrasi data lama merusak catatan | Kehilangan data pemilik awal | Snapshot, rehearsal, hitung rekonsiliasi, rollback sebelum membuka signup |

## 14. Keputusan dan asumsi terbuka

Keputusan berikut harus ditutup sebelum rilis yang menyentuh area terkait:

1. **Registrasi:** beta undangan; syarat membuka pendaftaran umum ditetapkan dari hasil onboarding dan dukungan.
2. **WhatsApp:** awalnya satu nomor milik tenant. Pilih antara onboarding operator-terbantu atau Embedded Signup resmi setelah verifikasi Meta dan kelayakan komersial.
3. **Anggota:** rilis pertama hanya pemilik tenant; anggota keluarga/kolaborator ditunda sampai model peran dan konflik transaksi dirancang.
4. **Billing dan harga:** tidak dibutuhkan untuk penggunaan pribadi. Sebelum beta, validasi willingness-to-pay dan biaya unit; sebelum penjualan, putuskan paket, harga, kuota, gateway, jadwal tagihan, prorata, kegagalan bayar, masa tenggang, refund, pembatalan, akses data setelah berhenti, serta dokumen pajak/nota yang relevan. Jangan menyimpan data kartu.
5. **AI:** opt-in; perlu konfirmasi sebelum mencatat hasil bahasa bebas di produk komersial. Tentukan provider, lokasi pemrosesan, retensi, dan batas biaya setelah tinjauan privasi.
6. **Retensi:** tetapkan retensi pesan metadata, audit, log, dan backup sebelum syarat privasi dipublikasikan.
7. **SLA:** target beta 99,5% ketersediaan bulanan adalah sasaran internal awal, bukan komitmen kontraktual sampai terukur dan disetujui.
8. **Penghapusan:** definisikan masa penundaan, pengecualian yang sah, serta tenggat penghapusan dari backup sebelum implementasi.
9. **Geografi/hukum:** pastikan target pasar dan lokasi pemrosesan data dengan penasihat yang kompeten.

## 15. Kriteria kesiapan per tahap

### Rilis 0 — penggunaan pribadi

- Alur login dan semua route sensitif memerlukan autentikasi/otorisasi yang sesuai.
- Backup database tersedia; restore dan pemeriksaan konsistensi transaksi berhasil didemonstrasikan.
- Webhook idempoten; kegagalan balasan tidak menghilangkan transaksi dan dapat ditemukan/dicoba ulang.
- Migrasi data/schema punya snapshot, hitung rekonsiliasi, serta rollback yang diuji pada staging bila berisiko.
- Secrets tidak masuk log atau repository; ekspor dan akses data pribadi terbatas pada pemilik.

### Rilis 1 — beta eksternal

- Migrasi tenant lulus di staging dengan snapshot dan rollback.
- Uji isolasi lintas-tenant lulus untuk endpoint, model, UI, webhook, worker, ekspor, cache, dan admin.
- Persetujuan AI, ekspor, pencabutan integrasi, penghapusan, kebijakan privasi, dan kanal dukungan diuji.
- Uji input bahasa Indonesia, nominal, tanggal, typo, serta ambiguitas selesai dan diterima pemilik produk.
- Keputusan yang menjadi prasyarat pilot telah ditetapkan sebelum janji dibuat kepada pelanggan.

### Rilis 2 — berbayar

- Semua kesiapan beta lulus; alur langganan dan hak akses diuji end-to-end di sandbox.
- Webhook pembayaran terverifikasi, idempoten, tahan replay, dan dapat direkonsiliasi dengan provider.
- Kasus sukses/gagal, duplikat, terlambat, refund, pembatalan, masa tenggang, dan perubahan paket diuji.
- Ketentuan harga, pembayaran, privasi, refund, dukungan, pajak/nota, dan penanganan data setelah berhenti ditinjau sebelum aktivasi produksi.

## 16. Lampiran fitur premium pribadi

Fitur kelas berbayar untuk pemakaian pribadi—tanpa billing/paywall—dicatat terpisah agar mudah dilanjutkan di sesi berikutnya: [PRD fitur premium pribadi](./prd-fitur-premium-pribadi.md). Dokumen teknisnya: [SRS fitur premium pribadi](./srs-fitur-premium-pribadi.md).

Status ringkas: Wawasan, transaksi berulang, impor CSV, dan peringatan dalam aplikasi sudah ada. Berikutnya digest WhatsApp, multi-dompet, laporan lanjutan, AI Pro, kolaborasi, dan keamanan.
