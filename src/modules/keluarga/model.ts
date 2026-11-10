import { catatAudit } from "@/lib/audit";
import { normalisasiNomorWa } from "@/lib/auth";
import { getPool, PgRepo } from "@/lib/pg-repo";
import { AksiError } from "@/lib/web-actions";
import { tambahTransaksiFinance } from "@/modules/finance/model";

const PERAN = new Set(["admin", "member", "viewer"]);
const JENIS = "persetujuan_transaksi";

export interface AnggotaView {
  id: number;
  memberId: string;
  email: string;
  nama: string | null;
  role: string;
  status: string;
  waNumber: string | null;
}

export interface PersetujuanView {
  id: number;
  aktor: string;
  dibuatPada: string;
  body: Record<string, unknown>;
}

export async function daftarKeluarga(ownerId: string) {
  const anggota = await getPool().query<AnggotaView>(
    `SELECT wm.id, wm.member_id AS "memberId", u.email, u.nama, wm.role, wm.status, wm.wa_number AS "waNumber"
     FROM workspace_members wm
     JOIN auth_users u ON u.id = wm.member_id
     WHERE wm.owner_id = $1
     ORDER BY wm.id`,
    [ownerId],
  );
  const persetujuan = await getPool().query<PersetujuanView>(
    `SELECT p.id, COALESCE(u.nama, u.email) AS aktor, p.dibuat_pada AS "dibuatPada", p.payload->'body' AS body
     FROM pending_actions p
     LEFT JOIN auth_users u ON u.id::text = p.payload->>'actorId'
     WHERE p.jenis = $1 AND p.payload->>'ownerId' = $2 AND p.status = 'menunggu' AND p.kedaluwarsa_pada > now()
     ORDER BY p.id DESC LIMIT 50`,
    [JENIS, ownerId],
  );
  return { anggota: anggota.rows, persetujuan: persetujuan.rows };
}

export async function tambahAnggota(ownerId: string, emailInput: unknown, roleInput: unknown, waInput?: unknown) {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  const role = typeof roleInput === "string" && PERAN.has(roleInput) ? roleInput : "member";
  const wa = typeof waInput === "string" ? normalisasiNomorWa(waInput) : "";
  if (!email) throw new AksiError("Email anggota wajib diisi.");
  const user = await getPool().query<{ id: string }>("SELECT id FROM auth_users WHERE lower(email) = $1 LIMIT 1", [email]);
  const memberId = user.rows[0]?.id;
  if (!memberId) throw new AksiError("Email itu belum terdaftar sebagai akun Money-Charger.");
  if (memberId === ownerId) throw new AksiError("Pemilik tidak perlu ditambahkan sebagai anggota.");

  const lama = await getPool().query<{ wa_number: string | null }>(
    "SELECT wa_number FROM workspace_members WHERE owner_id = $1 AND member_id = $2",
    [ownerId, memberId],
  );
  const waLama = lama.rows[0]?.wa_number ?? null;
  if (wa && wa !== waLama) {
    const dipakai = await getPool().query("SELECT 1 FROM allowed_numbers WHERE wa_number = $1", [wa]);
    if (dipakai.rowCount) throw new AksiError("Nomor WhatsApp itu sudah dipakai akun lain.");
  }

  await getPool().query(
    `INSERT INTO workspace_members (owner_id, member_id, role, wa_number)
     VALUES ($1, $2, $3, NULLIF($4, ''))
     ON CONFLICT (owner_id, member_id) DO UPDATE SET role = EXCLUDED.role, status = 'aktif', wa_number = EXCLUDED.wa_number`,
    [ownerId, memberId, role, wa],
  );
  if (wa) {
    await getPool().query("INSERT INTO allowed_numbers (wa_number) VALUES ($1) ON CONFLICT DO NOTHING", [wa]);
  }
  if (waLama && waLama !== wa) {
    await getPool().query(
      "DELETE FROM allowed_numbers WHERE wa_number = $1 AND NOT EXISTS (SELECT 1 FROM workspace_members WHERE wa_number = $1)",
      [waLama],
    );
  }
  await catatAudit("web", "anggota_ditambah", { email, role, wa: wa ? "***" : null });
}

