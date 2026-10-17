/*
# BehaviorGuard AI — Core Schema

## Purpose
Persistent storage for a behavioral-biometrics account-takeover detection prototype.
Tracks per-user behavioral baselines, aggregated telemetry windows, server-computed
risk results, session state, and an audit trail. Never stores raw passwords, typed
text, or individual key values — only aggregate statistics.

## 1. New Tables
- `profiles` — per-user demo profile (display name, baseline stats JSON, cold-start flag).
- `behavior_windows` — one row per aggregated telemetry window sent to the risk engine.
  Includes the feature vector, computed risk result, confidence, latency, and a
  `window_key` used for replay/idempotency rejection.
- `risk_events` — recent risk events surfaced on the dashboard (score, level, reasons,
  simulated flag). Populated by the risk engine from behavior_windows.
- `sessions` — per-user demo session state (status: ACTIVE | STEP_UP_REQUIRED | REVOKED),
  plus a revoked_at timestamp for revocation enforcement.
- `audit_logs` — append-only audit trail of security-relevant actions
  (risk_scored, session_revoked, replay_rejected, demo_reset, etc.).

## 2. Columns (key fields)
- All tables use UUID primary keys (gen_random_uuid).
- Owner columns (`user_id`) are `uuid NOT NULL DEFAULT auth.uid()` referencing auth.users.
- `behavior_windows.window_key` is UNIQUE per user to enforce idempotent replay rejection.
- `behavior_windows.features` / `profiles.baseline` are JSONB feature vectors.
- `risk_events.score` 0–100, `confidence` 0–1, `simulated` boolean.
- `sessions.status` is an enum-like text check constraint.
- Timestamps with timezone everywhere.

## 3. Indexes
- behavior_windows(user_id, created_at desc)
- risk_events(user_id, created_at desc)
- audit_logs(user_id, created_at desc)
- sessions(user_id) unique

## 4. Security (RLS)
- RLS ENABLED on every table.
- Owner-scoped CRUD policies (`TO authenticated`, `auth.uid() = user_id`) for all five tables.
- No anon access — the app requires sign-in.
- `user_id` defaults to `auth.uid()` so inserts that omit it still satisfy WITH CHECK.
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Demo Analyst',
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_samples int NOT NULL DEFAULT 0,
  cold_start boolean NOT NULL DEFAULT true,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---------- behavior_windows ----------
CREATE TABLE IF NOT EXISTS behavior_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  window_key text NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_score int NOT NULL DEFAULT 100,
  risk_level text NOT NULL DEFAULT 'LOW',
  confidence double precision NOT NULL DEFAULT 0.0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms int NOT NULL DEFAULT 0,
  simulated boolean NOT NULL DEFAULT false,
  used_for_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, window_key)
);

ALTER TABLE behavior_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_windows" ON behavior_windows;
CREATE POLICY "select_own_windows" ON behavior_windows FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_windows" ON behavior_windows;
CREATE POLICY "insert_own_windows" ON behavior_windows FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_windows" ON behavior_windows;
CREATE POLICY "update_own_windows" ON behavior_windows FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_windows" ON behavior_windows;
CREATE POLICY "delete_own_windows" ON behavior_windows FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_windows_user_time
  ON behavior_windows (user_id, created_at DESC);

-- ---------- risk_events ----------
CREATE TABLE IF NOT EXISTS risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  window_id uuid REFERENCES behavior_windows(id) ON DELETE SET NULL,
  trust_score int NOT NULL DEFAULT 100,
  risk_level text NOT NULL DEFAULT 'LOW',
  confidence double precision NOT NULL DEFAULT 0.0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms int NOT NULL DEFAULT 0,
  simulated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_events" ON risk_events;
CREATE POLICY "select_own_events" ON risk_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_events" ON risk_events;
CREATE POLICY "insert_own_events" ON risk_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_events" ON risk_events;
CREATE POLICY "update_own_events" ON risk_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_events" ON risk_events;
CREATE POLICY "delete_own_events" ON risk_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_events_user_time
  ON risk_events (user_id, created_at DESC);

-- ---------- sessions ----------
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','STEP_UP_REQUIRED','REVOKED')),
  revoked_at timestamptz,
  last_score int NOT NULL DEFAULT 100,
  last_risk_level text NOT NULL DEFAULT 'LOW',
  last_confidence double precision NOT NULL DEFAULT 0.0,
  last_latency_ms int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_session" ON sessions;
CREATE POLICY "select_own_session" ON sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_session" ON sessions;
CREATE POLICY "insert_own_session" ON sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_session" ON sessions;
CREATE POLICY "update_own_session" ON sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_session" ON sessions;
CREATE POLICY "delete_own_session" ON sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ---------- audit_logs ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_audit" ON audit_logs;
CREATE POLICY "select_own_audit" ON audit_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_audit" ON audit_logs;
CREATE POLICY "insert_own_audit" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_audit" ON audit_logs;
CREATE POLICY "update_own_audit" ON audit_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_audit" ON audit_logs;
CREATE POLICY "delete_own_audit" ON audit_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON audit_logs (user_id, created_at DESC);
