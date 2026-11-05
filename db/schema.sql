-- Skema Money-Charger (SRS bagian 10). Aman dijalankan berulang kali.
-- Semua nominal bigint rupiah. Periode, Saldo, sisa jatah TIDAK disimpan; dihitung dari transactions.

CREATE TABLE IF NOT EXISTS allowed_numbers (
  id         SERIAL PRIMARY KEY,
  wa_number  TEXT NOT NULL UNIQUE,          -- format baku tanpa plus, mis. 62812...
  aktif      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS groups (
  id      SERIAL PRIMARY KEY,
  nama    TEXT NOT NULL UNIQUE,
  urutan  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sub_posts (
  id        SERIAL PRIMARY KEY,
  group_id  INT NOT NULL REFERENCES groups(id),
  nama      TEXT NOT NULL UNIQUE,
  kategori  TEXT,
  aktif     BOOLEAN NOT NULL DEFAULT TRUE,
  urutan    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS aliases (
  id           SERIAL PRIMARY KEY,
  sub_post_id  INT NOT NULL REFERENCES sub_posts(id),
  alias        TEXT NOT NULL UNIQUE          -- huruf kecil
);

CREATE TABLE IF NOT EXISTS plan_versions (
  id           SERIAL PRIMARY KEY,
  nama         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('aktif','usulan','arsip')),
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_items (
  id               SERIAL PRIMARY KEY,
  plan_version_id  INT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  tipe             TEXT NOT NULL CHECK (tipe IN ('sub_pos','dd','tabungan','investasi')),
  sub_post_id      INT REFERENCES sub_posts(id),
  nominal          BIGINT NOT NULL CHECK (nominal >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  BIGSERIAL PRIMARY KEY,
  tipe                TEXT NOT NULL CHECK (tipe IN
    ('out','in','gaji','bonus','tarik','pindah','alokasi_gaji','selisih_gaji','tambahan_jatah','geser')),
  nominal             BIGINT NOT NULL CHECK (nominal > 0),
  biaya_admin         BIGINT NOT NULL DEFAULT 0 CHECK (biaya_admin >= 0),
  sub_post_id         INT REFERENCES sub_posts(id),
  sub_post_id_tujuan  INT REFERENCES sub_posts(id),         -- hanya untuk geser
  wadah_asal          TEXT CHECK (wadah_asal IN ('saldo','tabungan','investasi')),
  wadah_tujuan        TEXT CHECK (wadah_tujuan IN ('saldo','tabungan','investasi')),
  tanggal             DATE NOT NULL,                        -- tanggal bisnis (WIB)
  label               TEXT,
  sumber              TEXT NOT NULL DEFAULT 'kaku' CHECK (sumber IN ('kaku','ai')),
  status              TEXT NOT NULL DEFAULT 'berlaku' CHECK (status IN ('berlaku','batal')),
  pengganti_dari      BIGINT,
  induk_id            BIGINT,                               -- turunan gaji/bonus ikut batal bersama induknya
  plan_version_id     INT REFERENCES plan_versions(id),     -- hanya untuk gaji: rencana yang berlaku di periode itu
  wa_message_id       TEXT,
  dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_tanggal ON transactions (tanggal);
CREATE INDEX IF NOT EXISTS idx_tx_induk ON transactions (induk_id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS biaya_admin BIGINT NOT NULL DEFAULT 0 CHECK (biaya_admin >= 0);

CREATE TABLE IF NOT EXISTS debts (
  id            BIGSERIAL PRIMARY KEY,
  jenis         TEXT NOT NULL CHECK (jenis IN ('piutang','utang')),
  nama          TEXT NOT NULL,
  nominal       BIGINT NOT NULL CHECK (nominal > 0),
  dibayar       BIGINT NOT NULL DEFAULT 0 CHECK (dibayar >= 0),
  tanggal       DATE NOT NULL,
  jatuh_tempo   DATE,
  catatan       TEXT,
  status        TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','lunas','batal')),
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts (status);
CREATE INDEX IF NOT EXISTS idx_debts_jenis ON debts (jenis);

CREATE TABLE IF NOT EXISTS saving_goals (
  id              BIGSERIAL PRIMARY KEY,
  nama            TEXT NOT NULL,
  target_nominal  BIGINT NOT NULL CHECK (target_nominal > 0),
  terkumpul       BIGINT NOT NULL DEFAULT 0 CHECK (terkumpul >= 0),
  tanggal         DATE NOT NULL,
  target_tanggal  DATE,
  catatan         TEXT,
  status          TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','selesai','batal')),
  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_status ON saving_goals (status);

CREATE TABLE IF NOT EXISTS pending_actions (
  id                BIGSERIAL PRIMARY KEY,
  jenis             TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  kedaluwarsa_pada  TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'menunggu',
  dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound_messages (
  wa_message_id  TEXT PRIMARY KEY,
  diterima_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hasil          TEXT
);

CREATE TABLE IF NOT EXISTS config (
  kunci  TEXT PRIMARY KEY,
  nilai  TEXT NOT NULL
);
