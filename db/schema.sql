-- Skema Money-Charger (SRS bagian 10). Aman dijalankan berulang kali.
-- Semua nominal bigint rupiah. Periode, Saldo, sisa jatah TIDAK disimpan; dihitung dari transactions.

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  nama TEXT,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS nama TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS telepon TEXT;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS tanggal_lahir DATE;

CREATE TABLE IF NOT EXISTS allowed_numbers (
  id         SERIAL PRIMARY KEY,
  wa_number  TEXT NOT NULL UNIQUE,          -- format baku tanpa plus, mis. 62812...
  aktif      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS groups (
  id      SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  nama    TEXT NOT NULL,
  urutan  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sub_posts (
  id        SERIAL PRIMARY KEY,
  user_id   UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  group_id  INT NOT NULL REFERENCES groups(id),
  nama      TEXT NOT NULL,
  kategori  TEXT,
  aktif     BOOLEAN NOT NULL DEFAULT TRUE,
  urutan    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS aliases (
  id           SERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  sub_post_id  INT NOT NULL REFERENCES sub_posts(id),
  alias        TEXT NOT NULL                 -- huruf kecil
);

CREATE TABLE IF NOT EXISTS plan_versions (
  id           SERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  nama         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('aktif','usulan','arsip')),
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_items (
  id               SERIAL PRIMARY KEY,
  user_id          UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  plan_version_id  INT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  tipe             TEXT NOT NULL CHECK (tipe IN ('sub_pos','dd','tabungan','investasi')),
  sub_post_id      INT REFERENCES sub_posts(id),
  nominal          BIGINT NOT NULL CHECK (nominal >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID REFERENCES auth_users(id) ON DELETE CASCADE,
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
  detail              JSONB NOT NULL DEFAULT '{}'::jsonb,    -- detail sumber (merchant, lokasi, RRN, biaya admin, dll)
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
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS detail JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS debts (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth_users(id) ON DELETE CASCADE,
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
  user_id         UUID REFERENCES auth_users(id) ON DELETE CASCADE,
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
ALTER TABLE groups ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE sub_posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE aliases ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE plan_versions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE plan_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE saving_goals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_nama_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_user_nama ON groups (user_id, nama) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_legacy_nama ON groups (nama) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_groups_user_id ON groups (user_id);
CREATE INDEX IF NOT EXISTS idx_sub_posts_user_id ON sub_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_aliases_user_id ON aliases (user_id);
CREATE INDEX IF NOT EXISTS idx_plan_versions_user_id ON plan_versions (user_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_user_id ON plan_items (user_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_id ON debts (user_id);
CREATE INDEX IF NOT EXISTS idx_saving_goals_user_id ON saving_goals (user_id);
ALTER TABLE sub_posts DROP CONSTRAINT IF EXISTS sub_posts_nama_key;
ALTER TABLE aliases DROP CONSTRAINT IF EXISTS aliases_alias_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_posts_user_nama ON sub_posts (user_id, nama) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_posts_legacy_nama ON sub_posts (nama) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aliases_legacy_alias ON aliases (alias) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aliases_user_id_alias ON aliases (user_id, alias) WHERE user_id IS NOT NULL;

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
  user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  kunci  TEXT NOT NULL,
  nilai  TEXT NOT NULL
);
ALTER TABLE config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE;
ALTER TABLE config DROP CONSTRAINT IF EXISTS config_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_user_kunci ON config (user_id, kunci) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_legacy_kunci ON config (kunci) WHERE user_id IS NULL;

CREATE TABLE IF NOT EXISTS inbound_jobs (
  id              BIGSERIAL PRIMARY KEY,
  wa_message_id   TEXT NOT NULL UNIQUE,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','mengirim','selesai','gagal')),
  percobaan       INT NOT NULL DEFAULT 0 CHECK (percobaan >= 0),
  berikutnya_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  error           TEXT,
  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  selesai_pada    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inbound_jobs_antre ON inbound_jobs (status, berikutnya_pada, id);

CREATE TABLE IF NOT EXISTS outbox (
  id               BIGSERIAL PRIMARY KEY,
  wa_number        TEXT NOT NULL,
  pesan            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','mengirim','terkirim','gagal')),
  percobaan        INT NOT NULL DEFAULT 0 CHECK (percobaan >= 0),
  berikutnya_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  error            TEXT,
  dibuat_pada      TIMESTAMPTZ NOT NULL DEFAULT now(),
  terkirim_pada    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_antre ON outbox (status, berikutnya_pada, id);

CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGSERIAL PRIMARY KEY,
  aktor       TEXT NOT NULL,
  aksi        TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_dibuat ON audit_events (dibuat_pada DESC);

CREATE TABLE IF NOT EXISTS auth_identities (
  provider    TEXT NOT NULL CHECK (provider IN ('google','facebook')),
  subject     TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS integrations (
  id              SERIAL PRIMARY KEY,
  jenis           TEXT NOT NULL CHECK (jenis IN ('whatsapp','email','ai')),
  nama            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif','perlu_perhatian')),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jenis, nama)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens (expires_at);
