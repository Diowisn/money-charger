import { useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { Kirim, MintaKonfirmasi } from "./tipe";

export function Otomatis({
  data,
  kirim,
  sibuk,
  mintaKonfirmasi,
}: {
  data: DashboardData;
  kirim: Kirim;
  sibuk: boolean;
  mintaKonfirmasi: MintaKonfirmasi;
}) {
  const [nama, setNama] = useState("");
  const [nominal, setNominal] = useState("");
  const [hari, setHari] = useState("1");
  const [subPostId, setSubPostId] = useState("");
  const [mulai, setMulai] = useState(data.hariIni);
  const pos = data.posSemua.filter((p) => p.aktif);

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
    <div className="tumpuk dua-kolom">
      <section className="kartu">
        <span className="badge hijau">Otomatis</span>
        <h2>Transaksi Berulang</h2>
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
        <h2>Aturan Saya</h2>
        <ul className="daftar-transaksi">
          {data.otomatis.map((rule) => (
            <li key={rule.id}>
              <div className="transaksi-kiri" style={{ flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div className="baris-antara">
                    <p className="nama-transaksi">{rule.nama}</p>
                    <span className={`badge ${rule.aktif ? "hijau" : ""}`}>{rule.aktif ? "Aktif" : "Dijeda"}</span>
                  </div>
                  <p className="muted kecil">
                    {rp(rule.nominal)} · tanggal {rule.hari} · {rule.subPost ?? "tanpa pos"}
                  </p>
                  <p className="muted kecil">
                    {rule.berikutnya ? `Berikutnya ${rule.berikutnya}` : `Mulai ${rule.mulai}`}
                    {rule.terakhirJalan ? ` · terakhir ${rule.terakhirJalan}` : ""}
                  </p>
                </div>
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
          {!data.otomatis.length ? <li className="kosong">Belum ada transaksi berulang.</li> : null}
        </ul>
      </section>
    </div>
  );
}
