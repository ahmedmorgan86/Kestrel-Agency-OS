# Kestrel Agency OS — Operations, Runbook & Production Readiness

## 1. Environment Configuration
Copy `.env.example` to `.env` (or configure secrets in your hosting platform):
- `APP_URL` — Public base URL (used for OAuth redirect callbacks).
- `PORT` — HTTP bind port (default `3000`).
- `DATABASE_PATH` — Path to SQLite file (default `./data/kestrel-agency.sqlite`).
- `STORAGE_DIR` — Local blob directory (default `./data/storage`).
- `SESSION_SECRET` — 32+ byte secret for HMAC session digests and signed URLs.
- `ENCRYPTION_SECRET` — 32+ byte secret for AES-256-GCM encryption of OAuth tokens.
- `OLLAMA_BASE_URL` — Local Ollama endpoint (defaults to `http://127.0.0.1:11434`).
- `OLLAMA_MODEL` — Locally installed model (defaults to `qwen3.5:4b`).
- Optional `GEMINI_API_KEY` — Google AI Studio cloud free tier; separate key, quotas, and provider terms apply.
- Optional Social OAuth Apps: `META_APP_ID` / `META_APP_SECRET`, `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`, `X_CLIENT_ID` / `X_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.

## 2. Running & Testing
```bash
npm install
npm run test          # Runs domain unit tests + SQLite/worker integration tests
npm run lint          # TypeScript static typecheck (tsc --noEmit)
npm run build         # Production Vite bundle (dist/)
npm run start         # Runs Express server + background worker on port 3000
```

## 3. Durable Background Worker Operations
- The worker polls `background_jobs` every 2 seconds and claims due jobs with a lease (`lease_expires_at`).
- **Crash Recovery**: If the process crashes mid-job, `reclaimStaleLeases` automatically re-queues expired leases on startup and every sweep cycle.
- **Retries & Dead-Lettering**: Transient errors retry with exponential backoff (`computeExponentialBackoffMs`). Jobs exhausting `max_attempts` move to `dead_letter` and log a `system_events` entry.
- **Timeout Reconciliation**: External social publishing calls that time out after 15 seconds are classified as `timeout_reconciliation_required` rather than blindly retried, preventing duplicate live posts.

## 4. Backup & Recovery Runbook
- **Database Backup**: Because SQLite runs in WAL mode, perform online backups using `sqlite3 data/kestrel-agency.sqlite ".backup 'backup.sqlite'"` (or `VACUUM INTO`). Never copy the `.sqlite` file without checkpointing `-wal`/`-shm` while writes are active.
- **Asset Storage Backup**: Sync `./data/storage/` alongside database snapshots to keep `assets.storage_key` references consistent.
- **PostgreSQL Migration**: For multi-replica horizontal scaling, provision PostgreSQL and apply `docs/migrations/001_postgresql_schema.sql`.

## 5. Honest Production Readiness Checklist
| Capability | Current Status | Notes |
| --- | --- | --- |
| Persistent Relational Storage & Migrations | Ready (Local SQLite) / Migration Script Provided (Postgres) | WAL mode + FK enforcement active; Postgres DDL included for clustered deployment |
| Auth, Scrypt Hashing, RBAC & Audit Logs | Ready | First-run super admin bootstrap, 5 roles, 31 permissions |
| 14-State Content Workflow & Immutable Approvals | Ready | SHA-256 version locking, auto-invalidation on edit, human-only decisions |
| Durable Background Worker & Lease Recovery | Ready | Tested for idempotency, cancellation, and stale-lease recovery |
| Asset Upload & Signed Download URLs | Ready | Disk storage with MIME allowlist, 25MB limit, HMAC signed URLs |
| AI Agent Execution | Ready with local Ollama (no API usage fees) | Default is `qwen3.5:4b` on your own machine/server; install Ollama and the model first. Inference speed depends on available memory and hardware. |
| Cloud AI & Grounded Research | Optional (requires provider key) | Gemini free-tier quota and availability are controlled by Google; web grounding is not provided by local Ollama. |
| Live Social Publishing & Analytics Sync | Adapter Ready (Requires Platform OAuth Apps) | Official OAuth & API adapters built; requires platform developer credentials |
| Automated Video Generation | Blocked / Honest Error | No configured video provider; returns explicit unavailable diagnostic |

## 6. Free Local AI Setup
1. Install Ollama on the same computer or server that runs the application.
2. Download the default model once with `ollama pull qwen3.5:4b` (approximately 3–4 GB on disk; see the [Ollama model library](https://ollama.com/library/qwen3.5)).
3. Keep Ollama running, then open **Settings → Integrations** and verify **Ollama Local AI (Free)**.
4. Agent tasks then run against the local model with zero cloud token charges. Local inference uses the machine's CPU/GPU, disk, and electricity. The free local model does not provide Google Search grounding, image generation, or video generation.

Ollama API connectivity is server-side only. For a separately hosted Ollama instance, set `OLLAMA_BASE_URL` in the server environment; do not expose the local Ollama port to the public internet.
