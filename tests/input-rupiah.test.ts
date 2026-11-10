import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatAngkaRupiah } from "@/modules/finance/view/format";
import { InputRupiah } from "@/modules/finance/view/input-rupiah";

describe("input rupiah", () => {
  it("memberi pemisah ribuan dan membuang nol depan", () => {
    expect(formatAngkaRupiah("1500000")).toBe("1.500.000");
    expect(formatAngkaRupiah("500")).toBe("500");
    expect(formatAngkaRupiah("")).toBe("");
    expect(formatAngkaRupiah(2500)).toBe("2.500");
    expect(formatAngkaRupiah("000500")).toBe("500");
  });

  it("menampilkan nilai terformat", () => {
    const html = renderToStaticMarkup(createElement(InputRupiah, { value: "1500000", onChange: () => {} }));
    expect(html).toContain('value="1.500.000"');
    expect(html).toContain('inputMode="numeric"');
  });
});
