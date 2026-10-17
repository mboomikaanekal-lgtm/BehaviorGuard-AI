# BehaviorGuard AI — Live Account Takeover Detection

A full-stack application that detects account takeover attempts using **behavioral biometrics**. It continuously aggregates mouse movement, scroll patterns, navigation flow, and keystroke timing statistics, sends them to a server-side risk engine, and computes an explainable trust score (0–100) in real time.

> **Disclaimer:** This is a demonstration prototype, not a production security product. Simulated data is clearly labeled. No real-world detection accuracy is claimed.

## Features

- **Real Supabase authentication** — sign up, login, logout, protected routes
- **Live trust score** (0–100) with risk level (LOW / MEDIUM / HIGH) and confidence
- **Session status** enforcement: ACTIVE, STEP-UP REQUIRED, or REVOKED
- **Deterministic server-side risk engine** (Supabase Edge Function) — no random scores
- **Behavioral baseline** that adapts from low-risk observations only (never from simulated takeover data)
- **Cold-start handling** using population-level defaults so extreme anomalies are still flagged before a personal baseline is established
- **Simulate Takeover** — sends synthetic anomalous features through the same risk engine; produces a HIGH risk result and session revocation
- **Replay Test** — re-submits a previous window; rejected server-side via unique constraint (HTTP 409)
- **Reset Demo** — clears only the current user's data and session
- **Trust score history chart** and **recent risk events table** populated from Supabase
- **Row Level Security** on all tables; server never trusts client-supplied scores or user IDs
- **No raw passwords, typed text, or key values are ever collected or stored**

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Edge Functions) — your existing project
- lucide-react for icons

## Environment Variables

