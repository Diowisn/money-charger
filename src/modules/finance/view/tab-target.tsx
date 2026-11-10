import { useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { Kirim, MintaKonfirmasi } from "./tipe";

export function Target({
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
  const [targetNominal, setTargetNominal] = useState("");
  const [targetTanggal, setTargetTanggal] = useState("");
  const [catatan, setCatatan] = useState("");
  const [nabungInput, setNabungInput] = useState<Record<number, string>>({});

  async function tambah() {
    const ok = await kirim("/api/goals", "POST", {
      aksi: "tambah",
      nama,
      targetNominal: Number(targetNominal),
      tanggal: data.hariIni,
      targetTanggal: targetTanggal || null,
      catatan: catatan || null,
    });
    if (ok) {
      setNama("");
      setTargetNominal("");
      setTargetTanggal("");
      setCatatan("");
    }
  }

  async function nabung(id: number) {
    const nominal = Number(nabungInput[id] || 0);
    if (!nominal || nominal <= 0) return;
    const ok = await kirim("/api/goals", "POST", { aksi: "nabung", id, nominal });
    if (ok) setNabungInput((b) => ({ ...b, [id]: "" }));
  }

  async function batal(id: number, nama: string) {
    if (!(await mintaKonfirmasi("Batalkan target?", `Target ${nama} akan dibatalkan.`))) return;
    await kirim("/api/goals", "POST", { aksi: "batal", id });
  }

  const aktif = data.goals.filter((g) => g.status === "aktif");
  const selesai = data.goals.filter((g) => g.status !== "aktif");

  return (
    <div className="tumpuk dua-kolom">
      <section className="kartu">
        <h2>Buat Target Tabungan</h2>
        <div className="form">
          <label>
            Nama target
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Laptop Baru" />
          </label>
          <label>
            Nominal target (Rp)
            <InputRupiah
              value={targetNominal}
              onChange={setTargetNominal}
              placeholder="contoh 5.000.000"
            />
          </label>
          <label>
            Target tanggal tercapai (opsional)
            <input type="date" value={targetTanggal} onChange={(e) => setTargetTanggal(e.target.value)} />
          </label>
          <label>
            Catatan (opsional)
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh untuk kerja" />
          </label>
          <Tombol
            lebar
            onClick={() => void tambah()}
            disabled={sibuk || !nama || !targetNominal}
          >
            Simpan
          </Tombol>
        </div>
      </section>

      <section className="kartu">
        <h2>Aktif</h2>
        <ul className="daftar-transaksi">
          {aktif.map((g) => (
            <li key={g.id}>
              <div className="transaksi-kiri" style={{ flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div className="baris-antara">
                    <p className="nama-transaksi">{g.nama}</p>
                    <span className="muted kecil">{Math.round(g.progres * 100)}%</span>
                  </div>
                  <div className="bar">
                    <span style={{ width: `${Math.round(g.progres * 100)}%` }} />
                  </div>
                  <p className="muted kecil">
                    Terkumpul {rp(g.terkumpul)} dari {rp(g.targetNominal)} (sisa {rp(g.sisa)})
                    {g.targetTanggal ? ` · target ${g.targetTanggal}${g.lewatTempo ? " (lewat)" : ""}` : ""}
                  </p>
                  {g.perluPerBulan !== null && g.perluPerMinggu !== null ? (
                    <p className="muted kecil">
                      Sisihkan {rp(g.perluPerBulan)}/bulan atau {rp(g.perluPerMinggu)}/minggu.
                    </p>
                  ) : null}
                  <div className="baris-tombol" style={{ marginTop: 6 }}>
                    <InputRupiah
                      placeholder="Nabung nominal"
                      value={nabungInput[g.id] ?? ""}
                      onChange={(nilai) => setNabungInput((b) => ({ ...b, [g.id]: nilai }))}
                    />
                    <Tombol onClick={() => void nabung(g.id)} disabled={sibuk}>
                      Nabung
                    </Tombol>
                  </div>
                </div>
              </div>
              <div className="transaksi-kanan">
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void batal(g.id, g.nama)} disabled={sibuk}>
                  Batal
                </Tombol>
              </div>
            </li>
          ))}
          {!aktif.length ? <li className="kosong">Belum ada target tabungan aktif.</li> : null}
        </ul>
      </section>

      {selesai.length ? (
        <section className="kartu lebar">
          <h2>Riwayat</h2>
          <ul className="daftar-transaksi">
            {selesai.map((g) => (
              <li key={g.id} className={g.status === "batal" ? "batal" : undefined}>
                <div className="transaksi-kiri">
                  <span className={`badge ${g.status === "selesai" ? "tipe-in" : ""}`}>
                    {g.status === "selesai" ? "Tercapai" : "Dibatalkan"}
                  </span>
                  <div>
                    <p className="nama-transaksi">{g.nama}</p>
                    <p className="muted kecil">
                      {rp(g.terkumpul)} dari {rp(g.targetNominal)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
