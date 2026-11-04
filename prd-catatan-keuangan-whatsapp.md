# PRD — Money-Charger SaaS

| Atribut | Nilai |
|---|---|
| Status | Draft untuk validasi produk |
| Versi | 1.0 |
| Tanggal | 4 November 2026 |
| Pemilik | Product owner Money-Charger |
| Dokumen teknis | [SRS](./srs-catatan-keuangan-whatsapp.md) |
| Model produk | SaaS bersama, multi-tenant |

> Dokumen ini adalah spesifikasi produk dan rancangan sasaran, bukan klaim bahwa fitur SaaS sudah tersedia. Penentuan kewajiban hukum, kontrak pemroses data, kebijakan Meta, dan pajak harus ditinjau oleh pihak yang kompeten sebelum peluncuran komersial.

## 1. Ringkasan produk

Money-Charger membantu individu mencatat pemasukan dan pengeluaran dalam rupiah melalui WhatsApp, lalu melihat keadaan keuangan dan mengatur anggaran lewat dashboard web. Produk berkembang dari aplikasi untuk satu pemilik menjadi layanan SaaS: banyak pelanggan memakai aplikasi yang sama, tetapi identitas, nomor WhatsApp, konfigurasi, anggaran, transaksi, dan hak akses setiap pelanggan tetap terpisah.

Sistem memberi ringkasan pencatatan dan anggaran, bukan rekening bank, layanan pembayaran, pembukuan pajak, atau nasihat investasi. AI hanya membantu memahami teks dan harus tunduk pada aturan validasi serta mekanisme koreksi yang transparan.

## 2. Latar belakang dan masalah

Versi yang berjalan sekarang telah memiliki pencatatan WhatsApp, mesin anggaran, dashboard, dan ekspor. Arsitektur data serta autentikasi tetap berorientasi satu pemilik: tabel transaksi dan konfigurasi belum dimiliki tenant, nomor yang diizinkan bersifat global, dan dashboard memakai satu password server. Mengundang beberapa pelanggan ke deployment yang sama sebelum memperbaiki hal ini berisiko mencampur atau membocorkan data keuangan mereka.

Kebutuhan produk berikutnya bukan sekadar memecah kode ke modul HMVC. Produk komersial juga membutuhkan isolasi tenant, onboarding dan pengelolaan akun, pengiriman pesan yang dapat dipulihkan, kontrol privasi, operasi dukungan, serta cara memigrasikan data awal dengan aman.

## 3. Tujuan

1. Memungkinkan pelanggan membuat akun dan memakai layanan tanpa berbagi data dengan pelanggan lain.
2. Mempertahankan kecepatan mencatat transaksi melalui WhatsApp dan memberi dashboard web sebagai tempat meninjau serta mengoreksi catatan.
3. Menjamin setiap operasi—termasuk webhook, ekspor, tugas latar, dan dukungan admin—terikat pada tenant yang benar.
4. Mencegah pesan yang sudah dicatat hilang hanya karena balasan WhatsApp gagal dikirim.
5. Memberi pelanggan transparansi dan kendali atas penggunaan AI, integrasi, ekspor, retensi, serta penghapusan data.
6. Menyediakan operasi yang bisa dipantau, dipulihkan, dan dikembangkan tanpa mengikat domain ke satu vendor.

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

### Rilis 1 — SaaS beta tertutup (prioritas P0)

- Registrasi/undangan, login individual, verifikasi email, reset kata sandi, sesi yang dapat dicabut, dan pengelolaan profil dasar.
- Satu workspace pribadi per pelanggan; model data tetap memakai tenant agar pembagian akses di masa depan tidak memerlukan desain ulang.
- Onboarding terpandu: zona waktu, tanggal mulai, saldo awal, rencana anggaran, dan penautan nomor WhatsApp.
- Satu nomor WhatsApp per tenant. Onboarding awal dapat dibantu operator dan harus memakai proses Meta resmi yang disetujui; otomatisasi Embedded Signup bukan prasyarat beta dan merupakan keputusan terbuka.
- Fitur inti saat ini: pemasukan, gaji, pengeluaran, bonus, pos, rencana, saldo/wadah, laporan, koreksi, ekspor.
- Riwayat transaksi tenant yang lengkap dengan pencarian/filter dasar dan pagination server-side.
- Penggunaan AI opsional dengan persetujuan eksplisit, penjelasan pemrosesan, indikator transaksi hasil AI, dan konfirmasi pengguna sebelum transaksi AI dicatat.
- Idempotensi pesan masuk, outbox untuk balasan, retry, log operasional tersanitasi, serta prosedur dukungan.
- Ekspor data dan permintaan penutupan akun/penghapusan sesuai kebijakan retensi yang telah ditinjau.
- Admin internal minimal untuk status tenant/integrasi, tanpa akses rutin ke isi catatan.
- Pilot terbatas; billing boleh dikelola manual hanya jika syarat, harga, penagihan, dan dukungan dijelaskan sebelum pengguna menyetujui layanan.