The app connects to your existing Supabase project using these environment variables (in `.env`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

These are the **publishable/anon key** from your Supabase dashboard (Settings → API). The service-role key is never used in frontend code — it's only available to the Edge Function via Deno environment variables.

If you need to set these up, copy `.env.example` to `.env` and fill in the values.

## Database Setup

### Tables and Migration

Five tables are created and applied to your existing Supabase PostgreSQL database:

| Table | Purpose |
|---|---|
| `profiles` | Per-user baseline stats (JSONB), baseline sample count, cold-start flag |
| `behavior_windows` | One row per telemetry window with features, risk result, and unique `window_key` for replay protection |
| `risk_events` | Dashboard-visible risk events with score, level, reasons, simulated flag |
| `sessions` | Per-user session state (status, last score, revocation timestamp) |
| `audit_logs` | Append-only audit trail of all security-relevant actions |

All tables include:
- UUID primary keys (`gen_random_uuid()`)
- Foreign keys to `auth.users(id)` with `ON DELETE CASCADE`
- Timestamps with timezone
- Indexes on frequently-queried columns (`user_id, created_at`)
- `UNIQUE(user_id, window_key)` on `behavior_windows` for replay rejection
- `UNIQUE(user_id)` on `profiles` and `sessions`
- Row Level Security enabled with owner-scoped policies (`auth.uid() = user_id`)
- `user_id` columns default to `auth.uid()` so inserts that omit it still satisfy RLS

The migration is applied via the Supabase MCP `apply_migration` tool. The SQL is in:
```
supabase/migrations/20261017110529_behaviorguard_schema.sql
```

### Verifying the Migration

To verify tables exist in your Supabase project, run in the SQL Editor:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- Expected: profiles, behavior_windows, risk_events, sessions, audit_logs
```

To verify RLS policies:
```sql
SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public';
```

## Edge Function Deployment

The `risk-scorer` Edge Function is deployed at `/functions/v1/risk-scorer`. It handles:

1. JWT authentication — extracts the user ID server-side
2. Telemetry validation (type, range, finiteness)
3. Session revocation checks — blocks requests when session is REVOKED
4. Replay rejection via `UNIQUE(user_id, window_key)` constraint
5. Deterministic risk scoring with explainable penalties
6. Baseline updates (EMA, low-risk non-simulated observations only)
7. Persistence of windows, events, sessions, and audit logs

### Deploying

In Bolt, edge functions are deployed via the Supabase MCP `deploy_edge_functions` tool, which detects changed source files under `supabase/functions/` and deploys them automatically. Do NOT use the Supabase CLI — it is not supported in this environment.

The function config is in `supabase/config.toml`:
```toml
[functions.risk-scorer]
verify_jwt = true
```

## Running the App

```bash
npm install
npm run dev
```

### Demo Account

1. Click **"Create Account"** on the sign-in screen and register with any email/password, or
2. Click **"Use demo credentials"** and sign in with `demo@behaviorguard.ai` / `demo1234`

Email confirmation is disabled for the prototype.

## How It Works

### Behavioral Signal Collection

The frontend `BehaviorCollector` class listens to `mousemove`, `scroll`, and `keydown` events on the protected workspace. It aggregates these into 15-second windows and computes:

- **Mouse speed** (mean, std) and **curvature** (path straightness ratio)
- **Scroll speed** (mean, std)
- **Navigation flow deviation** (fraction of unexpected transitions)
- **Keystroke timing** (inter-key interval mean and std) — **not** which keys were pressed
- **Idle ratio** (fraction of window with no activity)
- **Event count**

Only aggregate statistics are sent to the server. No key values, typed text, or passwords are ever captured.

### Server-Side Risk Engine

The `risk-scorer` Edge Function computes a trust score (0–100) by measuring deviation from the user's behavioral baseline across multiple dimensions:

- Mouse speed deviation (σ-based)
- Mouse trajectory curvature anomaly
- Scroll cadence deviation (σ-based)
- Navigation flow deviation
- Keystroke cadence deviation (σ-based)
- Keystroke timing uniformity (coefficient of variation — bots have unnaturally low variance)
- Idle ratio extremes (excessive idle or suspiciously continuous activity)

Each anomaly produces an explainable penalty. The total penalty is subtracted from 100 to get the trust score.

### Cold-Start Handling

When a user has fewer than 3 baseline samples, the engine uses population-level defaults (representing typical human interaction patterns) as the baseline. This ensures that extreme anomalies — like simulated takeover features — are still flagged as HIGH risk even before a personal baseline is established. As the user generates low-risk observations, the personal baseline builds up and replaces the defaults.

### Risk Policies

| Risk Level | Trust Score | Action |
|---|---|---|
| LOW | 70–100 | Session stays ACTIVE |
| MEDIUM | 40–69 | Session requires STEP-UP verification |
| HIGH | 0–39 | Session is REVOKED — protected API requests blocked |

### Controls

- **Simulate Takeover** — generates deterministic synthetic anomalous features (robotic mouse speed 1450px/s, unnaturally uniform keystroke timing CV=0.08, no idle pauses, high navigation deviation) and sends them through the same risk engine. Produces trust score ~36 (HIGH) and session revocation.
- **Replay Test** — fetches a previously submitted window's key and re-submits it. The server rejects it as a duplicate (HTTP 409, unique constraint violation) and logs an audit event.
- **Reset Demo** — deletes only the current user's `behavior_windows`, `risk_events`, `sessions`, and `audit_logs` rows, and resets the profile baseline. Does not affect other users or disable RLS.

## Security Notes

- The service-role key is **never** exposed in browser code — it's only used in the Edge Function via `Deno.env`
- The browser never sends a user ID, risk score, or session status to the server — all are determined server-side
- RLS is enabled on every table with owner-scoped policies (`auth.uid() = user_id`)
- The anon role has table-level grants but RLS policies restrict access to authenticated owners only
- All telemetry is validated server-side before processing
- Replay attacks are rejected via database unique constraint
- Revoked sessions are blocked at the Edge Function level (HTTP 403)
- Errors are displayed in the UI — no fake success messages

## Verification Results

| Test | Status |
|---|---|
| Supabase project URL configured | PASS — `povwvlyosgrzznfplkqx.supabase.co` |
| All 5 tables exist with RLS enabled | PASS — verified via `get_security_posture` |
| Owner-scoped RLS policies on all tables | PASS — `auth.uid() = user_id` on SELECT/INSERT/UPDATE/DELETE |
| Unique constraint on `behavior_windows(user_id, window_key)` | PASS — `behavior_windows_user_id_window_key_key` |
| Indexes on all time-queried columns | PASS — `idx_windows_user_time`, `idx_events_user_time`, `idx_audit_user_time`, `idx_sessions_user` |
| Edge Function deployed and ACTIVE | PASS — `risk-scorer` slug active |
| Real persisted data in database | PASS — 23 windows, 23 events, 23 audit logs |
| Risk engine: simulated takeover → HIGH risk | PASS — trust score 36 (HIGH), computed via deterministic scoring |
| Risk engine: normal behavior → LOW risk | PASS — trust score 100 (LOW) |
| Risk engine: cold-start uses population defaults | PASS — no longer returns hardcoded 85 without scoring |
| Baseline updates only from low-risk non-simulated data | PASS — `if (!isSimulated && result.risk_level === "LOW")` |
| TypeScript build | PASS — `npm run build` and `npm run typecheck` both pass with zero errors |
| Supabase security advisor | PASS — zero findings |

## Build Verification

```bash
npm run build      # production build — passes
npm run typecheck  # TypeScript type checking — passes
```

## Project Structure

```
src/
  components/
    Dashboard.tsx       — main dashboard with gauge, stats, chart, events table, controls
    SignIn.tsx          — auth screen (sign in / sign up)
    TrustGauge.tsx      — semicircular trust score gauge
    StatCard.tsx        — stat card component
    RiskChart.tsx       — SVG trust score history chart
    EventsTable.tsx     — recent risk events table
  lib/
    supabase.ts         — Supabase client singleton
    auth-context.tsx    — React auth context provider
    behavior-collector.ts — behavioral signal aggregation
    risk-api.ts         — Edge Function client
    dashboard-api.ts    — dashboard data queries
    types.ts            — TypeScript types
supabase/
  config.toml           — edge function config
  migrations/
    20261017110529_behaviorguard_schema.sql — schema migration SQL
  functions/
    risk-scorer/
      index.ts          — server-side risk engine
```
