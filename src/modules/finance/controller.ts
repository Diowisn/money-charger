import type { NextRequest } from "next/server";
import { tolakJikaBelumLogin } from "@/lib/auth";
import { AksiError } from "@/lib/web-actions";
import {
  batalkanTransaksiFinance,
  kelolaPos,
  muatDashboard,
  simpanRencanaFinance,
  simpanSetupFinance,
  tambahTransaksiFinance,
} from "./model";
import { bacaBody, dashboard, galat, ok } from "./view";

export async function getDashboard(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    return dashboard(await muatDashboard());
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: "Gagal memuat data." }, { status: 500 });
  }
}

export async function postPlan(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new AksiError("Rencana kosong.");
    return ok(await simpanRencanaFinance(items as Parameters<typeof simpanRencanaFinance>[0], body.sekarang === true));
  } catch (e) {
    return galat(e);
  }
}

export async function postTransaction(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    return ok(await tambahTransaksiFinance(body as unknown as Parameters<typeof tambahTransaksiFinance>[0]));
  } catch (e) {
    return galat(e);
  }
}

export async function deleteTransaction(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const pesan = await batalkanTransaksiFinance(Number(body.id));
    return ok({ pesan });
  } catch (e) {
    return galat(e);
  }
}

export async function postPosition(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    const hasil = await kelolaPos(body);
    return hasil ? ok(hasil) : ok();
  } catch (e) {
    return galat(e);
  }
}

export async function postSetup(req: NextRequest) {
  const tolak = tolakJikaBelumLogin(req);
  if (tolak) return tolak;
  try {
    const body = await bacaBody(req);
    await simpanSetupFinance({
      tanggalMulai: String(body.tanggalMulai ?? ""),
      saldoAwal: Number(body.saldoAwal ?? 0),
      tabunganAwal: Number(body.tabunganAwal ?? 0),
      investasiAwal: Number(body.investasiAwal ?? 0),
    });
    return ok();
  } catch (e) {
    return galat(e);
  }
}
