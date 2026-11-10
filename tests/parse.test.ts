import { describe, expect, it } from "vitest";
import { parseAmount } from "@/lib/parse/amount";
import { parseCommand } from "@/lib/parse/command";
import { extractDate, wibDate } from "@/lib/parse/date";
import { rp, splitPesan } from "@/lib/format";
import { validasiAi } from "@/lib/ai";
import { normalisasiNominalStruk, validasiStruk } from "@/lib/ai-vision";
import { arahEmail, deteksiPenyediaEmail, ekstrakDetailEmail, ekstrakDompetEmail, ekstrakNominalEmail, ekstrakTanggalEmail, kemungkinanGaji, labelEmail } from "@/lib/email";
import { cocokAkun } from "@/lib/parse/dompet";
import type { Akun } from "@/lib/types";

const v = (t: string) => {
  const r = parseAmount(t);
  return r.ok ? r.value : r.reason;
};

describe("parser nominal (SRS 6.1)", () => {
  it.each([
    ["25rb", 25_000],
    ["25k", 25_000],
    ["25.000", 25_000],
    ["25000", 25_000],
    ["1.8jt", 1_800_000],
    ["1,8jt", 1_800_000],
    ["1,8 juta", 1_800_000],
    ["1jt", 1_000_000],
    ["1 juta", 1_000_000],
    ["1.500.000", 1_500_000],
    ["250rb", 250_000],
    ["1,85jt", 1_850_000],
    ["Rp25.000", 25_000],
    ["2,5rb", 2_500],
  ])("%s -> %i", (t, hasil) => expect(v(t)).toBe(hasil));

  it("menolak nol, negatif, ambigu, terlalu besar, dan tanpa angka", () => {
    expect(v("0")).toBe("nol");
    expect(v("-25rb")).toBe("negatif");
    expect(v("25,5")).toBe("ambigu");
    expect(v("2000jt")).toBe("terlalu_besar");
    expect(v("kopi")).toBe("tidak_ada");
  });

  it("angka kecil polos tidak mengalahkan nominal bersatuan", () => {
    expect(v("2 gelas kopi 25rb")).toBe(25_000);
    expect(v("parkir 500")).toBe(500);
  });
});

describe("tanggal (SRS 6.3)", () => {
  const today = "2026-10-17";
  it("kata tanggal", () => {
    expect(extractDate("bensin kemarin", today).date).toBe("2026-10-16");
    expect(extractDate("makan lusa lalu", today).date).toBe("2026-10-15");
    expect(extractDate("makan tgl 10", today).date).toBe("2026-10-10");
    expect(extractDate("makan tgl 20", today).date).toBe("2026-09-20"); // n > hari ini -> bulan lalu
    expect(extractDate("makan tgl 17/10", today).date).toBe("2026-10-17");
    expect(extractDate("makan 25/12", today).date).toBe("2025-12-25"); // masa depan -> tahun lalu
  });
  it("menolak tanggal tidak valid atau masa depan", () => {
    expect(extractDate("makan tgl 31/02", today).error).toBeTruthy();
    expect(extractDate("makan tgl 01/01/2027", today).error).toMatch(/masa depan/);
  });
  it("WIB: 23.30 UTC sudah hari berikutnya di WIB", () => {
    expect(wibDate(Date.UTC(2026, 9, 31, 23, 30))).toBe("2026-11-01");
  });
});

