const versi = process.env.WA_API_VERSION?.trim() || "v26.0";
const token = process.env.WA_ACCESS_TOKEN?.trim() || "";
const phoneId = process.env.WA_PHONE_NUMBER_ID?.trim() || "";
const appSecret = process.env.WA_APP_SECRET?.trim() || "";
const appIdEnv = process.env.META_APP_ID?.trim() || "";
const wabaId = process.env.WA_BUSINESS_ACCOUNT_ID?.trim() || "";

interface Hasil {
  ok: boolean;
  status: number;
  body: any;
  text: string;
}

async function ambil(path: string): Promise<Hasil> {
  const res = await fetch(`https://graph.facebook.com/${versi}/${path}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, body, text };
}

function pesanError(h: Hasil): string {
  return h.body?.error?.message ?? h.text.slice(0, 200);
}

async function main() {
  let gagal = false;
  let appId = appIdEnv;

  console.log(`Graph API : ${versi}`);

  if (!token) {
    console.log("Token     : KOSONG");
    gagal = true;
  } else {
    const d = await ambil(
      `debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
    );
    const data = d.body?.data;
    if (d.ok && data?.is_valid) {
      appId = data.app_id || appId;
      const kedaluwarsa =
        data.expires_at === 0 ? "tidak kedaluwarsa" : new Date(Number(data.expires_at) * 1000).toISOString();
      console.log(`Token     : VALID (app ${appId}, ${data.type}, ${kedaluwarsa})`);
      console.log(`Scope     : ${(data.scopes ?? []).join(", ")}`);
    } else {
      console.log(`Token     : TIDAK VALID -> ${pesanError(d)}`);
      gagal = true;
    }
  }

  if (!appId) {
    console.log("App ID    : tidak diketahui (isi META_APP_ID atau token yang valid)");
  }

  if (!phoneId) {
    console.log("Nomor     : KOSONG (WA_PHONE_NUMBER_ID)");
    gagal = true;
  } else {
    const r = await ambil(
      `${phoneId}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(token)}`,
    );
    if (r.ok) {
      console.log(`Nomor     : VALID -> ${r.body.display_phone_number} (${r.body.verified_name}, ${r.body.quality_rating})`);
    } else {
      console.log(`Nomor     : TIDAK VALID -> ${pesanError(r)}`);
      gagal = true;
    }
  }

  if (!appSecret) {
    console.log("App Secret: KOSONG (WA_APP_SECRET)");
    gagal = true;
  } else if (!appId) {
    console.log("App Secret: tidak bisa dicek tanpa App ID");
  } else {
    const r = await ambil(
      `${appId}?fields=id,name&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
    );
    if (r.ok) {
      console.log(`App Secret: COCOK (app "${r.body.name}")`);
    } else {
      console.log(`App Secret: TIDAK COCOK -> ${pesanError(r)}`);
      gagal = true;
    }
  }

  if (!wabaId) {
    console.log("WABA      : dilewati (WA_BUSINESS_ACCOUNT_ID kosong)");
  } else {
    const sub = await ambil(
      `${wabaId}/subscribed_apps?access_token=${encodeURIComponent(token)}`,
    );
    if (sub.ok) {
      const entries = sub.body?.data ?? [];
      const daftar = entries.map((a: any) => `${a.whatsapp_business_api_data?.name ?? "?"} (${a.whatsapp_business_api_data?.id ?? "?"})`);
      const punyaKita = Boolean(appId) && entries.some((a: any) => String(a.whatsapp_business_api_data?.id ?? "") === appId);
      console.log(`WABA      : app terdaftar -> ${daftar.length ? daftar.join(", ") : "TIDAK ADA app yang subscribe"}`);
      if (!punyaKita) {
        console.log(`            App Anda (${appId || "?"}) BELUM subscribe ke WABA.`);
        console.log("            Perbaiki: POST /" + wabaId + "/subscribed_apps dengan token yang sama.");
        gagal = true;
      }
    } else {
      console.log(`WABA      : TIDAK VALID -> ${pesanError(sub)}`);
      gagal = true;
    }
  }

  console.log(gagal ? "\nHASIL: MASIH ADA YANG SALAH" : "\nHASIL: SEMUA KREDENSIAL VALID");
  process.exit(gagal ? 1 : 0);
}

main().catch((e) => {
  console.error("Gagal menjalankan pemeriksaan:", (e as Error).message);
  process.exit(1);
});
