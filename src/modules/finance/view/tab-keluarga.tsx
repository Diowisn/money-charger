import { useCallback, useEffect, useState } from "react";
import { Tombol } from "@/components/tombol";
import { rp } from "./format";
import type { Kirim } from "./tipe";

interface Anggota {
  id: number;
  email: string;
  nama: string | null;
  role: string;
  status: string;
  waNumber: string | null;
}

interface Persetujuan {
  id: number;
  aktor: string;
  dibuatPada: string;
  body: Record<string, unknown>;
}

interface DataKeluarga {
  anggota: Anggota[];
  persetujuan: Persetujuan[];
  peran: string;
}

const LABEL_PERAN: Record<string, string> = {
  owner: "Pemilik",
  admin: "Admin",
  member: "Anggota",
  viewer: "Lihat saja",
};

export function Keluarga({ kirim, sibuk }: { kirim: Kirim; sibuk: boolean }) {
  const [data, setData] = useState<DataKeluarga | null>(null);
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [role, setRole] = useState("member");
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setGalat(null);
    try {
      const res = await fetch("/api/keluarga", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<DataKeluarga>;
      if (!res.ok || !j.ok) {
        setGalat(j.error ?? "Gagal memuat data keluarga.");
        return;
      }
      setData({ anggota: j.anggota ?? [], persetujuan: j.persetujuan ?? [], peran: j.peran ?? "member" });
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function aksi(body: Record<string, unknown>) {
    const ok = await kirim("/api/keluarga", "POST", body);
    if (ok) await muat();
  }

  const bolehKelola = data?.peran === "owner" || data?.peran === "admin";

  return (
    <div className="wawasan">
      <section className="kartu">
        <div className="baris-antara">
          <h2>Keluarga &amp; akses</h2>
          <span className="badge">{LABEL_PERAN[data?.peran ?? "member"] ?? data?.peran}</span>
        </div>
        <p className="muted kecil">
          Anggota memakai data, anggaran, dan dompet yang sama. Admin bisa mengubah data; anggota mengajukan transaksi untuk disetujui; lihat saja tidak bisa mengubah apa pun.
        </p>
        {galat ? <p className="error" role="alert">{galat}</p> : null}
      </section>

      {bolehKelola ? (
        <section className="kartu">
          <h2>Tambah anggota</h2>
          <div className="form">
            <label>
              Email akun
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
            </label>
            <label>
              Nomor WhatsApp (opsional)
              <input type="tel" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="08xxxxxxxxxx" />
            </label>
            <label>
              Peran
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="member">Anggota</option>
                <option value="viewer">Lihat saja</option>
              </select>
            </label>
            <Tombol
              lebar
              disabled={sibuk || !email.trim()}
              onClick={() => void aksi({ aksi: "tambah", email: email.trim(), role, wa: wa.trim() || null })}
            >
              Tambah anggota
            </Tombol>
          </div>
        </section>
      ) : null}

      <section className="kartu">
        <h2>Anggota</h2>
        <ul className="wawasan-daftar">
          {(data?.anggota ?? []).map((item) => (
            <li key={item.id} className="baris-antara">
              <span>
                <b>{item.nama || item.email}</b>
                <small className="muted"> · {item.email}{item.waNumber ? ` · WA ${item.waNumber}` : ""}</small>
              </span>
              {bolehKelola ? (
                <span className="baris-antara">
                  <select
                    value={item.role}
                    disabled={sibuk}
                    onChange={(e) => void aksi({ aksi: "peran", id: item.id, role: e.target.value })}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Anggota</option>
                    <option value="viewer">Lihat saja</option>
                  </select>
                  <button type="button" className="tautan muted" disabled={sibuk} onClick={() => void aksi({ aksi: "hapus", id: item.id })}>
                    Hapus
                  </button>
                </span>
              ) : (
                <span className="badge">{LABEL_PERAN[item.role] ?? item.role}</span>
              )}
            </li>
          ))}
          {data && !data.anggota.length ? <li className="muted kecil">Belum ada anggota keluarga.</li> : null}
        </ul>
      </section>

      {bolehKelola ? (
        <section className="kartu">
          <div className="baris-antara">
            <h2>Persetujuan transaksi</h2>
            <span className={`badge ${data?.persetujuan.length ? "tipe-out" : "hijau"}`}>
              {data?.persetujuan.length ?? 0} menunggu
            </span>
          </div>
          <ul className="wawasan-daftar">
            {(data?.persetujuan ?? []).map((item) => (
              <li key={item.id}>
                <div className="baris-antara">
                  <span>
                    <b>{item.aktor}</b>
                    <small className="muted"> · {item.body.tipe ? String(item.body.tipe) : "transaksi"} {typeof item.body.nominal === "number" ? rp(item.body.nominal) : ""}</small>
                  </span>
                  <span className="baris-antara">
                    <Tombol varian="sekunder" disabled={sibuk} onClick={() => void aksi({ aksi: "setujui", id: item.id })}>
                      Setujui
                    </Tombol>
                    <Tombol varian="tautan" disabled={sibuk} onClick={() => void aksi({ aksi: "tolak", id: item.id })}>
                      Tolak
                    </Tombol>
                  </span>
                </div>
                <small className="muted">{item.dibuatPada}</small>
              </li>
            ))}
            {data && !data.persetujuan.length ? <li className="muted kecil">Tidak ada pengajuan menunggu.</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
