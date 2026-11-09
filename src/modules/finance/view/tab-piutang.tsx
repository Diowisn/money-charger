import { useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { rp } from "./format";
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
    <div className="tumpuk dua-kolom">
      <section className="grid-2 lebar">
        <div className="kartu">
          <p className="label">Piutang Aktif</p>
          <p className="angka">{rp(totalPiutang)}</p>
          <p className="muted">Orang berutang ke kita</p>
        </div>
        <div className="kartu">
          <p className="label">Utang Aktif</p>
          <p className="angka">{rp(totalUtang)}</p>
          <p className="muted">Kita berutang</p>
        </div>
      </section>

      <section className="kartu">
        <h2>Catat Piutang/Utang</h2>
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
            <input
              type="number"
              min={1}
              step={1000}
              inputMode="numeric"
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              placeholder="contoh 100000"
            />
          </label>
          <label>
            Jatuh tempo (opsional)
            <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} />
          </label>
          <label>
            Catatan (opsional)
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="contoh pinjam untuk..." />
          </label>
          <Tombol
            lebar
            onClick={() => void tambah()}
            disabled={sibuk || !nama || !nominal}
          >
            Simpan
          </Tombol>
        </div>
      </section>

      <section className="kartu">
        <h2>Aktif</h2>
        <ul className="daftar-transaksi">
          {aktif.map((d) => (
            <li key={d.id}>
              <div className="transaksi-kiri">
                <span className={`badge ${d.jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
                  {d.jenis === "piutang" ? "Piutang" : "Utang"}
                </span>
                <div>
                  <p className="nama-transaksi">{d.nama}</p>
                  <p className="muted kecil">
                    Sisa {rp(d.sisa)} dari {rp(d.nominal)}
                    {d.jatuhTempo ? ` · tempo ${d.jatuhTempo}${d.lewatTempo ? " (lewat)" : ""}` : ""}
                  </p>
                  <div className="baris-tombol" style={{ marginTop: 6 }}>
                    <input
                      type="number"
                      min={1}
                      step={1000}
                      placeholder="Bayar sebagian"
                      value={bayarInput[d.id] ?? ""}
                      onChange={(e) => setBayarInput((b) => ({ ...b, [d.id]: e.target.value }))}
                    />
                    <Tombol varian="sekunder" onClick={() => void bayar(d.id, false)} disabled={sibuk}>
                      Bayar
                    </Tombol>
                    <Tombol onClick={() => void bayar(d.id, true)} disabled={sibuk}>
                      Lunas
                    </Tombol>
                  </div>
                </div>
              </div>
              <div className="transaksi-kanan">
                <Tombol varian="bahaya" ukuran="kecil" onClick={() => void batal(d.id, d.nama)} disabled={sibuk}>
                  Batal
                </Tombol>
              </div>
            </li>
          ))}
          {!aktif.length ? <li className="kosong">Belum ada piutang/utang aktif.</li> : null}
        </ul>
      </section>

      {selesai.length ? (
        <section className="kartu lebar">
          <h2>Riwayat</h2>
          <ul className="daftar-transaksi">
            {selesai.map((d) => (
              <li key={d.id} className={d.status === "batal" ? "batal" : undefined}>
                <div className="transaksi-kiri">
                  <span className={`badge ${d.jenis === "piutang" ? "tipe-in" : "tipe-out"}`}>
                    {d.jenis === "piutang" ? "Piutang" : "Utang"}
                  </span>
                  <div>
                    <p className="nama-transaksi">{d.nama}</p>
                    <p className="muted kecil">
                      {rp(d.nominal)} · {d.status === "lunas" ? "lunas" : "dibatalkan"}
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
