import { useEffect, useMemo, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { drafRencana, rp } from "./format";
import { InputRupiah } from "./input-rupiah";
import type { Kirim } from "./tipe";

export function Rencana({ data, kirim, sibuk }: { data: DashboardData; kirim: Kirim; sibuk: boolean }) {
  const [draf, setDraf] = useState<Record<string, number>>(() => drafRencana(data));
  const [sekarang, setSekarang] = useState(true);
  const [gajiPokok, setGajiPokok] = useState(String(data.pengaturan.gajiPokok));

  useEffect(() => {
    setDraf(drafRencana(data));
  }, [data.versiRencana]);

  useEffect(() => {
    setGajiPokok(String(data.pengaturan.gajiPokok));
  }, [data.pengaturan.gajiPokok]);

  const ubah = (key: string, v: number) => setDraf((d) => ({ ...d, [key]: Math.max(0, Math.round(v)) }));
  const total = useMemo(() => Object.values(draf).reduce((s, v) => s + v, 0), [draf]);

  async function simpan() {
    const items: { tipe: string; subPostId: number | null; nominal: number }[] = [];
    for (const p of data.posSemua) {
      if (!p.aktif) continue;
      items.push({ tipe: "sub_pos", subPostId: p.id, nominal: draf[`s:${p.id}`] ?? 0 });
    }
    items.push({ tipe: "dd", subPostId: null, nominal: draf.dd ?? 0 });
    items.push({ tipe: "tabungan", subPostId: null, nominal: draf.tabungan ?? 0 });
    items.push({ tipe: "investasi", subPostId: null, nominal: draf.investasi ?? 0 });
    await kirim("/api/plan", "POST", { items, sekarang });
  }

  async function simpanGajiPokok() {
    await kirim("/api/pengaturan", "POST", { gajiPokok: Math.round(Number(gajiPokok || 0)) });
  }

  return (
    <div className="tumpuk rencana-grid">
      <section className="kartu">
        <div className="baris-antara">
          <div>
            <p className="label">Total Rencana</p>
            <p className="angka-besar">{rp(total)}</p>
          </div>
          <span className={total === data.pengaturan.gajiPokok ? "badge hijau" : "badge"}>
            Gaji pokok {rp(data.pengaturan.gajiPokok)}
          </span>
        </div>
        <p className="muted">
          Geser jatah tiap pos. Perubahan disimpan sebagai versi rencana baru, versi lama tetap tersimpan.
        </p>
      </section>

      <section className="kartu">
        <h2>Gaji Pokok</h2>
        <p className="muted">
          Dipakai sebagai acuan peringatan saat total rencana tidak sama dengan gaji pokok. Bisa diubah kapan saja.
        </p>
        <div className="form">
          <label>
            Gaji pokok (Rp)
            <InputRupiah value={gajiPokok} onChange={setGajiPokok} />
          </label>
          <Tombol lebar onClick={() => void simpanGajiPokok()} disabled={sibuk || Number(gajiPokok) < 1}>
            {sibuk ? "Menyimpan..." : "Simpan gaji pokok"}
          </Tombol>
        </div>
      </section>

      {data.grup.map((g) => (
        <section className="kartu grup-rencana" key={g.id}>
          <div className="baris-antara">
            <h2>{g.nama}</h2>
            <span className="muted">
              {rp(g.pos.reduce((s, p) => s + (draf[`s:${p.id}`] ?? 0), 0))}
            </span>
          </div>
          {g.pos.map((p) => {
            const key = `s:${p.id}`;
            const v = draf[key] ?? 0;
            const maks = Math.max(1_000_000, Math.ceil((Math.max(v, p.jatahRencana) * 2) / 100000) * 100000);
            return (
              <div className="slider" key={p.id}>
                <div className="baris-antara">
                  <span>{p.nama}</span>
                  <InputRupiah
                    className="angka-input"
                    value={v}
                    onChange={(nilai) => ubah(key, Number(nilai))}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={maks}
                  step={10000}
                  value={Math.min(v, maks)}
                  onChange={(e) => ubah(key, Number(e.target.value))}
                />
                <div className="baris-antara kecil muted">
                  <span>Sekarang {rp(p.jatahRencana)}</span>
                  <span>Terpakai {rp(p.terpakai)}</span>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <section className="kartu">
        <h2>Pos di luar grup</h2>
        {(
          [
            ["dd", "Dana Darurat"],
            ["tabungan", "Tabungan"],
            ["investasi", "Investasi"],
          ] as const
        ).map(([key, label]) => (
          <div className="slider" key={key}>
            <div className="baris-antara">
              <span>{label}</span>
              <InputRupiah
                className="angka-input"
                value={draf[key] ?? 0}
                onChange={(nilai) => ubah(key, Number(nilai))}
              />
            </div>
          </div>
        ))}
        <p className="muted kecil">
          Tabungan dan Investasi hanya bisa diubah mulai periode berikutnya. Untuk memindahkan sekarang, pakai tab
          Transaksi.
        </p>
      </section>

      <section className="kartu aksi-bawah">
        <label className="cek">
          <input type="checkbox" checked={sekarang} onChange={(e) => setSekarang(e.target.checked)} />
          <span>Berlaku juga di periode berjalan (selisih masuk/keluar Saldo)</span>
        </label>
        <div className="baris-tombol">
          <Tombol varian="sekunder" onClick={() => setDraf(drafRencana(data))} disabled={sibuk}>
            Reset
          </Tombol>
          <Tombol onClick={() => void simpan()} disabled={sibuk}>
            {sibuk ? "Menyimpan..." : "Simpan rencana"}
          </Tombol>
        </div>
      </section>
    </div>
  );
}
