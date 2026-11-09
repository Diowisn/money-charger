import type { NextRequest } from "next/server";
import { pemilikRequest } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import {
  batalkanDebtFinance,
  batalkanGoalFinance,
  batalkanTransaksiFinance,
  bayarDebtFinance,
  kelolaPos,
  muatDashboard,
  nabungGoalFinance,
  simpanDigestFinance,
  simpanGajiPokokFinance,
  simpanRencanaFinance,
  simpanSetupFinance,
  tambahDebtFinance,
  tambahGoalFinance,
  tambahTransaksiFinance,
} from "./model";
import { bacaBody, dashboard, galat, ok } from "./view";

export async function getDashboard(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    return dashboard(await muatDashboard(userId));
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: "Gagal memuat data." }, { status: 500 });
  }
}

export async function postPlan(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new AksiError("Rencana kosong.");
    return ok(await simpanRencanaFinance(items as Parameters<typeof simpanRencanaFinance>[0], body.sekarang === true, userId));
  } catch (e) {
    return galat(e);
  }
}

export async function postTransaction(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    return ok(await tambahTransaksiFinance(body as unknown as Parameters<typeof tambahTransaksiFinance>[0], userId));
  } catch (e) {
    return galat(e);
  }
}

export async function deleteTransaction(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    const pesan = await batalkanTransaksiFinance(Number(body.id), userId);
    return ok({ pesan });
  } catch (e) {
    return galat(e);
  }
}

export async function postPosition(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    const hasil = await kelolaPos(body, userId);
    return hasil ? ok(hasil) : ok();
  } catch (e) {
    return galat(e);
  }
}

export async function postDebt(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    const aksi = String(body.aksi ?? "");
    if (aksi === "tambah") {
      const hasil = await tambahDebtFinance(body as unknown as Parameters<typeof tambahDebtFinance>[0], userId);
      return ok(hasil);
    }
    if (aksi === "bayar") {
      const nominal = body.nominal === undefined || body.nominal === null || body.nominal === "" ? null : Number(body.nominal);
      return ok(await bayarDebtFinance(Number(body.id), nominal, userId));
    }
    if (aksi === "batal") {
      await batalkanDebtFinance(Number(body.id), userId);
      return ok();
    }
    throw new AksiError("Aksi piutang/utang tidak dikenal.");
  } catch (e) {
    return galat(e);
  }
}

export async function postGoal(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    const aksi = String(body.aksi ?? "");
    if (aksi === "tambah") {
      const hasil = await tambahGoalFinance(body as unknown as Parameters<typeof tambahGoalFinance>[0], userId);
      return ok(hasil);
    }
    if (aksi === "nabung") {
      return ok(await nabungGoalFinance(Number(body.id), Number(body.nominal), userId));
    }
    if (aksi === "batal") {
      await batalkanGoalFinance(Number(body.id), userId);
      return ok();
    }
    throw new AksiError("Aksi target tabungan tidak dikenal.");
  } catch (e) {
    return galat(e);
  }
}

export async function postSetup(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  const userId = auth.userId;
  try {
    const body = await bacaBody(req);
    await simpanSetupFinance({
      tanggalMulai: String(body.tanggalMulai ?? ""),
      saldoAwal: Number(body.saldoAwal ?? 0),
      tabunganAwal: Number(body.tabunganAwal ?? 0),
      investasiAwal: Number(body.investasiAwal ?? 0),
    }, userId);
    return ok();
  } catch (e) {
    return galat(e);
  }
}

export async function postPengaturan(req: NextRequest) {
  const auth = await pemilikRequest(req);
  if ("tolak" in auth) return auth.tolak;
  try {
    const body = await bacaBody(req);
    if (body.gajiPokok !== undefined) {
      await simpanGajiPokokFinance(Number(body.gajiPokok), auth.userId);
    }
    if (body.digestAktif !== undefined) {
      await simpanDigestFinance(body.digestAktif === true, auth.userId);
    }
    if (body.gajiPokok === undefined && body.digestAktif === undefined) {
      throw new AksiError("Tidak ada perubahan.");
    }
    return ok({ pesan: "Pengaturan diperbarui." });
  } catch (e) {
    return galat(e);
  }
}
