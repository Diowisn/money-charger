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
  const totalTerkumpul = aktif.reduce((s, g) => s + g.terkumpul, 0);
  const totalTarget = aktif.reduce((s, g) => s + g.targetNominal, 0);
  const totalSisa = aktif.reduce((s, g) => s + g.sisa, 0);
  const progres = totalTarget > 0 ? Math.min(1, totalTerkumpul / totalTarget) : 0;

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Total target aktif</p>
          <p className="saldo-angka">{rp(totalTerkumpul)}</p>
          <p className="saldo-sub">dari {rp(totalTarget)} · sisa {rp(totalSisa)}</p>
          <div className="bar tipis terang"><span style={{ width: `${Math.round(progres * 100)}%` }} /></div>
        </div>
      </article>

      <div className="stat-row cn-span">
        <article className="stat-kartu">
          <p className="stat-label">Target aktif</p>
          <p className="angka">{aktif.length}</p>
          <p className="muted kecil">Sedang berjalan</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Terkumpul</p>
          <p className="angka">{rp(totalTerkumpul)}</p>
          <p className="muted kecil">{Math.round(progres * 100)}% dari target</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Sisa</p>
          <p className="angka">{rp(totalSisa)}</p>
          <p className="muted kecil">Perlu dilengkapi</p>
        </article>
      </div>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Buat target</h2>
          <span className="badge hijau">Baru</span>
        </div>
        <div className="form">
          <label>
            Nama target
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Laptop Baru" />
          </label>
          <label>
            Nominal target (Rp)
            <InputRupiah value={targetNominal} onChange={setTargetNominal} placeholder="contoh 5.000.000" />
          </label>
          <label>
            Target tanggal tercapai (opsional)
            <input type="date" value={targetTanggal} onChange={(e) => setTargetTanggal(e.target.value)} />
          </label>
          <label>
            Catatan (opsional)
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh untuk kerja" />
          </label>
          <Tombol lebar onClick={() => void tambah()} disabled={sibuk || !nama || !targetNominal}>
            Simpan
          </Tombol>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Target aktif</h2>
          <span className="badge">{aktif.length} target</span>
        </div>
        <ul className="cn-goal">
          {aktif.map((g) => (
            <li key={g.id}>
              <div className="baris-antara">
                <b>{g.nama}</b>
                <span className="badge hijau">{Math.round(g.progres * 100)}%</span>
              </div>
              <div className="bar tipis"><span style={{ width: `${Math.round(g.progres * 100)}%` }} /></div>
              <p className="muted kecil">
                Terkumpul {rp(g.terkumpul)} dari {rp(g.targetNominal)} · sisa {rp(g.sisa)}
                {g.targetTanggal ? ` · target ${g.targetTanggal}${g.lewatTempo ? " (lewat)" : ""}` : ""}
              </p>
              {g.perluPerBulan !== null && g.perluPerMinggu !== null ? (
                <p className="muted kecil">
                  Sisihkan {rp(g.perluPerBulan)}/bulan atau {rp(g.perluPerMinggu)}/minggu.
                </p>
              ) : null}
              <div className="baris-tombol">
                <InputRupiah
                  placeholder="Nabung nominal"
                  value={nabungInput[g.id] ?? ""}
                  onChange={(nilai) => setNabungInput((b) => ({ ...b, [g.id]: nilai }))}
                />
                <Tombol onClick={() => void nabung(g.id)} disabled={sibuk}>
                  Nabung
                </Tombol>
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void batal(g.id, g.nama)} disabled={sibuk}>
                  Batal
                </Tombol>
              </div>
            </li>
          ))}
          {!aktif.length ? <li className="muted kecil">Belum ada target tabungan aktif.</li> : null}
        </ul>
      </section>

      {selesai.length ? (
        <section className="kartu cn-span">
          <div className="baris-antara">
            <h2>Riwayat target</h2>
            <span className="badge">{selesai.length} catatan</span>
          </div>
          <ul className="cn-legend">
            {selesai.map((g) => (
              <li key={g.id}>
                <span className={`badge ${g.status === "selesai" ? "tipe-in" : "tipe-out"}`}>
                  {g.status === "selesai" ? "Tercapai" : "Dibatalkan"}
                </span>
                <span>{g.nama}</span>
                <b>{rp(g.terkumpul)} / {rp(g.targetNominal)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
