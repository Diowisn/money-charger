import { describe, expect, it } from "vitest";
import { buatIcs } from "@/lib/ics";

describe("kalender ICS", () => {
  it("membuat event all-day dengan escape dan pengingat", () => {
    const ics = buatIcs(
      [
        {
          uid: "otomatis-1-2026-11-15@money-charger",
          tanggal: "2026-11-15",
          ringkasan: "Tagihan, listrik; bulanan",
          deskripsi: "Baris 1\nBaris 2",
          pengingatHari: 1,
        },
      ],
      { sekarang: new Date("2026-11-10T03:04:05Z") },
    );

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTAMP:20261110T030405Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261115");
    expect(ics).toContain("DTEND;VALUE=DATE:20261116");
    expect(ics).toContain("SUMMARY:Tagihan\\, listrik\\; bulanan");
    expect(ics).toContain("DESCRIPTION:Baris 1\\nBaris 2");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("melipat baris panjang dan tetap valid tanpa event", () => {
    const ics = buatIcs(
      [{ uid: "x@y", tanggal: "2026-12-01", ringkasan: "x".repeat(100) }],
      { sekarang: new Date("2026-11-10T00:00:00Z") },
    );
    expect(ics).toMatch(/SUMMARY:x{60,}\r\n x/);
    expect(ics).not.toContain("BEGIN:VALARM");

    const kosong = buatIcs([], { sekarang: new Date("2026-11-10T00:00:00Z") });
    expect(kosong).toContain("BEGIN:VCALENDAR");
    expect(kosong).toContain("END:VCALENDAR");
    expect(kosong).not.toContain("BEGIN:VEVENT");
  });
});
