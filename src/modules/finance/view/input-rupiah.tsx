import { useRef } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";
import { formatAngkaRupiah } from "./format";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string | number;
  onChange: (nilai: string) => void;
};

export function InputRupiah({ value, onChange, ...sisa }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  function ubah(event: ChangeEvent<HTMLInputElement>) {
    const el = event.currentTarget;
    const digitSebelum = el.value.slice(0, el.selectionStart ?? 0).replace(/\D/g, "").length;
    const digit = el.value.replace(/\D/g, "");
    onChange(digit);
    requestAnimationFrame(() => {
      const baru = formatAngkaRupiah(digit);
      let posisi = 0;
      for (let digitTerlewati = 0; posisi < baru.length && digitTerlewati < digitSebelum; posisi++) {
        if (/\d/.test(baru[posisi])) digitTerlewati++;
      }
      ref.current?.setSelectionRange(posisi, posisi);
    });
  }

  return (
    <input
      {...sisa}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatAngkaRupiah(value)}
      onChange={ubah}
    />
  );
}