describe("perintah", () => {
  const t = "2026-10-17";
  it("out", () => {
    expect(parseCommand("OUT 25rb kopi", t)).toMatchObject({ k: "out", nominal: 25_000, biayaAdmin: 0, uraian: "kopi", tanggal: null });
    expect(parseCommand("out 20rb bensin kemarin", t)).toMatchObject({ k: "out", nominal: 20_000, uraian: "bensin", tanggal: "2026-10-16" });
  });

  it("out dengan biaya admin", () => {
    expect(parseCommand("out 12.500 admin 2.500 kopi", t)).toMatchObject({
      k: "out", nominal: 12_500, biayaAdmin: 2_500, uraian: "kopi",
    });
    expect(parseCommand("out 10rb biaya admin 1rb entah", t)).toMatchObject({
      k: "out", nominal: 10_000, biayaAdmin: 1_000,
    });
  });

  it("piutang, utang, lunasi, bayar", () => {
    expect(parseCommand("piutang 100rb Andi", t)).toMatchObject({ k: "debt_add", jenis: "piutang", nominal: 100_000, nama: "Andi" });
    expect(parseCommand("utang 50rb Budi", t)).toMatchObject({ k: "debt_add", jenis: "utang", nominal: 50_000, nama: "Budi" });
    expect(parseCommand("piutang", t)).toMatchObject({ k: "debt_list", jenis: "piutang" });
    expect(parseCommand("lunasi piutang Andi", t)).toMatchObject({ k: "debt_pay", jenis: "piutang", nama: "Andi", nominal: null });
    expect(parseCommand("bayar piutang Andi 40rb", t)).toMatchObject({ k: "debt_pay", jenis: "piutang", nama: "Andi", nominal: 40_000 });
  });

  it("target dan nabung (goal tabungan)", () => {
    expect(parseCommand("target 5 juta Laptop Baru", t)).toMatchObject({
      k: "goal_add", nominal: 5_000_000, nama: "Laptop Baru", targetTanggal: null,
    });
    expect(parseCommand("target", t)).toMatchObject({ k: "goal_list" });
    expect(parseCommand("nabung 100rb Laptop Baru", t)).toMatchObject({ k: "goal_save", nama: "Laptop Baru", nominal: 100_000 });
  });
  it("gaji, bonus, in", () => {
    expect(parseCommand("gaji masuk 1.8 juta", t)).toMatchObject({ k: "gaji", nominal: 1_800_000 });
    expect(parseCommand("gaji 1.8jt tgl 15", t)).toMatchObject({ k: "gaji", tanggal: "2026-10-15" });
    expect(parseCommand("gaji udah masuk 1,8 juta", t).k).toBe("error"); // sintaks gaji ketat
    expect(parseCommand("gaji bulan lalu 1,5 juta", t).k).toBe("error");
    expect(parseCommand("bonus 200rb ke tabungan", t)).toMatchObject({ k: "bonus", nominal: 200_000, wadah: "tabungan" });
    expect(parseCommand("in 150rb freelance ke investasi", t)).toMatchObject({ k: "in", wadah: "investasi", label: "freelance" });
  });
  it("rencana dan wadah", () => {
    expect(parseCommand("set makan 400rb sekarang", t)).toMatchObject({ k: "set", pos: "makan", nominal: 400_000, sekarang: true });
    expect(parseCommand("geser 50rb dari jajan ke bensin", t)).toMatchObject({ k: "geser", nominal: 50_000, dari: "jajan", ke: "bensin" });
    expect(parseCommand("tarik tabungan 200rb", t)).toMatchObject({ k: "tarik", wadah: "tabungan", nominal: 200_000 });
    expect(parseCommand("pindah 100rb dari saldo ke tabungan", t)).toMatchObject({ k: "pindah", dari: "saldo", ke: "tabungan" });
    expect(parseCommand("pindah 100rb dari saldo ke saldo", t).k).toBe("error");
  });
  it("setup", () => {
    expect(parseCommand("setup 17/10 saldo 300rb tabungan 0 investasi 0", t)).toMatchObject({
      k: "setup", tanggal: "2026-10-17", saldo: 300_000, tabungan: 0, investasi: 0,
    });
  });
  it("kata tunggal dan bahasa bebas", () => {
    expect(parseCommand("Saldo", t).k).toBe("saldo");
    expect(parseCommand("aman", t).k).toBe("aman");
    expect(parseCommand("laporan periode", t).k).toBe("laporan_periode");
    expect(parseCommand("hapus terakhir", t).k).toBe("hapus_terakhir");
    expect(parseCommand("tadi beli kopi 25rb pakai gopay", t).k).toBe("bebas");
    expect(parseCommand("ya tadi beli kopi 25rb", t).k).toBe("bebas");
  });
  it("nominal tidak valid memberi pesan jelas", () => {
    expect(parseCommand("out 0 kopi", t)).toMatchObject({ k: "error" });
    expect(parseCommand("out kopi", t)).toMatchObject({ k: "error" });
  });
});

