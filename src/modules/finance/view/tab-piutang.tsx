import { useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { Kirim, MintaKonfirmasi } from "./tipe";

export function Piutang({
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
  const [jenis, setJenis] = useState<"piutang" | "utang">("piutang");
  const [nama, setNama] = useState("");
  const [nominal, setNominal] = useState("");
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bayarInput, setBayarInput] = useState<Record<number, string>>({});

  async function tambah() {
    const ok = await kirim("/api/debts", "POST", {
      aksi: "tambah",
      jenis,
      nama,
      nominal: Number(nominal),
      tanggal: data.hariIni,
      jatuhTempo: jatuhTempo || null,
      catatan: catatan || null,
    });
    if (ok) {
      setNama("");
      setNominal("");
      setJatuhTempo("");
      setCatatan("");
    }
  }

  async function bayar(id: number, penuh: boolean) {
    const nominalBayar = penuh ? null : Number(bayarInput[id] || 0);
    if (!penuh && (!nominalBayar || nominalBayar <= 0)) return;
    const ok = await kirim("/api/debts", "POST", { aksi: "bayar", id, nominal: nominalBayar });
    if (ok) setBayarInput((b) => ({ ...b, [id]: "" }));
  }

  async function batal(id: number, nama: string) {
    if (!(await mintaKonfirmasi("Batalkan catatan?", `Catatan ${nama} akan dibatalkan.`))) return;
    await kirim("/api/debts", "POST", { aksi: "batal", id });
  }

  const aktif = data.piutang.filter((d) => d.status === "aktif");
  const selesai = data.piutang.filter((d) => d.status !== "aktif");
  const totalPiutang = aktif.filter((d) => d.jenis === "piutang").reduce((s, d) => s + d.sisa, 0);
  const totalUtang = aktif.filter((d) => d.jenis === "utang").reduce((s, d) => s + d.sisa, 0);

  return (
    <div className="cn-halaman">
      <article className="saldo-kartu cn-span">
        <div className="saldo-teks">
          <p className="saldo-label">Posisi piutang &amp; utang</p>
          <p className="saldo-angka">{rp(totalPiutang - totalUtang)}</p>
          <div className="cn-hero-mini">
            <span>Piutang <b>{rp(totalPiutang)}</b></span>
            <span>Utang <b>{rp(totalUtang)}</b></span>
            <span>Aktif <b>{aktif.length}</b></span>
          </div>
        </div>
      </article>

      <div className="stat-row stat-dua cn-span">
        <article className="stat-kartu">
          <p className="stat-label">Piutang aktif</p>
          <p className="angka">{rp(totalPiutang)}</p>
          <p className="muted kecil">Orang berutang ke kita</p>
        </article>
        <article className="stat-kartu">
          <p className="stat-label">Utang aktif</p>
          <p className="angka">{rp(totalUtang)}</p>
          <p className="muted kecil">Kita berutang</p>
        </article>
      </div>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Catat piutang/utang</h2>
          <span className={`badge ${jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
            {jenis === "piutang" ? "Piutang" : "Utang"}
          </span>
        </div>
        <div className="form">
          <label>
            Jenis
            <select value={jenis} onChange={(e) => setJenis(e.target.value as "piutang" | "utang")}>
              <option value="piutang">Piutang (orang berutang ke kita)</option>
              <option value="utang">Utang (kita berutang)</option>
            </select>
          </label>
          <label>
            Nama
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="contoh: Andi" />
          </label>
          <label>
            Nominal (Rp)
            <InputRupiah value={nominal} onChange={setNominal} placeholder="contoh 100.000" />
          </label>
          <label>
            Jatuh tempo (opsional)
            <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} />
          </label>
          <label>
            Catatan (opsional)
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh pinjam untuk..." />
          </label>
          <Tombol lebar onClick={() => void tambah()} disabled={sibuk || !nama || !nominal}>
            Simpan
          </Tombol>
        </div>
      </section>

      <section className="kartu">
        <div className="baris-antara">
          <h2>Aktif</h2>
          <span className="badge">{aktif.length} catatan</span>
        </div>
        <ul className="cn-goal">
          {aktif.map((d) => (
            <li key={d.id}>
              <div className="baris-antara">
                <span className="baris-antara">
                  <span className={`badge ${d.jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
                    {d.jenis === "piutang" ? "Piutang" : "Utang"}
                  </span>
                  <b>{d.nama}</b>
                </span>
                <b className={d.jenis === "piutang" ? "ringkas-jumlah masuk" : "ringkas-jumlah"}>{rp(d.sisa)}</b>
              </div>
              <p className="muted kecil">
                Sisa {rp(d.sisa)} dari {rp(d.nominal)}
                {d.jatuhTempo ? ` · tempo ${d.jatuhTempo}${d.lewatTempo ? " (lewat)" : ""}` : ""}
              </p>
              <div className="baris-tombol">
                <InputRupiah
                  placeholder="Bayar sebagian"
                  value={bayarInput[d.id] ?? ""}
                  onChange={(nilai) => setBayarInput((b) => ({ ...b, [d.id]: nilai }))}
                />
                <Tombol varian="sekunder" onClick={() => void bayar(d.id, false)} disabled={sibuk}>
                  Bayar
                </Tombol>
                <Tombol onClick={() => void bayar(d.id, true)} disabled={sibuk}>
                  Lunas
                </Tombol>
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void batal(d.id, d.nama)} disabled={sibuk}>
                  Batal
                </Tombol>
              </div>
            </li>
          ))}
          {!aktif.length ? <li className="muted kecil">Belum ada piutang/utang aktif.</li> : null}
        </ul>
      </section>

      {selesai.length ? (
        <section className="kartu cn-span">
          <div className="baris-antara">
            <h2>Riwayat</h2>
            <span className="badge">{selesai.length} catatan</span>
          </div>
          <ul className="cn-legend">
            {selesai.map((d) => (
              <li key={d.id}>
                <span className={`badge ${d.jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
                  {d.jenis === "piutang" ? "Piutang" : "Utang"}
                </span>
                <span>{d.nama}</span>
                <b>{rp(d.nominal)} · {d.status === "lunas" ? "lunas" : "dibatalkan"}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
