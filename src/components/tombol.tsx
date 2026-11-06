import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type VarianTombol = "utama" | "sekunder" | "ghost" | "bahaya" | "tautan";
export type UkuranTombol = "kecil" | "normal" | "besar";

type DasarTombol = {
  varian?: VarianTombol;
  ukuran?: UkuranTombol;
  lebar?: boolean;
  ikon?: ReactNode;
};

function kelasTombol({ varian = "utama", ukuran = "normal", lebar = false }: DasarTombol, tambahan?: string) {
  return [
    "tombol",
    `tombol-${varian}`,
    `tombol-${ukuran}`,
    lebar ? "tombol-lebar" : "",
    tambahan ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Tombol({
  varian,
  ukuran,
  lebar,
  ikon,
  className,
  children,
  type = "button",
  ...sisa
}: ButtonHTMLAttributes<HTMLButtonElement> & DasarTombol) {
  return (
    <button type={type} className={kelasTombol({ varian, ukuran, lebar }, className)} {...sisa}>
      {ikon ? <span className="tombol-ikon" aria-hidden="true">{ikon}</span> : null}
      {children}
    </button>
  );
}

export function TautanTombol({
  varian,
  ukuran,
  lebar,
  ikon,
  className,
  children,
  ...sisa
}: AnchorHTMLAttributes<HTMLAnchorElement> & DasarTombol) {
  return (
    <a className={kelasTombol({ varian, ukuran, lebar }, className)} {...sisa}>
      {ikon ? <span className="tombol-ikon" aria-hidden="true">{ikon}</span> : null}
      {children}
    </a>
  );
}