describe("format", () => {
  it("rupiah dan pemecahan pesan", () => {
    expect(rp(1_800_000)).toBe("Rp1.800.000");
    expect(rp(-20_000)).toBe("-Rp20.000");
    const panjang = Array.from({ length: 600 }, (_, i) => `baris ${i}`).join("\n");
    const bagian = splitPesan(panjang);
    expect(bagian.length).toBeGreaterThan(1);
    expect(bagian.every((b) => b.length <= 4096)).toBe(true);
    expect(bagian.join("\n")).toBe(panjang);
  });
});

describe("validasi AI (SRS 7.3, AC-13)", () => {
  const nama = ["Jajan / Kopi / Self-Reward", "Bensin & Parkir"];
  const today = "2026-10-17";
  const pesan = "tadi beli kopi 25rb pakai gopay";
  it("menerima hasil yang konsisten dengan pesan", () => {
    const r = validasiAi({ intent: "out", amount_text: "25rb", sub_pos: "Jajan / Kopi / Self-Reward", tanggal_text: null, label: "kopi" }, pesan, nama, today);
    expect(r).toMatchObject({ ok: true, hasil: { nominal: 25_000, subPos: "Jajan / Kopi / Self-Reward" } });
  });
  it("menolak nominal yang tidak ada di pesan", () => {
    expect(validasiAi({ intent: "out", amount_text: "35rb" }, pesan, nama, today).ok).toBe(false);
  });
  it("sub_pos di luar daftar dianggap belum dipetakan", () => {
    const r = validasiAi({ intent: "out", amount_text: "25rb", sub_pos: "Kopi" }, pesan, nama, today);
    expect(r).toMatchObject({ ok: true, hasil: { subPos: null } });
  });
  it("gaji tidak dieksekusi, tidak_jelas dan JSON rusak gagal", () => {
    expect(validasiAi({ intent: "gaji", amount_text: "25rb" }, pesan, nama, today)).toMatchObject({ ok: false, alasan: "gaji" });
    expect(validasiAi({ intent: "tidak_jelas" }, pesan, nama, today).ok).toBe(false);
    expect(validasiAi(null, pesan, nama, today).ok).toBe(false);
  });
});

describe("validasi struk/foto (vision AI)", () => {
  const nama = ["Jajan / Kopi / Self-Reward", "Bensin & Parkir"];
  const today = "2026-10-17";
  it("menerima hasil struk yang jelas", () => {
    const r = validasiStruk(
      { intent: "out", amount_text: "Rp45.000", sub_pos: "Bensin & Parkir", label: "SPBU Pertamina" },
      nama,
      today,
    );
    expect(r).toMatchObject({ ok: true, hasil: { nominal: 45_000, subPos: "Bensin & Parkir", label: "SPBU Pertamina" } });
  });
  it("sub_pos di luar daftar dianggap belum dipetakan", () => {
    const r = validasiStruk({ intent: "out", amount_text: "20rb", sub_pos: "Tidak Ada" }, nama, today);
    expect(r).toMatchObject({ ok: true, hasil: { subPos: null } });
  });
  it("intent tidak_jelas, amount_text kosong, dan JSON rusak ditolak", () => {
    expect(validasiStruk({ intent: "tidak_jelas" }, nama, today)).toMatchObject({ ok: false, alasan: "tidak_jelas" });
    expect(validasiStruk({ intent: "out", amount_text: "" }, nama, today)).toMatchObject({ ok: false, alasan: "tidak_jelas" });
    expect(validasiStruk(null, nama, today).ok).toBe(false);
  });
  it("tanggal di luar format diabaikan, bukan menggagalkan seluruh hasil", () => {
    const r = validasiStruk({ intent: "out", amount_text: "10rb", tanggal_text: "entah kapan" }, nama, today);
    expect(r).toMatchObject({ ok: true, hasil: { tanggal: null } });
  });
  it("menerima nominal struk format Indonesia (koma ribuan)", () => {
    expect(normalisasiNominalStruk("6,700")).toBe("6700");
    expect(normalisasiNominalStruk("Rp 1.175.000,00")).toBe("1175000");
    expect(normalisasiNominalStruk("6,700.00")).toBe("6700");
    expect(normalisasiNominalStruk("Rp45.000")).toBe("45000");
    expect(normalisasiNominalStruk("20rb")).toBe("20rb");

    const r = validasiStruk(
      { intent: "out", amount_text: "TOTAL BELANJA : 6,700", toko: "Indomaret" },
      nama,
      today,
    );
    expect(r).toMatchObject({ ok: true, hasil: { nominal: 6_700, toko: "Indomaret" } });
  });
  it("membaca detail struk: toko, alamat, pajak, dibayar, kembalian", () => {
    const r = validasiStruk(
      {
        intent: "out",
        amount_text: "Rp1.175.000",
        sub_pos: "Jajan / Kopi / Self-Reward",
        tanggal_text: "05/12/2015",
        toko: "SATE REMBIGE",
        alamat: "Kotabaru Selatan - Martapura",
        kontak: "081280755365",
        konsumen: "SDN 06 MARTAPURA",
        kasir: "Yuni",
        kategori: "Makanan & Minuman",
        pajak_text: "Rp106.818",
        dibayar_text: "Rp1.200.000",
        kembalian_text: "Rp132.000",
      },
      nama,
      "2026-11-05",
    );
    expect(r).toMatchObject({
      ok: true,
      hasil: {
        nominal: 1_175_000,
        toko: "SATE REMBIGE",
        alamat: "Kotabaru Selatan - Martapura",
        kontak: "081280755365",
        konsumen: "SDN 06 MARTAPURA",
        kasir: "Yuni",
        kategori: "Makanan & Minuman",
        pajak: 106_818,
        dibayar: 1_200_000,
        kembalian: 132_000,
      },
    });
  });
});

