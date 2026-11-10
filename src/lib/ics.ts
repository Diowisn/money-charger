import { addDays } from "./parse/date";

export interface IcsEvent {
  uid: string;
  /** Tanggal all-day 'YYYY-MM-DD'. */
  tanggal: string;
  ringkasan: string;
  deskripsi?: string;
  /** Kirim pengingat sekian hari sebelum tanggal; 0/undefined berarti tanpa alarm. */
  pengingatHari?: number;
}

function escapeIcs(nilai: string): string {
  return nilai
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function tanggalIcs(tanggal: string): string {
  return tanggal.replace(/-/g, "");
}

function capWaktu(sekarang: Date): string {
  return sekarang.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Melipat baris panjang sesuai RFC 5545 (maksimal ~75 oktet). */
function lipat(baris: string): string {
  if (baris.length <= 73) return baris;
  const bagian: string[] = [];
  let sisa = baris;
  while (sisa.length > 73) {
    bagian.push(sisa.slice(0, 73));
    sisa = ` ${sisa.slice(73)}`;
  }
  bagian.push(sisa);
  return bagian.join("\r\n");
}

export function buatIcs(
  events: IcsEvent[],
  opsi: { nama?: string; sekarang?: Date } = {},
): string {
  const nama = opsi.nama ?? "Money-Charger";
  const stempel = capWaktu(opsi.sekarang ?? new Date());
  const baris = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Money-Charger//Kalender//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(nama)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];

  for (const event of events) {
    baris.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.uid)}`,
      `DTSTAMP:${stempel}`,
      `DTSTART;VALUE=DATE:${tanggalIcs(event.tanggal)}`,
      `DTEND;VALUE=DATE:${tanggalIcs(addDays(event.tanggal, 1))}`,
      `SUMMARY:${escapeIcs(event.ringkasan)}`,
    );
    if (event.deskripsi) baris.push(`DESCRIPTION:${escapeIcs(event.deskripsi)}`);
    baris.push("TRANSP:TRANSPARENT", "CATEGORIES:Money-Charger");
    if (event.pengingatHari && event.pengingatHari > 0) {
      baris.push(
        "BEGIN:VALARM",
        `TRIGGER:-P${Math.trunc(event.pengingatHari)}D`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcs(event.ringkasan)}`,
        "END:VALARM",
      );
    }
    baris.push("END:VEVENT");
  }

  baris.push("END:VCALENDAR");
  return baris.map(lipat).join("\r\n") + "\r\n";
}