### Rilis 2 — Peluncuran berbayar (P1)

- Integrasi billing/langganan, siklus pembayaran, pajak/nota sesuai tinjauan bisnis dan legal, pembatalan, masa tenggang, dan pembatasan fitur tanpa menghapus data.
- Onboarding WhatsApp mandiri jika API, persetujuan, serta model kredensial Meta telah divalidasi.
- Undangan anggota keluarga/workspace bersama dengan peran dan persetujuan pemilik.
- Pengingat anggaran/notifikasi terjadwal hanya setelah izin, preferensi frekuensi, dan aturan WhatsApp ditinjau.
- Impor transaksi dengan format yang terdokumentasi.

### Rilis 3 — Pertumbuhan (P2)

- Beberapa nomor/integrasi per tenant, dukungan tambahan format/pesan, bahasa lain, serta laporan lanjutan berdasarkan riset.
- API publik/mitra hanya bila ada kebutuhan dan model otorisasi/batas penggunaan tersendiri.
- Fitur AI tambahan setelah evaluasi akurasi, biaya, privasi, dan keselamatan.

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

Target berikut adalah **gerbang usulan** yang harus divalidasi selama beta, bukan klaim performa saat ini.

- **Isolasi:** 100% tes otorisasi lintas-tenant lulus; tidak ada kebocoran lintas tenant pada pengujian rilis.
- **Aktivasi:** minimal 80% pengguna beta menyelesaikan setup dan pesan uji dalam satu sesi onboarding (ukur 20 pengguna pertama).
- **Keberhasilan pencatatan:** minimal 99% pesan berformat baku yang diterima sah tercatat tepat satu kali atau ditolak dengan alasan yang dapat dipahami.
- **Koreksi:** setiap transaksi AI dapat dikenali sumbernya dan dapat dikoreksi/dibatalkan melalui WhatsApp/dashboard.
- **Reliabilitas balasan:** minimal 99% balasan terkirim dalam 2 menit ketika API penyedia tersedia; kegagalan terminal terlihat dan tidak hilang diam-diam.
- **Pemulihan:** uji restore memenuhi RPO 24 jam dan RTO 4 jam sebelum beta eksternal.
- **Kepuasan:** ukur aktivasi, pengguna aktif mingguan, transaksi gagal/koreksi, tiket dukungan, dan churn; jangan mengoptimalkan jumlah transaksi tanpa mengukur kesalahan.
- **Ekonomi unit:** biaya infrastruktur, provider pesan, AI, pembayaran, dan dukungan per tenant dipantau sebelum menetapkan harga publik.

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
4. **Billing dan harga:** belum ditetapkan. Validasi willingness-to-pay dan biaya unit; pilih payment provider kemudian. Jangan menyimpan data kartu.
5. **AI:** opt-in; perlu konfirmasi sebelum mencatat hasil bahasa bebas di produk komersial. Tentukan provider, lokasi pemrosesan, retensi, dan batas biaya setelah tinjauan privasi.
6. **Retensi:** tetapkan retensi pesan metadata, audit, log, dan backup sebelum syarat privasi dipublikasikan.
7. **SLA:** target beta 99,5% ketersediaan bulanan adalah sasaran internal awal, bukan komitmen kontraktual sampai terukur dan disetujui.
8. **Penghapusan:** definisikan masa penundaan, pengecualian yang sah, serta tenggat penghapusan dari backup sebelum implementasi.
9. **Geografi/hukum:** pastikan target pasar dan lokasi pemrosesan data dengan penasihat yang kompeten.

## 15. Kriteria kesiapan peluncuran beta

- Migrasi tenant lulus di lingkungan staging dengan snapshot dan rencana rollback.
- Uji isolasi lintas tenant lulus untuk seluruh endpoint, model, UI, webhook, queue worker, ekspor, serta admin.
- Tidak ada route sensitif tanpa autentikasi/otorisasi; login memiliki pembatasan percobaan dan pemulihan aman.
- Webhook idempoten; kegagalan pengiriman balasan dapat di-retry dan dipantau.
- Restore database dan pemeriksaan konsistensi transaksi berhasil didemonstrasikan.
- Persetujuan AI, ekspor, pencabutan integrasi, penghapusan, privasi, dan kanal dukungan diuji.
- Uji pilot dengan variasi bahasa Indonesia, nominal, tanggal, typo, dan input ambigu selesai; tingkat salah ukur dan diterima product owner.
- Semua keputusan terbuka yang menjadi prasyarat diputuskan dan dicatat sebelum menjanjikan fitur/retensi/harga kepada pelanggan.