describe("parser email masuk (payroll)", () => {
  it("mengambil nominal rupiah dari teks notifikasi", () => {
    expect(ekstrakNominalEmail("Dana masuk Rp1.800.000 ke rekening Anda.")).toBe(1_800_000);
    expect(ekstrakNominalEmail("Saldo bertambah sebesar 2.500.000 pada akun Anda.")).toBe(2_500_000);
    expect(ekstrakNominalEmail("Tidak ada angka di sini.")).toBeNull();
  });

  it("mendeteksi email gaji/payroll dari subjek atau isi", () => {
    expect(kemungkinanGaji("Notifikasi Gaji Bulan Ini", "")).toBe(true);
    expect(kemungkinanGaji("", "Payroll telah dikirim ke rekening Anda")).toBe(true);
    expect(kemungkinanGaji("Transfer Masuk", "Dana masuk Rp500.000")).toBe(false);
  });

  it("contoh notifikasi BSI Syariah: gaji vs transfer masuk", () => {
    const gaji = "Yth. Nasabah, gaji payroll bulan November telah dikreditkan sebesar Rp8.500.000 ke rekening Anda.";
    expect(ekstrakNominalEmail(gaji)).toBe(8_500_000);
    expect(kemungkinanGaji("Notifikasi Payroll BSI", gaji)).toBe(true);

    const transfer = "Transfer masuk dari ANDI sebesar Rp1.250.000 telah diterima di rekening Anda.";
    expect(ekstrakNominalEmail(transfer)).toBe(1_250_000);
    expect(kemungkinanGaji("Transfer Masuk", transfer)).toBe(false);
  });

  it("membaca nominal tabel incoming BSI tanpa Rp", () => {
    const teks = "Nominal\n1,800,000.00\nDeskripsi\nSuccess";
    expect(ekstrakNominalEmail(teks)).toBe(1_800_000);
  });

  it("membedakan email keluar QRIS dan email masuk payroll", () => {
    const keluar = "Nominal Transaksi Rp 25.925,00\nNama Merchant\nTrijaya Digital";
    expect(arahEmail("Transaksi Pembayaran QRIS MPM Kamu Berhasil", keluar)).toBe("keluar");
    expect(labelEmail("Transaksi Pembayaran QRIS MPM Kamu Berhasil", keluar, "keluar")).toBe("Trijaya Digital");

    const masuk = "Anda menerima transfer uang pada Rekening Anda.\nNominal\n1,800,000.00\nJenis Transaksi Payroll";
    expect(arahEmail("INCOMING TRANSACTION NOTIFICATION", masuk)).toBe("gaji");
    expect(ekstrakNominalEmail(masuk)).toBe(1_800_000);
  });

  it("mengambil tanggal transaksi dari isi email", () => {
    expect(ekstrakTanggalEmail("Tanggal 31-OKT-26 21:16", "2026-11-05")).toBe("2026-10-31");
    expect(ekstrakTanggalEmail("5 November 2026 20.41", "2026-11-05")).toBe("2026-11-05");
    expect(ekstrakTanggalEmail("tanpa tanggal", "2026-11-05")).toBeNull();
  });

  it("memakai total akhir bila email BSI memuat biaya admin", () => {
    const teks = [
      "Nominal Transaksi Rp 100.000,00",
      "Biaya Admin Rp 2.500,00",
      "Nama Merchant",
      "Toko Contoh",
    ].join("\n");
    expect(ekstrakNominalEmail(teks)).toBe(102_500);
    expect(ekstrakDetailEmail(teks)).toMatchObject({
      nominal: 100_000,
      biayaAdmin: 2_500,
      total: 102_500,
      merchant: "Toko Contoh",
    });
  });

  it("baris Total menang atas nominal + biaya transfer", () => {
    const teks = [
      "Nominal Transaksi Rp 100.000,00",
      "Biaya Transfer Rp 5.000,00",
      "Total Rp 105.000,00",
      "Lokasi Merchant",
      "Kotabaru",
      "RRN 123456789",
    ].join("\n");
    expect(ekstrakNominalEmail(teks)).toBe(105_000);
    expect(ekstrakDetailEmail(teks)).toMatchObject({
      biayaAdmin: 5_000,
      total: 105_000,
      lokasi: "Kotabaru",
      rrn: "123456789",
    });
  });
});

