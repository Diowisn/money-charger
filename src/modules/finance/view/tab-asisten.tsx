import { useEffect, useRef, useState } from "react";
import { Tombol } from "@/components/tombol";
import type { DashboardData } from "@/lib/dashboard";
import { formatMarkdown } from "./format";
import type { ChatPesan, Kirim } from "./tipe";

function JawabanRapi({ teks }: { teks: string }) {
  const isi = teks.replace(/\r\n?/g, "\n").trim();
  const blok = isi.split(/\n\s*\n/).filter(Boolean);
  const renderBaris = (baris: string, i: number) => {
    const teksBaris = baris.trim();
    if (/^\*\*[^*]+\*\*$/.test(teksBaris)) {
      return <h3 key={i}>{teksBaris.slice(2, -2)}</h3>;
    }
    const item = teksBaris.match(/^(?:[-*]\s+|\d+[.)]\s+)(.+)$/);
    if (!item) return <p key={i}>{formatMarkdown(teksBaris)}</p>;
    const nomor = baris.trim().match(/^(\d+)[.)]/)?.[1];
    return (
      <div className="jawaban-item" key={i}>
        <span>{nomor ?? "•"}</span>
        <p>{formatMarkdown(item[1])}</p>
      </div>
    );
  };

  return (
    <div className="jawaban-rapi">
      {blok.map((bagian, i) => {
        const baris = bagian.split("\n").filter((b) => b.trim());
        const daftar = baris.every((b) => /^(?:[-*]\s+|\d+[.)]\s+)/.test(b.trim()));
        return daftar ? (
          <div className="jawaban-daftar" key={i}>{baris.map(renderBaris)}</div>
        ) : (
          <div className="jawaban-blok" key={i}>{baris.map(renderBaris)}</div>
        );
      })}
    </div>
  );
}

const SARAN_TANYA = [
  "Pos apa yang paling boros bulan ini?",
  "Bagaimana cara menabung lebih banyak?",
  "Ringkas kondisi keuanganku.",
  "Sisa uangku cukup sampai gaji berikutnya?",
];

export function Asisten({ data, kirim, sibuk: sibukAksi }: { data: DashboardData; kirim: Kirim; sibuk: boolean }) {
  const [riwayat, setRiwayat] = useState<ChatPesan[]>([]);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const ujung = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ujung.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [riwayat, sibuk]);

  async function kirimTanya(pertanyaan: string) {
    const isi = pertanyaan.trim();
    if (!isi || sibuk) return;
    setGalat(null);
    setRiwayat((r) => [...r, { peran: "user", teks: isi }]);
    setTeks("");
    setSibuk(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pertanyaan: isi }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; jawaban?: string; error?: string };
      if (!res.ok || !j.ok || !j.jawaban) {
        setGalat(j.error ?? "Asisten gagal menjawab.");
        return;
      }
      setRiwayat((r) => [...r, { peran: "ai", teks: j.jawaban! }]);
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="cn-halaman cn-asisten">
      <section className="kartu">
        <div className="baris-antara">
          <div>
            <p className="eyebrow">ASISTEN</p>
            <h2>Tanya asisten</h2>
          </div>
          <span className={`badge ${data.pengaturan.aiReviewAktif ? "hijau" : ""}`}>
            Review {data.pengaturan.aiReviewAktif ? "aktif" : "mati"}
          </span>
        </div>
        <p className="muted">
          Jawaban memakai data keuangan dan riwayat transaksi. Asisten tidak mengubah transaksi.
        </p>

        {riwayat.length === 0 ? (
          <div className="saran-chat">
            {SARAN_TANYA.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void kirimTanya(s)}>
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <div className="chat" aria-live="polite">
          {riwayat.map((m, i) => (
            <div key={i} className={`chat-pesan ${m.peran}`}>
              {m.peran === "ai" ? <JawabanRapi teks={m.teks} /> : m.teks}
            </div>
          ))}
          {sibuk ? <div className="chat-pesan ai muted">Sedang membaca data...</div> : null}
          <div ref={ujung} />
        </div>

        {galat ? <p className="merah kecil">{galat}</p> : null}

        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void kirimTanya(teks);
          }}
        >
          <input
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="Tulis pertanyaan tentang keuanganmu..."
            maxLength={400}
            disabled={sibuk}
            aria-label="Pertanyaan untuk asisten"
          />
          <Tombol type="submit" disabled={sibuk || teks.trim().length < 3}>
            Kirim
          </Tombol>
        </form>
        {riwayat.length ? (
          <Tombol varian="tautan" onClick={() => setRiwayat([])}>
            Bersihkan percakapan
          </Tombol>
        ) : (
          <p className="muted kecil">Butuh GROQ_API_KEY agar asisten aktif.</p>
        )}
      </section>

      <aside className="kartu cn-ringkas">
        <span className="badge hijau">Pintar</span>
        <p className="muted kecil">Review bulanan otomatis</p>
        <p className="angka">{data.pengaturan.aiReviewAktif ? "Aktif" : "Mati"}</p>
        <Tombol
          varian="sekunder"
          lebar
          disabled={sibukAksi}
          onClick={() => void kirim("/api/pengaturan", "POST", { aiReviewAktif: !data.pengaturan.aiReviewAktif })}
        >
          {data.pengaturan.aiReviewAktif ? "Matikan review" : "Aktifkan review"}
        </Tombol>
        <p className="muted kecil">Contoh pertanyaan</p>
        <ul className="cn-daftar-pil">
          {SARAN_TANYA.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
