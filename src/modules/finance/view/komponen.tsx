import { useId, type ReactNode } from "react";
import type { TxView } from "@/lib/dashboard";
import { NAMA_TIPE, rp, tanggalPendek } from "./format";

export function BarisInfo({ label, nilai }: { label: string; nilai: ReactNode }) {
  return (
    <div className="baris-info">
      <dt>{label}</dt>
      <dd>{nilai ?? "—"}</dd>
    </div>
  );
}

export function GrafikArea({ nilai, warna, label }: { nilai: number[]; warna: string; label: string }) {
  const id = useId().replace(/:/g, "");
  const w = 320;
  const h = 100;
  const pad = 10;
  const n = Math.max(1, nilai.length);
  const maks = Math.max(1, ...nilai);
  const titik = nilai.map((v, i) => {
    const x = n <= 1 ? w / 2 : (i / (n - 1)) * w;
    const y = h - pad - (v / maks) * (h - pad * 2);
    return [x, y] as const;
  });
  let garis = "";
  if (titik.length) {
    garis = `M ${titik[0][0]} ${titik[0][1]}`;
    for (let i = 0; i < titik.length - 1; i++) {
      const xTengah = (titik[i][0] + titik[i + 1][0]) / 2;
      garis += ` C ${xTengah} ${titik[i][1]}, ${xTengah} ${titik[i + 1][1]}, ${titik[i + 1][0]} ${titik[i + 1][1]}`;
    }
  }
  const area = `${garis} L ${w} ${h} L 0 ${h} Z`;
  const indeksPuncak = nilai.indexOf(maks);
  const puncak = titik[indeksPuncak] ?? [w / 2, h / 2];
  const adaData = nilai.some((v) => v > 0);

  return (
    <div className="grafik-area">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={warna} stopOpacity="0.32" />
            <stop offset="100%" stopColor={warna} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#grad-${id})`} />
        <path
          d={garis}
          fill="none"
          stroke={warna}
          strokeWidth="2.2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {adaData ? (
        <>
          <span
            className="grafik-titik"
            style={{ left: `${(puncak[0] / w) * 100}%`, top: `${(puncak[1] / h) * 100}%`, background: warna }}
          />
          <span
            className="grafik-pil"
            style={{
              left: `${Math.min(76, Math.max(20, (puncak[0] / w) * 100))}%`,
              top: `${Math.max(4, (puncak[1] / h) * 100 - 6)}%`,
              background: warna,
            }}
          >
            {rp(maks)}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function BarisTransaksi({ tx }: { tx: TxView }) {
  const keluar = tx.tipe === "out";
  const judul = tx.subPost ?? tx.label ?? NAMA_TIPE[tx.tipe] ?? tx.tipe;
  const nilai = keluar ? tx.nominal + tx.biayaAdmin : tx.nominal;
  return (
    <li className={tx.status === "batal" ? "item-transaksi batal" : "item-transaksi"}>
      <span className={keluar ? "avatar-uang" : "avatar-uang masuk"}>
        {judul.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <div className="ringkas-info">
        <p className="ringkas-nama">{judul}</p>
        <p className="muted kecil">
          {tanggalPendek(tx.tanggal)} · {NAMA_TIPE[tx.tipe] ?? tx.tipe}
        </p>
      </div>
      <b className={keluar ? "ringkas-jumlah" : "ringkas-jumlah masuk"}>
        {keluar ? "−" : "+"} {rp(nilai)}
      </b>
    </li>
  );
}