export async function ubahPeran(ownerId: string, id: number, roleInput: unknown) {
  const role = typeof roleInput === "string" && PERAN.has(roleInput) ? roleInput : null;
  if (!role) throw new AksiError("Peran tidak dikenal.");
  const hasil = await getPool().query("UPDATE workspace_members SET role = $3 WHERE id = $1 AND owner_id = $2", [id, ownerId, role]);
  if (!hasil.rowCount) throw new AksiError("Anggota tidak ditemukan.");
  await catatAudit("web", "peran_anggota_diubah", { id, role });
}

export async function hapusAnggota(ownerId: string, id: number) {
  const lama = await getPool().query<{ member_id: string; wa_number: string | null }>(
    "SELECT member_id, wa_number FROM workspace_members WHERE id = $1 AND owner_id = $2",
    [id, ownerId],
  );
  const anggota = lama.rows[0];
  if (!anggota) throw new AksiError("Anggota tidak ditemukan.");
  await getPool().query("DELETE FROM workspace_members WHERE id = $1 AND owner_id = $2", [id, ownerId]);
  await getPool().query(
    `UPDATE pending_actions SET status = 'batal'
     WHERE jenis = $1 AND status = 'menunggu' AND payload->>'ownerId' = $2 AND payload->>'actorId' = $3`,
    [JENIS, ownerId, anggota.member_id],
  );
  if (anggota.wa_number) {
    await getPool().query(
      "DELETE FROM allowed_numbers WHERE wa_number = $1 AND NOT EXISTS (SELECT 1 FROM workspace_members WHERE wa_number = $1)",
      [anggota.wa_number],
    );
  }
  await catatAudit("web", "anggota_dihapus", { id });
}

export async function ajukanTransaksi(ownerId: string, actorId: string, body: Record<string, unknown>) {
  const id = await new PgRepo(undefined, undefined, ownerId).addPending(
    JENIS,
    { ownerId, actorId, body },
    Date.now() + 7 * 86_400_000,
  );
  await catatAudit("web", "transaksi_diajukan", { id, actorId });
  return { id, pesan: "Transaksi diajukan dan menunggu persetujuan pemilik." };
}

export async function setujuiTransaksi(ownerId: string, id: number) {
  const klaim = await getPool().query<{ body?: Record<string, unknown> }>(
    `UPDATE pending_actions SET status = 'diproses'
     WHERE id = $1 AND jenis = $2 AND status = 'menunggu'
       AND kedaluwarsa_pada > now() AND payload->>'ownerId' = $3
     RETURNING payload->'body' AS body`,
    [id, JENIS, ownerId],
  );
  const body = klaim.rows[0]?.body;
  if (!body) throw new AksiError("Pengajuan tidak ditemukan.");

  try {
    const hasil = await tambahTransaksiFinance(body as unknown as Parameters<typeof tambahTransaksiFinance>[0], ownerId);
    await getPool().query("UPDATE pending_actions SET status = 'selesai' WHERE id = $1", [id]);
    await catatAudit("web", "transaksi_disetujui", { id, transaksi: hasil.id });
    return hasil;
  } catch (error) {
    await getPool().query("UPDATE pending_actions SET status = 'menunggu' WHERE id = $1 AND status = 'diproses'", [id]);
    throw error;
  }
}

export async function tolakTransaksi(ownerId: string, id: number) {
  const hasil = await getPool().query(
    `UPDATE pending_actions SET status = 'batal'
     WHERE id = $1 AND jenis = $2 AND status = 'menunggu'
       AND kedaluwarsa_pada > now() AND payload->>'ownerId' = $3`,
    [id, JENIS, ownerId],
  );
  if (!hasil.rowCount) throw new AksiError("Pengajuan tidak ditemukan.");
  await catatAudit("web", "transaksi_ditolak", { id });
}
