import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TautanTombol, Tombol } from "@/components/tombol";

describe("komponen tombol", () => {
  it("memakai type button dan kelas varian default", () => {
    const html = renderToStaticMarkup(createElement(Tombol, { lebar: true, className: "tambahan" }, "Simpan"));
    expect(html).toContain('type="button"');
    expect(html).toContain('class="tombol tombol-utama tombol-normal tombol-lebar tambahan"');
  });

  it("mendukung varian, ukuran, dan ikon", () => {
    const html = renderToStaticMarkup(
      createElement(Tombol, { varian: "bahaya", ukuran: "kecil", ikon: createElement("svg") }, "Hapus"),
    );
    expect(html).toContain('class="tombol tombol-bahaya tombol-kecil"');
    expect(html).toContain('class="tombol-ikon" aria-hidden="true"');
  });

  it("merender tautan dengan kelas tombol yang sama", () => {
    const html = renderToStaticMarkup(
      createElement(TautanTombol, { href: "/api/auth/oauth/google", varian: "ghost", lebar: true }, "Google"),
    );
    expect(html).toContain('href="/api/auth/oauth/google"');
    expect(html).toContain('class="tombol tombol-ghost tombol-normal tombol-lebar"');
  });
});
