import { useState } from "react";
import { TautanTombol, Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { Kirim, MintaKonfirmasi } from "./tipe";

export function Otomatis({
  data,
  kirim,
  sibuk,
  mintaKonfirmasi,
  emailSetupSiap = false,
}: {
  data: DashboardData;
  kirim: Kirim;
  sibuk: boolean;
  mintaKonfirmasi: MintaKonfirmasi;
  emailSetupSiap?: boolean;
}) {
  const [nama, setNama] = useState("");
  const [nominal, setNominal] = useState("");
  const [hari, setHari] = useState("1");
  const [subPostId, setSubPostId] = useState("");
  const [mulai, setMulai] = useState(data.hariIni);
  const [pesanKalender, setPesanKalender] = useState<string | null>(null);
  const pos = data.posSemua.filter((p) => p.aktif);
  const emailTerakhir = data.email?.lastEmailAt ?? data.email?.linkedAt ?? null;
  const emailBasi = Boolean(
    data.email?.terhubung &&
      (!emailTerakhir || Date.now() - Date.parse(emailTerakhir) > 86_400_000),
  );
  const aktif = data.otomatis.filter((rule) => rule.aktif);
  const totalBulanan = aktif.reduce((s, rule) => s + rule.nominal, 0);

  async function salinLangganan() {
    setPesanKalender(null);
    try {
      const res = await fetch("/api/kalender", { method: "POST", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { url?: string }; error?: string };
      if (!res.ok || !j.ok || !j.data?.url) throw new Error(j.error ?? "Gagal membuat URL langganan.");
      const url = new URL(j.data.url, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      setPesanKalender("URL langganan disalin. Tempel di Google Calendar / Apple Calendar (tambah via URL).");
    } catch (error) {
      setPesanKalender(error instanceof Error ? error.message : "Gagal menyalin URL langganan.");
    }
  }

  async function tambah() {
    const berhasil = await kirim("/api/recurring", "POST", {
      aksi: "tambah",
      nama,
      nominal: Number(nominal),
      hari: Number(hari),
      subPostId: subPostId ? Number(subPostId) : null,
      mulai,
    });
    if (berhasil) {
      setNama("");
      setNominal("");
      setHari("1");
      setSubPostId("");
      setMulai(data.hariIni);
    }
  }

  async function ubahStatus(id: number, aktif: boolean) {
    await kirim("/api/recurring", "POST", { aksi: "status", id, aktif });
  }

  async function hapus(id: number, judul: string) {
    if (!(await mintaKonfirmasi("Hapus aturan otomatis", `Aturan "${judul}" tidak akan mencatat transaksi lagi.`))) return;
    await kirim("/api/recurring", "POST", { aksi: "hapus", id });
  }

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Tagihan otomatis per bulan</p>
          <p className="saldo-angka">{rp(totalBulanan)}</p>
          <div className="cn-hero-mini">
            <span>Aktif <b>{aktif.length} aturan</b></span>
            <span>Dijeda <b>{data.otomatis.length - aktif.length}</b></span>
            <span>Total aturan <b>{data.otomatis.length}</b></span>
          </div>
        </div>
      </article>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Transaksi berulang</h2>
          <span className="badge hijau">Otomatis</span>
        </div>
        <p className="muted kecil">
          Catat tagihan atau langganan yang sama setiap bulan. Transaksi dibuat otomatis pada tanggal yang dipilih saat worker berjalan.
        </p>
        <div className="form">
          <label>
            Nama tagihan
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Netflix / kos / cicilan" />
          </label>
          <label>
            Nominal
            <InputRupiah value={nominal} onChange={setNominal} placeholder="150.000" />
          </label>
          <label>
            Tanggal tiap bulan
            <input type="number" min={1} max={31} value={hari} onChange={(e) => setHari(e.target.value)} />
          </label>
          <label>
            Pos
            <select value={subPostId} onChange={(e) => setSubPostId(e.target.value)}>
              <option value="">Tanpa pos</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>{p.nama}</option>
              ))}
            </select>
          </label>
          <label>
            Mulai
            <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} />
          </label>
        </div>
        <Tombol lebar onClick={() => void tambah()} disabled={sibuk || !nama || !nominal || !mulai}>
          Simpan aturan
        </Tombol>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Aturan saya</h2>
          <span className="badge">{data.otomatis.length} aturan</span>
        </div>
        <div className="baris-tombol">
          <TautanTombol varian="sekunder" ukuran="kecil" href="/api/kalender" download>
            Unduh kalender (.ics)
          </TautanTombol>
          <Tombol varian="sekunder" ukuran="kecil" onClick={() => void salinLangganan()} disabled={sibuk}>
            Salin URL langganan
          </Tombol>
        </div>
        <p className="muted kecil">
          Berisi tagihan berulang, jatuh tempo utang/piutang, dan target tabungan 6 bulan ke depan. URL langganan
          membuat kalender ikut diperbarui otomatis.
        </p>
        {pesanKalender ? <p className="muted kecil">{pesanKalender}</p> : null}
        <ul className="cn-rule">
          {data.otomatis.map((rule) => (
            <li key={rule.id}>
              <div className="baris-antara">
                <div>
                  <b>{rule.nama}</b>
                  <p className="muted kecil">
                    {rp(rule.nominal)} · tanggal {rule.hari} · {rule.subPost ?? "tanpa pos"}
                  </p>
                  <p className="muted kecil">
                    {rule.berikutnya ? `Berikutnya ${rule.berikutnya}` : `Mulai ${rule.mulai}`}
                    {rule.terakhirJalan ? ` · terakhir ${rule.terakhirJalan}` : ""}
                  </p>
                </div>
                <span className={`badge ${rule.aktif ? "hijau" : ""}`}>{rule.aktif ? "Aktif" : "Dijeda"}</span>
              </div>
              <div className="baris-tombol">
                <Tombol ukuran="kecil" onClick={() => void ubahStatus(rule.id, !rule.aktif)} disabled={sibuk}>
                  {rule.aktif ? "Jeda" : "Lanjutkan"}
                </Tombol>
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void hapus(rule.id, rule.nama)} disabled={sibuk}>
                  Hapus
                </Tombol>
              </div>
            </li>
          ))}
          {!data.otomatis.length ? <li className="muted kecil">Belum ada transaksi berulang.</li> : null}
        </ul>
      </section>

      <section className="kartu cn-span">
        <div className="baris-antara">
          <h2>Email bank/e-wallet</h2>
          <span className={`badge ${emailBasi ? "tipe-out" : data.email?.terhubung ? "hijau" : ""}`}>
            {emailBasi ? "Perlu dicek" : data.email?.terhubung ? "Tertaut" : data.email?.terdaftar ? "Terdaftar" : emailSetupSiap ? "Siap dipasang" : "Belum"}
          </span>
        </div>
        <p className="muted kecil">
          {emailBasi
            ? "Sudah tertaut, tetapi belum ada email transaksi dalam 24 jam. Periksa trigger Gmail/Apps Script atau SECRET."
            : data.email?.terhubung
              ? `Gmail ${data.email.email ?? ""} sudah tertaut. Email bank/e-wallet diperiksa tiap 5 menit dan masuk ke akun ini saja.`
              : data.email?.terdaftar
                ? `Email ${data.email.email ?? ""} sudah terdaftar di server. Klik "Aktifkan email otomatis" sekali agar Gmail ini mengirim transaksi.`
                : "Aktifkan sekali per akun Gmail yang menerima notifikasi transaksi. Pilih akun Google yang sama dengan email akun Money-Charger. Setelah aktif, email diperiksa tiap 5 menit."}
        </p>
        {emailSetupSiap ? (
          <div className="baris-tombol">
            <TautanTombol href="/api/email/setup?aksi=pasang" target="_blank" rel="noreferrer">
              Aktifkan email otomatis
            </TautanTombol>
            <TautanTombol varian="sekunder" href="/api/email/setup?aksi=jalankan" target="_blank" rel="noreferrer">
              Periksa sekarang
            </TautanTombol>
          </div>
        ) : (
          <p className="muted kecil">Server belum mengatur GMAIL_SETUP_URL.</p>
        )}
      </section>
    </div>
  );
}
