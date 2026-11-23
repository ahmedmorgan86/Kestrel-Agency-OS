# Kestrel Agency OS — Operations, Runbook & Production Readiness

## 1. Environment Configuration
Copy `.env.example` to `.env` (or configure secrets in your hosting platform):
- `APP_URL` — Public base URL (used for OAuth redirect callbacks).
- `PORT` — HTTP bind port (default `3000`).
- `SQLITE_DB_PATH` — Path to the SQLite file (default `./data/kestrel-agency.sqlite`).
- `STORAGE_ROOT_DIR` — Local blob directory (default `./data/storage`).
- `SESSION_SECRET` — Required in production; random secret with at least 32 characters for session digests and signed URLs.
- `CREDENTIAL_ENCRYPTION_KEY` — Required in production; independent random secret with at least 32 characters for OAuth token encryption.
- `OLLAMA_BASE_URL` — Local Ollama endpoint (defaults to `http://127.0.0.1:11434`).
- `OLLAMA_MODEL` — Locally installed model (defaults to `qwen3.5:4b`).
- `OLLAMA_GENERATION_TIMEOUT_SECONDS` — Per-specialist local model timeout; defaults to 900 seconds and is clamped between 60 and 1800 seconds for slower CPU inference.
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

### First run and owner account
1. Set a strong, private `SESSION_SECRET` and a separate `CREDENTIAL_ENCRYPTION_KEY` in `.env`. On PowerShell, generate each with `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`.
2. Start the app with `npm run dev` for local development, or use `docker compose up -d --build` for a persistent container installation.
3. Open `http://localhost:3000`. On a new database, enter the owner's name, your email, and a new password in **Create Administrator & Continue**. This creates the sole initial super-admin; the first-run action is locked after initialization.
4. Do not reuse passwords shared in chats or other sites. If a password was previously sent in a chat, change it before using it here.
5. Use `http://localhost:3000/api/healthz` to check the service and database. Create employees, client records, and work items in the app; the built-in 30-person fictional roster is visual sample data, not real employees.

### Persistent install with Docker Compose
The Compose setup stores the SQLite database and uploaded assets in separate named volumes and configures a health check. Back them up together before upgrades:

```bash
docker compose exec -T morgan-group node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.env.SQLITE_DB_PATH); db.exec(\"VACUUM INTO '/var/lib/morgan-group/data/backup.sqlite'\"); db.close()"
docker compose cp morgan-group:/var/lib/morgan-group/data/backup.sqlite ./backup.sqlite
docker compose cp morgan-group:/var/lib/morgan-group/storage ./storage-backup
```

For public deployment, use a persistent-volume host and TLS termination. Never deploy this SQLite/local-storage configuration to ephemeral serverless storage. Production startup fails closed unless both cryptographic keys and absolute persistent paths are configured. Keep `OLLAMA_BASE_URL` private to the application host; use private networking or a VPN for remote Ollama.

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
| Persistent Relational Storage & Migrations | Ready for a single persistent server | SQLite WAL + foreign keys; Compose uses persistent named volumes. PostgreSQL DDL is a migration reference and is not the runtime database adapter. |
| Auth, Scrypt Hashing, RBAC & Audit Logs | Ready for private single-server operation | First-run super admin bootstrap, 5 roles, 31 permissions; production refuses ephemeral cryptographic secrets |
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