describe("integrasi email bank/e-wallet", () => {
  it("mendeteksi penyedia dari domain atau teks notifikasi", () => {
    expect(deteksiPenyediaEmail("noreply@bca.co.id", "", "")).toBe("BCA");
    expect(deteksiPenyediaEmail("", "Notifikasi GoPay", "")).toBe("GoPay");
    expect(deteksiPenyediaEmail("noreply@dana.id", "", "")).toBe("DANA");
    expect(deteksiPenyediaEmail("", "Dana masuk", "Dana masuk Rp500.000")).toBeNull();
  });

  it("mengambil dompet sumber tanpa menipu frasa Rekening Anda", () => {
    expect(ekstrakDompetEmail("Sumber Dana\nBCA ****1234")).toBe("BCA ****1234");
    expect(ekstrakDompetEmail("Rekening Anda\n123456789")).toBeNull();
    expect(ekstrakDetailEmail("Sumber Dana\nGoPay\nMetode Pembayaran\nQRIS\nStatus\nBerhasil")).toMatchObject({
      dompet: "GoPay",
      metode: "QRIS",
      status: "Berhasil",
    });
  });

  it("mencocokkan dompet unik dan mengabaikan yang ambigu/nonaktif", () => {
    const accounts: Akun[] = [
      { id: 1, nama: "BCA", tipe: "bank", saldoAwal: 0, urutan: 1, aktif: true },
      { id: 2, nama: "GoPay", tipe: "ewallet", saldoAwal: 0, urutan: 2, aktif: true },
      { id: 3, nama: "Mandiri", tipe: "bank", saldoAwal: 0, urutan: 3, aktif: true },
      { id: 4, nama: "OVO", tipe: "ewallet", saldoAwal: 0, urutan: 4, aktif: false },
    ];
    expect(cocokAkun(accounts, ["BCA ****1234"])).toBe(1);
    expect(cocokAkun(accounts, ["gopay"])).toBe(2);
    expect(cocokAkun(accounts, ["bank"])).toBeNull();
    expect(cocokAkun(accounts, ["OVO"])).toBeNull();
    expect(cocokAkun(accounts, ["tidak ada"])).toBeNull();
  });
});
